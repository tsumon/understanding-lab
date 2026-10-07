import { writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";

/** Test-only, synthetic, bounded trace. Session storage carries evidence across reloads. */
export async function installRapidRevisionTrace(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = "understanding-lab:v1:anonymous:current";
    const traceKey = "understanding-lab:test:rapid-trace";
    let trace: object[] = [];
    let dropped = 0;
    try {
      const previous = JSON.parse(sessionStorage.getItem(traceKey) ?? "null");
      if (previous && Array.isArray(previous.entries)) {
        trace = previous.entries.slice(0, 80);
        dropped = Number(previous.dropped) || 0;
      }
    } catch { /* Diagnostic persistence must not affect the application. */ }
    const syntheticText = (value: unknown) =>
      ["第一版解释", "第二版解释", "尚未确认的初始草稿", "只保存在本机的笔记", ""].includes(value as string) ? value : "<other>";
    const answersFrom = (raw: string | null) => {
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        return {
          draft: syntheticText(parsed?.unconfirmedText),
          initialDraft: syntheticText(parsed?.drafts?.explain),
          notes: syntheticText(parsed?.session?.notes),
          answers: (parsed?.session?.answers ?? []).filter((answer: { step: string }) => answer.step === "explain")
            .map((answer: { revision: number; text: string }) => ({ revision: answer.revision, text: syntheticText(answer.text) })),
        };
      } catch { return { draft: "<unreadable>", answers: [] }; }
    };
    const record = (kind: string, details: object) => {
      if (trace.length < 80) trace.push({ at: Math.round(performance.now()), kind, ...details });
      else dropped += 1;
      try { sessionStorage.setItem(traceKey, JSON.stringify({ entries: trace, dropped })); }
      catch { /* Keep the in-memory trace if diagnostic storage is unavailable. */ }
    };
    Object.defineProperty(window, "__rapidRevisionTrace", { value: () => ({ entries: trace, dropped }) });
    for (const kind of ["input", "change", "compositionstart", "compositionend"]) {
      document.addEventListener(kind, (event) => {
        if (event.target instanceof HTMLTextAreaElement) record(kind, { value: syntheticText(event.target.value) });
      }, true);
    }
    document.addEventListener("click", (event) => {
      const button = event.target instanceof Element ? event.target.closest("button") : null;
      const label = button?.textContent?.trim();
      if (!label || !["开始学习", "确认这段解释", "继续下一步", "跳过，标记未验证", "讲解", "先做实验", "返回上一步", "实验"].includes(label)) return;
      let stored: ReturnType<typeof answersFrom>;
      try { stored = answersFrom(localStorage.getItem(key)); }
      catch { stored = { draft: "<unreadable>", answers: [] }; }
      record("click", { label, value: syntheticText(document.querySelector("textarea")?.value), stored });
    }, true);
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(storageKey, value) {
      const result = originalSetItem.call(this, storageKey, value);
      try {
        if (this === localStorage && storageKey === key) record("write", answersFrom(value));
      } catch { /* Tracing must not alter a successful storage write. */ }
      return result;
    };
    try { record("load", answersFrom(localStorage.getItem(key))); }
    catch { /* An unavailable draft must not prevent the page from loading. */ }
  });
}

export async function persistRapidRevisionTrace(testInfo: TestInfo, trace: unknown): Promise<void> {
  const path = testInfo.outputPath("rapid-revision-trace.json");
  await writeFile(path, JSON.stringify(trace, null, 2), "utf8");
  await testInfo.attach("rapid-revision-trace.json", { path, contentType: "application/json" });
}

/** afterEach has its own Playwright timeout, even when the test body has expired. */
export async function persistFailedRapidRevisionTrace(page: Page, testInfo: TestInfo): Promise<void> {
  if (testInfo.status === testInfo.expectedStatus) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const trace = await Promise.race([
      page.evaluate(() => (window as Window & { __rapidRevisionTrace?: () => object }).__rapidRevisionTrace?.()),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), 3000); }),
    ]);
    if (trace) await persistRapidRevisionTrace(testInfo, trace);
  } catch { /* Diagnostics must not replace the original failure. */ }
  finally { if (timer) clearTimeout(timer); }
}
