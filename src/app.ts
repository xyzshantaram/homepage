import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { Liquid } from "liquidjs";
import path from "node:path";
import { ZodError } from "zod";
import { Captcha } from "./Captcha";
import { CommentStore } from "./comments";
import { FilePostStorage } from "./PostStorage";
import {
  ChallengeRoute,
  CommentRoute,
  HomeRoute,
  PostRoute,
  PostsRoute,
  PostsWebhookRoute,
  RedeemRoute,
  RssRoutes,
} from "./routes";
import type { Config, Deps } from "./utils";

export function createApp(config: Config) {
  const app = new Hono();
  const root = path.join(import.meta.dir, "..");

  const deps: Deps = {
    config,
    liquid: new Liquid({
      root: [path.join(root, "templates")],
      extname: ".liquid",
    }),
    posts: new FilePostStorage(config.postsDir),
    comments: new CommentStore(config.commentsDb),
    captcha: new Captcha(config.capState),
  };

  app.use("*", async (c, next) => {
    await next();
    c.header("X-Content-Type-Options", "nosniff");
    c.header("X-Frame-Options", "DENY");
    c.header("Referrer-Policy", "strict-origin-when-cross-origin");
    c.header(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' https://cdn.jsdelivr.net",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
        "img-src 'self' data: https:",
        "connect-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join("; "),
    );
  });

  app.get(...HomeRoute(deps));
  app.get(...PostsRoute(deps));
  app.get(...PostRoute(deps));
  app.post(...CommentRoute(deps));

  for (const route of RssRoutes(deps)) {
    app.get(...route);
  }

  app.post(...ChallengeRoute(deps));
  app.post(...RedeemRoute(deps));
  app.post(...PostsWebhookRoute(deps));

  app.onError(async (error, c) => {
    console.error(error);

    const status =
      error instanceof HTTPException
        ? error.status
        : error instanceof ZodError
          ? 400
          : 500;
    const code =
      error instanceof ZodError
        ? "ValidationError"
        : status === 500
          ? "InternalError"
          : "Error";
    const name =
      error instanceof ZodError
        ? "Validation error"
        : status === 500
          ? "Unexpected error"
          : error.name || "Error";
    const details =
      status === 500
        ? "Something unexpected happened. Please try again later."
        : error.message;
    const payload = { code, name, details };

    if (new URL(c.req.url).pathname.startsWith("/api/")) {
      return c.json({ success: false, error: payload }, status);
    }

    return c.html(await deps.liquid.renderFile("error.liquid", payload), status);
  });

  app.use("/*", serveStatic({ root: path.join(root, "static") }));

  return app;
}
