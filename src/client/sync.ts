import type { SavedSession } from "../domain/contracts";
import type { DraftEnvelope } from "./local-store";

export type CloudRef = { id: string; serverRevision: number };
export type SyncOutcome =
  | { status: "saved"; saved: SavedSession }
  | { status: "conflict"; local: DraftEnvelope; cloud: SavedSession }
  | { status: "deleted" }
  | { status: "offline" };

type FetchLike = typeof fetch;

function isSavedSession(value: unknown): value is SavedSession {
  if (value === null || typeof value !== "object") return false;
  const record = value as { session?: { id?: unknown }; serverRevision?: unknown };
  return typeof record.session?.id === "string" && Number.isSafeInteger(record.serverRevision) && Number(record.serverRevision) >= 1;
}

async function readJson(response: Response): Promise<unknown> {
  try { return await response.json(); }
  catch { return null; }
}

export function forkAttempt(local: DraftEnvelope, newId: string): DraftEnvelope {
  return {
    ...local,
    session: { ...local.session, id: newId },
    binding: null,
    autoSave: false,
    updatedAt: new Date().toISOString(),
  };
}

export async function synchronize(
  local: DraftEnvelope,
  cloud: CloudRef | null,
  key: string,
  fetchImpl: FetchLike = fetch,
): Promise<SyncOutcome> {
  const id = cloud?.id ?? local.session.id;
  const payload = { ...local, session: { ...local.session, id } };
  try {
    const response = await fetchImpl(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "content-type": "application/json", "Idempotency-Key": key },
      body: JSON.stringify({ session: payload.session, baseRevision: cloud?.serverRevision ?? 0 }),
    });
    if (response.status === 200) {
      const saved = await readJson(response);
      if (!isSavedSession(saved) || saved.session.id !== id) return { status: "offline" };
      return { status: "saved", saved };
    }
    if (response.status === 410) return { status: "deleted" };
    if (response.status === 409) {
      const current = await fetchImpl(`/api/sessions/${encodeURIComponent(id)}`, { credentials: "same-origin" });
      if (!current.ok) return { status: "offline" };
      const cloudSession = await readJson(current);
      if (!isSavedSession(cloudSession) || cloudSession.session.id !== id) return { status: "offline" };
      return { status: "conflict", local: payload, cloud: cloudSession };
    }
    return { status: "offline" };
  } catch {
    return { status: "offline" };
  }
}
