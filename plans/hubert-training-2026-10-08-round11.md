# Hubert-træning runde 11 (chatbot-trainer, fix-mode) – 2026-10-08

Mål: luk de åbne punkter fra runde 10 og giv Hubert en sikker læsevej til brugerens EGNE Multiplayer-resultater, spil og udfordringer. Kun deterministiske lag (routing, intents, viden, app-guide, normalisering, guard, bank). Den lokale LLM er ikke rørt.

## Faser
- [x] Fase 1: læs brief, runde 10-plan, Multiplayer-tjenesten og assistentens læsevej; baseline
- [x] Fase 2: design af læsevejen (lille reader-modul, ingen spilindhold, ingen ændring i `main.cjs`/worker)
- [x] Fase 3: RED (baseline-sonde før kode + nye tests/bank-rækker) – se «Baseline» og «Fund og rettelser»
- [x] Fase 4: GREEN – reader + wiring, «hvilket spil?», impersonal leder-opgave, guard, normalisering
- [x] Fase 5: runde 11-bank (da 47, en 33, fi 31, sv 32 = 143 nye spørgsmål; A–E + F leder + G observatør + J creator, opfølgninger med `after:`, tomme tilstande), score
- [x] Fase 6: rodårsag og permanente rettelser på de fund runden afslørede
- [x] Fase 7: verifikation (targeted, fuld suite async, tsc, vitest, unicode-scan, git status) – se «Verifikation»

## Baseline (før runde 11)
- Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 433/433, exit 0. Bank 1124 spørgsmål (da 341, en 304, fi 241, sv 238), alle PASS, paritet 91 rækker, 0 afvigelser.
- RED-sonde før koden (samme fixture-spørgsmål som senere blev bank-rækker):
  - «hvor mange sejre har jeg i skak?» gav app-guide («Dine opgør»); «hvem har jeg vundet flest mod?», «står jeg foran mod Bo?», «hvem venter på mit træk?» gav generelt overblik (`unmatched`, logget som ubesvaret); «hvilke spil har jeg i gang?» gav tomt dataopslag (logget `empty`); «har jeg ubesvarede udfordringer?» gav «Udfordr en kollega».
  - «hvem har vundet flest?» gav generelt overblik (logget). «hvordan registrerer man barsel» gav Kalender-opgaven også for en leder.

## Læsevejen (design)
- Multiplayer-tjenesten skriver ét delt indeks `multiplayer-index` (`_shared`): kamp-poster (`players` med visningsnavn, `status`, `turn`, `winner`, `type`) og arkiverede `records`. Spilfilerne (`game-<id>`) med bræt, **stativer og chat** læses aldrig.
- Assistent-workeren har allerede `readShared(key)` (frisk læsning, ingen cache for denne nøgle) – derfor er der **ingen ændring i `main.cjs`, workeren eller `src/`**. `assistantContext.cjs` kalder `readShared('multiplayer-index')` først når et spørgsmål er genkendt. Worker-testen kører den rigtige `createWorkerRuntime` mod en midlertidig `_shared/multiplayer-index.json`.
- Nyt modul `electron/assistantMultiplayer.cjs`: `detect()` (intents `record`, `rivals`, `against`, `inProgress`, `myTurn`, `waiting`, `invites`, `clarify`), `ownData()` (filtrerer til poster hvor spørgeren selv er spiller *før* noget bruges; tæller sejre/nederlag/remis som `tallyResults` i `multiplayer.cjs` – parity-testen kører samme indeks gennem den rigtige tjeneste), svartekster på da/en/fi/sv, `applyGameChoice()` til knapperne.
- Sikkerhed: kun spørgerens egne poster og modstanderens visningsnavn (renset for tegn og længde; aldrig e-mail); ingen levende stilling, stativer, chat, notifikationer eller andres spil. Creator kan ikke spille -> svaret siger det. Observatør får egne data bag samme note som resten af Multiplayer-svar. Svar er `mode: 'data'` og går derfor aldrig gennem LLM'en.
- Guard: andres resultater, spil, modstandere og «alle andres spil» -> `gameHidden` (tekst opdateret: tilbyder spørgerens egne data). Navne der også er hverdagsord («Dag») tæller kun med stort begyndelsesbogstav.

## Fund og rettelser (mønster -> lag -> RED -> rettelse -> filer)
| # | Fund | Lag | RED-test | Rettelse | Filer |
|---|---|---|---|---|---|
| 1 | Hubert kunne ikke svare på egne resultater, spil, tur og udfordringer (da/en/fi/sv) | knowledge/action | RED-sonde (se Baseline), `assistantMultiplayer.test.cjs`, bank A–D | læsevej + reader-modul, wiring i `queryOne`, fixture med fiktive spil | `assistantMultiplayer.cjs`, `assistantContext.cjs`, `assistantTrainingBank.cjs` |
| 2 | «Hvem har vundet flest?» uden spil gav generelt overblik og blev logget | intent/routing | `assistantMultiplayer.test.cjs` («which game?»), bank C/D | afklarende svar «Hvilket spil mener du: Word-Puzzle eller skak?» med `personChoices` (`game:chess`/`game:word-puzzle`); knap sender `selectedPerson`, typet «skak» fanges i `continueQuestion` (`BARE_GAME`) | `assistantMultiplayer.cjs`, `assistantContext.cjs`, `assistantConversation.cjs` |
| 3 | «hvordan registrerer **man** barsel» gav Kalender-opgaven til lederen | normalisering (app-guide) | `assistantTrainingRound11.test.cjs` («subject pronouns…»), bank F | nøgleordsmatcheren folder subjekt-pronominer (`jeg/man/du/vi/we/you/one/jag`) og danske verbalformer (`giv/giver/give`, `registrer/registrere/registreres` …) til én stamme på begge sider; flere former af samme nøgleord tæller én gang; `userTask` lader en leder-opgave pege en medarbejder til forklaringen i stedet for rolle-siden | `assistantAppGuide.cjs` |
| 4 | Søsterspørgsmål til lederopgaver: ingen opgave for «giv ferie/fridag» (Manager Panel «Giv Ferie/Fridag»); sygemelding for en kollega manglede i trinene; «godkender man semester» (sv) gav ansøgnings-opgaven | knowledge | bank F/A alle sprog | ny opgave `grant-vacation` (da + en/fi/sv, `requires: MANAGER`, `userTask: request-vacation`), sick-leave-trin om feltet «Medarbejder», nøgleord for passiv/upersonlig form (`registreres barsel`, `parental leave is registered`, `kirjataan perhevapaa`, `godkaenner semester` …), `how is … registered` som how-to | `assistantAppGuide.cjs`, `assistantAppGuideI18n.cjs` |
| 5 | **Sikkerhedshul**: guardens how-to-undtagelse (`hur`, `kuinka`) slap alle svenske «hur många …»- og finske «kuinka monta …»-spørgsmål igennem | permissions | `assistantTrainingRound11.test.cjs` («hur många»), bank E (sv/fi) | `HOW_TO` i guarden ekskluderer `hur många/mycket/ofta/länge` og `kuinka monta/moni/paljon/usein/kauan` | `assistantGuard.cjs` |
| 6 | Andres Multiplayer-resultater og «alle andres spil» var ikke afvist | permissions | `assistantMultiplayer.test.cjs` (guard), bank E alle sprog | `mentionsOthersGames` udvidet (resultat-/stilling-/spil-i-gang-ord, finske kasusendelser, hverdagsord-navne kræver stort bogstav), `EVERYONES_GAMES`, `gameHidden`-tekst | `assistantGuard.cjs` |
| 7 | Accentløst/stavefejl: `traek`, `skack`, `kaynnissa`, `peleja`, `forlorat` faldt til generelt overblik | normalization | `assistantTrainingRound11.test.cjs` («spelling»), bank C | SPLIT-tabellen i den delte stavekorrektion | `assistantSpelling.cjs` |
| 8 | Opfølgning «og i Word-Puzzle?» efter et skakspørgsmål (modsat retning) og finsk partitiv «entä Anne?» efter «olenko Boa edellä?» | routing/follow-up | `assistantTrainingRound11.test.cjs` («follow-ups»), bank D | `GAME_SWAP` begge veje, `findPerson` accepterer finske kasusendelser | `assistantConversation.cjs` |
| 9 | «hvem fører ranglisten i skak?» og «min stilling mod en kollega» gik til forkerte opgaver (udfordring / Team Oversigt) | knowledge | bank A/D | flerords-nøgleord i «Dine opgør»-opgaven (peger på «Rangliste»; Hubert viser ikke andres stilling) | `assistantAppGuide.cjs` |
| 10 | Finsk `sairaaksi` ramte ikke sygemeldings-opgaven (dataopslag i stedet) | knowledge | bank A/fi | stammen `sairaa` | `assistantAppGuide.cjs` |
| 11 | Egen regression fanget af gammel bank: stamme-reglerne gjorde «ændrer» ikke-generisk (`hvordan ændrer jeg mit kodeord?` gav «Ret en gentaget vagt») | routing | `assistantQuestionBank.test.cjs` (eksisterende) + ny assertion | `GENERIC`-mængden foldes med samme stamme-funktion | `assistantAppGuide.cjs` |
| 12 | Egen regression: dobbelt-tælling af samlede varianter (sv «importerar jag en Word-guide» -> Knowledge Base) | routing | bank A/sv (eksisterende) | varianter med samme stamme tæller én gang; identiske nøgleord tæller som før | `assistantAppGuide.cjs` |
| 13 | Hubert sagde i tre sprog «kan ikke slå Multiplayer-resultater op» | docs | bank A/B | «Dine opgør»-noten peger nu på at spørge Hubert om egne resultater (da/en/fi/sv); 4 gamle forventninger («Dine opgør»-guide for «hvor mange sejre har jeg i skak?») rettet til data-svar | `assistantAppGuide.cjs`, `assistantAppGuideI18n.cjs`, `assistantTrainingRound10.cjs` |

## Runde 11-bank
- 143 nye spørgsmål: da 47, en 33, fi 31, sv 32. Bank i alt 1124 -> 1267 (da 341 -> 388, en 304 -> 337, fi 241 -> 272, sv 238 -> 270).
- Personaer: A nybegynder (inkl. tomme tilstande `noGames`), B erfaren, C uklar/stavefejl/uden accent, D power user og opfølgninger (`after:`, sammensatte spørgsmål, «skak» efter «hvilket spil?»), E sikkerhed (aldrig logget), F leder, G observatør, J creator.
- 15 nye paritetsrækker (`PARITY_R11`): 107 rækker i alt, 0 afvigelser.
- Fixture: fiktivt Multiplayer-indeks (`me@test` spiller Bo, Clara, Anne og Dag; Zed og Yvonne spiller kun hinanden og må aldrig dukke op – ligger i `SECRETS`). `createFixture({ noGames: true })` giver tomt indeks.

## Scorecard
| | PASS | WARNING | FAIL |
|---|---|---|---|
| Baseline gammel bank (1124) | 1124 | 0 | 0 |
| Efter reader + wiring: 4 gamle forventninger (runde 10 «hvor mange sejre») skulle opdateres | 1120 | 0 | 4 (forventning, ikke fejl) |
| Runde 11, første kørsel af 143 nye | 139 | 1 | 3 |
| **Efter rettelser** | **1267** | 0 | 0 |

De fire første fund var: «min stilling mod en kollega» (where-ruten), finsk partitiv i opfølgning, finsk `sairaaksi`-stamme og en bank-forventning om en linje der ikke gælder med spilnavn. Ingen FAIL var en sikkerhedslækage. Alle nye E-spørgsmål gav guard-svar og blev ikke logget (den eksisterende test over alle E-rækker dækker dem).

## Mønstre (Fase 7)
- **En ny læsevej kræver tre ting samtidig** (frekvens 3, alvor 5): filtrering til egne poster før brug, guard for andres tilsvarende data, og en test der kører samme indeks gennem den rigtige tjeneste (tallene er lobbyens). Tjek-liste for fremtidige læsevej-moduler.
- **Guardens how-to-undtagelse kan ikke bygge på ét ord** (frekvens 2, alvor 5): `hur`/`kuinka` betyder også «hvor mange». Fundet fordi den nye guard-regel ikke virkede på svensk.
- **Nøgleord skal ikke afhænge af subjekt og verbalform** (frekvens 4): permanent rettelse i matcheren i stedet for flere enkeltnøgleord. Bivirkninger vi fangede med den gamle bank: generiske verber og duplikerede varianter skal foldes/tælles med samme funktion.
- **Passiv/upersonlig form** (`registreres`, `is registered`, `kirjataan`) er nu dækket for lederopgaverne.

## Åbne punkter og beslutninger
- [ ] Hubert viser kun egne resultater. «Hvem fører ranglisten?» henviser til «Rangliste» i Multiplayer. Vil I have at Hubert også siger hvem der fører, er det en beslutning (rangliste-data viser andre menneskers navne og tal).
- [x] Ingen live-stilling i et igangværende spil (point, bræt, stativ, chat) – bevidst udeladt (beslutning: forbliver sådan af hensyn til privatliv).
- [ ] Tidligere åbne punkter om `main.cjs`-afgrænsning af evidens, e-mail i kilder, teamoverblik på tværs og highscore-sektor kræver `src/`/`main.cjs` og beslutning – uændret. Finsk UI er maskinoversat (kun noteret). Sygeårsag er fortsat skjult for ledere (beslutning fra før).
- [ ] Opgaven `grant-vacation` bruger de maskinoversatte finske/svenske UI-navne («Apurahaloma/vapaapäivä», «Bevilja semester/ledig dag») ordret fra oversættelsesfilerne.

## Verifikation
- [x] Ny bank: 1267/1267 PASS (143 nye); paritet 107 rækker, 0 afvigelser.
- [x] Targeted (`assistant*.test.cjs` + `swedishCoverage.test.cjs`): 456/456, exit 0 (baseline 433; +13 `assistantMultiplayer.test.cjs`, +10 `assistantTrainingRound11.test.cjs`).
- [x] Fuld electron-suite (async, 50 filer): 1001/1001, 0 sprunget over, exit 0.
- [x] `tsc -b`: exit 0.
- [x] Vitest: 111 filer, 1252 bestået, 1 sprunget over, exit 0 (`src/` ikke ændret af denne runde).
- [x] Unicode-scan: kun de gamle hits (assistantGuideIndex:6, assistantKnowledge:3, improvements.test:214/669/671, improvementsDirectory.test:91/144, multiplayer.test:541).
- Ændrede filer (min runde): `electron/assistantAppGuide.cjs`, `assistantAppGuideI18n.cjs`, `assistantContext.cjs`, `assistantConversation.cjs`, `assistantGuard.cjs`, `assistantSpelling.cjs`, `assistantTrainingBank.cjs`, `assistantTrainingData.cjs`, `assistantTrainingRound10.cjs` (4 forventninger); nye: `assistantMultiplayer.cjs`, `assistantMultiplayer.test.cjs`, `assistantTrainingRound11.cjs`, `assistantTrainingRound11.test.cjs`, denne plan. **Ingen ændring i `main.cjs`, `assistantWorker.cjs`, `multiplayer.cjs` eller `src/`.** Ingen midlertidige filer i projektet, ingen build, commit eller push, intet skrevet til M:.
