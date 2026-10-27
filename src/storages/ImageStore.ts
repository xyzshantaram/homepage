import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { loadContentSource } from "../content-source";

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

    const source = await loadContentSource(src, postDir, this.contentRoot);
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
}
