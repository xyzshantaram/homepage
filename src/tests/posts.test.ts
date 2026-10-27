import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import { FilePostStorage } from "../PostStorage";
import { createApp } from "../app";
import { formatPostDate } from "../utils";
import {
  cleanup,
  makeConfig,
  occurrences,
  tempRoot,
  writePost,
  type PostFixture,
} from "./helpers";

const basePosts: PostFixture[] = [
  {
    file: "alpha.md",
    title: "Alpha",
    date: "2024-01-02",
    tags: ["fiction"],
    body: "First paragraph.",
  },
  {
    file: "delta.md",
    title: "Delta",
    date: "2024-03-04",
    tags: ["musings"],
    description: "Delta description",
    body: "Delta body.",
  },
  {
    file: "hidden.md",
    title: "Hidden",
    date: "2024-02-03",
    tags: ["fiction"],
    hidden: true,
    body: "Hidden body.",
  },
  {
    file: "bad.md",
    title: "Bad",
    date: "not-a-date",
    body: "Bad body.",
  },
];

describe("FilePostStorage", () => {
  let root: string;

  beforeEach(() => {
    root = tempRoot();
    for (const post of basePosts) {
      writePost(root, post);
    }
  });

  afterEach(() => cleanup(root));

  test("lists posts newest first and skips invalid dates", async () => {
    const storage = new FilePostStorage(path.join(root, "posts"));
    const posts = await storage.list();
    expect(posts.map((post) => post.slug)).toEqual([
      "delta",
      "hidden",
      "alpha",
    ]);
  });

  test("uses the filename for the URL and keeps the title separate", async () => {
    const storage = new FilePostStorage(path.join(root, "posts"));
    const post = await storage.get("2024", "01", "alpha");
    expect(post?.title).toBe("Alpha");
    expect(post?.url).toBe("/posts/2024/01/alpha");
    expect(post?.dateLabel).toBe("2nd January, 2024");
  });

  test("formats post dates with correct ordinals", () => {
    expect(formatPostDate("2023-11-28")).toBe("28th November, 2023");
    expect(formatPostDate("2024-01-01")).toBe("1st January, 2024");
    expect(formatPostDate("2024-01-02")).toBe("2nd January, 2024");
    expect(formatPostDate("2024-01-03")).toBe("3rd January, 2024");
    expect(formatPostDate("2024-01-04")).toBe("4th January, 2024");
    expect(formatPostDate("2024-01-11")).toBe("11th January, 2024");
    expect(formatPostDate("2024-01-12")).toBe("12th January, 2024");
    expect(formatPostDate("2024-01-13")).toBe("13th January, 2024");
    expect(formatPostDate("2024-01-21")).toBe("21st January, 2024");
    expect(formatPostDate("2024-01-22")).toBe("22nd January, 2024");
    expect(formatPostDate("2024-01-23")).toBe("23rd January, 2024");
    expect(formatPostDate("2024-01-31")).toBe("31st January, 2024");
  });

  test("returns undefined for the wrong month", async () => {
    const storage = new FilePostStorage(path.join(root, "posts"));
    expect(await storage.get("2023", "01", "alpha")).toBeUndefined();
  });

  test("falls back to an excerpt when description is missing", async () => {
    const storage = new FilePostStorage(path.join(root, "posts"));
    const post = await storage.get("2024", "01", "alpha");
    expect(post?.description).toContain("First paragraph.");
  });

  test("renders figures, tables, and footnotes", async () => {
    writePost(root, {
      file: "rich.md",
      title: "Rich",
      date: "2024-04-05",
      body:
        "![Alt text](https://example.com/x.png)\n\n" +
        "| A | B |\n|---|---|\n| 1 | 2 |\n\n" +
        "Text[^1]\n\n[^1]: Note",
    });

    const storage = new FilePostStorage(path.join(root, "posts"));
    const post = await storage.get("2024", "04", "rich");
    const html = await storage.render(post!);

    expect(html).toContain("<figure>");
    expect(html).toContain("<figcaption>Alt text</figcaption>");
    expect(html).toContain('class="table-wrapper"');
    expect(html).toContain("footnote-ref");
  });
});

describe("post routes", () => {
  let root: string;

  beforeEach(() => {
    root = tempRoot();
    for (let index = 0; index < 30; index += 1) {
      writePost(root, {
        file: `post-${index}.md`,
        title: `Post ${index}`,
        date: `2024-01-${String(index + 1).padStart(2, "0")}`,
        tags: [index % 2 ? "musings" : "fiction"],
        body: `Body ${index}`,
      });
    }
    writePost(root, {
      file: "hidden.md",
      title: "Hidden",
      date: "2024-02-01",
      hidden: true,
      body: "Hidden",
    });
  });

  afterEach(() => cleanup(root));

  const app = () => createApp(makeConfig(root));

  test("home shows the five newest visible posts", async () => {
    const response = await app().request("/");
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(occurrences(html, 'class="post-item surface"')).toBe(5);
    expect(html).toContain("Post 29");
    expect(html).toContain("Post 28");
    expect(html).toContain("Post 27");
    expect(html).toContain("Post 26");
    expect(html).toContain("Post 25");
    expect(html).toContain("30th January, 2024");
    expect(html).not.toContain("Hidden");
    expect(html).not.toContain('<a href="/">Home</a>');
  });

  test("posts paginate 25 at a time and hide hidden posts", async () => {
    const page1 = await (await app().request("/posts")).text();
    const page2 = await (await app().request("/posts?page=2")).text();

    expect(occurrences(page1, 'class="post-item surface"')).toBe(25);
    expect(occurrences(page2, 'class="post-item surface"')).toBe(5);
    expect(page1).toContain("Page 1 of 2");
    expect(page1).toContain('<a href="/">Home</a>');
    expect(page1).not.toContain("Hidden");
  });

  test("filters by tag and ignores unknown tags", async () => {
    const fiction = await (await app().request("/posts?tags=fiction")).text();
    const unknown = await (await app().request("/posts?tags=nope")).text();

    expect(occurrences(fiction, 'class="post-item surface"')).toBe(15);
    expect(occurrences(unknown, 'class="post-item surface"')).toBe(25);
  });

  test("renders visible posts and 404s hidden ones", async () => {
    const visible = await app().request("/posts/2024/01/post-0");
    const hidden = await app().request("/posts/2024/02/hidden");
    const wrongDate = await app().request("/posts/2023/01/post-0");

    expect(visible.status).toBe(200);
    const visibleHtml = await visible.text();
    expect(visibleHtml).toContain("Body 0");
    expect(visibleHtml).toContain("1st January, 2024");
    expect(visibleHtml).toContain('<a href="/">Home</a>');
    expect(hidden.status).toBe(404);
    expect(wrongDate.status).toBe(404);
  });

  test("serves the RSS feed with the atom self link", async () => {
    const response = await app().request("/feed.rss");
    const xml = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/rss+xml",
    );
    expect(occurrences(xml, "<item>")).toBe(25);
    expect(xml).toContain('rel="self"');
    expect(xml).not.toContain("Hidden");
  });

  test("escapes XML and strips characters invalid in XML 1.0", async () => {
    writePost(root, {
      file: "xml.md",
      title: 'A & B <C> "D" \'E\'',
      date: "2024-05-06",
      description: "before \u0000 after",
      body: "Body",
    });

    const xml = await (await app().request("/feed.rss")).text();

    expect(xml).toContain("A &amp; B &lt;C&gt; &quot;D&quot; &#39;E&#39;");
    expect(xml).toContain("<description>before  after</description>");
    expect(xml).not.toContain("\u0000");
  });

  test("sets security headers", async () => {
    const response = await app().request("/");

    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain(
      "script-src 'self' https://cdn.jsdelivr.net",
    );
  });
});
