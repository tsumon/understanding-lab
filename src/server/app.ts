import express, { type ErrorRequestHandler, type Express, type RequestHandler } from "express";
import helmet from "helmet";
import { fileURLToPath } from "node:url";
import type { IncomingHttpHeaders } from "node:http";
import type Database from "better-sqlite3";
import type { TutorProvider } from "../tutor/service";

export type AppDeps = {
  authHandler: RequestHandler;
  resolveUser: (headers: IncomingHttpHeaders) => Promise<{ id: string } | null>;
  db: Database.Database;
  tutorProvider: TutorProvider;
  audioProvider: {
    transcribe: (wav: Uint8Array, signal: AbortSignal) => Promise<string>;
  } | null;
  clock: () => Date;
  publicOrigin: string;
};

export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
  const local = new URL(deps.publicOrigin).protocol === "http:";
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      "script-src": ["'self'"],
      "connect-src": ["'self'"],
      "upgrade-insecure-requests": local ? null : [],
    } },
    strictTransportSecurity: local ? false : undefined,
  }));

  // Better Auth owns its raw request stream, OAuth state, and CSRF validation.
  app.all("/api/auth/*splat", deps.authHandler);
  app.use("/api", async (req, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && req.headers.origin !== deps.publicOrigin) {
      res.status(403).json({ error: "origin-mismatch" });
      return;
    }
    const user = await deps.resolveUser(req.headers);
    if (!user) { res.status(401).json({ error: "unauthorized" }); return; }
    res.locals.user = user;
    next();
  });

  // Apply small JSON limits per route; future session saves need a separate 2MiB parser.
  app.all("/api/me", express.json({ limit: "128kb" }), (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.set("Allow", "GET, HEAD").status(405).json({ error: "method-not-allowed" });
      return;
    }
    res.json({ id: res.locals.user.id });
  });
  app.use("/api", (_req, res) => { res.status(404).json({ error: "not-found" }); });

  const publicDir = fileURLToPath(new URL("../../dist/", import.meta.url));
  app.use(express.static(publicDir, { etag: false, lastModified: false, cacheControl: false }));
  app.get("/{*splat}", (req, res, next) => {
    if (!req.accepts("html") || req.path.includes(".")) { res.status(404).json({ error: "not-found" }); return; }
    res.sendFile("index.html", { root: publicDir, cacheControl: false }, (error) => {
      if (error) next(error);
    });
  });
  app.use((_req, res) => { res.status(404).json({ error: "not-found" }); });
  const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
    if (res.headersSent) { res.end(); return; }
    const type = error !== null && typeof error === "object" && "type" in error ? error.type : null;
    const status = error !== null && typeof error === "object" && "status" in error ? error.status : null;
    if (type === "entity.too.large") { res.status(413).json({ error: "body-too-large" }); return; }
    if (type === "entity.parse.failed") { res.status(400).json({ error: "invalid-json" }); return; }
    if (status === 404) { res.status(404).json({ error: "not-found" }); return; }
    res.status(500).json({ error: "internal-error" });
  };
  app.use(handleError);
  return app;
}
