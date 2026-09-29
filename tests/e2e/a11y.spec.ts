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

async function seriousViolations(page: import("@playwright/test").Page) {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return result.violations.filter((item) => item.impact === "critical" || item.impact === "serious");
}

test("axe reports no critical or serious issues on home and the started lesson", async ({ page }) => {
  await page.goto("/");
  expect(await seriousViolations(page), "home").toEqual([]);
  await page.getByRole("button", { name: "开始学习" }).click();
  expect(await seriousViolations(page), "started lesson").toEqual([]);
});

test("axe reports no critical or serious issues on experiment and summary", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByRole("button", { name: "先做实验" }).click();
  if (isMobile) await page.getByRole("button", { name: "实验", exact: true }).click();
  expect(await seriousViolations(page), "experiment").toEqual([]);
  for (let i = 0; i < 8; i += 1) {
    if (isMobile) {
      const tab = page.getByRole("button", { name: "讲解" });
      if (await tab.isVisible()) await tab.click();
    }
    const skip = page.getByRole("button", { name: "跳过，标记未验证" });
    if (await skip.isVisible()) await skip.click();
    else break;
  }
  await expect(page.getByRole("heading", { name: "本次小结" })).toBeVisible();
  expect(await seriousViolations(page), "summary").toEqual([]);
});
