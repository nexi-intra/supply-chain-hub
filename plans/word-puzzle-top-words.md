# Word-Puzzle: Top 10 over de bedste ord (1.6.2)

Oprettet: 2026-10-12. Ønske: en highscore i Word-Puzzle-lobbyen over de bedste lagte ord - hvem, hvilket ord og hvor mange point. Kun Top 10.

## Beslutninger (aftalt med brugeren)

- Rangeres efter hele trækkets point (krydsord og +50 for alle 7 brikker tæller med). Hovedordet vises.
- Én fælles Top 10 for alle sprog, med flag ved hvert ord.
- Ord fra spil, der allerede er spillet, hentes én gang med et script (læser kun, skriver først med `--apply` og brugerens tilladelse).
- Uafgjort: det tidligst lagte ord står øverst.

## Fase 1 - data (hovedprocessen)

- [x] `electron/games/wordPuzzle/topWords.cjs`: ord fra et spils træk, fletning til Top 10 (uden dubletter), læsning af gemte data.
- [x] `multiplayer.cjs`: hvert lagt ord (også godkendte ukendte ord) flettes ind i `multiplayer-index.topWords` i samme skrivning som indeks-opdateringen.
- [x] Snapshot: `topWords` med ord, point, sprog, navn, team, tidspunkt og "mig". Spil-id'er og e-mails sendes ikke med.
- [x] Ældre klienter (1.6.1) bevarer feltet, når de skriver indekset (de kloner hele indekset).
- [x] Tests (topWords, service, omdøbning af e-mail).

## Fase 2 - lobbyen

- [x] Panel "Top 10 ord" i Word-Puzzle-lobbyen ved siden af ranglisten (da/en/fi/sv).
- [x] E2E: et lagt ord dukker op i Top 10 med navn og point.
- [x] Hubert-guide: hvor man ser Top 10 (da/en/fi/sv, med test).

## Fase 3 - gamle spil (kun med tilladelse)

- [x] `scripts/backfill-top-words.cjs`: læser alle Word-Puzzle-spilfiler og viser Top 10 (tør-kørsel). Afprøvet på isolerede data: resultatet er identisk med det, spillet selv gemmer, og en ny kørsel giver ingen dubletter.
- [x] Tør-kørsel mod M: (2026-10-12): 21 spil, 326 træk; nr. 1 er EGOISTS 66 point.
- [x] Ved udrulning af 1.6.2 (aftalt med brugeren 2026-10-12): `node scripts\backfill-top-words.cjs --apply` kørt 2026-10-12 (21 spil, 334 træk, 10 ord gemt). Kan køres igen uden dubletter.

## Verifikation

- [x] tsc 0, vitest 1253, Electron-tests 1096/1096, Hubert 544/544, E2E Word-Puzzle 19/19, skak 14/14, Forbedringer grøn.
