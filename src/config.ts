import {
  DEFAULT_PORT,
  DEFAULT_POSTS_DIR,
  DEFAULT_SITE_URL,
  FEED_LIMIT,
  PAGE_SIZE,
  type Config,
} from "./utils";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
}

export function loadConfig(): Config {
  return {
    port: Number(process.env.PORT ?? DEFAULT_PORT),
    siteUrl: (process.env.SITE_URL ?? DEFAULT_SITE_URL).replace(/\/$/, ""),
    postsDir: process.env.POSTS_DIR ?? DEFAULT_POSTS_DIR,
    commentsDb: required("COMMENTS_DB"),
    capState: required("CAP_STATE"),
    webhookSecret: process.env.WEBHOOK_SECRET,
    adminNpub: process.env.ADMIN_NPUB,
    pageSize: PAGE_SIZE,
    feedLimit: FEED_LIMIT,
  };
}
