import type { MiddlewareHandler } from "hono";

function originOf(value: string): string | undefined {
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

export function sameOrigin(siteUrl: string): MiddlewareHandler {
  const expected = originOf(siteUrl);

  return async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && (!expected || originOf(origin) !== expected)) {
      return c.text("Forbidden", 403);
    }

    await next();
  };
}
