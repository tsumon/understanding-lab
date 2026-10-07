import type { LearningSession } from "../domain/contracts";
import type { TutorResult } from "../tutor/service";
import { legacyLocale, tutorMessage, type Locale } from "../domain/locale";

export type TutorRequest = { requestId: string; signal: AbortSignal };

export type PostTutorInput = {
  sendConsent: true;
  includeNotes?: boolean;
  locale?: Locale;
  guard: TutorRequestGuard;
  request?: TutorRequest;
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

/** Call invalidate for input, snapshot, step, or clarification-round changes. */
export class TutorRequestGuard {
  private pending: { requestId: string; contentRevision: number; controller: AbortController; sent: boolean } | null = null;

  start(contentRevision: number): TutorRequest | null {
    if (this.pending?.contentRevision === contentRevision) return null;
    this.invalidate();
    const controller = new AbortController();
    const requestId = crypto.randomUUID();
    this.pending = { requestId, contentRevision, controller, sent: false };
    return { requestId, signal: controller.signal };
  }

  accept(requestId: string, contentRevision: number): boolean {
    return this.pending?.requestId === requestId && this.pending.contentRevision === contentRevision;
  }

  claim(requestId: string, contentRevision: number): boolean {
    const pending = this.pending;
    if (!pending || pending.requestId !== requestId || pending.contentRevision !== contentRevision || pending.sent) return false;
    pending.sent = true;
    return true;
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
  const result = value as { status?: unknown; output?: unknown; model?: unknown; promptVersion?: unknown; reason?: unknown;
    question?: unknown; evidenceLocale?: unknown; responseLocale?: unknown };
  if (result.status === "ok") {
    return result.output !== null && typeof result.output === "object"
      && typeof result.model === "string" && typeof result.promptVersion === "string"
      && (result.evidenceLocale === undefined || result.evidenceLocale === "en" || result.evidenceLocale === "zh-CN")
      && (result.responseLocale === undefined || result.responseLocale === "en" || result.responseLocale === "zh-CN");
  }
  return result.status === "unavailable" && typeof result.reason === "string" && typeof result.question === "string";
}

function isTutorResponse(value: unknown): value is { requestId: string; contentRevision: number; result: TutorResult } {
  if (value === null || typeof value !== "object") return false;
  const body = value as { requestId?: unknown; contentRevision?: unknown; result?: unknown };
  return typeof body.requestId === "string" && Number.isSafeInteger(body.contentRevision) && isTutorResult(body.result);
}

function errorCode(value: unknown): string | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const error = (value as { error?: unknown }).error;
  return typeof error === "string" ? error : undefined;
}

function httpOutcome(status: number, body: unknown, locale: Locale): PostTutorOutcome | null {
  const code = errorCode(body);
  if (status === 400 && code === "consent-required") {
    return { status: "consent", question: tutorMessage("consent", locale) };
  }
  if (status === 400) {
    return { status: "error", question: tutorMessage("invalid-request", locale) };
  }
  if (status === 401) return { status: "unauthorized", question: tutorMessage("unauthorized", locale) };
  if (status === 403) return { status: "forbidden", question: tutorMessage("forbidden", locale) };
  if (status === 404) return { status: "not-found", question: tutorMessage("not-found", locale) };
  if (status === 409) return { status: "conflict", question: tutorMessage("conflict", locale) };
  if (status === 410) return { status: "deleted" };
  if (status === 413) return { status: "error", question: tutorMessage("too-large", locale) };
  if (status === 429) return { status: "quota", question: tutorMessage("quota", locale) };
  if (status === 503) return { status: "unavailable", reason: "busy", question: tutorMessage("busy", locale) };
  return null;
}

export async function postTutor(session: LearningSession, input: PostTutorInput): Promise<PostTutorOutcome | null> {
  const locale = legacyLocale(input.locale);
  const token = input.request ?? input.guard.start(session.contentRevision);
  if (!token) return null;
  if (token.signal.aborted || !input.guard.claim(token.requestId, session.contentRevision)) return { status: "aborted" };
  const includeNotes = input.includeNotes === true;
  const fetchImpl = input.fetchImpl ?? fetch;
  const body = {
    requestId: token.requestId,
    session: includeNotes ? session : { ...session, notes: "" },
    includeNotes,
    sendConsent: true as const,
    ...(input.locale === undefined ? {} : { locale: input.locale }),
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
    let parsed: unknown = null;
    try { parsed = await response.json(); } catch { parsed = null; }
    const mapped = httpOutcome(response.status, parsed, locale);
    if (mapped) return mapped;
    if (response.status !== 200) {
      return { status: "error", question: tutorMessage("unavailable", locale) };
    }
    if (!isTutorResponse(parsed) || parsed.requestId !== token.requestId) {
      return { status: "unavailable", reason: "invalid-output", question: tutorMessage("invalid-output", locale) };
    }
    if (!input.guard.accept(token.requestId, session.contentRevision) || parsed.contentRevision !== session.contentRevision) {
      return { status: "stale" };
    }
    if (parsed.result.status === "ok" && (parsed.result.evidenceLocale !== undefined && parsed.result.evidenceLocale !== locale
      || parsed.result.responseLocale !== undefined && parsed.result.responseLocale !== locale
      || locale === "en" && (parsed.result.evidenceLocale !== "en" || parsed.result.responseLocale !== "en"))) {
      return { status: "unavailable", reason: "invalid-output", question: tutorMessage("invalid-output", locale) };
    }
    return { status: "accepted", requestId: parsed.requestId, contentRevision: parsed.contentRevision, result: parsed.result };
  } catch (error) {
    if (token.signal.aborted || (error instanceof DOMException && error.name === "AbortError") || (error instanceof Error && error.name === "AbortError")) {
      return { status: "aborted" };
    }
    return { status: "unavailable", reason: "provider", question: tutorMessage("unavailable", locale) };
  } finally {
    input.guard.finish(token.requestId);
  }
}
