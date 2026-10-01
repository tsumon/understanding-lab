import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TopicSchema } from "../../src/domain/contracts";

describe("English course edition", () => {
  it("provides all stable paragraph and question identities without inheriting approval", () => {
    const file = new URL("../../content/overfitting.v1.en.json", import.meta.url);
    expect(existsSync(file)).toBe(true);
    const topic = TopicSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(topic.paragraphs.map(p => p.id)).toEqual(["p-splits", "p-fit", "p-context", "p-evidence"]);
    expect(topic.questions.map(q => q.id)).toEqual(["explain-1", "clarify-1", "clarify-2", "predict-1", "reexplain-1", "transfer-1"]);
    expect(new Set(topic.paragraphs.map(p => p.id)).size).toBe(4);
    const review = JSON.parse(readFileSync(new URL("../../content/review.en.json", import.meta.url), "utf8"));
    expect(review).toMatchObject({ locale: "en", status: "pending", humanReview: "not-run" });
  });
});
