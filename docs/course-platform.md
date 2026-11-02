# Local-first course platform

## Entry points

- `/` and `/#courses`: the bilingual 12-chapter catalog.
- `/#course/<chapter-id>`: a chapter with reading, prediction, a deterministic lab, transfer, knowledge checks, and reflection.
- `/#legacy`: the original overfitting learning loop. Its account, consent, draft and sync behavior remain separate from course progress.

Prerequisites are recommendations, not access restrictions. The UI uses the existing locale preference and design tokens. Course material and simulations are bundled into the offline build. The catalog mounts `OfflineStatus`; a learner does not have to open the original lesson to register the service worker. Source links still need a network connection.

## Evidence, not a mastery certificate

A chapter can be explicitly marked complete after a prediction, two distinct recorded laboratory configurations with different observed results, a transfer response, corrected knowledge checks, and reflection. Text fields require 20 non-whitespace-trimmed characters as an effort threshold only; they are not semantically graded. Rubrics and reference reasoning are provided for self-review. Predictions may be wrong. No model or human reviewer certifies the explanations.

Changing a response or lab configuration clears the completion timestamp until the learner confirms completion again. Completion indicators also recheck the current content requirements, rather than trusting a timestamp alone. Question IDs and answer IDs are shared between languages.

## Storage boundary

Course progress uses only `understanding-lab:course-progress:v1`:

```json
{
  "schemaVersion": 1,
  "lastChapter": "chapter-id",
  "chapters": {
    "chapter-id": {
      "prediction": "option-id",
      "experiment": {
        "config": {},
        "runs": [{"signature": "deterministic configuration", "summary": "observed result"}]
      },
      "transfer": "learner-authored text",
      "reflection": "learner-authored text",
      "answers": {"question-id": "option-id"},
      "updatedAt": "ISO timestamp",
      "completedAt": "optional ISO timestamp"
    }
  }
}
```

This is course metadata, not a replacement `LearningSession`. The original `understanding-lab:v1:*` session drafts are neither migrated nor erased. Existing unknown chapter entries and extra metadata survive ordinary updates. Unsupported versions and malformed records block writes and expose export of the original raw record. There is intentionally no automatic destructive migration.

Storage write failures keep the working record in React memory and expose retry/export. Closing the page before saving or exporting can still lose unsaved changes. A `storage` event from another tab pauses writes. Each write also compares the actual stored raw value with the last-read or last-successfully-written snapshot, protecting against delayed event delivery; on mismatch the incoming local edit remains in memory. This read-then-write guard is not atomic: truly simultaneous writers can still race. On a detected conflict, the learner can export the current in-memory version before loading the changed record. This detects ordinary stale-write conflicts; it is neither a transactional guarantee nor a cross-tab merge engine.

Reset requires an explicit confirmation and deletes only the course key. Exports are local JSON downloads; there is currently no import UI. Browser storage is neither encrypted nor a durable backup. No course progress is sent to an endpoint.

## Extension boundaries

- `src/course/types.ts` and `curriculum.ts`: bilingual authored content contract and ordered catalog.
- `src/course/experiments/`: bounded deterministic numerical/logic simulations and the uniform renderer.
- `src/course/progress.ts`: record validation and completion requirements.
- `src/course/CourseRoot.tsx`: routing, recovery and learning workflow.
- `src/course/course.css`: namespaced course UI styling; keep experiment selectors scoped to avoid changing the original lesson.

When changing the content contract, preserve existing learner writing and add migration tests before incrementing storage versions. Do not silently drop unknown records. When changing answer keys, completion must be rechecked against the new requirements. When adding remote functionality, do not infer consent from course completion or from existing account login.
