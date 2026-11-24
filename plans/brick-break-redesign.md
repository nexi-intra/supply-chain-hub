# Brick Break Implementation Plan

> Agent workflow: use brainstorming, writing-plans, TDD, focused validation, spec review, code review and verification-before-completion. The user authorised autonomous decisions and all phases on 2026-10-01. Do not stop for approval, commit, release or change production data.

**Goal:** Replace the old Brick Break game with a responsive, polished breakout game using the shared arcade cabinet and preserving difficulty, round statistics and administrator controls.

**Architecture:** Fixed-step engine in `src/games/brickBreak`, a canvas renderer and a thin React shell. Use the already-installed Three.js `Ray.intersectBox` for swept collisions and `Vector3.reflect` for collision response; no new dependency. Retain the eight tested symmetric masks from `src/lib/brickBreakLevels.ts`.

**Tech Stack:** React 19, TypeScript, Three.js math, Canvas 2D, WebAudio, Vitest and Playwright/Electron with isolated data/profile directories.

## Context And Decision

The old component mixes a frame-dependent game loop, many power-up intervals, drawing, menu and persistence. Ball speed is in pixels/frame, paddle movement is 8 pixels/frame, and discrete overlapping-box collisions can miss fast balls or reverse them repeatedly. Existing saves contain score and level per difficulty under `brickbreak-global-leaderboard`; rounds use `brickbreak-play-counts`.

Options considered:
- Visual-only refresh: insufficient because the frame-based physics remains.
- Full game framework: a new dependency and lifecycle, not needed for this bounded game.
- Selected: deterministic engine with proven Three.js ray-box collision math, existing layouts and shared cabinet. A fast-ball swept-collision test is the first discriminating check.

## Design

**Update 2026-10-01 (user):** a truly striking glass experience; the name may change. Decision: the game is renamed **Prism Break** (stained-glass panes that shatter into shards; light refracts into spectral colours). The view id `brickbreak` and all storage keys stay unchanged. Both Prism Break and Chicken Invaders play in an immersive stage: a full-window overlay (portal to `body`) with only a slim bar (title, difficulty, sound, quit) and the largest canvas that fits; highscores and the rest of the app are hidden while playing.

- Name stays Brick Break. Theme: neutral graphite `#15171b`, mint plasma `#2ce0c2`, coral `#ff6178`, electric yellow `#ffcf56`, white `#f2fbff`. Colorful glass bricks show damage through cracks and missing layers.
- Fixed logical arena 960x600. Mouse/touch or arrows/A/D move the paddle. Space/click launches a held ball; held Space/click fires lasers only while laser power is active. P pauses. Movement keys clear stale pointer input. Repeated keydown never launches another ball or toggles pause repeatedly.
- Three lives, maximum five; one life lost only when the last ball is gone. Losing a life resets temporary powers and serves another ball. Extra life every 25,000 points.
- Four difficulties set initial speed, paddle width and rows. Speed ramps across levels with a ceiling. Swept collisions prevent tunnelling; paddle bounce angle and movement influence direction; minimum vertical velocity prevents endless flat bounces.
- Brick kinds: ordinary (100), reinforced (220, two/three hits), crystal (500) and reactor (150, damages nearby bricks and chains other reactors). Only destroyed bricks award points. Reactors do not damage the next level.
- Combo increases across brick breaks between paddle hits (max x5); paddle hit or life loss resets it. Level bonus 1,000 x level; +1,000 for a perfect level. Final result includes highest level, destroyed bricks, longest chain, paddle returns and power-ups collected.
- Power-ups: wide paddle, multiball (maximum three), piercing fireball, twin laser, magnet catches, slow ball, one-use bottom shield and extra life. Timed powers use simulation time (freeze on pause). Recollection refreshes duration rather than starting competing timers. Negative random control reversals are removed.
- Bricks drop power-ups with deterministic seeded RNG; useful opening rewards are guaranteed periodically to avoid a dull first run. New level keeps score/lives, clears temporary effects and returns to aim/serve state with a short banner.
- Cabinet/menu, difficulty radio group, shared sound preference (off by default), Hall of Fame and game over reuse `src/components/arcade`. A real engine-driven marquee demonstrates brick shattering; reduced motion gives a still image. Menu animation stops when hidden.
- New key `brickbreak-v2-global-leaderboard`; play counts stay `brickbreak-play-counts`. Creator Panel shows new scores/level and the old board with `legacy` marker and confirmed individual/bulk deletion. No automatic migration or deletion of old scores.
- DA/EN/FI labels for menu, HUD, results and powers. Accessible controls and icon button tooltips. Desktop/mobile and light/dark layout without overlap or horizontal scrolling.

### Contracts

Physics: ball radius 8px, timestep 1/120s. Three.js Ray/Box3 supplies the broadphase; Ray/Sphere refines rounded corners, with face/corner normals opposing the incoming velocity. Separating contacts do not hit again. Resolve earliest contact first, stable brick id breaks simultaneous ties, separate by a small epsilon and consume the remaining time (maximum eight impacts per step). Initial overlaps separate along the nearest outward normal; all vectors/positions remain finite. Test front, side, corner, overlap, parallel/away motion and two impacts in one step.

Storage: nested `{ easy: Entry[], medium: Entry[], hard: Entry[], expert: Entry[] }`, where Entry has `{ id: email, email, score, level, timestamp }`. Submit atomically through `submitHighscore(key, entry, { path: [difficulty], categories })`, then read-only hook refresh. Never use a `useKV` setter on that key. Test all four categories, preserved old scores and independent original play-count keys.

Shared UI: use actual `ArcadeCabinetMenu`, `ArcadeHallOfFame`, `ArcadeGameOver` and `ArcadeSoundToggle` components. Same title/record/difficulty/start/highscore hierarchy as Chicken Invaders, but the `brickbreak` theme and real BrickMarquee canvas supply the distinctive artwork.

Verification and final dev restart use explicit temporary `TCD_HUB_DATA_DIR` and `TCD_HUB_USER_DATA_DIR`. Do not start the default production-backed config while developing these games.

## Phase 1 - Physics And Engine

**Result (2026-10-01):** 54 tests green in `src/games/brickBreak`, `tsc -b` clean. All Phase 1 items below are done.

Files: `src/games/brickBreak/config.ts`, `physics.ts`, `levels.ts`, `engine.ts` and adjacent tests.

- [x] Add a failing swept-collision test (fast ball crosses a thin brick); run `vitest run src/games/brickBreak/physics` and confirm RED.
- [x] Implement swept circle-vs-rectangle using Three.js Ray/Box3 and reflected velocity; verify front/side/corner, separating contact and finite output; rerun GREEN.
- [x] Test and implement difficulty configuration, layout reuse, special bricks, level scaling and caps; `vitest run src/games/brickBreak`.
- [x] Test and implement serve, paddle movement/angle, wall/paddle/brick collisions, scoring, combo, multi-hit/chain explosions and last-ball life loss.
- [x] Test and implement all powers, refresh/expiry, multiball cap, shield, life cap, laser and magnet launch. Assert timers freeze when the engine is not stepped.
- [x] Test level completion/reset, game-over once, seeded determinism, high-speed stability and simulated multi-level play. Run narrow tests and typecheck.
- [x] Anti-stall (added after visual review): after 4 paddle returns without a broken pane the return gets a seeded ±0.22 rad kick, so the ball cannot lock into an endless vertical loop.

## Phase 2 - Graphics, Audio And Labels

Files: `src/games/brickBreak/render.ts`, `labels.ts`, `audio.ts`, `BrickMarquee.tsx` and relevant tests.

- [x] Tests first for localized labels and effect lifetime/caps; implement. Chain reactions with > 2 breaks in one batch show one summed score text.
- [x] Draw glass bricks, visible cracks, reactor pulse, paddle, trails, collision flashes, fragments, pickups, score/combo/lives/level HUD, aim line and power durations on canvas; respect reduced motion.
- [x] Reuse shared muted-by-default audio infrastructure with Brick Break event mapping.
- [x] Build engine-driven marquee (`PrismMarquee.tsx`) and review desktop/mobile screenshots and moving/nonblank pixel checks.

## Phase 3 - React Shell And Arcade

Files: `src/games/brickBreak/BrickBreak.tsx`, shared arcade CSS, `src/views/Arcade.tsx`, `scripts/design-arcade-scan.cjs`.

- [x] Implement refs/input/fixed-step loop, ready/serve/paused/result states, blur pause, retry, cleanup, accessible controls and responsive arena; narrow typecheck.
- [x] Reuse cabinet/Hall of Fame/game-over and sound preference. Hook actual score writes via `submitHighscore` and `recordGamePlay`; no mock runtime data.
- [x] Replace lazy import and redundant game header; update tile art/accent and remove old component only after executable validation. (`src/components/BrickBreak.tsx` deleted; it had older uncommitted edits — copies remain in the 1.5.1–1.5.8 folders and HEAD.)

## Phase 4 - Storage And Creator Integration

Files: `src/views/CreatorPanel.tsx`, `electron/teamReadPolicy.cjs` and test, `electron/assistantContext.cjs` and test, `src/lib/changelog.ts`.

- [x] RED: new cross-team key and assistant lookup; implement allowlist/key and verify GREEN.
- [x] New current admin/cross-team board with level; marked old board below with existing confirmed deletion controls; preserve all round counts.
- [ ] Update existing 1.5.9 changelog (deferred to the release step, together with Chicken Invaders). Plan checkboxes updated; no release or production writes.

## Phase 5 - Review And End-To-End Verification

Files: `scripts/verify-brick-break.cjs` and reusable existing verification tooling where suitable.

- [x] Spec compliance review, then code quality review; fix verified defects with red/green regressions.
- [x] `vitest run`, `node --test --test-reporter=tap electron/*.test.cjs`, `tsc -b`, `npm run build` all pass (535 / 527 / clean / OK).
- [x] Electron verifier on temporary storage/profile (`scripts/verify-brick-break.cjs`, 12/12): click Arcade/Brick Break, keyboard difficulty and synced highscore tab, start/serve, move, pause/resume/focus loss, play to result, retry, quit and Escape, new score+level+counts, old board untouched, creator individual/bulk old-score deletion.
- [x] Verify real production bundle as well as dev (12/12 on `vite preview`; 375 px + dark + reduced motion checked separately; EN/FI covered by label tests; speed is frame-rate independent via the fixed 1/120 s step): screenshots at 1366px/375px (DA/EN/FI, light/dark, reduced motion); nonblank/moving canvas pixels; exact gameplay speed at synthetic 60/144 Hz; no runtime errors.
- [x] Rerun Chicken Invaders verifier for shared-component regressions (12/12 on production build), update both plans, gracefully restart the dev app and confirm its window responds.

Start with Phase 1. Autonomous execution is authorised; report only after both games meet the gates.