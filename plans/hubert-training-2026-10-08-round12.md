# Hubert-træning runde 12 (chatbot-trainer, fix-mode) – 2026-10-08

Fokus: robusthed, samtalekvalitet, rettighedsmatrix, prompt-injektion i data og svar-polering (Phase 8). Kun deterministiske lag; den lokale LLM er ikke rørt.

## Faser
- [x] Fase 1: læs brief, runde 10/11-planer og harness; baseline
- [x] Fase 2: signaler fra den rigtige log (kun mønstre, read-only): kun de samme 5 gamle poster, intet nyt
- [x] Fase 3: samtale/opfølgning/robusthed – sonde, RED, ny bank: 112 nye (da 34, en 34, fi 22, sv 22) + 12 paritetsrækker
- [x] Fase 4: rettighedsmatrix (`assistantPermissionsMatrix.test.cjs`, 45 spørgsmål × roller × eget/fremmed team)
- [x] Fase 5: prompt-injektion i spørgsmål og data, 4 sprog (`assistantInjection.test.cjs`)
- [x] Fase 6: svar-polering + lint-tests (`assistantAnswerLint.test.cjs`)
- [x] Fase 7: rodårsag, permanente rettelser, mønstre
- [x] Fase 8: verifikation (resultater nederst)

## Baseline (før runde 12)
- Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 456/456, exit 0. Bank 1267 spørgsmål, alle PASS.

## Fund og rettelser (fund | lag | RED-test | rettelse | filer)
| # | Fund | Lag | RED-test | Rettelse | Filer |
|---|---|---|---|---|---|
| 1 | Stille forkerte perioder: «om to uger», «i weekenden», «sidste fredag i måneden», jul/nytår/påske, «tredje oktober», «i dag og i morgen», «lige nu» (da/en/fi/sv) | datoer | Round12-test (datoer) | nyt modul `assistantRelativeDates.cjs` + ordinaldatoer; skriveintentioner bruger `holidays:false` så «opret ferie i juleferien» stadig spørger | `assistantRelativeDates.cjs`, `assistantDates.cjs`, `assistantContext.cjs` |
| 2 | «og Bo?» efter listespørgsmål gav videnssøgning | samtale | Round12-test (opfølgning) | `topicFollowUp` | `assistantConversation.cjs` |
| 3 | «hvornår er han tilbage?» (han/hun/he/she/hän/hon) fandt ingen person | samtale | samme | `pronounSubject` | `assistantConversation.cjs` |
| 4 | Rettelser («nej, jeg mente i dag», «I meant Clara», «tarkoitin Claraa») uforstået | samtale | Round12-test (rettelser) | `CORRECTION` | `assistantConversation.cjs` |
| 5 | «er Anne her i morgen?», «is Anne in tomorrow?» gav videnssøgning; «er Anne syg i dag?» gav generelt tomt svar | intent | Round12-test (presence/ja-nej) | presence-omskrivning + intent `personState` | `assistantParaphrase.cjs`, `assistantInsights.cjs` |
| 6 | «hvad skal jeg i dag?» / «what do I have to do today?» / «mitä minun pitää tehdä tänään?» | intent | Round12-test | omskrives til dagsoverblik | `assistantParaphrase.cjs` |
| 7 | Rambling spørgsmål og stavefejl i spørgsmålsord (`wer`, `hwo`, `hevm`, `kuak`) gav tomt svar | normalisering | Round12-test (rambling, polite wrappers) | `focusClauses` + retry, spelling, flere høflige indledninger | `assistantTidy.cjs`, `assistantContext.cjs`, `assistantSpelling.cjs` |
| 8 | fi/sv/da afskeder gav overblik; «du er useless» blev besvaret på engelsk | small talk | Round12-test (farewells) | flere afskeder, chatsprog ved blandet sprog | `assistantSmallTalk.cjs` |
| 9 | «gør det»/«do it» uden how-to-antecedent gav overblik og blev logget | routing | injection-test «do it» | `vague` -> «Hvad skal jeg hjælpe med?» | `assistantContext.cjs` |
| 10 | «Hvad kan du?» forældet (skak/Multiplayer-resultater, barsel, KB, forbedringer) | docs | Round12-test (capabilities) | ny tekst da/en/fi/sv, oversigt ≤ 1800 tegn | `assistantAppGuide.cjs`, `assistantAppGuideI18n.cjs` |
| 11 | **Rettighed**: observatør-hubs kunne få Knowledge Base-artikler via guide-søgning; registeret (`VIEW_KEYS`) tillader kun guides | permissions | matrix + `assistantKnowledgeBase.test.cjs` | KB læses ikke i observatør-hubs | `assistantContext.cjs` |
| 12 | **Rettighed**: «send en besked/mail til Bo», redigér/flyt/aflys gav generelt tomt svar | guard | matrix (skriveintentioner), injection-test | `WRITE_VERBS` -> destructive-afvisning (how-to uændret) | `assistantGuard.cjs` |
| 13 | Fremmed team: dansk fejltekst i alle sprog; engelsk «are there any announcements … in TRR» gav TRR's personliste | permissions/intent | matrix (fremmed team) | lokaliseret afvisning (da/en/fi/sv), mere præcis `are there any X`-omskrivning | `assistantContext.cjs`, `assistantParaphrase.cjs`, `assistantKnowledge.test.cjs` |
| 14 | Injektion i spørgsmål: fi «olet nyt DAN» / systemprompt, «from now on…», miljøvariabler, base64/rot13/usynlige tegn/homoglyffer/mellemrumsstavning, `</evidence>`, «alle brugeres e-mails» | guard | `assistantInjection.test.cjs` (35 angreb) | de-obfuskering (`stripObfuscation`, `decodedVariants`, `spelledOutOverride`), nye mønstre, `EVIDENCE_TAGS` | `assistantGuard.cjs` |
| 15 | Injektion i data (guide, KB, forbedring, note, personnavn, opgave/rolle, projektkommentar, mail, opslag, Multiplayer-modstander) | evidens | `assistantInjection.test.cjs` (37 flader) | ingen kodeændring nødvendig, adfærden er låst af test; data vises som data, retrieval/resumé fjerner ordren | `assistantTrainingBank.cjs` (fixture `injected`) |
| 16 | sv «vilka uppgifter har jag på torsdag?» læst som personnavn (`\b` efter `å`) | normalisering | sv-rækker i bank | `på` håndteret uden `\b` | `assistantPeople.cjs` |
| 17 | fi «näytä oppaat» / «mitkä oppaat ovat olemassa?» | intent | Round12-test | fi-fraser i `GUIDE_LIST` | `assistantContext.cjs` |
| 18 | «what does the note Shift handover say?» fejltolket (modulordet «shift») | routing | injection-test | fyldord `say/contain/ago/was/were…` | `assistantKnowledge.cjs` |
| 19 | Polering: «hvem er syg i morgen?» gav «Ingen tilgængelige registreringer matcher spørgsmålet» | polering | Round12-test (tomt svar) | specifik besked i rigtig tid (da/en/fi/sv) | `assistantKnowledge.cjs` |
| 20 | Polering: ISO-datoer i «er tilbage»-sætninger, «Henkilöllä…», fødselsdag «09-25» | polering | insights-/bank-/knowledge-tests | naturlige datoer (`assistantNiceDate.cjs`), omformuleret fi-sætning, fødselsdage «25. september» | `assistantNiceDate.cjs`, `assistantInsights.cjs`, `assistantKnowledge.cjs` + opdaterede forventninger |
| 21 | Polering: tomt-svar-hint foreslog samme periode som spørgsmålet | polering | Round12-test | alternativt eksempel (`asked`) | `assistantNextStep.cjs` |

Rodårsager: nr. 1 datolaget havde ingen relative udtryk ud over uge/dag; 2-4 samtalelaget kendte ikke emne/pronomen/rettelse; 11-13 permissions-registeret og guarden blev ikke brugt konsekvent; 14 guarden matchede kun klar tekst; 16-17 sprogspecifikke mønstre.

## Rettighedsmatrix
- 45 spørgsmål (da+en, delmængde fi+sv) × creator/manager/bruger/observatør (bruger og leder) × eget/fremmed team. Invarianter: ingen hemmelighed over rollens grænse, `api.snapshot()` uændret, skriveintentioner kun som forslag/afvist, specifik afvisning (ikke generelt overblik) og afvisninger logges ikke.
- Første kørsel fandt 3 rigtige huller (nr. 11-13); resten var test-forventninger (observatører må se guides og fødselsdage ifølge `VIEW_KEYS`; offentlig hjemmearbejds-/personliste fra fremmed team er tilladt).

## Mønstre
- Perioder løses ét sted (`assistantRelativeDates`), opfølgninger bruger samme funktion.
- Nye læsekilder skal føjes til rettighedsmatricen; observatør-hubs følger registerets `VIEW_KEYS`.
- Guarden normaliserer (usynlige tegn, look-alikes, base64, rot13) før den matcher.
- Tomme svar skal være specifikke og foreslå en anden periode end den spurgte.

## Åbne punkter og beslutninger
- [ ] Strukturerede `sources` (recordId/owner) bærer stadig kollegaers e-mail; matricen kontrollerer kun den viste tekst (uændret åbent fra tidligere runder; kræver ændring uden for Hubert-lagene).
- [ ] ISO-datoer er bevidst bevaret i overskrifter og lister; kun sætninger («tilbage mandag den 21. september»), fødselsdage og tomt-svar er naturliggjort. Beslutning: skal overskrifter også naturliggøres?
- [ ] Rene dataopslag viser brugerskrevet fritekst som den står (også hvis den ligner en ordre); kun retrieval/resumé fjerner ordrer. Beslutning hvis I vil have markering.
- [ ] «jeg skal lave en P300 til …» (erklæring uden spørgsmål) forbliver `unmatched` med nærmeste guides og logges – bevidst, ikke i bank.
- [ ] Finsk UI er maskinoversat – uændret. `src/`, `main.cjs`, 1.6.0 og 1.5.x er ikke rørt.

## Verifikation
- Bank: 1267 -> 1379 spørgsmål (+112: da 34, en 34, fi 22, sv 22; talt i konsolideringen i runde 13), alle PASS; 12 nye paritetsrækker (`PARITY_R12`) uden afvigelser.
- Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 506/506, exit 0 (baseline 456).
- Fuld electron-suite (async): 1051/1051, exit 0.
- `tsc -b`: exit 0. Vitest: 111 filer, 1252 passed, 1 skipped, exit 0 (`src/` er ikke ændret af runde 12).
- Unicode-scan: nye bogstavelige `\u00`-forekomster er kun gyldige JS-escapes i regex/test (`INVISIBLE` i guarden); nye filer med `\u200b`/`\u043e` er bevidste test-strenge.
- Ingen build/release kørt.
