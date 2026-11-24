# 1.6.1 – Word-guides kan ikke sendes til review i den pakkede app

Fejl (meldt af Anne-Marie 2026-10-07): "Word kunne ikke danne PDF-visningen" ved Send til review af en
Word-guide med "Bevar original Word-layout". Gælder alle pakkede klienter (1.5.8, 1.5.9, 1.6.0).

Årsag: `electron/wordToPdf.ps1` ligger kun i `app.asar`. PowerShell kan ikke læse filer i en `.asar`
(`-File` afvises som "does not exist"), så Word bliver aldrig startet. Dev-vinduet og testene kører
scriptet fra en normal mappe, så fejlen blev ikke fanget. Bevist 2026-10-08: samme konverter virker fra en
normal sti (18 s) og fejler på under 1 s fra en sti i `app.asar`.

## Fase 1: Forberedelse
- [x] 1.6.0 committet lokalt (3e594b5) som baseline; ikke pushet
- [x] Worktree `Supply-Chain-Hub 1.6.1` på `develop/1.6.1` + npm install + Electron-binær
- [x] Version 1.6.1 i package.json og package-lock.json

## Fase 2: Rettelse (TDD)
- [x] Rød test: sti inde i `app.asar` omskrives til `app.asar.unpacked`; dev-stier uændrede
- [x] Rød test: `build.asarUnpack` indeholder `electron/wordToPdf.ps1`
- [x] `renderWordGuide.cjs`: start scriptet fra den udpakkede placering
- [x] `package.json`: `asarUnpack` for `electron/wordToPdf.ps1`
- [x] `verify-packaged-release.cjs`: fejler hvis scriptet ikke findes uden for arkivet, og konverterer en rigtig DOCX via den pakkede kode

## Fase 3: Verifikation
- [x] Hele electron- (950/950) og vitest-suiten (1237 bestået, 1 sprunget over) grøn
- [x] Verifikationsbuild i temp-mappe (ikke `release/`): scriptet ligger i `app.asar.unpacked`
- [x] Rigtig konvertering fra den pakkede placering (tom DOCX -> PDF med Word): "Packaged app converts a DOCX to PDF with Word from app.asar"
- [x] Changelog 1.6.1 (kort, brugervendt)

## Fase 3b: Flere ting fra brugeren (2026-10-08)
- [x] Skak-menuens mini-bræt: brikkerne står nu centreret på hver sin felt (`ChessLobby.tsx` `marqueeFoot()`, `chess.css` perspektiv)
- [x] Word-Puzzle: hjælpeteksten "Vælg et felt på brættet…" fik brættet til at rykke, når man valgte en brik. Linjen er nu altid reserveret og kun synlig når en brik er valgt (`WordPuzzleGame.tsx`, `.bgr-hint[data-reserved]`)

## Fase 3c: Spilhjørnet visuelt (Opus laver det grafiske)
- [x] Fjern gitteret i baggrunden i Arcade og Multiplayer, så de ligner Modern (`src/views/arcade.css` linje 1-5: `.arcade-screen, .arcade-library` har et 48px-gitter; tjek at spilskærmene i Arcade ikke afhænger af det)
- [x] Modulernes egne overskrifter bruger stadig de gamle ikoner: Arcade (`Arcade.tsx` ~linje 206, GameController i lille boks), Modern (stor blå boks med headset), Multiplayer (`MultiplayerHub.tsx` ~linje 177, UsersThree). Brug de nye motiver og accentfarver fra `src/components/arcade/SectionTile.tsx`, så modul-overskriften matcher kortet man klikkede på (ny `SectionBadge`)

## Fase 3d: Multiplayer-spillene er tunge og hakker (brainstorm før kode)
Fund fra kodegennemgang 2026-10-08 (ikke målt med profiler endnu):
- [ ] Hubert-spritens animation (`background-position` med `steps()`) tegnes om på hovedtråden hele tiden, også når han sover; mørk tilstand lægger et `filter` oven i (`hubert.css`)
- [ ] Tre lyttere henter hver et tungt snapshot fra hovedprocessen ved hver ændring i det fælles multiplayer-indeks (notifikationer, lobby bag spillet, selve spillet), ofte to gange pr. træk; hver læsning dekrypterer indeks + brugerlister
- [ ] `App.tsx` `lastActivity`-state gentegner hele appen ved hvert klik/tastetryk; ingen `memo` på brættet (225 felter / 64 felter)
- [ ] Altid-kørende solstråle/ild-animationer med `mix-blend-mode` + maske over hele rummet; `backdrop-filter`-blur på topbjælken
- [ ] Ordtjek-ordbogen (150-450 MB) indlæses først ved første træk efter pause
- [ ] Mindre: grain-SVG (`feTurbulence`) på hvert felt, `filter` ved hover/drop, 7 sprite-strips afkodes på én gang ved åbning
- [x] Måling: `scripts/measure-multiplayer-perf.cjs` (5 scenarier, rigtig Electron, softwaretegning som hos brugerne). Baseline 2 kørsler i `%TEMP%\mp-perf-baseline-1/2.json`:
  WP i hvile ~50 % af én kerne (GPU-proces 34 %), WP under spil ~110 % + 42 FPS + 39 hak >100 ms, fjernaktivitet: 5 handlinger -> 9 events -> 18 snapshot + 9 game IPC, skak i hvile ~54 %, lobby ~14 %
- [x] Aftal tilgang med brugeren før implementering (A: ret årsagerne, behold udseendet; intet må gå tabt)
- [x] Del 1a: `lastActivity` i `App.tsx` som ref (ingen gentegning pr. klik; ny `inactivityWatcher.ts`); `memo` på bræt/bøjle/skakbræt/Hubert/paneler med stabile props (`useStable.ts`)
- [x] Del 1b: ét delt multiplayer-snapshot (`multiplayerSnapshotStore.ts`); uændrede svar giver ingen gentegning; main: brugerliste-cache 30 s, delt indekslæsning 300 ms for læsekald, dublet-events fjernet via indholds-fingeraftryk
- [x] Del 1c: ordbogen forvarmes når et Word-Puzzle-spil åbnes (`multiplayer:warm-words`)
- [x] Del 2: solstråler/ildskær trinvis opacitet + mindre ildflade; papir-grain som færdige PNG-fliser (`scripts/render-grain.cjs`); brættet og lobby-Hubert på eget lag. Skærmbilleder før/efter ens. Hubert-translate og forskudt afkodning prøvet og rullet tilbage (risiko for blanke billeder / ingen gevinst)
- [x] Eftermåling (2 kørsler `mp-perf-part2-1/2.json`): WP hvile 50 % -> 15 %, WP spil 110 % -> 63 % CPU, 42 -> 55 FPS, hak >100 ms 39 -> 0-1, fjernaktivitet 56 % -> 17 %, skak hvile 54 % -> 18 %, lobby 14 % -> 12 %. tsc 0, electron 958/958, vitest 1252, E2E Word-Puzzle 17/17, skak 14/14
- [ ] Åbent: hurtigt træk af brikker (drag) belaster stadig tegningen; årsag ikke fundet

## Fase 4: Udgivelse (kun efter brugerens ja)
- [ ] `npm run electron:build`, pakketjek, SHA-256
- [ ] Commit på `develop/1.6.1`
