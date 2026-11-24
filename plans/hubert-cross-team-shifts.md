# Hubert: vagtplan på tværs af teams (1.6.2)

Oprettet: 2026-10-12. Ønske: man skal kunne spørge Hubert om andre teams' vagtplan, fx "hvad laver Frederik Torp i denne uge?" og "hvem har lukkevagt i TCD i denne uge?".

## Beslutninger (aftalt med brugeren 2026-10-12)

- Alle godkendte brugere må spørge (som hjemmearbejde/ferie-overblikket på Hubben). Observatør-hubs holder sig til deres tildelte teams som i dag.
- Hubert viser kun navn, dag og opgave. Kommentarer fra vagtplanen vises aldrig.
- Gentagne vagter (mønstre) regnes med overalt, også i eget team, som i vagtplanen: en rigtig vagt for samme person og opgave vinder, og godkendt ferie/sygdom fjerner mønster-vagten.
- Kun Hubert ændres. Vagtplan-modulet og Hubben viser fortsat kun eget team.

## Fase 1 - vagter regnet rigtigt

- [x] `electron/assistantShifts.cjs`: udfold gentagne vagter (port af `expandShiftPatterns`/`matchesShiftInterval`), saml med enkeltvagter, uden kommentarer.
- [x] Opgave-navne i spørgsmålet ("lukkevagt", "lukkevagten") filtrerer svaret til den opgave.
- [x] Brug i både vagt-sporet (`assistantContext.cjs`) og "hvad laver X"-sporet (`assistantInsights.cjs`).

## Fase 2 - på tværs af teams

- [x] Et navngivet andet team ("i TCD") er tilladt for vagt-spørgsmål (ikke længere "ingen adgang").
- [x] En person fra et andet team findes, når hun ikke er i eget team ("hvad laver Frederik Torp i denne uge?").
- [x] Uden team-navn og uden person fra et andet team: kun eget team som i dag.
- [x] Afvisningsteksten nævner, at vagtplaner kan slås op på tværs (da/en/fi/sv).
- [x] Noter, beskeder, guides, kommentarer og adgangskoder fra andre teams læses aldrig (test).

## Fase 3 - verifikation

- [x] Tests (da/en/fi/sv), hele Hubert-banken, tsc, vitest, Electron-tests.
