# Multiplayer (Word-Puzzle) visual redo

## v3 (2026-10-06): reusable board-game room + Hubert with real presence

The room, the table and Hubert become the shared setting for every board game in the Hub (chess next).

Design plan
- Composition: the table moves right of centre and leaves a floor corner on the window side. Hubert's
  basket stands in that corner; the floor recedes, so he is drawn larger the closer he comes to the
  viewer (depth scale from the walkway behind the table down to the near corner).
- Table: tabletop drawn as a slightly receding trapezoid (far edge narrower) so it reads as a surface
  you sit at; content stays flat and readable.
- Memorable element: Hubert in the light. Everything else quiet.

### Phase 1 - pure logic
- [x] Opaque bounds of the sprite strips checked (the dog fills the frame, no inset needed)
- [x] hubertRoutine: optional depth scale (box size by y), routine/path/free-point use it
- [x] src/lib/roomLayout.ts: world from measured slot rects (any board size), tests

### Phase 2 - src/components/boardgame/
- [x] BoardGameRoom (backdrop, topbar, lane, corner, table, board/tray/panels slots, props, Hubert, feeding, context)
- [x] HubertCall (paw button + menu) via room context
- [x] Paper objects: PaperNote, TapedNote, ScorePad, IndexCard, NotebookPanel, FoldedCard
- [x] boardgame.css (room + paper + chips) split from multiplayer.css; Hubert files moved
- [x] Name tag anchor fixed (projected the tag mesh centre; new `--mode anchors`, no re-render)

### Phase 3 - Word-Puzzle on the room
- [x] WordPuzzleGame/GamePanels/ChatPanel use BoardGameRoom + paper components, all behaviour kept
- [x] Chat: own messages show their text, long text wraps, the newest message is shown from its start

### Phase 4 - screenshots (v3-*)
- [x] Harness (lobby, match, Hubert states, chess placeholder), 1440x900 + 1100x800, light/dark, iterated

### Phase 5 - verification
- [x] tsc, node tests, vitest (+ roomLayout tests)
- [x] Harness removed, own Vite stopped

### Open
- [ ] Live check in Electron by the user (Hubert's size in the corner on their screen, chat height)

## v2 (2026-10-06): user not happy with v1 - room + table + Hubert redone, feeding added

Design plan
- Scene: we sit at a smoked-oak table in a Scandinavian living room. Room = Blender-rendered plate
  with depth of field (golden hour light theme, fireplace + lamp evening dark theme); the table is
  CSS on top, in focus, with the window/lamp light falling on it.
- Colour: oak table #6B4A33 (texture), walnut board frame #3E2718 + brass #C9A24B corners, bone
  board field #E9DFC9 with recessed walnut grooves, premium squares oxblood #8C2F2B / faded rose
  #C98E7E / ink blue #2F4D6B / mist blue #9DB5C0, maple tiles #F3E6C8.
- Type: IBM Plex Sans Variable (width axis) kept; condensed for titles, tiles and scores.
- Memorable element: Hubert (Blender-rendered sprite sheets) + the light. Everything else quiet.
- Seats: the viewer sits at the near side, the opponent across the table (far side, Hubert's lane).

### Phase 1 - service + types (feeding)
- [x] `hubert` command in electron/multiplayer.cjs (limits 10 treats / 2 bones per player, no revision bump, CAS retry, idempotent, onChanged + index signal)
- [x] tests in electron/multiplayer.test.cjs
- [x] src/lib/multiplayer.ts types + labels da/en/fi/sv

### Phase 2 - routine
- [x] hubertRoutine.ts: feed sequence (run to seat, beg, eat / carry bone + chew), tests

### Phase 3 - Blender pipeline (scripts/blender/)
- [x] Hubert model (metaball body, armature, hair curves re-seated on the skin each frame), iterated until he reads as a golden retriever
- [x] Animations: walk, run, sit, beg, rest, sleep, chew, eat, sniff, carry -> WebP sheets + manifest
- [x] Room plates (day/evening), table + walnut textures, mug + tile bag props
- [x] Contact sheet %TEMP%\multiplayer-shots\hubert-sheet.png

### Phase 4 - renderer
- [x] Sprite Hubert component (CSS steps, no per-frame React), reduced motion, hidden tab pause
- [x] Room/table/board/rack/notes redesign, light + dark
- [x] Call Hubert menu (treat / bone, counts, disabled at 0), animation on hubert.last change
- [x] Lobby cabinet upgrade

### Phase 5 - verification
- [x] tsc, node tests, vitest
- [x] Harness screenshots v2-* (lobby/match light+dark, 1440x900 + 1100x800, Hubert states, reduced motion)
- [x] Harness removed, own Vite stopped

### Open
- [ ] Live check in Electron by the user (Hubert's timing and size, plate exposure on their screen)
- [ ] The near feed spot is on the floor beside the table only on wide windows (about 1600 px and up); narrower windows use the left end of the walkway behind the table

## v1

Design tokens
- Walnut table, oak floor, sage wall (day) / petrol wall (evening), brass accents, paper notes, felt board.
- Hubert coat #B3622A (light #D98D4C, shade #8A4A1F), petrol collar, brass tag "Hubert".
- Type: IBM Plex Sans Variable incl. the width axis (condensed for titles, tile letters, scores).
- Layout: header bar -> wall (cropped decor) -> Hubert's walkway -> one walnut table with board column + paper notes.

## Phase 1 - logic for Hubert
- [x] Read existing code and constraints
- [x] `src/lib/hubertRoutine.ts`: seeded RNG, activity scheduler, free-point + path planning with exclusion zones
- [x] `src/lib/hubertRoutine.test.ts`

## Phase 2 - drawing
- [x] Hubert SVG poses (walk, sniff, sit, rest, chew, curled sleep) + basket, bone, tag, bubble (`Hubert.tsx`, `hubert.css`)
- [x] Room: wall, window day/night, frames, pendant lamp, shelves, radiator, floor, rug, plant, mug, tile bag
- [x] Board, tiles, rack, actions, paper notes, chat restyle
- [x] Lobby cabinet in walnut + brass, marquee with napping Hubert, rows with tile avatars

## Phase 3 - verification
- [x] Labels da/en/fi/sv (Hubert bubble lines)
- [x] tsc + vitest
- [x] Harness + screenshots light/dark, lobby + match, Hubert states; iterated
- [x] Removed harness, stopped own Vite server

## Open
- [ ] Live check in Electron by the user (feel of Hubert's timing, chat height on their window size)
