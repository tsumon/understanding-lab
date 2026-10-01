import { writeFile } from "node:fs/promises";
import type { TestInfo } from "@playwright/test";

export async function persistRapidRevisionTrace(testInfo: TestInfo, trace: unknown): Promise<void> {
  const path = testInfo.outputPath("rapid-revision-trace.json");
  await writeFile(path, JSON.stringify(trace, null, 2), "utf8");
  await testInfo.attach("rapid-revision-trace.json", { path, contentType: "application/json" });
}
