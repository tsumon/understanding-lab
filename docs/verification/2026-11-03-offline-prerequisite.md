# Cold offline-installation test prerequisite — 2026-11-03

The first stable-release merge `a93edc4` did not publish: run 41550099037 passed 136 browser cases with 13 original skips, but the first-time course-cache check on iPhone WebKit could not find the cache-ready text within its 5-second assertion budget. The test failed after server availability/navigation, before origin shutdown or offline reload. The workflow correctly skipped packaging/publication. The failing run did not retain worker/cache state, so its unique root cause cannot be established retrospectively.

## Evidence, not an invented component bug

- A single unchanged, exact local iPhone WebKit test run passed in 3.4 seconds, with trace retained. This is not proof the CI failure was harmless or permanently fixed.
- Read-only review found no demonstrated lost-controllerchange race: the component's controller check and listener registration execute in the same JavaScript task, and the message listener is registered before the worker.
- A bounded controlled experiment held the real public experiment JSON response while a fresh WebKit service worker installed. The original 5-second UI assertion failed with `controller=null`, `active=null`, worker `installing`, an empty public cache and the honest “cache not confirmed” UI. No product timer or assertion budget was changed.
- Releasing that response allowed the actual platform ready event at 5123ms, controllerchange at 5123ms, and CACHE_READY acknowledgement at 5129ms. The unchanged UI assertion then passed; all 8 expected public cache entries existed, and after shutting down the actual server the 12-chapter catalog reloaded offline.
- This demonstrates an omitted asynchronous installation prerequisite and is consistent with the CI symptom; it does **not** prove the unrecorded CI worker was in the same state.

## Narrow correction

The E2E test now awaits the browser's real `navigator.serviceWorker.ready` promise within the existing 30-second whole-case budget before applying the existing 5-second cache-ready UI assertion. It still requires the app's acknowledgement of complete caching; worker activation alone does not pass. All origin-unavailability, actual offline reload, saved text, catalog count, second chapter and language persistence assertions remain unchanged. No sleeps, retries, budget increases or production-component changes were added.

Two deterministic unit cases now cover ready-before-controller and controller-before-ready. Both require CHECK_CACHE and verify the UI remains unconfirmed until CACHE_READY is received. The focused unit file passes 4/4 cases. The corrected exact iPhone WebKit case passed in 2.5 seconds, retaining its complete offline flow.

## Failure evidence preservation

The test records bounded phase timings, worker/controller states, public cache entry paths, public status text, page errors and failed-request paths in `offline-cache-diagnostic.json` on failure. It does not capture learner answers, query strings, network bodies, cookies or credentials. Each diagnostic snapshot is capped at one second, independently of product readiness. Capture errors cannot replace the original assertion error or bypass server cleanup. The CI failure artifact also retains the corresponding error context.

A temporary diagnostic-only copy deliberately expected a nonexistent synthetic UI marker. It failed as intended and produced the JSON with document-load state, actual ready timing, activated worker and all 8 cached paths. The temporary test was removed; this intentional failure is not reported as an application failure or passing acceptance test.

Official pinned WebKit 2248 was installed in the new cloud environment. Missing runtime libraries were downloaded from signed Debian trixie package indexes and extracted under `/tmp`, without system installation or permission changes. Library loading and actual headless startup were verified; the documented local host-validation workaround remains distinct from normal CI dependencies. Production JavaScript and offline cache remain unchanged (`understanding-lab-public-bbd97e6a052ba605`). Final complete CI on the corrected merge remains the publication gate.
