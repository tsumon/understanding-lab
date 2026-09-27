// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import packJson from "../../public/experiments/overfitting.v1.json";
import { newSession, type StoredFeedback } from "../../src/domain/contracts";
import { writeEnvelope } from "../../src/client/local-store";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

test("App shows stored current and historical feedback and opens the exact cited revision", async () => {
  const old = { id: "a1", revision: 1, step: "explain" as const, questionId: "explain-1", text: "旧回答", confirmedAt: "2026-09-26T00:00:00Z" };
  const latest = { ...old, revision: 2, text: "新版回答" };
  const feedback = (id: string, contentRevision: number, claim: string, revision: number, text: string): StoredFeedback => ({
    id, contentRevision, model: "test", promptVersion: "v1", createdAt: "2026-09-26T00:00:00Z",
    output: { kind: "supported", claim, reason: "有依据", nextAction: "ask", question: "为什么？",
      quotes: [{ answerId: "a1", answerRevision: revision, start: 0, end: text.length, text }],
      sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1" }], metrics: [] },
  });
  const session = { ...newSession("current"), contentRevision: 2, answers: [old, latest],
    feedback: [feedback("f-old", 1, "历史反馈", 1, old.text), feedback("f-new", 2, "当前反馈", 2, latest.text)] };
  expect(writeEnvelope("current", { session, exploration: { config: { seed: 17, n: 40, noise: 0.1, degree: 3 }, frozen: null, revealed: false, contaminated: false }, unconfirmedText: "", updatedAt: "2026-09-26T00:00:00Z" })).toEqual({ ok: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => packJson }));
  const { App } = await import("../../src/client/App");
  render(<App />);
  expect(screen.getByText("当前反馈")).toBeTruthy();
  fireEvent.click(screen.getByText(/过期的历史反馈/));
  expect(screen.getByText("历史反馈")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "查看第 1 版原话" }));
  expect(screen.getByRole("heading", { name: /第 1 版回答/ })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "引用的回答版本" })).getByText("旧回答")).toBeTruthy();
});
