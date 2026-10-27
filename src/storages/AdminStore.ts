import { Database } from "bun:sqlite";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { ADMIN_SESSION_TTL_MS } from "../utils";

type Statement = ReturnType<Database["query"]>;

export type AdminSession = {
  token: string;
  csrf: string;
  expires: number;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class AdminStore {
  private consumeStatement: Statement;
  private createSessionStatement: Statement;
  private getSessionStatement: Statement;
  private deleteSessionStatement: Statement;

  constructor(dbPath: string) {
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });

    const db = new Database(dbPath, { create: true });
    db.run("PRAGMA journal_mode = WAL");
    db.run(`
      CREATE TABLE IF NOT EXISTS used_event (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);
    db.run(`
      CREATE TABLE IF NOT EXISTS admin_session (
        token_hash TEXT PRIMARY KEY,
        csrf TEXT NOT NULL,
        created INTEGER NOT NULL,
        expires INTEGER NOT NULL
      )
    `);

    this.consumeStatement = db.query(`
      INSERT OR IGNORE INTO used_event (id, action, created_at, applied_at)
      VALUES (?, ?, ?, ?)
    `);
    this.createSessionStatement = db.query(`
      INSERT INTO admin_session (token_hash, csrf, created, expires)
      VALUES (?, ?, ?, ?)
    `);
    this.getSessionStatement = db.query(`
      SELECT csrf, expires FROM admin_session WHERE token_hash = ?
    `);
    this.deleteSessionStatement = db.query(`
      DELETE FROM admin_session WHERE token_hash = ?
    `);
  }

  consumeEvent(id: string, action: string, createdAt: number): boolean {
    const result = this.consumeStatement.run(id, action, createdAt, Date.now());
    return result.changes > 0;
  }

  createSession(): AdminSession {
    const token = randomBytes(32).toString("base64url");
    const csrf = randomBytes(32).toString("base64url");
    const now = Date.now();
    const expires = now + ADMIN_SESSION_TTL_MS;
    this.createSessionStatement.run(hashToken(token), csrf, now, expires);
    return { token, csrf, expires };
  }

  getSession(token: string): AdminSession | undefined {
    const row = this.getSessionStatement.get(hashToken(token)) as
      | { csrf: string; expires: number }
      | null;

    if (!row) {
      return undefined;
    }
    if (row.expires <= Date.now()) {
      this.deleteSession(token);
      return undefined;
    }

    return { token, csrf: row.csrf, expires: row.expires };
  }

  deleteSession(token: string): void {
    this.deleteSessionStatement.run(hashToken(token));
  }
}
