import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync } from "node:fs";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
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
export class ImageStore {
  private readonly resolved = new Map<string, string | ResolvedMedia>();

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
}
