import { z } from "zod";
import { ExperimentConfigSchema, SessionSchema, type LearningSession } from "../domain/contracts";
import type { Exploration } from "../experiment/exploration";

export type DraftEnvelope = {
  session: LearningSession;
  unconfirmedText: string;
  drafts?: Partial<Record<DraftSlot, string>>;
  exploration: Exploration;
  updatedAt: string;
};

export type DraftSlot = "explain" | "clarify-1" | "clarify-2" | "predict" | "reexplain" | "transfer";

const draftSlots = ["explain", "clarify-1", "clarify-2", "predict", "reexplain", "transfer"] as const;
const draftSchema = z.partialRecord(z.enum(draftSlots), z.string().refine((text) => [...text].length <= 4000));

const envelopeSchema = z.strictObject({
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
});

const keyFor = (id: string) => `understanding-lab:v1:anonymous:${id}`;

export function rawDraftForExport(id: string): string | null {
  try { return localStorage.getItem(keyFor(id)); }
  catch { return null; }
}

export function readEnvelope(id: string): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(keyFor(id));
    if (raw === null) return null;
    const parsed = envelopeSchema.parse(JSON.parse(raw));
    return parsed.session.id === id ? parsed : null;
  } catch { return null; }
}

export function writeEnvelope(id: string, envelope: DraftEnvelope): { ok: true } | { ok: false; reason: "storage-full" | "unavailable" } {
  try {
    const current = localStorage.getItem(keyFor(id));
    if (current !== null && readEnvelope(id) === null) return { ok: false, reason: "unavailable" };
    const valid = envelopeSchema.parse(envelope);
    if (valid.session.id !== id) return { ok: false, reason: "unavailable" };
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
  try { localStorage.removeItem(keyFor(id)); }
  catch { /* The current in-memory attempt remains usable. */ }
}
