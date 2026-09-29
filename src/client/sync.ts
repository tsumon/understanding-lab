import type { LearningSession, SavedSession } from "../domain/contracts";
import { currentAnswer } from "../domain/session";
import type { Exploration } from "../experiment/exploration";
import type { CloudBinding, DraftEnvelope, PendingSave } from "./local-store";

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
    pendingSave: null,
    updatedAt: new Date().toISOString(),
  };
}

function saveHash(id: string, baseRevision: number, session: LearningSession): string {
  return JSON.stringify({ id, baseRevision, session });
}

/** Reuse the in-flight id and idempotency key until a terminal response, so a timeout cannot create a second cloud row. */
export function prepareSave(
  session: LearningSession,
  binding: CloudBinding | null,
  pending: PendingSave | null,
  newKey: () => string = () => crypto.randomUUID(),
): { session: LearningSession; cloud: CloudRef | null; pending: PendingSave } {
  const id = binding?.id ?? pending?.id ?? (session.id === "current" ? newKey() : session.id);
  const cloud = binding ? { id: binding.id, serverRevision: binding.serverRevision } : null;
  const next = { ...session, id };
  const hash = saveHash(id, cloud?.serverRevision ?? 0, next);
  const key = pending && pending.id === id && pending.hash === hash ? pending.key : newKey();
  return { session: next, cloud, pending: { id, key, hash } };
}

export function keepPending(status: SyncOutcome["status"]): boolean {
  return status === "offline";
}

export async function listCloudSessions(fetchImpl: FetchLike = fetch): Promise<SavedSession[]> {
  try {
    const response = await fetchImpl("/api/sessions", { credentials: "same-origin" });
    if (!response.ok) return [];
    const body = await readJson(response);
    const sessions = body !== null && typeof body === "object" ? (body as { sessions?: unknown }).sessions : null;
    if (!Array.isArray(sessions)) return [];
    return sessions.filter(isSavedSession);
  } catch {
    return [];
  }
}

export function envelopeFromCloud(saved: SavedSession, ownerId: string, fallback: Exploration): DraftEnvelope {
  const snapshot = saved.session.snapshots.at(-1);
  return {
    session: saved.session,
    unconfirmedText: currentAnswer(saved.session)?.text ?? "",
    exploration: snapshot
      ? { config: snapshot.config, frozen: snapshot.config, revealed: snapshot.testRevealed, contaminated: snapshot.testContaminated }
      : fallback,
    binding: { ownerId, id: saved.session.id, serverRevision: saved.serverRevision },
    autoSave: false,
    pendingSave: null,
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
