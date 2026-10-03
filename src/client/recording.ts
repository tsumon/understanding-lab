export type TrackBag = { getTracks(): { stop(): void }[] };

export function finishRecording(stream: TrackBag): void {
  for (const track of stream.getTracks()) track.stop();
}

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/mp4", "audio/ogg;codecs=opus"] as const;

export function pickMime(): string | null {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return null;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

export const RECORDING_LIMIT_MS = 60_000;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type TranscribeOutcome =
  | { status: "ok"; text: string }
  | { status: "consent" | "unauthorized" | "quota" | "unavailable" | "too-long" | "invalid" | "error"; question: string };

export async function requestTranscription(
  blob: Blob,
  requestId: string,
  signal: AbortSignal,
  fetchImpl: typeof fetch = fetch,
  locale: Locale = "zh-CN",
): Promise<TranscribeOutcome> {
  const copy = messages[locale];
  const body = new FormData();
  body.append("audio", blob, "speech.webm");
  try {
    const response = await fetchImpl("/api/transcribe", {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Send-Consent": "true", "X-Request-Id": requestId },
      signal,
      body,
    });
    if (response.status === 400) {
      const code = await errorCode(response);
      if (code === "consent-required") return { status: "consent", question: copy.transcriptionConsent };
      return { status: "invalid", question: copy.transcriptionInvalid };
    }
    if (response.status === 401) return { status: "unauthorized", question: copy.transcriptionUnauthorized };
    if (response.status === 413) return { status: "invalid", question: copy.transcriptionTooLarge };
    if (response.status === 422) return { status: "too-long", question: copy.transcriptionTooLong };
    if (response.status === 429) return { status: "quota", question: copy.transcriptionQuota };
    if (response.status === 503) {
      const code = await errorCode(response);
      if (code === "feature-disabled") return { status: "unavailable", question: copy.transcriptionDisabled };
      return { status: "unavailable", question: copy.transcriptionBusy };
    }
    if (response.status !== 200) return { status: "error", question: copy.transcriptionUnavailable };
    const parsed: unknown = await response.json().catch(() => null);
    const text = parsed !== null && typeof parsed === "object" && typeof (parsed as { text?: unknown }).text === "string"
      ? (parsed as { text: string }).text : "";
    if (!text.trim()) return { status: "invalid", question: copy.transcriptionEmpty };
    return { status: "ok", text };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { status: "error", question: copy.transcriptionCanceled };
    }
    return { status: "unavailable", question: copy.transcriptionUnavailable };
  }
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    return body !== null && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error : undefined;
  } catch { return undefined; }
}
import type { Locale } from "../domain/locale";
import { messages } from "./i18n";
