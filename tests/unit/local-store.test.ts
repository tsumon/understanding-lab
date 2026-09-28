// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { newSession } from "../../src/domain/contracts";
import { readEnvelope, writeEnvelope, deleteDraft, rawDraftForExport, writeConflict, readConflict, clearConflict } from "../../src/client/local-store";

const id = "draft-test";
const key = `understanding-lab:v1:anonymous:${id}`;
const envelope = () => ({
  session: newSession(id),
  unconfirmedText: "训练误差不代表新数据表现",
  exploration: { config: { seed: 17 as const, n: 40 as const, noise: 0.1 as const, degree: 3 }, frozen: null, revealed: false, contaminated: false },
  updatedAt: "2026-09-27T00:00:00.000Z",
});

describe("anonymous local drafts", () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals(); });

  it("round trips an unconfirmed answer separately from confirmed history", () => {
    expect(writeEnvelope(id, envelope())).toEqual({ ok: true });
    expect(readEnvelope(id)).toEqual(envelope());
    expect(readEnvelope(id)?.session.answers).toEqual([]);
    deleteDraft(id);
    expect(readEnvelope(id)).toBeNull();
  });

  it("keeps a bounded draft for an earlier question when navigating", () => {
    const withDrafts = { ...envelope(), drafts: { explain: "未确认的旧解释", "clarify-1": "新的澄清草稿" } };
    expect(writeEnvelope(id, withDrafts)).toEqual({ ok: true });
    expect(readEnvelope(id)?.drafts).toEqual(withDrafts.drafts);
  });

  it("keeps corrupt bytes available for export instead of clearing them", () => {
    localStorage.setItem(key, "{damaged draft");
    expect(readEnvelope(id)).toBeNull();
    expect(rawDraftForExport(id)).toBe("{damaged draft");
    expect(writeEnvelope(id, envelope())).toEqual({ ok: false, reason: "unavailable" });
    expect(localStorage.getItem(key)).toBe("{damaged draft");
  });

  it("lets the working current slot keep a UUID attempt identity after account save", () => {
    const uuid = { ...envelope(), session: newSession("attempt-uuid"), binding: { ownerId: "alice", id: "attempt-uuid", serverRevision: 1 } };
    expect(writeEnvelope("current", uuid)).toEqual({ ok: true });
    expect(readEnvelope("current")?.session.id).toBe("attempt-uuid");
    expect(readEnvelope("current")?.binding).toEqual(uuid.binding);
  });

  it("keeps a conflict copy through a later local draft write", () => {
    const local = envelope();
    const cloud = { session: newSession(id), serverRevision: 2 };
    expect(writeEnvelope(id, local)).toEqual({ ok: true });
    expect(writeConflict(id, { local, cloud })).toEqual({ ok: true });
    expect(writeEnvelope(id, { ...local, unconfirmedText: "继续编辑" })).toEqual({ ok: true });
    expect(readConflict(id)).toEqual({ local, cloud });
    clearConflict(id);
    expect(readConflict(id)).toBeNull();
    expect(readEnvelope(id)?.unconfirmedText).toBe("继续编辑");
  });

  it("reports quota failures without replacing the previous value", () => {
    const previous = JSON.stringify(envelope());
    localStorage.setItem(key, previous);
    const storage = localStorage;
    vi.stubGlobal("localStorage", {
      getItem: storage.getItem.bind(storage),
      removeItem: storage.removeItem.bind(storage),
      setItem: () => { throw new DOMException("full", "QuotaExceededError"); },
    });
    expect(writeEnvelope(id, envelope())).toEqual({ ok: false, reason: "storage-full" });
    expect(storage.getItem(key)).toBe(previous);
  });
});
