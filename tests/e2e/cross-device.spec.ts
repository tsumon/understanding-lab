import { expect, test } from "@playwright/test";

test("login, save, and send-to-AI stay independent and never hit tutor on the static preview", async ({ page }) => {
  const tutorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/tutor")) tutorRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "登录" }).click();
  await page.getByRole("button", { name: "开始学习" }).click();
  await expect(page.getByLabel("把私人笔记一并发送给模型")).not.toBeChecked();
  await page.getByRole("button", { name: "保存到账号" }).click();
  await page.getByRole("button", { name: "发送给 AI" }).click();
  await expect(page.getByText(/本机草稿未上传/)).toBeVisible();
  expect(tutorRequests).toEqual([]);
});

test("two-context live sync needs POST /api/tutor in this worktree", async () => {
  test.skip(true, "Server agent owns POST /api/tutor, quotas, and 002_usage.sql. Client isolation is covered by tests/unit/app-account.test.tsx and tests/unit/local-store.test.ts with mocked fetch.");
});
