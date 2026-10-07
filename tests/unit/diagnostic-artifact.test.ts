import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { expect, test } from "vitest";

test("a failing Playwright case leaves its trace JSON on disk", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "rapid-trace-"));
  try {
    const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "tests/diagnostics/playwright.config.ts"], {
      cwd: resolve("."),
      env: { ...process.env, DIAGNOSTIC_OUTPUT_DIR: outputDir },
      encoding: "utf8",
      timeout: 15000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toContain("intentional trace failure");
    const testFolder = readdirSync(outputDir).find((name) => name.startsWith("attachment-failure-"));
    expect(testFolder).toBeDefined();
    const tracePath = join(outputDir, testFolder!, "rapid-revision-trace.json");
    expect(existsSync(tracePath)).toBe(true);
    expect(JSON.parse(readFileSync(tracePath, "utf8"))).toEqual({ entries: [{ kind: "input", value: "第二版解释" }], dropped: 0 });
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}, 20000);

test("an overall Playwright timeout leaves a nonempty bounded trace on disk", () => {
  const outputDir = mkdtempSync(join(tmpdir(), "rapid-timeout-trace-"));
  try {
    const result = spawnSync(process.execPath, ["node_modules/@playwright/test/cli.js", "test", "--config", "tests/diagnostics/playwright.config.ts", "--grep", "overall timeout"], {
      cwd: resolve("."),
      env: { ...process.env, DIAGNOSTIC_OUTPUT_DIR: outputDir },
      encoding: "utf8",
      timeout: 15000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/Test timeout of \d+ms exceeded/);
    const testFolder = readdirSync(outputDir).find((name) => name.startsWith("attachment-failure-"));
    expect(testFolder).toBeDefined();
    const tracePath = join(outputDir, testFolder!, "rapid-revision-trace.json");
    expect(existsSync(tracePath)).toBe(true);
    const trace = JSON.parse(readFileSync(tracePath, "utf8")) as { entries: { kind: string }[]; dropped: number };
    expect(trace.entries.length).toBeGreaterThan(0);
    expect(trace.entries.length).toBeLessThanOrEqual(80);
    expect(trace.entries.some((entry) => entry.kind === "input")).toBe(true);
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}, 20000);
