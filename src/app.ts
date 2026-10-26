import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { HTTPException } from "hono/http-exception";
import { Liquid } from "liquidjs";
import path from "node:path";
import { ZodError } from "zod";
import { Captcha } from "./Captcha";
import { CommentStore } from "./comments";
import { AdminStore } from "./AdminStore";
import { adminNpubForDisplay, sessionFromRequest } from "./admin";
import { ComponentStore } from "./ComponentStore";
import { ImageStore } from "./ImageStore";
import { FilePageStorage } from "./PageStorage";
import { FilePostStorage } from "./PostStorage";
import {
  AdminApiRoute,
  AdminPageRoute,
  ChallengeRoute,
  CommentRoute,
  HomeRoute,
  PageRoutes,
  PostRoute,
  PostsRoute,
  PostsWebhookRoute,
  RedeemRoute,
  RssRoutes,
} from "./routes";
import type { Config, Deps } from "./utils";

export function createApp(config: Config, adminName?: string) {
  const app = new Hono();
  const root = path.join(import.meta.dir, "..");
  const contentRoot = path.dirname(config.postsDir);
  const images = new ImageStore(config.mediaDir, contentRoot);
  const components = new ComponentStore(config.mediaDir, contentRoot);

  const deps: Deps = {
    config,
    liquid: new Liquid({
      root: [path.join(root, "templates")],
      extname: ".liquid",
    }),
    posts: new FilePostStorage(config.postsDir, images),
    pages: new FilePageStorage(
      path.join(contentRoot, "pages"),
      images,
      components,
    ),
    comments: new CommentStore(config.commentsDb),
    captcha: new Captcha(config.capState),
    admin: new AdminStore(config.commentsDb),
    adminName:
      adminName ?? adminNpubForDisplay(config.adminNpub)?.slice(0, 12),
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
        "script-src 'self' https://cdn.jsdelivr.net https://cdnjs.buymeacoffee.com https://btczap.io https://esm.sh",
        "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://fonts.googleapis.com",
        "img-src 'self' data: https:",
        "font-src 'self' https://fonts.gstatic.com",
        "connect-src 'self' https://btczap.io https://*.btczap.io",
        "frame-src 'self' https://btczap.io https://*.btczap.io",
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
  app.get(...AdminPageRoute(deps));
  app.post(...AdminApiRoute(deps));

  for (const route of PageRoutes(deps)) {
    app.get(...route);
  }

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
    const admin = Boolean(sessionFromRequest(c, deps.admin));

    if (new URL(c.req.url).pathname.startsWith("/api/")) {
      return c.json({ success: false, error: payload }, status);
    }

    return c.html(
      await deps.liquid.renderFile("error.liquid", { ...payload, admin }),
      status,
    );
  });

  app.use(
    "/media/*",
    serveStatic({
      root: config.mediaDir,
      rewriteRequestPath: (requestPath) =>
        requestPath.replace(/^\/media/, ""),
    }),
  );

  app.use(
    "/static/*",
    serveStatic({
      root: path.join(root, "static"),
      rewriteRequestPath: (requestPath) =>
        requestPath.replace(/^\/static/, ""),
    }),
  );

  return app;
}
