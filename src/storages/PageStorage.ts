import matter from "gray-matter";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ComponentStore } from "./ComponentStore";
import type { ImageStore } from "./ImageStore";
import { renderPageMarkdown } from "../utils/markdown";
import type { Page, PageStorage } from "../utils";

type CachedPage = {
  page: Page;
  source: string;
  rendered?: string;
};

export class FilePageStorage implements PageStorage {
  private cache?: Map<string, CachedPage>;

  constructor(
    private readonly dir: string,
    private readonly images?: ImageStore,
    private readonly components?: ComponentStore,
  ) {}

  private async load(): Promise<Map<string, CachedPage>> {
    if (this.cache) {
      return this.cache;
    }

    let files: string[] = [];
    try {
      files = (await readdir(this.dir)).filter((file) =>
        file.endsWith(".md"),
      );
    } catch {
      files = [];
    }

    const entries = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(path.join(this.dir, file), "utf8");
        const { data, content } = matter(raw);
        const slug = file.replace(/\.md$/i, "");
        const page: Page = {
          slug,
          title: String(data.title ?? slug).trim(),
          description: String(data.description ?? "").trim(),
          extraHead: data.extra_head ? String(data.extra_head) : undefined,
          components: Array.isArray(data.components)
            ? data.components.map(String)
            : data.components
              ? [String(data.components)]
              : [],
        };
        return [slug, { page, source: content }] as const;
      }),
    );

    this.cache = new Map(entries);
    return this.cache;
  }

  async get(slug: string): Promise<Page | undefined> {
    return (await this.load()).get(slug)?.page;
  }

  async render(page: Page): Promise<string> {
    const entry = (await this.load()).get(page.slug);
    if (!entry) {
      return "";
    }

    entry.rendered ??= await renderPageMarkdown(
      entry.source,
      this.images ? (src) => this.images!.resolve(src, this.dir) : undefined,
    );
    return entry.rendered;
  }

  async resolveComponents(page: Page): Promise<string[]> {
    if (!this.components) {
      return page.components;
    }
    return Promise.all(
      page.components.map((src) => this.components!.resolve(src, this.dir)),
    );
  }
}
