import {
  DEFAULT_CAP_STATE,
  DEFAULT_COMMENTS_DB,
  DEFAULT_PORT,
  DEFAULT_POSTS_DIR,
  DEFAULT_SITE_URL,
  FEED_LIMIT,
  PAGE_SIZE,
  type Config,
} from "./utils";

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    siteUrl: (process.env.SITE_URL ?? DEFAULT_SITE_URL).replace(/\/$/, ""),
    postsDir: process.env.POSTS_DIR ?? DEFAULT_POSTS_DIR,
    commentsDb: process.env.COMMENTS_DB ?? DEFAULT_COMMENTS_DB,
    capState: process.env.CAP_STATE ?? DEFAULT_CAP_STATE,
    webhookSecret: process.env.WEBHOOK_SECRET,
    adminNpub: process.env.ADMIN_NPUB,
    pageSize: PAGE_SIZE,
    feedLimit: FEED_LIMIT,
  };
}
