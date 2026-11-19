# Cargo Stack – redesign af Tetris

Brugerønske (2026-10-01): "fortsæt redesign af tetris". Navn valgt af brugeren: **Cargo Stack**. Samme proces som de tre andre spil: ren motor med TDD, forudtegnede sprites, fælles arkadekabinet, fordybet spilleflade, ny highscoretavle, gammel tavle markeret i Creator Panel.

## Idé

Brikkerne er gods (kasser, tønder, paller, tote-kasser), der læsses ind i en container på et lager. En fuld række bliver kørt væk ("afsendt"). Spillet føles som moderne Tetris efter guideline-reglerne.

## Spildesign

- Bræt 10x20 + 2 skjulte rækker, fast tidstrin 1/120 s, seeded 7-bag.
- SRS-rotation med wall kicks (JLSTZ og I), ghost, hold (én gang pr. brik), forhåndsvisning (5; ekspert 3).
- Tyngde efter guideline-formlen `(0.8 - (niveau-1)*0.007)^(niveau-1)` s/række, loft 20G. Niveau +1 pr. 10 rækker.
- Sværhedsgrad = startniveau: let 1, mellem 3, svær 6, ekspert 9.
- Lock delay 0,5 s med højst 15 nulstillinger (nulstilles når brikken når en ny laveste række).
- DAS 0,167 s / ARR 0,033 s i motoren; blød drop 20x tyngde (mindst 20 rækker/s).
- Point (x niveau): 100/300/500/800; T-spin 400/800/1200/1600, mini 100/200/400; back-to-back x1,5; kombo 50 x kombo; tom container 800/1200/1800/2000; blød drop 1/række, hårdt drop 2/række.
- Game over ved block out (ny brik kan ikke placeres) eller lock out (låst helt i de skjulte rækker).
- Alle tryk køes som handlinger og udføres i rækkefølge, så intet tryk går tabt (lært af Parcel Pilot).

## Grafik og lyd

- Lagerhal med reoler, lamper og betongulv; brættet er det indre af en container med bølgeplader og trægulv.
- Hver brik er sin egen godstype i guideline-farverne, så de er lette at kende.
- Fyldte rækker blinker og kører ud til højre som afsendte kasser med splinter; tekster for enkelt/dobbelt/tredobbelt/fuld last, T-spin, back-to-back, kombo og tom container.
- Hårdt drop: fartstreg og støvsky; advarselslys når stakken er høj; banner ved nyt niveau.
- HUD på lærredet: hold, næste brikker, point, niveau, rækker.
- Lyd via fælles `createSynth`.

## Lagring

- Ny tavle `cargo-stack-global-leaderboard` (sværhedsgrader, `{score, level}`), runder på ny `cargo-stack-play-counts` pr. sværhedsgrad (den gamle Tetris-tæller har en anden form og bevares urørt).
- Gammel `tetris-global-leaderboard` (flad liste) vises i Creator Panel som "Gammel version" med slet-knapper.
- `teamReadPolicy` får den nye nøgle; assistenten svarer på "Cargo Stack" og "Tetris" fra den nye tavle.

## Fase 1 – Motor (TDD)
- [x] `config.ts`, `pieces.ts` (former, SRS-kicks, 7-bag); test.
- [x] `engine.ts`: spawn, bevægelse, DAS/ARR, rotation med kicks, tyngde, blød/hårdt drop, lock delay og nulstillinger, hold; test.
- [x] Rækker, point, T-spin, back-to-back, kombo, tom container, niveauer, game over; test.
- [x] `autoplay.ts`: simpel AI til demo og lang simulation (determinisme, rækker ryddes); test.

## Fase 2 – Grafik, effekter, lyd og tekster
- [x] `labels.ts`, `effects.ts`, `audio.ts` (test).
- [x] `sprites.ts` + `render.ts`; `CargoMarquee.tsx` med AI.
- [x] Skærmbilleder gennemses og poleres.

## Fase 3 – Skal og Arcade
- [x] `CargoStack.tsx`: menu, fordybet spilleflade, taster med kø, pause, game over, genstart, gem score og runde.
- [x] Kabinet-tema `cargo`; Arcade-flise "Cargo Stack" med slank tilbage-bjælke.

## Fase 4 – Creator Panel, Electron og assistent
- [x] Creator Panel: ny tavle + tværgående highscores, gammel Tetris-tavle markeret.
- [x] `teamReadPolicy.cjs`, `assistantContext.cjs`, `assistantKnowledge.cjs`, `assistantAppGuide.cjs` + tests (RØD først).

## Fase 5 – Verifikation
- [x] `vitest run`, Electron-tests, `tsc -b`, `npm run build`.
- [x] `scripts/verify-cargo-stack.cjs` på midlertidige data (dev og produktionsbuild); de andre spils verifikationer igen.
- [x] Kodereview og ret fund; opdatér planen; genstart dev-vinduet pænt.

Start med fase 1.

## Status
- [ ] Slet det gamle `src/components/Tetris.tsx`: afventer brugeren, da filen har ucommittede ændringer.
- [x] E2e-tjek af navne i Hall of Fame og Creator Panel venter nu på teksten i alle fire verifikationer (var tidsafhængige).
