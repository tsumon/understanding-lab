import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test("skip link and keyboard can start the local lesson", async ({ page, isMobile }) => {
  test.skip(Boolean(isMobile), "keyboard skip-link path is for desktop");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳到主要内容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await page.getByRole("button", { name: "开始学习" }).press("Enter");
  await expect(page.getByLabel("我的解释")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "学习进度" })).toBeVisible();
});

test("axe reports no critical or serious issues on home and the started lesson", async ({ page }) => {
  const scan = async () => {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    return result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
  };
  await page.goto("/");
  expect(await scan(), "home").toEqual([]);
  await page.getByRole("button", { name: "开始学习" }).click();
  expect(await scan(), "started lesson").toEqual([]);
});
