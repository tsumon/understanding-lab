import { expect, test } from "vitest";
import { newSession, SessionSchema, type Answer, type StoredFeedback } from "../../src/domain/contracts";
import { questionFor, questionForAnswer, questionLocaleFor, transition } from "../../src/domain/session";

const now = "2026-10-01T00:00:00.000Z";
const english: Answer = {
  id: "a", revision: 1, step: "explain", questionId: "explain-1", questionLocale: "en",
  text: "It may have fitted noise.", confirmedAt: now,
};

test("legacy parse preserves absent metadata while English history resolves its original question", () => {
  const old = newSession("legacy");
  expect(JSON.stringify(SessionSchema.parse(old))).toBe(JSON.stringify(old));
  const saved = transition(old, { type: "confirm", answer: english });
  expect(questionFor(saved, "explain-1")).toBe("你怎样解释训练误差很低，但新数据上表现不好？");
  expect(questionForAnswer(saved, saved.answers[0])).toBe("How would you explain very low training error but poor performance on new data?");
  expect(saved.answers[0].text).toBe("It may have fitted noise.");
  expect(questionLocaleFor(saved, "explain-1", "en")).toBe("en");
  expect(SessionSchema.safeParse({ ...saved, answers: [{ ...english, questionLocale: "fr" }] }).success).toBe(false);
});

test("answer revisions can retain distinct question locales without changing identity", () => {
  const first = transition(newSession("s1"), { type: "confirm", answer: english });
  const revised = transition(first, { type: "confirm", answer: { ...english, revision: 2, questionLocale: "zh-CN", text: "可能过拟合。" } });
  expect(revised.answers.map((answer) => questionForAnswer(revised, answer))).toEqual([
    "How would you explain very low training error but poor performance on new data?",
    "你怎样解释训练误差很低，但新数据上表现不好？",
  ]);
});

test("historical tutor wording and locale come from its feedback even if the UI language changes", () => {
  const feedback: StoredFeedback = {
    id: "f", contentRevision: 0, evidenceLocale: "zh-CN", responseLocale: "en",
    model: "test", promptVersion: "test", createdAt: now,
    output: { kind: "insufficient", claim: "Keep explaining", reason: "More detail needed",
      nextAction: "ask", question: "Which data did you mean?", quotes: [], sources: [], metrics: [] },
  };
  const session = { ...newSession("s1"), feedback: [feedback] };
  expect(questionFor(session, "tutor:f", "zh-CN")).toBe("Which data did you mean?");
  expect(questionLocaleFor(session, "tutor:f", "zh-CN")).toBe("en");
  expect(questionLocaleFor({ ...session, feedback: [{ ...feedback, responseLocale: undefined }] }, "tutor:f", "en")).toBe("zh-CN");
  expect(() => questionLocaleFor(session, "tutor:missing", "en")).toThrow("feedback-not-unique");
});
