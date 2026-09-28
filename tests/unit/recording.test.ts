// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { finishRecording, pickMime, requestTranscription } from "../../src/client/recording";

afterEach(() => { vi.unstubAllGlobals(); });

test("停止录音释放全部轨道，转写不自动提交答案", () => {
  const stop = vi.fn();
  const stream = { getTracks: () => [{ stop }, { stop }] };
  finishRecording(stream);
  expect(stop).toHaveBeenCalledTimes(2);
});

test("pickMime uses the first supported type and otherwise returns null", () => {
  vi.stubGlobal("MediaRecorder", { isTypeSupported: (type: string) => type === "audio/mp4" });
  expect(pickMime()).toBe("audio/mp4");
  vi.stubGlobal("MediaRecorder", { isTypeSupported: () => false });
  expect(pickMime()).toBeNull();
});

test("successful transcribe returns text and does not look like an answer confirmation", async () => {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("same-origin");
    expect((init?.headers as HeadersInit as Record<string, string>)["X-Send-Consent"]).toBe("true");
    return new Response(JSON.stringify({ text: "训练误差不能代表泛化" }), { status: 200, headers: { "content-type": "application/json" } });
  });
  await expect(requestTranscription(new Blob(["x"], { type: "audio/webm" }), "r1", new AbortController().signal, fetchImpl))
    .resolves.toEqual({ status: "ok", text: "训练误差不能代表泛化" });
});

test("transcribe maps consent, quota and too-long without treating them as answers", async () => {
  await expect(requestTranscription(new Blob(["x"]), "r", new AbortController().signal, async () =>
    new Response(JSON.stringify({ error: "consent-required" }), { status: 400 }))).resolves.toMatchObject({ status: "consent" });
  await expect(requestTranscription(new Blob(["x"]), "r", new AbortController().signal, async () =>
    new Response(JSON.stringify({ error: "quota-exhausted" }), { status: 429 }))).resolves.toMatchObject({ status: "quota" });
  await expect(requestTranscription(new Blob(["x"]), "r", new AbortController().signal, async () =>
    new Response(JSON.stringify({ error: "too-long" }), { status: 422 }))).resolves.toMatchObject({ status: "too-long" });
});
