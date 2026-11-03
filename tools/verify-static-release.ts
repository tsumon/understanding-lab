import { chromium, webkit, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rename, rm, symlink } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import os from "node:os";

const [oldSite, newSite] = process.argv.slice(2).map(p => path.resolve(p));
if (!oldSite || !newSite) throw new Error("Usage: node --import tsx tools/verify-static-release.ts OLD_DIST EXTRACTED_SITE");
const cachePattern = /understanding-lab-public-[a-f0-9]{16}/;
const oldCache = (await readFile(path.join(oldSite, "sw.js"), "utf8")).match(cachePattern)?.[0];
const newCache = (await readFile(path.join(newSite, "sw.js"), "utf8")).match(cachePattern)?.[0];
if (!oldCache || !newCache || oldCache === newCache) throw new Error("Need two different built offline versions");
for (const engine of [chromium, webkit]) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "understanding-release-smoke-"));
  const site = path.join(temp, "site");
  await symlink(oldSite, site, "dir");
  const probe = createServer(); probe.listen(0, "127.0.0.1"); await once(probe, "listening");
  const port = (probe.address() as { port: number }).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const server = spawn("python3", ["-u", path.resolve("tools/serve-static.py"), "--port", String(port), "--directory", site], { stdio: ["ignore", "pipe", "pipe"] });
  await Promise.race([once(server.stdout, "data"), once(server, "exit").then(() => { throw new Error("Static server failed"); })]);
  const browser = await engine.launch();
  const page = await browser.newPage({ locale: "zh-CN" });
  page.setDefaultTimeout(5000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const external: string[] = [];
  await page.route("**/*", route => {
    if (new URL(route.request().url()).hostname !== "127.0.0.1") { external.push(route.request().url()); return route.abort(); }
    return route.continue();
  });
  try {
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator(".course-catalog > li")).toHaveCount(12);
    await expect(page.locator(".offline-status")).toContainText("已缓存");
    await page.goto(`http://127.0.0.1:${port}/#course/data-split`);
    await page.locator("#course-transfer").fill("Synthetic retained transfer: isolate people rather than mixing rows across the split.");
    const legacyKey = "understanding-lab:v1:anonymous:current";
    const legacyRaw = '{"synthetic":"opaque legacy record retained unchanged"}';
    await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: legacyKey, raw: legacyRaw });
    const before = await page.evaluate(() => localStorage.getItem("understanding-lab:course-progress:v1"));
    expect(before).not.toBeNull();
    await symlink(newSite, path.join(temp, "next"), "dir"); await rename(path.join(temp, "next"), site);
    await page.evaluate(async () => { const registration = await navigator.serviceWorker.ready; await registration.update(); });
    const update = page.locator(".offline-status button");
    await expect(update).toBeVisible();
    await expect(update).toBeEnabled();
    await Promise.all([page.waitForEvent("load"), update.click()]);
    await expect(page.locator("#course-transfer")).toHaveValue("Synthetic retained transfer: isolate people rather than mixing rows across the split.");
    await expect(page.locator(".offline-status")).toContainText("已缓存");
    expect(await page.evaluate(() => localStorage.getItem("understanding-lab:course-progress:v1"))).toBe(before);
    expect(await page.evaluate(key => localStorage.getItem(key), legacyKey)).toBe(legacyRaw);
    const cacheNames = await page.evaluate(() => caches.keys());
    expect(cacheNames).toContain(newCache); expect(cacheNames).not.toContain(oldCache);
    server.kill("SIGTERM"); await once(server, "exit");
    await page.reload();
    await expect(page.locator("#course-transfer")).toHaveValue("Synthetic retained transfer: isolate people rather than mixing rows across the split.");
    await page.getByRole("link", { name: "← 全部章节", exact: true }).click();
    await expect(page.locator(".course-catalog > li")).toHaveCount(12);
    await page.getByLabel("Language / 语言").selectOption("en");
    await expect(page.getByRole("heading", { name: "A complete learning path", exact: true })).toBeVisible();
    expect(errors).toEqual([]); expect(external).toEqual([]);
    console.log(JSON.stringify({ engine: engine.name(), passed: true, oldCache, newCache, assertions: "Python-served extracted static site; 12 chapters; two-version update; unchanged course/legacy storage; new cache; origin shutdown; offline reload and English", externalRequests: external.length }));
  } finally {
    await browser.close();
    if (server.exitCode === null && server.signalCode === null) { server.kill("SIGTERM"); await once(server, "exit"); }
    await rm(temp, { recursive: true, force: true });
  }
}
