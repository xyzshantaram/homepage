import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { format } from "timeago.js";
import { commentSchema, renderComment } from "../comments";
import { sameOrigin } from "../origin";
import { makeLimiter } from "../rate-limit";
import {
  COMMENT_BODY_LIMIT,
  COMMENT_RATE_LIMIT,
  type Deps,
  type Route,
} from "../utils";

export function PostsRoute(deps: Deps): Route {
  return [
    "/posts",
    async (c: Context) => {
      const all = (await deps.posts.list()).filter((post) => !post.hidden);
      const availableTags = [...new Set(all.flatMap((post) => post.tags))].sort(
        (a, b) => a.localeCompare(b),
      );
      const params = new URL(c.req.url).searchParams;
      const selected = (params.get("tags") ?? "")
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => availableTags.includes(tag));

      const filtered = selected.length
        ? all.filter((post) => post.tags.some((tag) => selected.includes(tag)))
        : all;

      const pageSize = deps.config.pageSize;
      const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
      const requested = Number.parseInt(params.get("page") ?? "1", 10) || 1;
      const page = Math.min(Math.max(requested, 1), pages);
      const pagePosts = filtered.slice((page - 1) * pageSize, page * pageSize);

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

      const tagLinks = availableTags.map((name) => {
        const isSelected = selected.includes(name);
        const next = isSelected
          ? selected.filter((tag) => tag !== name)
          : [...selected, name];
        return { name, selected: isSelected, href: urlFor(next, 1) };
      });

      return c.html(
        await deps.liquid.renderFile("posts.liquid", {
          posts: pagePosts,
          tagLinks,
          page,
          pages,
          prevUrl: page > 1 ? urlFor(selected, page - 1) : null,
          nextUrl: page < pages ? urlFor(selected, page + 1) : null,
        }),
      );
    },
  ];
}

export function PostRoute(deps: Deps): Route {
  return [
    "/posts/:year/:month/:slug",
    async (c: Context) => {
      const { year, month, slug } = c.req.param();
      const post = await deps.posts.get(year, month, slug);
      if (!post || post.hidden) {
        return c.notFound();
      }

      const body = await deps.posts.render(post);
      const comments = deps.comments.getForPost(post.url).map((comment) => ({
        ...comment,
        postedIso: new Date(comment.posted).toISOString(),
        postedAgo: format(comment.posted),
      }));

      return c.html(
        await deps.liquid.renderFile("post.liquid", {
          ...post,
          body,
          comments,
        }),
      );
    },
  ];
}

export function CommentRoute(deps: Deps): Route {
  return [
    "/posts/:year/:month/:slug/comment",
    sameOrigin(deps.config.siteUrl),
    makeLimiter(COMMENT_RATE_LIMIT.limit, COMMENT_RATE_LIMIT.windowMs),
    bodyLimit({
      maxSize: COMMENT_BODY_LIMIT,
      onError: (c) => c.text("Comment is too large.", 413),
    }),
    async (c: Context) => {
      const { year, month, slug } = c.req.param();
      const post = await deps.posts.get(year, month, slug);
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

      const token = await deps.captcha.validate(parsed.data.captcha);
      if (!token.success) {
        return c.text("Captcha failed. Try again.", 400);
      }

      const id = deps.comments.add({
        post: post.url,
        content: renderComment(parsed.data.content),
        author: parsed.data.author,
      });
      return c.redirect(`${post.url}#comment-${id}`, 303);
    },
  ];
}
