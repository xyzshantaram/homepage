import Cap from "@cap.js/server";
import type { Context } from "hono";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const statePath = process.env.CAP_STATE ?? "data/cap-state.json";
mkdirSync(dirname(resolve(statePath)), { recursive: true });

const cap = new Cap({ tokens_store_path: statePath });

export async function challenge(c: Context) {
  return c.json(await cap.createChallenge());
}

export async function redeem(c: Context) {
  const body = await c.req.json().catch(() => null);
  const token = body?.token;
  const solutions = body?.solutions;

  if (!token || !solutions) {
    return c.json({ success: false }, 400);
  }

  return c.json(await cap.redeemChallenge({ token, solutions }));
}

export function validate(token: string) {
  return cap.validateToken(token);
}
