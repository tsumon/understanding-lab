import { expect, test } from "vitest";
import { TutorRequestGuard } from "../../src/client/ai-client";

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
