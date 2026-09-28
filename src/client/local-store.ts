import { z } from "zod";
import { ExperimentConfigSchema, SessionSchema, type LearningSession, type SavedSession } from "../domain/contracts";
import type { Exploration } from "../experiment/exploration";

export type CloudBinding = { ownerId: string; id: string; serverRevision: number };
export type PendingSave = { id: string; key: string; hash: string };

export type DraftEnvelope = {
  session: LearningSession;
  unconfirmedText: string;
  drafts?: Partial<Record<DraftSlot, string>>;
  exploration: Exploration;
  updatedAt: string;
  binding?: CloudBinding | null;
  autoSave?: boolean;
  pendingSave?: PendingSave | null;
};

export type ConflictCopy = { local: DraftEnvelope; cloud: SavedSession };

export type DraftSlot = "explain" | "clarify-1" | "clarify-2" | "predict" | "reexplain" | "transfer";

const draftSlots = ["explain", "clarify-1", "clarify-2", "predict", "reexplain", "transfer"] as const;
const draftSchema = z.partialRecord(z.enum(draftSlots), z.string().refine((text) => [...text].length <= 4000));

const envelopeSchema: z.ZodType<DraftEnvelope> = z.strictObject({
  session: SessionSchema,
  unconfirmedText: z.string().refine((text) => [...text].length <= 4000),
  drafts: draftSchema.optional(),
  exploration: z.strictObject({
    config: ExperimentConfigSchema,
    frozen: ExperimentConfigSchema.nullable(),
    revealed: z.boolean(),
    contaminated: z.boolean(),
  }),
  updatedAt: z.string(),
  binding: z.strictObject({
    ownerId: z.string().min(1),
    id: z.string().min(1),
    serverRevision: z.number().int().min(1),
  }).nullable().optional(),
  autoSave: z.boolean().optional(),
  pendingSave: z.strictObject({
    id: z.string().min(1),
    key: z.string().min(1),
    hash: z.string().min(1),
  }).nullable().optional(),
});

const conflictSchema = z.strictObject({
  local: envelopeSchema,
  cloud: z.strictObject({
    session: SessionSchema,
    serverRevision: z.number().int().min(1),
  }),
});

const keyFor = (id: string) => `understanding-lab:v1:anonymous:${id}`;
const conflictKeyFor = (id: string) => `understanding-lab:v1:conflict:${id}`;

export function rawDraftForExport(id: string): string | null {
  try { return localStorage.getItem(keyFor(id)); }
  catch { return null; }
}

export function readEnvelope(id: string): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (raw === null) return null;
    const parsed = envelopeSchema.parse(JSON.parse(raw));
    // The working slot "current" may hold a UUID-identified attempt after the first account save.
    return parsed.session.id === id || id === "current" ? parsed : null;
  } catch { return null; }
}

export function writeEnvelope(id: string, envelope: DraftEnvelope): { ok: true } | { ok: false; reason: "storage-full" | "unavailable" } {
  try {
    const current = localStorage.getItem(keyFor(id));
    if (current !== null && readEnvelope(id) === null) return { ok: false, reason: "unavailable" };
    const valid = envelopeSchema.parse(envelope);
    if (valid.session.id !== id && id !== "current") return { ok: false, reason: "unavailable" };
    localStorage.setItem(keyFor(id), JSON.stringify(valid));
    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      return { ok: false, reason: "storage-full" };
    }
    return { ok: false, reason: "unavailable" };
  }
}

export function deleteDraft(id: string): void {
  try {
    localStorage.removeItem(keyFor(id));
    localStorage.removeItem(conflictKeyFor(id));
  } catch { /* The current in-memory attempt remains usable. */ }
}

export function readConflict(id: string): ConflictCopy | null {
  try {
    const raw = localStorage.getItem(conflictKeyFor(id));
    return raw === null ? null : conflictSchema.parse(JSON.parse(raw));
  } catch { return null; }
}

export function writeConflict(id: string, copy: ConflictCopy): { ok: true } | { ok: false; reason: "storage-full" | "unavailable" } {
  try {
    localStorage.setItem(conflictKeyFor(id), JSON.stringify(conflictSchema.parse(copy)));
    return { ok: true };
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.name === "NS_ERROR_DOM_QUOTA_REACHED")) {
      return { ok: false, reason: "storage-full" };
    }
    return { ok: false, reason: "unavailable" };
  }
}

export function clearConflict(id: string): void {
  try { localStorage.removeItem(conflictKeyFor(id)); }
  catch { /* The current in-memory attempt remains usable. */ }
}
