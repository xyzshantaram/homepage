import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { createHmac, timingSafeEqual } from "node:crypto";
import {
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
        return c.json({ ok: true });
      } catch (error) {
        return c.json({ ok: false, error: (error as Error).message }, 500);
      }
    },
  ];
}
