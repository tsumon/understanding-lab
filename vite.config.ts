import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { bundleLicenses } from "./tools/bundle-licenses";

export default defineConfig({
  plugins: [react(), bundleLicenses()],
  server: { proxy: { "/api": "http://127.0.0.1:3001" } },
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    exclude: ["tests/e2e/**"],
  },
});
