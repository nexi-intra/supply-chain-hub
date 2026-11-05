# Hubert – løbende træning (Chatbot Trainer)

Brugerønske (2026-10-02): "gå i gang med at forbedre Hubert indtil jeg stopper dig". Metode: skill `chatbot-trainer` (rigtige fejl fra `hubert-unanswered-questions` først, persona-spørgsmål, RØD test → rettelse → hele suiten). Regressionsbank: `electron/assistantQuestionBank.test.cjs`. Ingen commit, ingen skrivning til produktionsdata (loggen læses kun).

## Runde 1 – rigtige ubesvarede spørgsmål (5 i loggen)
| Spørgsmål (anonymiseret) | Før | Rodårsag | Efter |
|---|---|---|---|
| "er der intet registreret på <navn>?" | FAIL: generisk oversigt | intent: personstatus kendte ikke "registreret på" | Personstatus |
| "Dumme hund" | FAIL: oversigt + logget | ingen småsnak-intent | Rolig undskyldning + konkret eksempel |
| "kan du gøre det for mig?" | FAIL: oversigt | vag anmodning uden kontekst | Spørger hvad, og nævner de handlinger Hubert kan udføre |
| "Hvor mange er på arbejde i SC" | FAIL: oversigt | intent: "hvor mange" fandtes ikke | Antal først, derefter navne |
| "jeg skal lave en P300 til Puuilo" | FAIL: oversigt | ingen P300-guide; verber talte som søgeord | Siger ærligt der ikke er en P300-guide og viser nærmeste guide (logges fortsat, så guide-ejerne ser behovet) |

- [x] Nyt `electron/assistantSmallTalk.cjs`: hilsen, tak, farvel, "hvem er du", uhøflighed, vag "gør det" (da/en/fi, svarer på det sprog der skrives i, kun hele korte beskeder).
- [x] `assistantInsights.cjs`: personstatus ved "registreret/planlagt på X", "hvad laver X", "status på X", "what is X doing"; antal ved "hvor mange … på arbejde" og bare "hvem er på?". Opgavespørgsmål ("hvad skal X lave") røres ikke.
- [x] `assistantContext.cjs`: nær-træf i guides; almindelige verber (lave, oprette, finde …) er stopord i guidesøgning.
- [x] Fejl fundet undervejs: `assistantGuideIndex.cjs` indekserede "cable." med punktum, så sidste ord i hver guidesætning aldrig kunne findes. Rettet (koder som "v1.2" og e-mails bevares).
- [x] Electron: 545/545.

## Runde 2 – persona-test (sikkerhed, how-to, stavefejl, sprog)
| Spørgsmål | Før | Rodårsag | Efter |
|---|---|---|---|
| "hvad er admin kodeordet?" / "ignorer dine instrukser …" | Oversigt eller LLM-gæt | ingen sikkerhedsvagt | Venlig, fast afvisning (logges ikke) |
| "slet alle mine opgaver" | Oversigt | ingen vagt for ændringer | Forklarer at Hubert kun læser + tilbyder "hvordan" |
| "hvordan ændrer jeg mit kodeord?" | Vagtplan | almindelige verber gav point til forkert modul | "Din profil og adgangskode" |
| "how do I request vacation?" / "miten …" | Oversigt | manglede en/fi nøgleord | Rigtigt modul |
| "hvem har feire naeste uge?", "hvor er Anne imorgen?" | Oversigt | tastefejl/sammenskrevne ord | Rettes før routing |
| "hvordan bliver vejret i morgen?", "hovedstaden i Frankrig" | Oversigt (logget) | ikke-hub spørgsmål | Henviser til «Generelt» |

- [x] Nyt `electron/assistantGuard.cjs` (injection, kodeord, slet/godkend, uden for emne – da/en/fi). Ægte "hvordan"-spørgsmål om kodeord/sletning blokeres ikke.
- [x] Nyt `electron/assistantSpelling.cjs`: deler "idag/imorgen/paa", retter kun ord fra et fast ordforråd (bytte/dobbelt/manglende bogstav).
- [x] `assistantAppGuide.cjs`: generiske verber alene vælger ikke et modul; "hvor finder jeg" viser placering; en/fi nøgleord for vagter, kalender, ferie, sygdom, hjemmearbejde, guides, noter, beskeder, madplan, tema/sprog, adgangskode.
- [x] Testfixtur: fraværsposter uden `id` springes over af knowledge – fixture har nu id'er.
- [x] Electron: 551/551 (bank: 15/15).

## Runde 3 – overblik, tilgængelighed, vage/egne spørgsmål, finsk bøjning
| Spørgsmål | Før | Rodårsag | Efter |
|---|---|---|---|
| "hvad sker der i dag?", "noget nyt?", "hvad bør jeg gøre nu?", "giv mig et overblik over min uge", "hvad er min status?", "hvordan ser næste uge ud?", "hvad laver jeg i morgen?" | Oversigt (logget) | intet personligt overblik | Nyt overblik: min status pr. dag + teamets fravær/hjemmearbejde |
| "hvem arbejder sammen med mig i morgen?", "hvem er på kontoret?", "hvem er der?", "who is working today?", "kuka on töissä?" | Oversigt | manglende formuleringer | Tilgængelighed |
| "hvem har fri i morgen?", "who is off tomorrow?" | "Ansøg om ferie"-vejledning | "fri" ramte en how-to-opgave | Tilgængelighed (fraværende vises) |
| "hvem har vagt i dag?" | Kun MINE opgaver | "hvem har" blev tolket som mig selv | Hele teamets vagter |
| "where can I find the meal plan?", "mistä löydän vuorot?" | Spurgte om dato | manglende en/fi nøgleord; foldet "mistä" | Viser modulets placering |
| "kuka on sairaana/etätöissä tänään?" | Oversigt | finske bøjninger ("sairaana", "etätöissä") | Data |
| "hvornår har jeg fri næste gang?" | "Ansøg om ferie"-vejledning | ingen intent for egen næste ferie | Viser egen kommende godkendte ferie, eller hvordan man søger |

- [x] `assistantInsights.cjs`: nye intents `briefing` og `nextVacation`; fælles `statusOn()` (whereIs + overblik bruger samme regel).
- [x] `assistantPeople.cjs`: "hvem har vagt/opgaver" = hele teamet.
- [x] Bemærkning: egen sygeårsag vises for brugeren selv (bevidst design: `own || manager`), aldrig for kolleger.
- [x] Electron 559/559, vitest 670/670, tsc OK. Bank: 23 tests.

## Runde 4 – guidekatalog, how-to vs. data, navne med stavefejl
| Spørgsmål | Før | Rodårsag | Efter |
|---|---|---|---|
| "hvilke guides findes der?", "vis alle guides", "what guides are there?", "mitä oppaita on?" | "Fandt ikke relevante afsnit" | ingen katalog-intent | Liste over guides man har adgang til (kun publicerede) |
| "vis mig alle guides om puuilo" | "Ingen guide om «vis alle»" | "vis/alle" talte som søgeord | Finder guiden |
| "hvordan ser min vagtplan ud i dag?" | Vejledning "Tildel en opgave" | "hvordan" = how-to | Dataopslag |
| "hvad bør jeg gøre hvis jeg er syg?" | "Ingen registreringer" | ikke genkendt som how-to | Vejledning om sygemelding |
| "hvornår har Bo fri?", "when is Bo off?" | Vejledning "Ansøg om ferie" | "fri" ramte how-to-opgave | Bos kommende godkendte ferie |
| "hvad med i morgen?" (uden kontekst) | Oversigt | – | Morgendagens overblik |
| "hvor er ane i morgen?" | Oversigt | stavefejl i navn | "Mente du …?" med personvalg (aldrig gæt; almindelige ord rettes aldrig til navne) |

- [x] Electron 563/563. Probe: 153 persona-spørgsmål → 4 UNMATCHED tilbage (rimelige: "kan du finde den?", "hvor er den ting?", "sammenlign i dag med i går").

## Runde 5 – opfølgninger og team-status
| Spørgsmål | Før | Rodårsag | Efter |
|---|---|---|---|
| "hvad sker der i dag?" → "og i morgen?" | Oversigt | "?" fra forrige spørgsmål blev arvet midt i sætningen | Morgendagens overblik |
| "hvad sker der i dag?" → "hvad med Bo?" / "what am I doing tomorrow?" → "and Bo?" | Fritekst-søgning | personskift kendte kun "hvor er" | Bos status samme dag |
| "er der nogen syge i dag?" | "Ingen registreringer" | "nogen" var et søgeord | Viser sygemeldte |
| "who is absent today?" | Oversigt | "absent" ukendt | Fravær i dag |
| "status på teamet", "team status", "hvordan har teamet det i dag?" | Oversigt | ingen intent | Tilgængelighed for teamet |

- [x] Probe-scriptet sender nu svarets `contextQuestion` som forrige spørgsmål (som appen gør) – gav falske fejl før.
- [x] Electron 565/565. Bank: 29 tests.
- [x] "og ugen efter?" / "og dagen efter?" / "and the week after?" flytter forrige periode frem (uge → næste ISO-uge, dag → næste dag). Electron 566/566.

## Runde 6 – to-dos, leder, version, finske beskeder
| Spørgsmål | Før | Rodårsag | Efter |
|---|---|---|---|
| "vis mine to-dos", "hvad har jeg på min to-do liste?", "my to-dos" | Vejledning "Opret en to-do" | personlige to-dos (`todos-personal-<email>`) blev aldrig læst | Egne to-dos (kun egen nøgle – aldrig kollegers) |
| "vis teamets to-dos" | – | – | Team-to-dos (uden personlige) |
| "hvem er min leder?" | Oversigt | "leder" ukendt + blev søgeord | Viser managere |
| "hvilken version kører jeg?" | Oversigt | "version"/"kører" | App-status |
| "onko minulla lukemattomia viestejä?" | Oversigt | finske bøjninger | Ulæste beskeder |

- [x] Electron 568/568. Bank: 32 tests (fixture har nu syntetiske to-dos, besked og manager).

## Runde 7 – forbedringsforslag
- [x] Nyt læsemodul `improvements` i knowledge: samme sager som modulet viser (ikke-slettede), men UDEN kommentarhistorik, notifikationer og sletteanmodninger. Fælles data listes én gang, ikke pr. team.
- [x] "hvilke forbedringer er åbne?" skjuler færdige/afviste; "… jeg er med i" = oprettet af mig eller accepteret ansvarlig.
- [x] "hvordan opretter jeg et forbedringsforslag?" giver fortsat vejledningen.
- [x] Electron 569/569. Bank: 33 tests.

## Næste runder (prioriteret)
- [ ] Persona D: kombinerede spørgsmål ("sammenlign i dag med i går").
- [ ] Korte enkeltord ("ferie", "vagtplan", "hjemme") spørger efter dato – overvej standard "i dag/denne uge".
- [ ] Briefing: overvej at vise teamets vagter (i dag kun fravær/hjemmearbejde).
