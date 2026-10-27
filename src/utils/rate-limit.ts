import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

const MAX_ENTRIES = 10_000;

function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip")?.trim() ||
    c.req.header("x-real-ip")?.trim() ||
    "untrusted"
  );
}

export function makeLimiter(limit: number, windowMs: number, json = false) {
  const hits = new Map<string, number[]>();

  const prune = (now: number) => {
    for (const [key, times] of hits) {
      const recent = times.filter((time) => now - time < windowMs);
      if (recent.length) {
        hits.set(key, recent);
      } else {
        hits.delete(key);
      }
    }
  };

  return createMiddleware(async (c, next) => {
    const now = Date.now();
    if (hits.size >= MAX_ENTRIES) {
      prune(now);
      if (hits.size >= MAX_ENTRIES) {
        const oldest = hits.keys().next().value;
        if (oldest !== undefined) {
          hits.delete(oldest);
        }
      }
    }

    const key = `${clientIp(c)}|${new URL(c.req.url).pathname}`;
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);

    if (recent.length >= limit) {
      const headers = { "Retry-After": String(Math.ceil(windowMs / 1000)) };
      return json
        ? c.json({ success: false }, 429, headers)
        : c.text("Too many requests. Try again later.", 429, headers);
    }

    recent.push(now);
    hits.set(key, recent);
    await next();
  });
}
