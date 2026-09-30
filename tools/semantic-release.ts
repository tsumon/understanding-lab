import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { TutorOutputSchema } from "../src/tutor/schema";
import { canonicalJson, checkAcceptanceFreeze, checkTutorOutput, sha256, type EvaluationCase } from "./evaluate";

const nonempty = z.string().trim().min(1);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const nonRealMarker = /(?:^|[\s._-])(?:fixture|mock|synthetic|design|not[\s._-]?run)(?=$|[\s._-])/i;
const realIdentifier = nonempty.refine((value) => !nonRealMarker.test(value));
const humanReviewer = nonempty.refine((value) => !nonRealMarker.test(value)
  && !/(?:^|[\s._-])agent(?=$|[\s._-])/i.test(value));
const isoDate = z.iso.datetime({ offset: true });
const rowIdentity = { caseId: nonempty, caseHash: hash, inputHash: hash, outputHash: hash };
const runSchema = z.strictObject({
  schemaVersion: z.literal(1),
  execution: z.literal("real"),
  runId: realIdentifier,
  provider: realIdentifier,
  model: realIdentifier,
  promptVersion: realIdentifier,
  acceptanceHash: hash,
  rows: z.array(z.strictObject({
    ...rowIdentity,
    output: TutorOutputSchema,
    check: z.strictObject({ ok: z.boolean(), errors: z.array(z.string()) }).optional(),
  })).length(14),
});
const judgment = z.enum(["pass", "fail", "not-run"]);
const reviewSchema = z.strictObject({
  schemaVersion: z.literal(1),
  provenance: z.literal("human"),
  humanAttested: z.literal(true),
  reviewer: humanReviewer,
  reviewedAt: isoDate,
  runHash: hash,
  runId: nonempty,
  model: nonempty,
  promptVersion: nonempty,
  rows: z.array(z.strictObject({
    ...rowIdentity,
    evidenceSupported: judgment,
    unfairRejection: judgment,
    fabricatedSources: judgment,
    fabricatedMetrics: judgment,
  })).length(14),
});

export type SemanticReleaseCheck = { ok: boolean; errors: string[] };

/** Checks declared evidence and bindings; it cannot authenticate a reviewer's identity. */
export function checkSemanticRelease(
  runInput: unknown,
  reviewInput: unknown,
  acceptance: readonly EvaluationCase[],
  frozenHash: string,
): SemanticReleaseCheck {
  const errors = new Set<string>();
  if (acceptance.length !== 14 || !checkAcceptanceFreeze([...acceptance], frozenHash)) {
    errors.add("acceptance-freeze-invalid");
  }
  const runResult = runSchema.safeParse(runInput);
  const reviewResult = reviewSchema.safeParse(reviewInput);
  if (!runResult.success) errors.add("run-invalid");
  if (!reviewResult.success) errors.add("review-invalid");
  if (!runResult.success || !reviewResult.success || errors.has("acceptance-freeze-invalid")) {
    return { ok: false, errors: [...errors] };
  }

  const run = runResult.data;
  const review = reviewResult.data;
  if (run.acceptanceHash !== frozenHash) errors.add("run-freeze-mismatch");
  if (review.runHash !== sha256(canonicalJson(runInput)) || review.runId !== run.runId
    || review.model !== run.model || review.promptVersion !== run.promptVersion) {
    errors.add("review-run-mismatch");
  }
  const expected = new Map(acceptance.map((item) => [item.id, item]));
  const runIds = new Set<string>();
  for (const row of run.rows) {
    if (runIds.has(row.caseId)) errors.add("run-duplicate-case");
    runIds.add(row.caseId);
    const item = expected.get(row.caseId);
    if (!item) { errors.add("run-unknown-case"); continue; }
    if (row.caseHash !== sha256(canonicalJson(item))) errors.add("case-hash-mismatch");
    if (row.inputHash !== sha256(canonicalJson(item.input))) errors.add("input-hash-mismatch");
    if (row.outputHash !== sha256(canonicalJson(row.output))) errors.add("output-hash-mismatch");
    if (!checkTutorOutput(item, row.output).ok) errors.add("programmatic-check-failed");
    if (row.check && (!row.check.ok || row.check.errors.length > 0)) errors.add("reported-check-failed");
  }
  if (runIds.size !== expected.size) errors.add("run-coverage-incomplete");

  const reviewIds = new Set<string>();
  const runRows = new Map(run.rows.map((row) => [row.caseId, row]));
  for (const row of review.rows) {
    if (reviewIds.has(row.caseId)) errors.add("review-duplicate-case");
    reviewIds.add(row.caseId);
    const selected = runRows.get(row.caseId);
    if (!selected || !expected.has(row.caseId)) { errors.add("review-unknown-case"); continue; }
    if (row.caseHash !== selected.caseHash || row.inputHash !== selected.inputHash
      || row.outputHash !== selected.outputHash) errors.add("review-row-mismatch");
    if (row.evidenceSupported !== "pass" || row.unfairRejection !== "pass"
      || row.fabricatedSources !== "pass" || row.fabricatedMetrics !== "pass") {
      errors.add("semantic-judgment-failed");
    }
  }
  if (reviewIds.size !== expected.size) errors.add("review-coverage-incomplete");
  return { ok: errors.size === 0, errors: [...errors] };
}

function cli(): void {
  const args = process.argv.slice(2);
  if (args.length !== 4 || args[0] !== "--run" || args[2] !== "--review"
    || !args[1] || !args[3] || args[1].startsWith("--") || args[3].startsWith("--")) {
    console.log(JSON.stringify({ ok: false, errors: ["usage: eval:release-check -- --run <run.json> --review <review.json>"] }));
    process.exitCode = 2;
    return;
  }
  try {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    const acceptance = JSON.parse(readFileSync(join(root, "eval/cases.acceptance.json"), "utf8")) as EvaluationCase[];
    const frozenHash = readFileSync(join(root, "eval/acceptance.sha256"), "utf8").trim();
    const run = JSON.parse(readFileSync(args[1], "utf8")) as unknown;
    const review = JSON.parse(readFileSync(args[3], "utf8")) as unknown;
    const result = checkSemanticRelease(run, review, acceptance, frozenHash);
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  } catch {
    console.log(JSON.stringify({ ok: false, errors: ["evidence-file-unreadable-or-invalid-json"] }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) cli();
