import { EventEmitter, getEventListeners } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, test, vi } from 'vitest';
import { MAX_PCM_BYTES, normalizeAudio, type FfmpegSpawn } from '../../src/server/audio';

afterEach(() => vi.useRealTimers());
function fixture() {
  const stdin = new PassThrough(), stdout = new PassThrough(), stderr = new PassThrough();
  const child = new EventEmitter() as ReturnType<FfmpegSpawn> & EventEmitter;
  const escaped: unknown[] = [];
  const pipeError = () => { try { stdin.emit('error', Object.assign(new Error('synthetic pipe closed'), { code: 'EPIPE' })); } catch (error) { escaped.push(error); } };
  let killed = false;
  Object.assign(child, { stdin, stdout, stderr });
  child.kill = () => {
    if (!killed) { killed = true; queueMicrotask(() => { pipeError(); stdout.end(); child.emit('close', 1); }); }
    return true;
  };
  const spawn: FfmpegSpawn = () => child;
  return { child, stdin, stdout, stderr, spawn, escaped, pipeError, close: (code = 0) => { stdout.end(); child.emit('close', code); } };
}

test('oversize kill consumes an asynchronous pending-write EPIPE without losing too-long', async () => {
  const f = fixture(); const result = normalizeAudio(new Uint8Array([1]), new AbortController().signal, f.spawn);
  const rejected = expect(result).rejects.toMatchObject({ code: 'too-long' });
  f.stdout.write(Buffer.alloc(MAX_PCM_BYTES + 1));
  await rejected;
  expect(f.escaped).toEqual([]);
  f.pipeError(); // an already queued error can arrive after the function's finally
  expect(f.escaped).toEqual([]);
});

test('unexpected stdin EPIPE rejects decode even if a mock child later reports successful exit', async () => {
  const f = fixture(); const result = normalizeAudio(new Uint8Array([1]), new AbortController().signal, f.spawn);
  const rejected = expect(result).rejects.toMatchObject({ code: 'decode' });
  f.stdout.write(Buffer.alloc(32)); f.pipeError(); f.close(0);
  await rejected; expect(f.escaped).toEqual([]);
});

test('abort while writing returns timeout, handles late EPIPE, and removes abort listeners', async () => {
  const f = fixture(), controller = new AbortController();
  const result = normalizeAudio(new Uint8Array([1]), controller.signal, f.spawn);
  const rejected = expect(result).rejects.toMatchObject({ code: 'timeout' });
  controller.abort(); await rejected; await Promise.resolve();
  f.pipeError(); expect(f.escaped).toEqual([]); expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});

test('the existing 15-second decoder deadline returns timeout and handles teardown EPIPE', async () => {
  vi.useFakeTimers(); const f = fixture();
  const result = normalizeAudio(new Uint8Array([1]), new AbortController().signal, f.spawn);
  const rejected = expect(result).rejects.toMatchObject({ code: 'timeout' });
  await vi.advanceTimersByTimeAsync(15000); await rejected; expect(f.escaped).toEqual([]);
});

test('successful completion drains stderr and leaves no abort listener', async () => {
  const f = fixture(), controller = new AbortController();
  const result = normalizeAudio(new Uint8Array([1]), controller.signal, f.spawn);
  f.stderr.write(Buffer.alloc(128 * 1024)); expect(f.stderr.readableLength).toBe(0);
  f.stdout.write(Buffer.alloc(32)); f.close();
  await expect(result).resolves.toHaveLength(76);
  expect(f.stderr.readableLength).toBe(0); expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0);
});

test('early process failure is a sanitized decode rejection and late stdin errors remain contained', async () => {
  const f = fixture(); const result = normalizeAudio(new Uint8Array([1]), new AbortController().signal, f.spawn);
  const rejected = expect(result).rejects.toMatchObject({ code: 'decode' });
  f.child.emit('error', new Error('synthetic spawn failure')); await rejected; await Promise.resolve();
  f.pipeError(); expect(f.escaped).toEqual([]);
});


test('a synchronous stdin write exception rejects decode without an orphaned terminal promise', async () => {
  const f = fixture(); vi.spyOn(f.stdin, 'end').mockImplementation(() => { throw new Error('synthetic write failure'); });
  await expect(normalizeAudio(new Uint8Array([1]), new AbortController().signal, f.spawn)).rejects.toMatchObject({ code: 'decode' });
  await Promise.resolve(); expect(f.escaped).toEqual([]);
});

test('a stderr stream failure rejects sanitized decode rather than retaining diagnostics', async () => {
  const f = fixture(); const result = normalizeAudio(new Uint8Array([1]), new AbortController().signal, f.spawn);
  const rejected = expect(result).rejects.toMatchObject({ code: 'decode', message: 'decode' });
  f.stderr.emit('error', new Error('synthetic diagnostic detail')); await rejected;
  expect(f.escaped).toEqual([]);
});
