import { expect, test } from "@playwright/test";

test("跳过回答的小结不能显示理解已验证", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
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
  await expect(page.getByText("未验证").first()).toBeVisible();
  await expect(page.getByText("已掌握", { exact: true })).toHaveCount(0);
});

test("confirmed path records answers, experiment evidence, and a migration without claiming mastery", async ({ page, isMobile }) => {
  const tutorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/tutor")) tutorRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByLabel("我的解释").fill("训练拟合好也可能只记住噪声");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  await page.getByLabel("我的解释").fill("要看未见数据，不只看训练误差");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("我的解释").fill("提高阶数后训练误差可能下降，验证误差可能上升");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("多项式阶数").selectOption("3");
  await page.getByLabel("多项式阶数").selectOption("8");
  await page.getByRole("button", { name: "冻结当前选择" }).click();
  await page.getByRole("button", { name: "揭示最终测试结果" }).click();
  await expect(page.getByText(/测试 MSE：/)).toBeVisible();
  await page.getByRole("button", { name: "记录实验观察" }).click();
  if (isMobile) await page.getByRole("button", { name: "讲解" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("我的解释").fill("验证误差升高说明可能追随噪声");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("我的解释").fill("反复用测试集挑配置，结果不能当独立泛化证据");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await expect(page.getByRole("heading", { name: "本次小结" })).toBeVisible();
  await expect(page.getByText(/训练拟合好也可能只记住噪声/)).toBeVisible();
  await expect(page.getByText(/训练 MSE/).first()).toBeVisible();
  await expect(page.getByText("已掌握", { exact: true })).toHaveCount(0);
  expect(tutorRequests).toEqual([]);
});
