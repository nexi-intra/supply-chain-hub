# Review: M-drive response times and user experience

## Phase 1 - map and verify critical paths

- [x] Trace startup, hub switching, KV reads/writes, watcher, and mirror warm-up to M:.
- [x] Distinguish evidence from code, tests, and observed timings; avoid writing to live storage.

## Phase 2 - inspect user-facing workflows

- [x] Sample representative screens for duplicate or serialized calls and loading/error feedback.
- [x] Assess priority, cancellation, timeouts, concurrency, cache freshness, and offline behavior.

## Phase 3 - deliver actionable findings

- [x] Rank reproducible issues by severity with source references and smallest safe improvements.
- [x] Identify missing measurements and tests without claiming unmeasured improvements.

Start with Phase 1. This is a read-only review; no production storage changes.

## Findings and suggested order

1. High: `store.cjs` runs an unbounded Promise.all of per-file SMB stat calls every two seconds per client, outside the six-slot foreground read gate (605-665). Initial scan is synchronous (650-653). Limit scan concurrency, avoid scanning immutable blob files every tick where freshness permits, and measure watcher duration/input lag under representative client counts.
2. High: cross-team `readTeamMany` calls `storeFor` per requested key; `storeFor` revalidates via `registry.listTeams`, which synchronously reads M: every time (`teamReadPolicy.cjs` 30-40, 70-80; `registry.cjs` 32-36, 65-66, 177-179). Validate the folder once per batch using a fresh registry snapshot, without weakening access checks; benchmark main-thread stalls.
3. High when offline writes exist: `offlineSync.cjs` replays a queue synchronously during watcher startup and reconnect (89-177, 425-432), and `main.cjs` retries it synchronously on the Electron main thread every 45 seconds (328-335). Move replay I/O to an async serialized path with identical conflict/ordering semantics; test input responsiveness during a stalled share.
4. Medium: startup/team-switch mirror warm-up scans all cached mutable keys on team plus shared stores (main.cjs 182-207; offlineSync.cjs 259-278). It lacks cancellation and foreground priority after it starts; observed logs previously reported warm-ups lasting hundreds of seconds while saves were slow. Pause/defer while foreground I/O is active and cancel stale runs; do not assume a 120 ms inter-key pause fixes contention.
5. Medium: Hub cross-team overview issues five fresh authorized reads per team on mount and every five minutes (Hub.tsx 252-291; teamReadPolicy.cjs 58-80). It has no stale-result guard or catch on slow/disconnected M:. Cache a scoped, short-lived sanitized overview or react to changes, retain authorization checks, and display a last-updated/error state.
6. Medium/low: GuideLibrary changes selected team while previous requests are still in flight; old results can replace the new team's guides, and finally can clear the new spinner (GuideLibrary.tsx 151-171). Add a request generation guard and test a delayed out-of-order response.

The storage regression suite passed (95 tests: store, offlineSync, teamReadPolicy) against temporary local storage. These tests do not measure a contested M: share. No live performance benchmark or live-storage write was performed. Avoid any cache that bypasses revocation, fresh account checks, or the offline queue's conflict rules.