import type { Context } from "hono";
import { createMiddleware } from "hono/factory";

function clientIp(c: Context): string {
  return (
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
    c.req.header("x-real-ip") ||
    "unknown"
  );
}

export function makeLimiter(limit: number, windowMs: number, json = false) {
  const hits = new Map<string, number[]>();

  return createMiddleware(async (c, next) => {
    const key = `${clientIp(c)}|${new URL(c.req.url).pathname}`;
    const now = Date.now();
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
