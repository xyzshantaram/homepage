import type { Context } from "hono";
import { makeLimiter } from "../rate-limit";
import { CAPTCHA_RATE_LIMIT, type Deps, type Route } from "../utils";

export function ChallengeRoute(deps: Deps): Route {
  return [
    "/api/v1/captcha/challenge",
    makeLimiter(CAPTCHA_RATE_LIMIT.limit, CAPTCHA_RATE_LIMIT.windowMs, true),
    async (c: Context) => c.json(await deps.captcha.createChallenge()),
  ];
}

export function RedeemRoute(deps: Deps): Route {
  return [
    "/api/v1/captcha/redeem",
    makeLimiter(CAPTCHA_RATE_LIMIT.limit, CAPTCHA_RATE_LIMIT.windowMs, true),
    async (c: Context) => {
      const body = await c.req.json().catch(() => null);
      const token = body?.token;
      const solutions = body?.solutions;

      if (!token || !solutions) {
        return c.json({ success: false }, 400);
      }

      return c.json(await deps.captcha.redeem(token, solutions));
    },
  ];
}
