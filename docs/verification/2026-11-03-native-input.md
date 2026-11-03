# Native answer-input robustness — 2026-11-03

Merged CI run 41553128217 (`b1409e5`) passed the corrected offline-cache case but failed the existing iPhone WebKit fast-refresh case: the earlier-step draft was empty. Publication correctly did not run. Its bounded diagnostic artifact had no dropped events: after the second load, the capture listener saw the intended answer at 164ms, but no draft write followed. At the experiment click (521ms), both DOM and storage were empty. This evidence does **not** support a successful new write being overwritten by a later autosave; the input did not reach the successful synchronous persistence path.

A single unchanged local case passed, as did one instrumented case and a finite 20-case diagnostic sample (36.9s, stop-on-first-failure configured). Normal trusted input had an empty prior React value tracker and a persisted value by document bubbling. These passing samples do not establish the unique cause of the CI failure. No further sampling or blind CI rerun was used to claim a fix.

## Bounded compatibility improvement

React's change-event extraction filters values already equal to its DOM value tracker. A controlled real-WebKit test used the standard DOM `textarea.value` setter and dispatched a bubbling `InputEvent`; without modifying React internals, it demonstrated visible desired text with an empty stored draft. This is **programmatic/assisted insertion**, not proof of how the failed trusted CI input behaved.

The affected legacy answer textarea now consumes standard `onInput` directly and synchronously persists `currentTarget.value` through the existing draft path. There is only one input handler, not duplicate onInput/onChange writes. It does not confirm an answer or change revisions, navigation, storage format, account behavior or provider calls. Over-4000-codepoint input explicitly restores the accepted DOM value, including the programmatic path where React change-event restoration may not run. Existing synchronous and passive persistence behavior otherwise remains unchanged.

Tests retain the original fast-refresh assertions and add:
- Programmatic native input, unconfirmed status and remount/reload persistence.
- Simulated composition start/intermediate/final input, paste, deletion and undo; these are synthetic event compatibility checks, not a physical Chinese keyboard or clipboard certification.
- Unicode 4000-codepoint acceptance and 4001 rejection without DOM/storage divergence.
- Actual browser fill, keyboard typing and multiline insertion, followed by reload.

Focused units: 19/19 across three files. Typecheck/offline build pass. Focused iPhone WebKit: original fast-refresh plus two new cases, 3/3 passed. Enhanced bounded failure diagnostics record trusted/bubbling flags, input type, connected state, read-only tracker value and post-bubble storage state using the existing synthetic text allowlist. No learner content is collected. Full CI on the final merged commit remains the publication gate. This is input-handling robustness, **not a claim that the unique historical WebKit failure mechanism has been proven**.

The final serial local unit sweep recorded 375 passed / 2 failed out of 377. Both failures were the real-browser diagnostic harness: the fresh cloud environment lacked the pinned Chromium executable, so those cases failed before exercising their assertions. The official Playwright CDN installer returned a truncated/invalid ZIP. The same pinned Chrome Headless Shell 145.0.7632.6 was then downloaded from Google's official Chrome-for-Testing storage, verified against its published response MD5, and extracted locally. The affected diagnostic file then passed all 3 cases, including timeout-attachment and trace-redaction checks. This is reported as full sweep plus targeted environment correction, not an invented all-green full rerun; final CI remains authoritative.
