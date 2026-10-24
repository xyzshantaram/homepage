import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { Liquid } from "liquidjs";
import matter from "gray-matter";
import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import { escape } from "lodash";
import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

const POSTS_DIR =
  process.env.POSTS_DIR ?? path.join(homedir(), "th/scratch/posts-wt/posts");
const PAGE_SIZE = 25;
const TAGS = ["fiction", "musings", "technical", "projects"];

type Post = {
  title: string;
  slug: string;
  description: string;
  createdDate: string;
  tags: string[];
  hidden: boolean;
  url: string;
  body: string;
};

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

function excerpt(markdown: string): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > 200 ? `${text.slice(0, 200).trimEnd()}…` : text;
}

async function loadPosts(): Promise<Post[]> {
  const files = (await readdir(POSTS_DIR)).filter((file) => file.endsWith(".md"));
  const posts = await Promise.all(
    files.map(async (file) => {
      const raw = await readFile(path.join(POSTS_DIR, file), "utf8");
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

  return posts
    .filter((post) => !post.hidden)
    .sort((a, b) => b.createdDate.localeCompare(a.createdDate));
}

const app = new Hono();
const liquid = new Liquid({
  root: [path.join(import.meta.dir, "templates")],
  extname: ".liquid",
});

app.get("/", async (c) => {
  const posts = (await loadPosts()).slice(0, 3);
  return c.html(await liquid.renderFile("index.liquid", { posts }));
});

app.get("/posts", async (c) => {
  const all = await loadPosts();
  const params = new URL(c.req.url).searchParams;
  const selected = (params.get("tags") ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => TAGS.includes(tag));

  const filtered = selected.length
    ? all.filter((post) => post.tags.some((tag) => selected.includes(tag)))
    : all;

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const requested = Number.parseInt(params.get("page") ?? "1", 10) || 1;
  const page = Math.min(Math.max(requested, 1), pages);
  const posts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const urlFor = (tags: string[], pageNumber: number) => {
    const parts: string[] = [];
    if (tags.length) {
      parts.push(`tags=${tags.map(encodeURIComponent).join(",")}`);
    }
    if (pageNumber > 1) {
      parts.push(`page=${pageNumber}`);
    }
    return parts.length ? `/posts?${parts.join("&")}` : "/posts";
  };

  const tagLinks = TAGS.map((name) => {
    const isSelected = selected.includes(name);
    const next = isSelected
      ? selected.filter((tag) => tag !== name)
      : [...selected, name];
    return { name, selected: isSelected, href: urlFor(next, 1) };
  });

  return c.html(
    await liquid.renderFile("posts.liquid", {
      posts,
      tagLinks,
      page,
      pages,
      prevUrl: page > 1 ? urlFor(selected, page - 1) : null,
      nextUrl: page < pages ? urlFor(selected, page + 1) : null,
    }),
  );
});

app.get("/posts/:year/:month/:slug", async (c) => {
  const posts = await loadPosts();
  const { year, month, slug } = c.req.param();
  const post = posts.find(
    (candidate) =>
      candidate.createdDate.slice(0, 4) === year &&
      candidate.createdDate.slice(5, 7) === month &&
      candidate.slug === slug,
  );
  if (!post) {
    return c.notFound();
  }
  return c.html(await liquid.renderFile("post.liquid", post));
});

app.use("/*", serveStatic({ root: path.join(import.meta.dir, "static") }));

export default app;
