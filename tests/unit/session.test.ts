import { expect, test } from "vitest";
import { newSession, SessionSchema, type Answer, type LearningSession, type Snapshot, type StoredFeedback } from "../../src/domain/contracts";
import { currentAnswer, currentFeedback, feedbackViews, hasCurrentEvidence, questionFor, transition } from "../../src/domain/session";

const now = "2026-09-26T00:00:00.000Z";
const answer = (step: Answer["step"] = "explain", round?: 1 | 2): Answer => ({
  id: `${step}-${round ?? 1}`, revision: 1, step, questionId: `${step}-${round ?? 1}`,
  text: "模型追随训练样本中的噪声。", confirmedAt: now,
  ...(round ? { clarificationRound: round } : {}),
});
const snapshot: Snapshot = {
  id: "snap1", packVersion: "overfitting.v1", config: { seed: 17, n: 20, noise: 0.1, degree: 2 },
  prediction: "验证误差可能升高", testRevealed: false, testContaminated: false,
};
const feedback = (revision: number, id = "f1"): StoredFeedback => ({
  id, contentRevision: revision, model: "test", promptVersion: "v1", createdAt: now,
  output: { kind: "supported", claim: "有证据", reason: "引用回答", nextAction: "ask", question: "这里的表现指哪份数据？",
    quotes: [{ answerId: "explain-1", answerRevision: 1, start: 0, end: 2, text: "模型" }], sources: [], metrics: [] },
});
const confirmed = () => transition(newSession("s1"), { type: "confirm", answer: answer() });
const advance = (s: LearningSession) => transition(s, { type: "continue" });
const back = (s: LearningSession) => transition(s, { type: "back" });
const atClarify = () => advance(confirmed());

test("jumping to experiment records unfinished earlier steps without inventing answers", () => {
  const next = transition(newSession("s1"), { type: "start-experiment" });
  expect(next.step).toBe("experiment");
  expect(next.skipped).toEqual(["explain", "clarify", "predict"]);
  expect(next.answers).toEqual([]);
  expect(hasCurrentEvidence(next)).toBe(false);
});

test("confirmed explanation is preserved when jumping over later unfinished steps", () => {
  expect(transition(confirmed(), { type: "start-experiment" }).skipped).toEqual(["clarify", "predict"]);
});

test("all seven stages advance only with a confirmed answer or experiment snapshot", () => {
  let s = newSession("s1");
  for (const [step, round] of [["explain", undefined], ["clarify", 1], ["clarify", 2], ["predict", undefined]] as const) {
    expect(s.step).toBe(step);
    expect(() => advance(s)).toThrow("confirmation-required");
    s = transition(s, { type: "confirm", answer: answer(step, round) });
    expect(s.step).toBe(step);
    s = advance(s);
  }
  expect(s.step).toBe("experiment");
  expect(() => advance(s)).toThrow("snapshot-required");
  s = advance(transition(s, { type: "snapshot", snapshot }));
  expect(s.step).toBe("reexplain");
  s = advance(transition(s, { type: "confirm", answer: answer("reexplain") }));
  expect(s.step).toBe("transfer");
  s = advance(transition(s, { type: "confirm", answer: answer("transfer") }));
  expect(s.step).toBe("summary");
  expect(advance(s)).toEqual(s);
  expect(transition(s, { type: "skip" })).toEqual(s);
  expect(s.clarificationCount).toBe(2);
});

test("back revisits both clarification rounds and preserves completed work", () => {
  let s = transition(atClarify(), { type: "confirm", answer: answer("clarify", 1) });
  s = transition(advance(s), { type: "confirm", answer: answer("clarify", 2) });
  s = advance(s);
  expect(s.step).toBe("predict");
  const second = back(s);
  expect(second.clarificationRound).toBe(2);
  expect(currentAnswer(second)?.questionId).toBe("clarify-2");
  const first = back(second);
  expect(first.clarificationRound).toBe(1);
  expect(currentAnswer(first)?.questionId).toBe("clarify-1");
  const revised = transition(first, { type: "confirm", answer: { ...answer("clarify", 1), revision: 2, text: "新解释" } });
  expect(revised.clarificationCount).toBe(2);
  expect(revised.answers).toHaveLength(4);
  expect(advance(advance(revised)).step).toBe("predict");
  expect(back(first).step).toBe("explain");
  expect(back(newSession("s1"))).toEqual(newSession("s1"));
});

test("back from summary retraces every later stage without deleting snapshots", () => {
  let s = transition(newSession("s1"), { type: "start-experiment" });
  s = transition(s, { type: "snapshot", snapshot });
  for (let i = 0; i < 3; i++) s = transition(s, { type: "skip" });
  for (const step of ["transfer", "reexplain", "experiment", "predict"]) {
    s = back(s);
    expect(s.step).toBe(step);
    expect(s.snapshots).toEqual([snapshot]);
  }
});

test("a third distinct clarification is rejected while revisions keep their original identity", () => {
  let s = transition(atClarify(), { type: "confirm", answer: answer("clarify", 1) });
  s = transition(advance(s), { type: "confirm", answer: answer("clarify", 2) });
  expect(() => transition(s, { type: "confirm", answer: { ...answer("clarify", 2), id: "third" } })).toThrow("answer-identity-conflict");
  expect(() => transition(s, { type: "confirm", answer: { ...answer("clarify", 1), revision: 2 } })).toThrow();
  expect(() => transition(s, { type: "confirm", answer: { ...answer("clarify", 2), clarificationRound: 3 } as unknown as Answer })).toThrow();
});

test("skipped clarification rounds are not counted as confirmed", () => {
  const second = transition(atClarify(), { type: "skip" });
  expect(second.clarificationRound).toBe(2);
  const done = transition(second, { type: "confirm", answer: answer("clarify", 2) });
  expect(done.clarificationCount).toBe(1);
  expect(done.skipped).toContain("clarify");
  const completed = transition(back(done), { type: "confirm", answer: answer("clarify", 1) });
  expect(completed.clarificationCount).toBe(2);
  expect(completed.skipped).not.toContain("clarify");
});

test("skipping the entire flow leaves no understanding evidence and deduplicates skip records", () => {
  let s = newSession("s1");
  for (let i = 0; i < 8; i++) s = transition(s, { type: "skip" });
  expect(s.step).toBe("summary");
  expect(s.skipped).toEqual(["explain", "clarify", "predict", "experiment", "reexplain", "transfer"]);
  expect(s.clarificationCount).toBe(0);
  expect(s.answers).toEqual([]);
  expect(hasCurrentEvidence(s)).toBe(false);
  expect(transition(back(s), { type: "skip" }).skipped).toEqual(s.skipped);
});

test.each(["", " \n\t", "🧠".repeat(4001)])("rejects empty or oversized confirmed text (%#)", (text) => {
  expect(() => transition(newSession("s1"), { type: "confirm", answer: { ...answer(), text } })).toThrow();
});

test("rejects questions from other steps, topics, or unknown feedback", () => {
  for (const questionId of ["transfer-1", "other-topic:explain-1", "tutor:missing", "explain-2"]) {
    expect(() => transition(newSession("s1"), { type: "confirm", answer: { ...answer(), questionId } })).toThrow();
  }
  expect(() => transition(newSession("s1"), { type: "confirm", answer: answer("transfer") })).toThrow();
  expect(() => transition(atClarify(), { type: "confirm", answer: answer("clarify", 2) })).toThrow();
});

test("only sequential answer revisions are accepted and earlier quoted versions survive", () => {
  const s = confirmed();
  for (const revision of [0, 1, 3]) expect(() => transition(s, { type: "confirm", answer: { ...answer(), revision } })).toThrow("answer-revision-conflict");
  const revised = transition(s, { type: "confirm", answer: { ...answer(), revision: 2, text: "新的解释" } });
  expect(revised.answers.map((a) => [a.revision, a.text])).toEqual([[1, "模型追随训练样本中的噪声。"], [2, "新的解释"]]);
  expect(currentAnswer(revised)?.revision).toBe(2);
  expect(revised.contentRevision).toBe(2);
  expect(s.answers).toHaveLength(1);
});

test("tutor clarification recovers its unique stored question and keeps navigation user driven", () => {
  const s = { ...atClarify(), feedback: [feedback(1)] };
  expect(questionFor(s, "tutor:f1")).toBe("这里的表现指哪份数据？");
  const next = transition(s, { type: "confirm", answer: { ...answer("clarify", 1), questionId: "tutor:f1" } });
  expect(next.step).toBe("clarify");
  expect(questionFor(next, "tutor:f1")).toBe("这里的表现指哪份数据？");
  expect(transition(next, { type: "confirm", answer: { ...answer("clarify", 1), questionId: "tutor:f1", revision: 2 } }).clarificationCount).toBe(1);
});

test("new tutor answers reject stale, missing, ambiguous, empty, or out of stage questions", () => {
  const a = { ...answer("clarify", 1), questionId: "tutor:f1" };
  const f = feedback(1);
  for (const entries of [[], [feedback(0)], [f, f], [{ ...f, output: { ...f.output, question: null } }], [{ ...f, output: { ...f.output, question: " " } }]]) {
    expect(() => transition({ ...atClarify(), feedback: entries }, { type: "confirm", answer: a })).toThrow();
  }
  expect(() => transition({ ...confirmed(), feedback: [f] }, { type: "confirm", answer: { ...answer(), revision: 2, questionId: "tutor:f1" } })).toThrow();
});

test("edits mark prior feedback stale and exclude it from current evidence and summaries", () => {
  const s = { ...confirmed(), feedback: [feedback(1)] };
  expect(hasCurrentEvidence(s)).toBe(true);
  expect(currentFeedback(s)).toHaveLength(1);
  const revised = transition(s, { type: "confirm", answer: { ...answer(), revision: 2, text: "修改解释" } });
  expect(feedbackViews(revised).map((v) => v.stale)).toEqual([true]);
  expect(currentFeedback(revised)).toEqual([]);
  expect(hasCurrentEvidence(revised)).toBe(false);
  expect(revised.feedback).toEqual(s.feedback);
});

test("answer alone, unrelated feedback, or skipped answer does not assert current evidence", () => {
  expect(hasCurrentEvidence(confirmed())).toBe(false);
  const f = feedback(1);
  expect(hasCurrentEvidence({ ...confirmed(), feedback: [{ ...f, output: { ...f.output, quotes: [] } }] })).toBe(false);
  const skipped = back(transition({ ...confirmed(), feedback: [f] }, { type: "skip" }));
  expect(hasCurrentEvidence(skipped)).toBe(false);
});

test("notes and snapshots change content revision, while navigation and no-op edits do not", () => {
  const s = confirmed();
  expect(advance(s).contentRevision).toBe(1);
  const notes = transition(s, { type: "set-notes", notes: "🧠".repeat(8000) });
  expect(notes.contentRevision).toBe(2);
  expect(transition(notes, { type: "set-notes", notes: notes.notes }).contentRevision).toBe(2);
  expect(() => transition(s, { type: "set-notes", notes: "🧠".repeat(8001) })).toThrow();
  const experiment = transition(s, { type: "start-experiment" });
  const snap = transition(experiment, { type: "snapshot", snapshot });
  expect(snap.contentRevision).toBe(experiment.contentRevision + 1);
  expect(() => transition(snap, { type: "snapshot", snapshot })).toThrow("snapshot-id-conflict");
  expect(() => transition(s, { type: "snapshot", snapshot })).toThrow("experiment-required");
});

test("disagreements reference this session only and remain separate from learning evidence", () => {
  const s = { ...confirmed(), feedback: [feedback(1)] };
  const next = transition(s, { type: "disagree", feedbackId: "f1", reason: "没有考虑上下文", createdAt: now });
  expect(next.disagreements).toEqual([{ feedbackId: "f1", reason: "没有考虑上下文", createdAt: now }]);
  expect(next.contentRevision).toBe(1);
  expect(next.answers).toEqual(s.answers);
  expect(() => transition(s, { type: "disagree", feedbackId: "foreign", reason: "不同意", createdAt: now })).toThrow();
  expect(() => transition(s, { type: "disagree", feedbackId: "f1", reason: " ", createdAt: now })).toThrow();
});

test("session schema persists round identity and rejects invalid or misplaced round metadata", () => {
  expect(newSession("s1").clarificationRound).toBe(1);
  const s = { ...atClarify(), answers: [answer("clarify", 1)] };
  expect(SessionSchema.safeParse(s).success).toBe(true);
  expect(SessionSchema.safeParse({ ...s, clarificationRound: 3 }).success).toBe(false);
  expect(SessionSchema.safeParse({ ...s, answers: [{ ...answer(), clarificationRound: 1 }] }).success).toBe(false);
  expect(SessionSchema.safeParse({ ...s, answers: [answer("clarify")] }).success).toBe(false);
});

test("resource caps reject extra answer versions and snapshots without changing history", () => {
  const s = { ...confirmed(), answers: Array.from({ length: 50 }, (_, i) => ({ ...answer(), revision: i + 1 })) };
  expect(() => transition(s, { type: "confirm", answer: { ...answer(), revision: 51 } })).toThrow();
  const e = { ...transition(newSession("s1"), { type: "start-experiment" }), snapshots: Array.from({ length: 100 }, (_, i) => ({ ...snapshot, id: `s${i}` })) };
  expect(() => transition(e, { type: "snapshot", snapshot })).toThrow();
  expect(e.snapshots).toHaveLength(100);
});
