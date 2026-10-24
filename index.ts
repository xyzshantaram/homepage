import { Hono, type Context } from "hono";
import { serveStatic } from "hono/bun";
import { Liquid } from "liquidjs";
import { escape } from "lodash";
import path from "node:path";
import { addComment, commentSchema, getCommentsForPost, renderComment } from "./comments";
import { format } from "timeago.js";
import { challenge, redeem, validate } from "./captcha";
import { makeLimiter } from "./rate-limit";
import { posts } from "./post-storage";

const PAGE_SIZE = 25;
const FEED_LIMIT = 25;
const SITE_URL = (process.env.SITE_URL ?? "https://shantaram.xyz").replace(
  /\/$/,
  "",
);
const TAGS = ["fiction", "musings", "technical", "projects"];

const app = new Hono();
const liquid = new Liquid({
  root: [path.join(import.meta.dir, "templates")],
  extname: ".liquid",
});

app.get("/", async (c) => {
  const visible = (await posts.list()).filter((post) => !post.hidden);
  return c.html(
    await liquid.renderFile("index.liquid", { posts: visible.slice(0, 3) }),
  );
});

app.get("/posts", async (c) => {
  const all = (await posts.list()).filter((post) => !post.hidden);
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
  const pagePosts = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
      posts: pagePosts,
      tagLinks,
      page,
      pages,
      prevUrl: page > 1 ? urlFor(selected, page - 1) : null,
      nextUrl: page < pages ? urlFor(selected, page + 1) : null,
    }),
  );
});

app.get("/posts/:year/:month/:slug", async (c) => {
  const { year, month, slug } = c.req.param();
  const post = await posts.get(year, month, slug);
  if (!post || post.hidden) {
    return c.notFound();
  }

  const comments = getCommentsForPost(post.url).map((comment) => ({
    ...comment,
    postedIso: new Date(comment.posted).toISOString(),
    postedAgo: format(comment.posted),
  }));

  return c.html(await liquid.renderFile("post.liquid", { ...post, comments }));
});

app.post(
  "/posts/:year/:month/:slug/comment",
  makeLimiter(1, 60_000),
  async (c) => {
    const { year, month, slug } = c.req.param();
    const post = await posts.get(year, month, slug);
    if (!post || post.hidden) {
      return c.notFound();
    }

    const body = await c.req.parseBody();
    const parsed = commentSchema.safeParse({
      author: typeof body.author === "string" ? body.author : "",
      content: typeof body.content === "string" ? body.content : "",
      captcha: typeof body.captcha === "string" ? body.captcha : "",
    });
    if (!parsed.success) {
      return c.text("Invalid comment.", 400);
    }

    const token = await validate(parsed.data.captcha);
    if (!token.success) {
      return c.text("Captcha failed. Try again.", 400);
    }

    const id = addComment({
      post: post.url,
      content: renderComment(parsed.data.content),
      author: parsed.data.author,
    });
    return c.redirect(`${post.url}#comment-${id}`, 303);
  },
);

app.post("/api/v1/captcha/challenge", makeLimiter(5, 10_000, true), challenge);
app.post("/api/v1/captcha/redeem", makeLimiter(5, 10_000, true), redeem);

async function serveFeed(c: Context) {
  const items = (await posts.list())
    .filter((post) => !post.hidden)
    .slice(0, FEED_LIMIT)
    .map((post) => {
      const link = `${SITE_URL}${post.url}`;
      return [
        "    <item>",
        `      <title>${escape(post.title)}</title>`,
        `      <link>${escape(link)}</link>`,
        `      <guid>${escape(link)}</guid>`,
        `      <description>${escape(post.description)}</description>`,
        `      <pubDate>${new Date(`${post.createdDate}T00:00:00Z`).toUTCString()}</pubDate>`,
        "    </item>",
      ].join("\n");
    })
    .join("\n");

  const xml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    "    <title>shantaram.xyz</title>",
    `    <link>${SITE_URL}/</link>`,
    "    <description>shan's corner of the internet</description>",
    `    <atom:link href="${SITE_URL}/feed.rss" rel="self" type="application/rss+xml" />`,
    `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");

  return c.body(xml, 200, {
    "Content-Type": "application/rss+xml; charset=utf-8",
  });
}

app.get("/blog/feed.rss", serveFeed);
app.get("/feed.rss", serveFeed);

app.use("/*", serveStatic({ root: path.join(import.meta.dir, "static") }));

export default app;
