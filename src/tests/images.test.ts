import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import sharp from "sharp";
import { createApp } from "../app";
import { ImageStore } from "../storages/ImageStore";
import { FilePostStorage } from "../storages/PostStorage";
import { cleanup, makeConfig, tempRoot, writePost } from "./helpers";

const PNG = await sharp({
  create: {
    width: 1,
    height: 1,
    channels: 4,
    background: { r: 255, g: 0, b: 0, alpha: 1 },
  },
})
  .png()
  .toBuffer();
const HASH = createHash("sha256").update(PNG).digest("hex");

describe("ImageStore", () => {
  let root: string;
  let postsDir: string;
  let mediaDir: string;
  let store: ImageStore;

  beforeEach(() => {
    root = tempRoot();
    postsDir = path.join(root, "posts");
    mediaDir = path.join(root, "media");
    mkdirSync(postsDir, { recursive: true });
    writeFileSync(path.join(postsDir, "local.png"), PNG);
    mkdirSync(path.join(root, "images"), { recursive: true });
    writeFileSync(path.join(root, "images", "root.png"), PNG);
    store = new ImageStore(mediaDir, root);
  });

  afterEach(() => cleanup(root));

  test("hashes and caches a dot path against the post directory", async () => {
    const url = await store.resolve("./local.png", postsDir);
    expect(url).toBe(`/media/${HASH}.webp`);
    expect(existsSync(path.join(mediaDir, `${HASH}.webp`))).toBe(true);
  });

  test("resolves a slash path against the content root", async () => {
    const url = await store.resolve("/images/root.png", postsDir);
    expect(url).toBe(`/media/${HASH}.webp`);
  });

  test("fetches http sources into the cache", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response(PNG, { headers: { "content-type": "image/png" } }),
    });
    try {
      const url = await store.resolve(
        `http://127.0.0.1:${server.port}/x.png`,
        postsDir,
      );
      expect(url).toBe(`/media/${HASH}.webp`);
    } finally {
      server.stop();
    }
  });

  test("leaves missing and escaping sources alone", async () => {
    expect(await store.resolve("./missing.png", postsDir)).toBe(
      "./missing.png",
    );
    expect(await store.resolve("./../../etc/passwd", postsDir)).toBe(
      "./../../etc/passwd",
    );
  });

  test("renders post images through the cache", async () => {
    writePost(root, {
      file: "image-post.md",
      title: "Image Post",
      date: "2024-01-02",
      body: "![Alt](./local.png)",
    });
    const storage = new FilePostStorage(postsDir, store);
    const post = await storage.get("2024", "01", "image-post");
    const html = await storage.render(post!);
    expect(html).toContain(`src="/media/${HASH}.webp"`);
    expect(html).toContain("<figure>");
    expect(html).toContain("<figcaption>Alt</figcaption>");
  });

  test("serves cached media from the app", async () => {
    await store.resolve("./local.png", postsDir);
    const app = createApp(makeConfig(root));
    const response = await app.request(`/media/${HASH}.webp`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/webp");
  });
});
