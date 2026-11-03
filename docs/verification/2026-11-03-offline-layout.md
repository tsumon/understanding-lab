# Stable offline-status layout — 2026-11-03

PR3 run 41555124137 failed the existing iPhone WebKit rapid-revision test after the Start click operation returned: the first answer field never appeared. The same commit's push run passed. The failed trace contained one load, no captured button click/input/write, and no dropped entries. Its final page remained at the start screen, with the Start button focused and the asynchronous cache-ready/update notification visible. This is not evidence of a received React click being ignored, and it is not a hydration application (the app uses createRoot).

## Controlled pointer reproduction

An actual iPhone WebKit pointer pressed the center of Start, then the real OfflineStatus component received controlled service-worker EventTarget notifications for cache readiness/update installation, then the pointer released at the same coordinates. The worker notifications were simulated; the pointer events, component render and CSS layout were real. Before the change, the button moved from y=507.70 to y=549.30 (+41.59px), leaving the held pointer at y=529.5 outside the button. The click was lost and the answer field did not appear. This proves a genuine layout-shift interaction defect consistent with the CI snapshot, but the original run did not capture pointer coordinates and cannot establish its unique internal timing retrospectively.

## Fix and acceptance

OfflineStatus now reserves the natural, localized wrapping size of both status messages in one grid cell and the update action in its own row. Inactive content is visibility:hidden and aria-hidden. The absent update action is also disabled and out of the tab order. No update is activated automatically; the existing unsaved-work guard remains. A blocked-update explanation reserves space while blocked, even before a waiting update is announced. There are no fixed text heights or clipped overflow, and no waits were added to the original rapid-revision test.

The regression holds a genuine pointer down while changing those notifications, requires unchanged Start geometry, releases it and verifies learning begins. All six iPhone WebKit combinations passed: Chinese/English × 320/390/1280px, with 200% root font size at320px and no status horizontal overflow. Seven focused unit cases passed across OfflineStatus/course lifecycle, including hidden-action accessibility and update blocking. Typecheck and production offline build passed. Intro pointer geometry is now included in the existing bounded synthetic diagnostic trace, without learner text.

Full CI on the updated PR and final merge remains the release prerequisite. No timeout extension, test retry or early readiness wait replaces the real interaction assertions.

After adding bounded intro-pointer diagnostics, the real-browser diagnostic unit file passed3/3, and the original rapid-revision and fast-refresh iPhone WebKit cases both passed (2/2). These are targeted checks, not a new full-suite result.
