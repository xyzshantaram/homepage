import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const MAX_BYTES = 20 * 1024 * 1024;
const MAX_EDGE = 4096;

export class ImageStore {
  private readonly resolved = new Map<string, string>();

  constructor(
    private readonly mediaDir: string,
    private readonly contentRoot: string,
  ) {
    mkdirSync(this.mediaDir, { recursive: true });
  }

  async resolve(src: string, postDir: string): Promise<string> {
    const key = `${postDir}\0${src}`;
    const cached = this.resolved.get(key);
    if (cached) {
      return cached;
    }

    const source = await this.load(src, postDir);
    if (!source) {
      return src;
    }

    const hash = createHash("sha256").update(source).digest("hex");
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

  private async load(
    src: string,
    postDir: string,
  ): Promise<Buffer | undefined> {
    if (src.startsWith("/")) {
      const target = path.resolve(this.contentRoot, src.replace(/^\/+/, ""));
      const file = this.within(this.contentRoot, target);
      return file ? this.read(file) : undefined;
    }

    if (src.startsWith(".")) {
      const target = path.resolve(postDir, src);
      const file = this.within(this.contentRoot, target);
      return file ? this.read(file) : undefined;
    }

    if (!/^https?:\/\//i.test(src)) {
      return undefined;
    }

    try {
      const response = await fetch(src, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) {
        return undefined;
      }
      const length = Number(response.headers.get("content-length") ?? "0");
      if (length > MAX_BYTES) {
        return undefined;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return buffer.length > MAX_BYTES ? undefined : buffer;
    } catch {
      return undefined;
    }
  }

  private async read(file: string): Promise<Buffer | undefined> {
    try {
      return await readFile(file);
    } catch {
      return undefined;
    }
  }

  private within(root: string, target: string): string | undefined {
    const relative = path.relative(root, target);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      return undefined;
    }
    return target;
  }
}
