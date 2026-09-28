// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

test("导入登录辅助模块不产生网络请求，匿名离线应用仍可加载", async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  await import("../../src/client/auth-client");
  expect(fetch).not.toHaveBeenCalled();
});

test("显式登录仅向同源 GitHub 认证端点发送请求", async () => {
  const captured: Array<{ url: string; init: RequestInit | undefined }> = [];
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (input, init) => {
    captured.push({ url: String(input), init });
    return new Response(JSON.stringify({ url: "https://github.com/login/oauth/authorize", redirect: false }), {
      headers: { "Content-Type": "application/json" },
    });
  }));
  const { signInWithGitHub } = await import("../../src/client/auth-client");
  await signInWithGitHub();
  expect(captured).toHaveLength(1);
  expect(captured[0].url).toBe(`${window.location.origin}/api/auth/sign-in/social`);
  expect(captured[0].init?.credentials).toBe("same-origin");
  expect(JSON.parse(captured[0].init?.body as string)).toEqual({ provider: "github", callbackURL: "/" });
});

test("会话辅助函数只公开用户 id，退出由成熟客户端处理", async () => {
  const urls: string[] = [];
  const session = {
    user: { id: "user-a", name: "Test user", email: "test@example.invalid", emailVerified: true,
      createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z" },
    session: { id: "session-a", userId: "user-a", token: "private-session-token",
      expiresAt: "2026-10-01T00:00:00Z", createdAt: "2026-09-26T00:00:00Z", updatedAt: "2026-09-26T00:00:00Z" },
  };
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>(async (input) => {
    urls.push(String(input));
    return new Response(JSON.stringify(urls.length === 1 ? session : { success: true }), {
      headers: { "Content-Type": "application/json" },
    });
  }));
  const { getSignedInUser, signOut } = await import("../../src/client/auth-client");
  expect(await getSignedInUser()).toEqual({ id: "user-a" });
  await signOut();
  expect(urls).toEqual([`${window.location.origin}/api/auth/get-session`, `${window.location.origin}/api/auth/sign-out`]);
});

test("认证辅助函数不暴露供应商原始错误", async () => {
  vi.stubGlobal("fetch", vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(
    JSON.stringify({ message: "PRIVATE-AUTH-DETAIL" }), { status: 500, headers: { "Content-Type": "application/json" } },
  )));
  const { getSignedInUser } = await import("../../src/client/auth-client");
  await expect(getSignedInUser()).rejects.toThrow("auth-unavailable");
});
