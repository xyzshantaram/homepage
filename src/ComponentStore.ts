import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadContentSource } from "./content-source";

const DEFAULT_EXTENSION = ".js";

function extensionOf(src: string): string {
  const pathname = /^https?:\/\//i.test(src) ? new URL(src).pathname : src;
  return path.extname(pathname) || DEFAULT_EXTENSION;
}

export class ComponentStore {
  private readonly resolved = new Map<string, string>();

  constructor(
    private readonly mediaDir: string,
    private readonly contentRoot: string,
  ) {
    mkdirSync(this.mediaDir, { recursive: true });
  }

  async resolve(src: string, pageDir: string): Promise<string> {
    const key = `${pageDir}\0${src}`;
    const cached = this.resolved.get(key);
    if (cached) {
      return cached;
    }

    const source = await loadContentSource(src, pageDir, this.contentRoot);
    if (!source) {
      return src;
    }

    const hash = createHash("sha256").update(source).digest("hex");
    const extension = extensionOf(src);
    const output = path.join(this.mediaDir, `${hash}${extension}`);
    const url = `/media/${hash}${extension}`;

    try {
      await access(output);
      this.resolved.set(key, url);
      return url;
    } catch {
      // not cached yet
    }

    try {
      await mkdir(this.mediaDir, { recursive: true });
      await writeFile(output, source);
      this.resolved.set(key, url);
      return url;
    } catch (error) {
      console.error(`[components] failed to cache ${src}`, error);
      return src;
    }
  }
}
