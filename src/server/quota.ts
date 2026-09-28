import type Database from "better-sqlite3";
import { readFileSync } from "node:fs";

export type UsageKind = "tutor" | "transcribe";
export type ReserveResult = "reserved" | "in-flight" | "already-used" | "limit" | "busy";

const LIMITS: Record<UsageKind, number> = { tutor: 30, transcribe: 10 };
const GLOBAL_LIMIT = 4;
const STALE_MS = 60_000;
const LIVE = new Set(["reserved", "in-flight"]);

type UsageRow = { request_hash: string; state: string; started_at: string };

/** The caller supplies a verified owner identity. Construction never migrates. */
export class QuotaLedger {
  constructor(private readonly db: Database.Database) {}

  migrate(): void {
    const sql = readFileSync(new URL("./migrations/002_usage.sql", import.meta.url), "utf8");
    this.db.transaction(() => {
      this.db.exec(`CREATE TABLE IF NOT EXISTS learning_schema_migrations (
        version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL
      )`);
      if (this.db.prepare("SELECT version FROM learning_schema_migrations WHERE version = 2").get()) return;
      this.db.exec(sql);
      this.db.prepare("INSERT INTO learning_schema_migrations (version, applied_at) VALUES (2, ?)")
        .run(new Date().toISOString());
    }).immediate();
  }

  reserveOperation(
    ownerId: string, requestId: string, kind: UsageKind, requestHash: string, now: Date,
  ): ReserveResult {
    if (!ownerId.trim() || !requestId.trim() || !requestHash.trim()) throw new Error("invalid-reserve");
    if (kind !== "tutor" && kind !== "transcribe") throw new Error("invalid-kind");
    const day = now.toISOString().slice(0, 10);
    const started = now.toISOString();
    const cutoff = new Date(now.getTime() - STALE_MS).toISOString();
    try {
      return this.db.transaction(() => {
        const existing = this.db.prepare(
          "SELECT request_hash, state, started_at FROM usage_operations WHERE owner_id = ? AND request_id = ?",
        ).get(ownerId, requestId) as UsageRow | undefined;
        if (existing) return this.existingResult(existing, requestHash, cutoff);

        const global = (this.db.prepare(
          `SELECT COUNT(*) AS n FROM usage_operations
           WHERE state IN ('reserved', 'in-flight') AND started_at > ?`,
        ).get(cutoff) as { n: number }).n;
        if (global >= GLOBAL_LIMIT) return "busy";

        const used = (this.db.prepare(
          `SELECT COUNT(*) AS n FROM usage_operations
           WHERE owner_id = ? AND kind = ? AND day_utc = ? AND state IN ('reserved', 'in-flight', 'completed')`,
        ).get(ownerId, kind, day) as { n: number }).n;
        if (used >= LIMITS[kind]) return "limit";

        this.db.prepare(`INSERT INTO usage_operations
          (owner_id, request_id, kind, day_utc, request_hash, state, started_at, finished_at)
          VALUES (?, ?, ?, ?, ?, 'in-flight', ?, NULL)`)
          .run(ownerId, requestId, kind, day, requestHash, started);
        return "reserved";
      }).immediate();
    } catch (error) {
      if (error instanceof Error && /busy|locked/i.test(error.message)) return "busy";
      throw error;
    }
  }

  finishOperation(ownerId: string, requestId: string, ok: boolean): void {
    void ok;
    this.db.prepare(`UPDATE usage_operations SET state = 'completed', finished_at = ?
      WHERE owner_id = ? AND request_id = ? AND state IN ('reserved', 'in-flight')`)
      .run(new Date().toISOString(), ownerId, requestId);
  }

  abortOperation(ownerId: string, requestId: string): void {
    this.db.prepare(`UPDATE usage_operations SET state = 'aborted', finished_at = ?
      WHERE owner_id = ? AND request_id = ? AND state IN ('reserved', 'in-flight')`)
      .run(new Date().toISOString(), ownerId, requestId);
  }

  private existingResult(existing: UsageRow, requestHash: string, cutoff: string): ReserveResult {
    if (existing.request_hash !== requestHash || !LIVE.has(existing.state)) return "already-used";
    return existing.started_at <= cutoff ? "already-used" : "in-flight";
  }
}
