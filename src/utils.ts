import { homedir } from "node:os";
import path from "node:path";
import type { Handler } from "hono";
import type { Liquid } from "liquidjs";
import type { AdminStore } from "./AdminStore";
import type { Captcha } from "./Captcha";
import type { CommentStore } from "./comments";

export type Route = [path: string, ...handlers: Handler[]];

export type Post = {
  title: string;
  slug: string;
  description: string;
  createdDate: string;
  tags: string[];
  hidden: boolean;
  url: string;
};

export interface PostStorage {
  list(): Promise<Post[]>;
  get(year: string, month: string, slug: string): Promise<Post | undefined>;
  render(post: Post): Promise<string>;
  refresh?(): Promise<void>;
}

export type Comment = {
  id: string;
  post: string;
  content: string;
  author: string;
  posted: number;
};

export type Config = {
  port: number;
  siteUrl: string;
  postsDir: string;
  mediaDir: string;
  commentsDb: string;
  capState: string;
  webhookSecret?: string;
  adminNpub?: string;
  nostrRelays: string[];
  pageSize: number;
  feedLimit: number;
};

export type Deps = {
  config: Config;
  liquid: Liquid;
  posts: PostStorage;
  comments: CommentStore;
  captcha: Captcha;
  admin: AdminStore;
  adminName?: string;
};

export const HOME_POST_COUNT = 3;
export const PAGE_SIZE = 25;
export const FEED_LIMIT = 25;
export const MAX_AUTHOR_LENGTH = 40;
export const MAX_COMMENT_LENGTH = 4000;

export const WEBHOOK_BODY_LIMIT = 1024 * 1024;
export const COMMENT_BODY_LIMIT = 64 * 1024;
export const CAPTCHA_BODY_LIMIT = 16 * 1024;

export const DEFAULT_PORT = 3000;
export const DEFAULT_SITE_URL = "https://shantaram.xyz";
export const DEFAULT_POSTS_DIR = path.join(
  homedir(),
  "th/scratch/posts-wt/posts",
);
export const DEFAULT_MEDIA_DIR = "data/media";
export const DEFAULT_NOSTR_RELAYS = [
  "wss://relay.ditto.pub",
  "wss://relay.primal.net",
];

export const COMMENT_RATE_LIMIT = { limit: 1, windowMs: 60_000 };
export const CAPTCHA_RATE_LIMIT = { limit: 5, windowMs: 10_000 };

export const CHALLENGE_CONFIG = {
  challengeCount: 75,
  challengeSize: 32,
  challengeDifficulty: 4,
};

export const CONTENT_REF = "refs/heads/content";

export const ADMIN_EVENT_KIND = 30078;
export const ADMIN_EVENT_MAX_AGE_S = 300;
export const ADMIN_SESSION_COOKIE = "admin_session";
export const ADMIN_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const ADMIN_BODY_LIMIT = 64 * 1024;
