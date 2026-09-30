import { expect, test } from "vitest";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { checkSemanticRelease } from "../../tools/semantic-release";
import { canonicalJson, fixtureOutput, loadCommittedCases, sha256 } from "../../tools/evaluate";

const root = join(import.meta.dirname, "../..");
const cases = loadCommittedCases().acceptance;
const freeze = readFileSync(join(root, "eval/acceptance.sha256"), "utf8").trim();

// This is synthetic in-memory test data, never evidence of a real provider or human review.
function completeEvidence() {
  const run = {
    schemaVersion: 1, execution: "real", runId: "unit-test-run",
    provider: "test-provider", model: "test-model", promptVersion: "test-prompt",
    acceptanceHash: freeze,
    rows: cases.map((item) => {
      const output = fixtureOutput(item);
      return {
        caseId: item.id, caseHash: sha256(canonicalJson(item)),
        inputHash: sha256(canonicalJson(item.input)),
        outputHash: sha256(canonicalJson(output)), output,
      };
    }),
  };
  const review = {
    schemaVersion: 1, provenance: "human", humanAttested: true,
    reviewer: "Unit Test Reviewer", reviewedAt: "2026-09-30T00:00:00.000Z",
    runHash: sha256(canonicalJson(run)), runId: run.runId,
    model: run.model, promptVersion: run.promptVersion,
    rows: run.rows.map(({ caseId, caseHash, inputHash, outputHash }) => ({
      caseId, caseHash, inputHash, outputHash,
      evidenceSupported: "pass", unfairRejection: "pass",
      fabricatedSources: "pass", fabricatedMetrics: "pass",
    })),
  };
  return { run, review };
}

const check = (run: unknown, review: unknown, hash = freeze) =>
  checkSemanticRelease(run, review, cases, hash);
const bindRun = (run: unknown, review: ReturnType<typeof completeEvidence>["review"]) =>
  ({ ...review, runHash: sha256(canonicalJson(run)) });

test("complete synthetic in-memory evidence satisfies the contract", () => {
  const { run, review } = completeEvidence();
  expect(check(run, review)).toEqual({ ok: true, errors: [] });
});

test("missing, malformed, and current design-only evidence cannot qualify", () => {
  expect(check(undefined, undefined).ok).toBe(false);
  expect(check({}, {}).ok).toBe(false);
  const labels = JSON.parse(readFileSync(join(root, "reviews/labels.json"), "utf8"));
  expect(check(labels, labels).ok).toBe(false);
});

test("stale freeze and fixture or agent attestations block release", () => {
  const { run, review } = completeEvidence();
  expect(check(run, review, sha256("stale")).ok).toBe(false);
  const fixtureRun = { ...run, execution: "fixture" };
  expect(check(fixtureRun, bindRun(fixtureRun, review)).errors).toContain("run-invalid");
  const mockRun = { ...run, provider: "mock" };
  expect(check(mockRun, bindRun(mockRun, review)).errors).toContain("run-invalid");
  expect(check(run, { ...review, reviewer: "operator-authorized-agent" }).ok).toBe(false);
  expect(check(run, { ...review, humanAttested: false }).ok).toBe(false);
  expect(check(run, { ...review, reviewedAt: "not-run" }).ok).toBe(false);
});

test("legitimate identity substrings do not imply fixture or agent provenance", () => {
  const { run, review } = completeEvidence();
  const renamedRun = { ...run, promptVersion: "redesign-v1" };
  const renamedReview = { ...bindRun(renamedRun, review), promptVersion: renamedRun.promptVersion, reviewer: "Morgan Agenton" };
  expect(check(renamedRun, renamedReview)).toEqual({ ok: true, errors: [] });
});

test("coverage must have exactly one row for every frozen case in both files", () => {
  const { run, review } = completeEvidence();
  const missingRun = { ...run, rows: run.rows.slice(1) };
  expect(check(missingRun, bindRun(missingRun, review)).errors).toContain("run-invalid");
  const duplicateRun = { ...run, rows: [...run.rows.slice(0, -1), run.rows[0]] };
  expect(check(duplicateRun, bindRun(duplicateRun, review)).errors).toContain("run-duplicate-case");
  const unknownRun = { ...run, rows: [{ ...run.rows[0], caseId: "unknown" }, ...run.rows.slice(1)] };
  expect(check(unknownRun, bindRun(unknownRun, review)).errors).toContain("run-unknown-case");
  expect(check(run, { ...review, rows: review.rows.slice(1) }).errors).toContain("review-invalid");
  expect(check(run, { ...review, rows: [...review.rows.slice(0, -1), review.rows[0]] }).errors).toContain("review-duplicate-case");
  expect(check(run, { ...review, rows: [{ ...review.rows[0], caseId: "unknown" }, ...review.rows.slice(1)] }).errors).toContain("review-unknown-case");
});

test("case, input, output, and full run hashes bind the review", () => {
  const { run, review } = completeEvidence();
  for (const [field, error] of [["caseHash", "case-hash-mismatch"], ["inputHash", "input-hash-mismatch"], ["outputHash", "output-hash-mismatch"]] as const) {
    const changed = { ...run, rows: [{ ...run.rows[0], [field]: sha256("stale") }, ...run.rows.slice(1)] };
    expect(check(changed, bindRun(changed, review)).errors).toContain(error);
  }
  expect(check(run, { ...review, runHash: sha256("different run") }).errors).toContain("review-run-mismatch");
  expect(check(run, { ...review, rows: [{ ...review.rows[0], outputHash: sha256("other output") }, ...review.rows.slice(1)] }).errors).toContain("review-row-mismatch");
  expect(check(run, { ...review, model: "another-model" }).errors).toContain("review-run-mismatch");
});

test("each independent semantic failure blocks", () => {
  const fields = ["evidenceSupported", "unfairRejection", "fabricatedSources", "fabricatedMetrics"] as const;
  for (const field of fields) {
    const { run, review } = completeEvidence();
    for (const value of ["fail", "not-run", undefined]) {
      const changed = { ...review.rows[0], [field]: value };
      expect(check(run, { ...review, rows: [changed, ...review.rows.slice(1)] }).ok).toBe(false);
    }
  }
});

test("malformed output and failing programmatic checks block even when reported pass", () => {
  const { run, review } = completeEvidence();
  const malformed = { ...run.rows[0], output: { ...run.rows[0].output, sources: [{ paragraphId: 3 }] } };
  const malformedRun = { ...run, rows: [malformed, ...run.rows.slice(1)] };
  expect(check(malformedRun, bindRun(malformedRun, review)).errors).toContain("run-invalid");
  const bad = { ...run.rows[0], output: { ...run.rows[0].output, kind: "contradiction" }, check: { ok: true, errors: [] } };
  bad.outputHash = sha256(canonicalJson(bad.output));
  const badRun = { ...run, rows: [bad, ...run.rows.slice(1)] };
  const badReview = { ...review, runHash: sha256(canonicalJson(badRun)), rows: [{ ...review.rows[0], outputHash: bad.outputHash }, ...review.rows.slice(1)] };
  expect(check(badRun, badReview).errors).toContain("programmatic-check-failed");
  const reported = { ...run.rows[0], check: { ok: false, errors: ["reported failure"] } };
  const reportedRun = { ...run, rows: [reported, ...run.rows.slice(1)] };
  expect(check(reportedRun, bindRun(reportedRun, review)).errors).toContain("reported-check-failed");
  const nonemptyErrors = { ...run.rows[0], check: { ok: true, errors: ["reported failure"] } };
  const nonemptyRun = { ...run, rows: [nonemptyErrors, ...run.rows.slice(1)] };
  expect(check(nonemptyRun, bindRun(nonemptyRun, review)).errors).toContain("reported-check-failed");
});

test("CLI fails with bounded JSON and no stack trace for absent, missing, malformed, or design-only files", () => {
  const invoke = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "tools/semantic-release.ts", ...args], { cwd: root, encoding: "utf8" });
  const missing = invoke();
  expect(missing.status).not.toBe(0);
  expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false });
  expect(missing.stderr).not.toMatch(/Error:|at tools\//);
  const invalid = invoke("--run", "reviews/labels.json", "--review", "reviews/labels.json");
  expect(invalid.status).not.toBe(0);
  expect(JSON.parse(invalid.stdout)).toMatchObject({ ok: false });
  expect(invalid.stdout).not.toContain("Case-design review");
  expect(invalid.stdout).not.toContain("reviews/labels.json");
  for (const path of ["/private/tmp/definitely-missing-semantic-run.json", "eval/acceptance.sha256"]) {
    const failure = invoke("--run", path, "--review", "reviews/labels.json");
    expect(failure.status).not.toBe(0);
    expect(JSON.parse(failure.stdout)).toEqual({ ok: false, errors: ["evidence-file-unreadable-or-invalid-json"] });
    expect(failure.stdout).not.toContain(path);
  }
});
