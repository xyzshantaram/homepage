import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, setCookie } from "hono/cookie";
import { createHmac, timingSafeEqual } from "node:crypto";
import { format } from "timeago.js";
import {
  adminActionSchema,
  adminPubkey,
  readAdminEvent,
  sessionFromRequest,
  verifyAdminEvent,
} from "../admin";
import {
  ADMIN_BODY_LIMIT,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_TTL_MS,
  CONTENT_REF,
  WEBHOOK_BODY_LIMIT,
  type Deps,
  type Route,
} from "../utils";

function verifyWebhook(
  body: string,
  signature: string | undefined,
  secret: string | undefined,
): boolean {
  if (!secret || !signature) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const actual = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

function cookieOptions(c: Context) {
  return {
    httpOnly: true,
    sameSite: "Strict" as const,
    path: "/",
    maxAge: ADMIN_SESSION_TTL_MS / 1000,
    secure: new URL(c.req.url).protocol === "https:",
  };
}

function formatBytes(bytes: number): string {
  const units = ["K", "M", "G", "T"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 2 ? 2 : 1)}${units[unit]}`;
}

function safeNext(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/") &&
    !value.startsWith("//")
    ? value
    : "/admin";
}

async function handleSigned(deps: Deps, c: Context) {
  const payload = await c.req.json().catch(() => null);
  const event = readAdminEvent(payload?.event);
  const pubkey = adminPubkey(deps.config.adminNpub);

  if (!event || !verifyAdminEvent(event, pubkey)) {
    return c.json({ success: false, error: { code: "Unauthorized" } }, 401);
  }

  let content: unknown;
  try {
    content = JSON.parse(event.content);
  } catch {
    return c.json({ success: false, error: { code: "InvalidAction" } }, 400);
  }

  const action = adminActionSchema.safeParse(content);
  if (!action.success) {
    return c.json({ success: false, error: { code: "InvalidAction" } }, 400);
  }

  if (!deps.admin.consumeEvent(event.id, action.data.action, event.created_at)) {
    return c.json({ success: false, error: { code: "Replay" } }, 409);
  }

  if (action.data.action === "login") {
    const session = deps.admin.createSession();
    setCookie(c, ADMIN_SESSION_COOKIE, session.token, cookieOptions(c));
    return c.json({ success: true, action: "login" });
  }

  deps.comments.delete(action.data.id);
  return c.json({ success: true, action: "delete-comment" });
}

async function handleForm(deps: Deps, c: Context) {
  const session = sessionFromRequest(c, deps.admin);
  if (!session) {
    return c.text("Unauthorized", 401);
  }

  const body = await c.req.parseBody();
  if (typeof body.csrf !== "string" || body.csrf !== session.csrf) {
    return c.text("Forbidden", 403);
  }

  if (body.action === "delete-comment") {
    if (typeof body.id === "string") {
      deps.comments.delete(body.id);
    }
    return c.redirect(safeNext(body.next), 303);
  }

  if (body.action === "delete-media") {
    if (typeof body.name === "string") {
      await deps.images.deleteOrphan(body.name);
    }
    return c.redirect(safeNext(body.next), 303);
  }

  if (body.action === "logout") {
    deps.admin.deleteSession(session.token);
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/" });
    return c.redirect("/admin", 303);
  }

  return c.text("Invalid action", 400);
}

export function PostsWebhookRoute(deps: Deps): Route {
  return [
    "/api/v1/admin/posts/hook",
    bodyLimit({
      maxSize: WEBHOOK_BODY_LIMIT,
      onError: (c) => c.json({ ok: false }, 413),
    }),
    async (c: Context) => {
      const body = await c.req.text();
      if (
        !verifyWebhook(
          body,
          c.req.header("x-hub-signature-256"),
          deps.config.webhookSecret,
        )
      ) {
        return c.json({ ok: false }, 401);
      }

      const event = c.req.header("x-github-event");
      if (event === "ping") {
        return c.json({ ok: true });
      }
      if (event !== "push") {
        return c.json({ ok: true, ignored: event });
      }

      let payload: { ref?: string };
      try {
        payload = JSON.parse(body);
      } catch {
        return c.json({ ok: false, error: "invalid json" }, 400);
      }

      if (payload.ref !== CONTENT_REF) {
        return c.json({ ok: true, ignored: payload.ref });
      }

      try {
        await deps.posts.refresh?.();
        await deps.images.recomputeOrphans();
        return c.json({ ok: true });
      } catch (error) {
        return c.json({ ok: false, error: (error as Error).message }, 500);
      }
    },
  ];
}

export function AdminApiRoute(deps: Deps): Route {
  return [
    "/api/v1/admin",
    bodyLimit({
      maxSize: ADMIN_BODY_LIMIT,
      onError: (c) =>
        c.json({ success: false, error: { code: "TooLarge" } }, 413),
    }),
    async (c: Context) => {
      const contentType = c.req.header("content-type") ?? "";
      return contentType.includes("application/json")
        ? handleSigned(deps, c)
        : handleForm(deps, c);
    },
  ];
}

export function AdminPageRoute(deps: Deps): Route {
  return [
    "/admin",
    async (c: Context) => {
      const session = sessionFromRequest(c, deps.admin);
      if (!session) {
        return c.html(
          await deps.liquid.renderFile("admin.liquid", {
            loggedIn: false,
            admin: false,
          }),
        );
      }

      const params = new URL(c.req.url).searchParams;
      const pageSize = deps.config.pageSize;
      const total = deps.comments.count();
      const pages = Math.max(1, Math.ceil(total / pageSize));
      const requested = Number.parseInt(params.get("page") ?? "1", 10) || 1;
      const page = Math.min(Math.max(requested, 1), pages);
      const pageUrl = page > 1 ? `/admin?page=${page}` : "/admin";

      const comments = deps.comments
        .listPage(pageSize, (page - 1) * pageSize)
        .map((comment) => ({
          ...comment,
          postedIso: new Date(comment.posted).toISOString(),
          postedAgo: format(comment.posted),
        }));

      const orphanedMedia = (await deps.images.orphans()).map((file) => ({
        ...file,
        short: `${file.name.slice(0, 12)}…`,
        sizeLabel: formatBytes(file.bytes),
        modifiedIso: new Date(file.modified).toISOString(),
        modifiedAgo: format(file.modified),
      }));
      const orphanedBytes = formatBytes(
        orphanedMedia.reduce((total, file) => total + file.bytes, 0),
      );

      return c.html(
        await deps.liquid.renderFile("admin.liquid", {
          loggedIn: true,
          admin: true,
          csrf: session.csrf,
          adminName: deps.adminName,
          comments,
          orphanedMedia,
          orphanedBytes,
          page,
          pages,
          pageUrl,
          prevUrl: page > 1 ? `/admin?page=${page - 1}` : null,
          nextUrl: page < pages ? `/admin?page=${page + 1}` : null,
        }),
      );
    },
  ];
}

export function OrphanedMediaRoute(deps: Deps): Route {
  return [
    "/api/v1/admin/orphaned-media",
    async (c: Context) => {
      const session = sessionFromRequest(c, deps.admin);
      if (!session) {
        return c.json({ success: false, error: { code: "Unauthorized" } }, 401);
      }

      const orphaned = await deps.images.orphans();
      return c.json({
        success: true,
        totalBytes: orphaned.reduce((total, file) => total + file.bytes, 0),
        orphaned: orphaned.map((file) => ({
          name: file.name,
          url: file.url,
          type: file.type,
          bytes: file.bytes,
          size: formatBytes(file.bytes),
          modified: new Date(file.modified).toISOString(),
        })),
      });
    },
  ];
}
