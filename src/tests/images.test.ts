import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import ffmpegPath from "ffmpeg-static";
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

const VIDEO = (() => {
  const dir = mkdtempSync(path.join(tmpdir(), "homepage-video-"));
  const file = path.join(dir, "clip.mp4");
  execFileSync(
    ffmpegPath!,
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=128x72:rate=5:duration=0.2",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      file,
    ],
    { stdio: "ignore" },
  );
  const buffer = readFileSync(file);
  rmSync(dir, { recursive: true, force: true });
  return buffer;
})();
const VIDEO_HASH = createHash("sha256").update(VIDEO).digest("hex");

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

  test("transcodes videos into webm and mp4", async () => {
    writeFileSync(path.join(postsDir, "clip.mp4"), VIDEO);
    const resolved = await store.resolve("./clip.mp4", postsDir);
    expect(resolved).toEqual({
      video: {
        webm: `/media/${VIDEO_HASH}.webm`,
        mp4: `/media/${VIDEO_HASH}.mp4`,
      },
    });
    expect(existsSync(path.join(mediaDir, `${VIDEO_HASH}.webm`))).toBe(true);
    expect(existsSync(path.join(mediaDir, `${VIDEO_HASH}.mp4`))).toBe(true);
  });

  test("renders video attributes from the title", async () => {
    writeFileSync(path.join(postsDir, "clip.mp4"), VIDEO);
    writePost(root, {
      file: "video-post.md",
      title: "Video Post",
      date: "2024-01-02",
      body: '![Clip](./clip.mp4 "muted,autoplay,loop,nocontrols")',
    });
    const storage = new FilePostStorage(postsDir, store);
    const post = await storage.get("2024", "01", "video-post");
    const html = await storage.render(post!);
    expect(html).toContain(
      `<source src="/media/${VIDEO_HASH}.webm" type="video/webm">`,
    );
    expect(html).toContain(
      `<source src="/media/${VIDEO_HASH}.mp4" type="video/mp4">`,
    );
    expect(html).toContain("muted autoplay loop");
    expect(html).not.toContain("controls");
    expect(html).toContain("<figcaption>Clip</figcaption>");
  });

  test("lists media that no content references", async () => {
    writeFileSync(path.join(postsDir, "local.png"), PNG);
    writePost(root, {
      file: "image-post.md",
      title: "Image Post",
      date: "2024-01-02",
      body: "![Alt](./local.png)",
    });
    await store.resolve("./local.png", postsDir);

    const orphanName = `${"a".repeat(64)}.webp`;
    writeFileSync(path.join(mediaDir, orphanName), Buffer.alloc(2048));

    const orphans = await store.orphans();
    expect(orphans.map((file) => file.name)).toEqual([orphanName]);
    expect(orphans[0].bytes).toBe(2048);
    expect(orphans[0].url).toBe(`/media/${orphanName}`);
  });

  test("deletes only orphaned media", async () => {
    writeFileSync(path.join(postsDir, "local.png"), PNG);
    writePost(root, {
      file: "image-post.md",
      title: "Image Post",
      date: "2024-01-02",
      body: "![Alt](./local.png)",
    });
    await store.resolve("./local.png", postsDir);

    const orphanName = `${"b".repeat(64)}.webp`;
    writeFileSync(path.join(mediaDir, orphanName), Buffer.alloc(1024));

    expect(await store.deleteOrphan(`${HASH}.webp`)).toBe(false);
    expect(existsSync(path.join(mediaDir, `${HASH}.webp`))).toBe(true);

    expect(await store.deleteOrphan(orphanName)).toBe(true);
    expect(existsSync(path.join(mediaDir, orphanName))).toBe(false);
  });

  test("serves cached media from the app", async () => {
    await store.resolve("./local.png", postsDir);
    const app = createApp(makeConfig(root));
    const response = await app.request(`/media/${HASH}.webp`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/webp");
  });
});
