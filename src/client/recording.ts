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
): Promise<TranscribeOutcome> {
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
      if (code === "consent-required") return { status: "consent", question: "转写需要单独同意。这次没有发送录音。" };
      return { status: "invalid", question: "这段录音无法转写。请改用文字，或重录后再试。" };
    }
    if (response.status === 401) return { status: "unauthorized", question: "转写需要先登录。本机草稿未上传。" };
    if (response.status === 413) return { status: "invalid", question: "录音文件超过 10MiB，没有发送给转写服务。" };
    if (response.status === 422) return { status: "too-long", question: "录音超过 60 秒，服务端没有裁成合法长度。" };
    if (response.status === 429) return { status: "quota", question: "今日转写次数已用完。额度按 UTC 日期计算，每天最多 10 次。" };
    if (response.status === 503) {
      const code = await errorCode(response);
      if (code === "feature-disabled") return { status: "unavailable", question: "转写未启用。请用文字继续。" };
      return { status: "unavailable", question: "转写服务正忙，请稍后重试。" };
    }
    if (response.status !== 200) return { status: "error", question: "转写暂时不可用。请用文字继续。" };
    const parsed: unknown = await response.json().catch(() => null);
    const text = parsed !== null && typeof parsed === "object" && typeof (parsed as { text?: unknown }).text === "string"
      ? (parsed as { text: string }).text : "";
    if (!text.trim()) return { status: "invalid", question: "转写结果为空。请编辑文字后再确认。" };
    return { status: "ok", text };
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { status: "error", question: "已取消转写。录音没有自动成为回答。" };
    }
    return { status: "unavailable", question: "转写暂时不可用。请用文字继续。" };
  }
}

async function errorCode(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    return body !== null && typeof body === "object" && typeof (body as { error?: unknown }).error === "string"
      ? (body as { error: string }).error : undefined;
  } catch { return undefined; }
}
