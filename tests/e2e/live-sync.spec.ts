import { expect, test, type Browser } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { openSignedPage } from "./helpers/signed-page";

async function spawnLiveApp() {
  const child = spawn(process.execPath, ["--import", "tsx", "tests/e2e/helpers/live-server.ts"], {
    cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"],
  });
  const line = await new Promise<string>((resolve, reject) => {
    child.stdout.setEncoding("utf8");
    child.stdout.once("data", (chunk: string) => resolve(chunk.trim()));
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`live-server exited ${code}`)));
  });
  const origin = (JSON.parse(line) as { origin: string }).origin;
  return {
    origin,
    close: async () => {
      child.kill("SIGTERM");
      await once(child, "exit").catch(() => undefined);
    },
  };
}

test("two signed-in contexts isolate records and a second device can restore the latest save", async ({ browser }: { browser: Browser }) => {
  const live = await spawnLiveApp();
  try {
    const alice = await openSignedPage(browser, live.origin, "alice");
    await alice.page.getByRole("button", { name: "登录" }).click();
    await expect(alice.page.getByText("当前账号 alice")).toBeVisible();
    await alice.page.getByRole("button", { name: "开始学习" }).click();
    await alice.page.getByLabel("我的笔记（最多 8000 字）").fill("爱丽丝的跨设备笔记");
    await alice.page.getByRole("button", { name: "保存到账号" }).click();
    await expect(alice.page.getByText("已同步到账号")).toBeVisible({ timeout: 15000 });

    const bob = await openSignedPage(browser, live.origin, "bob");
    await bob.page.getByRole("button", { name: "登录" }).click();
    await expect(bob.page.getByText("当前账号 bob")).toBeVisible();
    await bob.page.getByRole("button", { name: "开始学习" }).click();
    await expect(bob.page.getByLabel("我的笔记（最多 8000 字）")).not.toHaveValue("爱丽丝的跨设备笔记");
    await bob.context.close();

    const aliceDevice = await openSignedPage(browser, live.origin, "alice");
    await aliceDevice.page.getByRole("button", { name: "登录" }).click();
    await expect(aliceDevice.page.getByText("当前账号 alice")).toBeVisible();
    await expect(aliceDevice.page.getByLabel("我的笔记（最多 8000 字）")).toHaveValue("爱丽丝的跨设备笔记");
    await expect(aliceDevice.page.getByText("alice@example.invalid")).toHaveCount(0);
    await aliceDevice.context.close();
    await alice.context.close();
  } finally {
    await live.close();
  }
});

test("two devices of the same account keep both copies on a revision conflict", async ({ browser }: { browser: Browser }) => {
  const live = await spawnLiveApp();
  try {
    const deviceA = await openSignedPage(browser, live.origin, "alice");
    await deviceA.page.getByRole("button", { name: "登录" }).click();
    await deviceA.page.getByRole("button", { name: "开始学习" }).click();
    await deviceA.page.getByLabel("我的笔记（最多 8000 字）").fill("设备甲");
    await deviceA.page.getByRole("button", { name: "保存到账号" }).click();
    await expect(deviceA.page.getByText("已同步到账号")).toBeVisible({ timeout: 15000 });

    const deviceB = await openSignedPage(browser, live.origin, "alice");
    await deviceB.page.getByRole("button", { name: "登录" }).click();
    await expect(deviceB.page.getByLabel("我的笔记（最多 8000 字）")).toHaveValue("设备甲");

    await deviceA.page.getByLabel("我的笔记（最多 8000 字）").fill("设备甲已更新");
    await deviceA.page.getByRole("button", { name: "保存到账号" }).click();
    await expect(deviceA.page.getByText("已同步到账号")).toBeVisible({ timeout: 15000 });

    await deviceB.page.getByLabel("我的笔记（最多 8000 字）").fill("设备乙本机稿");
    await deviceB.page.getByRole("button", { name: "保存到账号" }).click();
    await expect(deviceB.page.getByRole("heading", { name: "与账号中的版本冲突" })).toBeVisible({ timeout: 15000 });
    await expect(deviceB.page.getByLabel("我的笔记（最多 8000 字）")).toHaveValue("设备乙本机稿");
    await deviceB.page.getByRole("button", { name: "载入账号版本" }).click();
    await expect(deviceB.page.getByLabel("我的笔记（最多 8000 字）")).toHaveValue("设备甲已更新");
    await deviceB.context.close();
    await deviceA.context.close();
  } finally {
    await live.close();
  }
});
