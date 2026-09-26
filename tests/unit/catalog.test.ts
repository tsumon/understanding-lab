import { expect, test } from "vitest";
import rawPack from "../../public/experiments/overfitting.v1.json";
import { loadCase, metricFor, parsePack } from "../../src/experiment/catalog";

const pack = parsePack(rawPack);
const firstConfig = { seed: 17, n: 20, noise: 0, degree: 1 } as const;

test("parses all 324 published cases and finds only exact configurations", () => {
  expect(pack.cases).toHaveLength(324);
  for (const experiment of pack.cases) {
    expect(loadCase(pack, experiment.config)).toEqual(experiment);
  }
  expect(() => loadCase(pack, { ...firstConfig, degree: 13 })).toThrow();
  expect(() => loadCase(pack, { ...firstConfig, seed: 99 as 17 })).toThrow();
  expect(() => loadCase({ ...pack, cases: pack.cases.slice(1) }, firstConfig)).toThrow();
});

test("rejects wrong versions and malformed nested experiment records", () => {
  expect(() => parsePack({ ...rawPack, version: "overfitting.v2" })).toThrow();
  expect(() => parsePack({ ...rawPack, unexpected: true })).toThrow();
  expect(() => parsePack({ ...rawPack, cases: [{ ...rawPack.cases[0], metrics: { ...rawPack.cases[0].metrics, testMse: -1 } }, ...rawPack.cases.slice(1)] })).toThrow();
  expect(() => parsePack({ ...rawPack, cases: [{ ...rawPack.cases[0], datasetKey: "missing" }, ...rawPack.cases.slice(1)] })).toThrow();
  expect(() => parsePack({ ...rawPack, cases: [{ ...rawPack.cases[0], key: rawPack.cases[1].key }, ...rawPack.cases.slice(1)] })).toThrow();
});

test("only reveals final test MSE after the learner freezes a selection", () => {
  const hidden = { id: "s1", packVersion: "overfitting.v1" as const, config: firstConfig,
    prediction: "", testRevealed: false, testContaminated: false };
  expect(metricFor(pack, hidden, "trainMse")).toBe(loadCase(pack, firstConfig).metrics.trainMse);
  expect(metricFor(pack, hidden, "validationMse")).toBe(loadCase(pack, firstConfig).metrics.validationMse);
  expect(() => metricFor(pack, hidden, "testMse")).toThrow();
  expect(metricFor(pack, { ...hidden, testRevealed: true }, "testMse"))
    .toBe(loadCase(pack, firstConfig).metrics.testMse);
  expect(() => metricFor(pack, { ...hidden, packVersion: "other" as "overfitting.v1" }, "trainMse")).toThrow();
});
