import Cap from "@cap.js/server";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { CHALLENGE_CONFIG } from "./utils";

export class Captcha {
  private cap: Cap;

  constructor(statePath: string) {
    mkdirSync(dirname(resolve(statePath)), { recursive: true });
    this.cap = new Cap({ tokens_store_path: statePath });
  }

  createChallenge() {
    return this.cap.createChallenge(CHALLENGE_CONFIG);
  }

  redeem(token: string, solutions: number[]) {
    return this.cap.redeemChallenge({ token, solutions });
  }

  validate(token: string) {
    return this.cap.validateToken(token);
  }
}
