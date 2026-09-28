import { createHash } from "node:crypto";
import type { Express, NextFunction, Request, Response } from "express";
import busboy from "busboy";
import { QuotaLedger } from "./quota";
import { AudioError, MAX_PCM_BYTES, normalizeAudio } from "./audio";
import type { AppDeps } from "./app";

const MAX_UPLOAD = 10 * 1024 * 1024;
const ALLOWED_MIME = /^(audio\/(webm|mp4|mpeg|mp3|ogg|wav|x-wav|wave|aac)|video\/webm)(;.*)?$/i;
const RECEIVE_MS = 20_000;

function ownerId(res: Response): string {
  return (res.locals.user as { id: string }).id;
}

function drain(req: Request): void {
  req.resume();
}

export function mountAudioRoutes(app: Express, deps: AppDeps): void {
  const quota = new QuotaLedger(deps.db);
  let decoding = 0;
  const decode = deps.normalizeAudio ?? ((input: Uint8Array, signal: AbortSignal) => normalizeAudio(input, signal));

  app.post("/api/transcribe", (req: Request, res: Response, next: NextFunction) => {
    if (req.get("X-Send-Consent") !== "true") {
      drain(req);
      res.status(400).json({ error: "consent-required" });
      return;
    }
    const requestId = req.get("X-Request-Id") ?? "";
    if (!requestId.trim() || [...requestId].length > 256) {
      drain(req);
      res.status(400).json({ error: "invalid-request" });
      return;
    }
    if (!deps.audioProvider) {
      drain(req);
      res.status(503).json({ error: "feature-disabled" });
      return;
    }
    const length = Number(req.headers["content-length"] ?? "0");
    if (Number.isFinite(length) && length > MAX_UPLOAD + 4096) {
      drain(req);
      res.status(413).json({ error: "body-too-large" });
      return;
    }
    if (decoding >= 2) {
      drain(req);
      res.status(503).json({ error: "unavailable" });
      return;
    }

    decoding += 1;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    req.on("aborted", onAbort);
    const receiveTimer = setTimeout(() => { controller.abort(); req.destroy(); }, RECEIVE_MS);
    let reserved: { ownerId: string; requestId: string } | undefined;
    let finished = false;
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      decoding -= 1;
      clearTimeout(receiveTimer);
      req.off("aborted", onAbort);
    };
    const fail = (status: number, error: string) => {
      if (finished || res.headersSent) return;
      finished = true;
      res.status(status).json({ error });
    };

    const chunks: Buffer[] = [];
    let total = 0;
    let mime = "";
    let files = 0;
    let limited = false;
    const parser = busboy({ headers: req.headers, limits: { files: 1, fileSize: MAX_UPLOAD, fields: 0 } });
    parser.on("file", (_name, file, info) => {
      files += 1;
      mime = info.mimeType;
      file.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_UPLOAD) {
          limited = true;
          file.destroy();
          return;
        }
        chunks.push(chunk);
      });
      file.on("limit", () => { limited = true; });
    });
    let startedWork = false;
    parser.on("error", () => { fail(400, "invalid-request"); release(); });
    parser.on("close", () => { if (!startedWork) release(); });
    parser.on("finish", () => {
      startedWork = true;
      clearTimeout(receiveTimer);
      void (async () => {
        try {
          if (limited || total > MAX_UPLOAD) { fail(413, "body-too-large"); return; }
          if (files !== 1 || total === 0) { fail(400, "invalid-request"); return; }
          if (!ALLOWED_MIME.test(mime)) { fail(400, "invalid-audio"); return; }
          const input = Buffer.concat(chunks);
          const owner = ownerId(res);
          const hash = createHash("sha256").update(input).digest("hex");
          const status = quota.reserveOperation(owner, requestId, "transcribe", hash, deps.clock());
          if (status !== "reserved") {
            if (status === "limit") { fail(429, "quota-exhausted"); return; }
            if (status === "busy") { fail(503, "unavailable"); return; }
            fail(409, status);
            return;
          }
          reserved = { ownerId: owner, requestId };
          const wav = await decode(input, controller.signal);
          if (wav.byteLength - 44 > MAX_PCM_BYTES) {
            quota.abortOperation(owner, requestId);
            reserved = undefined;
            fail(422, "too-long");
            return;
          }
          const text = await deps.audioProvider!.transcribe(wav, controller.signal);
          quota.finishOperation(owner, requestId, true);
          reserved = undefined;
          if (finished || res.headersSent) return;
          finished = true;
          res.json({ text });
        } catch (error) {
          if (reserved) {
            if (error instanceof AudioError) quota.abortOperation(reserved.ownerId, reserved.requestId);
            else quota.finishOperation(reserved.ownerId, reserved.requestId, false);
          }
          if (error instanceof AudioError && error.code === "too-long") { fail(422, "too-long"); return; }
          if (error instanceof AudioError && error.code === "timeout") { fail(503, "unavailable"); return; }
          if (error instanceof AudioError) { fail(400, "invalid-audio"); return; }
          next(error);
        } finally { release(); }
      })();
    });
    req.pipe(parser);
  });
  app.all("/api/transcribe", (_req, res) => {
    res.set("Allow", "POST").status(405).json({ error: "method-not-allowed" });
  });
}
