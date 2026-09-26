import { z } from "zod";
import type { TutorOutput } from "../domain/contracts";

export const TutorOutputSchema = z.strictObject({
  kind: z.enum(["supported", "clarify", "contradiction", "insufficient"]),
  claim: z.string(),
  reason: z.string(),
  nextAction: z.enum(["ask", "experiment", "reexplain", "transfer", "summary"]),
  question: z.string().nullable(),
  quotes: z.array(z.strictObject({
    answerId: z.string(),
    answerRevision: z.number().int().min(0),
    start: z.number().int().min(0),
    end: z.number().int().min(0),
    text: z.string(),
  })),
  sources: z.array(z.strictObject({
    paragraphId: z.string(),
    topicVersion: z.string(),
  })),
  metrics: z.array(z.strictObject({
    snapshotId: z.string(),
    metric: z.enum(["trainMse", "validationMse", "testMse"]),
  })),
}) satisfies z.ZodType<TutorOutput>;
