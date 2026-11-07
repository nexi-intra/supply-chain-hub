# Alle gem-knapper: hurtige og tydelige (1.6.7)

Brugeren 07.11: "har du virkelig tjekket alle knapper i appen der gemmer ting? de skal være perfekte og gemme hurtigt".
Svar: nej – kun mønstersøgning. Slet ferie viste hullet (gemte rigtigt, men opdaterede den forkerte liste).

## Det vi ved (målt)

- Hver gemning på M: tager lige nu 14–90 s (`main.log` 07.11: vacation-entries 84 s, emails 86 s, client-versions median 14 s, multiplayer-kommando median 23 s).
- Altså: en knap der venter på drevet = mindst 15 s uden svar. Det kan kun løses ved at skærmen ikke venter.

## Regler for hver gem-handling

1. **Straks**: skærmen viser resultatet med det samme (liste opdateret, dialog lukket, toast) og gemmer i baggrunden. Fejler det: rul tilbage + fejlbesked. ALLE steder der viser samme data opdateres (ikke kun én liste).
2. **Må vente** kun når svaret skal komme fra drevet/backend (opret optælling, lås, log ind, hent SAP, eksport/fil) – så med spinner på knappen og knappen låst.
3. Aldrig to gemninger efter hinanden, når de kan køre samtidig.
4. Ingen knap uden synlig reaktion.

## Fase 1 – Kortlægning

- [x] AST-værktøj (`inventory-writes.cjs`, session-filer) finder hver funktion der afventer en skrivning, også gennem hjælpefunktioner: 214 funktioner, 113 venter på drevet før skærmen reagerer, 54 uden UI (hjælpere/baggrund), 47 allerede straks.
- [x] Opdelt i 5 modulgrupper: admin (51/44 venter), lager-optælling (44/24), placeringer (10/9), guides (29/17), hub/øvrige (80/19).

## Fase 2 – Gennemgang og rettelse pr. modul (parallelt, adskilte filer)

- [x] A. Manager/Admin/Creator + ferie-dialoger + onboarding (fælles `useOptimisticList`; flere ferieansøgninger = én skrivning)
- [x] B. Lagerstyring – optælling, status, SAP-tjek, regler (`count/optimisticState.ts` lagt over hver poll; "godkend alle uden difference" én skrivning i stedet for én pr. materiale; luk/genåbn/hent SAP/opret/slet samlet)
- [x] C. Lagerstyring – placeringer (`locationActions.ts`: baggrund i klik-rækkefølge + værn mod forældet genlæsning; daglige handlinger låser 4 filer i stedet for 6 – en handling beslutter kun ud fra låste nøgler; udgiv = 1 skrivning)
- [x] D. Guides, opslag, nyheder (kladder ejes af biblioteket; godkend beholder den sikre rækkefølge, men skærmen reagerer straks)
- [x] E. Hub, profil, login, kalender, vagtplan, mails, noter, links, spil-highscores (`kvChanges.ts`: kun ændrede elementer gemmes; Forbedringer = 1 skrivning pr. handling)
- [x] Spil (lead): chat låser ikke brættet; kommandoer i kø (`gameCommandQueue.ts`), så et træk altid har den rigtige revision
- [x] Registret (lead): tildel team, ekstra manager, opret/ret team, glem bruger skrev SYNKRONT → hele appen frøs 15–90 s. Nu async med samme låsefil (`lockedAsync` i `registry.cjs`, 3 nye tests); team-oversigter læser brugere parallelt og async.

## Fase 3 – Samlet verifikation

- [x] Typecheck 0 fejl; vitest 1593 (1 skipped); node 1672 (1 skipped) – assistentens subprocess-test er tidsfølsom under fuld belastning og består alene.
- [x] Ustabil test "slet optælling" afslørede en rigtig fejl: en journal-upload i gang kunne skrive en fil til M: EFTER at optællingens filer var slettet. `journal.stop()` venter nu på igangværende upload/lokal gemning og skriver ingen flere bidder (ny test, rød før rettelsen).
- [x] Inventar igen: 113 → 37 "venter"; de resterende er regel 2 (login, opret optælling, SAP-dokumenter, import, rapport, opdatering, mappevalg), læsninger som værktøjet tæller med, eller fejlhåndtering efter en baggrundsgemning.
- [ ] Nyt lokalt build, commit

## Ikke gjort (bevidst)

- Tilmelding af ny bruger (authService) skriver stadig synkront under login-låsen – sjælden, sikkerhedskritisk.
- Madplanens uger har intet `id`, så "dagens ret" på Hub kan halte efter en ændring, indtil gemningen er færdig (formatændring ville bryde 1.6.6).
- Lobby i spil (udfordr/accepter) venter med spinner – serveren opretter spillet.
- Selve skrivningen på M: (15–90 s i dag) kan ikke gøres hurtigere uden at ændre låse-/filformatet, som 1.6.6 deler. IT: undtag Hub-mappen fra on-access-scanning.
