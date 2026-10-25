import type { Context } from "hono";
import { escape } from "lodash";
import type { Deps, Route } from "../utils";

export function RssRoutes(deps: Deps): Route[] {
  const serveRss = async (c: Context) => {
    const siteUrl = deps.config.siteUrl;
    const items = (await deps.posts.list())
      .filter((post) => !post.hidden)
      .slice(0, deps.config.feedLimit)
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

    const xml = [
      '<?xml version="1.0" encoding="utf-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      "  <channel>",
      "    <title>shantaram.xyz</title>",
      `    <link>${siteUrl}/</link>`,
      "    <description>shan's corner of the internet</description>",
      `    <atom:link href="${siteUrl}/feed.rss" rel="self" type="application/rss+xml" />`,
      `    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`,
      items,
      "  </channel>",
      "</rss>",
    ].join("\n");

    return c.body(xml, 200, {
      "Content-Type": "application/rss+xml; charset=utf-8",
    });
  };

  return [
    ["/blog/feed.rss", serveRss],
    ["/feed.rss", serveRss],
  ];
}
