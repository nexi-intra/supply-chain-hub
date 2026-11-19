# Backgammon i Multiplayer (1.6.3) - plan

Oprettet 2026-10-13 (brugeren: "byg et backgammon spil i samme stil med skak og word puzzle. Samme rum og logik osv
som de andre multiplayer spil"). Bygges i samme fil-baserede multiplayer-service som skak/Word-Puzzle
(`electron/multiplayer.cjs`, `_shared/multiplayer-index` + `_shared/multiplayer/game-<id>` på M:).

Regler (standard backgammon, uden doblingsterning):
- 15 brikker hver, startopstilling 2-5-3-5. Hvid flytter 24 -> 1, sort 1 -> 24.
- Åbningsslag: hver sin terning, højeste starter og bruger begge (ved lighed slås om).
- Serveren slår terningerne (aldrig klienten). Dobbelt = fire træk.
- Brikker på baren skal ind først. En enlig brik (blot) kan slås. Et punkt med 2+ modstanderbrikker er lukket.
- Man skal bruge så mange terninger som muligt; kan kun én bruges, skal det være den højeste, hvis den kan.
- Bear-off når alle 15 er i hjemmebrættet; højere terning må bruges fra højeste punkt.
- Sejr: alle 15 af. Gammon (2) hvis taberen ikke har fået nogen af, backgammon (3) hvis taberen også har en brik
  på baren eller i vinderens hjemmebræt. Opgivelse = enkelt sejr til modstanderen.
- Ingen gyldige træk: spilleren ser terningerne og trykker "Videre" (tom tur).

## Fase 1 - regelmotor (TDD)
- [x] `electron/games/backgammon/rules.cjs`: start, åbningsslag, lovlige træk-sekvenser (max terninger + høj terning),
      anvend tur, bear-off, vinder/gammon, projektion pr. spiller.
- [x] `rules.test.cjs`: startstilling, bar, slag, lukkede punkter, dobbelt, maks-regel, høj-terning-regel, bear-off
      (præcis/højere), gammon/backgammon, ugyldige sekvenser afvises.

## Fase 2 - service
- [x] `multiplayer.cjs`: spiltype `backgammon`, udfordring, `bg-move` (hele turen på én gang), opgiv, chat, Hubert,
      emojis, notifikationer, statistik/rekorder, Top 10 ignorerer backgammon.
- [x] Tests i `multiplayer.test.cjs` (udfordring -> tur -> sejr, forkert tur, gentagelse, revision-konflikt).

## Fase 3 - brugerflade
- [x] `src/lib/backgammon.ts` (klientens trin-generator; paritetstest mod `rules.cjs`).
- [x] Bræt i samme rum som skak (`BoardGameRoom`, Hubert, chat, emojis, opgiv), terninger, flyt ved klik.
- [x] Lobby (`BackgammonLobby.tsx`), flise i Multiplayer-hubben, udfordrings-dialog, klokke-notifikationer, labels da/en/fi/sv.

## Fase 4 - Hubert, test og "Hvad er nyt"
- [x] Hubert-guide + dækningsmanifest (da/en/fi/sv), `assistantMultiplayer` kender backgammon.
- [x] E2E `scripts/verify-backgammon.cjs` (isoleret data): udfordring, accept, træk, chat, opgiv.
- [x] tsc, Electron-tests, vitest, alle E2E. Linje i "Hvad er nyt". (tsc 0, Electron 1207+, vitest 1368, alle 9 E2E bestået 2026-10-13.)
