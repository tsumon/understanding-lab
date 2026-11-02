import type { ExperimentKind } from '../types';
import type { Result } from './engines';
type Point = [number, number];
type Trace = { name: string; color: string; points: Point[]; dots?: boolean };
const colors = ['#1a5368', '#8a3a24', '#215c40'];
/** Charts supplement (never replace) the exact data table. SVG has a text alternative. */
export function ExperimentChart({ kind, result, english }: { kind: ExperimentKind; result: Result; english: boolean }) {
  const tr = (zh: string, en: string) => english ? en : zh;
  let traces: Trace[] = [];
  let title = ''; let xLabel = ''; let yLabel = '';
  if (kind === 'regression' || kind === 'overfitting') {
    title = tr('观测点与拟合曲线', 'Observations and fitted curve'); xLabel = 'x'; yLabel = 'y';
    traces.push({ name: tr('训练观测', 'Training observations'), color: colors[1], dots: true, points: result.rows.map(row => [Number(row[0]), Number(row[1])]) });
    traces.push({ name: tr('模型预测', 'Model prediction'), color: colors[0], points: kind === 'regression' ? result.rows.map(row => [Number(row[0]), Number(row[2])]) : (result.series ?? []).map((y, i, values) => [-1 + 2 * (i + .5) / values.length, y]) });
    if (kind === 'overfitting') traces.push({ name: 'sin(πx)', color: colors[2], points: Array.from({ length: 81 }, (_, i) => { const x = -1 + i / 40; return [x, Math.sin(Math.PI * x)]; }) });
  } else if (kind === 'gradient-descent') {
    title = tr('更新过程：压缩纵轴显示发散', 'Updates: compressed vertical axis reveals divergence');
    xLabel = tr('更新次数', 'Updates'); yLabel = 'log₁₀(1 + loss)';
    traces = [{ name: yLabel, color: colors[0], points: result.rows.map(row => [Number(row[0]), Math.log10(1 + Number(row[2]))]) }];
  } else if (kind === 'attention' || kind === 'generation' || kind === 'evaluation') {
    const evaluation = kind === 'evaluation';
    title = evaluation ? tr('各组准确率（不随组占比改变）', 'Group accuracies (unchanged by mixture weight)') : kind === 'attention' ? tr('注意力权重分布', 'Attention weight distribution') : tr('候选采样概率', 'Candidate sampling probabilities');
    return <figure className="experiment-chart"><figcaption>{title}</figcaption><div className="experiment-bars" role="img" aria-label={`${title}. ${result.rows.map(row => `${row[0]}: ${row[2]}`).join('; ')}`}>
      {result.rows.map((row, i) => <div className="experiment-bar-row" key={i}><span>{String(row[0])}</span><div className="experiment-bar-track"><div style={{ width: `${100 * Number(row[2])}%` }} /></div><strong>{Number(row[2]).toFixed(3)}</strong></div>)}
    </div><p>{tr('横轴范围固定为 0–1；精确数据见下表。', 'Horizontal scale is fixed at 0–1; exact data is in the table below.')}</p></figure>;
  } else if (kind === 'classification') {
    const counts = [0, 0, 0, 0];
    result.rows.forEach(row => counts[Number(row[1]) * 2 + Number(row[2])]++);
    const labels = ['TN', 'FP', 'FN', 'TP'];
    return <figure className="experiment-chart"><figcaption>{tr('混淆矩阵：行是真实标签，列是预测', 'Confusion matrix: rows are labels, columns are predictions')}</figcaption><table className="experiment-confusion"><thead><tr><th scope="col">{tr('真实 ↓ / 预测 →', 'Label ↓ / Predicted →')}</th><th scope="col">0</th><th scope="col">1</th></tr></thead><tbody>{[0, 1].map(row => <tr key={row}><th scope="row">{row}</th>{[0, 1].map(col => <td key={col} className={row === col ? 'correct' : 'error'}><span>{labels[row * 2 + col]}</span><strong>{counts[row * 2 + col]}</strong></td>)}</tr>)}</tbody></table></figure>;
  } else if (kind === 'embeddings') {
    title = tr('手工向量的二维投影（省略第 2 维）', '2D projection of hand-designed vectors (dimension 2 omitted)'); xLabel = tr('第 1 维', 'Dimension 1'); yLabel = tr('第 3 维', 'Dimension 3');
    const q = String(result.metrics[0].value).split(',').map(Number);
    traces = [{ name: 'cat / dog / car / bus', color: colors[0], dots: true, points: [[1, 0], [.9, 0], [0, 1], [0, .9]] }, { name: tr('查询向量', 'Query vector'), color: colors[1], points: [[0, 0], [q[0], q[2]]] }];
  }
  if (!traces.length) return null;
  const points = traces.flatMap(trace => trace.points);
  let minX = Math.min(...points.map(p => p[0])), maxX = Math.max(...points.map(p => p[0]));
  let minY = Math.min(0, ...points.map(p => p[1])), maxY = Math.max(0, ...points.map(p => p[1]));
  if (minX === maxX) { minX -= 1; maxX += 1; }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const px = (x: number) => 60 + 470 * (x - minX) / (maxX - minX);
  const py = (y: number) => 205 - 165 * (y - minY) / (maxY - minY);
  const tick = (n: number) => Math.abs(n) >= 1000 ? n.toExponential(1) : Number(n.toFixed(2)).toString();
  return <figure className="experiment-chart"><figcaption>{title}</figcaption><svg viewBox="0 0 560 255" role="img" aria-label={`${title}; ${xLabel}; ${yLabel}. ${tr('精确数据见下方表格。', 'Exact data is in the table below.')}`}>
    <path d="M60 30 V205 H535" fill="none" stroke="#5a6a73" />
    {[0, .5, 1].map(f => <g key={f}><text x="53" y={205 - f * 165} textAnchor="end">{tick(minY + f * (maxY - minY))}</text><line x1="60" x2="535" y1={205 - f * 165} y2={205 - f * 165} stroke="#d4d0c8" /><text x={60 + f * 470} y="224" textAnchor="middle">{tick(minX + f * (maxX - minX))}</text></g>)}
    <text x="60" y="19">{yLabel}</text><text x="300" y="248" textAnchor="middle">{xLabel}</text>
    {traces.map(trace => <g key={trace.name}>{!trace.dots && <polyline points={trace.points.map(([x, y]) => `${px(x)},${py(y)}`).join(' ')} fill="none" stroke={trace.color} strokeWidth="2.5" />}{trace.dots && trace.points.map(([x, y], i) => <circle key={i} cx={px(x)} cy={py(y)} r="4" fill={trace.color} />)}</g>)}
  </svg><ul className="experiment-chart-legend">{traces.map(trace => <li key={trace.name}><span style={{ background: trace.color }} aria-hidden="true" />{trace.name}</li>)}</ul><p>{tr('坐标范围自动适配；不要跨配置仅凭视觉斜率比较。精确值见下表。', 'Axes auto-scale: do not compare visual slopes alone across configurations. Exact values are in the table below.')}</p></figure>;
}
