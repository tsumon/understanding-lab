import { expect, test } from "vitest";
import { transitionExperiment } from "../../src/experiment/exploration";
import type { ExperimentConfig } from "../../src/domain/contracts";

const config: ExperimentConfig = { seed: 17, n: 20, noise: 0.1, degree: 2 };
const initial = () => ({ config: { ...config }, frozen: null, revealed: false, contaminated: false });

test("requires freezing the current selection before revealing its test result", () => {
  expect(() => transitionExperiment(initial(), { type: "reveal" })).toThrow("freeze-required");
  const frozen = transitionExperiment(initial(), { type: "freeze" });
  expect(transitionExperiment(frozen, { type: "reveal" }).revealed).toBe(true);
});

test("changed parameters hide the new test result and preserve exposure history", () => {
  const shown = transitionExperiment(transitionExperiment(initial(), { type: "freeze" }), { type: "reveal" });
  const changed = transitionExperiment(shown, { type: "set", config: { ...config, degree: 3 } });
  expect(changed).toEqual({ config: { ...config, degree: 3 }, frozen: null, revealed: false, contaminated: true });
  expect(() => transitionExperiment(changed, { type: "reveal" })).toThrow("freeze-required");
  const reset = transitionExperiment(changed, { type: "set", config });
  expect(reset.contaminated).toBe(true);
  expect(transitionExperiment(transitionExperiment(reset, { type: "freeze" }), { type: "reveal" }).revealed).toBe(true);
});

test("unexposed parameter changes remain blind and identical selection keeps the frozen result", () => {
  const frozen = transitionExperiment(initial(), { type: "freeze" });
  expect(transitionExperiment(frozen, { type: "set", config: { ...config } })).toEqual(frozen);
  const changed = transitionExperiment(frozen, { type: "set", config: { ...config, n: 40 } });
  expect(changed.frozen).toBeNull();
  expect(changed.contaminated).toBe(false);
});

test("rejects unsupported parameters without modifying the prior selection", () => {
  const state = initial();
  expect(() => transitionExperiment(state, { type: "set", config: { ...config, degree: 13 } })).toThrow();
  expect(state).toEqual(initial());
});

test("copies user config so later caller edits cannot change a frozen selection", () => {
  const input = { ...config, degree: 3 };
  const selected = transitionExperiment(initial(), { type: "set", config: input });
  const frozen = transitionExperiment(selected, { type: "freeze" });
  input.degree = 4;
  expect(selected.config.degree).toBe(3);
  expect(frozen.frozen?.degree).toBe(3);
  expect(frozen.frozen).not.toBe(frozen.config);
});
