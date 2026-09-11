# Tetris i Game Corner + samlet Spil-oversigt i Manager Panel

## Mål
1. Tilføj et Tetris-spil til Game Corner, i samme stil/arkitektur som Hit N Miss, Endless Dodger, Brick Break og Nexi Flyer.
2. Tilføj stats-visning og highscore-redigering for Tetris i Manager Panel (samme mønster som de andre spil).
3. Saml alle spil-relaterede faner i Manager Panel til én samlet "Spil"-fane med under-faner pr. spil, så det er nemmere at overskue.

## Fase 1: Tetris spilkomponent
- [x] Opret `src/components/Tetris.tsx` med klassisk Tetris-logik:
  - 10x20 bræt, alle 7 brikker (I, O, T, S, Z, J, L), rotation (med simple wall-kicks), hard/soft drop, ghost-piece, linjeclearing, level/speed-optrapning, 7-bag randomizer, næste-brik preview.
  - Sværhedsgrader (Let/Mellem/Svær/Ekspert) der styrer startniveau/fart, så datastrukturen matcher de andre spils `Difficulty`-type.
  - Canvas-rendering i samme visuelle stil (HUD-bar, gradients) som `NexiFlyer.tsx`/`BrickBreak.tsx`, plus knapper til mobil/mus-styring.
  - Keyboard-styring (piletaster til bevægelse/rotation, mellemrum til hard drop).
- [x] Gem highscores i `tetris-global-leaderboard` (pr. sværhedsgrad: `{ email, score, level, timestamp }`, ligesom Brick Break).
- [x] Track antal spil i `tetris-play-counts` (pr. bruger, pr. sværhedsgrad), ligesom de andre spil.
- [x] Brug `useKV` hook til lokal leaderboard-state, og `window.spark.kv` til læs/skriv ved spil-afslutning (samme mønster som `NexiFlyer.tsx`).

## Fase 2: Integrer i Game Corner
- [x] Tilføj `'tetris'` til `GameView`-typen i `src/views/GameCorner.tsx`.
- [x] Tilføj nyt `GameModule`-kort (titel, beskrivelse på dansk/engelsk, ikon `SquaresFour`, farve/gradient) til `games`-arrayet.
- [x] Tilføj ny header/detail-visning for `currentView === 'tetris'` (samme baggrunds-wrapper, tilbage-knap, titel) der renderer `<Tetris userEmail={userEmail} />`.

## Fase 3: Saml spil-faner i Manager Panel
- [x] Erstat de 4 nuværende separate top-niveau faner ("Hit N Miss", "Endless Dodger", "Brick Break", "Nexi Flyer") med ÉN samlet top-niveau fane "Spil".
- [x] Inde i "Spil"-fanen: brug indlejrede faner (eller tilsvarende UI) til at vælge mellem de 5 spil (Hit N Miss, Endless Dodger, Brick Break, Nexi Flyer, Tetris).
- [x] Tilføj Tetris-ækvivalenter af eksisterende state/funktioner i `ManagerPanel.tsx`:
  - `tetrisLeaderboard`, `loadTetrisLeaderboard`
  - `editingTetrisScore`, `isEditTetrisScoreDialogOpen`, `newTetrisScore`, `newTetrisLevel`
  - `handleSaveTetrisScore`, `deleteTetrisScore`
  - `tetrisPlayCounts`
  - Tilsvarende dialog til redigering af score + level.
- [x] Reducér `TabsList` grid-kolonner tilsvarende (fra 9 til 6 top-niveau faner: Rettigheder, Sygemeldinger, Anmodninger, Ferie Oversigt, Fødselsdage, Spil).

## Fase 4: Verificering
- [x] Kør TypeScript-kompilering / build (`npm run build` eller `tsc --noEmit`) og ret evt. fejl.
- [ ] Gennemgå manuelt at alle 5 spil-highscores kan ses, redigeres og slettes fra det samlede Manager Panel.
- [ ] Bekræft dansk/engelsk tekst virker konsistent for det nye spil.

---
**Forslag:** Start med Fase 1 (byg selve Tetris-spillet), derefter Fase 2 (wire det ind i Game Corner), og til sidst Fase 3+4 (Manager Panel konsolidering og verificering).
