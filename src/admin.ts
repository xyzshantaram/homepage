import type { Context } from "hono";
import { getCookie } from "hono/cookie";
import { nip19, SimplePool, verifyEvent, type Event } from "nostr-tools";
import { z } from "zod";
import type { AdminSession, AdminStore } from "./storages/AdminStore";
import {
  ADMIN_EVENT_KIND,
  ADMIN_EVENT_MAX_AGE_S,
  ADMIN_SESSION_COOKIE,
  type Config,
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

export function adminNpubForDisplay(
  value: string | undefined,
): string | undefined {
  const pubkey = adminPubkey(value);
  return pubkey ? nip19.npubEncode(pubkey) : undefined;
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

const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEGATIVE_TTL_MS = 10 * 60 * 1000;
const profileCache = new Map<string, { name?: string; expires: number }>();

async function profileName(
  pubkey: string,
  relays: string[],
): Promise<string | undefined> {
  if (relays.length === 0) {
    return undefined;
  }

  const cached = profileCache.get(pubkey);
  if (cached && cached.expires > Date.now()) {
    return cached.name;
  }

  const pool = new SimplePool();
  try {
    const event = await pool.get(
      relays,
      { kinds: [0], authors: [pubkey] },
      { maxWait: 10_000 },
    );
    if (!event) {
      profileCache.set(pubkey, { expires: Date.now() + NEGATIVE_TTL_MS });
      return undefined;
    }

    const meta = JSON.parse(event.content) as {
      name?: unknown;
      display_name?: unknown;
    };
    const raw =
      typeof meta.name === "string" && meta.name.trim()
        ? meta.name
        : typeof meta.display_name === "string" && meta.display_name.trim()
          ? meta.display_name
          : undefined;
    const name = raw?.trim().replace(/^@/, "");
    profileCache.set(pubkey, { name, expires: Date.now() + PROFILE_TTL_MS });
    return name;
  } catch {
    profileCache.set(pubkey, { expires: Date.now() + NEGATIVE_TTL_MS });
    return undefined;
  } finally {
    pool.close(relays);
  }
}

export async function loadAdminName(
  config: Config,
): Promise<string | undefined> {
  const pubkey = adminPubkey(config.adminNpub);
  const npub = adminNpubForDisplay(config.adminNpub);
  if (!pubkey || !npub) {
    return undefined;
  }

  const name = await profileName(pubkey, config.nostrRelays);
  if (!name) {
    console.warn(
      "[admin] could not fetch the Nostr profile; using a truncated npub",
    );
    return npub.slice(0, 12);
  }

  return name;
}
