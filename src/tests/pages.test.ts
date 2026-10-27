import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createApp } from "../app";
import { ComponentStore } from "../storages/ComponentStore";
import { FilePageStorage } from "../storages/PageStorage";
import { cleanup, makeConfig, tempRoot, writePage } from "./helpers";

function fixtures(root: string): void {
  writePage(root, {
    file: "contact.md",
    title: "Contact",
    body: "Email me at me@shantaram.xyz or [donate](/donate).",
  });
  writePage(root, {
    file: "donate.md",
    title: "Donate",
    components: ["./bmc-button.js"],
    body: '<div class="btczap-widget" data-creator="xyzshantaram"></div>',
  });
  writePage(root, {
    file: "services.md",
    title: "Services",
    components: ["./services-estimate.js"],
    body: "<services-estimate></services-estimate>",
  });
  writePage(root, {
    file: "extra.md",
    title: "Extra",
    extraHead: '<meta name="test" content="yes" />',
    body: "Extra body.",
  });

  writeFileSync(
    path.join(root, "pages", "bmc-button.js"),
    "customElements.define('bmc-button', class extends HTMLElement {});",
  );
  writeFileSync(
    path.join(root, "pages", "services-estimate.js"),
    "customElements.define('services-estimate', class extends HTMLElement {});",
  );
}

describe("FilePageStorage", () => {
  let root: string;
  beforeEach(() => {
    root = tempRoot();
    fixtures(root);
  });
  afterEach(() => cleanup(root));

  test("reads frontmatter and renders raw page HTML", async () => {
    const storage = new FilePageStorage(path.join(root, "pages"));
    const page = await storage.get("extra");
    expect(page?.title).toBe("Extra");
    expect(page?.extraHead).toContain('name="test"');

    const html = await storage.render(page!);
    expect(html).toContain("Extra");
  });

  test("reads components and resolves them from the page directory", async () => {
    const media = path.join(root, "media");
    const storage = new FilePageStorage(
      path.join(root, "pages"),
      undefined,
      new ComponentStore(media, root),
    );
    const page = await storage.get("services");
    expect(page?.components).toEqual(["./services-estimate.js"]);

    const urls = await storage.resolveComponents(page!);
    expect(urls[0]).toMatch(/^\/media\/[a-f0-9]+\.js$/);
    expect(
      readFileSync(path.join(media, path.basename(urls[0])), "utf8"),
    ).toContain("services-estimate");
  });

  test("returns undefined for a missing page", async () => {
    const storage = new FilePageStorage(path.join(root, "pages"));
    expect(await storage.get("nope")).toBeUndefined();
  });
});

describe("ComponentStore", () => {
  let root: string;
  beforeEach(() => {
    root = tempRoot();
  });
  afterEach(() => cleanup(root));

  test("fetches and caches remote components", async () => {
    const server = Bun.serve({
      port: 0,
      fetch: () =>
        new Response("customElements.define('x', class extends HTMLElement {});"),
    });

    try {
      const media = path.join(root, "media");
      const store = new ComponentStore(media, root);
      const url = await store.resolve(
        `http://127.0.0.1:${server.port}/x.js`,
        path.join(root, "pages"),
      );
      expect(url).toMatch(/^\/media\/[a-f0-9]+\.js$/);
      expect(
        readFileSync(path.join(media, path.basename(url)), "utf8"),
      ).toContain("customElements");
    } finally {
      server.stop(true);
    }
  });
});

describe("page routes", () => {
  let root: string;
  beforeEach(() => {
    root = tempRoot();
    fixtures(root);
  });
  afterEach(() => cleanup(root));

  const app = () => createApp(makeConfig(root));

  test("serves pages at the old paths with and without a trailing slash", async () => {
    for (const path of [
      "/contact",
      "/contact/",
      "/services",
      "/services/",
      "/donate",
    ]) {
      expect((await app().request(path)).status).toBe(200);
    }
  });

  test("redirects legacy donate paths to /donate", async () => {
    for (const path of [
      "/contact/donate",
      "/contact/donate/",
      "/contact/donate.html",
      "/donate/",
    ]) {
      const response = await app().request(path);
      expect(response.status).toBe(301);
      expect(response.headers.get("location")).toBe("/donate");
    }
  });

  test("renders components as module scripts and raw page HTML", async () => {
    const donate = await (await app().request("/donate")).text();
    expect(donate).toContain('<script type="module" src="/media/');
    expect(donate).toContain('<div class="btczap-widget"');

    const services = await (await app().request("/services")).text();
    expect(services).toContain('<script type="module" src="/media/');
    expect(services).toContain("<services-estimate></services-estimate>");
  });

  test("serves static files under /static", async () => {
    expect((await app().request("/static/index.css")).status).toBe(200);
    expect((await app().request("/index.css")).status).toBe(404);
  });

  test("allows the widget domains in the CSP", async () => {
    const response = await app().request("/donate");
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("https://btczap.io");
    expect(csp).toContain("https://cdnjs.buymeacoffee.com");
    expect(csp).toContain("https://esm.sh");
    expect(csp).toContain("https://fonts.googleapis.com");
    expect(csp).toContain("https://fonts.gstatic.com");
  });

  test("shows the footer Home item on pages", async () => {
    const html = await (await app().request("/contact")).text();
    expect(html).toContain('<a href="/">Home</a>');
  });

  test("returns 404 for an unknown page", async () => {
    expect((await app().request("/nope")).status).toBe(404);
  });
});
