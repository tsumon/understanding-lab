// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import pack from "../../public/experiments/overfitting.v1.json";
import { newSession, type LearningSession } from "../../src/domain/contracts";
import { messages } from "../../src/client/i18n";

const auth = vi.hoisted(() => ({ getSignedInUser: vi.fn(async (): Promise<{ id: string } | null> => null) }));
vi.mock("../../src/client/auth-client", () => ({
  getSignedInUser: auth.getSignedInUser,
  signInWithGitHub: vi.fn(), signOut: vi.fn(),
}));

afterEach(() => { cleanup(); localStorage.clear(); vi.resetModules(); vi.unstubAllGlobals(); auth.getSignedInUser.mockResolvedValue(null); });

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
  auth.getSignedInUser.mockResolvedValue({ id: "alice" });
  let deliver: ((response: Response) => void) | undefined;
  let request: { requestId: string; session: LearningSession; locale: string } | undefined;
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("/experiments/")) return { ok: true, json: async () => pack } as Response;
    request = JSON.parse(String(init?.body));
    return new Promise<Response>((resolve) => { deliver = resolve; });
  });
  vi.stubGlobal("fetch", fetch);
  const { App } = await import("../../src/client/App");
  const { LocaleProvider } = await import("../../src/client/LocaleProvider");
  render(<LocaleProvider><App /></LocaleProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Start learning" }));
  fireEvent.click(screen.getByRole("button", { name: "Send to AI" }));
  await waitFor(() => expect(request?.locale).toBe("en"));
  fireEvent.change(screen.getByRole("combobox", { name: "Language / 语言" }), { target: { value: "zh-CN" } });
  deliver!(new Response(JSON.stringify({ requestId: request!.requestId, contentRevision: request!.session.contentRevision,
    result: { status: "ok", output: { kind: "supported", claim: "Original English feedback", reason: "Evidence remains original", nextAction: "ask", question: "Why?", quotes: [], sources: [], metrics: [] }, model: "test-model", promptVersion: "overfitting-tutor-v2", evidenceLocale: "en", responseLocale: "en" } }), { status: 200, headers: { "content-type": "application/json" } }));
  await waitFor(() => {
    const raw = localStorage.getItem("understanding-lab:v1:owner:alice:current");
    expect(JSON.parse(raw ?? "{}").session?.feedback, screen.queryByRole("alert")?.textContent ?? "no alert").toHaveLength(1);
  });
  expect(await screen.findByText("Original English feedback")).toBeTruthy();
  expect(document.documentElement.lang).toBe("zh-CN");
  const saved = JSON.parse(localStorage.getItem("understanding-lab:v1:owner:alice:current")!) as { session: LearningSession };
  expect(saved.session.feedback[0]).toMatchObject({ evidenceLocale: "en", responseLocale: "en" });
  expect(saved.session.feedback[0].output.claim).toBe("Original English feedback");
  expect(fetch.mock.calls.filter((call) => String(call[0]).includes("/api/tutor"))).toHaveLength(1);
});
