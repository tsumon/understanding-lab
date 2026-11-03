// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import pack from '../../public/experiments/overfitting.v1.json';
const key = 'understanding-lab:v1:anonymous:current';
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.resetModules(); });
async function setup() {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => pack })));
  const { App } = await import('../../src/client/App');
  const view = render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '开始学习' }));
  return { view, field: screen.getByRole('textbox', { name: '我的解释' }) as HTMLTextAreaElement };
}
function input(field: HTMLTextAreaElement, value: string, inputType = 'insertText', isComposing = false) {
  // Deliberately programmatic DOM/assisted input, not a claim about trusted
  // WebKit internals: the normal property setter also updates React's tracker.
  act(() => {
    field.value = value;
    field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType, data: value, isComposing }));
  });
}
function stored() { return JSON.parse(localStorage.getItem(key)!); }
test('native input persists a tracked DOM value as an unconfirmed draft and survives remount', async () => {
  const { view, field } = await setup();
  input(field, '尚未确认的初始草稿');
  expect(stored().drafts.explain).toBe('尚未确认的初始草稿');
  expect(stored().session.answers).toEqual([]);
  view.unmount();
  const { App } = await import('../../src/client/App');
  render(<App />);
  expect((screen.getByRole('textbox', { name: '我的解释' }) as HTMLTextAreaElement).value).toBe('尚未确认的初始草稿');
});
test('composition, paste, deletion and undo input retain the supplied text without premature confirmation', async () => {
  const { field } = await setup();
  fireEvent.compositionStart(field);
  input(field, '中', 'insertCompositionText', true);
  expect(stored().unconfirmedText).toBe('中');
  input(field, '中文', 'insertCompositionText', true);
  fireEvent.compositionEnd(field, { data: '中文' });
  input(field, '中文', 'insertFromComposition');
  input(field, '中文\n粘贴内容', 'insertFromPaste');
  expect(stored().unconfirmedText).toBe('中文\n粘贴内容');
  input(field, '', 'deleteContentBackward');
  expect(stored().unconfirmedText).toBe('');
  input(field, '中文\n粘贴内容', 'historyUndo');
  expect(field.value).toBe('中文\n粘贴内容');
  expect(stored().session.answers).toEqual([]);
});
test('over-limit native insertion restores accepted DOM text without overwriting its draft', async () => {
  const { field } = await setup();
  input(field, '🧠'.repeat(4000));
  expect([...stored().unconfirmedText]).toHaveLength(4000);
  input(field, '🧠'.repeat(4001), 'insertFromPaste');
  expect(field.value).toBe('🧠'.repeat(4000));
  expect(stored().drafts.explain).toBe('🧠'.repeat(4000));
});
