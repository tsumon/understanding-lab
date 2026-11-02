# 2026-11-02 release-readiness audit

Scope: the 12-chapter course addition and retained original learning loop, inspected in the current cloud workspace. This is an engineering audit, not approval to merge, tag, publish, deploy, call real providers, or certify learning outcomes. Packaging and final integrated validation are tracked separately.

## Findings and disposition

- [x] **P2 recoverable-answer loss on app update:** `CourseRoot` can retain answers only in memory after a storage write failure or stale-write conflict, while `OfflineStatus` previously offered an unconditional service-worker activation and page reload. Added an optional update guard, wired it to course unpersisted/conflicted state, and provided bilingual explanation. Added a conditional native `beforeunload` warning for manual leave/refresh; normal saved edits do not prompt, and a successful retry clears the guard. This is best-effort UI protection, not an autosave guarantee.
- [x] **P2 documented production build can leave a template service worker:** `docs/deployment.md` used `npm run build`, while only `build:offline` runs `tools/build-sw.ts` to replace `__PRECACHE__` and `__CACHE_NAME__`. The public template is not executable as a production worker. Deployment recipe now uses `build:offline`; `package:static` builds offline before packaging. In the isolated clean-install source tree, ordinary `build` followed by the packager was rejected with `Run build:offline first`; the corrected offline build was accepted.
- [x] **Documentation scope ambiguity:** privacy/getting-started wording previously described only the original lesson's export/import/account behavior. Updated to distinguish local-only course records and course JSON export with no import UI, optional original-lesson services, shared-browser exposure, deletion boundaries, and best-effort unload protection. Course duration labels now explicitly say approximately/estimated.

## Checks performed for the update guard

`npm run typecheck` passed. `npx vitest run tests/unit/offline-status.test.tsx tests/unit/course-lifecycle.test.tsx` passed **4 tests in 2 files**. These cover waiting-worker activation blocked/unblocked, normal persisted edits, quota-failed input retained with unload warning, successful retry clearing the warning, and a detected external-change warning cleared by reload. These focused checks do not replace the final browser/full-suite validation or establish real two-version deployment success.

## Reviewed boundaries retained

- Course progress remains separate from original `LearningSession` storage and never calls an account/model endpoint.
- Course rendering uses React text, not user HTML. External source anchors use `noreferrer`.
- Service-worker fetch handling excludes API, cross-origin and non-GET requests and uses a build-generated public allowlist. Hash routes remain on the same cached shell. Activation deletes older public cache generations, not local-storage answers.
- Existing optional backend retains exact origin checks on writes, authenticated record ownership, server-only secrets, same-origin CSP and disabled-by-default AI services. No real OAuth/provider/production database verification was performed in this audit.
- Repository CI uses read-only repository permission and deterministic fixture evaluation; no automatic release/deploy workflow was observed in the audited tree. Final packaging behavior must be checked against its own new tooling.

## Known limits, not silently closed

1. The local-storage snapshot check rejects already-observed conflicting raw records, including delayed storage events; `getItem` plus `setItem` is not atomic. Truly simultaneous writers can still race. Use one editing tab; a stronger cross-tab transaction would be a separate change.
2. Browser data eviction, process termination and crashes can bypass unload warnings. Export is a plain JSON backup containing learner-authored text; it is not encrypted and the new course has no import UI.
3. Course completion is evidence of recorded practice and corrected fixed checks, not verified reasoning quality or teaching effectiveness. Time estimates are not measured durations.
4. Two-version upgrade smoke subsequently passed in Chromium and WebKit using old committed build 787282a and the candidate: new cache activated, stored course and legacy records preserved, server shutdown followed by offline refresh and English navigation succeeded. See the separate packaging record; this is not physical-device or arbitrary hosting-server validation.
5. Historical WebKit intermittency and real OAuth/provider/voice acceptance remain distinct from current passing checks. Public deployment prerequisites in deployment/backup documentation still apply.
