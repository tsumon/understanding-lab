import { ExperimentConfigSchema, type ExperimentConfig } from "../domain/contracts";

export type Exploration = {
  config: ExperimentConfig;
  frozen: ExperimentConfig | null;
  revealed: boolean;
  contaminated: boolean;
};

export type ExperimentEvent =
  | { type: "set"; config: ExperimentConfig }
  | { type: "freeze" }
  | { type: "reveal" };

export function transitionExperiment(state: Exploration, event: ExperimentEvent): Exploration {
  switch (event.type) {
    case "freeze":
      return { ...state, frozen: ExperimentConfigSchema.parse(state.config) };
    case "reveal":
      if (!state.frozen) throw new Error("freeze-required");
      return { ...state, revealed: true };
    case "set": {
      const config = ExperimentConfigSchema.parse(event.config);
      if (config.seed === state.config.seed && config.n === state.config.n
        && config.noise === state.config.noise && config.degree === state.config.degree) return state;
      return { config, frozen: null, revealed: false, contaminated: state.contaminated || state.revealed };
    }
  }
}
