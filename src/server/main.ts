import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createApp } from "./app";
import { createAuth, createUserResolver, toAuthHandler } from "./auth";
import { loadConfig, type Config } from "./config";
import { openDatabase } from "./db";
import { createOpenAITutorProvider, OpenAITutorError } from "./providers/openai";
import type { TutorProvider } from "../tutor/service";

const disabledTutor: TutorProvider = {
  model: "disabled",
  generate: async () => { throw new Error("unavailable"); },
};

/** One explicit, potentially billable probe per enabled process startup. Never retried or reactivated. */
export async function activateTutor(config: Config, signal: AbortSignal): Promise<TutorProvider> {
  if (!config.tutorEnabled || !config.openaiApiKey || !config.openaiBaseURL || !config.tutorModel) return disabledTutor;
  try {
    return await createOpenAITutorProvider({ apiKey: config.openaiApiKey, baseURL: config.openaiBaseURL,
      tutorModel: config.tutorModel }, signal);
  } catch (error) {
    console.info(JSON.stringify({ event: "tutor-unavailable", reason: error instanceof OpenAITutorError ? error.code : "provider" }));
    return disabledTutor;
  }
}

export async function startService(config: Config, signal: AbortSignal) {
  const db = openDatabase(config.dbPath);
  try {
    // Read-only startup gate: the explicit migration command must have already run.
    const applied = db.prepare("SELECT version FROM schema_migrations WHERE version = 1").get();
    if (!applied) throw new Error("migration-required");
    const auth = createAuth(db, config);
    const tutorProvider = await activateTutor(config, signal);
    signal.throwIfAborted();
    const app = createApp({
      db, authHandler: toAuthHandler(auth), resolveUser: createUserResolver(auth), tutorProvider,
      audioProvider: null, clock: () => new Date(), publicOrigin: config.publicOrigin,
    });
    // A local reverse proxy terminates HTTPS; keep this process bound to loopback.
    const server = app.listen(config.port, "127.0.0.1");
    await new Promise<void>((ready, reject) => {
      server.once("listening", ready);
      server.once("error", reject);
    });
    return { server, close: () => new Promise<void>((done, reject) => {
      server.close((error) => {
        db.close();
        if (error) reject(error); else done();
      });
    }) };
  } catch (error) { db.close(); throw error; }
}

async function main() {
  const controller = new AbortController();
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const service = await startService(loadConfig(), controller.signal);
  if (controller.signal.aborted) { await service.close(); return; }
  console.info(JSON.stringify({ event: "service-started" }));
  controller.signal.addEventListener("abort", () => {
    service.close().catch(() => { console.error(JSON.stringify({ event: "shutdown-failed" })); process.exitCode = 1; });
  }, { once: true });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(JSON.stringify({ event: "startup-failed" }));
    process.exitCode = 1;
  });
}
