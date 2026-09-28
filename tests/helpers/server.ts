import Database from "better-sqlite3";
import type { AppDeps } from "../../src/server/app";

export async function testDependencies({ userId }: { userId: string | null }): Promise<AppDeps & { close(): void }> {
  const db = new Database(":memory:");
  return {
    db,
    authHandler: (_req, res) => { res.sendStatus(204); },
    resolveUser: async () => userId === null ? null : { id: userId },
    tutorProvider: { model: "disabled", generate: async () => { throw new Error("unavailable"); } },
    audioProvider: null,
    clock: () => new Date("2026-09-26T00:00:00Z"),
    publicOrigin: "http://localhost:3001",
    close: () => db.close(),
  };
}
