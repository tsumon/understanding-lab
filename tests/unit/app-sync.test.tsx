// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

test("returning to the same loaded App restores the latest draft rather than the module's original snapshot", async () => {
  const original = {
    session: newSession("current"), unconfirmedText: "进入课程目录前的旧草稿",
    exploration: { config: { seed: 17 as const, n: 40 as const, noise: 0.1 as const, degree: 3 }, frozen: null, revealed: false, contaminated: false },
    updatedAt: "2026-11-02T00:00:00.000Z",
  };
  expect(writeEnvelope("current", original)).toEqual({ ok: true });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => packJson }));
  const { App } = await import("../../src/client/App");
  const first = render(<App />);
  fireEvent.change(screen.getByRole("textbox", { name: "我的解释" }), { target: { value: "离开页面前刚修改的新草稿" } });
  fireEvent.change(screen.getByLabelText("我的笔记（最多 8000 字）"), { target: { value: "刚修改的本机笔记" } });
  first.unmount();
  // Hash navigation remounts the component without reloading its JavaScript module.
  render(<App />);
  expect(screen.getByRole("textbox", { name: "我的解释" })).toHaveProperty("value", "离开页面前刚修改的新草稿");
  expect(screen.getByLabelText("我的笔记（最多 8000 字）")).toHaveProperty("value", "刚修改的本机笔记");
  const stored = JSON.parse(localStorage.getItem("understanding-lab:v1:anonymous:current")!);
  expect(stored.unconfirmedText).toBe("离开页面前刚修改的新草稿");
  expect(stored.session.notes).toBe("刚修改的本机笔记");
});

test("remount detects a newly damaged draft without replacing its raw recovery data", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => packJson }));
  const { App } = await import("../../src/client/App");
  const first = render(<App />);
  first.unmount();
  const raw = "{synthetic damaged draft after leaving the lesson";
  localStorage.setItem("understanding-lab:v1:anonymous:current", raw);
  render(<App />);
  expect(screen.getByRole("button", { name: "导出损坏草稿" })).toBeTruthy();
  expect(localStorage.getItem("understanding-lab:v1:anonymous:current")).toBe(raw);
});
