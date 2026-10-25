import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { nip19, verifyEvent, type Event } from "nostr-tools";
import { z } from "zod";
import type { AdminSession, AdminStore } from "./AdminStore";
import {
  ADMIN_EVENT_KIND,
  ADMIN_EVENT_MAX_AGE_S,
  ADMIN_SESSION_COOKIE,
} from "./utils";

const eventSchema = z.object({
  id: z.string().min(1),
  pubkey: z.string().min(1),
  sig: z.string().min(1),
  kind: z.number(),
  created_at: z.number(),
  tags: z.array(z.array(z.string())),
  content: z.string(),
});

export const adminActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("login") }),
  z.object({ action: z.literal("delete-comment"), id: z.string().min(1) }),
]);

export function adminPubkey(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  try {
    const decoded = nip19.decode(trimmed);
    return decoded.type === "npub" ? decoded.data : undefined;
  } catch {
    return undefined;
  }
}

export function readAdminEvent(value: unknown): Event | undefined {
  const parsed = eventSchema.safeParse(value);
  return parsed.success ? (parsed.data as Event) : undefined;
}

export function verifyAdminEvent(
  event: Event,
  pubkey: string | undefined,
): boolean {
  if (!pubkey) {
    return false;
  }
  if (event.kind !== ADMIN_EVENT_KIND) {
    return false;
  }
  if (event.pubkey !== pubkey) {
    return false;
  }
  if (
    Math.abs(Math.floor(Date.now() / 1000) - event.created_at) >
    ADMIN_EVENT_MAX_AGE_S
  ) {
    return false;
  }

  try {
    return verifyEvent(event);
  } catch {
    return false;
  }
}

export function sessionFromRequest(
  c: Context,
  store: AdminStore,
): AdminSession | undefined {
  const token = getCookie(c, ADMIN_SESSION_COOKIE);
  return token ? store.getSession(token) : undefined;
}
