import type { Context } from "hono";
import { escape } from "lodash";
import { createHash } from "node:crypto";
import type { Deps, Route } from "../utils";

export function RssRoutes(deps: Deps): Route[] {
  const serveRss = async (c: Context) => {
    const siteUrl = deps.config.siteUrl;
    const posts = (await deps.posts.list())
      .filter((post) => !post.hidden)
      .slice(0, deps.config.feedLimit);

    const items = posts
      .map((post) => {
        const link = `${siteUrl}${post.url}`;
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

    const newest = posts[0]?.createdDate;
    const lastModified = (
      newest ? new Date(`${newest}T00:00:00Z`) : new Date(0)
    ).toUTCString();

    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      "  <channel>",
      "    <title>shantaram.xyz</title>",
      `    <link>${escape(`${siteUrl}/`)}</link>`,
      "    <description>shan's corner of the internet</description>",
      `    <atom:link href="${escape(`${siteUrl}/feed.rss`)}" rel="self" type="application/rss+xml" />`,
      `    <lastBuildDate>${lastModified}</lastBuildDate>`,
      items,
      "  </channel>",
      "</rss>",
    ].join("\n");

    const etag = `W/"${createHash("sha256").update(xml).digest("base64url").slice(0, 16)}"`;
    const headers = {
      ETag: etag,
      "Last-Modified": lastModified,
      "Cache-Control": "public, max-age=300",
    };

    if (c.req.header("if-none-match") === etag) {
      return c.body(null, 304, headers);
    }

    return c.body(xml, 200, {
      ...headers,
      "Content-Type": "application/rss+xml; charset=utf-8",
    });
  };

  return [
    ["/blog/feed.rss", serveRss],
    ["/feed.rss", serveRss],
  ];
}
