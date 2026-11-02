// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { OfflineStatus } from "../../src/client/OfflineStatus";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("offers an explicit refresh action when a waiting worker is present", async () => {
  const waiting = { state: "installed", postMessage: vi.fn() };
  const registration = {
    waiting,
    installing: null,
    addEventListener: vi.fn(),
    active: { postMessage: vi.fn() },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      controller: {},
    },
  });
  render(<OfflineStatus enabled />);
  const button = await screen.findByRole("button", { name: "有更新，刷新使用" });
  fireEvent.click(button);
  expect(waiting.postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_UPDATE" });
});

test("does not activate a waiting update while course work is unpersisted", async () => {
  const waiting = { state: "installed", postMessage: vi.fn() };
  const registration = { waiting, installing: null, addEventListener: vi.fn(), active: { postMessage: vi.fn() } };
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: {
    register: vi.fn(async () => registration), ready: Promise.resolve(registration),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), controller: {},
  } });
  const view = render(<OfflineStatus enabled updateBlocked />);
  const button = await screen.findByRole("button", { name: "有更新，刷新使用" });
  expect(button).toHaveProperty("disabled", true);
  fireEvent.click(button);
  expect(waiting.postMessage).not.toHaveBeenCalled();
  expect(screen.getByText(/课程记录尚未安全写入浏览器/)).toBeTruthy();
  view.rerender(<OfflineStatus enabled updateBlocked={false} />);
  fireEvent.click(button);
  expect(waiting.postMessage).toHaveBeenCalledWith({ type: "ACTIVATE_UPDATE" });
});
