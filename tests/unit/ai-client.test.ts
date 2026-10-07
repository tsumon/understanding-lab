import { expect, test, vi } from "vitest";
import { postTutor, TutorRequestGuard } from "../../src/client/ai-client";
import { newSession } from "../../src/domain/contracts";
import type { TutorResult } from "../../src/tutor/service";

test("ignores a same-revision duplicate while one request is pending", () => {
  const guard = new TutorRequestGuard();
  const first = guard.start(4)!;
  expect(guard.start(4)).toBeNull();
  expect(first.signal.aborted).toBe(false);
  expect(guard.accept(first.requestId, 4)).toBe(true);
});

test("a different revision aborts the old request and rejects its late result", () => {
  const guard = new TutorRequestGuard();
  const old = guard.start(4)!;
  const current = guard.start(5)!;
  expect(old.signal.aborted).toBe(true);
  expect(current.requestId).not.toBe(old.requestId);
  expect(guard.accept(old.requestId, 4)).toBe(false);
  expect(guard.accept(current.requestId, 4)).toBe(false);
  expect(guard.accept(current.requestId, 5)).toBe(true);
});

test("invalidation also rejects navigation replies without a content revision change", () => {
  const guard = new TutorRequestGuard();
  const old = guard.start(4)!;
  guard.invalidate();
  expect(old.signal.aborted).toBe(true);
  expect(guard.accept(old.requestId, 4)).toBe(false);
  const current = guard.start(4)!;
  expect(current.requestId).not.toBe(old.requestId);
  expect(guard.accept(current.requestId, 4)).toBe(true);
});

test("completion allows the user to deliberately submit the same revision again", () => {
  const guard = new TutorRequestGuard();
  const first = guard.start(4)!;
  guard.finish(first.requestId);
  expect(guard.accept(first.requestId, 4)).toBe(false);
  const next = guard.start(4)!;
  expect(next.requestId).not.toBe(first.requestId);
  expect(guard.accept(next.requestId, 4)).toBe(true);
});

test("a late old completion cannot clear a newer pending request", () => {
  const guard = new TutorRequestGuard();
  const old = guard.start(4)!;
  const current = guard.start(5)!;
  guard.finish(old.requestId);
  expect(guard.accept(current.requestId, 5)).toBe(true);
  expect(guard.start(5)).toBeNull();
});

const output = {
  kind: "supported" as const, claim: "有证据", reason: "引用回答", nextAction: "ask" as const,
  question: "哪份数据？", quotes: [], sources: [{ paragraphId: "p-fit", topicVersion: "overfitting.v1" }], metrics: [],
};
const okResult: TutorResult = { status: "ok", output, model: "server-model", promptVersion: "overfitting-tutor-v1" };
const sessionWithNotes = { ...newSession("s1"), notes: "私人笔记不应默认发送", contentRevision: 3 };

function tutorResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("postTutor omits a second fetch for the same revision and defaults includeNotes to false", async () => {
  const guard = new TutorRequestGuard();
  let release: ((value: Response) => void) | undefined;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { release = resolve; }));
  const first = postTutor(sessionWithNotes, { sendConsent: true, guard, fetchImpl });
  expect(await postTutor(sessionWithNotes, { sendConsent: true, guard, fetchImpl })).toBeNull();
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const init = fetchImpl.mock.calls[0]?.[1];
  expect(init).toMatchObject({ method: "POST", credentials: "same-origin" });
  expect(init?.headers).toEqual({ "content-type": "application/json" });
  const payload = JSON.parse(String(init?.body));
  expect(payload.sendConsent).toBe(true);
  expect(payload.includeNotes).toBe(false);
  expect(payload.session.notes).toBe("");
  expect(payload.session.contentRevision).toBe(3);
  release!(tutorResponse(200, { requestId: payload.requestId, contentRevision: 3, result: okResult }));
  await expect(first).resolves.toEqual({ status: "accepted", requestId: payload.requestId, contentRevision: 3, result: okResult });
});

test("a reserved auth token can be sent only once and cannot be revived after invalidation", async () => {
  const guard = new TutorRequestGuard();
  const request = guard.start(3)!;
  let release!: (response: Response) => void;
  let calls = 0;
  const fetchImpl = vi.fn<typeof fetch>(() => ++calls === 1
    ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(tutorResponse(503)));
  const pending = postTutor(sessionWithNotes, { sendConsent: true, guard, request, fetchImpl });
  expect(await postTutor(sessionWithNotes, { sendConsent: true, guard, request, fetchImpl })).toEqual({ status: "aborted" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  guard.invalidate();
  const payload = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
  release(tutorResponse(200, { requestId: payload.requestId, contentRevision: 3, result: okResult }));
  await expect(pending).resolves.toEqual({ status: "aborted" });
  expect(await postTutor(sessionWithNotes, { sendConsent: true, guard, request, fetchImpl })).toEqual({ status: "aborted" });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

test("postTutor sends notes only when includeNotes is true", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => tutorResponse(503));
  await postTutor(sessionWithNotes, { sendConsent: true, includeNotes: true, guard: new TutorRequestGuard(), fetchImpl });
  expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).includeNotes).toBe(true);
  expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).session.notes).toBe("私人笔记不应默认发送");
});

test("400 consent-required is missing consent; other 400s are invalid requests", async () => {
  const consent = await postTutor(newSession("s1"), {
    sendConsent: true, guard: new TutorRequestGuard(),
    fetchImpl: async () => tutorResponse(400, { error: "consent-required" }),
  });
  expect(consent).toMatchObject({ status: "consent" });
  expect(consent && "question" in consent ? consent.question : "").toMatch(/同意/);
  const invalid = await postTutor(newSession("s1"), {
    sendConsent: true, guard: new TutorRequestGuard(),
    fetchImpl: async () => tutorResponse(400, { error: "invalid-request" }),
  });
  expect(invalid).toMatchObject({ status: "error" });
  expect(invalid && "question" in invalid ? invalid.question : "").toMatch(/格式无效/);
  expect(invalid && "question" in invalid ? invalid.question : "").not.toMatch(/同意/);
});

test("429 is quota and 503 is unavailable, never a learning-step result", async () => {
  const quota = await postTutor(newSession("s1"), { sendConsent: true, guard: new TutorRequestGuard(), fetchImpl: async () => tutorResponse(429) });
  expect(quota).toMatchObject({ status: "quota" });
  expect(quota).not.toHaveProperty("result");
  expect(quota && "question" in quota ? quota.question : "").toMatch(/UTC/);
  const busy = await postTutor(newSession("s1"), { sendConsent: true, guard: new TutorRequestGuard(), fetchImpl: async () => tutorResponse(503) });
  expect(busy).toMatchObject({ status: "unavailable", reason: "busy" });
  expect(busy).not.toHaveProperty("result");
});

test("an invalidated in-flight response is not applied even if HTTP 200 arrives late", async () => {
  const guard = new TutorRequestGuard();
  let release: ((value: Response) => void) | undefined;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { release = resolve; }));
  const pending = postTutor(sessionWithNotes, { sendConsent: true, guard, fetchImpl });
  const requestId = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).requestId;
  guard.invalidate();
  release!(tutorResponse(200, { requestId, contentRevision: 3, result: okResult }));
  await expect(pending).resolves.toEqual({ status: "aborted" });
});

test("a late finish from an old request cannot clear a newer postTutor", async () => {
  const guard = new TutorRequestGuard();
  let releaseOld: ((value: Response) => void) | undefined;
  let releaseNew: ((value: Response) => void) | undefined;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
    if (fetchImpl.mock.calls.length === 1) releaseOld = resolve;
    else releaseNew = resolve;
  }));
  const older = { ...sessionWithNotes, contentRevision: 3 };
  const newer = { ...sessionWithNotes, contentRevision: 4 };
  const first = postTutor(older, { sendConsent: true, guard, fetchImpl });
  const second = postTutor(newer, { sendConsent: true, guard, fetchImpl });
  const oldId = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).requestId;
  const newId = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body)).requestId;
  releaseOld!(tutorResponse(200, { requestId: oldId, contentRevision: 3, result: okResult }));
  await expect(first).resolves.toEqual({ status: "aborted" });
  expect(guard.accept(newId, 4)).toBe(true);
  releaseNew!(tutorResponse(200, { requestId: newId, contentRevision: 4, result: okResult }));
  await expect(second).resolves.toEqual({ status: "accepted", requestId: newId, contentRevision: 4, result: okResult });
});

test("an English request retains its captured locale when the external selection changes", async () => {
  let selected: "en" | "zh-CN" = "en";
  let release!: (response: Response) => void;
  const fetchImpl = vi.fn<typeof fetch>(() => new Promise((resolve) => { release = resolve; }));
  const pending = postTutor(sessionWithNotes, { sendConsent: true, locale: selected, guard: new TutorRequestGuard(), fetchImpl });
  const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
  selected = "zh-CN";
  expect(body.locale).toBe("en");
  const english = { ...okResult, evidenceLocale: "en", responseLocale: "en" };
  release(tutorResponse(200, { requestId: body.requestId, contentRevision: 3, result: english }));
  await expect(pending).resolves.toMatchObject({ status: "accepted", result: english });
  expect(selected).toBe("zh-CN");
});

test("English success without matching locale metadata is invalid output", async () => {
  for (const result of [okResult, { ...okResult, responseLocale: "zh-CN", evidenceLocale: "en" },
    { ...okResult, responseLocale: "fr", evidenceLocale: "en" }]) {
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => tutorResponse(200, {
      requestId: JSON.parse(String(init?.body)).requestId, contentRevision: 3, result,
    }));
    const outcome = await postTutor(sessionWithNotes, { sendConsent: true, locale: "en", guard: new TutorRequestGuard(), fetchImpl });
    expect(outcome).toMatchObject({ status: "unavailable", reason: "invalid-output" });
  }
});
