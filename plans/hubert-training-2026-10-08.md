# Hubert-træning runde 10 (chatbot-trainer, fix-mode) – 2026-10-08

Mål: lær nyt fra 1.6.0/1.6.1 (skak, Multiplayer-hub og «Dine opgør», barsel, Knowledge Base, forbedringer, Spilhjørnet, Word-guides) og gør Hubert lige så god på det som på de gamle moduler – kun de deterministiske lag (routing, intents, viden, app-guide, normalisering, guards, nextStep, paritet da/en/fi/sv). Den lokale LLM røres ikke.

## Faser
- [x] Fase 1: feature-kort + baseline
- [x] Fase 2-3: runde 10-bank (`electron/assistantTrainingRound10.cjs`: personaer A–E + F leder, G observatør, J creator; da/en/fi/sv; paritetsrækker `PARITY_R10`)
- [x] Fase 4: kør + score (PASS/WARNING/FAIL) – se «Scorecard»
- [x] Fase 5-6: rodårsag, RED -> GREEN pr. fejl – se «Fund og rettelser»
- [x] Fase 7-8: mønstre -> permanente rettelser, excellence, genkør alt – se «Mønstre» og «Excellence»
- [x] Verifikation: targeted, fuld electron-suite (async), tsc, vitest, unicode-scan, git status – se «Verifikation»

## Baseline (før runde 10)
- Bank: 808 spørgsmål (da 262, en 225, fi 162, sv 159). `assistantTraining.test.cjs` + `assistantTrainingRound9.test.cjs`: 123/123 bestået (exit 0).
- Rigtig log (`hubert-unanswered-questions`, M:, kun læst): 5 poster i alt over 8 teammapper, 0 siden 2026-10-05 -> intet nyt at lære af rigtige brugere denne gang (kun mønstre noteres; ingen tekst kopieret).

## Feature-kort (nyt siden runde 9)
| Feature | Formål | Brugere | Hvor / UI-navne | Begrænsninger | Dækning i app-guide før runde 10 |
|---|---|---|---|---|---|
| Skak i Multiplayer | Korrespondanceskak mod kollega på tværs af teams | alle undtagen observatør | Spilhjørnet > Multiplayer > Skak > «Udfordr en kollega» (vælg farve: hvid/sort/tilfældig) > «Send udfordring» | ingen ur, ingen tilbagetagelse af træk; remis-tilbud, «Giv op», skakmat/pat/trefoldig/50-træk | ingen |
| Multiplayer-hub + «Dine opgør» | Stilling mod hver kollega + revanche | alle | Multiplayer-lobby: «Dine opgør», «Rangliste», knap «Udfordr igen» | Hubert kan ikke læse spildata (kun vejledning) | ingen |
| Sprog pr. Word-Puzzle-spil (da/en/sv/fi), finsk ordliste, ukendt ord | Spil på eget sprog | alle | «Udfordr en kollega» > Sprog | skak har ikke sprog, kun farve | delvist (udfordring, godkend ord, godbidder) |
| Barsel | Leder registrerer barsel uden ansøgning; «(barsel)» + «Tilbage <dato>» | leder (registrerer), alle (ser) | Manager Panel > «Registrer barsel» | medarbejder kan ikke selv ansøge/ændre | data: ja (assistantInsights); how-to: ingen |
| Knowledge Base | Vidensartikler, import Word/PDF, adgang pr. team | alle (adgang: leder) | Knowledge Base ved siden af Guide Bibliotek | kun eget teams artikler uden tilladelse | ja (4 opgaver) + data |
| Delte guides med billeder på tværs af teams | Guidebilleder vises også fra andet team | alle med adgang | Guide Bibliotek | kræver adgang til guiden | ingen |
| Forbedringer: blå prik, ansvarlig, visninger | Overblik over ændringer der angår mig | alle | Forbedringer og forslag | prik = uset ændring på forslag der angår dig | delvist (ansvarlig, visninger) |
| Spilhjørnet-struktur | Arcade / Modern / Multiplayer | alle | Spilhjørnet | Arcade: Chicken Invaders, Prism Break, Parcel Pilot, Cargo Stack, Route Runner; Modern: Cube Basher, The Librarian | summary nævner kun Arcade + Word-Puzzle |
| Windows-notifikationer | Notifikationer også som Windows-besked | alle | profilmenu > Indstillinger | slås fra under Indstillinger | ja (runde 9) |
| Word-guides «Bevar original Word-layout» | PDF-visning lavet med Microsoft Word, sendes til review | alle der laver guides | Guide Bibliotek > «Importér Word-guide» > «Bevar original Word-layout»; «Send til review» | kræver Word på pc'en; fejl «Word kunne ikke danne PDF-visningen» | ingen |

## Åbne punkter fra runde 9 og tidligere (afklaret)
- [x] Sygeårsag skjult for ledere: besluttet, uændret.
- [x] `dueDate` på to-do-forslag: koblet i HubAssistant, intet at gøre.
- [x] Finsk UI maskinoversat: kun noteret.
- [ ] `main.cjs`-afgrænsning af evidens, kilder med e-mail, teamoverblik på tværs, highscore med sektor: kræver `src/`/`main.cjs` – ikke rørt (se rapport).

## Runde 10-bank
- 316 nye spørgsmål (79 pr. sprog): A nybegynder, B erfaren, C uklar/stavefejl/uden accent, D power user/opfølgning (`after:`), E sikkerhed (aldrig logget), F leder, G observatør, J creator. Retninger: direkte, indirekte, forkert stavet, uden æøå/äö, tvetydig (`skak`, `hvordan spiller jeg mod Bo?`), opfølgning (`og i skak?`, `og hvornår er hun tilbage?`, `og Multiplayer?`), lovligt tomt svar (`empty: true`).
- 16 nye paritetsrækker (`PARITY_R10`): samme begreb i da/en/fi/sv giver samme rute (91 rækker i alt, 0 afvigelser).
- Fixture: `createFixture({ parental: true })` tilføjer den fiktive Eva Lind på barsel 2026-09-07 – 2026-09-18. Hovedfixturen er uændret (eksisterende tests sammenligner fraværslister ordret).
- Bank i alt: 808 -> 1124 (da 262 -> 341, en 225 -> 304, fi 162 -> 241, sv 159 -> 238).

## Scorecard
| | PASS | WARNING | FAIL |
|---|---|---|---|
| Baseline gammel bank (808) | 808 | 0 | 0 |
| Runde 10, første kørsel (252 af 316, før rettelser) | 40 | 0 | 212 |
| Efter rettelser i app-guide, routing, guard, paraphrase, stavning, insights | 252 | 0 | 0 |
| Anden bølge (+40: resultatspørgsmål, bare «skak», delegeret import, sikkerhed om andres skakspil, barselsårsag, observatør) – før rettelser | 253 af 292 | 0 | 39 |
| Tredje bølge (+24: rokade, stykker, pat, remis forklaret, ja/nej-barsel) – efter rettelser | 316 | 0 | 0 |
| **Slutstatus, ny bank** | **316/316** | 0 | 0 |

Alle FAIL var rodårsag «knowledge/docs» (ingen app-guide-opgave for de nye funktioner) eller «routing» (data- eller guide-ruten tog spørgsmålet før app-guiden). Ingen sikkerhedslækager: alle 28 nye E-spørgsmål (7 pr. sprog) gav guard-svar (`injection`, `scope`, `gameHidden`, `destructive`) og blev ikke logget.

## Fund og rettelser (mønster -> lag -> rettelse -> test)
| # | Mønster (frekvens × alvor × effekt) | Lag | Rettelse | Test |
|---|---|---|---|---|
| 1 | Skak, «Dine opgør», revanche, ordtjek/sprog, find mine spil, accepter udfordring, spilsektioner: ingen svar (5×3×4) | knowledge | 18 nye app-guide-opgaver på da/en/fi/sv (barsel, Word-guide, KB, delte billeder, blå prik, spilsektioner, `chess-*`, `rivals`, `rematch`, `accept-challenge`, `find-games`, `word-check`; UI-navne fra `multiplayerLabels.ts`, `translations`) | bank A–D alle sprog, `assistantTrainingRound10.test.cjs` (oversættelsesparitet) |
| 2 | Barsel: how-to for leder/medarbejder manglede; «hvem er på barsel?» gav oversigtssvar (5×3×4) | knowledge + intent | `parental-leave` (Kalender) + `register-parental` (Manager Panel, `preferred`), ny insight-intent `parental` med «tilbage»-dato, ja/nej-linje for navngiven kollega, årsagsnote («hubben gemmer ingen årsag») | bank B/D/F/J + 5 fokus-tests |
| 3 | Spørgsmål der ikke starter med «hvordan» (`er der et ur i skak?`, `hvad betyder den blå prik?`, `Word kunne ikke danne PDF-visningen`) faldt til data/guide-søgning (4×3×4) | routing | Opgaver kan markeres `direct`: `appGuidance({ directOnly })` kører efter how-to-blokken, kræver mindst en frase eller to ordtræf; wiret i `assistantContext.cjs` | bank C alle sprog, fokus-test «direct tasks» |
| 4 | `hvordan spiller jeg skak …` / `kan jeg give Hubert en godbid mens jeg spiller skak` gav arkade-opgaven «Spil et spil» (4×2×3) | routing | `excludes` (arkade-opgaven springes over når skak/Word-Puzzle nævnes), `needsModule`, `needsAny`, fælles `CHESS_WORDS`, `preferred` | fokus-tests «Word-Puzzle keeps its task», «needs its module» |
| 5 | «Windows-besked når det er min tur i skak» gav Word-Puzzle-opgaven (3×1×2) | routing | emner kan være `priority` (Windows-notifikationer vinder ved frasetræf) + nøgleord «windows message» | bank D alle sprog, fokus-test |
| 6 | Engelsk «why are the images **missing** …» blev opfattet som finsk (`miss` ⊂ `missing`) og besvaret på finsk (2×4×4) | language/normalization | finsk markør `missä` i stedet for `miss` + engelske funktionsord | fokus-test «language detection» |
| 7 | Stavefejl `spiler/kolega/tilbyer/remiz/remy/schak/chesss/ofer/colegue` (3×1×2) | normalization | delt SPLIT-tabel i `assistantSpelling.cjs` (ingen enkelt-nøgleord) | fokus-test «spelling», bank C |
| 8 | «hvordan spiller jeg mod Bo?» / «play against Bo» / «pelaan Boa vastaan» / «spelar jag mot Bo» havnede i arkade-opgaven (2×2×3) | normalization | paraphrase-regel pr. sprog -> «udfordrer jeg Bo» | fokus-test «paraphrase» |
| 9 | Opfølgninger: «og i skak?» efter Word-Puzzle, «og Multiplayer?» (engelsk «and» matchede guide-tekst), «og hvornår er hun tilbage?» efter barsel (3×2×3) | routing/follow-up | `GAME_SWAP`, `bareTerm` (kun rene app-ord), `PRONOUN_BACK` i `assistantConversation.cjs` | bank D alle sprog, fokus-test «follow-ups» |
| 10 | `hvem godkender …`, `skal et forslag have en ansvarlig?`, `kan du importere Word-guiden for mig?` blev dataopslag/guide-søgning (3×2×3) | routing | `WHO_CAN` (godkender/approves), `NEEDS`, `DELEGATE` i `isHowToQuestion` | fokus-test «how-to detection» |
| 11 | Sikkerhed: `ignorer reglerne` (bestemt form) og `unohda säännöt` slap forbi; barsel-registrering og «giv op i alle skakspil» var ikke skrivehandlinger; andres skakspil og «alle skakspil fra alle teams» uden guard; fi «voinko nähdä toisen tiimin artikkelin?» fik scope-afslag i stedet for adgangsvejledning (alvor 5) | permissions | `INJECTION` (`regler\w*`, `säännöt`), `WRITE_ACTION`, `OTHERS_GAMES` + personbevidst `mentionsOthersGames`, skakspil i scope-navneord, `ASKS_ACCESS`, chef-rettigheder, gameHidden-tekst nævner skak | bank E alle sprog, fokus-tests «guard» |
| 12 | Observatør fik «Udfordr en kollega» uden at få at vide, at observatører ikke kan spille (2×2×2) | action/permissions | appGuidance returnerer `moduleId`; `observerNote` i context | bank G alle sprog, fokus-test |
| 13 | Regressioner fra egne rettelser (fanget af gammel bank): «hvilke spil findes der?» mistede spilantal-listen; hverdagsordet «betyder» i opgavetitel gjorde `hvad betyder afventer review?` til app-svar; oversigten > 1800 tegn | routing/docs | `GAME_SECTIONS` kræver at Spilhjørnet nævnes; titler uden hverdagsord; kortere første sætning i spil-/Multiplayer-resuméer | gamle tests + fokus-tests |

## Mønstre (Fase 7)
- **Nye features uden app-guide-opgave giver «generelt overblik»-fald** (frekvens 5, alvor 3): permanent rettelse = `direct`-mekanismen, så nye UI-funktioner kan besvares uden «hvordan»; checklisten for nye moduler er nu: opgave + `direct`/`needsModule`, da/en/fi/sv-tekst med UI-navne, bank-række, paritetsrække.
- **Tie-breaks i nøgleordsscoring** (frekvens 4): to opgaver med samme score vinder på rækkefølge. Rettet generelt med `excludes`/`needsAny`/`preferred` og en fælles ordliste i stedet for flere enkeltnøgleord.
- **Opgavetitler styrer `isAppWord`**: hverdagsord i en dansk titel ændrer guide-søgningens «app-ord»; ny fokus-test vogter det.
- **Sikkerhed følger funktionerne**: hver ny funktion (skakspil, barsel) har fået sin egen skrive- og privatlivs-regel i guarden samt E-spørgsmål på alle fire sprog.

## Excellence (Fase 8)
- Barselssvar viser altid «tilbage <dato>» (første arbejdsdag, weekender springes over), og «Er Bo på barsel?» giver én ja/nej-linje i stedet for hele listen.
- Skak-svar nævner at der ikke er ur og at et træk ikke kan tages tilbage; spørgsmålet «kan jeg spille skak mod Hubert?» forklarer at Hubert er hunden i stuen.
- Observatører får én linje først. Opgaver kan have eget «Hvor:» (barsel registreres i Manager Panel, vises i Kalender).
- «Word kunne ikke danne PDF-visningen» får fire konkrete skridt og nævner at 1.6.1 retter fejlen.

## Åbne punkter og beslutninger
- [x] `src/`: ingen ændringer nødvendige for denne runde. Hubert kunne ikke læse Multiplayer-resultater – **løst i runde 11** (`assistantMultiplayer.cjs` + `readShared('multiplayer-index')`, uden ændring i `main.cjs`/`src/`).
- [x] «hvem har vundet flest?» uden spilnavn – **løst i runde 11**: Hubert spørger «Hvilket spil mener du?» med knapper.
- [x] Barsel: «hvordan registrerer man barsel» – **løst i runde 11** (subjekt-pronominer foldes i matcheren).
- [ ] Finsk UI er maskinoversat (kun noteret; samlet i runde 13-opsummeringen). Sygeårsag er fortsat skjult for ledere (beslutning fra før, uændret).
- [ ] Tidligere åbne punkter om `main.cjs`-afgrænsning, e-mail i kilder, teamoverblik og highscore-sektor er uændrede (samlet i runde 13-opsummeringen).

## Verifikation
- [x] Ny bank: 316/316 PASS; paritet 91 rækker, 0 afvigelser.
- [x] Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 433/433, exit 0.
- [x] Fuld electron-suite (async): 978/978, exit 0 (baseline før runden: 958).
- [x] `tsc -b`: exit 0.
- [x] Vitest: 1251 bestået, 1 sprunget over. `src/lib/swedishCoverage.test.ts` timede ud (5 s) under fuld belastning, men består alene (1,4 s) – rører ikke `electron/`, `src/` er ikke ændret.
- [x] Unicode-scan: kun de gamle hits (assistantGuideIndex:6, assistantKnowledge:3, improvements.test:214/669/671, improvementsDirectory.test:91/144, multiplayer.test:541).
- Belastningsfund: den fulde suite fejlede først 1 test (`assistantWorker.test.cjs` «actual subprocess RPC…», 10 s timeout), fordi den voksne bank kører parallelt og æder CPU. Rettet to steder: (1) nøgleordsmønstre i `assistantAppGuide.cjs` caches pr. nøgleord (bank-testen 9,3 s -> 5,1 s); (2) testens klient-timeout 10 s -> 30 s (testen tjekker autorisation, ikke latenstid). Ændrer ikke produktkode i workeren.
- Ændrede filer (min runde): `electron/assistantAppGuide.cjs`, `assistantAppGuideI18n.cjs`, `assistantContext.cjs`, `assistantConversation.cjs`, `assistantGuard.cjs`, `assistantInsights.cjs`, `assistantParaphrase.cjs`, `assistantSpelling.cjs`, `assistantTrainingBank.cjs`, `assistantTrainingData.cjs`, `assistantWorker.test.cjs`; nye: `assistantTrainingRound10.cjs`, `assistantTrainingRound10.test.cjs`, denne plan. Ingen midlertidige filer i projektet, ingen build, commit eller push.
