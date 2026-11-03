import { describe, expect, it } from 'vitest';
import { controls, defaults, normalizeConfig, runExperiment, softmax, cosine, confusion } from '../../src/course/experiments/engines';
import { configSignature, isExperimentComplete } from '../../src/course/experiments/ExperimentLab';
import type { ExperimentKind } from '../../src/course/types';
const run = (kind: ExperimentKind, config = {}) => runExperiment(kind, config);
describe('deterministic course experiments', () => {
  for (const kind of Object.keys(defaults) as ExperimentKind[]) {
    it(`${kind} is reproducible, finite and supports a meaningful alternate configuration`, () => {
      expect(run(kind)).toEqual(run(kind));
      const result = run(kind);
      expect(result.rows.length).toBeGreaterThan(0);
      expect(result.note.en.length).toBeGreaterThan(20);
      const first = controls[kind][0];
      const alternate = first.options ? first.options[1].value : first.max!;
      expect(run(kind, { [first.key]: alternate })).not.toEqual(result);
      const values = [...result.rows.flat(), ...result.metrics.map(m => m.value)];
      expect(values.filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true);
      for (const control of controls[kind]) {
        if (!control.options) for (const boundary of [control.min!, control.max!]) {
          const edge = run(kind, { [control.key]: boundary });
          expect([...edge.rows.flat(), ...edge.metrics.map(m => m.value)].filter(v => typeof v === 'number').every(Number.isFinite)).toBe(true);
        }
      }
    });
  }
  it('isolates identity leakage from held-out people', () => {
    expect(run('data-split').metrics[0].value).toBe(1);
    expect(run('data-split', { strategy: 'grouped' }).metrics[0].value).toBe(.5);
    expect(run('data-split', { strategy: 'grouped' }).metrics[1].value).toBe(0);
    for (const train of [.25, .5, .75]) expect(run('data-split', { train }).rows.length).toBe(24 * (1 - train));
  });
  it('calculates regression squared residuals and outlier influence', () => {
    expect(run('regression', { slope: 2, intercept: 1 }).metrics[0].value).toBeCloseTo((.04 + .04 + .01 + .01 + .04) / 5, 8);
    expect(Number(run('regression', { slope: 2, intercept: 1, outlier: 'on' }).metrics[0].value)).toBeGreaterThan(4);
  });
  it('fits high-degree training data but exposes held-out error', () => {
    const low = run('overfitting', { degree: 3 }); const high = run('overfitting', { degree: 9 });
    expect(Number(high.metrics[0].value)).toBeLessThan(Number(low.metrics[0].value));
    expect(Number(high.metrics[1].value)).toBeGreaterThan(Number(low.metrics[1].value));
  });
  it('demonstrates convergence, oscillation boundary and divergence', () => {
    expect(Number(run('gradient-descent').metrics[0].value)).toBeLessThan(9);
    expect(run('gradient-descent', { rate: 1 }).metrics[0].value).toBe(9);
    expect(Number(run('gradient-descent', { rate: 1.1 }).metrics[0].value)).toBeGreaterThan(9);
    expect(run('gradient-descent', { scale: 5 }).metrics[1].value).toBe(.04);
  });
  it('counts threshold ties as positive and handles empty denominators', () => {
    expect(confusion([.5], [1], .5)).toMatchObject({ tp: 1, recall: 1 });
    expect(confusion([], [], 1)).toEqual({ tp: 0, fp: 0, tn: 0, fn: 0, precision: null, recall: null });
    expect(run('classification', { threshold: 1 }).metrics[1].value).toBe('未定义 / undefined');
    expect(run('classification').metrics[0].value).toBe('3 / 2 / 3 / 2');
  });
  it('a fixed nonlinear network expresses XOR', () => {
    expect(run('neural-network').metrics[0].value).toBe(3);
    expect(run('neural-network', { model: 'relu' }).metrics[0].value).toBe(4);
  });
  it('cosine is invariant to positive scale, including defined zero behavior', () => {
    expect(cosine([0, 0], [1, 0])).toBe(0); expect(cosine([], [])).toBe(0);
    expect(cosine([1], [1, 2])).toBe(0);
    const a = run('embeddings').rows; const b = run('embeddings', { magnitude: 2 }).rows;
    expect(a.map(r => r[1])).toEqual(b.map(r => r[1]));
    expect(Number(b[0][2])).toBeCloseTo(2 * Number(a[0][2]));
  });
  it('normalizes stable softmax, masks future tokens and raises entropy with temperature', () => {
    expect(softmax([], 0)).toEqual([]);
    expect(softmax([1000, 1000], 0)).toEqual([.5, .5]);
    expect(softmax([1, 2], Number.NaN).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(run('attention', { mask: 'on' }).rows.slice(2).map(r => r[2])).toEqual([0, 0]);
    expect(Number(run('generation', { temperature: 2 }).metrics[1].value)).toBeGreaterThan(Number(run('generation', { temperature: .1 }).metrics[1].value));
    expect(run('generation', { topk: 1 }).rows.map(r => r[2])).toEqual([1, 0, 0, 0]);
  });
  it('retrieves attributable evidence and abstains on missing evidence', () => {
    expect(run('rag').metrics[0].value).toBe('09:00–18:00 [D1]');
    expect(run('rag', { query: 'returns' }).metrics[0].value).toContain('[D2]');
    expect(run('rag', { query: 'weather' }).metrics[0].value).toBe('—');
    expect(run('rag', { query: 'weather' }).metrics[1].value).toBe(0);
  });
  it('reveals a model ranking reversal under distribution shift', () => {
    expect(run('evaluation', { hard: 0 }).metrics[0].value).toBe(.95);
    expect(run('evaluation', { hard: 1 }).metrics[0].value).toBe(.45);
    expect(run('evaluation', { model: 'balanced', hard: 1 }).metrics[0].value).toBe(.8);
  });
  it('accounts for errors and review costs without treating confidence as correctness', () => {
    expect(run('safety').metrics.map(m => m.value)).toEqual([.6, 2, 4, 24]);
    expect(run('safety', { threshold: 1 }).metrics.map(m => m.value)).toEqual([0, 0, 10, 10]);
  });
  it('sanitizes configuration, canonicalizes equivalent configs and requires two recorded distinct runs', () => {
    expect(normalizeConfig('regression', { slope: Infinity, intercept: 100, outlier: 'evil' })).toEqual({ slope: 0, intercept: 4, outlier: 'off' });
    expect(configSignature('regression', { slope: 0 })).toBe(configSignature('regression', { ignored: 99 }));
    expect(isExperimentComplete(undefined)).toBe(false);
    const a = { signature: 'a', summary: 'result' }; const b = { signature: 'b', summary: 'different result' };
    expect(isExperimentComplete({ config: {}, runs: [a, a] })).toBe(false);
    expect(isExperimentComplete({ config: {}, runs: [a, { signature: 'b', summary: 'result' }] })).toBe(false);
    expect(isExperimentComplete({ config: {}, runs: [a, b] })).toBe(true);
  });
});
