import { Database } from "bun:sqlite";
import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ulid } from "ulid";
import { z } from "zod";
import {
  MAX_AUTHOR_LENGTH,
  MAX_COMMENT_LENGTH,
  type Comment,
} from "./utils";

type Statement = ReturnType<Database["query"]>;

export const commentSchema = z.object({
  author: z
    .string()
    .max(MAX_AUTHOR_LENGTH)
    .default("")
    .transform((value) => value.trim()),
  content: z
    .string()
    .max(MAX_COMMENT_LENGTH)
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, {
      message: "Comment cannot be empty.",
    }),
  captcha: z.string().min(1),
});

const markdown = new MarkdownIt({ html: false, linkify: true });

export function renderComment(source: string): string {
  return sanitizeHtml(markdown.render(source), {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "b",
      "i",
      "a",
      "ul",
      "ol",
      "li",
      "blockquote",
      "code",
      "pre",
      "del",
      "s",
    ],
    allowedAttributes: { a: ["href", "title", "rel"] },
    allowedSchemes: ["http", "https", "mailto"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "nofollow noopener noreferrer",
      }),
    },
  });
}

export class CommentStore {
  private listStatement: Statement;
  private insertStatement: Statement;

  constructor(dbPath: string) {
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });

    const db = new Database(dbPath, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run(`
      CREATE TABLE IF NOT EXISTS comment (
        id TEXT PRIMARY KEY,
        "for" TEXT NOT NULL,
        content TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        posted INTEGER NOT NULL
      )
    `);
    db.run(`
      CREATE INDEX IF NOT EXISTS comment_for_posted ON comment ("for", posted)
    `);

    this.listStatement = db.query(
      `SELECT id, "for", content, author, posted FROM comment WHERE "for" = ? ORDER BY posted ASC`,
    );
    this.insertStatement = db.query(
      `INSERT INTO comment (id, "for", content, author, posted) VALUES (?, ?, ?, ?, ?)`,
    );
  }

  getForPost(post: string): Comment[] {
    return this.listStatement.all(post) as Comment[];
  }

  add(input: { post: string; content: string; author: string }): string {
    const id = ulid();
    this.insertStatement.run(
      id,
      input.post,
      input.content,
      input.author,
      Date.now(),
    );
    return id;
  }
}
