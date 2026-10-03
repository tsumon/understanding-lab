import type { ExperimentConfig } from "../domain/contracts";
import { loadCase, type ExperimentPack } from "../experiment/catalog";
import type { Exploration } from "../experiment/exploration";
import { useLocale } from "./LocaleProvider";

export function ExperimentControls({ config, onChange }: {
  config: ExperimentConfig; onChange: (next: ExperimentConfig) => void;
}) {
  const { copy } = useLocale();
  return <div className="experiment-controls">
    <label>{copy.dataScenario}
      <select aria-label={copy.dataScenario} value={config.seed} onChange={(event) => onChange({ ...config, seed: Number(event.target.value) as ExperimentConfig["seed"] })}>
        {[17, 29, 43].map((seed, index) => <option key={seed} value={seed}>{copy.scenarioOption(index + 1, seed)}</option>)}
      </select>
    </label>
    <label>{copy.sampleSize}
      <select aria-label={copy.sampleSize} value={config.n} onChange={(event) => onChange({ ...config, n: Number(event.target.value) as ExperimentConfig["n"] })}>
        {[20, 40, 80].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
    <label>{copy.noiseStd}
      <select aria-label={copy.noiseStd} value={config.noise} onChange={(event) => onChange({ ...config, noise: Number(event.target.value) as ExperimentConfig["noise"] })}>
        <option value={0}>{copy.noneNoise}</option><option value={0.1}>{copy.lowNoise}</option><option value={0.3}>{copy.highNoise}</option>
      </select>
    </label>
    <label>{copy.polynomialDegree}
      <select aria-label={copy.polynomialDegree} value={config.degree} onChange={(event) => onChange({ ...config, degree: Number(event.target.value) })}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((degree) => <option key={degree} value={degree}>{degree}</option>)}
      </select>
    </label>
  </div>;
}

function NumericChart({ pack, config }: { pack: ExperimentPack; config: ExperimentConfig }) {
  const { copy } = useLocale();
  const experiment = loadCase(pack, config);
  const dataset = pack.datasets[experiment.datasetKey];
  const train = dataset.train.x.slice(0, config.n).map((x, index) => [x, dataset.train.y[index]] as const);
  const validation = dataset.validation.x.map((x, index) => [x, dataset.validation.y[index]] as const);
  const allY = [...experiment.curve.map((point) => point[1]), ...train.map((point) => point[1]), ...validation.map((point) => point[1])];
  const minimum = Math.min(...allY);
  const maximum = Math.max(...allY);
  const padding = Math.max((maximum - minimum) * 0.08, 0.1);
  const low = minimum - padding;
  const high = maximum + padding;
  const xScale = (x: number) => 46 + x * 610;
  const yScale = (y: number) => 272 - ((y - low) / (high - low)) * 236;
  const curve = experiment.curve.map(([x, y]) => `${xScale(x)},${yScale(y)}`).join(" ");
  return <div className="chart-wrap">
    <svg viewBox="0 0 680 310" role="img" aria-label={copy.chartDescription(config.n, low.toFixed(2), high.toFixed(2))}>
      <line x1="46" y1="272" x2="656" y2="272" className="axis" />
      <line x1="46" y1="36" x2="46" y2="272" className="axis" />
      <text x="2" y="40">{high.toFixed(1)}</text><text x="2" y="272">{low.toFixed(1)}</text>
      <text x="44" y="298">0</text><text x="650" y="298">1</text>
      <polyline points={curve} fill="none" className="fit-curve" />
      {validation.map(([x, y], index) => <circle key={`v${index}`} cx={xScale(x)} cy={yScale(y)} r="2.4" className="validation-point" />)}
      {train.map(([x, y], index) => <circle key={`t${index}`} cx={xScale(x)} cy={yScale(y)} r="3.2" className="train-point" />)}
    </svg>
    <p className="chart-legend"><span className="line-key">{copy.fitCurve}</span><span className="dot-key">{copy.trainPoints}</span><span className="ring-key">{copy.validationPoints}</span></p>
    <p>{copy.chartRange(low.toFixed(2), high.toFixed(2))}</p>
    {high - low > 20 && <p className="warning">{copy.scaleWarning}</p>}
    <table><caption>{copy.mseCaption}</caption><thead><tr><th scope="col">{copy.data}</th><th scope="col">MSE</th></tr></thead><tbody>
      <tr><th scope="row">{copy.train}</th><td>{experiment.metrics.trainMse.toFixed(4)}</td></tr>
      <tr><th scope="row">{copy.validation}</th><td>{experiment.metrics.validationMse.toFixed(4)}</td></tr>
    </tbody></table>
  </div>;
}

export function ExperimentPanel({ exploration, pack, loadError, onChange, onFreeze, onReveal, onRecord }: {
  exploration: Exploration; pack: ExperimentPack | null; loadError: string | null;
  onChange: (config: ExperimentConfig) => void; onFreeze: () => void; onReveal: () => void; onRecord: () => void;
}) {
  const { copy } = useLocale();
  const currentCase = pack ? loadCase(pack, exploration.config) : null;
  return <section className="card" aria-labelledby="experiment-title">
    <h2 id="experiment-title">{copy.experimentTitle}</h2>
    <p>{copy.experimentIntro}</p>
    <ExperimentControls config={exploration.config} onChange={onChange} />
    {loadError && <p role="alert">{copy.packError(loadError === "unknown" ? copy.unknownError : loadError)}</p>}
    {!pack && !loadError && <p>{copy.packLoading}</p>}
    {pack && <NumericChart pack={pack} config={exploration.config} />}
    <div className="actions">
      <button type="button" onClick={onFreeze}>{copy.freeze}</button>
      <button type="button" onClick={onReveal} disabled={!exploration.frozen || !pack}>{copy.reveal}</button>
      <button type="button" onClick={onRecord} disabled={!pack}>{copy.record}</button>
    </div>
    {exploration.frozen && <p>{copy.frozen(exploration.frozen.seed, exploration.frozen.n, exploration.frozen.noise, exploration.frozen.degree)}</p>}
    {exploration.revealed && currentCase
      ? <p>{copy.testResult(currentCase.metrics.testMse.toFixed(4))}</p>
      : <p>{copy.testHidden}</p>}
    {exploration.contaminated && <p className="warning">{copy.contaminated}</p>}
  </section>;
}
