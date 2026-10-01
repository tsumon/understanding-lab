# Bilingual Product and Public Repository Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver full English/Simplified Chinese use, an English-first product README with real screenshots, and a checked public source release.

**Architecture:** Keep the current schema/storage identities and add optional record-language provenance. Static locale dictionaries and a topic registry support the existing app and server without a translation service. Historical answers, feedback, evidence and pending saves remain unchanged by presentation preferences.

**Tech Stack:** Existing React/TypeScript/Zod/Vite, Node/Express/SQLite, Vitest/Playwright; no new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-01-bilingual-public-release-design.md`

## Global Constraints

- Keep `schemaVersion: 1`, the current storage namespaces, `topicVersion: "overfitting.v1"`, experiment pack version, paragraph/question IDs, answer IDs, and `tutor:<feedbackId>` identities.
- New metadata is optional at compatibility boundaries; missing metadata means legacy Chinese through resolver functions, not parse-time defaults or a storage migration.
- Original answer text, quote text, UTF-16 offsets, notes, disagreements, and stored model prose are never translated.
- No new runtime dependencies, paid model calls, OAuth provisioning, public deployment, npm publication, history rewriting, force push, or log deletion.
- Frozen Chinese acceptance files/hash and existing human-release gates remain unchanged.
- Keep the existing recovered-feedback model/prompt markers. Server normalization must retain the new locale metadata and original prose.
- A language-only switch does not abort, spend another call, or rewrite the returned feedback. Changing answers, navigation, or account identity retains the existing stale-response protections.
- Screenshots use fresh anonymous browser contexts and synthetic text, never the user's browser draft/account. Do not stop the user's port 4175 preview.
- Existing WebKit latest-revision intermittent failure remains unresolved until causal evidence proves a fix. No retries, weaker assertions, skips, or high-count loops to get a green result.
- Keep `package.json`'s `private: true`; GitHub visibility does not authorize npm publishing.
- Workers use apply_patch, focused TDD, exact-file commits after verification, no subagents or pushes. Controller owns review gates, private backup, and final visibility change.

## File and ownership map

Task 1 owns only the English lesson/review and their data validation test. Task 2 owns locale types, topic resolution, optional contracts, historical server validation and AI boundaries. Task 3 consumes those interfaces and owns all visible client localization, preference handling, and browser tests. Task 4 owns README/license/public developer documentation and publication assets. Controller owns this plan/spec, handoff/verification, security inventory, final screenshot capture if browser tools require the root, and repository visibility. Only one implementation worker runs at a time.

### Task 1: English lesson edition (Luna)

**Files:** Create `content/overfitting.v1.en.json`, `content/review.en.json`, `tests/unit/english-content.test.ts`. Read existing Chinese edition and `src/domain/contracts.ts`. Do not edit the Chinese files or other code.

**Interfaces:** The English file passes existing `TopicSchema` without a new topic version. Translation status is separate from the Chinese approval record. Task 2 statically imports this edition; Task 3 uses the English review record for its material-status label.

- [ ] **Step 1: Write a failing test for a missing/malformed English edition.** Use a real file assertion before parsing; the first failure must be the missing edition, not an unresolved import.

```ts
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TopicSchema } from "../../src/domain/contracts";
describe("English course edition", () => {
  it("provides all stable paragraph and question identities without inheriting approval", () => {
    const file = new URL("../../content/overfitting.v1.en.json", import.meta.url);
    expect(existsSync(file)).toBe(true);
    const topic = TopicSchema.parse(JSON.parse(readFileSync(file, "utf8")));
    expect(topic.paragraphs.map(p => p.id)).toEqual(["p-splits", "p-fit", "p-context", "p-evidence"]);
    expect(topic.questions.map(q => q.id)).toEqual(["explain-1", "clarify-1", "clarify-2", "predict-1", "reexplain-1", "transfer-1"]);
    expect(new Set(topic.paragraphs.map(p => p.id)).size).toBe(4);
    const review = JSON.parse(readFileSync(new URL("../../content/review.en.json", import.meta.url), "utf8"));
    expect(review).toMatchObject({ locale: "en", status: "pending", humanReview: "not-run" });
  });
});
```

- [ ] **Step 2: Run RED.** `npx vitest run tests/unit/english-content.test.ts`. Record the failed existence assertion.
- [ ] **Step 3: Create the edition with these exact texts and the corresponding existing source URLs.** Preserve current ordering, IDs, and `version: "overfitting.v1"`.

```json
{
  "version": "overfitting.v1",
  "title": "Why low training error does not guarantee better performance",
  "paragraphs": [
    {"id":"p-splits","text":"The training set is used to fit parameters, and the validation set is used to choose a configuration. Use the final test set after selection is complete; repeatedly adjusting a model based on test results brings test information into the selection process.","source":"https://scikit-learn.org/stable/modules/cross_validation.html"},
    {"id":"p-fit","text":"A model may learn patterns, or it may follow noise in the sample. A better fit to the training data does not guarantee better performance on unseen data.","source":"https://scikit-learn.org/stable/auto_examples/model_selection/plot_underfitting_overfitting.html"},
    {"id":"p-context","text":"Model complexity, sample size, noise, and the data split all affect the results you observe. A degree that performs better in one experiment is not a rule that applies to every dataset.","source":"https://scikit-learn.org/stable/auto_examples/model_selection/plot_underfitting_overfitting.html"},
    {"id":"p-evidence","text":"This experiment shows mean squared error on specific synthetic data. Changing parameters provides observations; explanations and transfer answers provide additional evidence of understanding.","source":"internal:learning-design-v1"}
  ],
  "questions": [
    {"id":"explain-1","text":"How would you explain very low training error but poor performance on new data?"},
    {"id":"clarify-1","text":"When you say performance, do you mean training data or data not used for fitting?"},
    {"id":"clarify-2","text":"How could you distinguish learning a pattern from following noise?"},
    {"id":"predict-1","text":"With the sample and noise held constant, how might training and validation error change as the degree increases?"},
    {"id":"reexplain-1","text":"Use your observations to explain the relationship between training error and generalization again."},
    {"id":"transfer-1","text":"If you repeatedly choose the best configuration using the same test set, is that result still independent evidence of generalization? Why?"}
  ]
}
```

`review.en.json` contains version, locale `en`, status `pending`, humanReview `not-run`, and a method sentence identifying an agent-authored translation rather than an approved human review. Do not copy `approved` or fabricate a reviewer/date.

- [ ] **Step 4: Verify GREEN and unchanged Chinese data.** Run the new test, existing `tests/unit/content.test.ts`, and `npm run typecheck`; verify `git diff -- content/overfitting.v1.json content/review.json eval reviews` is empty. Human prose receives no artificial source-grep test.
- [ ] **Step 5: Self-review and commit only the three files.** Report RED/GREEN output and any translation ambiguity. Subject: `feat: add English overfitting lesson edition`.

### Task 2: Locale provenance, historical resolution, and AI boundary (Sol)

**Files:** Create `src/domain/locale.ts`, `src/content/topics.ts`, `tests/unit/locale-history.test.ts`. Modify `src/domain/contracts.ts`, `src/domain/session.ts`, `src/server/sessions.ts`, `src/server/ai-routes.ts`, `src/tutor/verify.ts`, `src/tutor/prompt.ts`, `src/tutor/service.ts`, `src/client/ai-client.ts`; extend relevant unit/integration tests. Do not change visible App/panels, README, dependencies, database migrations, or frozen eval data.

**Consumes:** Task 1 English edition and existing `TopicSchema`, session/answer/feedback contracts.

**Produces:** These shared functions, preserving existing default behavior:

```ts
export const LocaleSchema = z.enum(["en", "zh-CN"]);
export type Locale = z.infer<typeof LocaleSchema>;
export const legacyLocale = (locale: Locale | undefined): Locale => locale ?? "zh-CN";
// src/content/topics.ts
export function topicFor(version: string, locale: Locale): Topic;
// src/domain/session.ts
export function questionFor(session: LearningSession, id: string, locale?: Locale): string;
export function questionForAnswer(session: LearningSession, answer: Answer): string;
export function questionLocaleFor(session: LearningSession, id: string, locale?: Locale): Locale;
```

`Answer.questionLocale?: Locale`, `StoredFeedback.evidenceLocale?: Locale`, `StoredFeedback.responseLocale?: Locale`; schema fields are `.optional()`, without defaults. `questionLocaleFor` returns the supplied/default locale for static questions, and the referenced feedback's response locale (missing=>Chinese) for tutor questions. Validate unknown question identities normally. Historical answer/question locale is never an answer-identity discriminator.

`TutorContext` gains optional evidence/response locale for compatibility, absent=>Chinese; route callers supply both explicitly. Successful `TutorResult` permits the two optional fields to read legacy fixtures but newly generated successful results include server-selected metadata. `PostTutorInput.locale?: Locale` captures a constant request locale; explicit English requires exact English success metadata, while missing legacy metadata is accepted only for a Chinese request. A mismatching or unknown explicit metadata value gives the existing invalid-output outcome.

- [ ] **Step 1: RED for provenance and original wording, using real reducers/schema/repository.** Include absence-preserving parsing and English history independent of default Chinese UI. Example contract assertions (fill the fixture by existing `newSession` + `transition`):

```ts
const old = newSession("legacy");
expect(JSON.stringify(SessionSchema.parse(old))).toBe(JSON.stringify(old));
const answer = { id: "a", revision: 1, step: "explain" as const,
  questionId: "explain-1", questionLocale: "en" as const,
  text: "It may have fitted noise.", confirmedAt: "2026-10-01T00:00:00.000Z" };
const saved = transition(old, { type: "confirm", answer });
expect(questionForAnswer(saved, saved.answers[0])).toBe("How would you explain very low training error but poor performance on new data?");
expect(saved.answers[0].text).toBe("It may have fitted noise.");
expect(SessionSchema.safeParse({ ...saved, answers: [{ ...answer, questionLocale: "fr" }] }).success).toBe(false);
```

Add real envelope/conflict roundtrips with known pending key/hash, and repository save/load/retry assertions: old hash identity remains stable; new metadata survives recovered-feedback normalization. Reuse test fixtures for database setup, not alternate implementations.

- [ ] **Step 2: Implement locale registry/optional fields/resolvers.** Registry statically imports both editions; version and locale fail closed. Existing `questionFor` signature's omitted locale remains Chinese. Tutor questions remain stored prose. Server validation chooses each feedback's edition before `verifyHistoricalTutor`; it does not use a singleton current-language topic. Extend verifier context validation so explicit locale/topic mismatch cannot silently pass simply because canonical IDs match; accept separately parsed but identical registered editions without relying on object identity.
- [ ] **Step 3: RED for English and mixed-language AI behavior.** In `ai-routes.test.ts`, send locale `en` through the actual mounted route with a synthetic provider, inspect captured prompt data for English lesson text and original Chinese historical question wording, assert returned metadata `en/en` and verbatim quoted answer. Assert invalid locale is rejected before provider use; explicit-locale changes collide correctly under reused request ID; missing-locale legacy hash still replays as before. In `ai-client.test.ts`, delay the HTTP response, change an external language selection, then assert one request whose captured locale and accepted result remain English; retain stale-content guard coverage. Reject English success lacking/mismatching locale metadata.
- [ ] **Step 4: Implement request/prose localization without changing safety limits.** Add optional validated body locale. Select topic server-side; hash `{session, includeNotes, ...(locale === undefined ? {} : {locale})}`. Add resolved historical `question` text to each prompt answer. Use `overfitting-tutor-v2` as new prompt version. Select Chinese/English instructions and deterministic fallback prose, keeping quote/no-number/no-tool/privacy rules semantically identical. Client HTTP mappings select localized messages via an exported typed `tutorMessage(code, locale)` catalog colocated with shared locale messages; expose it for Task 3 or keep local to ai-client if no UI reuse is needed. No network/model calls for translation.
- [ ] **Step 5: Focused GREEN, then full unit/integration once.** Run locale/history, local-store, session, sessions, tutor-service/verify, ai-client, ai-routes/provider tests; then `npm test`, `npm run typecheck`, `npm run eval:check`, and diff checks. Do not run browsers in this task. Record any unchanged suite warnings.
- [ ] **Step 6: Self-review, exact-file commit, report interfaces.** Subject `feat: preserve language provenance across lessons and AI`. Give Task 3 the exact signatures and location of message catalogs. Parent performs a scoped review before UI integration.

### Task 3: Complete bilingual interface and offline flow (Sol)

**Files:** Create `src/client/i18n.ts`, `src/client/LocaleProvider.tsx`, `tests/unit/i18n.test.ts`, `tests/unit/app-locale.test.tsx`, `tests/e2e/locale.spec.ts`. Modify `src/client/App.tsx`, `main.tsx`, `MaterialPanel.tsx`, `ExperimentPanel.tsx`, `FeedbackPanel.tsx`, `SummaryPanel.tsx`, `Recorder.tsx`, `recording.ts`, `OfflineStatus.tsx`, `ErrorBoundary.tsx`, minimal `styles.css`, `index.html`, `public/manifest.webmanifest`, intended-locale settings in `playwright.config.ts` and existing React/browser test setup. Add tests to existing appropriate files as needed. Small fixes to Task 2 interfaces require controller notice, not an unrelated refactor.

**Consumes:** Task 2 `Locale`, `topicFor`, `questionFor/ForAnswer/LocaleFor`, optional provenance fields, locale-aware `postTutor`, and server-selected result language.

**Produces:** One persistent selector and typed localized rendering without session migration.

```ts
export const LOCALE_STORAGE_KEY = "understanding-lab:ui-locale";
export function resolveLocale(saved: string | null, languages: readonly string[]): Locale;
export function readLocalePreference(): Locale;
export function saveLocalePreference(locale: Locale): void;
// Typed dictionary values may be strings or typed formatter functions.
export const messages: Record<Locale, Messages>;
export function LocaleProvider(props: { children: React.ReactNode }): React.ReactElement;
export function useLocale(): { locale: Locale; setLocale: (locale: Locale) => void; copy: Messages };
```

Provider supplies a compatibility default for separately rendered legacy test components; production startup always resolves browser preference. Do not let test defaults hide a production English selection. No `key={locale}` remount. Saved explicit preference wins; first supported navigator language otherwise, English fallback. Invalid stored values are ignored. All storage access is exception-safe.

- [ ] **Step 1: RED for real UI switching and storage.** Use actual App and native localStorage; only stub network/media boundaries. Start explicitly Chinese, type `my original draft`, switch by accessible selector to English, assert English navigation and unchanged textbox, snapshot/session/revision and pending-save identity. Refresh/re-render from saved storage and assert persisted English preference plus preserved draft. Include storage-get/set failures and unsupported browser languages. Assert no account-save/model HTTP request from switching alone.

```ts
expect(resolveLocale("zh-CN", ["en-US"])).toBe("zh-CN");
expect(resolveLocale(null, ["fr-FR", "en-GB"])).toBe("en");
expect(resolveLocale("garbled", ["zh-TW"])).toBe("zh-CN");
expect(resolveLocale(null, ["fr-FR"])).toBe("en");
// After user selects English in the mounted App:
expect(document.documentElement.lang).toBe("en");
expect(screen.getByRole("textbox", { name: "Your explanation" })).toHaveValue("my original draft");
```

Use matchers supported by the existing test environment (plain `.value` if jest-dom is not installed). Test dictionary key/interpolation coverage through real rendered messages and a type-level matching shape, not a giant exact-copy snapshot.

- [ ] **Step 2: Implement preferences and localized UI.** Extract all user-facing literals in the owned surfaces into Chinese/English dictionaries. Use an accessible selector labeled `Language / 语言` and autonym options `English`, `简体中文`. Replace module-level singleton topic with selected `topicFor` where current material is rendered. Summary uses `questionForAnswer`; feedback sources use each feedback's evidence edition and retain original prose. English material status comes from `review.en.json` (pending), not Chinese approval. New answer revisions stamp `questionLocaleFor`. Pass the captured locale into `postTutor`; copy returned metadata when recording feedback. While request is pending, a language switch displays its captured response language and does not invalidate/abort it. Existing input/navigation/account invalidation effects must not depend on UI locale.
- [ ] **Step 3: Cover remaining visible surfaces.** Include error-boundary/startup fallback, record/transcribe permission and duration messages, offline status, schema/action error mapping, source/metric labels, cloud conflict/export/delete messages, notes, feedback actions, chart accessible descriptions, and step labels. Never translate learner/provider prose, raw IDs, source URLs, file formats, or protocol sentinels. Preserve existing privacy and safety meaning. Use a scoped HTML language on original-language history when practical. Keep layout changes to selector placement and overflow fixes.
- [ ] **Step 4: Add deterministic English and bilingual browser flow.** A fresh context with `locale: "en-US"` completes a synthetic explain/skip/experiment/summary path, switches Chinese then English with retained text/experiment state, reloads preference, and verifies `html[lang]`. Add a focused offline cached-switch test using the existing origin-stop pattern where WebKit offline APIs are unsuitable. English flow gets desktop and mobile coverage; existing Chinese tests explicitly select `zh-CN` rather than rewriting assertions. Never use user port 4175 or screenshots of their session.
- [ ] **Step 5: Verify focused RED/GREEN, then integrated state once.** Run locale and changed component/client tests plus typecheck. Run `npm test`, `npm run build:offline`, `npm run eval:check`, then one complete `npm run test:e2e`. If a specific failure occurs, preserve evidence and diagnose it, rerunning only its covering test after a real change. No unchanged high-count reproduction loops.
- [ ] **Step 6: Self-review untranslated UI, commit, report.** Inspect remaining Han literals in owned source and classify protocol values vs missed visible copy; verify Chinese topic/review, experiment pack and frozen eval data unchanged. Subject `feat: add English and Chinese learning interface`. Record counts and actual command outcomes, including skips and known warnings, for parent review.

### Task 4: Product README, original-work license, and source-release package (Luna for copy; controller for browser/public checks)

**Files:** Rewrite `README.md`; create `README.zh-CN.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`, `docs/getting-started.md`, and `assets/readme/desktop-en.png`, `mobile-en.png`, `desktop-zh-CN.png` as real captured assets. Modify only license metadata in `package.json` and root package metadata in `package-lock.json`; preserve `private: true` and dependency resolutions. Controller owns `docs/handoff.md`, verification/release inventory and screenshots if direct browser tools are needed.

**Consumes:** Finished Task 3 behavior and verified screenshots supplied by controller; current scripts/config/actual test results. No future capability claims.

**Produces:** English-first project presentation, Chinese counterpart, clear license boundaries, and a documented release gate. The worker never changes GitHub visibility or configures external services.

- [ ] **Step 1: Inspect references and existing run instructions.** Use the previously read `tsumon/reminder-app-ios`, `tenant-rag`, `suite` README patterns: centered brand/value proposition, compact real badges, authentic screenshot rows, features, workflow, executable quickstart. Do not copy screenshots/assets from those repos. No prose-only unit tests.
- [ ] **Step 2: Capture source screenshots after bilingual verification.** Controller uses isolated anonymous browser sessions with synthetic examples at a test-owned local preview, captures English desktop/mobile plus Chinese desktop into the exact asset paths, and visually inspects each. Retain readable resolution and avoid blank/loading/error/personal-data states. Worker may wire image links only after files exist. No fake teaching response or fabricated release download button.
- [ ] **Step 3: Write both READMEs.** English headline `Understanding Lab`; tagline `Explain it. Test it. Understand it.` Language links `English · 简体中文`. Badge links use the actual CI workflow/branch and MIT file, not hardcoded inflated test counts. Cover local-first overfitting lesson, reproducible 324-configuration experiments, explicit AI/account actions, bilingual use and optional voice. Show the explain → predict → experiment → re-explain → transfer → reflect flow. Quickstart uses real clone/branch plus `npm ci` / `npm run dev`; Node requirement and native SQLite build caveat remain concise. A short optional-services section points to English getting-started configuration. One compact limitations paragraph distinguishes source availability from real-model/human/real-device acceptance and mentions the open WebKit issue. No Reminder comparison, internal task/agent narrative, or long audit/handoff list.
- [ ] **Step 4: Add original-work MIT and notices.** Use the complete unmodified MIT terms with `Copyright (c) 2026 tsumon`. Read official MIT text at `https://choosealicense.com/licenses/mit/`. Set root package license to `MIT` without changing dependency versions. Notices explain that dependencies keep their own licenses, cite teaching sources and self-generated numerical data, and explicitly identify the installed GPL-3.0-or-later `ffmpeg-static` test package and separately licensed FFmpeg binaries. Source release does not bundle or relicense them. Include relevant MIT/Apache/MPL attributions from installed packages; no blanket claim that every dependency is MIT. Stop for unresolved copied-source rights.
- [ ] **Step 5: Write concise contributor/setup instructions.** Describe deterministic test commands, no committed secrets/user records, synthetic test data, current runtime configuration, separate send/save consent, default-disabled AI and potentially billable startup probe, and FFmpeg deployment prerequisite. Link existing deeper Chinese deployment/privacy docs with their language explicitly marked if not translated. Do not promise public hosted service, users, benchmark gains, human validation, or English teaching quality.
- [ ] **Step 6: Validate the package without re-running app suites.** Check all local Markdown links/images, inspect actual desktop/mobile screenshots, confirm commands exist and metadata/lock dependency diff is empty except root license. Run typecheck or lock validation only if metadata changes require it; record no code modifications. Parent performs one scoped document/license review with code functionality evidence from Task 3.
- [ ] **Step 7: Commit exact docs/assets/metadata.** Subject `docs: publish bilingual project presentation and license`. No push or visibility mutation by worker.

## Controller final gate and continuous execution

- Mark written design approved, reuse the established non-main project checkout, and record a clean baseline plus per-task ownership/preflight in this plan's ignored SDD ledger. No redundant dependency installation.
- Execute Tasks 1–4 in order, with scoped independent reviews and original-worker fixes. User has already chosen subagents/model economy and said continue; do not ask another execution-mode question.
- Perform a single overall review of this feature range (baseline `6a7d8be` to final code/docs), not the whole old 12-task project. Address concrete integration findings and verify affected code; preserve the audit trail.
- Reuse verified historical findings, then scan new commits and all remote-reachable history/refs plus every available Actions log/artifact. Initial inventory was 19 runs/no artifacts; refresh at release and include new runs. Mask raw hits; classify synthetic credentials, run IDs, numeric fixtures, local paths, and author metadata. Confirm questionable findings before publication. No secret rotation/history rewrite/deletion without new authority.
- Use authenticated private backup and exact local/remote SHA matching at stable checkpoints. For final public change, require a clean tracked tree, passing integrated checks/new CI, reviewed artifacts/license notices, and no unresolved sensitive-content finding. Confirm current remote target and `isPrivate` immediately before the one visibility change. Check the repository independently afterward.
- If evidence requires unavailable authority or exposes real sensitive data, keep the repo private, preserve work, and ask precisely for the needed decision. Otherwise finish the authorized public source release without a new scope-confirmation loop. Do not deploy a website or invoke paid APIs.
- Final response distinguishes delivered bilingual functionality, README/license/source URL, exact tests and private/public status from still-unverified model/human/production gates. Maintain a durable handoff for quota recovery; never use a clean test run to close the historical WebKit race without evidence.
