# Plan: Hubert kan udføre handlinger (ferieanmodning + personlig to-do) - FAERDIG

Foelger `.github/agents/hubert-engineer.agent.md`s regler: enhver handling
kraever eksplicit brugerbekraeftelse foer noget skrives, og skal genbruge den
SAMME validerede kode-sti som de manuelle formularer bruger.

## Arkitektur

Hubert's svar-pipeline koerer i en isoleret worker-subproces
(`assistantContext.cjs` via `assistantWorker.cjs`) der KUN har laeseadgang
(`readTeam`/`readShared`) - det er en bevidst sikkerheds-graense. Derfor
skriver worker-processen ALDRIG data:

1. Worker'en genkender en handlings-hensigt (regex, samme moenster som
   `assistantInsights.cjs`s INTENTS) og returnerer et FORSLAG
   (`mode: 'action-proposal'`) med udtrukne parametre - ren laesning, ingen skrivning.
2. Renderer'en (`HubAssistant.tsx`) viser forslaget som et bekraeftelseskort.
3. Kun naar brugeren trykker "Bekraeft" kalder renderer'en den PRAECIS SAMME
   delte funktion som den manuelle dialog/formular allerede bruger
   (`submitVacationRequest`/`createPersonalTodo`) - samme validering, samme
   KV-skrivevej, samme rettigheds-haandhaevelse, ingen ny IPC-overflade.

## Trin

- [x] `electron/assistantActions.cjs` (ny): `detectActionIntent(question, language, resolveDates, now)`
      - regex-baseret paa da/en/fi, genbruger `resolveDates` til datoer
      - genkender: ferieanmodning (start/slut-dato + valgfri note) og
        personlig to-do (titel + valgfri beskrivelse)
- [x] `electron/assistantActions.test.cjs`: dato-udtraek, sprog-varianter,
      ingen falske positiver paa almindelige spoergsmaal
- [x] `assistantContext.cjs`: kalder `detectActionIntent` tidligt i `query()`
      (foer insight/knowledge), returnerer `{ mode: 'action-proposal', ... }`
- [x] `main.cjs`: `action-proposal` tilfoejet til det tidlige data-mode-tjek
      (samme revalidering af rettigheder som 'data'/'unsupported')
- [x] `src/lib/assistantBridge.ts`: `AssistantAnswer` udvidet med
      `actionProposal?: { type, params, summary }`
- [x] `src/lib/vacationRequests.ts` (ny): `submitVacationRequest(...)` -
      udtraekker `VacationRequestDialog.tsx`s eksisterende logik uaendret
- [x] `src/lib/personalTodos.ts` (ny): `createPersonalTodo(...)` - udtraekker
      `ProjectBoard.tsx`s eksisterende logik uaendret
- [x] `VacationRequestDialog.tsx` + `ProjectBoard.tsx`: bruger nu de delte
      funktioner i stedet for inline-logik (samme adfaerd, DRY)
- [x] `HubAssistant.tsx`: bekraeftelseskort for `action-proposal`-svar,
      henter `userEmail` via `window.electronAuth.current()`, kalder den
      delte funktion ved bekraeftelse, viser resultat i chatten
- [x] `npx tsc --noEmit`, `node --test electron/assistant*.test.cjs`,
      `npx vitest run`

**Fundet + rettet undervejs:** foerste udgave af `VACATION_TRIGGERS` matchede
ogsaa OPSLAGS-spoergsmaal som "hvor mange ferieanmodninger afventer?" (et
eksisterende assistantKnowledge-testtilfaelde), fordi den bare tjekkede for
ordet "ferieanmodning" uden krav om et oprettelses-udsagnsord. Rettet til at
kraeve verbum+objekt direkte sammen, plus en eksplicit `LOOKUP_MARKERS`-liste
("hvor mange", "afventer", "status", "hvem" osv. paa alle 3 sprog) der helt
udelukker handlings-genkendelse ved opslagsord. 369/369 electron + 93/93
vitest groenne efter fix.
