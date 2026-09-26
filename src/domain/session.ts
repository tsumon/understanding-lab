import topic from "../../content/overfitting.v1.json";
import { SessionSchema, type Answer, type LearningSession, type Snapshot, type Step, type StoredFeedback } from "./contracts";

export type SessionEvent =
  | { type: "confirm"; answer: Answer }
  | { type: "continue" } | { type: "skip" } | { type: "start-experiment" } | { type: "back" }
  | { type: "set-notes"; notes: string }
  | { type: "snapshot"; snapshot: Snapshot }
  | { type: "disagree"; feedbackId: string; reason: string; createdAt: string };

export const STEPS: readonly Step[] = ["explain", "clarify", "predict", "experiment", "reexplain", "transfer", "summary"];

export function currentAnswer(session: LearningSession): Answer | undefined {
  return session.answers.filter((answer) => answer.step === session.step
    && (session.step !== "clarify" || answer.clarificationRound === session.clarificationRound))
    .reduce<Answer | undefined>((latest, answer) => !latest || answer.revision > latest.revision ? answer : latest, undefined);
}

// Feedback enters this store only after the tutor boundary validates its citations.
// These views handle freshness, not validation. The UI should collapse stale rows.
export function feedbackViews(session: LearningSession): { feedback: StoredFeedback; stale: boolean }[] {
  return session.feedback.map((feedback) => ({ feedback, stale: feedback.contentRevision !== session.contentRevision }));
}

export function currentFeedback(session: LearningSession): StoredFeedback[] {
  return feedbackViews(session).filter((view) => !view.stale).map((view) => view.feedback);
}

export function hasCurrentEvidence(session: LearningSession): boolean {
  const answer = currentAnswer(session);
  return !!answer && !session.skipped.includes(session.step) && currentFeedback(session).some((feedback) =>
    feedback.output.kind === "supported" && feedback.output.quotes.some((quote) =>
      quote.answerId === answer.id && quote.answerRevision === answer.revision));
}

function uniqueFeedback(session: LearningSession, id: string): StoredFeedback {
  const matches = session.feedback.filter((feedback) => feedback.id === id);
  if (matches.length !== 1) throw new Error("feedback-not-unique");
  return matches[0];
}

/** Recovers original wording even when a historical tutor question is now stale. */
export function questionFor(session: LearningSession, id: string): string {
  if (id.startsWith("tutor:")) {
    const feedback = uniqueFeedback(session, id.slice(6));
    if (!feedback.output.question?.trim()) throw new Error("question-required");
    return feedback.output.question;
  }
  const question = session.topicVersion === topic.version && topic.questions.find((question) => question.id === id);
  if (!question) throw new Error("unknown-question");
  return question.text;
}

function move(session: LearningSession, direction: 1 | -1): LearningSession {
  if (session.step === "clarify") {
    if (direction === 1 && session.clarificationRound === 1) return { ...session, clarificationRound: 2 };
    if (direction === -1 && session.clarificationRound === 2) return { ...session, clarificationRound: 1 };
  }
  const index = STEPS.indexOf(session.step) + direction;
  if (index < 0 || index >= STEPS.length) return session;
  const step = STEPS[index];
  return { ...session, step, ...(step === "clarify" ? { clarificationRound: direction === 1 ? 1 as const : 2 as const } : {}) };
}

function completed(session: LearningSession, step: Step): boolean {
  if (step === "clarify") return [1, 2].every((round) => session.answers.some((answer) => answer.step === step && answer.clarificationRound === round));
  if (step === "experiment") return session.snapshots.length > 0;
  return session.answers.some((answer) => answer.step === step);
}

function markSkipped(session: LearningSession, steps: Step[]): LearningSession {
  const skipped = [...new Set([...session.skipped, ...steps])];
  return skipped.length === session.skipped.length ? session
    : { ...session, skipped, contentRevision: session.contentRevision + 1 };
}

function confirm(session: LearningSession, answer: Answer): LearningSession {
  if (answer.step !== session.step || session.step === "experiment" || session.step === "summary") throw new Error("answer-step-mismatch");
  if (!answer.text.trim() || !answer.id.trim()) throw new Error("answer-required");
  if (session.step === "clarify" && answer.clarificationRound !== session.clarificationRound) throw new Error("clarification-round-mismatch");
  const current = currentAnswer(session);
  const history = session.answers.filter((old) => old.id === answer.id);
  if ((current && current.id !== answer.id) || history.some((old) =>
    old.step !== answer.step || old.questionId !== answer.questionId || old.clarificationRound !== answer.clarificationRound)) {
    throw new Error("answer-identity-conflict");
  }
  const revision = history.reduce((max, old) => Math.max(max, old.revision), 0) + 1;
  if (answer.revision !== revision) throw new Error("answer-revision-conflict");
  questionFor(session, answer.questionId);
  if (answer.questionId.startsWith("tutor:")) {
    const feedback = uniqueFeedback(session, answer.questionId.slice(6));
    if (session.step !== "clarify" || feedback.output.nextAction !== "ask") throw new Error("clarification-required");
    if (!history.length && feedback.contentRevision !== session.contentRevision) throw new Error("stale-question");
    if (session.answers.some((old) => old.questionId === answer.questionId && old.id !== answer.id)) throw new Error("question-already-answered");
  } else if (answer.questionId !== `${session.step}-${session.step === "clarify" ? session.clarificationRound : 1}`) {
    throw new Error("question-step-mismatch");
  }
  const answers = [...session.answers, answer];
  const clarificationCount = new Set(answers.filter((answer) => answer.step === "clarify").map((answer) => answer.clarificationRound)).size;
  const next = { ...session, answers, clarificationCount, contentRevision: session.contentRevision + 1 };
  return { ...next, skipped: completed(next, session.step) ? next.skipped.filter((step) => step !== session.step) : next.skipped };
}

/** Only explicit user events reach this reducer; model nextAction never navigates. */
export function transition(session: LearningSession, event: SessionEvent): LearningSession {
  let next: LearningSession;
  switch (event.type) {
    case "confirm": next = confirm(session, event.answer); break;
    case "continue":
      if (session.step === "summary") return session;
      if (session.step === "experiment") {
        if (!session.snapshots.length) throw new Error("snapshot-required");
      } else if (!currentAnswer(session)) throw new Error("confirmation-required");
      next = move(session, 1); break;
    case "back": next = move(session, -1); break;
    case "skip":
      if (session.step === "summary") return session;
      next = move(markSkipped(session, [session.step]), 1); break;
    case "start-experiment":
      if (STEPS.indexOf(session.step) > STEPS.indexOf("experiment")) throw new Error("use-back-navigation");
      next = { ...markSkipped(session, (["explain", "clarify", "predict"] as Step[]).filter((step) => !completed(session, step))), step: "experiment" };
      break;
    case "set-notes":
      if (event.notes === session.notes) return session;
      next = { ...session, notes: event.notes, contentRevision: session.contentRevision + 1 }; break;
    case "snapshot":
      if (session.step !== "experiment") throw new Error("experiment-required");
      if (session.snapshots.some((snapshot) => snapshot.id === event.snapshot.id)) throw new Error("snapshot-id-conflict");
      next = { ...session, snapshots: [...session.snapshots, event.snapshot], skipped: session.skipped.filter((step) => step !== "experiment"), contentRevision: session.contentRevision + 1 };
      break;
    case "disagree":
      uniqueFeedback(session, event.feedbackId);
      if (!event.reason.trim()) throw new Error("disagreement-reason-required");
      next = { ...session, disagreements: [...session.disagreements, { feedbackId: event.feedbackId, reason: event.reason, createdAt: event.createdAt }] }; break;
    default: throw new Error("unknown-session-event");
  }
  // Enforce payload limits and detach user-owned inputs before storing history.
  return SessionSchema.parse(next);
}
