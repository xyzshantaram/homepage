import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { Liquid } from "liquidjs";
import path from "node:path";
import { Captcha } from "./captcha";
import { CommentStore } from "./comments";
import { FilePostStorage } from "./post-storage";
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

  app.use("/*", serveStatic({ root: path.join(root, "static") }));

  return app;
}
