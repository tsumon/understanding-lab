import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { expect, test } from "vitest";
import {
  AudioError, encodeWav, FFMPEG_ARGV, MAX_PCM_BYTES, MAX_SECONDS, SAMPLE_RATE, normalizeAudio, type FfmpegSpawn,
} from "../../src/server/audio";

function ascii(bytes: Uint8Array, offset: number, length: number) {
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}

function pcmSeconds(seconds: number): Uint8Array {
  return new Uint8Array(Math.round(seconds * SAMPLE_RATE) * 2);
}

function mockSpawn(pcm: Uint8Array, exit = 0): FfmpegSpawn {
  return (_command, args, options) => {
    expect(options.shell).toBe(false);
    expect([...args]).toEqual([...FFMPEG_ARGV]);
    expect(args).toContain("pipe");
    expect(args[args.indexOf("-protocol_whitelist") + 1]).toBe("pipe");
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const child = new EventEmitter() as ReturnType<FfmpegSpawn> & EventEmitter;
    Object.assign(child, { stdin, stdout, stderr, killed: false });
    child.kill = () => {
      child.killed = true;
      stdout.end();
      queueMicrotask(() => child.emit("close", 1));
      return true;
    };
    stdin.on("finish", () => {
      const max = MAX_PCM_BYTES + 1;
      stdout.write(Buffer.from(pcm.subarray(0, Math.min(pcm.length, max + 32_000))));
      stdout.end();
      queueMicrotask(() => child.emit("close", exit));
    });
    return child;
  };
}

test("encodeWav writes PCM16 mono 16kHz headers and payload length", () => {
  const pcm = pcmSeconds(1);
  const wav = encodeWav(pcm);
  expect(ascii(wav, 0, 4)).toBe("RIFF");
  expect(ascii(wav, 8, 4)).toBe("WAVE");
  expect(new DataView(wav.buffer).getUint32(24, true)).toBe(16000);
  expect(new DataView(wav.buffer).getUint16(22, true)).toBe(1);
  expect(new DataView(wav.buffer).getUint16(34, true)).toBe(16);
  expect(new DataView(wav.buffer).getUint32(28, true)).toBe(32000);
  expect(new DataView(wav.buffer).getUint16(32, true)).toBe(2);
  expect(new DataView(wav.buffer).getUint32(40, true)).toBe(pcm.length);
  expect(wav.length).toBe(44 + pcm.length);
});

test("normalizeAudio accepts 0-boundary-adjacent durations and rejects empty, 61s, and decode failure", async () => {
  const signal = new AbortController().signal;
  await expect(normalizeAudio(new Uint8Array([1]), signal, mockSpawn(new Uint8Array(0)))).rejects.toThrow(AudioError);
  await expect(normalizeAudio(new Uint8Array([1]), signal, mockSpawn(pcmSeconds(59)))).resolves.toHaveLength(44 + pcmSeconds(59).length);
  await expect(normalizeAudio(new Uint8Array([1]), signal, mockSpawn(pcmSeconds(MAX_SECONDS)))).resolves.toHaveLength(44 + MAX_PCM_BYTES);
  await expect(normalizeAudio(new Uint8Array([1]), signal, mockSpawn(pcmSeconds(61)))).rejects.toMatchObject({ code: "too-long" });
  await expect(normalizeAudio(new Uint8Array([1]), signal, mockSpawn(pcmSeconds(1), 1))).rejects.toMatchObject({ code: "decode" });
});

test("ffmpeg argv never includes user filenames or extra protocols", async () => {
  let seen: readonly string[] = [];
  const spawn: FfmpegSpawn = (command, args, options) => {
    seen = args;
    expect(command).toBe("ffmpeg");
    return mockSpawn(pcmSeconds(1))(command, args, options);
  };
  await normalizeAudio(new Uint8Array([1, 2, 3]), new AbortController().signal, spawn, "ffmpeg");
  expect(seen.join(" ")).not.toMatch(/http|file:|concat/i);
  expect(seen).toContain("pipe:0");
  expect(seen).toContain("pipe:1");
});
