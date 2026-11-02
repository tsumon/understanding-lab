import { useId } from 'react';
import type { Locale } from '../../domain/locale';
import type { ExperimentKind } from '../types';
import { controls, normalizeConfig, runExperiment, type Config } from './engines';
import './experiments.css';
import { ExperimentChart } from './ExperimentChart';

export interface ExperimentEvidence {
  config: Config;
  runs: { signature: string; summary: string }[];
}
export function isExperimentComplete(value: ExperimentEvidence | undefined): boolean {
  const runs = (value?.runs ?? []).filter(run => typeof run.signature === 'string' && run.signature.length > 0 && typeof run.summary === 'string' && run.summary.length > 0);
  return new Set(runs.map(run => run.signature)).size >= 2 && new Set(runs.map(run => run.summary)).size >= 2;
}
export function configSignature(kind: ExperimentKind, config: Config): string {
  return JSON.stringify([kind, Object.entries(normalizeConfig(kind, config)).sort(([a], [b]) => a.localeCompare(b))]);
}
const format = (value: number | string): string => typeof value === 'string' ? value : Math.abs(value) >= 1e6 ? value.toExponential(3) : String(value);
export function ExperimentLab({ kind, locale, value, onChange }: {
  kind: ExperimentKind; locale: Locale; value: ExperimentEvidence | undefined; onChange: (evidence: ExperimentEvidence) => void;
}) {
  const id = useId();
  const lang = locale === 'en' ? 'en' : 'zh';
  const tr = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const config = normalizeConfig(kind, value?.config);
  const runs = value?.runs ?? [];
  const result = runExperiment(kind, config);
  const signature = configSignature(kind, config);
  const recorded = runs.some(run => run.signature === signature);
  function change(key: string, next: string | number) {
    onChange({ config: normalizeConfig(kind, { ...config, [key]: next }), runs });
  }
  function run() {
    // Locale-independent evidence: switching language cannot fabricate a different result.
    const summary = result.metrics.map(metric => `${metric.label.zh} / ${metric.label.en}: ${format(metric.value)}`).join('; ') + '\n数据 / Data: ' + JSON.stringify(result.rows);
    onChange({ config, runs: [...runs.filter(previous => previous.signature !== signature), { signature, summary }].slice(-10) });
  }
  return <section className="course-experiment" aria-label={tr('交互实验', 'Interactive experiment')}>
    <p className="experiment-disclaimer">{tr('可复现的合成教学实验 · 不调用真实 AI 模型', 'Reproducible synthetic teaching experiment · No real AI model calls')}</p>
    <div className="experiment-controls">
      {controls[kind].map(control => <div className="experiment-control" key={control.key}>
        <label htmlFor={`${id}-${control.key}`}>{control.label[lang]}{!control.options && <strong> {format(config[control.key])}</strong>}</label>
        {control.options ? <select id={`${id}-${control.key}`} data-testid="experiment-control" value={config[control.key]} onChange={event => change(control.key, event.target.value)}>
          {control.options.map(option => <option key={option.value} value={option.value}>{option.label[lang]}</option>)}
        </select> : <input id={`${id}-${control.key}`} data-testid="experiment-control" type="range" min={control.min} max={control.max} step={control.step} value={config[control.key]} onChange={event => change(control.key, Number(event.target.value))} />}
      </div>)}
    </div>
    <div className="experiment-metrics" aria-label={tr('当前配置的计算结果', 'Computed results for current configuration')}>
      {result.metrics.map(metric => <div key={metric.label.en}><span>{metric.label[lang]}</span><strong>{format(metric.value)}</strong></div>)}
    </div>
    <ExperimentChart kind={kind} result={result} english={lang === 'en'} />
    <div className="experiment-table-wrap" role="region" aria-label={tr('实验数据表（可横向滚动）', 'Experiment data table (scroll horizontally)')} tabIndex={0}>
      <table><caption>{tr('逐项查看：当前配置的确定性结果', 'Inspect each item: deterministic results for current configuration')}</caption>
        <thead><tr>{result.columns.map(column => <th scope="col" key={column.en}>{column[lang]}</th>)}</tr></thead>
        <tbody>{result.rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column}>{format(cell)}</td>)}</tr>)}</tbody>
      </table>
    </div>
    <p className="experiment-note">{result.note[lang]}</p>
    <button type="button" data-testid="run-experiment" onClick={run}>{tr('运行实验', 'Run experiment')}</button>
    <p role="status">{isExperimentComplete(value) ? tr('已记录至少两种配置及不同结果，可以比较。', 'At least two configurations with different results recorded; compare them.') : tr('请运行并记录两种产生不同结果的配置；只调整控件或得到相同结果不会完成实验。', 'Run and record two configurations with different results; changing controls alone or obtaining identical results does not complete the experiment.')} {recorded && tr('当前配置已记录。', 'Current configuration recorded.')}</p>
    {runs.length > 0 && <details className="experiment-history"><summary>{tr(`实验记录（${runs.length} / 10）`, `Recorded runs (${runs.length} / 10)`)}</summary><ol>{runs.map(run => <li key={run.signature}><p>{run.summary}</p><code>{run.signature}</code></li>)}</ol></details>}
  </section>;
}
