// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExperimentLab, isExperimentComplete, type ExperimentEvidence } from '../../src/course/experiments/ExperimentLab';
import type { ExperimentKind } from '../../src/course/types';
import type { Locale } from '../../src/domain/locale';
afterEach(cleanup);
function Harness({ kind = 'data-split', locale = 'zh-CN' }: { kind?: ExperimentKind; locale?: Locale }) {
  const [evidence, setEvidence] = useState<ExperimentEvidence>();
  return <><ExperimentLab kind={kind} locale={locale} value={evidence} onChange={setEvidence} /><output data-testid="completion">{String(isExperimentComplete(evidence))}</output><output data-testid="count">{evidence?.runs.length ?? 0}</output></>;
}
describe('course experiment evidence interaction', () => {
  it('requires explicit runs and deduplicates the same configuration', () => {
    render(<Harness />);
    const run = screen.getByRole('button', { name: '运行实验' });
    fireEvent.click(run); fireEvent.click(run);
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('completion').textContent).toBe('false');
    fireEvent.change(screen.getByLabelText('划分方式'), { target: { value: 'grouped' } });
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('completion').textContent).toBe('false');
    fireEvent.click(run);
    expect(screen.getByTestId('completion').textContent).toBe('true');
  });
  it('does not treat a threshold plateau as a different observed result', () => {
    render(<Harness kind="neural-network" locale="en" />);
    fireEvent.click(screen.getByRole('button', { name: 'Run experiment' }));
    fireEvent.change(screen.getByLabelText(/Decision threshold/), { target: { value: '0.75' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run experiment' }));
    expect(screen.getByTestId('count').textContent).toBe('2');
    expect(screen.getByTestId('completion').textContent).toBe('false');
    fireEvent.change(screen.getByLabelText('Model structure'), { target: { value: 'relu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run experiment' }));
    expect(screen.getByTestId('completion').textContent).toBe('true');
  });
  it('renders every engine with a labeled table and keyboard-operable controls', () => {
    const kinds: ExperimentKind[] = ['data-split', 'regression', 'overfitting', 'gradient-descent', 'classification', 'neural-network', 'embeddings', 'attention', 'generation', 'rag', 'evaluation', 'safety'];
    for (const kind of kinds) {
      const view = render(<Harness kind={kind} />);
      expect(screen.getAllByRole('table').find(table => table.querySelector('caption'))?.querySelector('caption')?.textContent).toContain('确定性结果');
      expect(screen.getAllByTestId('experiment-control').every(input => input.id && document.querySelector(`label[for="${input.id}"]`))).toBe(true);
      view.unmount();
    }
  });
});
