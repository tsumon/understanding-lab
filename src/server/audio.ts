import { spawn } from "node:child_process";
import { once } from "node:events";

export const SAMPLE_RATE = 16000;
export const MAX_SECONDS = 60;
export const MAX_PCM_BYTES = MAX_SECONDS * SAMPLE_RATE * 2;
export const FFMPEG_ARGV = [
  "-hide_banner", "-loglevel", "error", "-protocol_whitelist", "pipe",
  "-i", "pipe:0", "-map", "0:a:0", "-vn", "-ac", "1", "-ar", "16000",
  "-t", "61", "-f", "s16le", "pipe:1",
] as const;

export class AudioError extends Error {
  constructor(public readonly code: "too-long" | "empty" | "decode" | "timeout") { super(code); }
}

export type FfmpegSpawn = (
  command: string,
  args: readonly string[],
  options: { stdio: ["pipe", "pipe", "pipe"]; shell: false; windowsHide: boolean },
) => {
  stdin: NodeJS.WritableStream & { destroy(): void };
  stdout: NodeJS.ReadableStream & { destroy(): void };
  stderr: NodeJS.ReadableStream & { destroy(): void };
  killed?: boolean;
  kill: (signal?: NodeJS.Signals) => boolean;
  once: (event: "close" | "error", listener: (...args: unknown[]) => void) => void;
};

export function encodeWav(pcm: Uint8Array): Uint8Array {
  const dataSize = pcm.byteLength;
  const bytes = new Uint8Array(44 + dataSize);
  const view = new DataView(bytes.buffer);
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, dataSize, true);
  bytes.set(pcm, 44);
  return bytes;
}

export async function normalizeAudio(
  input: Uint8Array,
  signal: AbortSignal,
  spawnImpl: FfmpegSpawn = spawn as FfmpegSpawn,
  ffmpegPath = process.env.FFMPEG_PATH?.trim() || "ffmpeg",
): Promise<Uint8Array> {
  if (signal.aborted) throw new AudioError("timeout");
  const child = spawnImpl(ffmpegPath, FFMPEG_ARGV, { stdio: ["pipe", "pipe", "pipe"], shell: false, windowsHide: true });
  const chunks: Buffer[] = [];
  let total = 0;
  let tooLong = false;
  const timer = setTimeout(() => { child.kill("SIGKILL"); }, 15_000);
  const onAbort = () => { child.kill("SIGKILL"); };
  signal.addEventListener("abort", onAbort, { once: true });
  const stdoutDone = new Promise<void>((resolve, reject) => {
    child.stdout.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_PCM_BYTES) {
        tooLong = true;
        child.kill("SIGKILL");
        child.stdout.destroy();
        return;
      }
      chunks.push(Buffer.from(chunk));
    });
    child.stdout.on("end", () => resolve());
    child.stdout.on("close", () => resolve());
    child.stdout.on("error", () => reject(new AudioError("decode")));
  });
  const closed = new Promise<number>((resolve, reject) => {
    child.once("close", (code) => resolve(typeof code === "number" ? code : 1));
    child.once("error", () => reject(new AudioError("decode")));
  });
  try {
    child.stdin.end(Buffer.from(input));
    const code = await Promise.race([
      Promise.all([closed, stdoutDone]).then(([exit]) => exit),
      once(signal, "abort").then(() => { throw new AudioError("timeout"); }),
    ]);
    if (signal.aborted) throw new AudioError("timeout");
    if (tooLong) throw new AudioError("too-long");
    if (code !== 0) throw new AudioError("decode");
    const pcm = Buffer.concat(chunks);
    if (pcm.length === 0) throw new AudioError("empty");
    return encodeWav(pcm);
  } catch (error) {
    child.kill("SIGKILL");
    if (error instanceof AudioError) throw error;
    throw new AudioError(signal.aborted ? "timeout" : "decode");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
    child.stdin.destroy();
    child.stdout.destroy();
    child.stderr.destroy();
  }
}
