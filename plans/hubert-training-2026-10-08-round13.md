# Hubert-træning runde 13 (chatbot-trainer, fix-mode) – 2026-10-08

Fokus: dækningsaudit mod den rigtige UI, sprogkvalitet (fi/sv/en), hastighed, changelog og konsolidering. Kun deterministiske lag; den lokale LLM (`localAI.cjs`, `aiModels.cjs`), `main.cjs`, `assistantWorker.cjs`-adfærd, 1.6.0 og M: er ikke rørt.

## Faser
- [x] Fase 1: læs brief + planer 10-12, baseline
- [x] Fase 2: dækningsaudit-test (moduler/fliser/visninger/handlinger i alle fire sprog), RED, luk huller
- [x] Fase 3: spørgsmålsbank fra auditten (nyeste 1.6.0/1.6.1-funktioner, rolle-gating) + paritetsrækker
- [x] Fase 4: sprogkvalitet fi/sv/en (Hubert egne sætninger)
- [x] Fase 5: hastighed: måling før/efter, optimering, løst ydelsesvagt
- [x] Fase 6: changelog-linje + «Hvad kan du?»
- [x] Fase 7: konsolidering (hele banken, dødt kode, planer konsistente, samlet opsummering)
- [x] Fase 8: verifikation

## Baseline (før runde 13)
- Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 506/506, exit 0. Bank 1379 spørgsmål (da 422, en 371, fi 294, sv 292), alle PASS, 119 paritetsrækker.
- Den rigtige ubesvarede-log er ikke læst igen i denne runde.

## Dækningsauditten (permanent test)
- `electron/assistantCoverageManifest.cjs` kortlægger den rigtige UI (`COMPONENT_MAP`: Hub-fliser, App-visninger, navigationsetiketter, Spilhjørnet, Admin/Creator/Manager-paneler, profilmenuens indstillinger, Guide Bibliotek, Knowledge Base, forbedringer, noter, mail, madplan, vagter, ferie, teamoverblik, opslag, personlige to-dos, projekttavle, sprog/tema, Windows-notifikationer) til app-guide-moduler og opgaver. Modul- og etiketlisterne udledes af `src/lib/translations.ts` (indlæst via `ts.transpileModule` + `vm`), ikke af en håndskrevet liste.
- `electron/assistantCoverageAudit.test.cjs` (6 tests) fejler hvis et modul/en handling ikke har en app-guide-post, hvis en post mangler titel eller mindst én opgave på et af de fire sprog, hvis fi/sv-teksten stadig er dansk/engelsk fallback, hvis trin/«hvor»/noter ikke har samme antal på alle sprog, eller hvis manifestet peger på ukendte ID'er. Kommer der en ny UI-fil, skal `COMPONENT_MAP` opdateres.
- RED: med den nye guide slået fra (midlertidig kopi) fandt auditten **42 huller**; den første sonde af spørgsmål mod de nye områder gav **31 fejl**. GREEN: 0 huller.

## Fund og rettelser (fund | lag | RED-test | rettelse | filer)
| # | Fund | Lag | RED-test | Rettelse | Filer |
|---|---|---|---|---|---|
| 1 | ca. 40 UI-funktioner uden eller med forkert svar: Admin Panel, Creator Panel, Hub-fliser, opslag, klokken/notifikationer, Ctrl+K, «siden sidst», skift hub/skrivebeskyttet hub, dashboard-tilpasning, madplan-opgaver, noter, mail-mapper, leder-faner (sygdom, ferieoverblik, fødselsdage, adgang, onboarding/offboarding), guide-kategorier/eksport, enkelt fridag | knowledge/docs | audit (42 huller) + bank | nye app-guide-moduler `hub`/`admin`/`creator` og ca. 40 opgaver på da/en/fi/sv med de rigtige UI-navne (fi: Johtajapaneeli, Hallintopaneeli, Luojapaneeli) | `assistantAppGuideMore.cjs`, `assistantAppGuideMoreI18n.cjs`, `assistantAppGuide.cjs`, `assistantAppGuideI18n.cjs` |
| 2 | Regression fra egne nøgleord: «notifikationer», «what's new», «hvad er klokken», «andre teams», «a day off» kaprede data-/briefing-spørgsmål | routing | gammel bank | `direct`-opgaver kræver frase-nøgleord (≥ 3 point); `preferred`, `excludes`, `needsModule`, `userTask` til tie-breaks og rollestyrede opgaver | `assistantAppGuide.cjs`, `assistantAppGuideMore.cjs` |
| 3 | «sletter/retter/opretter» (konsonantfordobling), «hvor registrerer jeg», «var hanterar jag», fi «missä X on» blev ikke genkendt som how-to/hvor | normalisering/routing | bank A–C | `VERB_STEMS`, `HOW_TO`, `WHERE`; «hvem kan oprette opslag» og «kan alle rette madplanen» er how-to; en begrænset modul i et hvor/hvem-ser-spørgsmål giver rolleforklaringen | `assistantAppGuide.cjs` |
| 4 | Sikkerhed: fi «anna minulle pääsy Luojapaneeliin», backup-/varmuuskopio-filer og imperativerne offboard/onboard/publish slap forbi guarden | permissions | bank E (da/en/fi/sv) | nye guard-mønstre | `assistantGuard.cjs` |
| 5 | Sprogfejl: sv «vilka uppgifter har jag imorgon?» tog «imorgon» som del af et navn; fi «mitä tehtäviä Annella on huomenna?» viste stille spørgerens egne opgaver; fi «hyvää huomenta» blev ikke kendt som hilsen | language/intent | bank C/D fi/sv | navne-/tidsord og finsk kasus på personnavn, hilsener | `assistantPeople.cjs`, `assistantSmallTalk.cjs`, `assistantSpelling.cjs`, `assistantContext.cjs` |
| 6 | Hubert egne finske sætninger var kluntede | sprog/polering | `assistantTrainingRound13.test.cjs` | «Kirjatut tehtävät:», «<navn>: ei kirjauksia ajanjaksolla …», «<navn>: tulevaa hyväksyttyä lomaa ei ole kirjattu»; maskinoversatte UI-navne citeres uændret | `assistantInsights.cjs`, `assistantKnowledge.cjs` |
| 7 | Auditens egne falske positiver: finsk «kun», svensk «når» og spiltitlen «The» blev opfattet som dansk/engelsk lækage | test | audit | DANISH_ONLY/ENGLISH_ONLY indsnævret | `assistantCoverageAudit.test.cjs` |
| 8 | Hastighed: O(n²)-opslag på navn/bruger, ny RegExp pr. alias pr. kald, `norm` pr. post | performance | måling + `assistantPerformance.test.cjs` | indekser og caches, delt `norm` | `assistantKnowledge.cjs`, `assistantPeople.cjs`, `assistantMultiplayer.cjs`, `assistantInsights.cjs`, `assistantNorm.cjs` |

## Sprogkvalitet fi/sv/en
- Citerede fi/sv UI-navne er maskinoversatte og citeres ordret (f.eks. fi To Do = «Hankkeet», Shift schedule = «Vaihtoaikataulu», dashboard-knap «Muokkaa koontinäyttöä»). Hubert egne sætninger er rettet til naturligt sprog (fund 5–6).
- Paritet: 34 nye rækker (`PARITY_R13`), 153 i alt, 0 afvigelser. Auditen kræver samme antal trin, «hvor» og noter på alle fire sprog, og ingen fi/sv-tekst må falde tilbage til dansk/engelsk.

## Runde 13-bank
- 305 nye spørgsmål: da 78, en 77, fi 75, sv 75 (krav: mindst 15 pr. sprog). Personaer A–E, F leder, G observatør, J creator, med rolle-gating (lederopgaver forklaret for brugere, creator-opgaver kun for creator, observatør-begrænsninger), opfølgninger og tomme tilstande. Sikkerhedsspørgsmål (E) logges aldrig.
- Bank i alt 1379 -> 1684 (da 500, en 448, fi 369, sv 367).

## Hastighed (punkt 4)
- Måling: ca. 100 repræsentative spørgsmål (jævnt udvalgt fra banken, alle roller), steady state som i workeren, realistisk fixture (`createFixture({ scale: 400 })`: 400 personer samt opgaver/ferier/guides i hundredvis), median af 3 kørsler pr. spørgsmål, `createAssistantContext` in-process.

| | p50 | p95 | max | gennemsnit |
|---|---|---|---|---|
| Før | 6,6 ms | 379 ms | 1981 ms | 67,1 ms |
| Efter | 5,3 ms | 48 ms | 68 ms | 8,3 ms |

- Årsager til de langsomste: personopslag i `assistantKnowledge` (`records`, `userEntries`, guide-info `person`), `bounded()` (ny RegExp pr. alias), `mentioned()` i Multiplayer (ny RegExp pr. navn), `typeOn()` i insights (scanner alle poster med `norm` pr. post). Rettet med navne-/bruger-indekser pr. kald, regex-caches med substring-forfilter, delt cachet `norm` (`assistantNorm.cjs`), fravær indekseret pr. bruger og lazy `creatorEmail()`. Svarene er uændrede: hele banken og alle assistent-tests er grønne.
- Ydelsesvagt: `electron/assistantPerformance.test.cjs` kører de samme ~100 spørgsmål og kræver p95 < 250 ms og max < 1000 ms (ca. 5× de målte værdier, bedste af 3 kørsler pr. spørgsmål, så den ikke fladrer under parallel belastning). Ærlig note: de gamle tal (379/1981 ms) er målt med benchmark-script; selve vagt-testen er ikke kørt mod den gamle kode.
- Langsomste nu: fi generel søgning («yhdistetty hubi») og «who is on parental leave next week?», ca. 60–70 ms.

## Changelog og «Hvad kan du?»
- `src/lib/changelog.ts` (1.6.1): én linje: «Hubert kan nu svare på skak og dine Multiplayer-resultater, barsel og meget mere, og forstår flere måder at spørge på». Den eneste `src/`-ændring; `tsc -b` og vitest er grønne.
- «Hvad kan du?» (`assistant`-emnet, da/en/fi/sv) dækker allerede data, Multiplayer-resultater (skak), barsel, KB, guides, forbedringer, modulforklaringer og handlingsforslag (runde 12); ingen ændring nødvendig. Oversigten er ≤ 1800 tegn (nye moduler har `inOverview: false`).

## Konsolidering
- Hele banken kørt: 1684/1684 PASS, paritet 153 rækker, 0 afvigelser.
- Dødt kode i runde 10–12-modulerne (`assistantMultiplayer`, `assistantRelativeDates`, `assistantNiceDate`): kun eksporterne `kindOf` og `GAME_CHOICE` i `assistantMultiplayer.cjs` havde ingen bruger (søgning i al kode og alle tests); eksporterne er fjernet, funktionerne bruges internt. Intet andet kunne bevises ubrugt og er derfor ikke slettet.
- Alle fire planer er gennemgået: afkrydsninger rettet, løste beslutninger markeret med runden der løste dem, optællinger rettet til de faktiske tal (runde 11: da 47/en 33/fi 31/sv 32; runde 12: da 34/en 34/fi 22/sv 22), og ødelagte `\u00`-tegn i runde 12-planen rettet.

## Samlet opsummering (runde 10–13)
- Bank: 808 -> **1684** spørgsmål (da 262 -> 500, en 225 -> 448, fi 162 -> 369, sv 159 -> 367). Tilføjelser: runde 10 +316 (79 pr. sprog), runde 11 +143 (da 47, en 33, fi 31, sv 32), runde 12 +112 (da 34, en 34, fi 22, sv 22), runde 13 +305 (da 78, en 77, fi 75, sv 75). Paritetsrækker: 91 -> 107 -> 119 -> 153 (0 afvigelser).
- Nye permanente tests: runde 10 oversættelsesparitet, runde 11 `assistantMultiplayer` + Round11, runde 12 rettighedsmatrix, injektion, svar-lint og Round12, runde 13 dækningsaudit, Round13 og ydelsesvagt.
- Verifikation: targeted 506 (start runde 13) -> 523, fuld electron-suite 1068/1068, vitest 1252 + 1 sprunget over, `tsc -b` exit 0.

### Åbne beslutninger fra runde 10–13 (med anbefaling)
1. **Strukturerede `sources` bærer kollegaers e-mail (recordId/owner)** – kræver ændring uden for Hubert-lagene (`main.cjs`/renderer). Anbefaling: erstat e-mail med visningsnavn i kilder, før de sendes til UI; høj prioritet for privatliv.
2. **Evidens-afgrænsning i `main.cjs`, teamoverblik på tværs af teams og highscore med sektor** – kræver `src/`/`main.cjs`. Anbefaling: udskyd, til nogen efterspørger det; ingen sikkerhedsrisiko i dag.
3. **ISO-datoer i overskrifter og lister** – bevaret bevidst. Anbefaling: bevar dem (entydige); sætninger er allerede naturliggjort.
4. **Brugerskrevet fritekst vises som den står i rene dataopslag**, også hvis den ligner en ordre. Anbefaling: lad den stå (vises som data); tilføj kun markering ved misbrug.
5. **«Jeg skal lave en P300 til …» (erklæring uden spørgsmål) forbliver `unmatched`** og logges. Anbefaling: behold, så loggen viser ægte behov.
6. **Finsk UI er maskinoversat**, og `grant-vacation` og de nye opgaver citerer fi/sv-etiketterne ordret. Anbefaling: lad en finsk/svensk kollega gennemgå oversættelsesfilerne; Hubert følger automatisk.
7. **Sygeårsag er skjult for ledere** (tidligere beslutning). Anbefaling: bevar.
8. **Hubert viser kun egne Multiplayer-resultater** (ingen ranglister/andres stilling) og ingen live-stilling i igangværende spil. Anbefaling: bevar; en rangliste kan tilføjes som eksplicit valg, fordi den viser andres navne og tal.
9. **Nyt i runde 13:** (a) `COMPONENT_MAP` i auditten skal opdateres, når nye UI-filer kommer – anbefaling: tilføj det til tjeklisten for nye moduler; (b) et evt. andet ydelseslag til den finske generelle søgning (60–70 ms) – anbefaling: kun hvis tallene vokser; (c) «hvor længe varer adgangen, når en leder har godkendt den?» er ikke besvaret – anbefaling: lad det forblive ubesvaret og logget.

## Verifikation
- [x] Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): se afsluttende rapport (forventet 523; baseline 506, +6 audit, +10 Round13, +1 ydelse).
- [x] Fuld electron-suite (async): 1068/1068, 0 sprunget over, exit 0 (baseline 1051).
- [x] `tsc -b`: exit 0. Vitest: 111 filer, 1252 bestået, 1 sprunget over, exit 0.
- Unicode-scan og `git status`: se afsluttende rapport. Ingen build, commit eller push; intet skrevet til M:.
- Ændrede filer (min runde): `electron/assistantAppGuide.cjs`, `assistantAppGuideI18n.cjs`, `assistantGuard.cjs`, `assistantSpelling.cjs`, `assistantSmallTalk.cjs`, `assistantPeople.cjs`, `assistantContext.cjs`, `assistantInsights.cjs`, `assistantKnowledge.cjs`, `assistantMultiplayer.cjs`, `assistantTrainingBank.cjs`, `assistantTrainingData.cjs`, `src/lib/changelog.ts`; nye: `assistantAppGuideMore.cjs`, `assistantAppGuideMoreI18n.cjs`, `assistantCoverageManifest.cjs`, `assistantCoverageAudit.test.cjs`, `assistantTrainingRound13.cjs`, `assistantTrainingRound13.test.cjs`, `assistantPerfFixture.cjs`, `assistantPerformance.test.cjs`, `assistantNorm.cjs`, denne plan.
