import matter from "gray-matter";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { excerpt, renderMarkdown } from "../utils/markdown";
import type { ImageStore } from "./ImageStore";
import { formatPostDate, type Post, type PostStorage } from "../utils";

const exec = promisify(execFile);
const isoDate = z.iso.date();

type CachedPost = {
  post: Post;
  source: string;
  rendered?: string;
};

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toDate(value: unknown, file: string): string | undefined {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  const parsed = isoDate.safeParse(value);
  if (!parsed.success) {
    console.error(`Skipping ${file}: created-date is not a valid date`);
    return undefined;
  }
  return parsed.data;
}

export class FilePostStorage implements PostStorage {
  private cache?: Map<string, CachedPost>;

  constructor(
    private readonly dir: string,
    private readonly images?: ImageStore,
  ) {}

  async refresh(): Promise<void> {
    await exec("git", ["-C", path.dirname(this.dir), "pull", "--ff-only"]);
    this.cache = undefined;
  }

  private async load(): Promise<Map<string, CachedPost>> {
    if (this.cache) {
      return this.cache;
    }

    const files = (await readdir(this.dir)).filter((file) =>
      file.endsWith(".md"),
    );
    const entries = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(path.join(this.dir, file), "utf8");
        const { data, content } = matter(raw);
        const createdDate = toDate(data["created-date"], file);
        const slug = slugify(file.replace(/\.md$/i, ""));
        if (!createdDate || !slug) {
          return null;
        }

        const post: Post = {
          title: String(data.title ?? file.replace(/\.md$/i, "")).trim(),
          slug,
          description: String(data.description ?? excerpt(content)).trim(),
          createdDate,
          dateLabel: formatPostDate(createdDate),
          tags: Array.isArray(data.tags)
            ? data.tags.map(String)
            : data.tags
              ? [String(data.tags)]
              : [],
          hidden: data.hidden === true,
          url: `/posts/${createdDate.slice(0, 4)}/${createdDate.slice(5, 7)}/${slug}`,
        };
        return [slug, { post, source: content }] as const;
      }),
    );

    const cache = new Map<string, CachedPost>();
    for (const entry of entries) {
      if (!entry) {
        continue;
      }
      if (cache.has(entry[0])) {
        console.error(`Skipping duplicate post slug: ${entry[0]}`);
        continue;
      }
      cache.set(entry[0], entry[1]);
    }

    this.cache = cache;
    return cache;
  }

  async list(): Promise<Post[]> {
    const posts = [...(await this.load()).values()].map((entry) => entry.post);
    return posts.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  }

  async get(
    year: string,
    month: string,
    slug: string,
  ): Promise<Post | undefined> {
    const entry = (await this.load()).get(slug);
    if (!entry) {
      return undefined;
    }

    const { post } = entry;
    return post.createdDate.slice(0, 4) === year &&
      post.createdDate.slice(5, 7) === month
      ? post
      : undefined;
  }

  async render(post: Post): Promise<string> {
    const entry = (await this.load()).get(post.slug);
    if (!entry) {
      return "";
    }

    entry.rendered ??= await renderMarkdown(
      entry.source,
      this.images ? (src) => this.images!.resolve(src, this.dir) : undefined,
    );
    return entry.rendered;
  }
}
