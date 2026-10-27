import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import path from "node:path";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  nip19,
} from "nostr-tools";
import { AdminStore } from "../storages/AdminStore";
import {
  adminPubkey,
  readAdminEvent,
  verifyAdminEvent,
} from "../admin";
import { CommentStore } from "../storages/comments";
import { createApp } from "../app";
import {
  cleanup,
  makeConfig,
  occurrences,
  tempRoot,
  writePost,
} from "./helpers";

describe("admin auth", () => {
  test("decodes hex and npub admin keys", () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);

    expect(adminPubkey(pubkey)).toBe(pubkey);
    expect(adminPubkey(nip19.npubEncode(pubkey))).toBe(pubkey);
    expect(adminPubkey("not-a-key")).toBeUndefined();
  });

  test("verifies kind, pubkey, freshness, and signature", () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const now = Math.floor(Date.now() / 1000);
    const event = finalizeEvent(
      { kind: 30078, created_at: now, tags: [], content: "{}" },
      secret,
    );

    expect(verifyAdminEvent(event, pubkey)).toBe(true);
    expect(verifyAdminEvent(event, getPublicKey(generateSecretKey()))).toBe(
      false,
    );

    const wrongKind = finalizeEvent(
      { kind: 1, created_at: now, tags: [], content: "{}" },
      secret,
    );
    expect(verifyAdminEvent(wrongKind, pubkey)).toBe(false);

    const stale = finalizeEvent(
      { kind: 30078, created_at: now - 1000, tags: [], content: "{}" },
      secret,
    );
    expect(verifyAdminEvent(stale, pubkey)).toBe(false);
  });

  test("rejects malformed event objects", () => {
    expect(readAdminEvent({})).toBeUndefined();
    expect(readAdminEvent(null)).toBeUndefined();
  });
});

describe("AdminStore", () => {
  let root: string;
  let store: AdminStore;

  beforeEach(() => {
    root = tempRoot();
    store = new AdminStore(path.join(root, "admin.db"));
  });

  afterEach(() => cleanup(root));

  test("consumes each event once", () => {
    expect(store.consumeEvent("event-1", "login", 1)).toBe(true);
    expect(store.consumeEvent("event-1", "login", 1)).toBe(false);
  });

  test("creates, finds, and deletes sessions", () => {
    const session = store.createSession();
    expect(store.getSession(session.token)?.csrf).toBe(session.csrf);
    expect(store.getSession("wrong")).toBeUndefined();

    store.deleteSession(session.token);
    expect(store.getSession(session.token)).toBeUndefined();
  });
});

describe("admin routes", () => {
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

  test("login, paginate, delete, replay, and reject a wrong key", async () => {
    const secret = generateSecretKey();
    const pubkey = getPublicKey(secret);
    const npub = nip19.npubEncode(pubkey);
    const config = makeConfig(root, { adminNpub: npub });
    const app = createApp(config);

    const comments = new CommentStore(config.commentsDb);
    for (let index = 0; index < 31; index += 1) {
      comments.add({
        post: "/posts/2024/01/post-0",
        content: `<p>Comment ${index}</p>`,
        author: "Tester",
      });
    }

    const loginPage = await app.request("/admin");
    expect(loginPage.status).toBe(200);
    const loginHtml = await loginPage.text();
    expect(loginHtml).toContain("Sign in with NIP-07");
    expect(loginHtml).toContain('<a href="/">Home</a>');

    const loginEvent = finalizeEvent(
      {
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["t", "shantaram-admin"]],
        content: JSON.stringify({ action: "login" }),
      },
      secret,
    );

    const login = await app.request("/api/v1/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: loginEvent }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    expect(cookie.startsWith("admin_session=")).toBe(true);

    const home = await app.request("/", { headers: { cookie } });
    expect(await home.text()).toContain('href="/admin"');
    const anonymousHome = await app.request("/");
    expect(await anonymousHome.text()).not.toContain('href="/admin"');

    const page1 = await app.request("/admin", { headers: { cookie } });
    const html1 = await page1.text();
    expect(page1.status).toBe(200);
    expect(occurrences(html1, 'class="comment surface"')).toBe(25);
    expect(html1).toContain("Page 1 of 2");
    expect(html1).toContain("Signed in as");
    expect(html1).toContain(`@${npub.slice(0, 12)}`);
    expect(html1).toContain("Sign out");

    const page2 = await app.request("/admin?page=2", { headers: { cookie } });
    const html2 = await page2.text();
    expect(occurrences(html2, 'class="comment surface"')).toBe(6);

    const csrf = html1.match(/name="csrf" value="([^"]+)"/)?.[1];
    const commentId = html1.match(/id="comment-([^"]+)"/)?.[1];
    const form = new URLSearchParams({
      action: "delete-comment",
      id: commentId ?? "",
      csrf: csrf ?? "",
      next: "/admin",
    });

    const deleted = await app.request("/api/v1/admin", {
      method: "POST",
      headers: {
        cookie,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    expect(deleted.status).toBe(303);
    expect(deleted.headers.get("location")).toBe("/admin");
    expect(comments.listAll()).toHaveLength(30);

    const replay = await app.request("/api/v1/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: loginEvent }),
    });
    expect(replay.status).toBe(409);

    const wrongEvent = finalizeEvent(
      {
        kind: 30078,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["t", "shantaram-admin"]],
        content: JSON.stringify({ action: "login" }),
      },
      generateSecretKey(),
    );
    const wrong = await app.request("/api/v1/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: wrongEvent }),
    });
    expect(wrong.status).toBe(401);
  });
});
