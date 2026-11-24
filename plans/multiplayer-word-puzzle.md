# Multiplayer in Game Corner - first game: Word-Puzzle

> For agentic workers: use superpowers:executing-plans (or subagent-driven-development) and
> superpowers:test-driven-development. Every task is RED -> GREEN -> verify. No commits, no
> release builds (`npm run build` / `electron:build`) unless the user asks. Verify with tsc,
> vitest, `node --test electron/*.test.cjs` and the dev window (Vite + electron.exe).

**Goal:** A Multiplayer section in Game Corner where a user challenges any approved colleague in
any team to a turn-based word game (Word-Puzzle, Scrabble-style rules, not the trademarked name).
The game starts only when the opponent accepts; after each turn the opponent is notified (hub bell,
in-app toast, Windows notification) and a click opens the game.

**Architecture:** Same pattern as Improvements: a validated main-process service
(`electron/multiplayer.cjs`) with snapshot/command IPC, identity from `authService.current`, CAS
writes with `expectedRevision` and idempotent `operationId`. Everything is stored on M: - no
network service. A small watched index in `_shared` signals turns within ~2 s; each game lives in
its own file in the unwatched folder `_shared/multiplayer/`. A pure rules engine
(`electron/games/wordPuzzle/`) is the single source of truth for placement, words and score; the
renderer previews a move through `multiplayer:preview` instead of duplicating rules.

**Tech stack:** Electron main (CommonJS, node:test), React + TypeScript (vitest), encrypted KV
store (`electron/store.cjs`), word lists per language on the shared drive.

## Decisions (approved 2026-10-06)

- 2 players per game. Language chosen per game: da, en, sv, fi (board, tile set, word list follow).
- Word check: language word list; a word not in the list can be submitted and the OPPONENT approves
  or rejects it (approve -> move stands; reject -> tiles return, same player tries again, no penalty).
- Inactivity: the waiting player can send a reminder; either player can resign at any time. No
  automatic forfeit.
- Simple statistics: wins / losses / draws per person across Supply Chain.
- Notifications: hub bell + in-app toast in every view + Windows notification. A shared desktop
  notification mechanism is built so ALL hub notifications can become Windows notifications (Phase 7).
- Name in the app: "Word-Puzzle" (do not use "Scrabble" in the UI).
- Storage: index in `_shared/multiplayer-index` + one file per game in `_shared/multiplayer/`
  (`store.watch` is non-recursive - verified in `electron/store.cjs` scanDirectoryAsync - so game
  files add no 2-second polling cost for the ~40 clients).
- (added 2026-10-06) In-game chat between the two players: messages live in the game file (newest
  200 kept); a new message gives the opponent a `chat` notification (bell, toast, Windows).
- (added 2026-10-06) Look: modern, cosy and warm. The lobby/menu follows the Arcade cabinet style
  (`src/components/arcade/*`, `arcade-*` classes); the match is played in an illustrated cosy room
  (wooden table, lamp light, plant, bookshelf, mug, window) drawn with CSS/SVG around the board,
  light and dark theme, no external images.
- Word lists: nspell (MIT) + hunspell dictionaries for da/en/sv (checked at runtime in a
  `worker_threads` worker so the main thread never blocks); fi uses a base-form word list if a
  licensed one can be fetched, otherwise every fi word goes to opponent approval. Licences are
  recorded in `electron/games/wordPuzzle/WORDLISTS.md`. Lists ship inside the app, nothing is
  written to M: for them.

## Data model

`_shared/multiplayer-index` (small, watched):
```
{ revision, games: [ { id, type: 'word-puzzle', language, players: [emailA, emailB],
  names: { [email]: fullName }, status: 'invited'|'active'|'awaiting-approval'|'finished'|'declined'|'cancelled',
  turn: email|null, gameRevision, createdAt, updatedAt, winner: email|null|'draw',
  scores: { [email]: number } } ],
  notifications: [ { id, gameId, recipientEmail, type: 'invite'|'accepted'|'declined'|'turn'|
  'approve-word'|'word-rejected'|'reminder'|'finished', createdAt, readAt, message } ] }
```
Caps: keep all open games; keep the newest 500 finished games; keep notifications of the last 30
days (read ones pruned first).

`_shared/multiplayer/` key `game-<id>` (unwatched, full state):
```
{ id, revision, language, players, board: string[15][15] (letter or ''), blanks: [[r,c]],
  racks: { [email]: string[] }, bag: string[] (server-shuffled), scores, turn, consecutiveScoreless,
  pending: null | { by, placements, words, score, unknownWords },
  moves: [ { by, kind: 'play'|'pass'|'exchange'|'resign', placements?, words?, score, at } ],
  history: [ { operationId, fingerprint, ... } ] }
```
Rack privacy: `snapshot`/`game` projections return only the caller's rack and the opponent's tile
COUNT; the bag is never projected (only its size).

## File structure

- Create `electron/games/wordPuzzle/board.cjs` - premium-square layout (15x15), centre square.
- Create `electron/games/wordPuzzle/tileSets.cjs` - letter counts + points per language (da, en, sv, fi).
- Create `electron/games/wordPuzzle/rules.cjs` - `validatePlacement`, `extractWords`, `scoreMove`,
  `applyMove`, `isGameOver`, `finalScores` (pure, no I/O).
- Create `electron/games/wordPuzzle/wordList.cjs` - load a sorted word list, binary-search `has(word)`.
- Create `scripts/build-word-lists.cjs` - build normalised word lists from free spell-check dictionaries.
- Create `electron/multiplayer.cjs` - service (snapshot, game, preview, command).
- Modify `electron/main.cjs`, `electron/preload.cjs`, `electron/securedIpc.cjs`,
  `electron/accountReferences.cjs` - wiring, key blocking, rename migration.
- Create `electron/desktopNotifications.cjs` - Windows notifications + click -> navigate.
- Create `src/lib/multiplayer.ts` (types + bridge), `src/lib/multiplayerLabels.ts` (da/en/fi/sv).
- Create `src/views/Multiplayer.tsx` (lobby), `src/components/multiplayer/ChallengeDialog.tsx`,
  `src/components/multiplayer/WordPuzzleGame.tsx` (board, rack, actions),
  `src/hooks/useMultiplayerNotifications.ts`.
- Modify `src/views/GameCorner.tsx`, `src/components/NotificationCenter.tsx`, `src/App.tsx`
  (global turn toast + deep link), `src/lib/changelog.ts`, `electron/assistantAppGuide*.cjs`.
- Tests next to each file (`*.test.cjs` / `*.test.ts`) + `scripts/verify-multiplayer.cjs`.

## Phase 0: Release notes (done 2026-10-06)

- [x] 1.6.0 "what's new" lists Knowledge Base, required owner for new suggestions and the
      ongoing/completed/declined views; Chicken Invaders condensed to one line.

## Phase 1: Word-Puzzle rules engine (pure, Danish first)

- [x] `board.cjs` (+ test): 15x15 layout, centre DW, TW/DW/TL/DL counts 8/17/12/24, symmetry.
- [x] `tileSets.cjs` (+ test): da/en/sv/fi sets (100/100/100/101 tiles incl. 2 blanks), documented source.
- [x] `rules.cjs` (+ test): placement validation, word extraction, scoring incl. premiums/blanks/bingo,
      rack/bag/exchange helpers, game over and final scores. 67 tests green (2026-10-06).

## Phase 2: Word lists (da, en, sv, fi)

- [x] Sources + licences recorded in `electron/games/wordPuzzle/WORDLISTS.md`: nspell 2.1.5 (MIT),
      dictionary-da 6.0.0 (GPL-2.0/LGPL-2.1/MPL-1.1), dictionary-en 4.0.0 (MIT AND BSD),
      dictionary-sv 4.0.0 (LGPL-3.0). Shipped inside the app; nothing written to M:.
- [x] `wordCheckWorker.cjs` + `wordChecker.cjs` (+ test, 18 green): worker_threads, lazy per
      language, timeout/crash restart, released after 10 min idle (dictionaries use 150-450 MB).
- [x] Finnish word list: `wordlists/fi.txt.gz` built from hunspell-fi (CC0, inflected forms) by
      `scripts/build-finnish-wordlist.cjs`; see `plans/finsk-ordliste.md` (Kotus 2024 optional supplement).

## Phase 3: Multiplayer service + storage (main process)

- [x] RED `electron/multiplayer.test.cjs` (fixture modelled on `improvements.test.cjs`, real
      `createStore` in a temp dir, directory with people in two teams):
  - challenge: only approved people in other/own team, not self, not the creator account; creates
    an `invited` index entry + invite notification; nothing else is stored.
  - respond: only the invitee; accept deals 7+7 tiles server-side, picks starting player, creates
    `game-<id>`; decline -> `declined`, challenger notified.
  - move: only the player whose turn it is; validated by rules; known words -> applied, score
    added, rack refilled from bag, turn passes, `turn` notification to the opponent.
  - unknown word -> `awaiting-approval`; opponent `approve-word` applies it; `reject-word` returns
    tiles to the mover, same player's turn, mover notified.
  - pass / exchange (bag >= 7) / resign / remind; game over -> winner + `finished` notifications.
  - privacy: snapshot/game never contain the opponent's rack letters or the bag.
  - concurrency: stale `expectedRevision` -> `MULTIPLAYER_CONFLICT`; same `operationId` replays the
    stored result; forged fields rejected; observer sessions read-only.
  - crash between game write and index write is repaired on the next read (index.gameRevision <
    game.revision -> index entry rebuilt from the game).
  - caps on finished games / notifications; stats (wins/losses/draws) derived from the index.
- [x] GREEN `electron/multiplayer.cjs` (reuse `createImprovementsDirectory` for the people list;
      raw `createStore(<root>/_shared)` + `createStore(<root>/_shared/multiplayer)`, fail fast when
      storage is offline like `IMPROVEMENTS_UNAVAILABLE`).
- [x] Wire IPC in `main.cjs`: `multiplayer:snapshot`, `multiplayer:game`, `multiplayer:preview`,
      `multiplayer:command`; broadcast `multiplayer:changed` after commands and when the `_shared`
      watcher reports `multiplayer-index` (next to the `improvement-cases` mapping).
- [x] `preload.cjs`: `window.electronMultiplayer`; `securedIpc.cjs`: block `multiplayer-index` in
      all `kv:*` handlers, register `multiplayer:command` as a domain write; `kv:keys` filter.
- [x] `accountReferences.cjs`: email fields in the index are migrated on account rename (test); game
      files keep stale emails harmlessly because identity is taken from the index entry.
- [x] (added) `hubert` command: 10 treats + 2 bones per player per game, no revision bump, wakes the
      opponent via a `hubertAt` marker on the index entry.

## Phase 4: Lobby and game UI

- [x] `src/lib/multiplayer.ts` types + `src/lib/multiplayerLabels.ts` (da/en/fi/sv; swedish
      coverage tests stay green). RED/GREEN vitest for pure helpers (grouping into Your turn /
      Waiting / Invitations / Finished, stats table).
- [x] `GameCorner.tsx`: third tile "Multiplayer" (own icon), lazy `Multiplayer` view, Escape
      behaviour like Arcade; reads `consumeNavigationParams()` (tab `multiplayer`, itemId = game id).
- [x] Lobby: groups with counts, "Challenge a colleague" dialog (search people across teams,
      choose language), accept/decline invitations, reminder button, statistics.
- [x] Game screen: board with premium squares, own rack (drag/drop + keyboard), live preview of
      words + score from `multiplayer:preview`, Submit / Pass / Exchange / Resign, approve/reject
      an unknown word, move history, scores, tiles left; optimistic UI per the 1.5.7 pattern.
- [x] In-game chat panel (service command `chat`, max 500 chars, newest 200 kept).
- [x] Cosy room (Blender-rendered living room, day/evening) + arcade-style lobby, redone by Opus 5.5;
      reusable `src/components/boardgame/BoardGameRoom` for future board games (chess proven in harness).
- [x] Hubert: Blender-rendered brown golden retriever with "Hubert" tag, 10 animation strips, routine +
      call/feed interaction (see `plans/multiplayer-visual-redo.md`).

## Phase 5: Notifications for multiplayer

- [x] Hub bell: `useMultiplayerNotifications` adds unread items; click ->
      `navigateTo('games', { tab: 'multiplayer', itemId })`; acknowledge on open.
      (Done via the shared `HubNotificationsProvider`; acknowledged by the match screen, and the invite
      notification is marked read server-side when answered/withdrawn.)
- [x] In-app toast in every view: always-mounted `MultiplayerToaster` in `App.tsx` shows "It's your turn
      against X" with an Open action; works while GameCorner is already mounted (navigation event, not only
      `consumeNavigationParams`).
- [x] `electron/desktopNotifications.cjs`: Electron `Notification` (Windows toast) for new unread
      notifications; click focuses the window and navigates; a local "already shown" set in userData
      prevents repeats after restarts. Tests with a fake Notification class.

## Phase 6: Languages en, sv, fi

- [x] Tile sets for en, sv, fi (done in Phase 1).
- [x] Word lists for en and sv (Phase 2). fi: see the open Phase 2 item.
- [x] Challenge dialog offers all four languages.

## Phase 7: All hub notifications as Windows notifications

- [x] Route the existing bell items (emails, vacation decisions, guide reviews, improvements,
      notebook, birthdays, multiplayer) through `desktopNotifications` with stable ids, so each
      appears once as a Windows notification and opens the right module on click.
- [x] Setting to turn Windows notifications off (default on; stored on this computer) in the profile settings dialog.

## Phase 8: Verification and documentation

- [x] `scripts/verify-multiplayer.cjs`: real Electron, isolated temp data + profile, 17 checks
      (challenge, bell invitation, accept, moves, toast + deep link, unknown word reject/approve, chat,
      Hubert treats/bones, resign + stats). Found + fixed a deep-link race in GameCorner.
- [ ] tsc, full vitest, full electron tests (known unrelated reds stay visible), dev window.
- [x] Hubert app guide (da/en/fi/sv): module `multiplayer`; changelog lines for Multiplayer and
      Windows notifications.
- [x] Hubert training: user reduced it to ONE round (round 9, Sonnet 5.5): 80 focus questions
      (Knowledge Base, Improvements views/owner, Word-Puzzle, Windows notifications) in
      `electron/assistantTrainingFocus.cjs`; assistant suite 408/408 green incl. the 12 old failures.

Next: Finnish word list (manual download), live check in the dev window.
