import { expect, test } from "vitest";
import topic from "../../content/overfitting.v1.json";
import { newSession, SessionSchema, TopicSchema } from "../../src/domain/contracts";

test("主题证据 ID 稳定，新会话没有虚构的掌握记录", () => {
  const parsed = TopicSchema.parse(topic);
  expect(parsed.version).toBe("overfitting.v1");
  expect(new Set(parsed.paragraphs.map((paragraph) => paragraph.id)).size).toBe(4);
  expect(parsed.questions.map((question) => question.id)).toContain("transfer-1");
  expect(newSession("local-1")).toEqual({
    schemaVersion: 1,
    id: "local-1",
    topicVersion: "overfitting.v1",
    contentRevision: 0,
    step: "explain",
    clarificationCount: 0,
    skipped: [],
    answers: [],
    snapshots: [],
    notes: "",
    feedback: [],
    disagreements: [],
  });
});

test("主题及其段落和问题拒绝未知字段", () => {
  expect(TopicSchema.safeParse({ ...topic, unknown: true }).success).toBe(false);
  expect(TopicSchema.safeParse({
    ...topic,
    paragraphs: [{ ...topic.paragraphs[0], unknown: true }, ...topic.paragraphs.slice(1)],
  }).success).toBe(false);
  expect(TopicSchema.safeParse({
    ...topic,
    questions: [{ ...topic.questions[0], unknown: true }, ...topic.questions.slice(1)],
  }).success).toBe(false);
});

test("会话及其每种嵌套记录拒绝未知字段", () => {
  const session = newSession("local-1");
  const answer = {
    id: "a1", revision: 1, step: "explain", questionId: "explain-1",
    text: "我的解释", confirmedAt: "2026-09-26T00:00:00.000Z",
  };
  const snapshot = {
    id: "s1", packVersion: "overfitting.v1", config: {
      seed: 17, n: 20, noise: 0.1, degree: 3,
    }, prediction: "验证误差可能升高", testRevealed: false, testContaminated: false,
  };
  const feedback = {
    id: "f1", contentRevision: 1, model: "local", promptVersion: "v1",
    createdAt: "2026-09-26T00:00:00.000Z",
    output: {
      kind: "insufficient", claim: "证据不足", reason: "还需观察",
      nextAction: "experiment", question: null, quotes: [], sources: [], metrics: [],
    },
  };
  const disagreement = { feedbackId: "f1", reason: "不同意", createdAt: "2026-09-26T00:00:00.000Z" };
  const valid = { ...session, answers: [answer], snapshots: [snapshot], feedback: [feedback], disagreements: [disagreement] };
  expect(SessionSchema.safeParse(valid).success).toBe(true);
  const invalid = [
    { ...valid, extra: true },
    { ...valid, answers: [{ ...answer, extra: true }] },
    { ...valid, snapshots: [{ ...snapshot, extra: true }] },
    { ...valid, snapshots: [{ ...snapshot, config: { ...snapshot.config, extra: true } }] },
    { ...valid, feedback: [{ ...feedback, extra: true }] },
    { ...valid, feedback: [{ ...feedback, output: { ...feedback.output, extra: true } }] },
    { ...valid, feedback: [{ ...feedback, output: { ...feedback.output, quotes: [{ answerId: "a1", answerRevision: 1, start: 0, end: 1, text: "我", extra: true }] } }] },
    { ...valid, feedback: [{ ...feedback, output: { ...feedback.output, sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1", extra: true }] } }] },
    { ...valid, feedback: [{ ...feedback, output: { ...feedback.output, metrics: [{ snapshotId: "s1", metric: "trainMse", extra: true }] } }] },
    { ...valid, disagreements: [{ ...disagreement, extra: true }] },
  ];
  for (const record of invalid) expect(SessionSchema.safeParse(record).success).toBe(false);
});

test("选项和集合数量遵守首版边界", () => {
  const session = newSession("local-1");
  const snapshot = {
    id: "s1", packVersion: "overfitting.v1", config: {
      seed: 17, n: 20, noise: 0.1, degree: 3,
    }, prediction: "预测", testRevealed: false, testContaminated: false,
  };
  for (const config of [
    { ...snapshot.config, seed: 99 },
    { ...snapshot.config, n: 30 },
    { ...snapshot.config, noise: 0.2 },
    { ...snapshot.config, degree: 0 },
    { ...snapshot.config, degree: 13 },
  ]) {
    expect(SessionSchema.safeParse({ ...session, snapshots: [{ ...snapshot, config }] }).success).toBe(false);
  }
  expect(SessionSchema.safeParse({ ...session, clarificationCount: 3 }).success).toBe(false);
  expect(SessionSchema.safeParse({ ...session, snapshots: Array.from({ length: 101 }, (_, index) => ({ ...snapshot, id: `s${index}` })) }).success).toBe(false);
  const answer = { id: "a1", revision: 1, step: "explain", questionId: "explain-1", text: "解释", confirmedAt: "2026-09-26T00:00:00.000Z" };
  expect(SessionSchema.safeParse({ ...session, answers: Array.from({ length: 51 }, (_, index) => ({ ...answer, id: `a${index}` })) }).success).toBe(false);
  const feedback = { id: "f1", contentRevision: 0, model: "local", promptVersion: "v1", createdAt: "2026-09-26T00:00:00.000Z", output: { kind: "insufficient", claim: "", reason: "", nextAction: "ask", question: null, quotes: [], sources: [], metrics: [] } };
  expect(SessionSchema.safeParse({ ...session, feedback: Array.from({ length: 101 }, (_, index) => ({ ...feedback, id: `f${index}` })) }).success).toBe(false);
});

test("回答和笔记按 Unicode 码点计长；引用位置按 JS UTF-16 切片", () => {
  const session = newSession("local-1");
  const answer = { id: "a1", revision: 1, step: "explain", questionId: "explain-1", text: "🧠".repeat(4000), confirmedAt: "2026-09-26T00:00:00.000Z" };
  expect(SessionSchema.safeParse({ ...session, answers: [answer], notes: "🧠".repeat(8000) }).success).toBe(true);
  expect(SessionSchema.safeParse({ ...session, answers: [{ ...answer, text: "🧠".repeat(4001) }] }).success).toBe(false);
  expect(SessionSchema.safeParse({ ...session, notes: "🧠".repeat(8001) }).success).toBe(false);

  const quotedAnswer = { ...answer, text: "🧠规律" };
  const quote = { answerId: "a1", answerRevision: 1, start: 0, end: 2, text: "🧠" };
  const feedback = { id: "f1", contentRevision: 1, model: "local", promptVersion: "v1", createdAt: "2026-09-26T00:00:00.000Z", output: { kind: "supported", claim: "", reason: "", nextAction: "ask", question: null, quotes: [quote], sources: [], metrics: [] } };
  expect(quotedAnswer.text.slice(quote.start, quote.end)).toBe(quote.text);
  expect([...quotedAnswer.text].slice(quote.start, quote.end).join("")).not.toBe(quote.text);
  expect(SessionSchema.safeParse({ ...session, answers: [quotedAnswer], feedback: [feedback] }).success).toBe(true);
});
