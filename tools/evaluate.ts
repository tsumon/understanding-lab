import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SessionSchema, TopicSchema, type TutorOutput } from "../src/domain/contracts";
import { CATEGORIES, acceptanceCases, devCases, type EvaluationCase } from "./eval-cases";
export type { EvaluationCase };

export type DatasetCheck = { ok: boolean; errors: string[] };

const ROOT = dirname(fileURLToPath(import.meta.url));
const EVAL_DIR = join(ROOT, "../eval");
const TOPIC = TopicSchema.parse(JSON.parse(readFileSync(join(ROOT, "../content/overfitting.v1.json"), "utf8")));

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function checkDataset(dev: EvaluationCase[], acceptance: EvaluationCase[]): DatasetCheck {
  const all = [...dev, ...acceptance];
  const errors: string[] = [];
  if (all.filter((item) => item.reviewedBy && item.reviewedAt).length < 40) {
    errors.push("need-at-least-40-human-reviewed-cases");
  }
  if (all.some((item) => !item.reviewedBy || !item.reviewedAt)) errors.push("unreviewed-case");
  if (new Set(all.map((item) => item.id)).size !== all.length) errors.push("duplicate-case-id");
  const families = new Set(dev.map((item) => item.familyId));
  if (acceptance.some((item) => families.has(item.familyId))) errors.push("split-family-leakage");
  if (dev.length !== 28 || acceptance.length !== 14) errors.push("unexpected-split-size");

  for (const item of all) {
    if (!CATEGORIES.includes(item.category)) errors.push("unknown-category");
    if (item.split !== "dev" && item.split !== "acceptance") errors.push("invalid-split");
    if (dev.includes(item) && item.split !== "dev") errors.push("split-field-mismatch");
    if (acceptance.includes(item) && item.split !== "acceptance") errors.push("split-field-mismatch");
    if (!SessionSchema.safeParse(item.input).success) errors.push("invalid-session");
    if (item.input.topicVersion !== TOPIC.version) errors.push("unknown-topic");
    const questionIds = new Set(TOPIC.questions.map((question) => question.id));
    if (item.input.answers.some((answer) => !questionIds.has(answer.questionId))) errors.push("unknown-question");
  }

  for (const category of CATEGORIES) {
    const inDev = dev.filter((item) => item.category === category).length;
    const inAcc = acceptance.filter((item) => item.category === category).length;
    if (inDev !== 4 || inAcc !== 2) errors.push("category-quota");
  }

  try {
    const review = JSON.parse(readFileSync(join(ROOT, "../content/review.json"), "utf8")) as { status?: string };
    if (review.status !== "approved") errors.push("content-review-pending");
  } catch {
    errors.push("content-review-pending");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function checkAcceptanceFreeze(acceptance: EvaluationCase[], expectedHash: string): boolean {
  return sha256(canonicalJson(acceptance)) === expectedHash;
}

export type OutputCheck = { ok: boolean; errors: string[] };

export function fixtureOutput(item: EvaluationCase): TutorOutput {
  const concepts = item.requiredConcepts.join("、");
  return {
    kind: item.expectedKinds[0],
    claim: `与「${concepts}」有关的判断`,
    reason: `需要谈到 ${concepts}`,
    nextAction: "ask",
    question: `请说明${item.requiredConcepts[0] ?? "依据"}`,
    quotes: [], sources: [], metrics: [],
  };
}

export function runFixtureEvaluation(cases: EvaluationCase[], limit: number) {
  return cases.slice(0, limit).map((item) => {
    const output = fixtureOutput(item);
    return {
      id: item.id,
      split: item.split,
      inputHash: sha256(canonicalJson(item.input)),
      model: "fixture-v1",
      promptVersion: "fixture",
      output,
      check: checkTutorOutput(item, output),
    };
  });
}

export function checkTutorOutput(item: EvaluationCase, output: TutorOutput): OutputCheck {
  const errors: string[] = [];
  if (!item.expectedKinds.includes(output.kind)) errors.push("unexpected-kind");
  const haystack = `${output.claim}\n${output.reason}\n${output.question ?? ""}`;
  for (const concept of item.requiredConcepts) {
    if (!haystack.includes(concept)) errors.push("missing-concept");
  }
  for (const claim of item.forbiddenClaims) {
    if (haystack.includes(claim)) errors.push("forbidden-claim");
  }
  return { ok: errors.length === 0, errors };
}

export function loadCommittedCases(): { dev: EvaluationCase[]; acceptance: EvaluationCase[] } {
  const dev = JSON.parse(readFileSync(join(EVAL_DIR, "cases.dev.json"), "utf8")) as EvaluationCase[];
  const acceptance = JSON.parse(readFileSync(join(EVAL_DIR, "cases.acceptance.json"), "utf8")) as EvaluationCase[];
  return { dev, acceptance };
}

export function writeCommittedCases(): void {
  mkdirSync(EVAL_DIR, { recursive: true });
  writeFileSync(join(EVAL_DIR, "cases.dev.json"), `${JSON.stringify(devCases, null, 2)}\n`);
  writeFileSync(join(EVAL_DIR, "cases.acceptance.json"), `${JSON.stringify(acceptanceCases, null, 2)}\n`);
  writeFileSync(join(EVAL_DIR, "acceptance.sha256"), `${sha256(canonicalJson(acceptanceCases))}\n`);
}

function printCheck(result: DatasetCheck, frozen: boolean): never {
  const payload = { ok: result.ok && frozen, errors: frozen ? result.errors : [...result.errors, "acceptance-hash-mismatch"] };
  console.log(JSON.stringify(payload));
  process.exit(payload.ok ? 0 : 1);
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? "check";
  if (command === "write-cases") {
    writeCommittedCases();
    console.log(JSON.stringify({ event: "eval-cases-written", dev: devCases.length, acceptance: acceptanceCases.length }));
    return;
  }
  if (command === "check") {
    const { dev, acceptance } = loadCommittedCases();
    const result = checkDataset(dev, acceptance);
    const expected = readFileSync(join(EVAL_DIR, "acceptance.sha256"), "utf8").trim();
    printCheck(result, checkAcceptanceFreeze(acceptance, expected));
  }
  if (command === "run") {
    if (process.env.EVAL_RUN !== "true") {
      console.error(JSON.stringify({ event: "eval-run-disabled", reason: "EVAL_RUN is not true; refusing to call a provider" }));
      process.exit(2);
    }
    const budget = Number(process.env.EVAL_BUDGET ?? "0");
    if (!Number.isSafeInteger(budget) || budget <= 0) {
      console.error(JSON.stringify({ event: "eval-run-disabled", reason: "EVAL_BUDGET must be a positive integer" }));
      process.exit(2);
    }
    const provider = process.env.EVAL_PROVIDER ?? "";
    if (provider !== "fixture") {
      console.error(JSON.stringify({ event: "eval-run-not-authorized", reason: "real provider eval needs EVAL_PROVIDER=fixture or a separate paid-provider grant" }));
      process.exit(2);
    }
    const { dev, acceptance } = loadCommittedCases();
    const split = process.env.EVAL_SPLIT === "acceptance" ? acceptance : process.env.EVAL_SPLIT === "dev" ? dev : [...dev, ...acceptance];
    const rows = runFixtureEvaluation(split, budget);
    const failed = rows.filter((row) => !row.check.ok).length;
    const outDir = process.env.EVAL_RUN_DIR || join(ROOT, "../reviews/runs");
    mkdirSync(outDir, { recursive: true });
    const file = join(outDir, `fixture-${new Date().toISOString().replaceAll(":", "")}.json`);
    writeFileSync(file, `${JSON.stringify({
      provider: "fixture", model: "fixture-v1", promptVersion: "fixture",
      note: "Deterministic fixture, not a paid model and not human semantic review.",
      startedAt: new Date().toISOString(), budget, split: process.env.EVAL_SPLIT ?? "all",
      passed: rows.length - failed, failed, rows,
    }, null, 2)}\n`);
    console.log(JSON.stringify({ event: "eval-run-complete", provider: "fixture", file, passed: rows.length - failed, failed }));
    process.exit(failed === 0 ? 0 : 1);
  }
  console.error(JSON.stringify({ event: "unknown-command" }));
  process.exit(2);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error(JSON.stringify({ event: "eval-failed" }));
    process.exit(1);
  });
}
