# 1.6.3 - samlet plan (backlog + nye funktioner)

Oprettet: 2026-10-13. Arbejdes i `Supply-Chain-Hub 1.6.3` (branch `develop/1.6.3`). Ingen build, push eller skrivning til M: uden aftale.
Udføres fase for fase med en frisk subagent pr. fase og uafhængig verifikation bagefter (tsc, vitest, Electron-tests, relevante E2E).

## Beslutninger (aftalt med brugeren 2026-10-13)

- High-fives kan sendes til alle godkendte kolleger på tværs af teams (som Multiplayer).
- Nye Hubert-handlinger (altid forslag, som brugeren bekræfter): meld syg, hjemmearbejde en dag, note i Notesbogen, besked til en kollega, team-to-do, high-five. (Ikke forbedringsforslag.)
- Morgenbriefing: når man åbner Hubert første gang om dagen, og når man spørger ("godmorgen", "hvad skal jeg i dag?").
- Emojis i Multiplayer: fast sæt på 6-8 emojis; popper op hos modstanderen, når hun er i spillet eller næste gang hun åbner det.
- Kortnavne på vagtopgaver ("Lead" ~ "leader") løses med træning af Hubert, ikke med en regel i appen.
- Finsk gennemlæsning sker ved en kollega. Drag-ydelse i Multiplayer droppes.
- Vagtbytte er ikke relevant.

## Fase 1 - rettelser med det samme

- [x] Notesbog: fjern modulets egen notifikationsliste ("Markér alle som læst"); ændringer i delte noter kommer kun i klokken på Hubben, og klik/slet dér markerer også noten som læst i `notebook-notifications`.
- [x] Hubert: strukturerede `sources` (recordId/owner o.l.) må ikke bære kollegers e-mail ud til brugerfladen.
- [x] Hubert-guiden for Team Oversigt nævner, at man kan spørge Hubert om andre teams' vagtplaner (da/en/fi/sv).

## Fase 2 - high-fives

- [x] Hovedproces-service (som Forbedringer/Multiplayer) med validering, gemt i `_shared`, modtager fra den godkendte medarbejderliste, ingen creator.
- [x] Send en high-five (modtager, kort besked, valgfri emoji) fra Hubben; modtageren får den i klokken (+ Windows-notifikation).
- [x] "High-fives" på Hubben: de seneste, man har fået, og teamets seneste.
- [x] Tests + E2E.

## Fase 3 - emojis i Multiplayer-spillene

- [x] Fast sæt emojis (fx 👏 🔥 😂 😮 🎉 🐶) som "reaktion" i Word-Puzzle og skak - ikke et træk, ændrer ikke revisionen (som Hubert-godbidder).
- [x] Popper op på modstanderens skærm, når hun er i spillet eller næste gang hun åbner det; ingen notifikationer i modulet.
- [x] Begrænsning mod spam; tests + E2E.

## Fase 4 - Ctrl+K søger i alt

- [x] Søgning i moduler, guides, Knowledge Base, kolleger, noter, to-dos, forbedringer og beskeder (kun det, brugeren har adgang til), uden ekstra ture til M: ved hvert tastetryk.
- [x] Resultater åbner det rigtige sted (dybe links). Tests + E2E.

## Fase 5 - "Min uge" på Hubben

- [x] Ny widget (kan skjules/størrelse som de andre): mine vagter (inkl. gentagne), ferie/afventende ansøgninger, hjemmearbejde, to-dos og frister, guide-reviews - for denne uge.
- [x] Tests.

## Fase 6 - Huberts morgenbriefing

- [x] Første gang Hubert åbnes om dagen: kort overblik (vagter i dag, to-dos der forfalder, hvem der er væk i teamet, reviews). Også ved "godmorgen" / "hvad skal jeg i dag?". da/en/fi/sv.
- [x] Tests.

## Fase 7 - flere Hubert-handlinger

- [x] Meld syg, hjemmearbejde en dag, note, besked, team-to-do, high-five - som forslag med bekræftelse, i da/en/fi/sv, med samme rettighedstjek som i modulerne.
  - Genkendelse: `electron/assistantTeamActions.cjs` (på brugerens egne ord, emoji bevaret). Skrivning efter "Bekræft" via delte funktioner: `src/lib/sickLeave.ts`, `src/lib/moduleWrites.ts` (også brugt af Notesbog, To-do-tavlen og Email), high-five via `electronHighFives`.
  - Besked kun til kolleger i eget team; high-five på tværs af teams; aldrig til "alle" (masseudsendelse afvises stadig); sletning/godkendelse afvises stadig.
- [x] Tests: `assistantTeamActions.test.cjs`, rettighedsmatrix (observatør afvist, ingen skrivning), `moduleWrites.test.ts`, E2E `scripts/verify-hubert-actions.cjs`.

## Fase 8 - træning og afslutning

- [x] Hubert-træningsrunde: korte opgavenavne, de nye handlinger, briefing, high-fives, emojis.
  - `assistantTrainingRound15.cjs` (53 spørgsmål + 5 paritetsrækker), `assistantRoleNames.test.cjs`; "hvem er lead i dag?" o.l. giver nu teamets svar for rollen.
- [x] Hubert-guide for alle nye funktioner; "Hvad er nyt" for 1.6.3.
- [x] Fuld verifikation: tsc 0, Electron 1183/1183, vitest 1364 (+1 skip), E2E: improvements x2, multiplayer, skak (bestod ved genkørsel; første kørsel timeout ved remis-banner), command-search, min uge, morgenbriefing, Hubert-handlinger.

## Fase 9 - Hubert som rigtig 3D-model

- [x] Se `plans/hubert-3d-model.md` (Meshy-model på Huberts skelet, alle strimler, nyt chat-ikon).

## Fase 10 - sygdomsdata gemmes kun til dagen er omme (aftalt med brugeren 2026-10-13)

Beslutning: hubben må vise, at nogen er syg i dag (og en sygemelding, der allerede er meldt for de kommende dage),
men sygdom må ikke gemmes som historik eller statistik.

- [x] Automatisk sletning: når en sygemelding er slut (slutdato, ellers startdato, er før i dag), slettes den fra `sick-leave-entries` i alle teams. Også de automatiske "Sygemelding/Barn syg"-beskeder (`email-notifications` med type `sick-leave`) fra før i dag. Kører i hovedprocessen ved opstart og ved datoskift, med samme fil-lås som resten af KV.
- [ ] Engangsoprydning af al eksisterende sygdomshistorik på M: - **kun efter brugerens udtrykkelige OK, når 1.6.3 frigives** (kan ikke fortrydes).
- [x] Manager Panel: menuen "Sygdom" (`SickLeaveManager`) fjernes; klokken peger ikke længere derhen. Admin Panels sygdomsliste fjernes også.
- [x] Ingen statistik eller tilbageblik: Hubert, Min uge, Vagtplan, kalender og observatør-visning viser kun i dag og fremad (Hubert svarer fx på "hvem var syg i går?", at hubben ikke gemmer sygdomshistorik).
- [x] Hubert-guide (da/en/fi/sv) og dækningsmanifest opdateres: manager-opgaverne om sygdom fjernes, og der står, at sygdom kun gemmes til dagen er omme.
- [x] Tests: sletteregel (dags dato, flerdags-sygemelding, manglende slutdato, fremtidige), ingen visning af gamle sygemeldinger, Hubert-svar; fuld verifikation.

## Fase 11 - Word-Puzzle "Top 10 ord" opdateres ikke altid live (meldt af brugeren 2026-10-13)

Sag: BILMOTOR (57 point, Jacob mod Michael Andersen, 13-10 kl. 14:38) kom ikke på Top 10, selvom spillet stadig er i gang.
Top 10 opdateres faktisk ved hvert træk og ikke først når spillet er slut. Data på M: (kun læst) viser, at trækket blev gemt i
spilfilen, men skrivningen til det fælles indeks fejlede (Michael fik heller ikke sin "din tur"-besked kl. 14:38).
Ved næste læsning blev indekset repareret (`heal`), men reparationen tog ikke ordet med til Top 10.

- [x] `heal()` lægger alle spillets ord ind i Top 10 (idempotent pr. spil og træk), så et ord kommer med, så snart spillet læses igen. Det sker ved genforsøg, eller når modstanderen åbner spillet eller trækker. Test: `multiplayer.test.cjs` "a word whose index write failed ...".
- [x] BILMOTOR gendannet på M: med `node scripts\backfill-top-words.cjs --apply` (brugerens OK 2026-10-13); nr. 2 på listen.
- [ ] Overvej: `heal()` genskaber også en mistet "din tur"-besked til modstanderen.
