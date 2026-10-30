import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import path from "node:path";
import { Captcha } from "../utils/captcha";
import { createApp } from "../app";
import { sameOrigin } from "../utils/origin";
import { makeLimiter } from "../utils/rate-limit";
import { cleanup, makeConfig, tempRoot, writePost } from "./helpers";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", "test-webhook").update(body).digest("hex")}`;
}

describe("sameOrigin", () => {
  const app = new Hono();
  app.use("*", sameOrigin("https://example.com"));
  app.get("/", (c) => c.text("ok"));

  test("allows matching origins", async () => {
    const response = await app.request("/", {
      headers: { origin: "https://example.com" },
    });
    expect(response.status).toBe(200);
  });

  test("allows requests without an origin", async () => {
    expect((await app.request("/")).status).toBe(200);
  });

  test("rejects other origins", async () => {
    const response = await app.request("/", {
      headers: { origin: "https://evil.example" },
    });
    expect(response.status).toBe(403);
  });
});

describe("makeLimiter", () => {
  const app = new Hono();
  app.use("*", makeLimiter(1, 60_000));
  app.get("/", (c) => c.text("ok"));

  test("returns 429 with Retry-After after the limit", async () => {
    const first = await app.request("/", {
      headers: { "x-real-ip": "1.1.1.1" },
    });
    const second = await app.request("/", {
      headers: { "x-real-ip": "1.1.1.1" },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.headers.get("retry-after")).toBe("60");
  });
});

describe("Captcha", () => {
  let root: string;

  beforeEach(() => {
    root = tempRoot();
  });

  afterEach(() => cleanup(root));

  test("uses 75 challenges at difficulty 4", async () => {
    const captcha = new Captcha(path.join(root, "cap.json"));
    const challenge = await captcha.createChallenge();

    expect(challenge.challenge).toEqual({ c: 75, s: 32, d: 4 });
  });

  test("rejects an unknown token", async () => {
    const captcha = new Captcha(path.join(root, "cap.json"));
    const result = await captcha.validate("unknown");
    expect(result.success).toBe(false);
  });
});

describe("http routes", () => {
  let root: string;

  beforeEach(() => {
    root = tempRoot();
    writePost(root, {
      file: "post-0.md",
      title: "Post 0",
      date: "2024-01-01",
      body: "Body",
    });
  });

  afterEach(() => cleanup(root));

  test("accepts legacy and modern CSP reports", async () => {
    const app = createApp(makeConfig(root));

    const legacy = await app.request("/api/v1/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report" },
      body: JSON.stringify({
        "csp-report": {
          "violated-directive": "script-src",
          "blocked-uri": "https://evil.example/x.js",
          "document-uri": "https://shantaram.xyz/",
        },
      }),
    });
    expect(legacy.status).toBe(204);

    const modern = await app.request("/api/v1/csp-report", {
      method: "POST",
      headers: { "content-type": "application/reports+json" },
      body: JSON.stringify([
        {
          type: "csp-violation",
          body: {
            effectiveDirective: "connect-src",
            blockedURL: "https://evil.example/api",
            documentURL: "https://shantaram.xyz/",
          },
        },
      ]),
    });
    expect(modern.status).toBe(204);
  });

  test("advertises the report endpoint in the policy", async () => {
    const app = createApp(makeConfig(root));
    const response = await app.request("/");

    expect(response.headers.get("reporting-endpoints")).toContain(
      "/api/v1/csp-report",
    );
    expect(response.headers.get("content-security-policy")).toContain(
      "report-uri /api/v1/csp-report",
    );
  });

  test("webhook verifies the signature and filters refs", async () => {
    const app = createApp(makeConfig(root));
    const hook = "/api/v1/admin/posts/hook";
    const ping = JSON.stringify({ zen: "keep it simple" });

    const bad = await app.request(hook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-hub-signature-256": "sha256=deadbeef",
      },
      body: ping,
    });
    expect(bad.status).toBe(401);

    const good = await app.request(hook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "ping",
        "x-hub-signature-256": sign(ping),
      },
      body: ping,
    });
    expect(good.status).toBe(200);

    const push = JSON.stringify({ ref: "refs/heads/next" });
    const ignored = await app.request(hook, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-github-event": "push",
        "x-hub-signature-256": sign(push),
      },
      body: push,
    });
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toEqual({
      ok: true,
      ignored: "refs/heads/next",
    });
  });

  test("comment route checks origin and rate limits", async () => {
    const app = createApp(makeConfig(root));
    const url = "/posts/2024/01/post-0/comment";
    const body = new URLSearchParams({
      author: "A",
      content: "Hi",
    }).toString();
    const headers = {
      "content-type": "application/x-www-form-urlencoded",
    };

    const wrongOrigin = await app.request(url, {
      method: "POST",
      headers: { ...headers, origin: "https://evil.example" },
      body,
    });
    expect(wrongOrigin.status).toBe(403);

    const first = await app.request(url, { method: "POST", headers, body });
    expect(first.status).toBe(400);

    const second = await app.request(url, { method: "POST", headers, body });
    expect(second.status).toBe(429);
  });

  test("captcha challenge returns the configured shape", async () => {
    const app = createApp(makeConfig(root));
    const response = await app.request("/api/v1/captcha/challenge", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      challenge: { c: number; s: number; d: number };
    };
    expect(data.challenge).toEqual({ c: 75, s: 32, d: 4 });
  });
});
