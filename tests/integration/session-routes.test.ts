import request from "supertest";
import Database from "better-sqlite3";
import { afterEach, expect, test } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/server/app";
import { SessionRepository } from "../../src/server/sessions";
import { newSession } from "../../src/domain/contracts";
import type { AppDeps } from "../../src/server/app";

const origin = "http://localhost:3001";
const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });

function database(path = ":memory:") {
  const db = new Database(path, { timeout: 0 });
  cleanup.push(() => db.close());
  new SessionRepository(db).migrate();
  return db;
}

function appFor(userId: string | null, db = database()) {
  const deps: AppDeps = {
    db,
    authHandler: (_req, res) => { res.sendStatus(204); },
    resolveUser: async () => userId === null ? null : { id: userId },
    tutorProvider: { model: "disabled", generate: async () => { throw new Error("unavailable"); } },
    audioProvider: null,
    clock: () => new Date("2026-09-26T00:00:00Z"),
    publicOrigin: origin,
  };
  return { app: createApp(deps), db };
}

function put(app: ReturnType<typeof createApp>, id: string, body: object, key = "k1") {
  return request(app).put(`/api/sessions/${id}`).set("Origin", origin).set("Idempotency-Key", key).send(body);
}

test("unauthenticated session routes stay 401 and PUT requires the matching Origin", async () => {
  const { app } = appFor(null);
  expect((await request(app).get("/api/sessions")).status).toBe(401);
  const { app: alice } = appFor("alice");
  expect((await request(alice).put("/api/sessions/s1").set("Idempotency-Key", "k").send({ session: newSession("s1"), baseRevision: 0 })).status).toBe(403);
});

test("authenticated CRUD, export, retry and owner isolation", async () => {
  const directory = mkdtempSync(join(tmpdir(), "learning-routes-"));
  cleanup.push(() => rmSync(directory, { recursive: true }));
  const db = database(join(directory, "db.sqlite"));
  const alice = appFor("alice", db).app;
  const bob = appFor("bob", db).app;
  const draft = newSession("s1");
  const created = await put(alice, "s1", { session: draft, baseRevision: 0 });
  expect(created.status).toBe(200);
  expect(created.body).toEqual({ session: draft, serverRevision: 1 });
  expect((await put(alice, "s1", { session: draft, baseRevision: 0 })).body).toEqual(created.body);
  expect((await put(alice, "s1", { session: draft, baseRevision: 0 }, "k2")).status).toBe(409);
  expect((await request(alice).get("/api/sessions")).body).toEqual({ sessions: [created.body] });
  const exported = await request(alice).get("/api/sessions/s1/export");
  expect(exported.status).toBe(200);
  expect(exported.body).toEqual(created.body);
  expect(exported.headers["content-disposition"]).toMatch(/attachment/);
  expect((await request(bob).get("/api/sessions/s1")).status).toBe(404);
  expect((await request(bob).get("/api/sessions/s1/export")).status).toBe(404);
  expect((await request(bob).delete("/api/sessions/s1").set("Origin", origin)).status).toBe(404);
  expect((await put(bob, "s1", { session: draft, baseRevision: 0 }, "bob")).status).toBe(404);
  expect((await request(alice).delete("/api/sessions/s1").set("Origin", origin)).status).toBe(204);
  expect((await request(alice).get("/api/sessions/s1")).status).toBe(410);
  expect((await put(alice, "s1", { session: draft, baseRevision: 0 }, "k1")).status).toBe(410);
});

test("rejects owner injection, missing idempotency keys and oversized bodies", async () => {
  const { app } = appFor("alice");
  expect((await put(app, "s1", { session: { ...newSession("s1"), ownerId: "bob" }, baseRevision: 0 })).status).toBe(400);
  expect((await request(app).put("/api/sessions/s1").set("Origin", origin).send({ session: newSession("s1"), baseRevision: 0 })).status).toBe(400);
  const oversized = await request(app).put("/api/sessions/s1").set("Origin", origin).set("Idempotency-Key", "big")
    .send({ session: "x".repeat(2 * 1024 * 1024 + 100), baseRevision: 0 });
  expect(oversized.status).toBe(413);
  expect(oversized.body).toEqual({ error: "body-too-large" });
});
