import type { Answer, LearningSession, TutorOutput } from "../domain/contracts";
import { TopicSchema } from "../domain/contracts";
import { metricFor, type ExperimentPack } from "../experiment/catalog";
import { TutorOutputSchema } from "./schema";
import { topicFor } from "../content/topics";
import { legacyLocale, type Locale } from "../domain/locale";
import type { z } from "zod";

export type Topic = z.infer<typeof TopicSchema>;
export type TutorContext = { session: LearningSession; topic: Topic; pack: ExperimentPack; includeNotes?: boolean;
  evidenceLocale?: Locale; responseLocale?: Locale };
export type VerificationCode = "schema" | "quote" | "source" | "metric" | "action";

export class VerificationError extends Error {
  constructor(public readonly code: VerificationCode) { super(code); }
}

/** JavaScript string offsets are UTF-16 code units, matching slice and browser selection offsets. */
export function verifyQuote(quote: TutorOutput["quotes"][number], answers: Answer[]): boolean {
  const answer = answers.find((item) => item.id === quote.answerId && item.revision === quote.answerRevision);
  return Boolean(answer
    && Number.isInteger(quote.start) && Number.isInteger(quote.end)
    && quote.start >= 0 && quote.end > quote.start
    && quote.end <= answer.text.length
    && answer.text.slice(quote.start, quote.end) === quote.text);
}

const permittedActions: Record<LearningSession["step"], readonly TutorOutput["nextAction"][]> = {
  explain: ["ask", "experiment"], clarify: ["ask", "experiment"],
  predict: ["experiment", "reexplain"], experiment: ["experiment", "reexplain"],
  reexplain: ["transfer"], transfer: ["summary"], summary: ["summary"],
};

/** Stored history keeps exact old revisions; current navigation rules do not rewrite history. */
export function verifyHistoricalTutor(raw: unknown, context: TutorContext): TutorOutput {
  const parsed = TutorOutputSchema.safeParse(raw);
  if (!parsed.success) throw new VerificationError("schema");
  const output = parsed.data;
  const { session, topic, pack } = context;
  if (topic.version !== session.topicVersion || pack.version !== session.topicVersion) throw new VerificationError("source");
  const registered = topicFor(session.topicVersion, legacyLocale(context.evidenceLocale));
  const normalized = TopicSchema.safeParse(topic);
  if (!normalized.success || JSON.stringify(normalized.data) !== JSON.stringify(registered)) throw new VerificationError("source");

  if ((output.kind === "supported" || output.kind === "contradiction") && output.quotes.length === 0) throw new VerificationError("quote");
  for (const quote of output.quotes) {
    if (!verifyQuote(quote, session.answers)) throw new VerificationError("quote");
  }

  if ((output.kind === "supported" || output.kind === "contradiction") && output.sources.length + output.metrics.length === 0) {
    throw new VerificationError("source");
  }
  for (const source of output.sources) {
    if (source.topicVersion !== topic.version || !topic.paragraphs.some((paragraph) => paragraph.id === source.paragraphId)) {
      throw new VerificationError("source");
    }
  }
  for (const metric of output.metrics) {
    const snapshot = session.snapshots.find((item) => item.id === metric.snapshotId);
    if (!snapshot) throw new VerificationError("metric");
    try { metricFor(pack, snapshot, metric.metric); }
    catch { throw new VerificationError("metric"); }
  }
  // Model prose may not supply numeric results; display cards resolve metric references in code.
  if ([output.claim, output.reason, output.question ?? ""].some((value) => /[0-9０-９]/u.test(value))) throw new VerificationError("metric");

  return output;
}

export function verifyTutor(raw: unknown, context: TutorContext): TutorOutput {
  const output = verifyHistoricalTutor(raw, context);
  const { session } = context;
  for (const quote of output.quotes) {
    if (session.answers.some((answer) => answer.id === quote.answerId && answer.revision > quote.answerRevision)) {
      throw new VerificationError("quote");
    }
  }

  if (!permittedActions[session.step].includes(output.nextAction)
    || (output.nextAction === "ask" && (session.clarificationCount >= 2 || !output.question?.trim()))
    || (output.nextAction !== "ask" && output.question !== null)) throw new VerificationError("action");
  return output;
}
