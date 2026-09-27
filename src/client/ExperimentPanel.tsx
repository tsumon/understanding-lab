import type { ExperimentConfig } from "../domain/contracts";
import { loadCase, type ExperimentPack } from "../experiment/catalog";
import type { Exploration } from "../experiment/exploration";

export function ExperimentControls({ config, onChange }: {
  config: ExperimentConfig; onChange: (next: ExperimentConfig) => void;
}) {
  return <div className="experiment-controls">
    <label>数据情境
      <select aria-label="数据情境" value={config.seed} onChange={(event) => onChange({ ...config, seed: Number(event.target.value) as ExperimentConfig["seed"] })}>
        {[17, 29, 43].map((seed, index) => <option key={seed} value={seed}>情境 {index + 1}（种子 {seed}）</option>)}
      </select>
    </label>
    <label>样本量
      <select aria-label="样本量" value={config.n} onChange={(event) => onChange({ ...config, n: Number(event.target.value) as ExperimentConfig["n"] })}>
        {[20, 40, 80].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
    <label>噪声标准差
      <select aria-label="噪声标准差" value={config.noise} onChange={(event) => onChange({ ...config, noise: Number(event.target.value) as ExperimentConfig["noise"] })}>
        <option value={0}>无（0）</option><option value={0.1}>低（0.1）</option><option value={0.3}>高（0.3）</option>
      </select>
    </label>
    <label>多项式阶数
      <select aria-label="多项式阶数" value={config.degree} onChange={(event) => onChange({ ...config, degree: Number(event.target.value) })}>
        {Array.from({ length: 12 }, (_, index) => index + 1).map((degree) => <option key={degree} value={degree}>{degree}</option>)}
      </select>
    </label>
  </div>;
}

function NumericChart({ pack, config }: { pack: ExperimentPack; config: ExperimentConfig }) {
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
    <svg viewBox="0 0 680 310" role="img" aria-label={`数值图：训练样本 ${config.n} 个，验证样本 200 个，曲线纵轴 ${low.toFixed(2)} 至 ${high.toFixed(2)}`}>
      <line x1="46" y1="272" x2="656" y2="272" className="axis" />
      <line x1="46" y1="36" x2="46" y2="272" className="axis" />
      <text x="2" y="40">{high.toFixed(1)}</text><text x="2" y="272">{low.toFixed(1)}</text>
      <text x="44" y="298">0</text><text x="650" y="298">1</text>
      <polyline points={curve} fill="none" className="fit-curve" />
      {validation.map(([x, y], index) => <circle key={`v${index}`} cx={xScale(x)} cy={yScale(y)} r="2.4" className="validation-point" />)}
      {train.map(([x, y], index) => <circle key={`t${index}`} cx={xScale(x)} cy={yScale(y)} r="3.2" className="train-point" />)}
    </svg>
    <p className="chart-legend"><span className="line-key">拟合曲线</span><span className="dot-key">训练点 ●</span><span className="ring-key">验证点 ○</span></p>
    <p>纵轴实际范围：{low.toFixed(2)} 至 {high.toFixed(2)}；横轴 0 至 1。</p>
    {high - low > 20 && <p className="warning">尺度提示：这条曲线有极端值，纵轴已扩大以完整显示，点可能显得集中。</p>}
    <table><caption>当前选择的均方误差（MSE）</caption><thead><tr><th scope="col">数据</th><th scope="col">MSE</th></tr></thead><tbody>
      <tr><th scope="row">训练</th><td>{experiment.metrics.trainMse.toFixed(4)}</td></tr>
      <tr><th scope="row">验证</th><td>{experiment.metrics.validationMse.toFixed(4)}</td></tr>
    </tbody></table>
  </div>;
}

export function ExperimentPanel({ exploration, pack, loadError, onChange, onFreeze, onReveal, onRecord }: {
  exploration: Exploration; pack: ExperimentPack | null; loadError: string | null;
  onChange: (config: ExperimentConfig) => void; onFreeze: () => void; onReveal: () => void; onRecord: () => void;
}) {
  const currentCase = pack ? loadCase(pack, exploration.config) : null;
  return <section className="card" aria-labelledby="experiment-title">
    <h2 id="experiment-title">预先计算的交互实验</h2>
    <p>三组固定种子的合成样本。调整参数会读取已计算的数值；这里没有实时训练，也不会发送给 AI。</p>
    <ExperimentControls config={exploration.config} onChange={onChange} />
    {loadError && <p role="alert">实验数据读取失败：{loadError}</p>}
    {!pack && !loadError && <p>正在读取实验数据…</p>}
    {pack && <NumericChart pack={pack} config={exploration.config} />}
    <div className="actions">
      <button type="button" onClick={onFreeze}>冻结当前选择</button>
      <button type="button" onClick={onReveal} disabled={!exploration.frozen || !pack}>揭示最终测试结果</button>
      <button type="button" onClick={onRecord} disabled={!pack}>记录实验观察</button>
    </div>
    {exploration.frozen && <p>已冻结：情境 {exploration.frozen.seed}，样本 {exploration.frozen.n}，噪声 {exploration.frozen.noise}，阶数 {exploration.frozen.degree}。</p>}
    {exploration.revealed && currentCase
      ? <p>测试 MSE：{currentCase.metrics.testMse.toFixed(4)}。这是冻结选择后的最终测试结果。</p>
      : <p>测试结果尚未揭示。改变参数后需要重新冻结才能揭示新选择。</p>}
    {exploration.contaminated && <p className="warning">测试信息已影响后续选择；新的测试数值不再是独立证据。</p>}
  </section>;
}
