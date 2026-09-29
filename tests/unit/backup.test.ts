import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { backupSqlite, restoreSqlite } from "../../tools/backup-sqlite";
import { SessionRepository } from "../../src/server/sessions";
import { newSession } from "../../src/domain/contracts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

test("online backup restores owner-scoped sessions and does not copy a missing source", async () => {
  const dir = mkdtempSync(join(tmpdir(), "ul-backup-"));
  dirs.push(dir);
  const source = join(dir, "live.sqlite");
  const snapshot = join(dir, "snap.sqlite");
  const restored = join(dir, "restored.sqlite");
  const live = new Database(source);
  const repo = new SessionRepository(live);
  repo.migrate();
  repo.save("alice", "s1", 0, "k1", { ...newSession("s1"), notes: "只属于 alice" });
  live.close();
  await backupSqlite(source, snapshot);
  restoreSqlite(snapshot, restored);
  const db = new Database(restored, { fileMustExist: true });
  const again = new SessionRepository(db);
  expect(again.get("alice", "s1").session.notes).toBe("只属于 alice");
  expect(() => again.get("bob", "s1")).toThrow("404");
  db.close();
  await expect(backupSqlite(join(dir, "missing.sqlite"), snapshot)).rejects.toThrow("source-missing");
});
