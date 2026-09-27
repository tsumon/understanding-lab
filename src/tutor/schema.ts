import { z } from "zod";
import type { TutorOutput } from "../domain/contracts";

const tutorWireShape = {
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
};

export const TutorWireSchema = z.strictObject(tutorWireShape) satisfies z.ZodType<TutorOutput>;
export const tutorWireJsonSchema = z.toJSONSchema(TutorWireSchema, { target: "draft-07" });

export const TutorOutputSchema = z.strictObject({
  ...tutorWireShape,
  claim: z.string().refine((value) => [...value].length <= 160),
  reason: z.string().refine((value) => [...value].length <= 800),
  question: z.string().refine((value) => [...value].length <= 160).nullable(),
  quotes: tutorWireShape.quotes.max(3),
  sources: tutorWireShape.sources.max(3),
  metrics: tutorWireShape.metrics.max(3),
}) satisfies z.ZodType<TutorOutput>;
