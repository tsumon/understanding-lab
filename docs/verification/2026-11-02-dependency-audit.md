# 2026-11-02 dependency advisory review

## Scope and status

This is an independent source/registry review for the static course candidate, not a penetration test or a claim of zero vulnerabilities. The initial report at `/tmp/understanding-lab-evidence/release-npm-audit-runtime.json` recorded **9 affected dependency entries: 1 critical, 4 high, 3 moderate, 1 low**. Entries include inherited findings and development tools; the filename does not establish browser-bundle reachability. Preserve that initial evidence rather than replacing it with a later clean audit.

At this review's completion, the patch plan below is recommended; installation, post-update audit, regression checks and final artifact regeneration are owned by the release-validation worker. Do not interpret the plan as proof that the updated release already passed.

## Verified minimum patches and actual scope

| Installed package | Minimum patch | Advisory and repository-specific interpretation |
| --- | --- | --- |
| `zod` 4.6.5 | 4.6.6 | [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5): collection-validation resource exhaustion. Zod is in the static bundle and used by original-lesson contracts/local-store parsing, as well as backend validation. Browser inputs are local records/imports rather than a public validation service; that limits exposure but is not grounds to ship a known vulnerable parser. |
| `better-auth` 1.7.6 | 1.7.7 | [Critical Magic Link/state confusion](https://github.com/advisories/GHSA-965c-763c-88jm) requires Magic Link plus OAuth and the specified state-storage configuration. `src/server/auth.ts` configures GitHub OAuth, but no Magic Link plugin. Therefore the listed critical dependency finding is **not evidence of a reachable takeover in this configuration**. The static package contains client code, not an auth server. Still patch the source dependency and matched Better Auth family. |
| `better-auth` / adapters 1.7.6 | 1.7.7 | [OAuth Proxy impersonation](https://github.com/advisories/GHSA-r4xp-prcw-77qf) needs the proxy plugin and specified secret/state conditions; no proxy plugin is configured. [PostgreSQL rate-limit race](https://github.com/advisories/GHSA-44jh-23m7-hpcf) needs affected adapters plus database-backed limits on PostgreSQL; this project uses SQLite, not that configuration. |
| `body-parser` 2.3.0 | 2.4.0 | [GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828): compressed-body trailing data can cause an unhandled decoder error. Optional Express routes call `express.json` without disabling inflation. In this app the course/session JSON routes are behind the `/api` authentication middleware (and write-origin checks); the general advisory's unauthenticated default-middleware scenario must not be blindly attributed here. Body-size limits alone do not establish protection from this decoder flaw. Not shipped in the static Python server. |
| `source-map-js` 1.2.1 | 1.2.2 | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): malicious indexed source-map offsets can block processing. No application source-map ingestion endpoint was found; this is build/tooling exposure, not an observed static lesson endpoint. |
| `qs` 6.16.0 | 6.16.1 | [GHSA-6pq8-jhm2-2vcw](https://github.com/advisories/GHSA-6pq8-jhm2-2vcw): requires attacker-influenced values passed to `stringify` with comma array formatting. No such call was found in project source. Dependency presence is not proof of a reachable application exploit. |
| `vite` 8.3.1 | 8.3.3 | [Representative bundled launch-editor advisory](https://github.com/advisories/GHSA-587h-7wmj-h5pm) lists 8.3.3 as the fixed 8.3 release; the original audit also lists middleware/file-access advisories through 8.3.2. These concern development-server/editor functionality, not the small modulepreload helper embedded in production JavaScript. The static distribution runs its Python loopback server, not Vite. |
| `vitest` / `@vitest/mocker` 5.0.2 | 5.0.3 | [Manual mock code injection](https://github.com/advisories/GHSA-qxg6-89mg-rqv8) and [Windows redirect traversal](https://github.com/advisories/GHSA-xp26-3454-mjgp) affect mocker development-server interfaces. They are not distributed in the static course. Keep Vitest's matching mocker release rather than replacing only a nested copy. |

These reachability conclusions are code/configuration inferences, not exploit demonstrations. Enabling additional auth plugins, using PostgreSQL, exposing development servers, or changing input flows requires reassessment.

## Version existence, not guessed future releases

On 2026-11-02, direct HTTPS requests to the official npm registry returned HTTP 200 with matching `version` and `dist.integrity` for all seven proposed minima:

- [better-auth 1.7.7 metadata](https://registry.npmjs.org/better-auth/1.7.7)
- [zod 4.6.6 metadata](https://registry.npmjs.org/zod/4.6.6)
- [vite 8.3.3 metadata](https://registry.npmjs.org/vite/8.3.3)
- [vitest 5.0.3 metadata](https://registry.npmjs.org/vitest/5.0.3)
- [body-parser 2.4.0 metadata](https://registry.npmjs.org/body-parser/2.4.0)
- [source-map-js 1.2.2 metadata](https://registry.npmjs.org/source-map-js/1.2.2)
- [qs 6.16.1 metadata](https://registry.npmjs.org/qs/6.16.1)

`npm view` independently confirmed the four direct versions. Better Auth advisory prose still said its patch was planned/unavailable, but the registry response establishes that the package now exists; do not repeat the stale availability statement. Registry metadata also confirms Better Auth 1.7.7 depends on core 1.7.7, and Vitest 5.0.3 on mocker 5.0.3. The selected Vite/Vitest versions support the documented Node 22.12+ baseline and the tested Node 24 environment, subject to each package's exact engine range.

## Bounded remediation plan

1. Pin only the four direct packages to `better-auth@1.7.7`, `zod@4.6.6`, `vite@8.3.3`, and `vitest@5.0.3`; update affected compatible transitive resolutions to at least the verified minima. Keep the lockfile and inspect family alignment and unexpected churn.
2. Do not use `npm audit fix --force`, a broad major-version update, or disable audit findings. Stop and investigate if the patch versions introduce additional advisories or incompatible peer/engine requirements.
3. Run a clean lockfile install and preserve a fresh full audit plus a production-dependency audit with their exact command scope. Zero findings only means none reported by that audit database at that time, not a security guarantee.
4. Re-run type checks, serial unit/integration tests (especially Zod contracts/imports and authentication fixtures), relevant browser/offline/update acceptance, and packaging negative tests. No real OAuth account or model provider is needed or authorized for these checks.
5. Rebuild the static bundle, third-party license inventory, service worker and archive. Record the final source commit/dirty flag and new hashes; prior bundle hashes and test artifacts do not certify newly installed dependency code.

Pending OAuth/Magic Link state can become invalid across the Better Auth patch according to its advisory. There is no production migration in this task; any future service upgrade must follow the upstream coordinated-upgrade guidance and reassess real deployment configuration separately.

## Applied remediation (same candidate, 2026-11-02)

Applied exact direct pins: Better Auth **1.7.7**, Zod **4.6.6**, Vite **8.3.3**, Vitest **5.0.3**. Better Auth family and Vitest mocker/spy align with those patched families. Targeted, allowed-range transitive resolution gives body-parser **2.4.0**, source-map-js **1.2.2**, qs **6.17.1** (newer than the minimum fixed 6.16.1, within its existing compatible range). The lockfile also records the direct packages' compatible dependency refreshes; no major-version upgrade, `audit fix --force`, or hand-edited integrity values were used.

The subsequent `npm audit --omit=dev --json` exited **0**, reporting **0 known vulnerabilities** at all severity levels. This is the registry advisory database result for this lockfile at this time, not a security guarantee; it does not replace testing or public-hosting controls. Raw before/after audit JSON is retained locally as `release-npm-audit-runtime.json` and `release-npm-audit-patched.json` in `/tmp/understanding-lab-evidence/`. Updated dependency installation and exact-candidate CI remain part of the release gates; earlier tests on old dependencies are not relabeled as post-patch tests.
