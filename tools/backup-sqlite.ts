import Database from "better-sqlite3";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function backupSqlite(source: string, destination: string): Promise<void> {
  const from = resolve(source);
  const to = resolve(destination);
  if (!existsSync(from)) throw new Error("source-missing");
  mkdirSync(dirname(to), { recursive: true });
  const db = new Database(from, { readonly: true, fileMustExist: true });
  try { await db.backup(to); }
  finally { db.close(); }
}

export function restoreSqlite(backup: string, destination: string): void {
  const from = resolve(backup);
  const to = resolve(destination);
  if (!existsSync(from)) throw new Error("backup-missing");
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

async function main(): Promise<void> {
  const [command, a, b] = process.argv.slice(2);
  if (command === "backup" && a && b) {
    await backupSqlite(a, b);
    console.log(JSON.stringify({ event: "backup-complete", destination: resolve(b) }));
    return;
  }
  if (command === "restore" && a && b) {
    restoreSqlite(a, b);
    console.log(JSON.stringify({ event: "restore-complete", destination: resolve(b) }));
    return;
  }
  console.error(JSON.stringify({ event: "usage", hint: "backup <source.sqlite> <dest.sqlite> | restore <backup.sqlite> <dest.sqlite>" }));
  process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(JSON.stringify({ event: "backup-failed", reason: error instanceof Error ? error.message : "error" }));
    process.exit(1);
  });
}
