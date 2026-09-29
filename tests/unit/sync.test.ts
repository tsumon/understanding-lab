// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { newSession } from "../../src/domain/contracts";
import { envelopeFromCloud, forkAttempt, keepPending, listCloudSessions, prepareSave, synchronize } from "../../src/client/sync";
import type { DraftEnvelope } from "../../src/client/local-store";

afterEach(() => { vi.unstubAllGlobals(); });

const envelope = (id = "s1"): DraftEnvelope => ({
  session: { ...newSession(id), notes: "本机笔记" },
  unconfirmedText: "未确认",
  drafts: { explain: "未确认" },
  exploration: { config: { seed: 17, n: 40, noise: 0.1, degree: 3 }, frozen: null, revealed: false, contaminated: false },
  updatedAt: "2026-09-28T00:00:00.000Z",
});

test("successful save waits for the response body and does not treat the request as done", async () => {
  const saved = { session: newSession("s1"), serverRevision: 1 };
  let resolveResponse: ((value: Response) => void) | undefined;
  const fetchImpl = vi.fn<typeof fetch>(async () => new Promise<Response>((resolve) => { resolveResponse = resolve; }));
  const pending = synchronize(envelope(), null, "k1", fetchImpl);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  const init = fetchImpl.mock.calls[0]?.[1];
  expect(init).toMatchObject({
    method: "PUT", credentials: "same-origin",
    headers: { "content-type": "application/json", "Idempotency-Key": "k1" },
  });
  expect(JSON.parse(String(init?.body))).toEqual({ session: envelope().session, baseRevision: 0 });
  resolveResponse!(new Response(JSON.stringify(saved), { status: 200, headers: { "content-type": "application/json" } }));
  await expect(pending).resolves.toEqual({ status: "saved", saved });
});

test("conflict keeps the full local envelope and the cloud session", async () => {
  const local = envelope();
  const cloud = { session: { ...newSession("s1"), notes: "云端" }, serverRevision: 4 };
  const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.endsWith("/s1") && fetchImpl.mock.calls.length === 1) {
      return new Response("{}", { status: 409 });
    }
    return new Response(JSON.stringify(cloud), { status: 200, headers: { "content-type": "application/json" } });
  });
  await expect(synchronize(local, { id: "s1", serverRevision: 3 }, "k2", fetchImpl)).resolves.toEqual({
    status: "conflict", local, cloud,
  });
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

test("deleted, offline network, and unauthorized responses stay in the declared outcomes", async () => {
  await expect(synchronize(envelope(), null, "k", async () => new Response("", { status: 410 }))).resolves.toEqual({ status: "deleted" });
  await expect(synchronize(envelope(), null, "k", async () => { throw new TypeError("Failed to fetch"); })).resolves.toEqual({ status: "offline" });
  await expect(synchronize(envelope(), null, "k", async () => new Response("", { status: 401 }))).resolves.toEqual({ status: "offline" });
});

test("offline retries reuse the same attempt id and idempotency key", () => {
  const keys = ["attempt-1", "idem-1", "idem-2"];
  const nextKey = () => keys.shift()!;
  const draft = newSession("current");
  const first = prepareSave(draft, null, null, nextKey);
  expect(first.session.id).toBe("attempt-1");
  expect(first.cloud).toBeNull();
  expect(first.pending.key).toBe("idem-1");
  const retry = prepareSave(draft, null, first.pending, nextKey);
  expect(retry.pending).toEqual(first.pending);
  expect(retry.session.id).toBe("attempt-1");
  const edited = prepareSave({ ...draft, notes: "改了" }, null, first.pending, nextKey);
  expect(edited.session.id).toBe("attempt-1");
  expect(edited.pending.key).toBe("idem-2");
  expect(keepPending("offline")).toBe(true);
  expect(keepPending("saved")).toBe(false);
});

test("bound retries keep the cloud id and only mint a new key when the body changes", () => {
  const binding = { ownerId: "alice", id: "s1", serverRevision: 2 };
  const keys = ["k-old", "k-new"];
  const first = prepareSave(newSession("s1"), binding, null, () => keys.shift()!);
  expect(first.cloud).toEqual({ id: "s1", serverRevision: 2 });
  expect(first.pending.key).toBe("k-old");
  expect(prepareSave(newSession("s1"), binding, first.pending, () => keys.shift()!).pending.key).toBe("k-old");
});

test("listCloudSessions returns only this account's saved rows", async () => {
  const saved = { session: newSession("s1"), serverRevision: 2 };
  const listed = await listCloudSessions(async () => new Response(JSON.stringify({ sessions: [saved] }), { status: 200 }));
  expect(listed).toEqual([saved]);
  await expect(listCloudSessions(async () => new Response("", { status: 401 }))).resolves.toEqual([]);
});

test("envelopeFromCloud binds the owner without uploading anonymous drafts", () => {
  const saved = { session: { ...newSession("s9"), notes: "云端笔记" }, serverRevision: 3 };
  const restored = envelopeFromCloud(saved, "alice", envelope().exploration);
  expect(restored.session.id).toBe("s9");
  expect(restored.binding).toEqual({ ownerId: "alice", id: "s9", serverRevision: 3 });
  expect(restored.autoSave).toBe(false);
});

test("forking assigns a new id and clears account binding without last-write-wins", () => {
  const local = { ...envelope(), binding: { ownerId: "alice", id: "s1", serverRevision: 2 }, autoSave: true };
  const forked = forkAttempt(local, "s2");
  expect(forked.session.id).toBe("s2");
  expect(forked.session.notes).toBe("本机笔记");
  expect(forked.unconfirmedText).toBe("未确认");
  expect(forked.binding).toBeNull();
  expect(forked.autoSave).toBe(false);
});
