import request from "supertest";
import { afterEach, expect, test } from "vitest";
import { createApp } from "../../src/server/app";
import { testDependencies } from "../helpers/server";

const resources: Array<{ close(): void }> = [];
afterEach(() => { resources.splice(0).forEach((resource) => resource.close()); });

async function dependencies(userId: string | null) {
  const deps = await testDependencies({ userId });
  resources.push(deps);
  return deps;
}

test("未登录不能进入账号数据接口", async () => {
  const deps = await dependencies(null);
  const response = await request(createApp(deps)).get("/api/me");
  expect(response.status).toBe(401);
});

test("有效身份只返回本进程解析的用户", async () => {
  const response = await request(createApp(await dependencies("user-a"))).get("/api/me");
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ id: "user-a" });
  expect(response.headers["cache-control"]).toBe("no-store");
});

test("请求头与查询参数不能注入测试身份", async () => {
  const response = await request(createApp(await dependencies(null)))
    .get("/api/me?userId=user-a&testUser=user-a").set("X-Test-User", "user-a");
  expect(response.status).toBe(401);
});

test.each([undefined, "https://other.invalid", "null", "http://localhost:3001.evil.invalid"])
("自有写 API 拒绝不匹配的 Origin %s", async (origin) => {
  let pending = request(createApp(await dependencies("user-a"))).post("/api/me");
  if (origin !== undefined) pending = pending.set("Origin", origin);
  const response = await pending.send({ text: "private" });
  expect(response.status).toBe(403);
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["access-control-allow-origin"]).toBeUndefined();
});

test("账号接口的 JSON 超过 128kb 返回 413", async () => {
  const response = await request(createApp(await dependencies("user-a"))).post("/api/me")
    .set("Origin", "http://localhost:3001").send({ text: "x".repeat(128 * 1024) });
  expect(response.status).toBe(413);
  expect(response.body).toEqual({ error: "body-too-large" });
});

test("身份与 Origin 检查先于 JSON 解析", async () => {
  const response = await request(createApp(await dependencies(null))).post("/api/me")
    .set("Origin", "http://localhost:3001").send({ text: "x".repeat(128 * 1024) });
  expect(response.status).toBe(401);
});

test("未挂载的未来路由没有全局 128kb 限制", async () => {
  const response = await request(createApp(await dependencies("user-a"))).post("/api/unused")
    .set("Origin", "http://localhost:3001").send({ text: "x".repeat(200 * 1024) });
  expect(response.status).toBe(404);
});

test("API 错误不反射输入，所有响应使用 Helmet 与 no-store", async () => {
  const deps = await dependencies("user-a");
  deps.resolveUser = async () => { throw new Error("PRIVATE-ERROR-DETAIL"); };
  const response = await request(createApp(deps)).get("/api/me");
  expect(response.status).toBe(500);
  expect(response.body).toEqual({ error: "internal-error" });
  expect(response.text).not.toContain("PRIVATE-ERROR-DETAIL");
  expect(response.headers["cache-control"]).toBe("no-store");
  expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
  expect(response.headers["x-content-type-options"]).toBe("nosniff");
});

test("认证处理器在 JSON body parser 之前接收原始流", async () => {
  const deps = await dependencies(null);
  deps.authHandler = (req, res) => {
    expect(req.body).toBeUndefined();
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => { body += chunk; });
    req.on("end", () => res.json({ raw: body }));
  };
  const response = await request(createApp(deps)).post("/api/auth/fixture").send({ value: "raw-stream" });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ raw: '{"value":"raw-stream"}' });
});
