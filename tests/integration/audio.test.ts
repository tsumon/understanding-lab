import request from "supertest";
import { afterEach, expect, test, vi } from "vitest";
import { createApp } from "../../src/server/app";
import { encodeWav, MAX_PCM_BYTES } from "../../src/server/audio";
import { QuotaLedger } from "../../src/server/quota";
import { SessionRepository } from "../../src/server/sessions";
import { testDependencies } from "../helpers/server";

const resources: Array<{ close(): void }> = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const close of resources.splice(0).reverse()) close.close();
});

async function setup() {
  const deps = await testDependencies({ userId: "alice" });
  new SessionRepository(deps.db).migrate();
  new QuotaLedger(deps.db).migrate();
  resources.push(deps);
  const wav = encodeWav(new Uint8Array(32000));
  deps.audioProvider = { transcribe: async () => "训练误差不能代表泛化" };
  deps.normalizeAudio = async () => wav;
  return { deps, app: createApp(deps), wav };
}

function send(app: ReturnType<typeof createApp>, opts: { consent?: string; id?: string; mime?: string; body?: Buffer } = {}) {
  const req = request(app).post("/api/transcribe").set("Origin", "http://localhost:3001");
  if (opts.consent !== "") req.set("X-Send-Consent", opts.consent ?? "true");
  if (opts.id !== "") req.set("X-Request-Id", opts.id ?? "r1");
  return req.attach("audio", opts.body ?? Buffer.from("webm-bytes"), {
    filename: "clip.webm", contentType: opts.mime ?? "audio/webm",
  });
}

test("missing consent never transcribes", async () => {
  const { deps, app } = await setup();
  const transcribe = vi.spyOn(deps.audioProvider!, "transcribe");
  const response = await request(app).post("/api/transcribe").set("Origin", "http://localhost:3001")
    .set("X-Request-Id", "r1").attach("audio", Buffer.from("x"), { filename: "a.webm", contentType: "audio/webm" });
  expect(response.status).toBe(400);
  expect(response.body).toEqual({ error: "consent-required" });
  expect(transcribe).not.toHaveBeenCalled();
});

test("feature-disabled is returned before decoding when no provider is configured", async () => {
  const deps = await testDependencies({ userId: "alice" });
  new QuotaLedger(deps.db).migrate();
  resources.push(deps);
  const response = await send(createApp(deps));
  expect(response.status).toBe(503);
  expect(response.body).toEqual({ error: "feature-disabled" });
});

test("consented short audio returns editable text and does not confirm an answer", async () => {
  const { app } = await setup();
  const response = await send(app);
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ text: "训练误差不能代表泛化" });
});

test("rejects disallowed mime, oversize bodies, and too-long decoded audio", async () => {
  const { deps, app } = await setup();
  expect((await send(app, { mime: "application/pdf", id: "pdf" })).status).toBe(400);
  const huge = await request(app).post("/api/transcribe").set("Origin", "http://localhost:3001")
    .set("X-Send-Consent", "true").set("X-Request-Id", "big").set("Content-Length", String(11 * 1024 * 1024));
  expect(huge.status).toBe(413);
  deps.normalizeAudio = async () => encodeWav(new Uint8Array(MAX_PCM_BYTES + 2));
  const long = await send(createApp(deps), { id: "long" });
  expect(long.status).toBe(422);
  expect(long.body).toEqual({ error: "too-long" });
});

test("transcribe quota is 10 per UTC day and duplicates do not bill twice", async () => {
  const { deps, app } = await setup();
  const transcribe = vi.fn(async () => "ok");
  deps.audioProvider = { transcribe };
  const wired = createApp(deps);
  for (let i = 0; i < 10; i += 1) {
    expect((await send(wired, { id: `t${i}` })).status).toBe(200);
  }
  expect((await send(wired, { id: "t10" })).status).toBe(429);
  expect(transcribe).toHaveBeenCalledTimes(10);
  const replay = await send(wired, { id: "t0" });
  expect(replay.status).toBe(409);
  expect(transcribe).toHaveBeenCalledTimes(10);
});
