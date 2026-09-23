# M-drive responsiveness implementation

## Phase 1 - remove redundant main-thread SMB work

- [x] Resolve each cross-team batch against one fresh validated team snapshot; preserve per-key authorization.
- [x] Bound watcher scan I/O and cover change/connection detection in tests.

## Phase 2 - keep background work behind the user

- [ ] Move queued offline replay off Electron's main thread without changing conflict/ordering rules.
- [x] Remove optional whole-mirror warm-up; refresh visible keys on demand instead.

## Phase 3 - polish foreground flows and validate

- [x] Prevent stale cross-team guide results and avoid overlapping cross-team Hub refreshes.
- [x] Run focused, full test/build checks and report measured gains versus remaining M: constraints.

## Phase 4 - saving feedback and duplicate prevention

- [x] Add an accessible indeterminate saving indicator to the existing button design.
- [x] Keep note and announcement dialogs pending until a single save resolves; prevent repeated submissions before rerender.
- [x] Extend the same pending state to to-dos, guides, and account/team/access-view creation; test delayed writes and retry identities.

## Phase 5 - audit every app button

- [ ] Inventory ALL clickable buttons and equivalent command controls across every module, modal, role, and language.
- [ ] Exercise each control with normal, double-click, keyboard, slow-storage, and error scenarios; verify immediate feedback, accessible pending state, safe retries, and no duplicate actions.
- [ ] Record fixes and regression coverage per workflow; verify role-gated and destructive actions in an isolated test environment, never by writing test data to live M:.

Start with Phase 1. Tests use temporary local stores; never write test data to the shared M: drive.

Offline replay remains open: its current synchronous account migration lock guards ordered queue operations. Moving it to an async path requires a dedicated queue-serialization and migration-gate design, including changes enqueued during replay and account-reference checks. Do not bypass those checks just to shorten main-thread work.

Verified against temporary local storage: five cross-team keys now use one fresh team-registry lookup (previously five); the watcher stats at most four mutable files at once, tracking immutable file creation/removal by name only. These are I/O-count reductions, not measured M: latency gains. Mirror-first reads still revalidate visible keys on demand, and the optional full-mirror warm-up no longer competes with foreground work after team switches. Save buttons show pending feedback and reject repeat submissions across notes, announcements, team/personal to-dos, guides, and priority account/team/view creation. Retries for note, announcement, and to-do creation reuse a stable ID unless the draft changes.

Isolated Electron auth smoke exposed a local 500 ms actor-cache window after account migration; successful local migration now invalidates cached actors in all open windows. Cross-client changes retain the documented 500 ms cache TTL. Final checks: 440 native tests, 179 frontend tests, production build, and isolated Electron auth smoke (35 assertions) passed. The idle local development Electron was restarted and its authenticated home screen loaded. No performance benchmark was run against the live share. Phase 5 remains a separate, uncompleted audit of every control, role, and failure path.