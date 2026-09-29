import { createApp } from "../../../src/server/app";
import { QuotaLedger } from "../../../src/server/quota";
import { SessionRepository } from "../../../src/server/sessions";
import Database from "better-sqlite3";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

async function freePort(): Promise<number> {
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address() as AddressInfo;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return address.port;
}

function userFromCookie(cookie: unknown): string | null {
  const raw = Array.isArray(cookie) ? cookie.join("; ") : String(cookie ?? "");
  const match = /ul-test-user=([^;]+)/.exec(raw);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function startLiveApp(): Promise<{ origin: string; close(): Promise<void> }> {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const db = new Database(":memory:");
  new SessionRepository(db).migrate();
  new QuotaLedger(db).migrate();
  const app = createApp({
    db,
    authHandler: (_req, res) => { res.sendStatus(204); },
    resolveUser: async (headers) => {
      const id = userFromCookie(headers.cookie);
      return id ? { id } : null;
    },
    tutorProvider: { model: "disabled", generate: async () => { throw new Error("unavailable"); } },
    audioProvider: null,
    clock: () => new Date("2026-09-26T00:00:00Z"),
    publicOrigin: origin,
  });
  const server: Server = app.listen(port, "127.0.0.1");
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return {
    origin,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        db.close();
        if (error) reject(error); else resolve();
      });
    }),
  };
}

if (process.argv[1] && process.argv[1].endsWith("live-server.ts")) {
  const live = await startLiveApp();
  process.stdout.write(`${JSON.stringify({ origin: live.origin })}\n`);
  const stop = () => { void live.close().then(() => process.exit(0)); };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
}
