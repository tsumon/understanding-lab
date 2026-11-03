import { expect, test, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { chapters } from '../../src/course/curriculum';

const courseKey = 'understanding-lab:course-progress:v1';
const legacyKey = 'understanding-lab:v1:anonymous:current';
const first = chapters[0];
const second = chapters[1];
const transfer = 'I would hold out different people and compare errors on genuinely unseen observations.';
const reflection = 'A random row split can leak identity; I now ask what independent unit the evaluation holds out.';

async function stored(page: Page, key = courseKey) {
  return page.evaluate(key => localStorage.getItem(key), key);
}
async function downloadText(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: label, exact: true }).click();
  const download = await pending;
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, 'utf8');
}

test('completion requires distinct recorded experiments and corrected checks, then survives refresh', async ({ page }) => {
  await page.goto(`/#course/${first.id}`);
  const complete = page.getByTestId('complete-chapter');
  await expect(complete).toBeDisabled();
  // Predictions are evidence of thinking, not a scored mastery claim.
  await page.locator('input[name="data-split-split-prediction"][value="b"]').check();
  await page.getByTestId('run-experiment').click();
  await page.getByTestId('run-experiment').click();
  await expect(page.getByText('实验记录（1 / 10）', { exact: true })).toBeVisible();
  await page.getByLabel('划分方式', { exact: true }).selectOption('grouped');
  await expect(page.getByText('实验记录（1 / 10）', { exact: true })).toBeVisible();
  await page.locator('#course-transfer').fill(transfer);
  for (const question of first.content['zh-CN'].quiz) {
    await page.locator(`input[name="${first.id}-${question.id}"][value="${question.correctId}"]`).check();
  }
  await page.locator('#course-reflection').fill(reflection);
  await expect(complete).toBeDisabled();
  await page.getByTestId('run-experiment').click();
  await expect(page.getByText('实验记录（2 / 10）', { exact: true })).toBeVisible();
  const quiz = first.content['zh-CN'].quiz[0];
  const wrong = quiz.options.find(option => option.id !== quiz.correctId)!;
  await page.locator(`input[name="${first.id}-${quiz.id}"][value="${wrong.id}"]`).check();
  await expect(complete).toBeDisabled();
  await page.locator(`input[name="${first.id}-${quiz.id}"][value="${quiz.correctId}"]`).check();
  await expect(complete).toBeEnabled();
  await complete.click();
  await expect(complete).toHaveText('本章已完成');
  await page.reload();
  await expect(complete).toHaveText('本章已完成');
  await expect(page.locator('#course-transfer')).toHaveValue(transfer);
  await expect(page.locator('#course-reflection')).toHaveValue(reflection);
  await page.locator('#course-reflection').fill(`${reflection} I will repeat the comparison on another dataset.`);
  await expect(complete).toHaveText('记录本章完成');
  expect(JSON.parse((await stored(page))!).chapters[first.id].completedAt).toBeUndefined();
});

test('returning from the catalog restores the most recent original overfitting draft', async ({ page }) => {
  await page.goto('/#legacy');
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  const draft = 'Synthetic recent legacy explanation must survive a catalog round trip.';
  await page.getByLabel('我的解释', { exact: true }).fill(draft);
  await page.getByLabel('我的笔记（最多 8000 字）', { exact: true }).fill('Synthetic recent private note.');
  await page.getByRole('link', { name: '← 返回 AI 课程', exact: true }).click();
  await expect(page.locator('.course-catalog > li')).toHaveCount(12);
  await page.getByRole('link', { name: '原版过拟合实验', exact: true }).click();
  await expect(page.getByLabel('我的解释', { exact: true })).toHaveValue(draft);
  await expect(page.getByLabel('我的笔记（最多 8000 字）', { exact: true })).toHaveValue('Synthetic recent private note.');
  expect(JSON.parse((await stored(page, legacyKey))!).unconfirmedText).toBe(draft);
});

test('catalog exposes all chapters without uploading or replacing legacy records', async ({ page, isMobile }) => {
  const requests: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) requests.push(request.url()); });
  await page.goto('/');
  const legacy = '{synthetic untouched legacy recovery record';
  await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key: legacyKey, raw: legacy });
  await page.reload();
  await expect(page.locator('.course-catalog > li')).toHaveCount(12);
  await page.getByRole('link', { name: first.content['zh-CN'].title, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`#course/${first.id}$`));
  await expect(page.getByTestId('complete-chapter')).toBeDisabled();
  if (!isMobile) {
    await page.getByRole('link', { name: '跳到课程内容' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#course-main')).toBeFocused();
    await expect(page).toHaveURL(new RegExp(`#course/${first.id}$`));
  }
  await page.locator('#course-transfer').fill(transfer);
  await page.getByRole('link', { name: '← 全部章节', exact: true }).click();
  await page.getByRole('link', { name: second.content['zh-CN'].title, exact: true }).click();
  await expect(page.locator('#course-transfer')).toHaveValue('');
  await page.locator('#course-transfer').fill('This second chapter has a separate synthetic draft, not the first chapter response.');
  await page.goto(`/#course/${first.id}`);
  await expect(page.locator('#course-transfer')).toHaveValue(transfer);
  await page.getByLabel('Language / 语言').selectOption('en');
  await page.reload();
  await expect(page.locator('#course-transfer')).toHaveValue(transfer);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await stored(page, legacyKey)).toBe(legacy);
  expect(requests).toEqual([]);
  if (isMobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('corrupt course records remain exportable and reset never deletes legacy data', async ({ page }) => {
  await page.goto('/');
  const raw = '{broken synthetic course record';
  const legacy = '{independent synthetic legacy recovery data';
  await page.evaluate(({ courseKey, legacyKey, raw, legacy }) => {
    localStorage.setItem(courseKey, raw); localStorage.setItem(legacyKey, legacy);
  }, { courseKey, legacyKey, raw, legacy });
  await page.goto(`/#course/${first.id}`);
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('已停止写入');
  await expect(page.locator('#course-transfer')).toBeDisabled();
  expect(await downloadText(page, '导出备份')).toBe(raw);
  await page.getByRole('button', { name: '重置课程记录', exact: true }).click();
  await page.getByRole('button', { name: '取消', exact: true }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
  expect(await stored(page)).toBe(raw);
  await page.getByRole('button', { name: '重置课程记录', exact: true }).click();
  await page.getByRole('button', { name: '确认删除课程记录', exact: true }).click();
  await expect(page.locator('#course-transfer')).toBeEnabled();
  expect(await stored(page)).toBeNull();
  expect(await stored(page, legacyKey)).toBe(legacy);
});

test('failed browser saving retains the current answer and exports a usable recovery record', async ({ page }) => {
  await page.addInitScript(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (this === localStorage && name === key) throw new DOMException('Synthetic storage full', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, courseKey);
  await page.goto(`/#course/${first.id}`);
  await page.locator('#course-transfer').fill(transfer);
  await expect(page.getByRole('alert')).toContainText('当前回答仍在此页面');
  await expect(page.locator('#course-transfer')).toHaveValue(transfer);
  const backup = JSON.parse(await downloadText(page, '导出备份'));
  expect(backup.schemaVersion).toBe(1);
  expect(backup.chapters[first.id].transfer).toBe(transfer);
  expect(await stored(page)).toBeNull();
});

test('a second tab pauses stale writes and lets the learner export before accepting the newer record', async ({ page, context }) => {
  await page.goto(`/#course/${first.id}`);
  await page.locator('#course-transfer').fill(transfer);
  const other = await context.newPage();
  try {
    await other.goto(`/#course/${first.id}`);
    await expect(other.locator('#course-transfer')).toHaveValue(transfer);
    const newer = 'Another tab has a different synthetic explanation that must not be silently overwritten.';
    await other.locator('#course-transfer').fill(newer);
    await expect(page.getByRole('alert')).toContainText('另一标签页');
    await expect(page.locator('#course-transfer')).toBeDisabled();
    await expect(page.locator('#course-transfer')).toHaveValue(transfer);
    const backup = JSON.parse(await downloadText(page, '导出备份'));
    expect(backup.chapters[first.id].transfer).toBe(transfer);
    expect(JSON.parse((await stored(page))!).chapters[first.id].transfer).toBe(newer);
    await page.getByRole('button', { name: '重新载入记录', exact: true }).click();
    await expect(page.locator('#course-transfer')).toBeEnabled();
    await expect(page.locator('#course-transfer')).toHaveValue(newer);
  } finally { await other.close(); }
});

test('a first-time course visit caches the catalog and chapters for offline refresh', async ({ page }) => {
  const portProbe = createServer();
  await new Promise<void>(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const address = portProbe.address();
  if (!address || typeof address === 'string') throw new Error('No local port');
  const port = address.port;
  await new Promise<void>(resolve => portProbe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(port)], {
    cwd: process.cwd(), stdio: 'ignore',
  });
  let failed = false;
  const started = Date.now();
  const events: Array<{ phase: string; ms: number; detail?: unknown }> = [];
  const record = (phase: string, detail?: unknown) => { if (events.length < 40) events.push({ phase, ms: Date.now() - started, detail }); };
  page.on('pageerror', error => record('pageerror', error.message.slice(0, 500)));
  page.on('requestfailed', request => record('requestfailed', { path: new URL(request.url()).pathname, reason: request.failure()?.errorText?.slice(0, 300) }));
  const snapshot = async (phase: string) => {
    let diagnosticTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      const detail = await Promise.race([page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        const names = (await caches.keys()).slice(0, 5);
        return { controller: navigator.serviceWorker.controller?.state ?? null,
          active: registration?.active?.state ?? null, installing: registration?.installing?.state ?? null,
          waiting: registration?.waiting?.state ?? null,
          status: document.querySelector('.offline-status')?.textContent?.slice(0, 500) ?? null,
          caches: await Promise.all(names.map(async name => ({ name, entries: (await (await caches.open(name)).keys()).slice(0, 12).map(request => new URL(request.url).pathname) }))) };
      }), new Promise<never>((_, reject) => {
        // Bound diagnostics, not product readiness, so a stalled browser cannot
        // prevent child-server cleanup after the original assertion fails.
        diagnosticTimer = setTimeout(() => reject(new Error('Diagnostic snapshot unavailable after 1s')), 1000);
      })]);
      record(phase, detail);
    } catch (error) { record(phase, { unavailable: error instanceof Error ? error.message.slice(0, 500) : 'unknown' }); }
    finally { clearTimeout(diagnosticTimer); }
  };
  try {
    await expect.poll(async () => fetch(origin).then(response => response.status).catch(() => 0)).toBe(200);
    await page.goto(origin);
    await snapshot('document-loaded');
    // A cold service-worker installation is an asynchronous prerequisite, not a
    // guarantee that all public assets download within the UI assertion's 5s.
    // This remains bounded by the original whole-test budget; no sleeps/retries.
    record('await-service-worker-ready');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    record('service-worker-ready');
    await expect(page.getByText('公共材料与实验数据已缓存，可离线使用', { exact: true })).toBeVisible();
    await snapshot('cache-ui-confirmed');
    await page.getByRole('link', { name: first.content['zh-CN'].title, exact: true }).click();
    await page.locator('#course-transfer').fill(transfer);
    // Test actual origin unavailability, as the original lesson regression does.
    // WebKit's context.setOffline emulation aborted cached navigation internally.
    record('stop-origin');
    server.kill('SIGTERM');
    await once(server, 'exit');
    await expect.poll(async () => fetch(origin).then(response => response.status).catch(() => 0)).toBe(0);
    await page.reload();
    await expect(page.locator('#course-transfer')).toHaveValue(transfer);
    await page.getByRole('link', { name: '← 全部章节', exact: true }).click();
    await expect(page.locator('.course-catalog > li')).toHaveCount(12);
    await page.getByRole('link', { name: second.content['zh-CN'].title, exact: true }).click();
    await expect(page.locator('#course-transfer')).toHaveValue('');
    await page.getByLabel('Language / 语言').selectOption('en');
    await page.reload();
    await expect(page.getByRole('heading', { name: second.content.en.title, exact: true })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    try {
      if (failed || test.info().status !== test.info().expectedStatus) {
        if (!page.isClosed()) await snapshot('failure');
        const diagnostic = test.info().outputPath('offline-cache-diagnostic.json');
        await writeFile(diagnostic, JSON.stringify({ browser: test.info().project.name, events }, null, 2));
        await test.info().attach('offline-cache-diagnostic', { path: diagnostic, contentType: 'application/json' });
      }
    } catch {
      // Diagnostic capture must not replace the original failure or skip cleanup.
      console.warn('Offline-cache diagnostic capture unavailable');
    }
    if (server.exitCode === null && server.signalCode === null) {
      server.kill('SIGTERM');
      await once(server, 'exit');
    }
  }
});

test('a delayed storage event cannot let a stale tab overwrite newer work', async ({ page, context }) => {
  // Deterministically model the interval before a remote storage event is delivered.
  await page.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation(), true));
  await page.goto(`/#course/${first.id}`);
  await page.locator('#course-transfer').fill(transfer);
  const other = await context.newPage();
  try {
    await other.goto(`/#course/${first.id}`);
    const remote = 'Newer remote-tab synthetic work must survive even before its storage notification is delivered.';
    await other.locator('#course-transfer').fill(remote);
    await expect.poll(async () => JSON.parse((await stored(other))!).chapters[first.id].transfer).toBe(remote);
    const pending = 'New local input must remain exportable when a synchronous pre-write conflict is detected.';
    await page.locator('#course-transfer').fill(pending);
    await expect(page.getByRole('alert')).toContainText('另一标签页');
    await expect(page.locator('#course-transfer')).toBeDisabled();
    await expect(page.locator('#course-transfer')).toHaveValue(pending);
    expect(JSON.parse((await stored(page))!).chapters[first.id].transfer).toBe(remote);
    const backup = JSON.parse(await downloadText(page, '导出备份'));
    expect(backup.chapters[first.id].transfer).toBe(pending);
  } finally { await other.close(); }
});
