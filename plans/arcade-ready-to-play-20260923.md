# Arcade ready-to-play

## Phase 1 - hold gameplay until player input
- [x] Neon Snake prepares a visible stationary board after Start; Space or a click begins movement.
- [x] Tetris prepares its board and next piece without starting gravity or time until input.
- [x] Chickeninvasion shows its ship before the first wave or game loop begins.
- [x] Preserve Nexi Flyer and Brick Break first-input behavior, pause, quit and replay.

## Phase 2 - consistent start presentation
- [x] Give waiting game stages a single readable, theme-aware Space/click/tap prompt.
- [x] Keep keyboard and touch controls accessible without accidental double activation.

## Phase 3 - verify without live score writes
- [x] Test menu to ready to playing, pause/resume, quit and retry against isolated local storage.
- [x] Inspect ready screens at desktop and mobile sizes in both themes.
- [x] Run TypeScript, full tests and production build; record any limits on live verification.

Start with Phase 1. Do not complete a live game against the shared M: drive during verification.

Isolated Edge with the real game components and browser localKv verified all five ready screens, focused Space and pointer starts, pause/resume, quit and retry. At 375px all five prompts scroll to a visible centered position and receive keyboard focus. Light and dark mobile visuals were inspected; no game was completed against the shared M: drive. The short-lived local test entrypoints were removed after verification.

Final checks: 440 native tests, 179 frontend tests, and production build passed. Live Electron was only used to inspect stationary ready stages without launching a score-writing round. The isolated browser sessions used the real game components and localKv for active game controls.

## Follow-up - reported start regressions
- [x] Confirm Snake animation continues after Space/click, including pause/resume.
- [x] Confirm Brick Break stays on a visible ready prompt until first input, with keyboard and pointer start.
- [x] Re-run focused isolated game checks, full tests and build without writing live M: scores.

Root causes: Snake's keyboard-effect cleanup cancelled the animation frame whenever its start handler changed on rerender; frame cleanup now runs only on unmount. Brick Break accepted any window click at canvas coordinates, so the Start menu click could launch the ball as the canvas mounted beneath it; only an actual click targeting canvas may launch. Isolated Edge/localKv verified Snake canvas motion over successive ticks and freeze/resume, Brick prompt persisting after 30 frames at desktop and mobile widths, and deliberate Space/click launches. The disposable browser test harness was removed.

Follow-up checks: 440 native tests, 179 frontend tests and production build pass. Live Electron read-only checks confirmed Brick Break waits with zero score and visible prompt after 25 frames, and Snake shows a drawn ready board; neither game was launched against M:. The local dev Electron window was restarted after it closed during build and returned to the Arcade gallery in dark mode.

## Follow-up - sticky paddle
- [x] Keep the large ready overlay for a new ball, but not for a ball caught by the sticky paddle.
- [x] Show a small, accurate release hint and preserve Space/canvas-click release while sticky is active.
- [x] Verify normal start, power-up behavior where reproducible, tests and build using local storage only.

The isolated real Brick Break engine generated and collected a sticky-paddle power-up. On catch, the large ready overlay was absent, the compact release hint was visible, and separate Space and canvas-click runs both released the ball. Desktop and mobile normal starts retained the full ready overlay. All browser runs used localKv; no live score writes were made.

Final verification: 440 native tests and 179 frontend tests pass; production build passes. The isolated power-up harness and screenshot were removed. Existing live M: game data was not changed.