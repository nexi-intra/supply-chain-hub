# Game Corner fornyelse: fjern Hit N Miss, omdøb spil, nyt spil

## Fase 1: Fjern Hit N Miss
- [x] Slet `src/components/HitNMiss.tsx`.
- [x] Fjern fra `GameCorner.tsx` (import, GameView-type, spilkort, view-blok).
- [x] Fjern fra `ManagerPanel.tsx` (sektionen genbrugt/omdøbt til Neon Snake — samme datastruktur).
- [x] Ryd op i ubrugte ikoner/nøgler (Target-ikonet erstattet af WaveSine).

## Fase 2: Omdøb spil (kun visningsnavne — KV-nøgler bevaret så highscores overlever)
- [x] **Endless Dodger → "Hønseinvasionen"** i GameCorner, EndlessDodger-header og ManagerPanel.
- [x] **Brick Break / Nexi Flyer / Tetris** — beholdt (navnene passer).

## Fase 3: Nyt spil — "Neon Snake"
- [x] `src/components/NeonSnake.tsx`: neon-æstetik med glødende gradient-slange med øjne,
      pulserende æbler, roterende gyldne bonusstjerner (5 pt, nedtællingsring), partikler,
      screen shake, flash, farveskiftende baggrund/kant og dødsanimation.
- [x] 4 sværhedsgrader (tick-fart), piletaster/WASD + touch-D-pad, inputkø der forhindrer
      180°-dødsfald.
- [x] Highscores i `neon-snake-global-leaderboard` + `neon-snake-play-counts`.

## Fase 4: Game Corner-integration
- [x] Nyt spilkort + view-blok for Neon Snake (grøn/turkis identitet, WaveSine-ikon).

## Fase 5: Manager Panel-integration
- [x] "Neon Snake"-under-fane med spil-statistik + redigérbare/sletbare highscores + dialog.

## Fase 6: Verificering
- [x] Typecheck + `npm run build` uden nye fejl (fandt og rettede også manglende status-felt
      i handleCreateUser-typen fra godkendelsesflowet).
- [x] Playwright E2E — 11/11 grønne: Hit N Miss væk, nye navne vises, spil → død →
      leaderboard + play count skrives, Manager Panel viser stats/score, ingen page errors.
- [x] Commit til PR #19.

---
**Forslag:** Start med Fase 1-2 (oprydning + navne), derefter Fase 3 (spillet), så 4-6.
