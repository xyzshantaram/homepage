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
  components?: string[];
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
    ...(fixture.components?.length
      ? [
          "components:",
          ...fixture.components.map(
            (component) => `  - ${JSON.stringify(component)}`,
          ),
        ]
      : []),
    "---",
    "",
    fixture.body ?? "",
  ].filter((line): line is string => line !== null);

  writeFileSync(path.join(dir, fixture.file), lines.join("\n"));
}

export type PageFixture = {
  file: string;
  title: string;
  description?: string;
  extraHead?: string;
  components?: string[];
  body?: string;
};

export function writePage(root: string, fixture: PageFixture): void {
  const dir = path.join(root, "pages");
  mkdirSync(dir, { recursive: true });

  const lines = ["---", `title: ${JSON.stringify(fixture.title)}`];
  if (fixture.description) {
    lines.push(`description: ${JSON.stringify(fixture.description)}`);
  }
  if (fixture.extraHead) {
    lines.push("extra_head: |");
    for (const line of fixture.extraHead.split("\n")) {
      lines.push(`  ${line}`);
    }
  }
  if (fixture.components?.length) {
    lines.push("components:");
    for (const component of fixture.components) {
      lines.push(`  - ${JSON.stringify(component)}`);
    }
  }
  lines.push("---", "", fixture.body ?? "");

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
    mediaDir: path.join(root, "media"),
    commentsDb: path.join(root, "comments.db"),
    capState: path.join(root, "cap-state.json"),
    webhookSecret: "test-webhook",
    adminNpub: undefined,
    nostrRelays: [],
    pageSize: 25,
    feedLimit: 25,
    ...overrides,
  };
}

export function occurrences(html: string, needle: string): number {
  return html.split(needle).length - 1;
}
