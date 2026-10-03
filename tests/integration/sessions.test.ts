import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import { newSession, type LearningSession } from "../../src/domain/contracts";
import { SessionRepository } from "../../src/server/sessions";

const cleanup: Array<() => void> = [];
afterEach(() => { for (const close of cleanup.splice(0).reverse()) close(); });
function database(path = ":memory:") {
  const db = new Database(path, { timeout: 0 });
  cleanup.push(() => db.close());
  return db;
}
function setup(db = database()) {
  const repo = new SessionRepository(db);
  repo.migrate();
  return { db, repo };
}
function history(): LearningSession {
  return {
    ...newSession("s1"), step: "summary", contentRevision: 5, clarificationCount: 2, clarificationRound: 2,
    answers: [
      { id: "a", revision: 1, step: "explain", questionId: "explain-1", text: "训练误差低", confirmedAt: "2026-09-26" },
      { id: "a", revision: 2, step: "explain", questionId: "explain-1", text: "仍需验证泛化", confirmedAt: "2026-09-27" },
      { id: "c", revision: 1, step: "clarify", questionId: "clarify-2", clarificationRound: 2, text: "未见数据", confirmedAt: "2026-09-27" },
    ],
    snapshots: [{ id: "snap", packVersion: "overfitting.v1", config: { seed: 17, n: 20, noise: 0.1, degree: 2 }, prediction: "误差降低", testRevealed: false, testContaminated: false }],
    feedback: [{ id: "f", contentRevision: 1, model: "untrusted-provider-claim", promptVersion: "untrusted-prompt-claim", createdAt: "2026-09-26", output: {
      kind: "supported", claim: "应观察泛化", reason: "训练不是全部", nextAction: "ask", question: "验证结果如何？",
      quotes: [{ answerId: "a", answerRevision: 1, start: 0, end: 4, text: "训练误差" }],
      sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1" }], metrics: [{ snapshotId: "snap", metric: "validationMse" }],
    } }],
    disagreements: [{ feedbackId: "f", reason: "补充说明", createdAt: "2026-09-27" }],
  };
}

test("重试幂等，旧修订冲突，跨账号不可见", () => {
  const { repo } = setup();
  const draft = newSession("s1");
  const saved = repo.save("alice", "s1", 0, "k1", draft);
  expect(saved).toEqual({ session: draft, serverRevision: 1 });
  expect(repo.save("alice", "s1", 0, "k1", draft)).toEqual(saved);
  expect(() => repo.save("alice", "s1", 0, "k2", draft)).toThrow("409");
  expect(() => repo.get("bob", "s1")).toThrow("404");
});

test("constructor never migrates; explicit migration is repeatable and preserves data", () => {
  const db = database();
  const repo = new SessionRepository(db);
  expect(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()).toEqual([]);
  repo.migrate();
  repo.save("alice", "s1", 0, "k", newSession("s1"));
  repo.migrate();
  expect(repo.get("alice", "s1").serverRevision).toBe(1);
});

test("all reads, exports, writes and deletes hide foreign IDs exactly like missing IDs", () => {
  const { repo } = setup();
  repo.save("alice", "s1", 0, "k", newSession("s1"));
  repo.save("bob", "b1", 0, "k", newSession("b1"));
  expect(repo.list("bob").map((item) => item.session.id)).toEqual(["b1"]);
  for (const id of ["s1", "missing"]) {
    expect(() => repo.get("bob", id)).toThrow("404");
    expect(() => repo.export("bob", id)).toThrow("404");
    expect(() => repo.remove("bob", id)).toThrow("404");
    expect(() => repo.save("bob", id, 1, "other", newSession(id))).toThrow("404");
  }
  expect(() => repo.save("bob", "s1", 0, "create", newSession("s1"))).toThrow("404");
  expect(repo.export("alice", "s1")).toEqual(repo.get("alice", "s1"));
});

test("canonical retry survives key order, later revisions and reconnect without overwriting", () => {
  const directory = mkdtempSync(join(tmpdir(), "learning-session-"));
  cleanup.push(() => rmSync(directory, { recursive: true }));
  const path = join(directory, "test.sqlite");
  const { repo } = setup(database(path));
  const draft = history();
  const first = repo.save("alice", "s1", 0, "first", draft);
  const reverse = (value: unknown): unknown => Array.isArray(value) ? value.map(reverse)
    : value !== null && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverse(item)])) : value;
  expect(repo.save("alice", "s1", 0, "first", reverse(draft))).toEqual(first);
  repo.save("alice", "s1", 1, "second", { ...draft, notes: "updated" });
  const reconnected = new SessionRepository(database(path));
  expect(reconnected.save("alice", "s1", 0, "first", draft)).toEqual(first);
  expect(reconnected.get("alice", "s1")).toMatchObject({ serverRevision: 2, session: { notes: "updated" } });
});

test("idempotency binds owner, session, base revision and the entire original body", () => {
  const { repo } = setup();
  const draft = history();
  repo.save("alice", "s1", 0, "k", draft);
  expect(() => repo.save("alice", "s1", 0, "k", { ...draft, notes: "different" })).toThrow("409");
  expect(() => repo.save("alice", "s1", 1, "k", draft)).toThrow("409");
  expect(() => repo.save("alice", "s2", 0, "k", { ...draft, id: "s2" })).toThrow("409");
  const changedMetadata = structuredClone(draft);
  changedMetadata.feedback[0].model = "different-claim";
  expect(() => repo.save("alice", "s1", 0, "k", changedMetadata)).toThrow("409");
  expect(repo.save("bob", "b1", 0, "k", newSession("b1")).serverRevision).toBe(1);
});

test("delete clears body and replay cache, retains only tombstone and cannot resurrect", () => {
  const { db, repo } = setup();
  const draft = history();
  repo.save("alice", "s1", 0, "k", draft);
  repo.remove("alice", "s1");
  const row = db.prepare("SELECT payload, revision, deleted_at FROM learning_sessions WHERE id='s1'").get();
  expect(row).toEqual({ payload: null, revision: 2, deleted_at: expect.any(String) });
  expect(db.prepare("SELECT * FROM save_keys").all()).toEqual([]);
  expect(repo.list("alice")).toEqual([]);
  expect(() => repo.save("alice", "s1", 0, "k", draft)).toThrow("410");
  expect(() => repo.save("alice", "s1", 0, "new", draft)).toThrow("410");
  for (const action of [() => repo.get("alice", "s1"), () => repo.export("alice", "s1"), () => repo.remove("alice", "s1")]) expect(action).toThrow("410");
  expect(() => repo.get("bob", "s1")).toThrow("404");
});

test("two connections with the same revision have exactly one winner", () => {
  const directory = mkdtempSync(join(tmpdir(), "learning-cas-"));
  cleanup.push(() => rmSync(directory, { recursive: true }));
  const path = join(directory, "test.sqlite");
  const { repo: first } = setup(database(path));
  const second = new SessionRepository(database(path));
  first.save("alice", "s1", 0, "create", newSession("s1"));
  const a = first.get("alice", "s1"), b = second.get("alice", "s1");
  first.save("alice", "s1", a.serverRevision, "a", { ...a.session, notes: "winner" });
  expect(() => second.save("alice", "s1", b.serverRevision, "b", { ...b.session, notes: "loser" })).toThrow("409");
  expect(second.get("alice", "s1")).toMatchObject({ serverRevision: 2, session: { notes: "winner" } });
});

test("busy database does not consume a retry key or change data", () => {
  const directory = mkdtempSync(join(tmpdir(), "learning-busy-"));
  cleanup.push(() => rmSync(directory, { recursive: true }));
  const path = join(directory, "test.sqlite");
  const { db, repo } = setup(database(path));
  repo.save("alice", "s1", 0, "create", newSession("s1"));
  const blocker = database(path);
  blocker.exec("BEGIN IMMEDIATE");
  try { expect(() => repo.save("alice", "s1", 1, "retry", { ...newSession("s1"), notes: "new" })).toThrow(/locked|busy/); }
  finally { blocker.exec("ROLLBACK"); }
  expect(db.prepare("SELECT count(*) AS n FROM save_keys").get()).toEqual({ n: 1 });
  expect(repo.get("alice", "s1").serverRevision).toBe(1);
  expect(repo.save("alice", "s1", 1, "retry", { ...newSession("s1"), notes: "new" }).serverRevision).toBe(2);
});

test("SQLite abort after payload mutation rolls back both body and idempotency", () => {
  const { db, repo } = setup();
  repo.save("alice", "s1", 0, "create", newSession("s1"));
  db.exec("CREATE TEMP TRIGGER fail_save BEFORE INSERT ON save_keys BEGIN SELECT RAISE(ABORT, 'injected-write-failure'); END");
  expect(() => repo.save("alice", "s1", 1, "update", { ...newSession("s1"), notes: "must-roll-back" })).toThrow("injected-write-failure");
  expect(() => repo.save("alice", "s2", 0, "new", newSession("s2"))).toThrow("injected-write-failure");
  expect(repo.get("alice", "s1")).toMatchObject({ serverRevision: 1, session: { notes: "" } });
  expect(() => repo.get("alice", "s2")).toThrow("404");
  db.exec("DROP TRIGGER fail_save");
  expect(repo.save("alice", "s1", 1, "update", newSession("s1")).serverRevision).toBe(2);
});

test("create races surface as revision conflicts, not raw SQLite errors", () => {
  const { db, repo } = setup();
  db.exec("CREATE TEMP TRIGGER fail_create BEFORE INSERT ON learning_sessions BEGIN SELECT RAISE(ABORT, 'UNIQUE constraint failed: learning_sessions.id'); END");
  expect(() => repo.save("alice", "s1", 0, "k", newSession("s1"))).toThrow("409");
  expect(db.prepare("SELECT * FROM learning_sessions").all()).toEqual([]);
  expect(db.prepare("SELECT * FROM save_keys").all()).toEqual([]);
});

test("delete and its replay-cache cleanup are one atomic transaction", () => {
  const { db, repo } = setup();
  const draft = newSession("s1");
  const saved = repo.save("alice", "s1", 0, "k", draft);
  db.exec("CREATE TEMP TRIGGER fail_delete BEFORE DELETE ON save_keys BEGIN SELECT RAISE(ABORT, 'injected-delete-failure'); END");
  expect(() => repo.remove("alice", "s1")).toThrow("injected-delete-failure");
  expect(repo.get("alice", "s1")).toEqual(saved);
  expect(repo.save("alice", "s1", 0, "k", draft)).toEqual(saved);
});

test("historical feedback keeps old exact evidence and round identity but is marked 本机恢复", () => {
  const { repo } = setup();
  const draft = history();
  const saved = repo.save("alice", "s1", 0, "k", draft);
  expect(saved.session.feedback[0]).toEqual({ ...draft.feedback[0], model: "本机恢复", promptVersion: "local-recovery-v1" });
  expect(repo.get("alice", "s1")).toEqual(saved);
  expect(repo.export("alice", "s1")).toEqual(saved);
  expect(saved.session.answers).toEqual(draft.answers);
  expect(saved.session.clarificationRound).toBe(2);
  expect(draft.feedback[0].model).toBe("untrusted-provider-claim");
});

test("English provenance survives save/load, recovery normalization, and key replay", () => {
  const { repo } = setup();
  const draft = history();
  draft.answers[0].questionLocale = "en";
  draft.feedback[0].evidenceLocale = "en";
  draft.feedback[0].responseLocale = "zh-CN";
  const first = repo.save("alice", "s1", 0, "locale-key", draft);
  expect(first.session.answers[0].questionLocale).toBe("en");
  expect(first.session.feedback[0]).toMatchObject({ evidenceLocale: "en", responseLocale: "zh-CN",
    model: "本机恢复", promptVersion: "local-recovery-v1" });
  expect(repo.get("alice", "s1")).toEqual(first);
  expect(repo.save("alice", "s1", 0, "locale-key", draft)).toEqual(first);
  expect(() => repo.save("alice", "s1", 0, "locale-key", { ...draft, answers: [
    { ...draft.answers[0], questionLocale: "zh-CN" }, ...draft.answers.slice(1),
  ] })).toThrow("409");
});

test.each([
  ["wrong session ID", (s: LearningSession) => { s.id = "other"; }],
  ["unknown question", (s: LearningSession) => { s.answers[0].questionId = "unknown"; }],
  ["duplicate answer revision", (s: LearningSession) => { s.answers.push({ ...s.answers[0] }); }],
  ["ambiguous snapshot", (s: LearningSession) => { s.snapshots.push({ ...s.snapshots[0] }); }],
  ["ambiguous feedback", (s: LearningSession) => { s.feedback.push({ ...s.feedback[0] }); }],
  ["invented quote", (s: LearningSession) => { s.feedback[0].output.quotes[0].text = "编造"; }],
  ["foreign answer", (s: LearningSession) => { s.feedback[0].output.quotes[0].answerId = "foreign"; }],
  ["missing source", (s: LearningSession) => { s.feedback[0].output.sources[0].paragraphId = "unknown"; }],
  ["foreign snapshot", (s: LearningSession) => { s.feedback[0].output.metrics[0].snapshotId = "foreign"; }],
  ["hidden test", (s: LearningSession) => { s.feedback[0].output.metrics[0].metric = "testMse"; }],
  ["unknown pack", (s: LearningSession) => { Object.assign(s.snapshots[0], { packVersion: "../../private" }); }],
  ["invented metric value", (s: LearningSession) => { Object.assign(s.snapshots[0], { trainMse: 0 }); }],
  ["unknown configuration", (s: LearningSession) => { s.snapshots[0].config.degree = 13; }],
  ["dangling disagreement", (s: LearningSession) => { s.disagreements[0].feedbackId = "foreign"; }],
  ["numeric model prose", (s: LearningSession) => { s.feedback[0].output.reason = "MSE 为 0.001"; }],
] as const)("rejects %s without storing learning body or retry key", (_name, change) => {
  const { db, repo } = setup();
  const draft = history(); change(draft);
  expect(() => repo.save("alice", "s1", 0, "k", draft)).toThrow("400");
  expect(db.prepare("SELECT * FROM learning_sessions").all()).toEqual([]);
  expect(db.prepare("SELECT * FROM save_keys").all()).toEqual([]);
});

test("rejects invalid revision/key/owner and schema before storing", () => {
  const { repo } = setup();
  for (const revision of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) expect(() => repo.save("alice", "s1", revision, "k", newSession("s1"))).toThrow("400");
  expect(() => repo.save("alice", "s1", 0, "", newSession("s1"))).toThrow("400");
  expect(() => repo.save("", "s1", 0, "k", newSession("s1"))).toThrow("400");
  expect(() => repo.save("alice", "s1", 0, "k", { ...newSession("s1"), ownerId: "bob" })).toThrow("400");
});
