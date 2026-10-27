import type { Context } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { sameOrigin } from "../utils/origin";
import { makeLimiter } from "../utils/rate-limit";
import {
  CAPTCHA_BODY_LIMIT,
  CAPTCHA_RATE_LIMIT,
  type Deps,
  type Route,
} from "../utils";

const redeemSchema = z.object({
  token: z.string().min(1),
  solutions: z.array(z.number()).min(1).max(1000),
});

export function ChallengeRoute(deps: Deps): Route {
  return [
    "/api/v1/captcha/challenge",
    sameOrigin(deps.config.siteUrl),
    makeLimiter(CAPTCHA_RATE_LIMIT.limit, CAPTCHA_RATE_LIMIT.windowMs, true),
    async (c: Context) => c.json(await deps.captcha.createChallenge()),
  ];
}

export function RedeemRoute(deps: Deps): Route {
  return [
    "/api/v1/captcha/redeem",
    sameOrigin(deps.config.siteUrl),
    makeLimiter(CAPTCHA_RATE_LIMIT.limit, CAPTCHA_RATE_LIMIT.windowMs, true),
    bodyLimit({
      maxSize: CAPTCHA_BODY_LIMIT,
      onError: (c) => c.json({ success: false }, 413),
    }),
    async (c: Context) => {
      const body = await c.req.json().catch(() => null);
      const parsed = redeemSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ success: false }, 400);
      }

      return c.json(
        await deps.captcha.redeem(parsed.data.token, parsed.data.solutions),
      );
    },
  ];
}
