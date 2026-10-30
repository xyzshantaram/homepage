import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadContentSource } from "../utils/content-source";
import { originOf, scriptOrigins as originsInSource } from "../utils/csp";

const DEFAULT_EXTENSION = ".js";

function extensionOf(src: string): string {
  const pathname = /^https?:\/\//i.test(src) ? new URL(src).pathname : src;
  return path.extname(pathname) || DEFAULT_EXTENSION;
}

export class ComponentStore {
  private readonly resolved = new Map<string, string>();
  private readonly origins = new Map<string, readonly string[]>();

  constructor(
    private readonly mediaDir: string,
    private readonly contentRoot: string,
  ) {
    mkdirSync(this.mediaDir, { recursive: true });
  }

  async resolve(src: string, pageDir: string): Promise<string> {
    if (/^https?:\/\//i.test(src)) {
      return this.external(src, pageDir);
    }
    return this.local(src, pageDir);
  }

  private async external(src: string, pageDir: string): Promise<string> {
    const cached = this.resolved.get(src);
    if (cached) {
      return cached;
    }

    const source = await loadContentSource(src, pageDir, this.contentRoot);
    const imports = source ? originsInSource(source.toString("utf8")) : [];
    const origin = originOf(src);

    this.origins.set(
      src,
      origin ? [...new Set([origin, ...imports])] : imports,
    );
    this.resolved.set(src, src);
    return src;
  }

  private async local(src: string, pageDir: string): Promise<string> {
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

    this.origins.set(url, originsInSource(source.toString("utf8")));

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

  scriptOrigins(urls: readonly string[]): string[] {
    return [
      ...new Set(urls.flatMap((url) => this.origins.get(url) ?? [])),
    ];
  }
}
