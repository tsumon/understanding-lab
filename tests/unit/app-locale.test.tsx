// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import pack from "../../public/experiments/overfitting.v1.json";
import { newSession, type LearningSession } from "../../src/domain/contracts";
import { messages } from "../../src/client/i18n";

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); vi.resetModules(); vi.unstubAllGlobals(); });

test("switching an open draft changes the interface only and persists across remount", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "zh-CN");
  const fetch = vi.fn(async (_input: RequestInfo | URL) => ({ ok: true, json: async () => pack }));
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  const { unmount } = render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "开始学习" }));
  fireEvent.change(screen.getByRole("textbox", { name: "我的解释" }), { target: { value: "my original draft" } });
  const before = localStorage.getItem("understanding-lab:v1:anonymous:current");
  fireEvent.change(screen.getByRole("combobox", { name: "Language / 语言" }), { target: { value: "en" } });
  expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveProperty("value", "my original draft");
  expect(document.documentElement.lang).toBe("en");
  expect(localStorage.getItem("understanding-lab:v1:anonymous:current")).toBe(before);
  expect(fetch.mock.calls.some((call) => String(call[0]).includes("/api/"))).toBe(false);
  unmount();
  vi.resetModules();
  const { App: ReloadedApp } = await import("../../src/client/App");
  const { LocaleProvider: ReloadedProvider } = await import("../../src/client/LocaleProvider");
  render(<ReloadedProvider><ReloadedApp /></ReloadedProvider>);
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveProperty("value", "my original draft"));
});

test("English learning surfaces include material, chart, summary, and offline language", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => pack })));
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  expect(screen.getByRole("heading", { name: "Learning material" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Precomputed interactive experiment" })).toBeTruthy();
  expect(await screen.findByRole("img", { name: /Numerical chart/ })).toBeTruthy();
  expect(screen.getByText(messages.en.cacheUnknown)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Skip as unverified" }));
  expect(screen.getByRole("textbox", { name: "Your explanation" })).toBeTruthy();
});

test("summary renders a historical question in its recorded locale", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  const session: LearningSession = { ...newSession("current"), step: "summary", answers: [{
    id: "current:explain:1", revision: 1, step: "explain", questionId: "explain-1", questionLocale: "zh-CN",
    text: "Original answer", confirmedAt: "2026-01-01T00:00:00.000Z",
  }] };
  const { writeEnvelope } = await import("../../src/client/local-store");
  writeEnvelope("current", { session, exploration: { config: { seed: 17, n: 40, noise: 0.1, degree: 3 }, frozen: null, revealed: false, contaminated: false }, unconfirmedText: "", updatedAt: "2026-01-01T00:00:00.000Z" });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => pack })));
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  expect(screen.getByRole("heading", { name: "Attempt summary" })).toBeTruthy();
  expect(screen.getByText("Original answer")).toBeTruthy();
  expect(screen.getByText(/你怎样解释训练误差很低/)).toBeTruthy();
});

test("confirmed revisions record the current question language and a switch changes only the prompt", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "zh-CN");
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => pack })));
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "开始学习" }));
  fireEvent.change(screen.getByRole("textbox", { name: "我的解释" }), { target: { value: "original words" } });
  fireEvent.click(screen.getByRole("button", { name: "确认这段解释" }));
  const before = JSON.parse(localStorage.getItem("understanding-lab:v1:anonymous:current")!) as { session: LearningSession };
  expect(before.session.answers[0].questionLocale).toBe("zh-CN");
  fireEvent.change(screen.getByRole("combobox", { name: "Language / 语言" }), { target: { value: "en" } });
  expect(screen.getByText(/How would you explain very low training error/)).toBeTruthy();
  expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveProperty("value", "original words");
  const switched = JSON.parse(localStorage.getItem("understanding-lab:v1:anonymous:current")!) as { session: LearningSession };
  expect(switched.session).toEqual(before.session);
  fireEvent.click(screen.getByRole("button", { name: "Confirm this explanation" }));
  const after = JSON.parse(localStorage.getItem("understanding-lab:v1:anonymous:current")!) as { session: LearningSession };
  expect(after.session.answers.map((answer) => [answer.revision, answer.questionLocale])).toEqual([[1, "zh-CN"], [2, "en"]]);
});

test("an in-flight English tutor response survives a language switch with original prose and locale provenance", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  let identify: ((response: Response) => void) | undefined;
  let deliver: ((response: Response) => void) | undefined;
  let request: { requestId: string; session: LearningSession; locale: string } | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/experiments/")) return { ok: true, json: async () => pack } as Response;
    if (String(input).includes("/api/auth/get-session")) return new Promise<Response>((resolve) => { identify = resolve; });
    request = JSON.parse(String(init?.body));
    return new Promise<Response>((resolve) => { deliver = resolve; });
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  await waitFor(() => expect(identify).toBeTypeOf("function"));
  fireEvent.change(screen.getByRole("combobox", { name: "Language / 语言" }), { target: { value: "zh-CN" } });
  expect(screen.getByText("这次请求仍使用 English，不会因切换语言重新发送。")).toBeTruthy();
  identify!(Response.json({ user: { id: "alice" }, session: { id: "synthetic-session" } }));
  await waitFor(() => expect(request?.locale).toBe("en"));
  deliver!(new Response(JSON.stringify({ requestId: request!.requestId, contentRevision: request!.session.contentRevision,
    result: { status: "ok", output: { kind: "supported", claim: "Original English feedback", reason: "Evidence remains original", nextAction: "ask", question: "Why?", quotes: [], sources: [], metrics: [] }, model: "test-model", promptVersion: "overfitting-tutor-v2", evidenceLocale: "en", responseLocale: "en" } }), { status: 200, headers: { "content-type": "application/json" } }));
  await waitFor(() => {
    const raw = localStorage.getItem("understanding-lab:v1:owner:alice:current");
    expect(JSON.parse(raw ?? "{}").session?.feedback, screen.queryByRole("alert")?.textContent ?? "no alert").toHaveLength(1);
  });
  expect(await screen.findByText("Original English feedback")).toBeTruthy();
  expect(screen.getByText("反馈原语言：English；依据材料：English")).toBeTruthy();
  expect(document.documentElement.lang).toBe("zh-CN");
  const saved = JSON.parse(localStorage.getItem("understanding-lab:v1:owner:alice:current")!) as { session: LearningSession };
  expect(saved.session.feedback[0]).toMatchObject({ evidenceLocale: "en", responseLocale: "en" });
  expect(saved.session.feedback[0].output.claim).toBe("Original English feedback");
  expect(fetch.mock.calls.filter((call) => String(call[0]).includes("/api/tutor"))).toHaveLength(1);
});

test.each(["same-revision navigation", "content edit"])("a %s during tutor authentication never sends the stale request", async (change) => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  let resolveAuth!: (response: Response) => void;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/experiments/")) return Response.json(pack);
    if (String(input).includes("/api/auth/get-session")) return new Promise<Response>((resolve) => { resolveAuth = resolve; });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your explanation" }), { target: { value: "Original explanation" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm this explanation" }));
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  await waitFor(() => expect(resolveAuth).toBeTypeOf("function"));
  if (change === "same-revision navigation") fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  else fireEvent.change(screen.getByRole("textbox", { name: "Your explanation" }), { target: { value: "New explanation" } });
  await act(async () => resolveAuth(Response.json({ user: { id: "alice" }, session: { id: "synthetic-session" } })));
  expect(fetch.mock.calls.filter(([input]) => String(input).includes("/api/tutor"))).toHaveLength(0);
  expect(localStorage.getItem("understanding-lab:v1:owner:alice:current")).toBeNull();
  expect(screen.queryByText(/Current account alice/)).toBeNull();
});

test("sign-out during tutor authentication cannot restore the old account or send", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  let resolveTutorAuth!: (response: Response) => void;
  let authCalls = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/experiments/")) return Response.json(pack);
    if (String(input).includes("/api/auth/get-session")) {
      authCalls += 1;
      return authCalls === 1 ? Response.json({ user: { id: "alice" }, session: { id: "synthetic-session" } })
        : new Promise<Response>((resolve) => { resolveTutorAuth = resolve; });
    }
    if (String(input).includes("/api/sessions")) return Response.json({ sessions: [] });
    if (String(input).includes("/api/auth/sign-out")) return Response.json({ success: true });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Sign out" });
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  await waitFor(() => expect(resolveTutorAuth).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  await screen.findByRole("button", { name: "Sign in" });
  await act(async () => resolveTutorAuth(Response.json({ user: { id: "alice" }, session: { id: "synthetic-session" } })));
  expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
  expect(fetch.mock.calls.filter(([input]) => String(input).includes("/api/tutor"))).toHaveLength(0);
});

test("another account loaded during tutor authentication owns the draft and blocks the stale send", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  let resolveTutorAuth!: (response: Response) => void;
  let authCalls = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/experiments/")) return Response.json(pack);
    if (String(input).includes("/api/auth/get-session")) {
      authCalls += 1;
      return authCalls === 1 ? new Promise<Response>((resolve) => { resolveTutorAuth = resolve; })
        : Response.json({ user: { id: "bob" }, session: { id: "bob-session" } });
    }
    if (String(input).includes("/api/sessions")) return Response.json({ sessions: [] });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  await waitFor(() => expect(resolveTutorAuth).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("button", { name: "Sign out" });
  await act(async () => resolveTutorAuth(Response.json({ user: { id: "alice" }, session: { id: "old-session" } })));
  expect(screen.getByText(/Current account bob/)).toBeTruthy();
  expect(localStorage.getItem("understanding-lab:v1:owner:alice:current")).toBeNull();
  expect(fetch.mock.calls.filter(([input]) => String(input).includes("/api/tutor"))).toHaveLength(0);
});

test("a changed authenticated account cannot send the captured account's tutor session", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  let resolveTutorAuth!: (response: Response) => void;
  let authCalls = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/experiments/")) return Response.json(pack);
    if (String(input).includes("/api/auth/get-session")) {
      authCalls += 1;
      return authCalls === 1 ? Response.json({ user: { id: "alice" }, session: { id: "alice-session" } })
        : new Promise<Response>((resolve) => { resolveTutorAuth = resolve; });
    }
    if (String(input).includes("/api/sessions")) return Response.json({ sessions: [] });
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByText("Current account alice");
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  await waitFor(() => expect(resolveTutorAuth).toBeTypeOf("function"));
  await act(async () => resolveTutorAuth(Response.json({ user: { id: "bob" }, session: { id: "bob-session" } })));
  expect(screen.getByText("Current account alice")).toBeTruthy();
  expect(fetch.mock.calls.filter(([input]) => String(input).includes("/api/tutor"))).toHaveLength(0);
});

test("loading another session with the same id and revision cancels tutor authentication", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  const { writeEnvelope } = await import("../../src/client/local-store");
  writeEnvelope("current", { session: newSession("current"),
    exploration: { config: { seed: 17, n: 40, noise: 0.1, degree: 3 }, frozen: null, revealed: false, contaminated: false },
    unconfirmedText: "Alice's owner draft", updatedAt: "2026-10-07T00:00:00Z" }, "alice");
  let resolveTutorAuth!: (response: Response) => void;
  let authCalls = 0;
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/experiments/")) return Response.json(pack);
    if (String(input).includes("/api/auth/get-session")) {
      authCalls += 1;
      return authCalls === 1 ? new Promise<Response>((resolve) => { resolveTutorAuth = resolve; })
        : Response.json({ user: { id: "alice" }, session: { id: "new-session" } });
    }
    throw new Error(`Unexpected request: ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  await waitFor(() => expect(resolveTutorAuth).toBeTypeOf("function"));
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveProperty("value", "Alice's owner draft"));
  await act(async () => resolveTutorAuth(Response.json({ user: { id: "alice" }, session: { id: "old-session" } })));
  expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveProperty("value", "Alice's owner draft");
  expect(fetch.mock.calls.filter(([input]) => String(input).includes("/api/tutor"))).toHaveLength(0);
});

test("a language-only switch preserves owner drafts, pending identity, exploration, and consent without saving", async () => {
  const { prepareSave } = await import("../../src/client/sync");
  const { writeEnvelope, readEnvelope } = await import("../../src/client/local-store");
  const binding = { ownerId: "alice", id: "owned-attempt", serverRevision: 4 };
  const session = { ...newSession(binding.id), notes: "Original private notes" };
  const pending = prepareSave(session, binding, null, () => "same-retry-key").pending;
  const config = { seed: 17 as const, n: 40 as const, noise: 0.1 as const, degree: 11 };
  writeEnvelope("current", { session, binding, pendingSave: pending, autoSave: true,
    drafts: { explain: "Unsaved original words" }, unconfirmedText: "Unsaved original words",
    exploration: { config, frozen: config, revealed: true, contaminated: true }, updatedAt: "2026-10-03T00:00:00Z" }, "alice");
  localStorage.setItem("understanding-lab:ui-locale", "en");
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("/experiments/")) return Response.json(pack);
    if (String(input).includes("/api/auth/get-session")) return Response.json({ user: { id: "alice" }, session: { id: "synthetic-session" } });
    throw new Error("Unexpected request");
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await screen.findByRole("textbox", { name: "Your explanation" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Include private notes for the model" }));
  const raw = localStorage.getItem("understanding-lab:v1:owner:alice:current");
  const calls = fetch.mock.calls.length;
  vi.useFakeTimers();
  fireEvent.change(screen.getByRole("combobox", { name: "Language / 语言" }), { target: { value: "zh-CN" } });
  expect(screen.getByRole("textbox", { name: "我的解释" })).toHaveProperty("value", "Unsaved original words");
  expect(screen.getByRole("textbox", { name: "我的笔记（最多 8000 字）" })).toHaveProperty("value", session.notes);
  expect(screen.getByRole("combobox", { name: "多项式阶数" })).toHaveProperty("value", "11");
  expect(screen.getByRole("checkbox", { name: "把私人笔记一并发送给模型" })).toHaveProperty("checked", true);
  expect(localStorage.getItem("understanding-lab:v1:owner:alice:current")).toBe(raw);
  expect(readEnvelope("current", "alice")?.pendingSave).toEqual(pending);
  await act(() => vi.advanceTimersByTimeAsync(1000));
  expect(fetch.mock.calls).toHaveLength(calls);
});

test("blocked storage still allows an in-memory switch and retained text", async () => {
  vi.spyOn(navigator, "languages", "get").mockReturnValue(["en-US"]);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("blocked", "SecurityError"); });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(pack)));
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Your explanation" }), { target: { value: "Still in memory" } });
  fireEvent.change(screen.getByRole("combobox", { name: "Language / 语言" }), { target: { value: "zh-CN" } });
  expect(document.documentElement.lang).toBe("zh-CN");
  expect(screen.getByRole("textbox", { name: "我的解释" })).toHaveProperty("value", "Still in memory");
  expect(screen.getByRole("alert").textContent).toContain("本机存储不可用");
});
