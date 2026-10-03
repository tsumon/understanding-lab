import { expect, test } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { installRapidRevisionTrace, persistRapidRevisionTrace } from "./helpers/rapid-trace";

async function freeLocalPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local port");
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

test("restores unconfirmed text and changes experiment parameters without an AI request", async ({ page }) => {
  const tutorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/tutor")) tutorRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByLabel("我的解释").fill("训练误差不代表新数据表现");
  await page.reload();
  await expect(page.getByLabel("我的解释")).toHaveValue("训练误差不代表新数据表现");
  await page.getByRole("button", { name: "先做实验" }).click();
  await page.getByLabel("多项式阶数").selectOption("8");
  await expect(page.getByText("预先计算的交互实验")).toBeVisible();
  expect(tutorRequests).toEqual([]);
});

test("finishes seven stages with skipped clarification and an honest experiment record", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByLabel("我的解释").fill("训练集拟合好也可能记住噪声");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await expect(page.getByText("澄清 1 / 2")).toBeVisible();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  await expect(page.getByText("澄清 2 / 2")).toBeVisible();
  await page.getByLabel("我的解释").fill("看未见数据误差是否也低");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("我的解释").fill("训练误差下降，验证误差可能上升");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("多项式阶数").selectOption("8");
  await page.getByRole("button", { name: "冻结当前选择" }).click();
  await page.getByRole("button", { name: "揭示最终测试结果" }).click();
  await expect(page.getByText(/测试 MSE：/)).toBeVisible();
  await page.getByLabel("多项式阶数").selectOption("3");
  await expect(page.getByText("测试结果尚未揭示")).toBeVisible();
  await expect(page.getByText(/测试信息已影响后续选择/)).toBeVisible();
  await page.getByRole("button", { name: "记录实验观察" }).click();
  if (isMobile) await page.getByRole("button", { name: "讲解" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("我的解释").fill("应查看未见数据，不能只比较训练误差");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByLabel("我的解释").fill("反复选择会污染测试集");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await page.getByRole("button", { name: "继续下一步" }).click();
  await expect(page.getByRole("heading", { name: "本次小结" })).toBeVisible();
  await expect(page.getByText(/澄清：未验证/)).toBeVisible();
  await expect(page.getByText(/训练 MSE/).first()).toBeVisible();
});

test("retains a corrupt draft as raw export data", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("understanding-lab:v1:anonymous:current", "{damaged draft"));
  await page.goto("/");
  await expect(page.getByText(/草稿损坏/)).toBeVisible();
  await expect(page.getByRole("button", { name: "导出损坏草稿" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("understanding-lab:v1:anonymous:current"))).toBe("{damaged draft");
});

test("can skip an unavailable experiment and summarizes the latest confirmed revision", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByLabel("我的解释").fill("第一版解释");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await expect(page.getByText(/已确认第 1 版/)).toBeVisible();
  await page.getByLabel("我的解释").fill("第二版解释");
  await expect(page.getByLabel("我的解释")).toHaveValue("第二版解释");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  await expect(page.getByText(/已确认第 2 版/)).toBeVisible();
  const confirmedExplanations = () => page.evaluate(() => {
    const raw = localStorage.getItem("understanding-lab:v1:anonymous:current");
    return raw ? JSON.parse(raw).session.answers.filter((answer: { step: string }) => answer.step === "explain").map((answer: { text: string }) => answer.text) : [];
  });
  await expect.poll(confirmedExplanations).toEqual(["第一版解释", "第二版解释"]);
  await page.getByRole("button", { name: "继续下一步" }).click();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  if (isMobile) await page.getByRole("button", { name: "讲解" }).click();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  await page.getByRole("button", { name: "跳过，标记未验证" }).click();
  await expect(page.getByRole("heading", { name: "本次小结" })).toBeVisible();
  await expect.poll(confirmedExplanations).toEqual(["第一版解释", "第二版解释"]);
  await expect(page.getByText("第二版解释")).toBeVisible();
  await expect(page.getByText("第一版解释")).toHaveCount(0);
  await expect(page.getByText("实验：未验证")).toBeVisible();
});

test("rapid revisions keep the latest explanation through skipped stages", async ({ page, isMobile }, testInfo) => {
  await installRapidRevisionTrace(page);

  try {
    await page.goto("/");
    await page.getByRole("button", { name: "开始学习" }).click();
    await page.getByLabel("我的解释").fill("第一版解释");
    await page.getByRole("button", { name: "确认这段解释" }).click();
    await page.getByLabel("我的解释").fill("第二版解释");
    await page.getByRole("button", { name: "确认这段解释" }).click();
    await page.getByRole("button", { name: "继续下一步" }).click();
    await page.getByRole("button", { name: "跳过，标记未验证" }).click();
    await page.getByRole("button", { name: "跳过，标记未验证" }).click();
    await page.getByRole("button", { name: "跳过，标记未验证" }).click();
    if (isMobile) await page.getByRole("button", { name: "讲解" }).click();
    await page.getByRole("button", { name: "跳过，标记未验证" }).click();
    await page.getByRole("button", { name: "跳过，标记未验证" }).click();
    await page.getByRole("button", { name: "跳过，标记未验证" }).click();
    await expect(page.getByRole("heading", { name: "本次小结" })).toBeVisible();
    await expect(page.getByText("第二版解释")).toBeVisible();
    await expect(page.getByText("第一版解释")).toHaveCount(0);
    await expect(page.getByText("实验：未验证")).toBeVisible();
  } catch (error) {
    try {
      const trace = await page.evaluate(() => (window as Window & { __rapidRevisionTrace?: () => object }).__rapidRevisionTrace?.());
      await persistRapidRevisionTrace(testInfo, trace);
    } catch { /* Keep the original assertion failure if the page is unavailable. */ }
    throw error;
  }
});

test("keeps in-memory text and offers export when storage is full", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key.startsWith("understanding-lab:v1:anonymous:")) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByLabel("我的解释").fill("仍在内存里的回答");
  await expect(page.getByText(/未保存到本机/)).toBeVisible();
  await expect(page.getByRole("button", { name: "导出当前尝试" })).toBeVisible();
  await expect(page.getByLabel("我的解释")).toHaveValue("仍在内存里的回答");
});

test("mobile tabs preserve draft and fit a 360px viewport", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByRole("button", { name: "讲解" }).click();
  await page.getByLabel("我的解释").fill("保留手机草稿");
  await page.getByRole("button", { name: "材料" }).click();
  await page.getByRole("button", { name: "讲解" }).click();
  await expect(page.getByLabel("我的解释")).toHaveValue("保留手机草稿");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("fast refresh retains notes, experiment settings, and a draft from an earlier step", async ({ page, isMobile }, testInfo) => {
  await installRapidRevisionTrace(page);
  try {
    await page.goto("/");
    await page.getByRole("button", { name: "开始学习" }).click();
    await page.getByLabel("我的笔记（最多 8000 字）").fill("只保存在本机的笔记");
    await page.reload();
    await expect(page.getByLabel("我的笔记（最多 8000 字）")).toHaveValue("只保存在本机的笔记");
    await page.getByLabel("我的解释").fill("尚未确认的初始草稿");
    await page.getByRole("button", { name: "先做实验" }).click();
    await page.getByLabel("多项式阶数").selectOption("11");
    await page.reload();
    if (isMobile) await page.getByRole("button", { name: "实验" }).click();
    await expect(page.getByLabel("多项式阶数")).toHaveValue("11");
    if (isMobile) await page.getByRole("button", { name: "讲解" }).click();
    for (let index = 0; index < 8; index += 1) {
      if ((await page.locator(".step-nav [aria-current='step']").textContent())?.includes("初始解释")) break;
      await page.getByRole("button", { name: "返回上一步" }).click();
    }
    await expect(page.locator(".step-nav [aria-current='step']")).toContainText("初始解释");
    await expect(page.getByLabel("我的解释")).toHaveValue("尚未确认的初始草稿");
    const trace = await page.evaluate(() => (window as Window & {
      __rapidRevisionTrace?: () => { entries: { kind: string }[]; dropped: number };
    }).__rapidRevisionTrace?.());
    expect(trace?.entries.filter((entry) => entry.kind === "load").length).toBe(3);
    expect(trace!.entries.length).toBeLessThanOrEqual(80);
  } catch (error) {
    try {
      const trace = await page.evaluate(() => (window as Window & { __rapidRevisionTrace?: () => object }).__rapidRevisionTrace?.());
      await persistRapidRevisionTrace(testInfo, trace);
    } catch { /* Keep the original failure if the page is unavailable. */ }
    throw error;
  }
});

test("loads the production document and catalog after its origin is unavailable", async ({ page }) => {
  const port = await freeLocalPort();
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--host", "127.0.0.1", "--port", String(port)], {
    cwd: process.cwd(), stdio: "ignore",
  });
  try {
    await expect.poll(async () => fetch(origin).then((response) => response.status).catch(() => 0), { timeout: 10000 }).toBe(200);
    await page.goto(origin);
    await expect(page.getByText("公共材料与实验数据已缓存，可离线使用")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "开始学习" }).click();
    await page.getByLabel("我的解释").fill("离线仍可编辑");
    await expect.poll(() => page.evaluate(() => {
      const raw = localStorage.getItem("understanding-lab:v1:anonymous:current");
      return raw ? JSON.parse(raw).unconfirmedText : null;
    })).toBe("离线仍可编辑");
    server.kill("SIGTERM");
    await once(server, "exit");
    await expect.poll(async () => fetch(origin).then((response) => response.status).catch(() => 0)).toBe(0);
    await page.reload();
    await expect(page.getByLabel("我的解释")).toHaveValue("离线仍可编辑");
    await expect(page.getByText("公共材料与实验数据已缓存，可离线使用")).toBeVisible();
    await page.getByLabel("Language / 语言").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByLabel("Your explanation", { exact: true })).toHaveValue("离线仍可编辑");
    await page.reload();
    await expect(page.getByLabel("Your explanation", { exact: true })).toHaveValue("离线仍可编辑");
    await expect(page.getByText("Learning material and experiment data are cached for offline use")).toBeVisible();
    await page.getByLabel("Language / 语言").selectOption("zh-CN");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await page.getByRole("button", { name: "先做实验" }).click();
    await page.getByLabel("多项式阶数").selectOption("12");
    await expect(page.getByRole("img", { name: /数值图：训练样本/ })).toBeVisible();
    await expect(page.getByText(/纵轴实际范围/)).toBeVisible();
    await expect(page.getByText("预先计算的交互实验")).toBeVisible();
    const cachedPaths = await page.evaluate(async () => {
      const names = await caches.keys();
      const entries = await Promise.all(names.map(async (name) => (await (await caches.open(name)).keys()).map((request) => new URL(request.url).pathname)));
      return entries.flat();
    });
    expect(cachedPaths).toContain("/experiments/overfitting.v1.json");
    expect(cachedPaths.some((path) => path.startsWith("/api/") || path.includes("anonymous") || /\.(wav|mp3|webm)$/.test(path))).toBe(false);
  } finally {
    if (server.exitCode === null && server.signalCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
  }
});
