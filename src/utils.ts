import { homedir } from "node:os";
import path from "node:path";
import type { Handler } from "hono";
import type { Liquid } from "liquidjs";
import type { Captcha } from "./captcha";
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
  body: string;
};

export interface PostStorage {
  list(): Promise<Post[]>;
  get(year: string, month: string, slug: string): Promise<Post | undefined>;
  refresh?(): Promise<void>;
}

export type Comment = {
  id: string;
  for: string;
  content: string;
  author: string;
  posted: number;
};

export type Config = {
  port: number;
  siteUrl: string;
  postsDir: string;
  commentsDb: string;
  capState: string;
  webhookSecret?: string;
  adminNpub?: string;
  pageSize: number;
  feedLimit: number;
};

export type Deps = {
  config: Config;
  liquid: Liquid;
  posts: PostStorage;
  comments: CommentStore;
  captcha: Captcha;
};

export const HOME_POST_COUNT = 3;
export const PAGE_SIZE = 25;
export const FEED_LIMIT = 25;
export const MAX_AUTHOR_LENGTH = 40;
export const MAX_COMMENT_LENGTH = 4000;

export const DEFAULT_PORT = 3000;
export const DEFAULT_SITE_URL = "https://shantaram.xyz";
export const DEFAULT_POSTS_DIR = path.join(
  homedir(),
  "th/scratch/posts-wt/posts",
);
export const DEFAULT_COMMENTS_DB = "data/comments.db";
export const DEFAULT_CAP_STATE = "data/cap-state.json";

export const COMMENT_RATE_LIMIT = { limit: 1, windowMs: 60_000 };
export const CAPTCHA_RATE_LIMIT = { limit: 5, windowMs: 10_000 };

export const CHALLENGE_CONFIG = {
  challengeCount: 75,
  challengeSize: 32,
  challengeDifficulty: 4,
};

export const CONTENT_REF = "refs/heads/content";
