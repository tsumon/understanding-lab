import type { LearningSession } from "../domain/contracts";
import type { TutorResult } from "../tutor/service";

export type TutorRequest = { requestId: string; signal: AbortSignal };

export type PostTutorInput = {
  sendConsent: true;
  includeNotes?: boolean;
  guard: TutorRequestGuard;
  fetchImpl?: typeof fetch;
};

export type PostTutorOutcome =
  | { status: "accepted"; requestId: string; contentRevision: number; result: TutorResult }
  | { status: "aborted" }
  | { status: "stale" }
  | { status: "quota"; question: string }
  | { status: "unavailable"; reason: "timeout" | "invalid-output" | "provider" | "busy"; question: string }
  | { status: "deleted" }
  | { status: "unauthorized"; question: string }
  | { status: "forbidden"; question: string }
  | { status: "not-found"; question: string }
  | { status: "conflict"; question: string }
  | { status: "consent"; question: string }
  | { status: "error"; question: string };

const QUOTA_QUESTION = "今日教学次数已用完。额度按 UTC 日期计算，每天最多 30 次教学、10 次转写（转写尚未接通）。";
const BUSY_QUESTION = "教学服务正忙，请稍后重试。这次没有判断对错。";
const UNAVAILABLE_QUESTION = "AI 暂不可用。你可以继续实验或保留回答后重试。";

/** Call invalidate for input, snapshot, step, or clarification-round changes. */
export class TutorRequestGuard {
  private pending: { requestId: string; contentRevision: number; controller: AbortController } | null = null;

  start(contentRevision: number): TutorRequest | null {
    if (this.pending?.contentRevision === contentRevision) return null;
    this.invalidate();
    const controller = new AbortController();
    const requestId = crypto.randomUUID();
    this.pending = { requestId, contentRevision, controller };
    return { requestId, signal: controller.signal };
  }

  accept(requestId: string, contentRevision: number): boolean {
    return this.pending?.requestId === requestId && this.pending.contentRevision === contentRevision;
  }

  finish(requestId: string): void {
    if (this.pending?.requestId === requestId) this.pending = null;
  }

  invalidate(): void {
    this.pending?.controller.abort();
    this.pending = null;
  }
}

function isTutorResult(value: unknown): value is TutorResult {
  if (value === null || typeof value !== "object") return false;
  const result = value as { status?: unknown; output?: unknown; model?: unknown; promptVersion?: unknown; reason?: unknown; question?: unknown };
  if (result.status === "ok") {
    return result.output !== null && typeof result.output === "object"
      && typeof result.model === "string" && typeof result.promptVersion === "string";
  }
  return result.status === "unavailable" && typeof result.reason === "string" && typeof result.question === "string";
}

function isTutorResponse(value: unknown): value is { requestId: string; contentRevision: number; result: TutorResult } {
  if (value === null || typeof value !== "object") return false;
  const body = value as { requestId?: unknown; contentRevision?: unknown; result?: unknown };
  return typeof body.requestId === "string" && Number.isSafeInteger(body.contentRevision) && isTutorResult(body.result);
}

function httpOutcome(status: number): PostTutorOutcome | null {
  if (status === 400) return { status: "consent", question: "发送给 AI 需要明确同意。这次没有调用模型。" };
  if (status === 401) return { status: "unauthorized", question: "发送给 AI 需要先登录。本机草稿未上传。" };
  if (status === 403) return { status: "forbidden", question: "当前来源不被允许发送给 AI。" };
  if (status === 404) return { status: "not-found", question: "找不到这次账号记录。" };
  if (status === 409) return { status: "conflict", question: "相同请求已处理，没有重复发送。" };
  if (status === 410) return { status: "deleted" };
  if (status === 429) return { status: "quota", question: QUOTA_QUESTION };
  if (status === 503) return { status: "unavailable", reason: "busy", question: BUSY_QUESTION };
  return null;
}

export async function postTutor(session: LearningSession, input: PostTutorInput): Promise<PostTutorOutcome | null> {
  const token = input.guard.start(session.contentRevision);
  if (!token) return null;
  const includeNotes = input.includeNotes === true;
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = {
    requestId: token.requestId,
    session: includeNotes ? session : { ...session, notes: "" },
    includeNotes,
    sendConsent: true as const,
  };
  try {
    const response = await fetchImpl("/api/tutor", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      signal: token.signal,
      body: JSON.stringify(body),
    });
    if (token.signal.aborted || !input.guard.accept(token.requestId, session.contentRevision)) {
      return { status: "aborted" };
    }
    const mapped = httpOutcome(response.status);
    if (mapped) return mapped;
    if (response.status !== 200) {
      return { status: "error", question: UNAVAILABLE_QUESTION };
    }
    let parsed: unknown = null;
    try { parsed = await response.json(); } catch { parsed = null; }
    if (!isTutorResponse(parsed) || parsed.requestId !== token.requestId) {
      return { status: "unavailable", reason: "invalid-output", question: "AI 反馈未通过检查。请保留当前回答，稍后重试。" };
    }
    if (!input.guard.accept(token.requestId, session.contentRevision) || parsed.contentRevision !== session.contentRevision) {
      return { status: "stale" };
    }
    return { status: "accepted", requestId: parsed.requestId, contentRevision: parsed.contentRevision, result: parsed.result };
  } catch (error) {
    if (token.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError")) {
      return { status: "aborted" };
    }
    return { status: "unavailable", reason: "provider", question: UNAVAILABLE_QUESTION };
  } finally {
    input.guard.finish(token.requestId);
  }
}
