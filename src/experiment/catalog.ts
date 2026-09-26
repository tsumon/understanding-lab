import { z } from "zod";
import { ExperimentConfigSchema, type ExperimentConfig, type Snapshot } from "../domain/contracts";

const finite = z.number().finite();
const sampleSchema = (size: number) => z.strictObject({
  ids: z.array(z.string()).length(size),
  x: z.array(finite.min(0).max(1)).length(size),
  y: z.array(finite).length(size),
});
const datasetSchema = z.strictObject({
  train: sampleSchema(80),
  validation: sampleSchema(200),
  test: sampleSchema(200),
});
const metricsSchema = z.strictObject({
  trainMse: finite.nonnegative(),
  validationMse: finite.nonnegative(),
  testMse: finite.nonnegative(),
});
const caseSchema = z.strictObject({
  key: z.string(),
  config: ExperimentConfigSchema,
  datasetKey: z.string(),
  curve: z.array(z.tuple([finite.min(0).max(1), finite])).length(201),
  metrics: metricsSchema,
});
const packSchema = z.strictObject({
  version: z.literal("overfitting.v1"),
  generator: z.strictObject({
    numpy: z.string().min(1),
    seeds: z.tuple([z.literal(17), z.literal(29), z.literal(43)]),
  }),
  tolerances: z.strictObject({
    relative: finite.positive(),
    absolute: finite.positive(),
  }),
  datasets: z.record(z.string(), datasetSchema),
  cases: z.array(caseSchema).length(324),
});

export type ExperimentPack = z.infer<typeof packSchema>;
export type ExperimentCase = z.infer<typeof caseSchema>;
export type MetricName = keyof ExperimentCase["metrics"];

function caseKey(config: ExperimentConfig): string {
  return `${config.seed}:${config.n}:${config.noise}:${config.degree}`;
}

export function parsePack(value: unknown): ExperimentPack {
  const pack = packSchema.parse(value);
  const expectedKeys = new Set<string>();
  for (const seed of [17, 29, 43] as const) {
    for (const noise of [0, 0.1, 0.3] as const) {
      const datasetKey = `${seed}:${noise}`;
      if (!pack.datasets[datasetKey]) throw new Error(`Missing dataset: ${datasetKey}`);
      for (const n of [20, 40, 80] as const) {
        for (let degree = 1; degree <= 12; degree++) {
          expectedKeys.add(caseKey({ seed, n, noise, degree }));
        }
      }
    }
  }
  if (Object.keys(pack.datasets).length !== 9) throw new Error("Unexpected dataset count");
  for (const experiment of pack.cases) {
    const key = caseKey(experiment.config);
    const datasetKey = `${experiment.config.seed}:${experiment.config.noise}`;
    if (experiment.key !== key || experiment.datasetKey !== datasetKey || !pack.datasets[datasetKey]) {
      throw new Error(`Inconsistent experiment: ${experiment.key}`);
    }
    if (!expectedKeys.delete(key)) throw new Error(`Duplicate experiment: ${key}`);
  }
  if (expectedKeys.size) throw new Error("Incomplete experiment catalog");
  return pack;
}

export function loadCase(pack: ExperimentPack, config: ExperimentConfig): ExperimentCase {
  if (pack.version !== "overfitting.v1") throw new Error("Wrong experiment version");
  const validConfig = ExperimentConfigSchema.parse(config);
  const found = pack.cases.find((experiment) => experiment.key === caseKey(validConfig));
  if (!found) throw new Error(`Unknown experiment: ${caseKey(validConfig)}`);
  return found;
}

export function metricFor(pack: ExperimentPack, snapshot: Snapshot, name: MetricName): number {
  if (snapshot.packVersion !== pack.version) throw new Error("Snapshot version mismatch");
  if (name === "testMse" && !snapshot.testRevealed) throw new Error("Test MSE is still hidden");
  const metric = loadCase(pack, snapshot.config).metrics[name];
  if (metric === undefined) throw new Error(`Unknown metric: ${name}`);
  return metric;
}
