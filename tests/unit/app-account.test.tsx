// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import packJson from "../../public/experiments/overfitting.v1.json";
import { newSession } from "../../src/domain/contracts";
import { draftStorageKey, writeEnvelope } from "../../src/client/local-store";

const auth = vi.hoisted(() => ({
  getSignedInUser: vi.fn(async (): Promise<{ id: string } | null> => null),
  signInWithGitHub: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("../../src/client/auth-client", () => auth);

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
  auth.getSignedInUser.mockReset();
  auth.signInWithGitHub.mockReset();
  auth.signOut.mockReset();
  auth.getSignedInUser.mockResolvedValue(null);
  auth.signInWithGitHub.mockResolvedValue(undefined);
  auth.signOut.mockResolvedValue(undefined);
});

const exploration = { config: { seed: 17 as const, n: 40 as const, noise: 0.1 as const, degree: 3 }, frozen: null, revealed: false, contaminated: false };
const tutorOutput = {
  kind: "supported" as const, claim: "服务端模型给出的判断", reason: "有依据", nextAction: "ask" as const,
  question: "哪份数据？", quotes: [], sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1" }], metrics: [],
};

function envelope(notes: string, extra: Record<string, unknown> = {}) {
  return { session: { ...newSession("current"), notes }, unconfirmedText: "", exploration, updatedAt: "2026-09-28T00:00:00.000Z", ...extra };
}

function fetchStub(handler?: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/experiments/")) return { ok: true, json: async () => packJson } as Response;
    if (handler) return handler(url, init);
    return new Response("", { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

test("login identifies the user id and does not upload drafts or call tutor", async () => {
  expect(writeEnvelope("current", envelope("匿名笔记"))).toEqual({ ok: true });
  const fetch = fetchStub();
  auth.getSignedInUser.mockResolvedValue(null);
  const { App } = await import("../../src/client/App");
  render(<App />);
  const login = await screen.findByRole("button", { name: "登录" });
  auth.getSignedInUser.mockResolvedValue({ id: "alice" });
  fireEvent.click(login);
  await screen.findByText("当前账号 alice");
  expect(auth.signInWithGitHub).not.toHaveBeenCalled();
  expect(fetch.mock.calls.every((call) => !String(call[0]).includes("/api/sessions") && !String(call[0]).includes("/api/tutor"))).toBe(true);
  expect(screen.queryByText("alice@example.invalid")).toBeNull();
  expect(screen.queryByText(/@/)).toBeNull();
  expect(screen.getByLabelText("我的笔记（最多 8000 字）")).toHaveProperty("value", "匿名笔记");
});

test("保存到账号 does not call tutor; 发送给 AI uses sendConsent and default includeNotes false", async () => {
  expect(writeEnvelope("current", envelope("秘密笔记"))).toEqual({ ok: true });
  const bodies: unknown[] = [];
  const fetch = fetchStub((url, init) => {
    if (url.includes("/api/sessions/")) {
      const sent = JSON.parse(String(init?.body ?? "{}")) as { session?: ReturnType<typeof newSession> };
      return new Response(JSON.stringify({ session: sent.session ?? newSession("attempt-1"), serverRevision: 1 }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/api/tutor")) {
      bodies.push(JSON.parse(String(init?.body)));
      const requestId = (bodies.at(-1) as { requestId: string }).requestId;
      return new Response(JSON.stringify({
        requestId, contentRevision: 0,
        result: { status: "ok", output: tutorOutput, model: "server-model", promptVersion: "overfitting-tutor-v1" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("", { status: 404 });
  });
  auth.getSignedInUser.mockResolvedValue({ id: "alice" });
  const { App } = await import("../../src/client/App");
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "保存到账号" }));
  await screen.findByText("已同步到账号");
  expect(fetch.mock.calls.some((call) => String(call[0]).includes("/api/sessions/"))).toBe(true);
  expect(fetch.mock.calls.some((call) => String(call[0]).includes("/api/tutor"))).toBe(false);
  expect((screen.getByLabelText("把私人笔记一并发送给模型") as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "发送给 AI" }));
  await screen.findByText("服务端模型给出的判断");
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ sendConsent: true, includeNotes: false });
  expect((bodies[0] as { session: { notes: string } }).session.notes).toBe("");
  expect(screen.queryByText("client-claimed-model")).toBeNull();
});

test("429 is shown as quota, not as a learning-step judgment", async () => {
  expect(writeEnvelope("current", envelope(""))).toEqual({ ok: true });
  fetchStub((url) => {
    if (url.includes("/api/tutor")) return new Response("", { status: 429 });
    return new Response("", { status: 404 });
  });
  auth.getSignedInUser.mockResolvedValue({ id: "alice" });
  const { App } = await import("../../src/client/App");
  render(<App />);
  fireEvent.click(screen.getByRole("button", { name: "发送给 AI" }));
  await screen.findByText(/今日教学次数已用完/);
  expect(screen.queryByText("服务端模型给出的判断")).toBeNull();
  expect(screen.queryByRole("region", { name: "教学反馈" })).toBeNull();
});

test("sign-out clears the owner cache and pending queue but keeps the anonymous draft", async () => {
  expect(writeEnvelope("current", envelope("匿名笔记"))).toEqual({ ok: true });
  expect(writeEnvelope("current", {
    ...envelope("账号笔记"),
    binding: { ownerId: "alice", id: "attempt-1", serverRevision: 2 },
    pendingSave: { id: "attempt-1", key: "k1", hash: "h1" },
  }, "alice")).toEqual({ ok: true });
  fetchStub();
  auth.getSignedInUser.mockResolvedValue({ id: "alice" });
  const { App } = await import("../../src/client/App");
  render(<App />);
  fireEvent.click(await screen.findByRole("button", { name: "登录" }));
  await screen.findByText("当前账号 alice");
  await waitFor(() => expect((screen.getByLabelText("我的笔记（最多 8000 字）") as HTMLTextAreaElement).value).toBe("账号笔记"));
  fireEvent.click(screen.getByRole("button", { name: "退出登录" }));
  fireEvent.click(await screen.findByRole("button", { name: "仍要退出" }));
  await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
  expect(localStorage.getItem(draftStorageKey("current", "alice"))).toBeNull();
  expect(JSON.parse(localStorage.getItem(draftStorageKey("current"))!).session.notes).toBe("匿名笔记");
  await waitFor(() => expect((screen.getByLabelText("我的笔记（最多 8000 字）") as HTMLTextAreaElement).value).toBe("匿名笔记"));
  expect(screen.queryByText("当前账号 alice")).toBeNull();
  expect(screen.getByRole("button", { name: "登录" })).toBeTruthy();
});
