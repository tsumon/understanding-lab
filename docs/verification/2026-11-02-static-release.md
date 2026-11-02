# Static release candidate verification — 2026-11-02

Scope: **0.2.0-rc.1**, local anonymous bilingual course distribution, not hosted account/AI service deployment. No real account, model, transcription or paid endpoint was called. No tag/release/merge/deployment is authorized by this record.

## Independent installation and builds

- Created an empty `/tmp/understanding-lab-release-clean` install directory containing only candidate `package.json` and the pre-audit lockfile. `npm ci` installed **263 packages** successfully in about three minutes. No working-tree node_modules was copied into that installation.
- Used those freshly installed dependencies in an isolated source checkout. Ordinary `npm run build` followed by packaging correctly failed on the unresolved service-worker template (`Run build:offline first`). `npm run package:static` then passed; the corrected deployment instructions require `build:offline`.
- Build environment: cloud Debian13, Node24.22.1 / npm11.9.0; CI separately uses Node22.23.2. Native SQLite installation completed. Existing cloud browser dependency setup and warnings are documented in the earlier baseline/course reports.
- Typecheck passed. Resource-isolated whole unit run passed **362 tests /43 files** before the final two output-symlink regression cases were added. Final affected packaging/server run passed **13 tests /2 files** after those boundary fixes. Do not misrepresent that intermediate whole-suite result as the final 364-case CI run. The latest commit's complete CI is a separate release gate.

## Packaging and license review

The archive contains only public `site/`, project license/notices, full licenses for actual bundled packages, local launch instructions, the Python standard-library launcher, source/version metadata, and SHA-256 checksums. It excludes `.env`, SQLite, node_modules, native binaries, personal records, logs and test recordings.

Independent review identified and resolved: missing Vite virtual-module runtime license; hidden directories; source/final-stage nonregular or symlink paths; output-archive symlink overwrite; and mode-dependent tar reproducibility. Final regressions reject hidden paths, symlinked root/file/docs/dependency inputs, FIFO, unresolved SW, and pre-existing archive/checksum symlinks while preserving their external synthetic targets. Repeated packaging with changed source permissions produces identical bytes; directory/file modes are normalized to 0755/0644. This is a trusted local build-workspace boundary, not a guarantee against hostile concurrent filesystem mutation.

Full installed license/notice text is collected from actual bundle modules, with Vite explicitly included for its injected modulepreload polyfill. The previous ten-package inventory gained Vite; no server/developer binaries are bundled. GNU tar and gzip metadata are normalized. Final publishable candidates must be rebuilt **after** source commit alignment with a clean working tree; BUILD.json and the archive's companion SHA-256 are the identity records. Preliminary dirty-working-tree archives were test artifacts only.

## Real two-version update and offline test

Baseline `787282a` was built separately, cache `understanding-lab-public-cb12120d2902041f`. The candidate was independently extracted and served on loopback. Browser smoke covers:

1. Catalog has 12 chapters; first chapter stores synthetic transfer text plus a separate opaque synthetic legacy record.
2. Swap old/new public roots at the same origin and invoke a real service-worker update; the visible update action activates the new cache.
3. Course and legacy stored bytes remain unchanged; old public cache is removed, new public cache exists.
4. Shut down the actual local server, then reload the chapter offline, retain text, navigate the catalog and change to English.
5. No browser page errors or external requests.

Chromium and WebKit both passed this workflow. Source changes after the first smoke only affect packaging/launcher hardening; final clean candidate must repeat this exact workflow before delivery. Reproduce with:

```sh
node --import tsx tools/verify-static-release.ts OLD_BUILT_DIST EXTRACTED_CANDIDATE/site
```

An ordinary Python `http.server` failed the initial upgrade: old SW mtime was 1793638233, new reproducible archive mtime 0; an `If-Modified-Since` request returned **304 despite different bytes**, hiding the update. This was independently reproduced with HTTP, not guessed from a timeout. The packaged `serve.py` ignores conditional-cache headers and sets `Cache-Control: no-store`, binds only 127.0.0.1, disables directory listings and rejects symlink escapes including automatic directory indexes. A real HTTP regression validates these boundaries. The launcher requires Python3.9+ and is a local study server, not a public hardened web server.

Early smoke scripts also had two authoring mistakes: default browser locale was English while Chinese text was expected, and a language selector was incorrectly queried as a button. Fixed the fixture locale and actual select control, without extending assertion budgets or retrying unchanged tests. These were not product defects. The final assertions retain 5-second budgets.

## Dependency security gate

The first audit found nine affected packages including Zod in the static bundle. Independent advisory review established reachability boundaries and minimum fixes; exact direct safety patches plus compatible transitive updates were applied. The post-patch `npm audit --omit=dev --json` reports zero known advisories. See [dependency audit](2026-11-02-dependency-audit.md). Earlier 263-package installation, 362-unit run and preliminary archives above precede those patches; they are not the final dependency acceptance. Final clean installation, build, whole-suite CI and archive smoke must use the updated lockfile.

## Final gate and retained limits

See [release checklist](../release-checklist.md). Final release readiness requires the exact candidate commit's full CI, a clean source-stamped archive, successful checksum validation and repeated two-version smoke. Artifacts stay local under ignored `tmp/releases/` until explicit publication approval. Final observed hashes and CI links belong in the delivery/PR record; do not infer them from a preliminary build.

Historical WebKit intermittency is not declared permanently fixed; complete functional course coverage is not educational-effectiveness certification. Browser storage remains unencrypted/evictable; cross-tab compare-and-write is non-atomic. Export before updating. Real OAuth/provider/voice, public-hosting security operations and production backup/restore remain outside this static candidate's acceptance scope.

Raw logs are retained locally under `/tmp/understanding-lab-evidence/release-*`; these contain only synthetic test data and are not shipped in the archive.

## Post-security-patch local results (before clean commit packaging)

- `npm ci` installed 263 packages successfully; typecheck and `npm run package:static` passed. Actual static notices include 11 packages, including the Vite helper license. Candidate cache: `understanding-lab-public-bbd97e6a052ba605`.
- Final patched local serial unit invocation: **363 passed /1 failed, 43 files, 201.10 seconds**. The sole failure was existing `diagnostic-artifact.test.ts`'s nested Playwright process returning `status=null` after its unchanged 15000ms process budget, not a course/security assertion. Host load had risen to 9.18; this is relevant context, not proof of a unique root cause.
- After the build completed and host conditions eased, the one affected diagnostic file was run once with identical code/timeouts/assertions: **3/3 passed**, 12.56 seconds. The full local suite was not replayed until green. Latest-commit remote CI must still pass in full before release readiness is declared.
