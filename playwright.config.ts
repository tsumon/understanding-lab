import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  use: { baseURL: "http://127.0.0.1:4173", locale: "zh-CN" },
  projects: [
    { name: "Desktop Chrome", use: { ...devices["Desktop Chrome"], browserName: "chromium" } },
    { name: "iPhone WebKit", use: { ...devices["iPhone 13"], browserName: "webkit" } },
    { name: "Android Chrome", use: { ...devices["Pixel 5"], browserName: "chromium" } },
  ],
  webServer: { command: "npm run preview:offline", url: "http://127.0.0.1:4173", reuseExistingServer: false },
});
