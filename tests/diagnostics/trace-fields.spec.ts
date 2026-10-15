import { expect, test, type Page } from "@playwright/test";
import { installRapidRevisionTrace } from "../e2e/helpers/rapid-trace";

type Field = { present: boolean; visible: boolean; value: string };
type Trace = {
  entries: Record<string, unknown>[];
  dropped: number;
  snapshot: { answer: Field; notes: Field; stored: { draft: string; initialDraft: string } };
};

async function traceFrom(page: Page): Promise<Trace> {
  return page.evaluate(() => (window as Window & { __rapidRevisionTrace?: () => Trace }).__rapidRevisionTrace!());
}

test.setTimeout(5000);

test.beforeEach(async ({ page }) => {
  await installRapidRevisionTrace(page);
  // Synthetic same-origin document: no server, credentials, or real user content.
  await page.route("http://trace.test/", route => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: '<textarea id="notes"></textarea><section id="answer-panel"><textarea id="answer-text"></textarea></section><textarea id="private-field-marker"></textarea><button>返回上一步</button>',
  }));
  await page.goto("http://trace.test/");
});

test("attributes text to its field instead of the first textarea", async ({ page }) => {
  await page.locator("#notes").fill("只保存在本机的笔记");
  await page.locator("#answer-text").fill("第二版解释");
  await page.locator("#private-field-marker").fill("private-text-marker");
  await page.getByRole("button", { name: "返回上一步" }).click();
  const trace = await traceFrom(page);
  expect(trace.entries.find(entry => entry.kind === "click")).toMatchObject({
    field: "answer-text", value: "第二版解释",
  });
  expect(trace.entries.filter(entry => entry.kind === "input")).toMatchObject([
    { field: "notes", value: "只保存在本机的笔记" },
    { field: "answer-text", value: "第二版解释" },
    { field: "<other>", value: "<other>" },
  ]);
  await page.locator("#answer-text").evaluate(element => element.remove());
  await page.getByRole("button", { name: "返回上一步" }).click();
  const final = await traceFrom(page);
  expect(final.entries.filter(entry => entry.kind === "click").at(-1)).toMatchObject({
    field: "answer-text", value: "<missing>",
  });
  expect(JSON.stringify(final)).not.toContain("private-field-marker");
  expect(JSON.stringify(final)).not.toContain("private-text-marker");
});

test("snapshot separates missing, hidden and empty fields even when event history is full", async ({ page }) => {
  await page.evaluate(() => {
    const answer = document.querySelector<HTMLTextAreaElement>("#answer-text")!;
    for (let index = 0; index < 90; index += 1) {
      answer.value = "第一版解释";
      answer.dispatchEvent(new Event("input", { bubbles: true }));
    }
    answer.value = ""; // A rendered value can change without an input event.
    document.getElementById("answer-panel")!.style.display = "none";
    document.getElementById("notes")!.remove();
    localStorage.setItem("understanding-lab:v1:anonymous:current", JSON.stringify({
      unconfirmedText: "第二版解释", drafts: { explain: "第二版解释" },
      session: { answers: [], notes: "private-notes-marker" },
    }));
  });
  const trace = await traceFrom(page);
  expect(trace.entries).toHaveLength(80);
  expect(trace.dropped).toBeGreaterThan(0);
  expect(trace.snapshot).toMatchObject({
    answer: { present: true, visible: false, value: "" },
    notes: { present: false, visible: false, value: "<missing>" },
    stored: { draft: "第二版解释", initialDraft: "第二版解释", notes: "<other>" },
  });
  expect(JSON.stringify(trace)).not.toContain("private-notes-marker");
  await page.locator("#answer-panel").evaluate(element => { element.style.display = "block"; });
  expect((await traceFrom(page)).snapshot.answer).toEqual({ present: true, visible: true, value: "" });
  await page.locator("#answer-text").fill("private-answer-marker");
  const redacted = await traceFrom(page);
  expect(redacted.snapshot.answer.value).toBe("<other>");
  expect(JSON.stringify(redacted)).not.toContain("private-answer-marker");
});
