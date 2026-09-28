// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import packJson from "../../public/experiments/overfitting.v1.json";
import { newSession } from "../../src/domain/contracts";
import { writeConflict, writeEnvelope } from "../../src/client/local-store";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.resetModules(); });

test("a stored conflict copy is still shown after the module reloads", async () => {
  const local = {
    session: newSession("current"),
    unconfirmedText: "本机未确认",
    exploration: { config: { seed: 17 as const, n: 40 as const, noise: 0.1 as const, degree: 3 }, frozen: null, revealed: false, contaminated: false },
    updatedAt: "2026-09-28T00:00:00.000Z",
  };
  const cloud = { session: { ...newSession("current"), notes: "云端版本" }, serverRevision: 2 };
  expect(writeEnvelope("current", local)).toEqual({ ok: true });
  expect(writeConflict("current", { local, cloud })).toEqual({ ok: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => packJson }));
  const { App } = await import("../../src/client/App");
  const first = render(<App />);
  expect(first.getByRole("heading", { name: "与账号中的版本冲突" })).toBeTruthy();
  expect(first.getByRole("button", { name: "导出本机副本" })).toBeTruthy();
  first.unmount();
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => packJson }));
  const { App: Reloaded } = await import("../../src/client/App");
  render(<Reloaded />);
  expect(screen.getByRole("heading", { name: "与账号中的版本冲突" })).toBeTruthy();
  expect(screen.getByText("本机完整草稿仍保留，没有自动覆盖。账号反馈若来自本机恢复，不能当作模型调用证明。可先导出本机副本，再决定载入账号版本，或另存为新尝试。")).toBeTruthy();
});
