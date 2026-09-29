import type { Browser } from "@playwright/test";

export async function openSignedPage(browser: Browser, origin: string, userId: string) {
  const context = await browser.newContext();
  await context.addCookies([{ name: "ul-test-user", value: userId, url: origin }]);
  await context.route("**/api/auth/**", async (route) => {
    const url = route.request().url();
    if (url.includes("get-session")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          user: { id: userId, name: userId, email: `${userId}@example.invalid`, emailVerified: false,
            createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
          session: { id: `sess-${userId}`, userId, token: "t", expiresAt: "2099-01-01T00:00:00.000Z",
            createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        }),
      });
      return;
    }
    await route.fulfill({ status: 204, body: "" });
  });
  const page = await context.newPage();
  await page.goto(origin);
  return { context, page };
}
