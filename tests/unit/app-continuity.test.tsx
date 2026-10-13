// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import packJson from "../../public/experiments/overfitting.v1.json";
import { newSession } from "../../src/domain/contracts";
import { draftStorageKey, writeEnvelope } from "../../src/client/local-store";
import { topicFor } from "../../src/content/topics";

const auth = vi.hoisted(() => ({ getSignedInUser: vi.fn(), signInWithGitHub: vi.fn(), signOut: vi.fn() }));
vi.mock("../../src/client/auth-client", () => auth);

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.resetModules(); auth.getSignedInUser.mockReset(); });

const exploration = { config: { seed: 17 as const, n: 40 as const, noise: 0.1 as const, degree: 3 }, frozen: null, revealed: false, contaminated: false };
function seed(session = newSession("current")) {
  writeEnvelope("current", { session, exploration, unconfirmedText: "", updatedAt: "2026-10-01T00:00:00Z" });
}
async function mount() {
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  const { App } = await import("../../src/client/App");
  return render(<LocaleProvider><App /></LocaleProvider>);
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

test("language switching preserves the full pending draft and consent, persists preference, and sends nothing", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "zh-CN");
  const session = { ...newSession("attempt-1"), notes: "original notes" };
  const exploration = { config: { seed: 17 as const, n: 40 as const, noise: 0.1 as const, degree: 8 }, frozen: null, revealed: false, contaminated: false };
  writeEnvelope("current", { session, exploration, unconfirmedText: "my original draft", drafts: { explain: "my original draft" }, pendingSave: { id: "attempt-1", key: "same-key", hash: "same-hash" }, updatedAt: "2026-10-01T00:00:00Z" });
  const fetch = vi.fn(async () => ({ ok: true, json: async () => packJson }));
  vi.stubGlobal("fetch", fetch);
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  const { App } = await import("../../src/client/App");
  const mounted = render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByLabelText("把私人笔记一并发送给模型"));
  await waitFor(() => expect(screen.getByText("拟合曲线")).toBeTruthy());
  const before = localStorage.getItem(draftStorageKey("current"));
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "en" } });
  expect(document.documentElement.lang).toBe("en");
  expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveProperty("value", "my original draft");
  expect(screen.getByLabelText("Include private notes for the model")).toHaveProperty("checked", true);
  expect(screen.getByLabelText("Polynomial degree")).toHaveProperty("value", "8");
  expect(localStorage.getItem(draftStorageKey("current"))).toBe(before);
  expect(fetch.mock.calls).toHaveLength(1);
  fireEvent.change(screen.getByRole("textbox", { name: "Your explanation" }), { target: { value: "edited after switching" } });
  mounted.unmount();
  render(<LocaleProvider><App /></LocaleProvider>);
  expect(screen.getByLabelText("Language / 语言")).toHaveProperty("value", "en");
  expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveProperty("value", "edited after switching");
});

test("new revisions stamp the displayed language without migrating old answers", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  const old = { id: "a1", revision: 1, step: "explain" as const, questionId: "explain-1", text: "原来的解释", confirmedAt: "2026-10-01T00:00:00Z" };
  seed({ ...newSession("current"), answers: [old], contentRevision: 1 });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => packJson })));
  await mount();
  expect(screen.getByText(topicFor("overfitting.v1", "en").questions[0].text)).toBeTruthy();
  fireEvent.change(screen.getByRole("textbox", { name: "Your explanation" }), { target: { value: "New original answer" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm this explanation" }));
  const stored = JSON.parse(localStorage.getItem(draftStorageKey("current"))!);
  expect(stored.session.answers).toEqual([old, expect.objectContaining({ id: "a1", revision: 2, text: "New original answer", questionLocale: "en" })]);
  const before = JSON.stringify(stored.session);
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "zh-CN" } });
  expect(JSON.stringify(JSON.parse(localStorage.getItem(draftStorageKey("current"))!).session)).toBe(before);
});

test("a language switch during authentication and model response sends once in the captured language", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  seed();
  const authentication = deferred<{ id: string }>();
  const response = deferred<Response>();
  auth.getSignedInUser.mockReturnValue(authentication.promise);
  const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/experiments/")
    ? new Response(JSON.stringify(packJson), { status: 200 }) : response.promise);
  vi.stubGlobal("fetch", fetch);
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "zh-CN" } });
  expect(screen.getByText(/这次请求仍使用 English/)).toBeTruthy();
  await act(async () => { authentication.resolve({ id: "alice" }); });
  await waitFor(() => expect(fetch.mock.calls.some(([url]) => url === "/api/tutor")).toBe(true));
  const requests = fetch.mock.calls.filter(([url]) => url === "/api/tutor");
  const init = (requests[0] as unknown as [string, RequestInit])[1];
  const body = JSON.parse(String(init.body));
  expect(body.locale).toBe("en");
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "en" } });
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "zh-CN" } });
  expect(init.signal?.aborted).toBe(false);
  await act(async () => response.resolve(new Response(JSON.stringify({
    requestId: body.requestId, contentRevision: body.session.contentRevision,
    result: { status: "ok", model: "synthetic", promptVersion: "overfitting-tutor-v2", evidenceLocale: "en", responseLocale: "en",
      output: { kind: "supported", claim: "Original English feedback", reason: "Synthetic explanation", nextAction: "ask", question: "Which split?",
        quotes: [], sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1" }], metrics: [] } },
  }), { status: 200 })));
  expect(await screen.findByText("Original English feedback")).toHaveProperty("lang", "en");
  expect(fetch.mock.calls.filter(([url]) => url === "/api/tutor")).toHaveLength(1);
  const saved = JSON.parse(localStorage.getItem(draftStorageKey("current", "alice"))!);
  expect(saved.session.feedback[0]).toMatchObject({ evidenceLocale: "en", responseLocale: "en" });
  expect(screen.getByText(topicFor("overfitting.v1", "en").paragraphs[1].text).getAttribute("lang")).toBe("en");
});

test("historical questions and feedback sources keep their original edition in an English interface", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  const answer = { id: "a1", revision: 1, step: "explain" as const, questionId: "explain-1", text: "我的原话", confirmedAt: "2026-10-01T00:00:00Z" };
  const session = { ...newSession("current"), step: "summary" as const, answers: [answer],
    feedback: [{ id: "f1", contentRevision: 0, model: "synthetic", promptVersion: "v1", createdAt: "2026-10-01T00:00:00Z",
      output: { kind: "supported" as const, claim: "原始反馈", reason: "原始依据", nextAction: "ask" as const, question: "哪份数据？",
        quotes: [{ answerId: "a1", answerRevision: 1, start: 0, end: 4, text: "我的原话" }],
        sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1" }], metrics: [] } }] };
  seed(session);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => packJson })));
  await mount();
  const summary = screen.getByRole("region", { name: "Attempt summary" });
  expect(within(summary).getByText(topicFor("overfitting.v1", "zh-CN").questions[0].text).lang).toBe("zh-CN");
  expect(within(summary).getByText("我的原话")).toBeTruthy();
  const feedback = screen.getByRole("region", { name: "Tutoring feedback" });
  expect(within(feedback).getByText("原始反馈").lang).toBe("zh-CN");
  expect(within(feedback).getByText(topicFor("overfitting.v1", "zh-CN").paragraphs[1].text).lang).toBe("zh-CN");
  expect(within(feedback).queryByText(topicFor("overfitting.v1", "en").paragraphs[1].text)).toBeNull();
});

test("blocked preference storage still permits in-memory switching and localized action errors", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => packJson })));
  await mount();
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "en" } });
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
  expect(screen.getByText("Write an explanation first, or choose Skip.")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "zh-CN" } });
  expect(screen.getByText("请先写下解释，或选择跳过。")).toBeTruthy();
  expect(screen.getByText(/本机存储不可用/)).toBeTruthy();
});

test("navigation while authentication is pending prevents a stale tutor request", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  seed();
  const authentication = deferred<{ id: string }>();
  auth.getSignedInUser.mockReturnValue(authentication.promise);
  const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/experiments/")
    ? new Response(JSON.stringify(packJson), { status: 200 }) : new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  await mount();
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  fireEvent.click(screen.getByRole("button", { name: "Skip as unverified" }));
  await act(async () => { authentication.resolve({ id: "alice" }); });
  expect(fetch.mock.calls.filter(([url]) => url === "/api/tutor")).toHaveLength(0);
  expect(screen.queryByText(/Requesting tutoring feedback/)).toBeNull();
});

test("unmounting while authentication is pending cancels the tutor operation", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  seed();
  const authentication = deferred<{ id: string }>();
  auth.getSignedInUser.mockReturnValue(authentication.promise);
  const fetch = vi.fn(async (input: RequestInfo | URL) => String(input).includes("/experiments/")
    ? new Response(JSON.stringify(packJson), { status: 200 }) : new Response("", { status: 503 }));
  vi.stubGlobal("fetch", fetch);
  const mounted = await mount();
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  mounted.unmount();
  await act(async () => { authentication.resolve({ id: "alice" }); });
  expect(fetch.mock.calls.filter(([url]) => url === "/api/tutor")).toHaveLength(0);
});

test("a historical tutor question uses feedback provenance when the answer has no locale field", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "zh-CN");
  seed({ ...newSession("current"), step: "summary", answers: [{
    id: "a1", revision: 1, step: "clarify", clarificationRound: 1,
    questionId: "tutor:f1", text: "My original words", confirmedAt: "2026-10-01T00:00:00Z",
  }], feedback: [{
    id: "f1", contentRevision: 0, model: "synthetic", promptVersion: "overfitting-tutor-v2",
    evidenceLocale: "en", responseLocale: "en", createdAt: "2026-10-01T00:00:00Z",
    output: { kind: "supported", claim: "Original English feedback", reason: "Synthetic explanation",
      nextAction: "ask", question: "Which data split?", quotes: [], sources: [], metrics: [] },
  }] });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(packJson)));
  await mount();
  const summary = screen.getByRole("region", { name: "本次小结" });
  expect(within(summary).getByText("Which data split?").lang).toBe("en");
  expect(within(summary).getByText("My original words")).toBeTruthy();
});

test("experiment failures show localized status without raw exception details", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  seed();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("PRIVATE_PARSER_DETAILS"); }));
  await mount();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toBe("Could not load experiment data: Unknown error");
  fireEvent.change(screen.getByLabelText("Language / 语言"), { target: { value: "zh-CN" } });
  expect(alert.textContent).toBe("实验数据读取失败：未知错误");
  expect(screen.queryByText(/PRIVATE_PARSER_DETAILS/)).toBeNull();
});
