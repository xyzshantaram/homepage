import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { escape } from "lodash";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { Post, PostStorage } from "./utils";

const exec = promisify(execFile);

const markdown = new MarkdownIt({ html: false, linkify: true }).use(footnote);

function isImageOnly(inline: any): boolean {
  if (inline?.type !== "inline" || !inline.children?.length) {
    return false;
  }
  return inline.children.every(
    (child: any) =>
      child.type === "image" ||
      (child.type === "text" && !child.content.trim()),
  );
}

markdown.renderer.rules.image = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const alt = self.renderInlineAsText(token.children ?? [], options, env);
  token.attrSet("alt", alt);
  const image = self.renderToken(tokens, index, options);
  return `<figure>${image}<figcaption>${escape(alt)}</figcaption></figure>\n`;
};

markdown.renderer.rules.paragraph_open = (tokens, index, options, _env, self) => {
  if (isImageOnly(tokens[index + 1])) {
    return "";
  }
  return self.renderToken(tokens, index, options);
};

markdown.renderer.rules.paragraph_close = (tokens, index, options, _env, self) => {
  if (isImageOnly(tokens[index - 1])) {
    return "";
  }
  return self.renderToken(tokens, index, options);
};

markdown.renderer.rules.table_open = (tokens, index, options, _env, self) =>
  `<figure class="table-wrapper">${self.renderToken(tokens, index, options)}`;

markdown.renderer.rules.table_close = (tokens, index, options, _env, self) =>
  `${self.renderToken(tokens, index, options)}</figure>`;

function slugify(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toDate(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  return String(value ?? "1970-01-01");
}

function excerpt(source: string): string {
  const text = source
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text;
}

export class FilePostStorage implements PostStorage {
  constructor(private readonly dir: string) {}

  async refresh(): Promise<void> {
    await exec("git", ["-C", path.dirname(this.dir), "pull", "--ff-only"]);
  }

  async list(): Promise<Post[]> {
    const files = (await readdir(this.dir)).filter((file) => file.endsWith(".md"));
    const posts = await Promise.all(
      files.map(async (file) => {
        const raw = await readFile(path.join(this.dir, file), "utf8");
        const { data, content } = matter(raw);
        const title = String(data.title ?? file.replace(/\.md$/, "")).trim();
        const slug = slugify(title);
        const createdDate = toDate(data["created-date"]);
        return {
          title,
          slug,
          description: String(data.description ?? excerpt(content)).trim(),
          createdDate,
          tags: Array.isArray(data.tags)
            ? data.tags.map(String)
            : data.tags
              ? [String(data.tags)]
              : [],
          hidden: data.hidden === true,
          url: `/posts/${createdDate.slice(0, 4)}/${createdDate.slice(5, 7)}/${slug}`,
          body: markdown.render(content),
        };
      }),
    );

    return posts.sort((a, b) => b.createdDate.localeCompare(a.createdDate));
  }

  async get(
    year: string,
    month: string,
    slug: string,
  ): Promise<Post | undefined> {
    const all = await this.list();
    return all.find(
      (post) =>
        post.createdDate.slice(0, 4) === year &&
        post.createdDate.slice(5, 7) === month &&
        post.slug === slug,
    );
  }
}
