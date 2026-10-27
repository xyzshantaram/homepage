import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { CommentStore, commentSchema, renderComment } from "../comments";
import { cleanup, tempRoot } from "./helpers";

describe("comment input and rendering", () => {
  test("accepts a valid comment", () => {
    const parsed = commentSchema.safeParse({
      author: "A",
      content: "Hi",
      captcha: "token",
    });
    expect(parsed.success).toBe(true);
  });

  test("defaults a missing author", () => {
    const parsed = commentSchema.safeParse({
      content: "Hi",
      captcha: "token",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.author).toBe("");
    }
  });

  test("rejects empty content, long authors, and missing captcha", () => {
    expect(
      commentSchema.safeParse({ author: "A", content: "", captcha: "x" })
        .success,
    ).toBe(false);
    expect(
      commentSchema.safeParse({
        author: "a".repeat(41),
        content: "Hi",
        captcha: "x",
      }).success,
    ).toBe(false);
    expect(
      commentSchema.safeParse({ author: "A", content: "Hi", captcha: "" })
        .success,
    ).toBe(false);
  });

  test("renders markdown and strips unsafe html", () => {
    const html = renderComment(
      "**bold** <script>alert(1)</script> [safe](https://example.com) [bad](javascript:alert(1))",
    );

    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain('rel="nofollow noopener noreferrer"');
  });
});

describe("CommentStore", () => {
  let root: string;
  let store: CommentStore;

  beforeEach(() => {
    root = tempRoot();
    store = new CommentStore(path.join(root, "comments.db"));
  });

  afterEach(() => cleanup(root));

  test("adds, lists, paginates, counts, and deletes", () => {
    const first = store.add({
      post: "/posts/2024/01/a",
      content: "<p>one</p>",
      author: "A",
    });
    store.add({ post: "/posts/2024/01/a", content: "<p>two</p>", author: "B" });
    store.add({ post: "/posts/2024/01/b", content: "<p>three</p>", author: "C" });

    expect(store.getForPost("/posts/2024/01/a")).toHaveLength(2);
    expect(store.listAll()).toHaveLength(3);
    expect(store.count()).toBe(3);
    expect(store.listPage(2, 0)).toHaveLength(2);
    expect(store.listPage(2, 2)).toHaveLength(1);

    expect(store.delete(first)).toBe(true);
    expect(store.count()).toBe(2);
    expect(store.delete("missing")).toBe(false);
  });

  test("migrates the old for column to post", () => {
    const dbPath = path.join(root, "legacy.db");
    const legacy = new Database(dbPath);
    legacy.run(`
      CREATE TABLE comment (
        id TEXT PRIMARY KEY,
        "for" TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        posted INTEGER NOT NULL
      )
    `);
    legacy
      .query(
        `INSERT INTO comment (id, "for", content, author, posted) VALUES (?, ?, ?, ?, ?)`,
      )
      .run("01", "/posts/2024/01/a", "<p>old</p>", "A", Date.now());
    legacy.close();

    const migrated = new CommentStore(dbPath);
    const comments = migrated.getForPost("/posts/2024/01/a");

    expect(comments).toHaveLength(1);
    expect(comments[0].post).toBe("/posts/2024/01/a");

    const check = new Database(dbPath);
    const columns = check.query("PRAGMA table_info(comment)").all() as {
      name: string;
    }[];
    check.close();

    expect(columns.some((column) => column.name === "post")).toBe(true);
    expect(columns.some((column) => column.name === "for")).toBe(false);
  });
});
