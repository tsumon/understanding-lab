import { expect, test } from "@playwright/test";
import { installRapidRevisionTrace, persistFailedRapidRevisionTrace, persistRapidRevisionTrace } from "../e2e/helpers/rapid-trace";

test.afterEach(async ({ page }, testInfo) => {
  await persistFailedRapidRevisionTrace(page, testInfo);
});

test("keeps a bounded trace after its original failure", async ({}, testInfo) => {
  await persistRapidRevisionTrace(testInfo, { entries: [{ kind: "input", value: "第二版解释" }], dropped: 0 });
  throw new Error("intentional trace failure");
});

test("overall timeout still leaves a bounded trace", async ({ page }, testInfo) => {
  await installRapidRevisionTrace(page);
  await page.goto("data:text/html,<textarea></textarea>");
  await page.locator("textarea").fill("第一版解释");
  const trace = await page.evaluate(() => (window as Window & { __rapidRevisionTrace?: () => { entries: object[] } }).__rapidRevisionTrace?.());
  expect(trace?.entries.length).toBeGreaterThan(0);
  test.setTimeout(testInfo.duration + 1000);
  await page.waitForTimeout(5000);
});
