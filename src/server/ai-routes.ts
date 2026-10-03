import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { z } from "zod";
import packJson from "../../public/experiments/overfitting.v1.json";
import { SessionSchema } from "../domain/contracts";
import { topicFor } from "../content/topics";
import { LocaleSchema, legacyLocale } from "../domain/locale";
import { loadCase, parsePack } from "../experiment/catalog";
import { runTutor, type TutorProvider } from "../tutor/service";
import { QuotaLedger } from "./quota";

let pack: ReturnType<typeof parsePack> | undefined;

const tutorBody = z.strictObject({
  requestId: z.string().min(1).max(256),
  session: SessionSchema,
  includeNotes: z.boolean(),
  sendConsent: z.literal(true),
  locale: LocaleSchema.optional(),
});

type AiDeps = { db: Database.Database; tutorProvider: TutorProvider; clock: () => Date };

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function ownerId(res: Response): string {
  return (res.locals.user as { id: string }).id;
}

function sendBusy(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof Error && /busy|locked/i.test(error.message)) {
    res.status(503).json({ error: "unavailable" });
    return;
  }
  next(error);
}

export function mountAiRoutes(app: Express, deps: AiDeps): void {
  const quota = new QuotaLedger(deps.db);
  const sessionLocks = new Set<string>();
  const tutorJson = express.json({ limit: "128kb" });

  app.post("/api/tutor", tutorJson, async (req: Request, res: Response, next: NextFunction) => {
    let lockKey: string | undefined;
    let reserved: { ownerId: string; requestId: string } | undefined;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    req.on("aborted", onAbort);
    try {
      const body = req.body as unknown;
      if (body === null || typeof body !== "object" || Array.isArray(body)
        || (body as { sendConsent?: unknown }).sendConsent !== true) {
        res.status(400).json({ error: "consent-required" });
        return;
      }
      const parsed = tutorBody.safeParse(body);
      if (!parsed.success) { res.status(400).json({ error: "invalid-request" }); return; }

      const { requestId, includeNotes, locale } = parsed.data;
      const submitted = parsed.data.session;
      const owner = ownerId(res);
      const row = deps.db.prepare("SELECT owner_id, deleted_at FROM learning_sessions WHERE id = ?")
        .get(submitted.id) as { owner_id: string; deleted_at: string | null } | undefined;
      if (row) {
        if (row.owner_id !== owner) { res.status(404).json({ error: "not-found" }); return; }
        if (row.deleted_at !== null) { res.status(410).json({ error: "deleted" }); return; }
      }

      pack ??= parsePack(packJson);
      try {
        for (const snapshot of submitted.snapshots) {
          if (snapshot.packVersion !== pack.version) throw new Error("pack-mismatch");
          loadCase(pack, snapshot.config);
        }
      } catch { res.status(400).json({ error: "invalid-request" }); return; }

      const candidateLock = `${owner}:${submitted.id}`;
      if (sessionLocks.has(candidateLock)) { res.status(409).json({ error: "in-flight" }); return; }
      sessionLocks.add(candidateLock);
      lockKey = candidateLock;

      const requestHash = createHash("sha256")
        .update(canonicalJson({ session: submitted, includeNotes, ...(locale === undefined ? {} : { locale }) })).digest("hex");
      const status = quota.reserveOperation(owner, requestId, "tutor", requestHash, deps.clock());
      if (status !== "reserved") {
        sessionLocks.delete(lockKey);
        lockKey = undefined;
        if (status === "limit") { res.status(429).json({ error: "quota-exhausted" }); return; }
        if (status === "busy") { res.status(503).json({ error: "unavailable" }); return; }
        res.status(409).json({ error: status });
        return;
      }
      reserved = { ownerId: owner, requestId };

      const session = { ...submitted, notes: includeNotes ? submitted.notes : "" };
      const result = await runTutor(
        { session, topic: topicFor(session.topicVersion, legacyLocale(locale)), pack, includeNotes,
          evidenceLocale: legacyLocale(locale), responseLocale: legacyLocale(locale) }, deps.tutorProvider, controller.signal,
      );
      quota.finishOperation(owner, requestId, result.status === "ok");
      reserved = undefined;
      res.json({ requestId, contentRevision: session.contentRevision, result });
    } catch (error) {
      if (reserved) quota.finishOperation(reserved.ownerId, reserved.requestId, false);
      sendBusy(error, res, next);
    } finally {
      req.off("aborted", onAbort);
      if (lockKey) sessionLocks.delete(lockKey);
    }
  });
  app.all("/api/tutor", (_req, res) => {
    res.set("Allow", "POST").status(405).json({ error: "method-not-allowed" });
  });
}
