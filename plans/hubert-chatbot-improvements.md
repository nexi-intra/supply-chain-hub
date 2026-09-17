# Plan: Hubert chatbot-forbedringer (opfoelgning paa action-skills)

Baggrund: efter "opret ferieanmodning"/"opret to-do" action-skills blev
implementeret, bad brugeren om forslag til yderligere forbedringer ud fra
generel chatbot-viden, og bad derefter om at implementere dem alle
("ja goer det hele").

## Fase 1: Multi-turn parameter-afklaring for handlinger
- [x] `detectActionIntent` accepterer `previousQuestion` og genkender en
      opfoelgning ("fra 2026-10-05 til 2026-10-10", "ring til IT om
      printeren") som svar paa et tidligere UFULDSTAENDIGT handlings-forslag
      (udsagnsord til stede, men dato/titel manglede)
- [x] Sikkerhed mod falske positiver: opfoelgning kraever (a) det forrige
      spoergsmaal reelt manglede parameteren (`extractDateRange`/
      `extractTodoTitle` paa PREV er null - ikke bare tilstedevaerelse af
      udsagnsordet), (b) nuvaerende spoergsmaal er ikke selv et nyt
      spoergsmaal (ingen "?" eller hvem/hvad/hvornaar-ord), (c) hverken PREV
      eller nuvaerende matcher `LOOKUP_MARKERS`
- [x] `assistantContext.cjs` sender `previousQuestion` videre til
      `detectActionIntent`
- [x] Nye tests i `assistantActions.test.cjs` + fuld regression

## Fase 2: Log ubesvarede spoergsmaal (mode: 'unsupported')
- [x] `main.cjs`s `assistant:ask`-handler skriver et best-effort KV-log
      (`hubert-unanswered-questions`) naar svaret er `mode: 'unsupported'` -
      kun sporgsmaalstekst, sprog, viewId, tidspunkt (ingen email/token)
- [x] Fejl i logningen maa ALDRIG bryde selve svaret til brugeren
- [x] Tests for logningen (ny ren modul `assistantUnansweredLog.cjs`)

## Fase 3: "Var dette svar nyttigt?"-feedback
- [x] Ny delt `src/lib/hubertFeedback.ts`: `submitHubertFeedback(...)` -
      samme moenster som `vacationRequests.ts`/`personalTodos.ts`
- [x] `HubAssistant.tsx`: 👍/👎-knapper under hvert besvaret Hubert-svar;
      eet klik, derefter "tak for din feedback" (ingen gentagne klik)
- [x] Tests for `hubertFeedback.ts`

## Fase 4 (bevidst UDSKUDT, ikke lavet)
Streaming af AI-svar er en stoerre arkitekturaendring (localAI.complete
koerer llama.cpp som en subprocess og venter paa hele svaret; at streame til
UI kraever nye IPC-events + delvis re-rendering af svar-teksten undervejs).
Vurderes ikke at staa maal med risikoen i denne omgang - noteret som forslag
til en separat, fremtidig opgave.

## Validering
- [x] `npx tsc --noEmit`
- [x] `node --test electron/*.test.cjs` (379/379)
- [x] `npx vitest run` (97/97)
