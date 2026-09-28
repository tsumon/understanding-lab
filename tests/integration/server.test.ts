import request from "supertest";
import { makeSignature } from "better-auth/crypto";
import { afterEach, expect, test, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../src/server/app";
import { testDependencies } from "../helpers/server";

const env = {
  PUBLIC_ORIGIN: "http://localhost:3001", DB_PATH: ":memory:",
  BETTER_AUTH_SECRET: "test-only-secret-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  GITHUB_CLIENT_ID: "test-client-id", GITHUB_CLIENT_SECRET: "test-client-secret",
};
const resources: Array<{ close(): void | Promise<void> }> = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const resource of resources.splice(0).reverse()) await resource.close();
});

test("服务拒绝缺少认证凭据与非 HTTPS 的公开配置", async () => {
  const { loadConfig } = await import("../../src/server/config");
  for (const invalid of [
    {}, { ...env, BETTER_AUTH_SECRET: "short" }, { ...env, GITHUB_CLIENT_ID: "" },
    { ...env, PUBLIC_ORIGIN: "http://public.invalid" },
    { ...env, PUBLIC_ORIGIN: "https://public.invalid/path" },
    { ...env, PUBLIC_ORIGIN: "https://user:password@public.invalid" },
    { ...env, PUBLIC_ORIGIN: "http://localhost:3001", NODE_ENV: "production" },
    { ...env, PORT: "3001oops" },
  ]) expect(() => loadConfig(invalid)).toThrow("configuration");
  expect(loadConfig(env)).toMatchObject({ port: 3001, tutorEnabled: false });
  expect(loadConfig({ ...env, TUTOR_ENABLED: "true" })).toMatchObject({ tutorEnabled: true });
  expect(() => loadConfig({ ...env, TUTOR_ENABLED: "yes" })).toThrow("configuration");
});

test("SQLite 开启 foreign_keys 与 busy_timeout，显式迁移幂等", async () => {
  const { openDatabase } = await import("../../src/server/db");
  const { createAuth } = await import("../../src/server/auth");
  const { migrate } = await import("../../src/server/migrate");
  const { loadConfig } = await import("../../src/server/config");
  const db = openDatabase(":memory:");
  resources.push({ close: () => { db.close(); } });
  expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
  expect(db.pragma("busy_timeout", { simple: true })).toBe(5000);
  const auth = createAuth(db, loadConfig(env));
  expect(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get()).toEqual({ n: 0 });
  await migrate(db, auth);
  const first = db.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  expect(first).toEqual([{ version: 1 }]);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session'").get()).toEqual({ name: "session" });
  await migrate(db, auth);
  expect(db.prepare("SELECT version FROM schema_migrations ORDER BY version").all()).toEqual(first);
});

test("持久 SQLite 使用 WAL，生产启动不自动修改 schema", async () => {
  const { openDatabase } = await import("../../src/server/db");
  const { loadConfig } = await import("../../src/server/config");
  const { startService } = await import("../../src/server/main");
  const directory = mkdtempSync(join(tmpdir(), "understanding-auth-test-"));
  resources.push({ close: () => { rmSync(directory, { recursive: true }); } });
  const path = join(directory, "db.sqlite");
  const db = openDatabase(path);
  try { expect(db.pragma("journal_mode", { simple: true })).toBe("wal"); } finally { db.close(); }
  await expect(startService(loadConfig({ ...env, DB_PATH: path }), new AbortController().signal)).rejects.toThrow();
  const check = new Database(path);
  try {
    expect(check.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type='table'").get()).toEqual({ n: 0 });
  } finally { check.close(); }
});

test("生产服务可启动并释放监听器和 SQLite，普通请求不会激活模型", async () => {
  const { openDatabase } = await import("../../src/server/db");
  const { createAuth } = await import("../../src/server/auth");
  const { migrate } = await import("../../src/server/migrate");
  const { loadConfig } = await import("../../src/server/config");
  const { startService } = await import("../../src/server/main");
  const directory = mkdtempSync(join(tmpdir(), "understanding-start-test-"));
  resources.push({ close: () => { rmSync(directory, { recursive: true }); } });
  const config = loadConfig({ ...env, DB_PATH: join(directory, "db.sqlite") });
  const db = openDatabase(config.dbPath);
  try { await migrate(db, createAuth(db, config)); } finally { db.close(); }
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("unexpected HTTP"));
  vi.stubGlobal("fetch", fetch);
  const service = await startService({ ...config, port: 0 }, new AbortController().signal);
  resources.push(service);
  const response = await request(service.server).get("/api/me");
  expect(response.status).toBe(401);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(fetch).not.toHaveBeenCalled();
  await service.close();
  resources.pop();
  expect(service.server.listening).toBe(false);
});

async function realAuth(publicOrigin = env.PUBLIC_ORIGIN) {
  const { openDatabase } = await import("../../src/server/db");
  const { createAuth, createUserResolver, toAuthHandler } = await import("../../src/server/auth");
  const { migrate } = await import("../../src/server/migrate");
  const { loadConfig } = await import("../../src/server/config");
  const deps = await testDependencies({ userId: null });
  deps.close();
  const db = openDatabase(":memory:");
  resources.push({ close: () => { db.close(); } });
  const config = loadConfig({ ...env, PUBLIC_ORIGIN: publicOrigin });
  const auth = createAuth(db, config);
  await migrate(db, auth);
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser({ name: "Test user", email: "test@example.invalid", emailVerified: true },
    { method: "oauth", oauth: { providerId: "github" } });
  const session = await context.internalAdapter.createSession(user.id, false);
  const cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${session.token}.${await makeSignature(session.token, env.BETTER_AUTH_SECRET)}`)}`;
  const app = createApp({ ...deps, db, publicOrigin, authHandler: toAuthHandler(auth), resolveUser: createUserResolver(auth) });
  return { app, auth, cookie, db, user, session };
}

test("真实 Better Auth 验证有效、篡改、过期和撤销的会话 cookie", async () => {
  const { app, cookie, db, user, session } = await realAuth();
  expect((await request(app).get("/api/me").set("Cookie", cookie)).body).toEqual({ id: user.id });
  expect((await request(app).get("/api/me").set("Cookie", `${cookie}tampered`)).status).toBe(401);
  db.prepare('UPDATE session SET expiresAt = ? WHERE id = ?').run(Date.now() - 1000, session.id);
  expect((await request(app).get("/api/me").set("Cookie", cookie)).status).toBe(401);
  expect((await request(app).get("/api/me").set("Cookie", "better-auth.session_token=not-a-session")).status).toBe(401);
});

test("退出登录清除 cookie 并使服务端会话失效", async () => {
  const { app, cookie, db, session } = await realAuth();
  const response = await request(app).post("/api/auth/sign-out")
    .set("Origin", env.PUBLIC_ORIGIN).set("Cookie", cookie).send({});
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ success: true });
  expect(String(response.headers["set-cookie"])).toContain("Max-Age=0");
  expect(String(response.headers["set-cookie"])).toContain("HttpOnly");
  expect(db.prepare("SELECT id FROM session WHERE id = ?").get(session.id)).toBeUndefined();
  expect((await request(app).get("/api/me").set("Cookie", cookie)).status).toBe(401);
});

test("Better Auth 拒绝跨站退出请求，HTTPS cookie 使用 Secure", async () => {
  const { app, cookie } = await realAuth("https://study.example.invalid");
  const rejected = await request(app).post("/api/auth/sign-out").set("Cookie", cookie)
    .set("Origin", "https://evil.invalid").send({});
  expect(rejected.status).toBe(403);
  const response = await request(app).post("/api/auth/sign-out").set("Cookie", cookie)
    .set("Origin", "https://study.example.invalid").send({});
  expect(response.status).toBe(200);
  expect(String(response.headers["set-cookie"])).toContain("Secure");
  expect(String(response.headers["set-cookie"])).not.toContain("Domain=");
});

test("GitHub 只申请身份/email scope，并绑定部署者的回调", async () => {
  const { app } = await realAuth();
  const response = await request(app).post("/api/auth/sign-in/social")
    .set("Origin", env.PUBLIC_ORIGIN).send({ provider: "github", callbackURL: "/", disableRedirect: true });
  expect(response.status).toBe(200);
  const url = new URL(response.body.url);
  expect(url.origin).toBe("https://github.com");
  expect(url.searchParams.get("scope")?.split(/[ ,]+/).sort()).toEqual(["read:user", "user:email"]);
  expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3001/api/auth/callback/github");
  expect(url.searchParams.get("state")).toBeTruthy();
});

test("默认或缺模型配置不会探测，也不能生成假 AI 成功", async () => {
  const { loadConfig } = await import("../../src/server/config");
  const { activateTutor } = await import("../../src/server/main");
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("unexpected network"));
  vi.stubGlobal("fetch", fetch);
  for (const config of [loadConfig(env), loadConfig({ ...env, TUTOR_ENABLED: "true" })]) {
    const provider = await activateTutor(config, new AbortController().signal);
    await expect(provider.generate({ system: "s", data: "d" }, new AbortController().signal)).rejects.toThrow("unavailable");
  }
  expect(fetch).not.toHaveBeenCalled();
});

test("显式启用只探测一次，普通请求不会重复激活", async () => {
  const { loadConfig } = await import("../../src/server/config");
  const { activateTutor } = await import("../../src/server/main");
  const output = { kind: "insufficient", claim: "", reason: "", nextAction: "summary", question: null, quotes: [], sources: [], metrics: [] };
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({
    id: "test", object: "chat.completion", created: 0, model: "test-model",
    choices: [{ index: 0, finish_reason: "stop", logprobs: null,
      message: { role: "assistant", content: JSON.stringify(output), refusal: null } }],
  }), { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  const provider = await activateTutor(loadConfig({ ...env, TUTOR_ENABLED: "true", TUTOR_MODEL: "test-model",
    OPENAI_API_KEY: "test-fake-key", OPENAI_BASE_URL: "https://mock-provider.invalid/v1" }), new AbortController().signal);
  expect(provider.model).toBe("test-model");
  const deps = await testDependencies({ userId: "user-a" }); resources.push(deps);
  const app = createApp({ ...deps, tutorProvider: provider });
  await request(app).get("/api/me");
  await request(app).get("/api/me");
  expect(fetch).toHaveBeenCalledTimes(1);
});

test("启用探测失败保持禁用，并只记录白名单事件", async () => {
  const { loadConfig } = await import("../../src/server/config");
  const { activateTutor } = await import("../../src/server/main");
  const log = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("PRIVATE-NETWORK-DETAIL")));
  const provider = await activateTutor(loadConfig({ ...env, TUTOR_ENABLED: "true", TUTOR_MODEL: "test-model",
    OPENAI_API_KEY: "test-fake-key", OPENAI_BASE_URL: "https://mock-provider.invalid/v1" }), new AbortController().signal);
  await expect(provider.generate({ system: "s", data: "d" }, new AbortController().signal)).rejects.toThrow("unavailable");
  expect(log.mock.calls).toEqual([[JSON.stringify({ event: "tutor-unavailable", reason: "provider" })]]);
});
import Database from "better-sqlite3";
