import { z } from "zod";
import { TutorOutputSchema } from "../tutor/schema";

export type Step = "explain" | "clarify" | "predict" | "experiment"
  | "reexplain" | "transfer" | "summary";
export type ExperimentConfig = {
  seed: 17 | 29 | 43; n: 20 | 40 | 80; noise: 0 | 0.1 | 0.3; degree: number;
};
export type Answer = {
  id: string; revision: number; step: Step; questionId: string;
  clarificationRound?: 1 | 2;
  text: string; confirmedAt: string;
};
export type Snapshot = {
  id: string; packVersion: "overfitting.v1"; config: ExperimentConfig;
  prediction: string; testRevealed: boolean; testContaminated: boolean;
};
export type TutorOutput = {
  kind: "supported" | "clarify" | "contradiction" | "insufficient";
  claim: string; reason: string;
  nextAction: "ask" | "experiment" | "reexplain" | "transfer" | "summary";
  question: string | null;
  quotes: { answerId: string; answerRevision: number;
    start: number; end: number; text: string }[];
  sources: { paragraphId: string; topicVersion: string }[];
  metrics: { snapshotId: string;
    metric: "trainMse" | "validationMse" | "testMse" }[];
};
export type StoredFeedback = {
  id: string; contentRevision: number; output: TutorOutput;
  model: string; promptVersion: string; createdAt: string;
};
export type LearningSession = {
  schemaVersion: 1; id: string; topicVersion: "overfitting.v1";
  contentRevision: number; step: Step; clarificationCount: number;
  clarificationRound: 1 | 2;
  skipped: Step[]; answers: Answer[]; snapshots: Snapshot[];
  notes: string; feedback: StoredFeedback[];
  disagreements: { feedbackId: string; reason: string; createdAt: string }[];
};

const codepointLengthAtMost = (limit: number) =>
  z.string().refine((value) => [...value].length <= limit, `最多 ${limit} 个字符`);

const StepSchema = z.enum([
  "explain", "clarify", "predict", "experiment", "reexplain", "transfer", "summary",
]);

export const ExperimentConfigSchema = z.strictObject({
  seed: z.union([z.literal(17), z.literal(29), z.literal(43)]),
  n: z.union([z.literal(20), z.literal(40), z.literal(80)]),
  noise: z.union([z.literal(0), z.literal(0.1), z.literal(0.3)]),
  degree: z.number().int().min(1).max(12),
}) satisfies z.ZodType<ExperimentConfig>;

const AnswerSchema = z.strictObject({
  id: z.string(),
  revision: z.number().int().min(0),
  step: StepSchema,
  questionId: z.string(),
  clarificationRound: z.union([z.literal(1), z.literal(2)]).optional(),
  text: codepointLengthAtMost(4000),
  confirmedAt: z.string(),
}).refine((answer) => answer.step === "clarify"
  ? answer.clarificationRound !== undefined : answer.clarificationRound === undefined,
"Clarification round is required only for clarification answers") satisfies z.ZodType<Answer>;

const SnapshotSchema = z.strictObject({
  id: z.string(),
  packVersion: z.literal("overfitting.v1"),
  config: ExperimentConfigSchema,
  prediction: codepointLengthAtMost(4000),
  testRevealed: z.boolean(),
  testContaminated: z.boolean(),
}) satisfies z.ZodType<Snapshot>;

const StoredFeedbackSchema = z.strictObject({
  id: z.string(),
  contentRevision: z.number().int().min(0),
  output: TutorOutputSchema,
  model: z.string(),
  promptVersion: z.string(),
  createdAt: z.string(),
}) satisfies z.ZodType<StoredFeedback>;

export const TopicSchema = z.strictObject({
  version: z.literal("overfitting.v1"),
  title: z.string(),
  paragraphs: z.array(z.strictObject({
    id: z.string(), text: z.string(), source: z.string(),
  })).length(4),
  questions: z.array(z.strictObject({
    id: z.string(), text: z.string(),
  })).length(6),
});

export const SessionSchema = z.strictObject({
  schemaVersion: z.literal(1),
  id: z.string(),
  topicVersion: z.literal("overfitting.v1"),
  contentRevision: z.number().int().min(0),
  step: StepSchema,
  clarificationCount: z.number().int().min(0).max(2),
  clarificationRound: z.union([z.literal(1), z.literal(2)]),
  skipped: z.array(StepSchema).max(7),
  answers: z.array(AnswerSchema).max(50),
  snapshots: z.array(SnapshotSchema).max(100),
  notes: codepointLengthAtMost(8000),
  feedback: z.array(StoredFeedbackSchema).max(100),
  disagreements: z.array(z.strictObject({
    feedbackId: z.string(), reason: z.string(), createdAt: z.string(),
  })),
}) satisfies z.ZodType<LearningSession>;

export function newSession(id: string): LearningSession {
  return {
    schemaVersion: 1, id, topicVersion: "overfitting.v1",
    contentRevision: 0, step: "explain", clarificationCount: 0, clarificationRound: 1,
    skipped: [], answers: [], snapshots: [], notes: "",
    feedback: [], disagreements: [],
  };
}
