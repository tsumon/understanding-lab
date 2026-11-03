import { expect, test } from '@playwright/test';
const key = 'understanding-lab:v1:anonymous:current';
test('browser typing and multiline insertion persist immediately without confirming the draft', async ({ page }) => {
  await page.goto('/#legacy');
  await page.getByRole('button', { name: '开始学习' }).click();
  const field = page.getByLabel('我的解释');
  await field.fill('中文草稿');
  await field.press('End');
  await page.keyboard.type(' + typed');
  await page.keyboard.insertText('\n多行插入');
  const expected = '中文草稿 + typed\n多行插入';
  await expect(field).toHaveValue(expected);
  const draft = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), key);
  expect(draft.drafts.explain).toBe(expected);
  expect(draft.session.answers).toEqual([]);
  await page.reload();
  await expect(field).toHaveValue(expected);
});
test('standard programmatic input persists even when the DOM value tracker is already synchronized', async ({ page }) => {
  await page.goto('/#legacy');
  await page.getByRole('button', { name: '开始学习' }).click();
  await page.getByLabel('我的解释').evaluate((field: HTMLTextAreaElement) => {
    // This models assisted/programmatic insertion, not a trusted keyboard event.
    field.value = '尚未确认的初始草稿';
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: field.value }));
  });
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).drafts.explain, key)).toBe('尚未确认的初始草稿');
  await page.reload();
  await expect(page.getByLabel('我的解释')).toHaveValue('尚未确认的初始草稿');
});
