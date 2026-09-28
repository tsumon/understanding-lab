import { expect, test } from "@playwright/test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("export is a local recovery file without cookies, tokens, or secrets", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "开始学习" }).click();
  await page.getByLabel("我的解释").fill("导出不应带上登录凭据");
  await page.getByRole("button", { name: "确认这段解释" }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出当前尝试" }).click();
  const file = await pending;
  const target = join(mkdtempSync(join(tmpdir(), "export-")), file.suggestedFilename());
  await file.saveAs(target);
  const body = readFileSync(target, "utf8");
  const parsed = JSON.parse(body) as { session: { topicVersion: string; answers: unknown[] } };
  expect(parsed.session.topicVersion).toBe("overfitting.v1");
  expect(parsed.session.answers).toHaveLength(1);
  expect(body).not.toMatch(/cookie|token|BETTER_AUTH|GITHUB_CLIENT_SECRET|OPENAI_API_KEY|sk-/i);
});

test("service worker does not cache API, non-GET, or cross-origin requests", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText("公共材料与实验数据已缓存，可离线使用")).toBeVisible({ timeout: 15000 });
  const probe = await page.evaluate(async () => {
    const post = await fetch("/api/tutor", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" })
      .then((response) => ({ status: response.status, type: response.headers.get("content-type") ?? "" }))
      .catch(() => ({ status: 0, type: "network-error" }));
    const cached: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) {
        cached.push(`${request.method} ${new URL(request.url).pathname}`);
      }
    }
    return { post, cached };
  });
  expect(probe.cached.some((entry) => entry.includes("/api/"))).toBe(false);
  expect(probe.cached.every((entry) => entry.startsWith("GET "))).toBe(true);
  if (probe.post.status === 200) expect(probe.post.type).not.toMatch(/html/i);
});

test("production bundle and service worker allowlist omit secrets and API bodies", async () => {
  const dist = join(process.cwd(), "dist");
  const assets = readdirSync(join(dist, "assets"));
  const js = assets.filter((name) => name.endsWith(".js")).map((name) => readFileSync(join(dist, "assets", name), "utf8")).join("\n");
  expect(js).not.toContain("GITHUB_CLIENT_SECRET");
  expect(js).not.toContain("OPENAI_API_KEY");
  expect(js).not.toMatch(/sk-(?:live|proj|svcacct)-[A-Za-z0-9]+/);
  const sw = readFileSync(join(dist, "sw.js"), "utf8");
  expect(sw).toContain('url.pathname.startsWith("/api/")');
  expect(sw).not.toMatch(/\/api\/tutor|\/api\/sessions|\/api\/transcribe/);
});
