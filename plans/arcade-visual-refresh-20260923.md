# Arcade visual refresh

## Phase 1 - shared visual language
- [x] Replace fixed light backgrounds with theme-aware surfaces across all five games.
- [x] Give each game the same back navigation, heading, stage width, and start/score hierarchy.

## Phase 2 - game menus
- [x] Improve menu and highscore readability without changing gameplay or leaderboard storage.
- [x] Keep each game accent distinct within a consistent layout on desktop and small screens.

## Phase 3 - validation
- [x] Verify light and dark mode, responsive sizing, menu choice and back interactions visually without starting a score-writing game.
- [x] Run typecheck, production build, and the full regression suites; record limitations.

Direction: an arcade console, not a marketing page. Use the existing IBM Plex typefaces, theme background/foreground tokens, subtle grid texture, and distinct restrained accents. Gameplay remains primary. Start with Phase 1.

Verified in Electron: all five game menus and leaderboards in light and dark modes at 375px without horizontal overflow; keyboard selection updates the selected difficulty; back navigation returns to the five-game gallery. Scores and gameplay were not mutated in the live shared store. Final checks: 440 native tests, 179 frontend tests, production build. The gameplay canvas itself was not started against the live M: store, so in-game rendering is outside this visual check.