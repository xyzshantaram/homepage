import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Config } from "../utils";

export type PostFixture = {
  file: string;
  title: string;
  date: string;
  tags?: string[];
  hidden?: boolean;
  description?: string;
  body?: string;
};

export function tempRoot(): string {
  return mkdtempSync(path.join(tmpdir(), "homepage-test-"));
}

export function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export function writePost(root: string, fixture: PostFixture): void {
  const dir = path.join(root, "posts");
  mkdirSync(dir, { recursive: true });

  const lines = [
    "---",
    `title: ${JSON.stringify(fixture.title)}`,
    fixture.description
      ? `description: ${JSON.stringify(fixture.description)}`
      : null,
    `created-date: ${fixture.date}`,
    `tags: [${(fixture.tags ?? []).join(", ")}]`,
    fixture.hidden ? "hidden: true" : null,
    "---",
    "",
    fixture.body ?? "",
  ].filter((line): line is string => line !== null);

  writeFileSync(path.join(dir, fixture.file), lines.join("\n"));
}

export function makeConfig(
  root: string,
  overrides: Partial<Config> = {},
): Config {
  return {
    port: 3000,
    siteUrl: "http://localhost",
    postsDir: path.join(root, "posts"),
    commentsDb: path.join(root, "comments.db"),
    capState: path.join(root, "cap-state.json"),
    webhookSecret: "test-webhook",
    adminNpub: undefined,
    pageSize: 25,
    feedLimit: 25,
    ...overrides,
  };
}

export function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}
