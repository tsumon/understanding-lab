import type { Browser } from "@playwright/test";

export async function openSignedPage(browser: Browser, origin: string, userId: string) {
  const context = await browser.newContext({ serviceWorkers: "block" });
  const host = new URL(origin).hostname;
  await context.addCookies([{
    name: "ul-test-user", value: userId, domain: host, path: "/",
    httpOnly: false, secure: false, sameSite: "Lax",
  }]);
  await context.setExtraHTTPHeaders({ Cookie: `ul-test-user=${userId}` });
  await context.route("**/api/sessions**", async (route) => {
    const response = await route.fetch({
      headers: {
        ...route.request().headers(),
        origin,
        cookie: `ul-test-user=${userId}`,
      },
    });
    await route.fulfill({ response });
  });
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
  await page.evaluate((id) => { document.cookie = `ul-test-user=${id}; path=/`; }, userId);
  return { context, page };
}
