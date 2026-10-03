// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import pack from "../../public/experiments/overfitting.v1.json";

afterEach(() => { cleanup(); localStorage.clear(); vi.resetModules(); vi.unstubAllGlobals(); });

test("switching an open draft changes the interface only and persists across remount", async () => {
  localStorage.setItem("understanding-lab:ui-locale", "zh-CN");
  const fetch = vi.fn(async () => ({ ok: true, json: async () => pack }));
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
