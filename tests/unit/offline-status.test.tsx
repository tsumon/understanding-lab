// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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


function firstInstallation() {
  let resolveReady!: (value: typeof registration) => void;
  const registration = Object.assign(new EventTarget(), { waiting: null, installing: null, active: { postMessage: vi.fn() } });
  const serviceWorker = Object.assign(new EventTarget(), {
    controller: null as object | null,
    ready: new Promise<typeof registration>(resolve => { resolveReady = resolve; }),
    register: vi.fn(async () => registration),
  });
  Object.defineProperty(navigator, "serviceWorker", { configurable: true, value: serviceWorker });
  return { registration, serviceWorker, resolveReady };
}

test.each(['ready-first', 'controller-first'])("initial cache status requires the actual worker acknowledgement: %s", async order => {
  const { registration, serviceWorker, resolveReady } = firstInstallation();
  render(<OfflineStatus enabled />);
  expect(screen.getByText("公共离线缓存尚未确认").getAttribute("aria-hidden")).toBe("false");
  expect(screen.getByText("公共材料与实验数据已缓存，可离线使用").getAttribute("aria-hidden")).toBe("true");
  if (order === 'ready-first') {
    await act(async () => { resolveReady(registration); });
    expect(registration.active.postMessage).not.toHaveBeenCalled();
    act(() => { serviceWorker.controller = {}; serviceWorker.dispatchEvent(new Event('controllerchange')); });
  } else {
    act(() => { serviceWorker.controller = {}; serviceWorker.dispatchEvent(new Event('controllerchange')); });
    expect(registration.active.postMessage).not.toHaveBeenCalled();
    await act(async () => { resolveReady(registration); });
  }
  await waitFor(() => expect(registration.active.postMessage).toHaveBeenCalledWith({ type: 'CHECK_CACHE' }));
  // Platform ready / controller activation alone must not claim cached content.
  expect(screen.getByText("公共离线缓存尚未确认").getAttribute("aria-hidden")).toBe("false");
  expect(screen.getByText("公共材料与实验数据已缓存，可离线使用").getAttribute("aria-hidden")).toBe("true");
  act(() => serviceWorker.dispatchEvent(new MessageEvent('message', { data: { type: 'CACHE_READY' } })));
  expect(screen.getByText("公共材料与实验数据已缓存，可离线使用").getAttribute("aria-hidden")).toBe("false");
  expect(screen.getByText("公共离线缓存尚未确认").getAttribute("aria-hidden")).toBe("true");
});


test("reserved update layout has no accessible or focusable action before an update exists", () => {
  firstInstallation();
  const view = render(<OfflineStatus enabled />);
  expect(screen.queryByRole("button")).toBeNull();
  const placeholder = view.container.querySelector<HTMLButtonElement>(".offline-update")!;
  expect(placeholder.disabled).toBe(true);
  expect(placeholder.tabIndex).toBe(-1);
  expect(placeholder.style.visibility).toBe("hidden");
  expect(placeholder.getAttribute("aria-hidden")).toBe("true");
});
