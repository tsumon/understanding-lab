// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

test("saved choice wins, browser languages fall back through the first supported language", async () => {
  const { resolveLocale } = await import("../../src/client/i18n");
  expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
  expect(resolveLocale(null, ["fr-FR", "en-GB"])).toBe("en");
  expect(resolveLocale("garbled", ["zh-TW"])).toBe("zh-CN");
  expect(resolveLocale(null, ["fr-FR"])).toBe("en");
});

test("storage failures preserve a usable locale", async () => {
  const { readLocalePreference, saveLocalePreference } = await import("../../src/client/i18n");
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(() => readLocalePreference()).not.toThrow();
  expect(() => saveLocalePreference("en")).not.toThrow();
});
