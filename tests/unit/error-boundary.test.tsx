// @vitest-environment jsdom
import { expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../src/client/ErrorBoundary";
import { LocaleProvider } from "../../src/client/LocaleProvider";

function Boom(): never {
  throw new Error("render-failed");
}

test("render failures stay on-device and do not claim the draft was uploaded", () => {
  render(<ErrorBoundary><Boom /></ErrorBoundary>);
  expect(screen.getByRole("heading", { name: "页面出错" })).toBeTruthy();
  expect(screen.getByText(/没有发送到服务器/)).toBeTruthy();
  expect(screen.queryByText("render-failed")).toBeNull();
});

test("English render failure retains the local draft assurance", () => {
  localStorage.setItem("understanding-lab:ui-locale", "en");
  render(<LocaleProvider><ErrorBoundary><Boom /></ErrorBoundary></LocaleProvider>);
  expect(screen.getByRole("heading", { name: "Page error" })).toBeTruthy();
  expect(screen.getByText(/not sent to the server/)).toBeTruthy();
  localStorage.clear();
});
