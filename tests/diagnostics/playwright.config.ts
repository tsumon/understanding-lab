import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: ["attachment-failure.spec.ts", "trace-fields.spec.ts"],
  outputDir: process.env.DIAGNOSTIC_OUTPUT_DIR,
  reporter: "line",
  workers: 1,
});
