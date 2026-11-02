import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';

const root = process.cwd();
const loader = createRequire(import.meta.url).resolve('tsx');
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'static-package-test-')); directories.push(dir);
  const put = (name: string, text: string) => { mkdirSync(path.dirname(path.join(dir, name)), { recursive: true }); writeFileSync(path.join(dir, name), text); };
  put('package.json', JSON.stringify({ name: 'synthetic-static-package', version: '0.2.0' }));
  put('.gitignore', 'tmp/\n');
  put('LICENSE', 'Synthetic fixture license'); put('THIRD_PARTY_NOTICES.md', 'Synthetic fixture notices');
  put('docs/static-release-readme.md', 'Synthetic instructions'); put('tools/serve-static.py', '# Synthetic server fixture');
  put('dist/index.html', '<html>synthetic</html>'); put('dist/sw.js', 'const CACHE="synthetic-built-cache";');
  put('dist/THIRD_PARTY_LICENSES.txt', 'Synthetic bundled licenses');
  for (const dep of ['react', 'react-dom', 'scheduler']) put(`node_modules/${dep}/LICENSE`, `Synthetic ${dep} license`);
  execFileSync('git', ['init', '-q'], { cwd: dir }); execFileSync('git', ['add', '.'], { cwd: dir });
  execFileSync('git', ['-c', 'user.name=Synthetic Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Synthetic fixture'], { cwd: dir });
  return { dir, put };
}
function run(dir: string) { return spawnSync(process.execPath, ['--import', loader, path.join(root, 'tools/package-static-release.ts')], { cwd: dir, encoding: 'utf8', timeout: 5000 }); }
describe('static distribution safety', () => {
  it('normalizes source modes and produces identical bytes from the same source', () => {
    const { dir } = fixture(); const first = run(dir); expect(first.status, first.stderr).toBe(0);
    const archive = path.join(dir, 'tmp/releases/understanding-lab-0.2.0-static.tar.gz'); const before = readFileSync(archive);
    chmodSync(path.join(dir, 'dist/index.html'), 0o600); chmodSync(path.join(dir, 'dist'), 0o700);
    const second = run(dir); expect(second.status, second.stderr).toBe(0); expect(readFileSync(archive)).toEqual(before);
  });
  it.each(['dist/.private/data.json', 'dist/.env.json'])('rejects hidden paths: %s', name => {
    const { dir, put } = fixture(); put(name, 'synthetic not a secret'); const result = run(dir);
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('Refusing hidden path or symlink');
  });
  it.each(['dist', 'dist/index.html', 'LICENSE', 'docs', 'node_modules/react'])('rejects symlink input: %s', name => {
    const { dir } = fixture(); const original = path.join(dir, name), target = path.join(dir, 'link-target');
    execFileSync('mv', [original, target]); symlinkSync(target, original);
    const result = run(dir); expect(result.status).not.toBe(0); expect(result.stderr).toMatch(/Expected real (?:dependency )?directory|Expected regular file|Refusing hidden path or symlink/);
  });
  it.each(['.tar.gz', '.tar.gz.sha256'])('rejects existing archive output symlinks: %s', suffix => {
    const { dir, put } = fixture(); put('outside.txt', 'synthetic unchanged target');
    mkdirSync(path.join(dir, 'tmp/releases'), { recursive: true });
    symlinkSync(path.join(dir, 'outside.txt'), path.join(dir, `tmp/releases/understanding-lab-0.2.0-static${suffix}`));
    const result = run(dir); expect(result.status).not.toBe(0); expect(result.stderr).toContain('Expected regular file');
    expect(readFileSync(path.join(dir, 'outside.txt'), 'utf8')).toBe('synthetic unchanged target');
  });
  it('rejects an unresolved offline service worker template', () => {
    const { dir, put } = fixture(); put('dist/sw.js', 'const PRECACHE = __PRECACHE__;'); const result = run(dir);
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('Run build:offline first');
  });
  it('rejects a non-regular public FIFO before reading it', () => {
    const { dir } = fixture(); execFileSync('mkfifo', [path.join(dir, 'dist/pipe.json')]); const result = run(dir);
    expect(result.status).not.toBe(0); expect(result.stderr).toContain('Expected regular file');
  });
});
