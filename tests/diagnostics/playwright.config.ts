import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "attachment-failure.spec.ts",
  outputDir: process.env.DIAGNOSTIC_OUTPUT_DIR,
  reporter: "line",
  workers: 1,
});
