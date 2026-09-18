# Plan: Guide Bibliotek - stagger naeste-tjek-dato + ansvarlig person

## Fase 1: Datamodel
- [x] `Guide.responsibleEmail?: string` (guideTypes.ts) - adskilt fra `author`/`createdBy`
- [x] Samme felt i `GuideVersionSnapshot` og `GuideDraft` (autosave)
- [x] `computeNextReviewAt` genbruges uaendret - tager allerede en vilkaarlig
      `fromTimestamp`, saa en brugervalgt anker-dato er blot et andet
      `fromTimestamp` end "nu"

## Fase 2: Braugervalgt anker-dato for naeste tjek (GuideEditor.tsx)
NOTE (endte simplere end oprindeligt beskrevet): feltet er ikke et separat
"anker der lægges til intervallet" - det ER direkte `nextReviewAt`, forudfyldt
med en fornuftig standard. Det undgaar en "extends-ved-hver-redigering"-fejl:
med anker+interval-matematik ville en helt almindelig redigering af en guide,
der allerede har en planlagt dato, utilsigtet skubbe datoen laengere ud
(anker = eksisterende dato, + interval igen). Direkte redigerbar dato uden
gentaget interval-tillaeg loeser stagger-behovet uden den bivirkning.
- [x] Nyt felt "Beregn naeste tjek fra" (DatePickerField), default = i dag,
      KUN vist naar et interval er valgt
- [x] Aendrer interval -> foreslaar automatisk anker = i dag (brugeren kan
      stadig aendre det bagefter)
- [x] Ved redigering af en eksisterende guide: forudfyld ankeret med guidens
      NUVAERENDE `nextReviewAt`, saa en almindelig redigering ikke utilsigtet
      flytter tjek-datoen
- [x] Ved gem: `nextReviewAt = reviewInterval ? dateStringToTimestamp(nextReviewDate) : null`
      (feltets vaerdi bruges DIREKTE, ingen ekstra interval-tillaeg ved gem) -
      i stedet for altid `computeNextReviewAt(now, reviewInterval)`
- [x] Medtages i autosave-kladden (GuideDraft)

## Fase 3: Ansvarlig person (GuideEditor.tsx + GuideLibrary.tsx)
- [x] Ny prop `users` (email+fuldt navn) sendes ned fra GuideLibrary til
      GuideEditor (samme kilde som `usersByEmail` allerede bruger)
- [x] Ny Select "Ansvarlig for gennemgang" - default forfatteren selv, men
      kan aendres til enhver anden bruger i teamet
- [x] Gemmes som `guide.responsibleEmail`, medtages i autosave-kladden

## Fase 4: Visning + paamindelser
- [x] `GuideCard.tsx`: viser "Ansvarlig: <navn>" ved siden af forfatter
- [x] `GuideLibrary.tsx`: udregner `responsibleName` ligesom `authorName`
- [x] `GuideReviewAlert.tsx`: den TIDLIGE paamindelse (10 dage foer frist)
      gaar nu til `responsibleEmail` (falder tilbage til `author` for aeldre
      guides uden ansvarlig sat) i stedet for altid kun forfatteren

## Fase 5: Oversaettelser (da/en/fi)
- [x] Nye noegler i `t.guideEditor` og `t.guideCard`

## Fase 6: Validering
- [x] `npx tsc --noEmit`
- [x] `npx vitest run`
