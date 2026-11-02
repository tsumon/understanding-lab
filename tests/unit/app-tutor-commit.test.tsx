// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import pack from '../../public/experiments/overfitting.v1.json';
import { newSession } from '../../src/domain/contracts';
import { writeEnvelope } from '../../src/client/local-store';
const auth = vi.hoisted(() => ({
  getSignedInUser: vi.fn(async () => ({ id: 'alice' })),
  signInWithGitHub: vi.fn(), signOut: vi.fn(),
}));
vi.mock('../../src/client/auth-client', () => auth);
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.resetModules(); });
function tutorResponse(requestId: string) {
  return new Response(JSON.stringify({ requestId, contentRevision: 0, result: {
    status: 'ok', model: 'fixture', promptVersion: 'fixture-v1',
    output: { kind: 'supported', claim: 'fixture feedback', reason: 'fixture evidence',
      nextAction: 'ask', question: 'Which data?', quotes: [],
      sources: [{ paragraphId: 'p-fit', topicVersion: 'overfitting.v1' }], metrics: [] },
  } }), { status: 200 });
}
function setup(tutor?: (requestId: string, signal: AbortSignal) => Promise<Response>) {
  expect(writeEnvelope('current', {
    session: { ...newSession('current'), notes: 'private fixture notes' }, unconfirmedText: '',
    exploration: { config: { seed: 17, n: 40, noise: .1, degree: 3 }, frozen: null, revealed: false, contaminated: false },
    updatedAt: '2026-09-28T00:00:00Z',
  })).toEqual({ ok: true });
  const requests: { requestId: string; session: ReturnType<typeof newSession>; signal: AbortSignal }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/experiments/')) return { ok: true, json: async () => pack };
    const body = JSON.parse(String(init?.body ?? '{}'));
    if (url.includes('/api/sessions/')) return new Response(JSON.stringify({ session: body.session, serverRevision: 1 }), { status: 200 });
    if (url === '/api/tutor') {
      requests.push({ ...body, signal: init!.signal });
      return tutor ? tutor(body.requestId, init!.signal as AbortSignal) : tutorResponse(body.requestId);
    }
    return new Response('', { status: 404 });
  }));
  return requests;
}
test('a request started immediately from the committed saved UI survives old-context cancellation', async () => {
  const requests = setup();
  const { App } = await import('../../src/client/App');
  render(<App />);
  let clicked = false;
  // Observe real DOM commit and dispatch a native click before deferred passive
  // effects. No React hooks, scheduler internals, or guard behavior are mocked.
  const observer = new MutationObserver(() => {
    if (!clicked && document.querySelector('[data-state="synced"]')) {
      clicked = true;
      const send = [...document.querySelectorAll('button')].find(button => button.textContent === '发送给 AI');
      send?.click();
    }
  });
  observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  try {
    fireEvent.click(screen.getByRole('button', { name: '保存到账号' }));
    await screen.findByText('fixture feedback');
    expect(clicked).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].session.id).not.toBe('current');
    expect(requests[0].session.notes).toBe('');
    expect(requests[0].signal.aborted).toBe(false);
  } finally { observer.disconnect(); }
});
test('changing the saved context still aborts an old request and ignores its delayed response', async () => {
  let deliver: (() => void) | undefined;
  const requests = setup(requestId => new Promise<Response>(resolve => { deliver = () => resolve(tutorResponse(requestId)); }));
  const { App } = await import('../../src/client/App');
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: '发送给 AI' }));
  await waitFor(() => expect(requests).toHaveLength(1));
  expect(requests[0].session.id).toBe('current');
  fireEvent.click(screen.getByRole('button', { name: '保存到账号' }));
  await screen.findByText('已同步到账号');
  expect(requests[0].signal.aborted).toBe(true);
  await act(async () => { deliver!(); });
  expect(screen.queryByText('fixture feedback')).toBeNull();
  expect(requests).toHaveLength(1);
});
