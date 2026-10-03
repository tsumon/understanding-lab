import { afterEach, expect, test, vi } from "vitest";
import request from "supertest";
import type Database from "better-sqlite3";
import { createApp } from "../../src/server/app";
import { newSession, type LearningSession, type TutorOutput } from "../../src/domain/contracts";
import { QuotaLedger } from "../../src/server/quota";
import { SessionRepository } from "../../src/server/sessions";
import { testDependencies } from "../helpers/server";

const valid: TutorOutput = {
  kind: "insufficient", claim: "证据尚不足", reason: "请解释训练与泛化的关系", nextAction: "ask",
  question: "你会怎样判断泛化？", quotes: [], sources: [], metrics: [],
};

const resources: Array<{ close(): void }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const resource of resources.splice(0).reverse()) resource.close();
});

async function setup(userId: string) {
  const deps = await testDependencies({ userId });
  new SessionRepository(deps.db).migrate();
  new QuotaLedger(deps.db).migrate();
  resources.push(deps);
  return deps;
}

function post(app: ReturnType<typeof createApp>, origin: string, body: object) {
  return request(app).post("/api/tutor").set("Origin", origin).send(body);
}

function usageCount(db: Database.Database, ownerId: string, kind = "tutor") {
  return (db.prepare("SELECT COUNT(*) AS n FROM usage_operations WHERE owner_id = ? AND kind = ?")
    .get(ownerId, kind) as { n: number }).n;
}

function tutorBody(requestId: string, session: LearningSession, extra: { includeNotes?: boolean; locale?: string } = {}) {
  return { requestId, session, includeNotes: extra.includeNotes ?? false, sendConsent: true as const,
    ...(extra.locale === undefined ? {} : { locale: extra.locale }) };
}

test("没有发送同意不能消费模型调用", async () => {
  const deps = await testDependencies({ userId: "alice" });
  const generate = vi.spyOn(deps.tutorProvider, "generate");
  const result = await request(createApp(deps))
    .post("/api/tutor").set("Origin", deps.publicOrigin)
    .send({ requestId: "r1", session: newSession("s1"), includeNotes: false });
  expect(result.status).toBe(400);
  expect(result.body).toEqual({ error: "consent-required" });
  expect(generate).not.toHaveBeenCalled();
  deps.close();
});

test("sendConsent must be true before any provider call", async () => {
  const deps = await setup("alice");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const app = createApp(deps);
  for (const body of [
    { requestId: "r1", session: newSession("s1"), includeNotes: false, sendConsent: false },
    { requestId: "r1", session: newSession("s1"), includeNotes: false, sendConsent: "true" },
  ]) {
    const response = await post(app, deps.publicOrigin, body);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: "consent-required" });
  }
  const invalid = await post(app, deps.publicOrigin, { requestId: "r1", session: { ...newSession("s1"), step: "nope" }, includeNotes: false, sendConsent: true });
  expect(invalid.status).toBe(400);
  expect(invalid.body).toEqual({ error: "invalid-request" });
  expect(generate).not.toHaveBeenCalled();
});

test("consented tutor returns server model metadata and allows ephemeral local ids", async () => {
  const deps = await setup("alice");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const session = {
    ...newSession("local-only-uuid"),
    notes: "keep-out",
    feedback: [{
      id: "f", contentRevision: 0, model: "gpt-evil", promptVersion: "evil-v1",
      createdAt: "2026-09-26T00:00:00Z",
      output: { kind: "insufficient" as const, claim: "", reason: "", nextAction: "ask" as const,
        question: "先前问题？", quotes: [], sources: [], metrics: [] },
    }],
  };
  const response = await post(createApp(deps), deps.publicOrigin, tutorBody("r-ok", session));
  expect(response.status).toBe(200);
  expect(response.body).toEqual({
    requestId: "r-ok", contentRevision: 0,
    result: { status: "ok", output: valid, model: "test-fake", promptVersion: "overfitting-tutor-v2",
      evidenceLocale: "zh-CN", responseLocale: "zh-CN" },
  });
  expect(response.body.result.model).not.toBe("gpt-evil");
});

test("English tutor request uses English evidence while retaining original Chinese history", async () => {
  const deps = await setup("alice");
  const answerText = "训练误差不是全部";
  const generate = vi.fn().mockResolvedValue({ ...valid, claim: "Training fit is not enough", reason: "Consider unseen data",
    question: "What does the validation set show?", quotes: [{ answerId: "a", answerRevision: 1, start: 0, end: answerText.length, text: answerText }] });
  deps.tutorProvider = { model: "test-fake", generate };
  const session = { ...newSession("s1"), answers: [{ id: "a", revision: 1, step: "explain" as const,
    questionId: "explain-1", text: answerText, confirmedAt: "2026-10-01" }] };
  const response = await post(createApp(deps), deps.publicOrigin, tutorBody("en-1", session, { locale: "en" }));
  expect(response.status).toBe(200);
  expect(response.body.result).toMatchObject({ status: "ok", promptVersion: "overfitting-tutor-v2",
    evidenceLocale: "en", responseLocale: "en", output: { quotes: [{ text: answerText }] } });
  const prompt = generate.mock.calls[0][0] as { system: string; data: string };
  const data = JSON.parse(prompt.data);
  expect(data.topic.title).toBe("Why low training error does not guarantee better performance");
  expect(data.answers[0].question).toBe("你怎样解释训练误差很低，但新数据上表现不好？");
  expect(prompt.system).toContain("UTF-16");
  expect(prompt.system).toContain("untrusted-personal-note");
});

test("invalid locale is rejected before provider use and locale is part of explicit request identity", async () => {
  const deps = await setup("alice");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const app = createApp(deps), session = newSession("s1");
  expect((await post(app, deps.publicOrigin, tutorBody("bad", session, { locale: "fr" }))).status).toBe(400);
  expect(generate).not.toHaveBeenCalled();
  expect((await post(app, deps.publicOrigin, tutorBody("same", session))).status).toBe(200);
  expect((await post(app, deps.publicOrigin, tutorBody("same", session, { locale: "en" }))).body)
    .toEqual({ error: "already-used" });
  expect(generate).toHaveBeenCalledTimes(1);
});

test("31st tutor reserve in one UTC day is 429 and generate is called at most 30 times", async () => {
  const deps = await setup("alice");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const app = createApp(deps);
  const quota = new QuotaLedger(deps.db);
  for (let i = 0; i < 30; i++) {
    const response = await post(app, deps.publicOrigin, tutorBody(`http-${i}`, newSession("s1")));
    expect(response.status).toBe(200);
  }
  expect(quota.reserveOperation("alice", "quota-31", "tutor", "unused-hash", deps.clock())).toBe("limit");
  const last = await post(app, deps.publicOrigin, tutorBody("http-30", newSession("s1")));
  expect(last.status).toBe(429);
  expect(last.body).toEqual({ error: "quota-exhausted" });
  expect(generate).toHaveBeenCalledTimes(30);
  expect(usageCount(deps.db, "alice")).toBe(30);
});

test("five concurrent HTTP tutor calls reject the fifth with 503 before generate", async () => {
  const deps = await setup("alice");
  let release!: (value: unknown) => void;
  const gate = new Promise((resolve) => { release = resolve; });
  const generate = vi.fn(async () => { await gate; return valid; });
  deps.tutorProvider = { model: "test-fake", generate };
  const app = createApp(deps);
  const hanging = [0, 1, 2, 3].map((i) =>
    Promise.resolve(post(app, deps.publicOrigin, tutorBody(`c${i}`, newSession(`c${i}`)))));
  await expect.poll(() => generate.mock.calls.length).toBe(4);
  const fifth = await post(app, deps.publicOrigin, tutorBody("c4", newSession("c4")));
  expect(fifth.status).toBe(503);
  expect(fifth.body).toEqual({ error: "unavailable" });
  expect(generate).toHaveBeenCalledTimes(4);
  expect(usageCount(deps.db, "alice")).toBe(4);
  release(valid);
  expect((await Promise.all(hanging)).map((item) => item.status)).toEqual([200, 200, 200, 200]);
});

test("global fifth overlapping in-flight is 503 and does not increment daily quota", async () => {
  const deps = await setup("alice");
  const quota = new QuotaLedger(deps.db);
  const now = deps.clock();
  for (let i = 0; i < 4; i++) {
    expect(quota.reserveOperation("other", `live-${i}`, "tutor", `h${i}`, now)).toBe("reserved");
  }
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const fifth = await post(createApp(deps), deps.publicOrigin, tutorBody("g4", newSession("s4")));
  expect(fifth.status).toBe(503);
  expect(fifth.body).toEqual({ error: "unavailable" });
  expect(generate).not.toHaveBeenCalled();
  expect(usageCount(deps.db, "alice")).toBe(0);
  expect(usageCount(deps.db, "other")).toBe(4);
  for (let i = 0; i < 4; i++) quota.finishOperation("other", `live-${i}`, true);
  expect((await post(createApp(deps), deps.publicOrigin, tutorBody("g5", newSession("s5")))).status).toBe(200);
  expect(generate).toHaveBeenCalledTimes(1);
  expect(usageCount(deps.db, "alice")).toBe(1);
});

test("foreign session id is 404 and does not call generate", async () => {
  const deps = await setup("alice");
  new SessionRepository(deps.db).save("bob", "s1", 0, "k1", newSession("s1"));
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const response = await post(createApp(deps), deps.publicOrigin, tutorBody("r1", newSession("s1")));
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ error: "not-found" });
  expect(generate).not.toHaveBeenCalled();
});

test("deleted session id is 410", async () => {
  const deps = await setup("alice");
  const repo = new SessionRepository(deps.db);
  repo.save("alice", "gone", 0, "k1", newSession("gone"));
  repo.remove("alice", "gone");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const response = await post(createApp(deps), deps.publicOrigin, tutorBody("r1", newSession("gone")));
  expect(response.status).toBe(410);
  expect(response.body).toEqual({ error: "deleted" });
  expect(generate).not.toHaveBeenCalled();
});

test("includeNotes false strips notes before the provider prompt", async () => {
  const deps = await setup("alice");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const session = { ...newSession("s1"), notes: "SECRET-NOTE-TEXT" };
  const app = createApp(deps);
  expect((await post(app, deps.publicOrigin, tutorBody("n1", session))).status).toBe(200);
  const data = JSON.parse(generate.mock.calls[0][0].data as string) as { notes?: unknown };
  expect(data.notes).toBeUndefined();
  expect(generate.mock.calls[0][0].data).not.toContain("SECRET-NOTE-TEXT");
  expect((await post(app, deps.publicOrigin, tutorBody("n2", session, { includeNotes: true }))).status).toBe(200);
  expect(JSON.parse(generate.mock.calls[1][0].data as string).notes).toEqual({
    kind: "untrusted-personal-note", text: "SECRET-NOTE-TEXT",
  });
});

test("double submit of the same requestId and hash does not bill twice", async () => {
  const deps = await setup("alice");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const app = createApp(deps);
  const body = tutorBody("dup", newSession("s1"));
  expect((await post(app, deps.publicOrigin, body)).status).toBe(200);
  const replay = await post(app, deps.publicOrigin, body);
  expect(replay.status).toBe(409);
  expect(replay.body).toEqual({ error: "already-used" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(usageCount(deps.db, "alice")).toBe(1);
  const conflict = await post(app, deps.publicOrigin, tutorBody("dup", { ...newSession("s1"), notes: "changed" }));
  expect(conflict.status).toBe(409);
  expect(conflict.body).toEqual({ error: "already-used" });
  expect(generate).toHaveBeenCalledTimes(1);
});

test("stale in-flight leftover allows a new requestId but never resends the old id", async () => {
  const deps = await setup("alice");
  const quota = new QuotaLedger(deps.db);
  const staleAt = new Date(deps.clock().getTime() - 61_000);
  expect(quota.reserveOperation("alice", "old-id", "tutor", "old-hash", staleAt)).toBe("reserved");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const app = createApp(deps);
  expect((await post(app, deps.publicOrigin, tutorBody("new-id", newSession("s-new")))).status).toBe(200);
  const retry = await post(app, deps.publicOrigin, tutorBody("old-id", newSession("s-old")));
  expect(retry.status).toBe(409);
  expect(retry.body).toEqual({ error: "already-used" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(quota.reserveOperation("alice", "old-id", "tutor", "old-hash", deps.clock())).toBe("already-used");
});

test("transcribe kind has a separate daily limit of 10 and does not block tutor", async () => {
  const deps = await setup("alice");
  const quota = new QuotaLedger(deps.db);
  const now = deps.clock();
  for (let i = 0; i < 10; i++) {
    expect(quota.reserveOperation("alice", `tr-${i}`, "transcribe", `h${i}`, now)).toBe("reserved");
    quota.finishOperation("alice", `tr-${i}`, true);
  }
  expect(quota.reserveOperation("alice", "tr-10", "transcribe", "h10", now)).toBe("limit");
  expect(quota.reserveOperation("alice", "tutor-1", "tutor", "th", now)).toBe("reserved");
});

test("UTC day boundary resets the daily tutor count", async () => {
  const deps = await setup("alice");
  const quota = new QuotaLedger(deps.db);
  const late = new Date("2026-09-26T23:59:59.000Z");
  for (let i = 0; i < 30; i++) {
    expect(quota.reserveOperation("alice", `d${i}`, "tutor", `h${i}`, late)).toBe("reserved");
    quota.finishOperation("alice", `d${i}`, true);
  }
  expect(quota.reserveOperation("alice", "same-day", "tutor", "hx", late)).toBe("limit");
  expect(quota.reserveOperation("alice", "next-day", "tutor", "hy", new Date("2026-09-27T00:00:00.000Z"))).toBe("reserved");
});

test("tutor JSON over 128kb is 413 and does not call generate", async () => {
  const deps = await setup("alice");
  const generate = vi.fn().mockResolvedValue(valid);
  deps.tutorProvider = { model: "test-fake", generate };
  const response = await request(createApp(deps)).post("/api/tutor").set("Origin", deps.publicOrigin)
    .send({ ...tutorBody("big", newSession("s1")), pad: "x".repeat(128 * 1024) });
  expect(response.status).toBe(413);
  expect(generate).not.toHaveBeenCalled();
});
