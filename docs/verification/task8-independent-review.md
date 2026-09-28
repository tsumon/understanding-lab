# Task 8 independent review

Reviewed commits `40d42ba` (feat: add owner-scoped revisioned learning sync) and `e84cde7` (fix: reuse in-flight session id and idempotency key on retry) on `codex/understanding-lab-mvp` at HEAD `e84cde74845bf7c0b8a573d28635fd5003b119f1`. Read-only review of the Task 8 plan, R3/R12, and the listed server/client/test files. Focused Vitest files: 7 files, 60/60 passing. This document does not mark Task 8 complete.

## Summary

Owner-scoped CAS, tombstones, idempotent PUT, and the conflict UI match the Task 8 contract: expected-revision updates only, foreign IDs collapse to 404, deleted rows return 410 with no replay body, and recovered feedback is relabeled `本机恢复` / `local-recovery-v1`. The e84cde7 retry path reuses the in-flight UUID and idempotency key until a terminal response, so a timeout cannot mint a second cloud row. Origin and auth still run before any JSON parser; only `PUT /api/sessions/:id` uses the 2MiB limit.

## Checklist

| # | Item | Result | Evidence |
| --- | --- | --- | --- |
| 1 | Short-transaction CAS: expected revision only; no INSERT OR REPLACE; no last-write-wins | pass | `sessions.ts:138-166` uses `BEGIN IMMEDIATE`, `UPDATE … WHERE id=? AND owner_id=? AND revision=? AND deleted_at IS NULL`, and a plain `INSERT`; no `INSERT OR REPLACE`. Mismatch or `changes !== 1` is 409. `sessions.test.ts:119-129` two connections, one winner. |
| 2 | Cross-account isolation: get/list/save/export/delete all 404 for foreign IDs (not 403) | pass | `sessions.ts:107` foreign owner → 404 before 410. `sessions.test.ts:59-72` get/export/remove/save/list. HTTP: `session-routes.test.ts:64-67` bob GET/export/DELETE/PUT are 404. |
| 3 | Tombstone: owner-deleted returns 410; replay of old idempotency key cannot return learning body | pass | `sessions.ts:169-178` nulls payload, bumps revision, deletes `save_keys`. Owner GET/save after delete is 410 (`sessions.test.ts:104-117`, `session-routes.test.ts:68-70` including replay of `k1`). Foreign still 404. |
| 4 | Idempotent replay: same key+hash returns cached response; same key different body 409 | pass | Canonical SHA-256 of `{sessionId, baseRevision, payload}` (`sessions.ts:134,140-145`). Same key/body returns the first `SavedSession`; different notes/revision/id/claimed model → 409 (`sessions.test.ts:39-47,91-102`; HTTP retry `session-routes.test.ts:57-58`). |
| 5 | Conflict UI keeps full local DraftEnvelope; load-cloud is explicit; fork uses new UUID and baseRevision 0 | pass | `sync.ts:79-84` conflict returns the full `local` envelope. App does not overwrite on 409; banner + 导出 / 载入账号版本 / 另存为新尝试 (`App.tsx:184-188,264-271`). `forkAttempt` new id, `binding: null`, `autoSave: false` (`sync.ts:24-32`, `App.tsx:223-234`) so the next PUT is `baseRevision` 0. |
| 6 | Client refresh keeps conflict copy | pass | Separate `understanding-lab:v1:conflict:` key (`local-store.ts:59,99-116`); envelope writes do not clear it (`local-store.test.ts:47-57`). `app-sync.test.tsx:10-31` still shows the conflict heading after module reload. |
| 7 | Offline retry reuses pending UUID + idempotency key (e84cde7) | pass | `prepareSave` reuses `pending.id`/`pending.key` while hash matches; body change keeps the id and mints a new key (`sync.ts:40-56`, `sync.test.ts:55-80`). `App.tsx:162-172` persists `pendingSave` before fetch and only drops it on non-offline outcomes. |
| 8 | Identity never taken from request body ownerId | pass | Routes use `res.locals.user.id` (`session-routes.ts:11-13,47-68`). `saveBody` is only `{baseRevision, session}` (`session-routes.ts:6-8`). Extra `session.ownerId` is 400 (`session-routes.test.ts:73-75`; `sessions.test.ts:218`). |
| 9 | PUT JSON 2MiB only on session save; tutor/me stay 128kb; Origin/auth before parse | pass | Origin/auth middleware has no parser (`app.ts:37-46`). `/api/me` is `128kb` (`app.ts:49`; `auth.test.ts:44-55` 413 vs unauthenticated 401). Session `express.json({ limit: "2mb" })` is only on PUT (`session-routes.ts:40,66`; oversized 413 in `session-routes.test.ts:77-80`). Unmounted `POST /api/tutor` 200kb is 404, not 413 (`auth.test.ts:57-61`). |
| 10 | Recovered feedback labeled 本机恢复 / local-recovery-v1; cannot be treated as provider audit | pass | Save overwrites every `model`/`promptVersion` (`sessions.ts:135-137`; constants in `contracts.ts:42-43`). Stored/export body uses those labels (`sessions.test.ts:177-187`). UI: `FeedbackPanel.tsx:23-24` and conflict copy (`App.tsx:266`). |

## Issues

Verdict: ship
