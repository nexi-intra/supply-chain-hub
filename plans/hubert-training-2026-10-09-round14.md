# Hubert-træning runde 14 (chatbot-trainer, fix-mode) – 2026-10-09

Opgave (godkendt af brugeren: «Ja tak!»): alle datoer i Hubert-svar vises naturligt og ens på da/en/fi/sv (ikke ISO), ét delt formateringsmodul, årstal kun når det afviger fra «nu». Kun deterministiske lag; den lokale LLM (`localAI.cjs`, `aiModels.cjs`), `main.cjs`, `assistantWorker.cjs`, 1.6.0 og M: er ikke rørt. Ingen `src/`-ændring.

## Beslutninger (formater)
| | da | en | fi | sv |
|---|---|---|---|---|
| dag | onsdag 16. sep. | Wed 16 Sep | keskiviikko 16.9. | onsdag 16 sep. |
| interval (samme måned) | 16.–20. sep. | 16–20 Sep | 16.–20.9. | 16–20 sep. |
| interval (over måneder) | 28. sep.–2. okt. | 28 Sep–2 Oct | 28.9.–2.10. | 28 sep.–2 okt. |
| andet år | onsdag 16. sep. 2027 | Thu 16 Sep 2027 | torstai 16.9.2027 | torsdag 16 sep. 2027 |
| over årsskifte | 28. dec. 2026–3. jan. 2027 | 28 Dec 2026–3 Jan 2027 | 28.12.2026–3.1.2027 | 28 dec. 2026–3 jan. 2027 |
- Månedsforkortelser: da jan. feb. mar. apr. maj jun. jul. aug. sep. okt. nov. dec.; sv jan. feb. mars apr. maj juni juli aug. sep. okt. nov. dec.; en Jan–Dec; fi numerisk (d.m.). Samme stil som appens egen UI (date-fns `d. MMM`).
- Overskrift for én dag: i dag / i morgen / i går (today / tomorrow / yesterday, tänään / huomenna / eilen, idag / imorgon / igår) + komma + ugedag og dato, ellers kun ugedag og dato; ordet står aldrig alene (ugedag og dato bevares, så det er lavrisiko). Lister og sætninger bruger ugedag og dato uden ord. Perioder får aldrig relativt ord. Uge-etiketter («uge 38») er uændrede.
- Finsk bøjning: lister og overskrifter bruger nominativ («keskiviikko 16.9.»); «palaa …» og én dags ferie/sygdom i tilbage-sætninger bruger essiv («palaa maanantaina 21.9.»); steder hvor ugedagen ville kræve kasus (loma-anomus «päivälle 18.9.», «eräpäivä 18.9.», «18.9. asti») udelader ugedagen.
- Sætningsslut: slutter en dato på punktum («… mandag 21. sep.») sættes der ikke endnu et punktum (`closeSentence`).
- «nu» kommer altid fra harnessens `now`; mangler `now`, vises året altid (formatteren læser aldrig det rigtige ur).
- Strukturerede felter (`sources[].start/end/recordId`, `actionProposal.params`, `range`, KV-nøgler, gemte data) er stadig ISO.
- Skrevne datoer forstås som før (ISO, 17/9, 17.9., «3. oktober» …). Nyt: to skrevne dage er et interval i handlingsforslag (`opret ferie fra 21. sep. til 25. sep.`), så de eksempler Hubert selv skriver kan skrives tilbage.

## Faser
- [x] Fase 1: læs brief, planer 10–13, nuværende app-guide og datofiler
- [x] Fase 2: baseline (targeted 523/523, bank 1684), kortlægning af ISO i svar (281 linjeformer i svartekst, 455 inkl. kildetitler)
- [x] Fase 3: RED: formatter-enhedstest + ISO-lint over hele banken (`assistantDateLint.test.cjs`: 455 ISO-forekomster)
- [x] Fase 4: `electron/assistantDateFormat.cjs` + indkobling alle steder
- [x] Fase 5: forventninger via uafhængig reference (`assistantDateReference.cjs`), grøn bank, paritet
- [x] Fase 6: nye spørgsmål (19 pr. sprog = 76) + parsing-roundtrip (skrevet tilbage = samme dag) + 19 paritetsrækker
- [x] Fase 7: app-guide / «Hvad kan du?»-tekster tjekket for ISO-eksempler (ingen fundet; tekster scannes nu i lint-testen)
- [x] Fase 8: verifikation (resultater nederst)

## Baseline (før runde 14)
- Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 523/523, exit 0. Bank 1684 spørgsmål (da 500, en 448, fi 369, sv 367), alle PASS, 153 paritetsrækker.
- `git diff` på `assistantAppGuide.cjs` / `assistantAppGuideMoreI18n.cjs` kan ikke isolere brugerens/formatterens ændring (hele grenen er ucommittet, ingen commit at sammenligne med). Filerne er læst i deres nuværende indhold; de indeholder ingen ISO-datoer eller datoeksempler, og ingen af dem er ændret i denne runde.

## Fund og rettelser (fund | lag | RED-test | rettelse | filer)
| # | Fund | Lag | RED-test | Rettelse | Filer |
|---|---|---|---|---|---|
| 1 | ISO-datoer i overskrifter, lister, sætninger, forslag, kildetitler og eksempler (455 forekomster) | svartekst | `assistantDateLint.test.cjs` (RED: 455) | ét delt modul + indkobling alle steder, se «Steder» | `assistantDateFormat.cjs` + 4 moduler |
| 2 | Hubert skrev eksempler brugeren ikke kunne skrive tilbage (`opret ferie fra 2026-09-21 til 2026-09-25`); skrevne dage som «21. sep.» blev ikke læst som interval | intent | `assistantActions.test.cjs` (roundtrip alle sprog) | `extractDateRange(question, now)` læser to skrevne dage; eksempler skrives i Hubert-formatet (`exampleDates`) | `assistantActions.cjs`, `assistantDates.cjs` |
| 3 | Dobbelt punktum efter forkortet dato («… mandag 21. sep..») | polering | bank («tilbage»-rækker) | `closeSentence` | `assistantDateFormat.cjs`, `assistantInsights.cjs` |
| 4 | fi «joulukuussa» (december) blev læst som julen (24.–26.12.) | datoer | Round14 fi (fødselsdage og barsel i december) | `joulu(?!kuu)` | `assistantRelativeDates.cjs` |
| 5 | fi «kuka oli sairaana eilen?» gav generelt tomt svar i stedet for «Kukaan ei ollut sairauslomalla …» (datid `oli` talte som søgeord) | normalisering | Round14 fi | `oli/olivat/ollut` (og `with`) er fyldord | `assistantKnowledge.cjs` |
| 6 | Forbedringer med deadline: en «with a deadline», fi «määräajalla», sv «förfallodatum» gav tomt svar | intent | Round14 en/fi/sv (L) | `IMPROVE_DUE` + fyldordet `with` | `assistantKnowledge.cjs` |
| 7 | «next review» (en) og «seuraava tarkistus» (fi) gav guide-uddrag i stedet for guide-info | intent | Round14 en/fi (K) | guide-info-emnet kender `next review`, `review date`, `tarkistu…` | `assistantKnowledge.cjs` |
| 8 | fi «milloin Mialla on loma?» viste denne uges ferie for alle i stedet for Mias perioder (da/sv/en svarede om personen) | routing | Round14 fi (D) | `milloin` som «hvornår»-ord i vagt/ferie/hjemme-sporet | `assistantContext.cjs`, `assistantKnowledge.cjs` |

Rodårsager: nr. 1–3 hvert modul formaterede selv (ISO eller halvt naturligt, runde 12); nr. 4–8 fandt de nye dato-spørgsmål på tværs af månedsskifte, årsskifte, skuddag og andet år (fi/sv/en-huller i formuleringer, ikke i datoformatering). RED-kørslen af de 76 nye rækker gav 9 fejl (en 2, fi 6, sv 1), alle grønne efter rettelserne.

## Steder der viser datoer (fil + funktion)
- `electron/assistantDateFormat.cjs`: `formatDay`, `formatRange`, `formatHeading`, `formatMonthDay`, `closeSentence` (eneste sted der skriver en dato til en person).
- `electron/assistantInsights.cjs` `insightAnswer`: overskrifter via `rangeLabel` (status, tilgængelighed, fravær, belastning, konflikter, barsel, ja/nej), `briefingFor` (periode + dagslinjer), `personState` (`yes`), `nextVacation` (liste + `nextVacationNone`-eksempel), `back` (`T.<sprog>.backOn/backUpcoming`), `whereIs` (dagslinjer), `parental` (periode + «tilbage …»), `available` (fraværsliste + overskrift), `conflicts` (linjer).
- `electron/assistantKnowledge.cjs` `records()`: vagter, hjemmearbejde (+ gentagelse «fra …»), ferie/barsel, projekter (oprettet/afsluttet), to-dos (forfald), forbedringer (oprettet, frist, svarfrist), noter, beskeder, opslag, fødselsdage (`birthdayText`), fravær (anmodninger), administration (adgangsanmodning udløber), notifikationer (note-alarm, ventende anmodning), guide-info (opdateret, næste gennemgang); `query()`: antal-linje, overskriftsperiode, tomt svar, «ingen er sygemeldt» (`NO_SICK`); `getRecord()` (kildevisning).
- `electron/assistantContext.cjs`: `TEXT.<sprog>.date` (eksempel på dato), opgaveliste, ferieliste, hjemmearbejdsliste og deres overskrift (`formatHeading`).
- `electron/assistantActions.cjs`: `TEXT.<sprog>.vacationSummary`, `vacationNoDates`, `todoSummary`, `exampleDates`, `detectActionIntent`.
- Ingen datoer vises i `assistantMultiplayer.cjs` (indekset har `updatedAt`, men Hubert bruger den kun til sortering; «sidst spillet» findes ikke), `assistantNextStep.cjs` (eksempelspørgsmål uden datoer), app-guide/«Hvad kan du?» (ingen datoeksempler, scannes i lint-testen).

## Bevidst ISO eller uændret
- `sources[].start/end/recordId`, `answer.range`, `actionProposal.params.startDate/endDate/dueDate`, KV-nøgler og gemte data: strukturerede felter som UI og skrivevejen bruger.
- Brugerskrevet fritekst (noter, mails, opslag, guide-/KB-tekst, forbedringsbeskrivelser) vises som data uden at skrive datoer i den om.
- `contextQuestion` (bruges som forrige spørgsmål, vises ikke) og `assistantUnansweredLog` (`createdAt`).
- Versionsnumre (1.6.1) og uge-etiketter («uge 38»).
- `assistantMultiplayer.cjs` viser ingen datoer og er derfor uændret.

## Tests og bank
- `assistantDateFormat.test.cjs` (14 tests): alle fire sprog, årsregel (nu = `now`, uden `now` altid år), intervaller (samme måned / over måneder / over år), skuddag, månedsslut, årsskifte, alle ugedage, alle tolv måneder, overskrifter (i dag/i morgen/i går, månedsskifte, årsskifte), fødselsdage (MM-DD), ugyldigt input (aldrig «undefined»/«NaN»), klokkeslæt ignoreres, `closeSentence`, roundtrip (det Hubert skriver kan skrives tilbage som samme dag).
- `assistantDateLint.test.cjs` (5 tests): ingen svartekst, titel, kildetitel, forslagsresumé, kildevisning (`getRecord`) eller app-guide-tekst indeholder `\d{4}-\d{2}-\d{2}`; strukturerede felter er stadig ISO.
- `assistantDateReference.cjs`: separat skrevet reference (egne tabeller, egen ugedagsberegning efter Zeller) som banken bruger til at gøre ISO-forventninger («Godkendt ferie \(2026-09-21 – 2026-09-27\)») til den naturlige tekst; det gør forventningerne ikke-tautologiske. Runde 14-rækkerne er skrevet ud som naturlig tekst uden ISO og uden kald til formatteren.
- Fixture-valgmulighed `dates` (fake data omkring månedsskifte, årsskifte, skuddag, andet år og barsel over nytår).
- Runde 14-bank: 76 nye spørgsmål (da 19, en 19, fi 19, sv 19): ugeinterval over månedsskifte og årsskifte, én dag i andet år, i går-overskrift, sygdom på månedens sidste dag, fødselsdag i december og skuddag, to-do-forfald, barsel over årsskifte og tilbage-dato, forbedringsfrist i andet år, guide opdateret / næste gennemgang, skrevet ISO-dato, forslag med ISO og med skrevet dato, kommende ferie, madplan fredag, i dag og i morgen. 19 nye paritetsrækker.
- Eksisterende tests omskrevet kontrolleret: ISO-forventninger gennem referencen (`D(/…/, sprog)`) eller skrevet som literal naturlig tekst; `assistantNiceDate.cjs` (runde 12) er slettet fordi alle kaldere bruger det delte modul.

## Verifikation
- Bank: 1684 -> **1760** spørgsmål (da 519, en 467, fi 388, sv 386), alle PASS; 172 paritetsrækker, 0 afvigelser.
- Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 523 -> **544**/544, exit 0.
- Fuld electron-suite (async, alle `*.test.cjs` uden fixtures): **1089/1089**, 0 sprunget over, exit 0 (runde 13: 1068; +14 formatter, +5 lint, +2 actions).
- `tsc -b`: exit 0. Vitest: 111 filer bestået + 2 sprunget over, 1252 bestået + 1 sprunget over, exit 0 (`src/` er ikke ændret).
- Unicode-scan (`\u00`): ingen nye bogstavelige forekomster (kun eksisterende gyldige regex-escapes). Alle berørte filer har ensartede CRLF-linjeskift, ingen BOM, ingen mojibake. Ingen midlertidige filer i projektet.
- Ingen build, commit eller push; intet skrevet til M:; den rigtige ubesvarede-log er ikke læst i denne runde.
- Nye filer: `electron/assistantDateFormat.cjs`, `assistantDateFormat.test.cjs`, `assistantDateLint.test.cjs`, `assistantDateReference.cjs`, `assistantTrainingRound14.cjs`, denne plan. Slettet: `electron/assistantNiceDate.cjs` (runde 12, erstattet). Ændret (min runde): `assistantActions.cjs`, `assistantContext.cjs`, `assistantDates.cjs` (eksport `calendarMatches`), `assistantInsights.cjs`, `assistantKnowledge.cjs`, `assistantRelativeDates.cjs`, `assistantTrainingBank.cjs` (fixture `dates`), `assistantTrainingData.cjs`, `assistantTrainingMore.cjs`, `assistantTrainingRound10.cjs`, `assistantTrainingRound12.cjs` samt testfilerne `assistantActions`, `assistantContext`, `assistantInjection`, `assistantInsights`, `assistantKnowledge`, `assistantPermissionsMatrix`, `assistantQuestionBank`, `assistantSwedish`, `assistantTraining`, `assistantTrainingRound10`, `assistantTrainingRound12`, `assistantTrainingRound13` (kun forventninger).

## Åbne beslutninger
1. Sætninger bruger nu den korte form («mandag 21. sep.») i stedet for runde 12's lange form («mandag den 21. september»). Anbefaling: behold for konsistens; den lange form kan genindføres som `style`-valg i formatteren, hvis I foretrækker den i prosa.
2. Engelsk bruger forkortet ugedag («Wed 16 Sep») som valgt i opgaven, mens da/fi/sv bruger hel ugedag. Anbefaling: behold (kortere, almindeligt på engelsk).
3. Finske ugedage i nominativ i lister og overskrifter følger UI'et; essiv kun i «palaa …»-sætninger. Anbefaling: lad en finsk kollega læse eksemplerne igennem (UI'et er maskinoversat).
4. `getRecord` (kildevisning) bruger `new Date()` som «nu» til årsreglen, fordi kaldet ikke har noget `now`. Anbefaling: behold; konsekvensen er kun om årstallet vises.
