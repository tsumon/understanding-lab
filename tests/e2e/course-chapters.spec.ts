import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { chapters } from '../../src/course/curriculum';
import { controls, defaults, normalizeConfig, runExperiment } from '../../src/course/experiments/engines';
import { completionRequirements, emptyProgress } from '../../src/course/progress';

for (const chapter of chapters) {
  test(`${chapter.id} completes a synthetic practice journey and restores its bilingual record`, async ({ page, isMobile }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`/#course/${chapter.id}`);
    await expect(page.getByRole('heading', { name: chapter.content['zh-CN'].title, exact: true })).toBeVisible();
    await expect(page.getByTestId('complete-chapter')).toBeDisabled();
    const prediction = chapter.content['zh-CN'].prediction;
    await page.locator(`input[name="${chapter.id}-${prediction.id}"][value="${prediction.options[0].id}"]`).check();
    await page.getByTestId('run-experiment').click();
    await expect(page.getByText('实验记录（1 / 10）', { exact: true })).toBeVisible();
    const control = controls[chapter.experimentKind][0];
    const input = page.getByTestId('experiment-control').first();
    if (control.options) {
      const current = await input.inputValue();
      await input.selectOption(control.options.find(option => option.value !== current)!.value);
    } else {
      await input.focus();
      await input.press('Home');
      await input.press('ArrowRight');
    }
    await page.getByTestId('run-experiment').click();
    await expect(page.getByText('实验记录（2 / 10）', { exact: true })).toBeVisible();
    await page.locator('#course-transfer').fill(`Synthetic functional-test response for ${chapter.id}: compare evidence and explain the limits of this example.`);
    for (const question of chapter.content['zh-CN'].quiz) {
      await page.locator(`input[name="${chapter.id}-${question.id}"][value="${question.correctId}"]`).check();
    }
    await page.locator('#course-reflection').fill(`Synthetic reflection for ${chapter.id}: this checks persistence and workflow, not a learner's conceptual mastery.`);
    await expect(page.getByTestId('complete-chapter')).toBeEnabled();
    await page.getByTestId('complete-chapter').click();
    await expect(page.getByTestId('complete-chapter')).toHaveText('本章已完成');
    await page.getByLabel('Language / 语言').selectOption('en');
    await page.reload();
    await expect(page.getByRole('heading', { name: chapter.content.en.title, exact: true })).toBeVisible();
    await expect(page.getByTestId('complete-chapter')).toHaveText('Chapter completed');
    await expect(page.getByText('Recorded runs (2 / 10)', { exact: true })).toBeVisible();
    await expect(page.locator('#course-transfer')).toHaveValue(new RegExp(`^Synthetic functional-test response for ${chapter.id}:`));
    await expect(page.getByRole('link', { name: chapter.content.en.sources[0].title, exact: true })).toHaveAttribute('href', chapter.content.en.sources[0].url);
    if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('a validated synthetic twelve-chapter record renders and exports a bilingual evidence portfolio', async ({ page }) => {
  // This fixture checks aggregate rendering/export, not learning effectiveness.
  // Each actual chapter journey above independently exercises the UI completion path.
  const progress = emptyProgress();
  for (const chapter of chapters) {
    const kind = chapter.experimentKind;
    const initial = normalizeConfig(kind, defaults[kind]);
    const control = controls[kind][0];
    const alternative = control.options
      ? control.options.find(option => option.value !== initial[control.key])!.value
      : control.min! + control.step!;
    const changed = normalizeConfig(kind, { ...initial, [control.key]: alternative });
    const runs = [initial, changed].map(config => ({
      signature: JSON.stringify([kind, Object.entries(config).sort(([a], [b]) => a.localeCompare(b))]),
      summary: JSON.stringify(runExperiment(kind, config)),
    }));
    expect(new Set(runs.map(run => run.signature)).size).toBe(2);
    expect(new Set(runs.map(run => run.summary)).size).toBe(2);
    const record = {
      prediction: chapter.content.en.prediction.options[0].id,
      experiment: { config: changed, runs },
      transfer: `Synthetic portfolio evidence for ${chapter.id}; not a real learner response.`,
      reflection: 'Synthetic portfolio reflection; not a human teaching assessment.',
      answers: Object.fromEntries(chapter.content.en.quiz.map(question => [question.id, question.correctId])),
      completedAt: '2026-11-02T00:00:00.000Z',
    };
    for (const locale of ['zh-CN', 'en'] as const) {
      expect(Object.values(completionRequirements(chapter, locale, record, true)).every(Boolean)).toBe(true);
    }
    progress.chapters[chapter.id] = record;
  }
  await page.goto('/');
  await page.evaluate(raw => localStorage.setItem('understanding-lab:course-progress:v1', raw), JSON.stringify(progress));
  await page.reload();
  await expect(page.getByRole('heading', { name: '整套课程练习已完成', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: '已完成 · 复习', exact: true })).toHaveCount(12);
  await page.getByLabel('Language / 语言').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Course practice completed', exact: true })).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export evidence portfolio', exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(JSON.parse(await readFile(path!, 'utf8'))).toEqual(progress);
});

test('catalog and the new course player have no serious or critical accessibility violations', async ({ page }) => {
  await page.goto('/');
  const serious = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations
    .filter(violation => violation.impact === 'critical' || violation.impact === 'serious');
  expect(await serious(), 'course catalog').toEqual([]);
  await page.getByRole('link', { name: chapters[0].content['zh-CN'].title, exact: true }).click();
  expect(await serious(), 'course player').toEqual([]);
});
