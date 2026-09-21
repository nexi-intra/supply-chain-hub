# Gem som kladde - og arbejd videre senere

## Baggrund (undersoegt 2026-09-21)

Der findes allerede en kladde-funktion, men den kan ikke bruges til det
brugeren beder om.

Det virker i dag:
- `GuideEditor.tsx` autogemmer hvert 4. sekund til `guide-draft-<guideId>`.
- En ny guide faar sit id med det samme (`newId('guide')`), saa autogem virker
  ogsaa for en guide der aldrig er blevet gemt.
- Aabner man SAMME guide igen, vises et banner: "Ugemt kladde fundet" med
  Genskab/Forkast.

Det er i vejen for oensket:
1. **Kladden SLETTES naar man forlader editoren.** `onConfirmedExit` kalder
   `deleteDraft(draftId)`. Forlader man altsaa en guide man er i gang med, er
   arbejdet vaek - praecis det modsatte af "gem som kladde".
2. **En ny guides kladde kan aldrig findes igen.** Hver gang man trykker
   "Ny guide" laves et FRISK id, saa noeglen til den gamle kladde er tabt.
   Kladden bliver til foraeldede data ingen kan naa.
3. **Der er ingen oversigt over kladder.** De genskabes kun hvis man tilfaeldigvis
   aabner den samme udgivne guide igen.

## Fase 1 - kladden skal overleve at man gaar ud

- [x] `onConfirmedExit` maa ikke slette kladden; den skal beholdes
- [x] Tilfoej en tydelig "Gem som kladde"-knap der gemmer og lukker
- [x] Bevar "Forkast kladde" som den eneste vej til bevidst sletning
- [x] Ryd op i billeder der kun hoerer til en forkastet kladde
      (omvendt: billeder BEVARES naar kladden beholdes - ellers ville kladden
      pege paa billeder der var slettet som "ubrugte")

## Fase 2 - find og genoptag sine kladder

- [x] `listDrafts(userEmail)` i `guideStore.ts` via `window.kv.keys()`
- [x] Kun egne kladder (`savedBy`), nyeste foerst
- [x] Kladde-oversigt i Guide Bibliotek med titel og tidspunkt
- [x] Genoptag aabner editoren med kladdens indhold OG dens id
- [x] Slet-knap pr. kladde
- [x] Hoerer kladden til en UDGIVET guide, aabnes den som redigering af den
      guide - ellers ville et gem oprette en dublet

## Fase 3 - afpudsning

- [x] Oversaettelser (da/en/fi) for alle nye tekster
- [x] Tests for `listDrafts` og `draftLabel` (10/10)
- [x] Changelog

## Aabne spoergsmaal

- [x] Kladder ligger i teamets KV. Besluttet 2026-09-21: det er fint, da alt
      paa drevet er AES-256-GCM-krypteret. `savedBy` filtrerer visningen.
