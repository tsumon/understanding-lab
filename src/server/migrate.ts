import { getMigrations } from "better-auth/db/migration";
import type Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createAuth, type Auth } from "./auth";
import { loadConfig } from "./config";
import { openDatabase } from "./db";

const migrations = [{ version: 1, name: "initialize-migration-ledger", sql: `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )
` }];

/** Invoked explicitly by db:migrate, never by app creation, startup, or a request. */
export async function migrate(db: Database.Database, auth: Auth): Promise<void> {
  await (await getMigrations(auth.options)).runMigrations();
  db.exec(migrations[0].sql);
  for (const migration of migrations) {
    db.transaction(() => {
      if (db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version)) return;
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)")
        .run(migration.version, migration.name, new Date().toISOString());
    })();
  }
}

async function main() {
  const config = loadConfig();
  const db = openDatabase(config.dbPath);
  try {
    await migrate(db, createAuth(db, config));
    console.info(JSON.stringify({ event: "migrations-complete" }));
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(JSON.stringify({ event: "migrations-failed" }));
    process.exitCode = 1;
  });
}
