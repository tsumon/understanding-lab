# Bilingual Product and Public Repository Design

Date: 2026-10-01. Baseline: `1a8ed98` on `codex/understanding-lab-mvp`.

Status: the user approved the scope and continued after reviewing this written-design checkpoint on 2026-10-01. Implementation planning/execution is authorized. One read-only Astra architecture pass informed the compatibility decisions below. This document is the implementation contract, not evidence that the feature or public-release checks are complete.

## 1. Outcome and scope

Make Understanding Lab usable in English and Simplified Chinese, and present the repository as a user-facing software project. The first overfitting lesson remains the only lesson. Existing learner text, history, citations, experiment results, and account synchronization must survive the change.

Deliverables:

- One visible English / 简体中文 selector covering application labels, questions, lesson material, experiment descriptions, accessibility text, errors, and the requested language of future AI feedback.
- An English `README.md`, matching `README.zh-CN.md`, and real desktop/mobile screenshots with synthetic learning text.
- A product-oriented README without the Reminder comparison, task numbers, agent handoff narrative, or the current long internal-document directory.
- MIT licensing for the project's original work, clearly separated third-party notices, and a checked transition of the existing GitHub repository to public visibility.

Not included: another lesson, arbitrary translation, translating historical answers or model prose, a general localization framework, new runtime dependencies, a native app, a public hosted service, npm publication, real OAuth provisioning, paid model evaluation, or learner recruitment. Public source availability is not a declaration of production or pedagogical readiness.

## 2. Chosen approach

Three approaches were considered:

1. Translate UI labels only: small, but insufficient. Current question and citation resolution use a single Chinese topic, so changing material without recording its language would reinterpret history.
2. Optional language provenance alongside the existing schema: selected. This supports full bilingual rendering and historical evidence while preserving existing payloads and save identities.
3. Eager schema-version migration: not selected. Rewriting stored sessions just to add language defaults risks changing pending-save hashes, retries, and frozen evaluation inputs.

Keep `schemaVersion: 1`, the current storage namespaces, `topicVersion: "overfitting.v1"`, experiment pack version, paragraph/question IDs, answer IDs, and `tutor:<feedbackId>` identities. New metadata is optional at compatibility boundaries; missing metadata means legacy Chinese through resolver functions, not parse-time defaults or a storage migration.

## 3. Language preference and application behavior

Define `Locale = "en" | "zh-CN"` and a strict validator in a small shared domain module. The single visible selector controls both presentation language and the language of the next learning/AI interaction. These current choices remain distinct from immutable language metadata on historical records; a second settings control is unnecessary.

The preference is a local browser setting outside `LearningSession` and `DraftEnvelope`. First use selects the first supported browser language (`zh*` maps to `zh-CN`, `en*` to `en`), falling back to English. An explicit saved selection takes precedence. Unsupported/corrupt settings fall back safely; unavailable storage still permits an in-memory selection. Existing browser tests pin their intended locale rather than inheriting host preferences.

Switching language:

- Updates UI copy, current static questions/material, `document.documentElement.lang`, and page title.
- Does not remount the app, clear drafts, change user text/notes/disagreements, reset experiments or clarification position, or change consent.
- Does not increment `contentRevision`, rewrite stored history, regenerate pending-save keys, or trigger a cloud save by itself.
- Does not automatically request a model, translate feedback, or retry an operation.

Use small typed dictionaries with identical keys and interpolation signatures. Localize user-facing deterministic errors through known codes/catalogs, not raw provider messages or another model. Cover startup/error boundaries, recorder messages, offline status, account/sync states, feedback, summary, diagram labels, and accessible names. Protocol identifiers and recovery sentinels stay unchanged; only their visible labels are localized. The install manifest may use the language-neutral product brand, Understanding Lab.

## 4. Lesson and historical provenance

Keep the existing Chinese topic file immutable. Add an English edition with the same four paragraph IDs, six question IDs, source links, and scientific scope. Bundle a validated registry keyed by `(topicVersion, locale)`; neither the model nor client submissions may supply replacement lesson text.

Add these optional fields, without `.default()` insertion on parse:

```ts
type AnswerLanguage = { questionLocale?: Locale };
type FeedbackLanguage = { evidenceLocale?: Locale; responseLocale?: Locale };
```

`Answer` receives `questionLocale`. `StoredFeedback` receives `evidenceLocale` and `responseLocale`. These describe the question/material/requested response language, not a guess about the language of the learner's writing.

Provide explicit resolution paths:

- `topicFor(version, locale)` returns the known edition or rejects it.
- `questionFor(session, id, locale = "zh-CN")` resolves a current static question. Tutor-generated questions always return the stored model question verbatim.
- `questionForAnswer(session, answer)` resolves historical static wording using `answer.questionLocale ?? "zh-CN"`.
- New static answer revisions stamp the language actually displayed. For a tutor-generated question, provenance follows its stored response language, not the current interface selection. Locale does not change answer identity or reset revision numbering.

Summary/history uses the historical resolver. Current editable static prompts may show the chosen edition; reconfirming creates a normal new answer revision. Original answer text, quote text, UTF-16 offsets, notes, disagreements, and stored model prose are never translated.

Feedback source rendering and server-side historical validation use `feedback.evidenceLocale ?? "zh-CN"`, never the current UI locale. The existing `sources[{topicVersion, paragraphId}]` wire shape can remain: all citations in one response refer to the single edition provided for that request. A concise original-language indicator explains mixed-language history. Missing editions/IDs fail validation; no silent fallback from an explicit unknown edition.

Published topic editions are immutable. Later substantive teaching changes require a separate content-version decision. The English edition has a separate translation-review record; it cannot inherit the Chinese review status or claim a human review. The Chinese source-check history and approval record remain unchanged.

## 5. AI request and response boundary

Add optional `locale?: Locale` to the strict `/api/tutor` request. Omission preserves the legacy Chinese behavior. Capture the selected language once when the learner invokes Send, before asynchronous authentication/preparation. The server selects the matching known lesson edition and passes evidence/response language into `TutorContext`.

Prompt requirements:

- Feedback prose and the next question use the requested language; direct quotes copy the learner's exact text without translation.
- Answer evidence includes the correctly resolved original question wording, including stored tutor questions.
- Existing source, number, action, privacy, attempt-limit, and timeout constraints are unchanged.
- Bump `PROMPT_VERSION` because the instruction contract changes. Existing Chinese evaluation evidence cannot certify the new bilingual prompt.

Successful responses carry server-selected `evidenceLocale` and `responseLocale`, which are copied into stored feedback. They are not trusted as model-generated metadata. The client validates them against the captured request; missing legacy metadata may only resolve to Chinese, never silently certify an English request. Deterministic unavailable/error messages use the appropriate locale.

Request hashing includes an explicitly supplied locale. A legacy request with no locale keeps the old hash shape; do not normalize an omitted value into the hashed payload. The server's ordinary ownership, quota, consent, and origin checks remain intact.

If the language changes while an AI request is in flight, let the existing request complete in its captured language. Show a brief indication that it uses the previous selection. Accept it only if the existing content/session/navigation guard still matches. A language-only switch does not abort, spend another call, or rewrite the returned feedback. Changing answers, navigation, or account identity retains the existing stale-response protections.

## 6. Storage, synchronization, and offline compatibility

Extend existing strict schemas with optional fields. Reading legacy drafts, cloud sessions, conflict copies, and exports must preserve the absence of metadata. Do not change `PendingSave`, its key/hash, binding owner/revision, or the session JSON merely by loading or selecting another language. Genuine new answer/feedback records can carry new fields and participate in normal saves.

Keep the existing recovered-feedback model/prompt markers. Server normalization must retain the new locale metadata and original prose. No database schema migration is required for optional JSON payload fields.

Static-import both dictionaries and topic editions into the normal bundle. The existing public-resource service worker caches the generated assets. Switching language after a successful offline install needs no translation service, account, network fetch, or model key. Neither locale preference nor private learning data belongs in the public cache.

## 7. README and presentation

Reference patterns actually read from the user's repositories:

- [reminder-app-ios](https://github.com/tsumon/reminder-app-ios): language navigation, hero, real screenshot rows, concise first-use instructions.
- [tenant-rag](https://github.com/tsumon/tenant-rag): English-first heading, concise value proposition, meaningful badges, features, and executable quickstart.
- [suite](https://github.com/tsumon/suite): coherent hero and product capabilities, with practical setup requirements.

Proposed structure: brand/value proposition → language links and real CI/license/platform badges → authentic desktop/mobile screenshots → key capabilities → learning workflow → quickstart → optional AI/account configuration → compact development/contributing section → known limitations and license.

Remove the Reminder comparison and the current prominent internal-document list. Keep internal records in the repository for continuity; link only concise user/developer documentation where it helps. English README is canonical, Chinese has equivalent capabilities and setup guidance. Do not claim unsupported users, metrics, hosted demo, app-store availability, stable release, or proven teaching outcomes. Explain configurable AI and current limitations briefly, without making the page an audit diary.

Use actual fresh anonymous browser sessions with synthetic examples for screenshots. Do not capture the user's current draft or account. No fabricated model responses. Original visual assets may support the layout, but do not redraw or imply a UI the application does not have.

## 8. Open-source preparation and authority

The user delegated the open-source decision and approved making this existing repository public after checks. Source release remains separate from deploying a live service or buying/calling models.

- Add MIT for original project work, with copyright attributed to `tsumon`, and the matching package license field. Keep `package.json`'s `private: true`; GitHub visibility does not authorize npm publishing.
- Add third-party notices distinguishing dependencies, referenced teaching sources, and any copied/adapted material. The installed `ffmpeg-static` package declares `GPL-3.0-or-later`; FFmpeg builds have their own distribution terms. Do not describe them as relicensed under MIT or upload dependency binaries. Any future binary distribution requires its own compliance check.
- Read the actual license files where metadata is absent or ambiguous. For example, busboy declares MIT through its legacy `licenses` array and included license, not a singular `license` field.
- Check every remote branch/tag, reachable commit/file history, author metadata, available Actions logs and artifacts, current tracked assets, and public-facing links for confidential data or credentials. Earlier local history scanning is evidence to reuse, not a substitute for new edits and remote-log review. The initial inventory contained 19 Actions runs and no artifacts; refresh the inventory at release.
- Confirm suspected scanner hits without printing raw secrets. Test fake credentials must be explicitly classified; never equate a regex scan with a full security guarantee.
- If a real credential, personal data requiring a decision, or uncertain third-party rights is found, retain private visibility and request the specific necessary action. No automatic credential rotation, history rewriting, force push, or log deletion.
- After implementation, review, final checks, and private backup, change visibility once, verify it independently, and report the public URL. Do not claim that reverting to private retracts existing copies.

Primary references: [MIT license](https://choosealicense.com/licenses/mit/), [GitHub visibility effects](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility), and [FFmpeg static-build sources](https://github.com/eugeneware/ffmpeg-static/blob/master/README.md). These guide the source-release check, not a blanket legal certification of binary distributions.

## 9. Verification and completion criteria

Focused regression requirements:

1. Legacy session/draft/cloud/conflict parsing preserves optional-field absence, original JSON meaning, pending save key/hash, and server revision.
2. Switching language preserves text, notes, session state/revision, experiment selection, and consent; preference survives refresh and blocked storage does not crash.
3. Both editions have the same canonical IDs; static question revisions recover their original wording; tutor questions remain verbatim across UI switches.
4. Chinese historical feedback still resolves Chinese evidence in English UI; English feedback is validated against the English edition; unsupported locale/edition metadata is rejected.
5. In-flight switching sends once and retains captured response metadata; stale-content/navigation/account responses remain rejected.
6. Omitted-locale request hashing retains legacy semantics; explicitly different locales cannot share one effective request identity.
7. Offline cached English/Chinese flows, document language, accessible names, keyboard selector, mobile layout, and a summary are exercised using synthetic data.
8. Locale dictionary completeness and key parity are checked; untranslated user-facing copy is audited without treating code/protocol strings as UI.
9. Frozen Chinese acceptance files/hash and existing human-release gates remain unchanged. Separate English/mixed-language synthetic tests prove wiring and verification only, not human teaching-quality approval.
10. Final typecheck, unit/integration suite, offline build, and bounded three-browser regression run on the integrated state. Preserve the unresolved WebKit defect and capture actual failures; no weaker assertions, retries, or repeated probabilistic loops to manufacture a green result.
11. README image/link/command checks and actual desktop/mobile previews pass. License and release checks are recorded before changing visibility.

No new real-model, real-OAuth, human-review, or production-ready claim is made by passing these tests. Real provider and human gates remain separate.

## 10. Execution boundaries and quota discipline

After this written design is approved, use writing-plans to define the implementation tasks and exact interfaces before editing code. Candidate reviewable units are: shared locale/provenance/content compatibility; client/server bilingual integration; and README/assets/source-release preparation. Do not turn translation into a second broad product redesign.

Use Luna for bounded copy/dictionary work after contracts are fixed, Sol for integration and tests, and reuse this Astra architecture pass unless a materially new architectural issue appears. Give agents non-overlapping file ownership and a compact brief. No competing writers in `App.tsx` or shared contracts. One consolidated review per meaningful checkpoint; targeted red/green tests followed by one integrated verification, not repeated full suites from every agent.

Preserve unrelated user edits. Keep regular checked commits and private pushes with exact remote-SHA verification. Update the durable handoff with actual completed/pending work, but keep that development narrative out of the product README.
