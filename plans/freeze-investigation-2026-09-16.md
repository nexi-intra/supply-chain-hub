# Undersøgelse: appen fryser fuldstændigt

Dato: 16. september 2026.

## Status: Fase 2 i gang — sikker batching er implementeret

## Hvad vi har udelukket
- [x] Den nye AI-model (8B) — Hubert er inaktiv i alle production-builds (`import.meta.env.DEV`), og `llama-server.exe` kørte slet ikke under en frysning.
- [x] GPU-cache-korruption — separat, allerede rettet problem (ryddede `%APPDATA%\tcd-hub\GPUCache` m.fl.).
- [x] Zscaler/VPN — bekræftet reel, men en anden, tidligere hændelse (langsom netværksadgang). Ikke samme frysning som denne.
- [x] Flere samtidige Electron-instanser/stale locks — ryddet op, men frysningen opstår også med kun én ren instans.

## Konkrete beviser indsamlet
- `win.webContents.on('unresponsive')` udløses ALDRIG under en frysning — Chromium anser ikke renderer for hængt.
- Et normalt luk-signal (`CloseMainWindow()`, svarer til vinduets X-knap) **fejlede** med at lukke appen under en frysning. Det betyder at selve **main-processens event loop er blokeret**, ikke kun renderer.
- Renderer-konsollen viste `MaxListenersExceededWarning: 11 kv:changed listeners added` lige efter login — ikke endeligt bevis, men peger på mange samtidige KV-læsninger på én gang.

## Ledende teori
`electron/store.cjs` og `electron/fileLock.cjs` bruger `Atomics.wait(...)` (en ægte tråd-blokerende sleep) i deres genprøvnings-løkker for **hver eneste** KV-læsning (op til 5 forsøg) og skrivning/lås (op til 30–50 forsøg). Electrons main-proces er enkelttrådet, så enhver kontesteret fil-operation blokerer **hele appens IPC** i op til flere sekunder ad gangen. Hub-dashboardet (og formentlig andre views) har ~11+ uafhængige `useKV`-hooks, der hver især sekventielt henter deres egen nøgle ved login/navigation — hvis flere af dem rammer en genprøvning samtidig, kan de samlede blokeringer stable sig op til en total frysning.

## Allerede rettet
- [x] `src/components/HubAssistant.tsx`: guide-indeksering (`prepare()`) kørte automatisk ~1 sek. efter Hub blev vist (kun i dev-mode). Nu venter den til brugeren rent faktisk åbner Hubert-panelet. Fjerner én automatisk baggrundsopgave, men er ikke bekræftet som hele løsningen.
- [x] Midlertidig diagnostik i `electron/main.cjs` (markeret `TEMP debugging`): logger renderer-console, `unresponsive/responsive`, `render-process-gone`, `did-fail-load`, samt `uncaughtException`/`unhandledRejection` i main-processen. **Skal fjernes igen, når vi er færdige** — er ikke ment til at blive i koden.

## Plan for at bekræfte og rette roden

### Fase 1 — Bekræft teorien (mål: se main-processen faktisk blokere)
- [x] Tilføj midlertidig timing-log omkring `store.cjs`'s `get()`/`keys()` og `fileLock.cjs`'s låseoptagelse. Kun operationer på mindst 100 ms logges.
- [x] Reproducér den langsomme/frosne Hub og bekræft main-trådens synkrone SMB-blokeringer.

### Fase 1-resultat
- En enkelt optagelse af `_registry/account-operation.lock` tager typisk **180–300 ms** uden kontention og blev udført gentagne gange under login/Hub-indlæsning.
- `active-sessions` tog **1.021–1.025 sekunder** pr. læsning; `users` tog op til **1.051 sekunder**. Alle var første forsøg, så forsinkelsen kommer fra SMB-I/O — ikke retry-loopet.
- `securedIpc.cjs` kalder `authService.current()` både før og efter hvert beskyttet IPC-kald. Hver `current()` genlæser `active-sessions` og `users` med `skipCache: true`.
- `securedIpc.cjs` kalder desuden `accountService.context()` både før og efter hvert IPC-kald. Hver `context()` tager `_registry/account-operation.lock` og læser migrationskontrol fra netværksdrevet.
- Et enkelt almindeligt `kv:get` kan derfor koste omtrent to sessionlæsninger, to brugerlæsninger og to globale låseoptagelser, før den ønskede nøgle læses. Hubben starter 11+ sådanne kald, hvilket blokerer main-tråden længe nok til meget langsom scrolling og manglende widgetdata.
- `llama-server.exe` kørte ikke under reproduktionen. AI-modellen er endeligt udelukket som årsag.

### Fase 2 — Fjern de synkrone blokeringer i main-processen
- [x] Batch samtidige lokale KV-læsninger i renderer til ét `kv:get-many`-kald. Alle nøgler valideres separat, batchen er begrænset til 100, og sikkerhedens pre/post-kontrol er bevaret.
- [x] Batch Hub-oversigtens tværgående teamlæsninger i ét `registry:read-teams-keys`-kald. Alle teams og nøgler valideres fortsat af `teamReadPolicy`, og batchen er begrænset til 20 teams og 20 nøgler pr. team.
- [x] Kør målrettede sikkerheds- og policytests efter batching: 40/40 bestået samt ren TypeScript-typecheck.
- [x] Bekræft i en frisk Electron-instans, at teamdata vises. Bekræftet: `readTeamsKeys` virker, ingen listener-advarsel, ingen KV_LOCK_BUSY.
- [x] Tidsbundet auth-snapshot-cache (Løsning A, godkendt af bruger): `authService.current()` deler ét friskt snapshot pr. sender i 500 ms, så en byge af autorisationstjek ved modul-load ikke længere laver 2×(`active-sessions`+`users`+`teams`+creator) netværkslæsninger pr. IPC-kald. Cachen invalideres øjeblikkeligt ved login/logout/resume/renew/selectView/profile/forget og ved rod-skift. `accountService.context()`/migration er IKKE cachet — migrations-detektion forbliver øjeblikkelig.
- [x] Sikkerhedskontrakt: revocation/rolle-/session-tamper-/view-tildeling slår nu igennem inden for ≤500 ms i stedet for øjeblikkeligt (bevidst, godkendt afvejning). Tests opdateret til at verificere grænsen via det injicerede ur. authService+securedIpc+accountService: 73/73 bestået.

### Resterende flaskehals (til Fase B)
- `accountService.context()` tager stadig `_registry/account-operation.lock` (opret+læs+slet ≈ 200 ms over SMB) **to gange pr. IPC-kald**. Dette er nu den dominerende omkostning i loggen. Auth-cachen fjernede ~70 % af per-kald-omkostningen (~1360 ms → ~400 ms), men konto-låsen kræver enten samme bundne-forældelses-teknik på migrations-læse-porten ELLER den fulde async-omskrivning. Da det rører migrations-kritisk transaktionskode, er det klassificeret som Fase B.

### Fase B — Fjern den synkrone konto-lås/storage-blokering (senere)
- [ ] Omskriv `wait()` i `store.cjs` og `fileLock.cjs` fra `Atomics.wait` (blokerende) til en rigtig async delay (`await new Promise(r => setTimeout(r, ms))`), og gør `get`/`set`/`del`/`withFileLock` m.fl. asynkrone hele vejen igennem (de kaldes allerede asynkront via IPC, så dette bør ikke ændre den offentlige adfærd for renderer-siden).
- [ ] Sikr at alle kaldssteder i `main.cjs` og andre `.cjs`-filer, der bruger disse funktioner synkront, opdateres til at `await`e dem korrekt.
- [ ] Kør eksisterende test-suite (`npm run test:store`, `npm run test`) og ret evt. tests, der antog synkron adfærd.

### Fase 3 — Reducér antallet af samtidige KV-kald ved login
- [ ] Overvej at samle de mange individuelle `useKV`-opkald på Hub-dashboardet (og evt. andre views) til færre, parallelle (`Promise.all`) kald i stedet for at hver widget/hook henter uafhængigt.
- [ ] Undersøg om `MaxListenersExceededWarning`-tallet (11+) vokser yderligere ved navigation mellem views — hvis det vokser ubegrænset, er der en reel listener-lækage ud over det forventede antal, og den skal findes og rettes separat.

### Fase 4 — Oprydning og validering
- [ ] Fjern al midlertidig `TEMP debugging`-instrumentering fra `electron/main.cjs` igen.
- [ ] Fuld regressionstest: login, Hub, Vagtplan, Hubert (2B og 8B), på både hurtigt og kunstigt forsinket netværksdrev (fx via en throttling-proxy eller en bevidst langsom testmappe), for at bekræfte at frysningen er væk under realistisk belastning.
- [ ] Opdatér release-reviewet ([plans/release-1.5.1-review-2026-09-15.md](../plans/release-1.5.1-review-2026-09-15.md)) med konklusionen, hvis den stadig er relevant for 1.5.1-releasen.

## Anbefaling
Start med **Fase 1** — det er billigt, reversibelt, og giver os det endelige bevis, før vi rører ved den mere invasive låse-arkitektur i Fase 2.
