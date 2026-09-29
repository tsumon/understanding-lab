import { existsSync } from "node:fs";
import { expect, test } from "vitest";
import ffmpegPath from "ffmpeg-static";
import { AudioError, encodeWav, MAX_PCM_BYTES, SAMPLE_RATE, normalizeAudio } from "../../src/server/audio";

const bin = typeof ffmpegPath === "string" ? ffmpegPath : "";
const hasFfmpeg = Boolean(bin && existsSync(bin));

function pcmSeconds(seconds: number): Uint8Array {
  return new Uint8Array(Math.round(seconds * SAMPLE_RATE) * 2);
}

test.skipIf(!hasFfmpeg)("real ffmpeg decodes a short wav and rejects audio longer than 60s", async () => {
  const signal = new AbortController().signal;
  const short = encodeWav(pcmSeconds(0.5));
  const decoded = await normalizeAudio(short, signal, undefined, bin);
  expect(decoded.byteLength).toBeGreaterThan(44);
  expect(decoded.byteLength - 44).toBeLessThanOrEqual(MAX_PCM_BYTES);
  const long = encodeWav(pcmSeconds(61));
  await expect(normalizeAudio(long, signal, undefined, bin)).rejects.toMatchObject({ code: "too-long" });
});
