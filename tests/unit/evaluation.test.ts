import { expect, test } from "vitest";
import { checkAcceptanceFreeze, checkDataset, checkTutorOutput, loadCommittedCases, sha256, canonicalJson } from "../../tools/evaluate";
import { acceptanceCases, devCases, materialize, type EvaluationCase } from "../../tools/eval-cases";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("机器生成未人工标注的样本不能算验收准备完成", () => {
  const result = checkDataset([], []);
  expect(result.ok).toBe(false);
  expect(result.errors).toContain("need-at-least-40-human-reviewed-cases");
});

test("a single unsigned committed case still fails the review gate", () => {
  const unsigned = {
    ...devCases[0],
    reviewedBy: null,
    reviewedAt: null,
  };
  const result = checkDataset([unsigned, ...devCases.slice(1)], acceptanceCases);
  expect(result.ok).toBe(false);
  expect(result.errors).toEqual(expect.arrayContaining([
    "unreviewed-case",
  ]));
});

test("operator-authorized review of all 42 committed cases clears the unsigned gate", () => {
  const result = checkDataset(devCases, acceptanceCases);
  expect(devCases).toHaveLength(28);
  expect(acceptanceCases).toHaveLength(14);
  expect(result.ok).toBe(true);
  expect(result.errors).toEqual([]);
  expect(devCases.every((item) => item.reviewedBy === "operator-authorized-agent" && item.reviewedAt)).toBe(true);
  expect(acceptanceCases.every((item) => item.reviewedBy === "operator-authorized-agent" && item.reviewedAt)).toBe(true);
});

test("family ids do not leak across splits and each category has 4/2 cases", () => {
  const result = checkDataset(devCases, acceptanceCases);
  expect(result.errors).not.toContain("split-family-leakage");
  expect(result.errors).not.toContain("category-quota");
  expect(result.errors).not.toContain("duplicate-case-id");
  expect(result.errors).not.toContain("invalid-session");
});

test("family leakage, duplicate ids and invalid sessions are reported", () => {
  const leaked: EvaluationCase = { ...acceptanceCases[0], familyId: devCases[0].familyId, id: "leaked" };
  expect(checkDataset(devCases, [leaked, ...acceptanceCases.slice(1)]).errors).toContain("split-family-leakage");
  const dup = [...devCases];
  dup[1] = { ...dup[1], id: dup[0].id };
  expect(checkDataset(dup, acceptanceCases).errors).toContain("duplicate-case-id");
  const broken = { ...devCases[0], input: { ...devCases[0].input, schemaVersion: 2 as 1 } };
  expect(checkDataset([broken, ...devCases.slice(1)], acceptanceCases).errors).toContain("invalid-session");
});

test("programmatic output checks use expected kinds and ban forbidden claims", () => {
  const item = materialize({
    id: "probe", category: "correct", familyId: "probe", split: "dev", step: "explain",
    text: "训练误差低不代表未见数据也好。", expectedKinds: ["supported"],
    requiredConcepts: ["未见"], forbiddenClaims: ["已经掌握"],
  });
  const ok = {
    kind: "supported" as const, claim: "你区分了训练与未见数据", reason: "需要独立检验",
    nextAction: "ask" as const, question: "验证集怎么用？", quotes: [], sources: [], metrics: [],
  };
  expect(checkTutorOutput(item, ok).ok).toBe(true);
  expect(checkTutorOutput(item, { ...ok, kind: "contradiction" }).errors).toContain("unexpected-kind");
  expect(checkTutorOutput(item, { ...ok, reason: "已经掌握" }).errors).toContain("forbidden-claim");
});

test("committed JSON matches in-memory cases and the acceptance freeze hash", () => {
  const committed = loadCommittedCases();
  expect(committed.dev).toEqual(devCases);
  expect(committed.acceptance).toEqual(acceptanceCases);
  const lock = readFileSync(join(import.meta.dirname, "../../eval/acceptance.sha256"), "utf8").trim();
  expect(checkAcceptanceFreeze(committed.acceptance, lock)).toBe(true);
  expect(checkAcceptanceFreeze(committed.acceptance, sha256("tamper"))).toBe(false);
  expect(sha256(canonicalJson(committed.acceptance))).toBe(lock);
});

test("eval:run refuses to call a provider without an explicit grant", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "tools/evaluate.ts", "run"], {
    cwd: join(import.meta.dirname, "../.."),
    env: { ...process.env, EVAL_RUN: "false" },
    encoding: "utf8",
  });
  expect(result.status).toBe(2);
  expect(result.stderr).toMatch(/eval-run-disabled/);
});
