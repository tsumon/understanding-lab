import { test } from "@playwright/test";
import { persistRapidRevisionTrace } from "../e2e/helpers/rapid-trace";

test("keeps a bounded trace after its original failure", async ({}, testInfo) => {
  await persistRapidRevisionTrace(testInfo, { entries: [{ kind: "input", value: "第二版解释" }], dropped: 0 });
  throw new Error("intentional trace failure");
});
