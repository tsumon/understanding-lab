import express, { type Express, type NextFunction, type Request, type Response } from "express";
import type Database from "better-sqlite3";
import { z } from "zod";
import { SessionRepository, SessionRepositoryError } from "./sessions";

const saveBody = z.strictObject({
  baseRevision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  session: z.unknown(),
});

function ownerId(res: Response): string {
  return (res.locals.user as { id: string }).id;
}

function sendError(error: unknown, res: Response, next: NextFunction): void {
  if (error instanceof SessionRepositoryError) {
    res.status(error.status).json({ error: ({
      400: "invalid-session", 404: "not-found", 409: "conflict", 410: "deleted",
    } as const)[error.status] });
    return;
  }
  if (error instanceof Error && /busy|locked/i.test(error.message)) {
    res.status(503).json({ error: "unavailable" });
    return;
  }
  next(error);
}

function idempotencyKey(req: Request): string {
  const key = req.get("Idempotency-Key") ?? "";
  if (!key.trim() || [...key].length > 256) {
    const error = new SessionRepositoryError(400);
    throw error;
  }
  return key;
}

export function mountSessionRoutes(app: Express, db: Database.Database): void {
  const repo = new SessionRepository(db);
  const sessionJson = express.json({ limit: "2mb" });

  const list: express.RequestHandler = (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.set("Allow", "GET, HEAD").status(405).json({ error: "method-not-allowed" });
      return;
    }
    try { res.json({ sessions: repo.list(ownerId(res)) }); }
    catch (error) { sendError(error, res, next); }
  };
  const read: express.RequestHandler = (req, res, next) => {
    try { res.json(repo.get(ownerId(res), String(req.params.id))); }
    catch (error) { sendError(error, res, next); }
  };
  const exported: express.RequestHandler = (req, res, next) => {
    try {
      res.set("Content-Disposition", "attachment; filename=\"understanding-lab-session.json\"");
      res.json(repo.export(ownerId(res), String(req.params.id)));
    } catch (error) { sendError(error, res, next); }
  };
  const save: express.RequestHandler = (req, res, next) => {
    try {
      const parsed = saveBody.safeParse(req.body);
      if (!parsed.success) { res.status(400).json({ error: "invalid-session" }); return; }
      res.json(repo.save(ownerId(res), String(req.params.id), parsed.data.baseRevision, idempotencyKey(req), parsed.data.session));
    } catch (error) { sendError(error, res, next); }
  };
  const remove: express.RequestHandler = (req, res, next) => {
    try { repo.remove(ownerId(res), String(req.params.id)); res.status(204).end(); }
    catch (error) { sendError(error, res, next); }
  };

  app.get("/api/sessions", list);
  app.all("/api/sessions", list);
  app.get("/api/sessions/:id/export", exported);
  app.get("/api/sessions/:id", read);
  app.put("/api/sessions/:id", sessionJson, save);
  app.delete("/api/sessions/:id", remove);
  app.all("/api/sessions/:id/export", (_req, res) => {
    res.set("Allow", "GET, HEAD").status(405).json({ error: "method-not-allowed" });
  });
  app.all("/api/sessions/:id", (req, res) => {
    res.set("Allow", "GET, HEAD, PUT, DELETE").status(405).json({ error: "method-not-allowed" });
  });
}
