import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { loadContentSource } from "../utils/content-source";
import type { ResolvedMedia } from "../utils/markdown";

const MAX_EDGE = 4096;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const VIDEO_TIMEOUT = 120_000;
const VIDEO_EXT = /\.(webm|mp4)$/i;
const SCALE = "scale=-2:trunc(min(720\\,ih)/2)*2";

const exec = promisify(execFile);
const MEDIA_NAME = /^[0-9a-f]{64}\.(webp|webm|mp4)$/;
const IMAGE_REF = /!\[[^\]]*\]\(\s*<?([^)\s>]+)/g;

export type OrphanedMedia = {
  name: string;
  url: string;
  type: string;
  bytes: number;
  modified: number;
};

export class ImageStore {
  private readonly resolved = new Map<string, string | ResolvedMedia>();
  private orphansPromise?: Promise<OrphanedMedia[]>;

  constructor(
    private readonly mediaDir: string,
    private readonly contentRoot: string,
  ) {
    mkdirSync(this.mediaDir, { recursive: true });
  }

  async resolve(src: string, postDir: string): Promise<string | ResolvedMedia> {
    const key = `${postDir}\0${src}`;
    const cached = this.resolved.get(key);
    if (cached) {
      return cached;
    }

    const cleanSrc = src.split(/[?#]/)[0];
    const isVideo = VIDEO_EXT.test(cleanSrc);
    const source = await loadContentSource(
      src,
      postDir,
      this.contentRoot,
      isVideo ? VIDEO_MAX_BYTES : undefined,
    );
    if (!source) {
      return src;
    }

    const hash = createHash("sha256").update(source).digest("hex");
    if (isVideo) {
      const resolved = await this.storeVideo(source, hash, cleanSrc, src);
      this.resolved.set(key, resolved);
      return resolved;
    }

    const output = path.join(this.mediaDir, `${hash}.webp`);
    const url = `/media/${hash}.webp`;

    try {
      await access(output);
      this.resolved.set(key, url);
      return url;
    } catch {
      // not cached yet
    }

    try {
      const webp = await sharp(source)
        .resize({
          width: MAX_EDGE,
          height: MAX_EDGE,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 80 })
        .toBuffer();
      await mkdir(this.mediaDir, { recursive: true });
      await writeFile(output, webp);
      this.resolved.set(key, url);
      return url;
    } catch (error) {
      console.error(`[images] failed to convert ${src}`, error);
      return src;
    }
  }

  private async storeVideo(
    source: Buffer,
    hash: string,
    cleanSrc: string,
    src: string,
  ): Promise<ResolvedMedia> {
    const webm = path.join(this.mediaDir, `${hash}.webm`);
    const mp4 = path.join(this.mediaDir, `${hash}.mp4`);
    const resolved: ResolvedMedia = {
      video: { webm: `/media/${hash}.webm`, mp4: `/media/${hash}.mp4` },
    };

    try {
      await access(webm);
      await access(mp4);
      return resolved;
    } catch {
      // not cached yet
    }

    const input = path.join(
      this.mediaDir,
      `.src-${hash}${path.extname(cleanSrc) || ".mp4"}`,
    );
    const webmTmp = path.join(this.mediaDir, `.tmp-${hash}.webm`);
    const mp4Tmp = path.join(this.mediaDir, `.tmp-${hash}.mp4`);

    try {
      await mkdir(this.mediaDir, { recursive: true });
      await writeFile(input, source);
      await this.transcode(input, webmTmp, mp4Tmp);
      await rename(webmTmp, webm);
      await rename(mp4Tmp, mp4);
      return resolved;
    } catch (error) {
      console.error(`[images] failed to transcode ${src}`, error);
      return src;
    } finally {
      await Promise.all(
        [input, webmTmp, mp4Tmp].map((file) => rm(file, { force: true })),
      );
    }
  }

  private async transcode(
    input: string,
    webm: string,
    mp4: string,
  ): Promise<void> {
    if (!ffmpegPath) {
      throw new Error("ffmpeg-static binary is unavailable");
    }

    const options = { timeout: VIDEO_TIMEOUT, maxBuffer: 1024 * 1024 };
    await exec(
      ffmpegPath,
      [
        "-y",
        "-i",
        input,
        "-vf",
        SCALE,
        "-c:v",
        "libvpx-vp9",
        "-crf",
        "32",
        "-b:v",
        "0",
        "-row-mt",
        "1",
        "-c:a",
        "libopus",
        "-b:a",
        "96k",
        webm,
      ],
      options,
    );

    await exec(
      ffmpegPath,
      [
        "-y",
        "-i",
        input,
        "-vf",
        SCALE,
        "-c:v",
        "libx264",
        "-crf",
        "23",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-movflags",
        "+faststart",
        mp4,
      ],
      options,
    );
  }

  async orphans(): Promise<OrphanedMedia[]> {
    this.orphansPromise ??= this.findOrphans();
    try {
      return await this.orphansPromise;
    } catch (error) {
      this.orphansPromise = undefined;
      throw error;
    }
  }

  recomputeOrphans(): Promise<OrphanedMedia[]> {
    this.orphansPromise = this.findOrphans();
    return this.orphans();
  }

  async deleteOrphan(name: string): Promise<boolean> {
    if (!MEDIA_NAME.test(name)) {
      return false;
    }

    const orphans = await this.orphans();
    if (!orphans.some((file) => file.name === name)) {
      return false;
    }

    try {
      await rm(path.join(this.mediaDir, name));
      this.orphansPromise = undefined;
      return true;
    } catch (error) {
      console.error(`[images] failed to delete ${name}`, error);
      return false;
    }
  }

  private async findOrphans(): Promise<OrphanedMedia[]> {
    const referenced = await this.referencedMedia();
    const entries = await readdir(this.mediaDir, {
      withFileTypes: true,
    }).catch(() => []);
    const orphans: OrphanedMedia[] = [];

    for (const entry of entries) {
      if (
        !entry.isFile() ||
        !MEDIA_NAME.test(entry.name) ||
        referenced.has(entry.name)
      ) {
        continue;
      }

      const info = await stat(path.join(this.mediaDir, entry.name));
      orphans.push({
        name: entry.name,
        url: `/media/${entry.name}`,
        type: path.extname(entry.name).slice(1),
        bytes: info.size,
        modified: info.mtimeMs,
      });
    }

    return orphans.sort((a, b) => b.bytes - a.bytes);
  }

  private async referencedMedia(): Promise<Set<string>> {
    const referenced = new Set<string>();
    const files = await this.markdownFiles(this.contentRoot);

    await Promise.all(
      files.map(async (file) => {
        let source: string;
        try {
          source = await readFile(file, "utf8");
        } catch {
          return;
        }

        const refs = [...source.matchAll(IMAGE_REF)].map((match) => match[1]);
        await Promise.all(
          refs.map(async (ref) => {
            const buffer = await loadContentSource(
              ref,
              path.dirname(file),
              this.contentRoot,
              VIDEO_MAX_BYTES,
            );
            if (!buffer) {
              return;
            }

            const hash = createHash("sha256").update(buffer).digest("hex");
            if (VIDEO_EXT.test(ref.split(/[?#]/)[0])) {
              referenced.add(`${hash}.webm`);
              referenced.add(`${hash}.mp4`);
            } else {
              referenced.add(`${hash}.webp`);
            }
          }),
        );
      }),
    );

    return referenced;
  }

  private async markdownFiles(dir: string): Promise<string[]> {
    const found: string[] = [];

    const walk = async (current: string): Promise<void> => {
      const entries = await readdir(current, { withFileTypes: true }).catch(
        () => [],
      );
      await Promise.all(
        entries.map(async (entry) => {
          if (entry.name.startsWith(".")) {
            return;
          }
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            await walk(full);
          } else if (entry.isFile() && entry.name.endsWith(".md")) {
            found.push(full);
          }
        }),
      );
    };

    await walk(dir);
    return found;
  }
}
