# M:-drev performance – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SCH 1.6.7 fryser aldrig på M:, belaster `\\VM-MSDK-2\org` langt mindre og viser kollegers ændringer mindst lige så hurtigt som i dag.

**Architecture:** Watcheren i `electron/store.cjs` stat'er kun selve mappen hvert tick og laver fuld scan ved ændret mappe-`mtime` eller sikkerheds-scan. Synkrone M:-kald på almindelige brugsstier (auth, registry-læsning, `current()`, sygefravær) flyttes til eksisterende async-varianter. Uændrede værdier skrives ikke. Ved lukning ventes kort på igangværende skrivninger.

**Tech Stack:** Electron (main: CommonJS `.cjs`, `node:test`), React/TypeScript (renderer, vitest).

**Spec:** [m-drev-performance-design.md](./m-drev-performance-design.md) · diagnose: [m-drev-performance.md](./m-drev-performance.md)

Alle stier herunder er relative til `Supply-Chain-Hub 1.6.7/`. Kommandoer køres i den mappe.

## Global Constraints

- Intet nyt dataformat på M: – 1.6.6 og 1.6.7 skal kunne køre samtidig på samme filer.
- Låsemodellen (lås-fil pr. nøgle, global `account-operation.lock`), kryptering og backup-politik ændres ikke.
- Watcher-værdier: tick 1 s synlig / 10 s skjult; sikkerheds-scan 30 s synlig / 120 s skjult; ændrings-udløste fulde scans højst hver 2 s.
- Lukning venter højst 10 s på igangværende skrivninger.
- Opstart før vinduet vises må ikke blive langsommere.
- Kommentarer på dansk som resten af `electron/` (ASCII-stil `oe/aa/ae` er OK, som eksisterende kode).

## Review Focus

1. **Netværksdrev forsvinder midt i et tick** (mappe-`stat` fejler) → `onConnectionChange(false)` præcis som i dag, og reconnect giver fuld scan. *Test i Task 2.*
2. **Ændring der ikke flytter mappe-`mtime`** (in-place overskrivning, 1.6.6-særtilfælde, SMB-cache) → fanges senest af sikkerheds-scan. *Test i Task 2.*
3. **Udløbet registry-cache mens en kollega lige har ændret teams/manager-adgang** → gammel værdi serveres højst én baggrunds-rundtur længere end i dag; mutationer læser stadig frisk. *Test i Task 4.*
4. **Login mens en anden klient holder kontolåsen** → venter uden at fryse vinduet og ender med samme fejlkode `KV_LOCK_BUSY` efter 40 forsøg som i dag. *Test i Task 5.*
5. **Skrivning med uændret værdi** fra flere klienter (`setField` med samme værdi) → ingen fil-skrivning, ingen ændrings-broadcast, men kalderen får samme returværdi som før. *Test i Task 7.*

---

## Fase 1 – Måling og billig watcher

### Task 1: Frys-diagnostik viser hvad main lavede

**Files:**
- Create: `electron/mainActivity.cjs`
- Create: `electron/mainActivity.test.cjs`
- Modify: `electron/main.cjs` (watchdog ved `MAIN BLOCKED`, ca. linje 760–770; wrap af `ipcMain.handle` før første handler registreres)

**Interfaces:**
- Produces: `createActivityTracker({ now = Date.now } = {}) → { begin(label: string): () => void, describe(): string }`. `describe()` returnerer fx `"i gang: ipc:auth:login (8120 ms) · sidst startet: ipc:auth:login"`; tom tracker → `"i gang: – · sidst startet: –"`.

- [ ] **Step 1: Skriv fejlende tests** i `electron/mainActivity.test.cjs`:
  - `describe lists in-flight labels with their age and the last started label` – `now` styres manuelt: `begin('ipc:a')` ved t=0, `begin('ipc:b')` ved t=100, `end` af b, `now=500` → `describe()` indeholder `ipc:a (500 ms)` og `sidst startet: ipc:b`, ikke `ipc:b (`.
  - `an ended label is not reported twice and end is idempotent` – kald `end()` to gange; `describe()` indeholder `i gang: –`.
- [ ] **Step 2:** `node --test electron/mainActivity.test.cjs` → FAIL (modul findes ikke).
- [ ] **Step 3: Implementér** `createActivityTracker` (Map af id → {label, startedAt}; `lastStarted` gemmes i `begin`).
- [ ] **Step 4:** `node --test electron/mainActivity.test.cjs` → PASS.
- [ ] **Step 5: Wire i `main.cjs`:** opret én tracker ved modul-load; erstat `ipcMain.handle` med en wrapper der kalder `tracker.begin('ipc:' + channel)` og afslutter i `finally` (også for handlere der kaster synkront). Wrapperen skal installeres før `securedIpc`/andre handlere registreres. Watchdog-linjen bliver: ``diagnostics.write('warn', `MAIN BLOCKED ${ms} ms – ${tracker.describe()}`)``. Brug også `tracker.begin('timer:sick-purge')` / `'timer:auto-backup'` / `'watcher:team'` / `'watcher:shared'` omkring de tilsvarende callbacks.
- [ ] **Step 6:** `npm test` → PASS. Commit: `perf(diagnostics): MAIN BLOCKED viser hvilken handling der frøs main`.

### Task 2: Watcher med mappe-`mtime`, sikkerheds-scan, loft og synlighed

**Files:**
- Modify: `electron/store.cjs` (konstanter ca. linje 60–66, `watch()` ca. linje 699–733, eksport-objektet)
- Modify: `electron/offlineSync.cjs` (`watch()` ca. linje 423, eksport-objektet)
- Test: `electron/store.test.cjs`, `electron/offlineSync.test.cjs`

**Interfaces:**
- Produces (eksporteret fra `store.cjs` modul): `decideWatchTick(state, config) → 'full' | 'skip' | 'defer'` hvor `state = { visible: boolean, dirMtimeMs: number, lastDirMtimeMs: number | null, nowMs: number, lastFullScanAtMs: number, lastChangeScanAtMs: number | null, forceFull: boolean }` og `config = { safetyScanMs, hiddenSafetyScanMs, minScanGapMs }`.
- Produces (store-instans): `watch(onChange, onConnectionChange, options?)` hvor `options` er enten et tal (legacy = synligt tick, clampes til `MIN_WATCH_INTERVAL_MS` som i dag) eller `{ intervalMs = 1000, hiddenIntervalMs = 10000, safetyScanMs = 30000, hiddenSafetyScanMs = 120000, minScanGapMs = 2000 }` (objekt-værdier clampes **ikke**, så tests kan bruge små tal). Returnerer fortsat en stop-funktion.
- Produces (store-instans og resilient store): `setWatchVisibility(visible: boolean): void`. Skift til `true` sætter `forceFull` og kører et tick med det samme.

Regler for `decideWatchTick` (algoritmen er ikke givet af signaturen):

```text
safetyDue = nowMs - lastFullScanAtMs >= (visible ? safetyScanMs : hiddenSafetyScanMs)
changed   = forceFull || dirMtimeMs !== lastDirMtimeMs
if (!changed && !safetyDue) return 'skip'
if (changed && !safetyDue && !forceFull && lastChangeScanAtMs !== null && nowMs - lastChangeScanAtMs < minScanGapMs) return 'defer'
return 'full'
```

Tick-forløb: `fs.promises.stat(dataDir)` → fejl = uopnåelig (samme forbindelses-logik som i dag). Ved `'full'`: kør eksisterende `scanDirectoryAsync(snapshot)`, sæt `lastDirMtimeMs` til den mtime der blev målt **før** scannen, `lastFullScanAtMs = now`, og `lastChangeScanAtMs = now` hvis scannen var ændrings-udløst. Den indledende synkrone scan i `watch()` sætter `lastFullScanAtMs` og `lastDirMtimeMs`, men **ikke** `lastChangeScanAtMs`. Brug `setTimeout`-kæde (`unref`) i stedet for `setInterval`, så intervallet kan skifte med synlighed; behold `scanning`-vagten.

- [ ] **Step 1: Skriv fejlende tests** i `electron/store.test.cjs`:
  - `decideWatchTick skips an unchanged directory, scans on change, defers within the gap and runs the safety scan` – tabeltest: uændret og ikke forfalden → `'skip'`; ændret mtime, `lastChangeScanAtMs` 500 ms siden, gap 2000 → `'defer'`; samme men 2500 ms siden → `'full'`; uændret men `nowMs - lastFullScanAtMs = 30000` synlig → `'full'`; samme 30000 men `visible:false` → `'skip'`; `forceFull:true` inden for gap → `'full'`.
  - `an unchanged directory is not rescanned file by file` – 20 nøgler skrevet; `watch(..., { intervalMs: 30, safetyScanMs: 60000 })`; tæl kald til `fs.promises.stat` hvis sti ≠ `directory` over 200 ms → `0`.
  - `a write from another store instance is reported on the next tick` – `watch(..., { intervalMs: 30, minScanGapMs: 0 })`, `other.set('k', 1)`, vent ≤ 500 ms → `changed` indeholder `'k'`.
  - `the safety scan finds a change that left the directory mtime untouched` – gem mappens mtime, `other.set('k', 2)`, `fs.utimesSync(directory, atime, previousMtime)`; `watch(..., { intervalMs: 20, safetyScanMs: 150, minScanGapMs: 0 })`; efter 80 ms ikke rapporteret, efter 400 ms rapporteret.
  - `a hidden watcher slows down and becoming visible scans at once` – `{ intervalMs: 20, hiddenIntervalMs: 5000, hiddenSafetyScanMs: 60000 }`, `setWatchVisibility(false)`, `other.set('k', 3)`, vent 150 ms → ikke rapporteret; `setWatchVisibility(true)` → rapporteret inden for 100 ms.
  - Eksisterende tests (`a watched store serves cached reads…` med legacy `1000`, disconnect/reconnect-testen med `5000`) skal fortsat bestå uændret.
- [ ] **Step 2:** `npm run test:store` → de nye tests FAIL.
- [ ] **Step 3: Implementér** `decideWatchTick`, den nye `watch()` og `setWatchVisibility` i `store.cjs`.
- [ ] **Step 4:** `npm run test:store` → PASS.
- [ ] **Step 5:** I `offlineSync.cjs`: send `options` uændret videre i `watch()` og tilføj `setWatchVisibility: visible => networkStore.setWatchVisibility?.(visible)` til det returnerede objekt. Tilføj test i `offlineSync.test.cjs`: `the resilient store forwards watch visibility to the network store` (fake networkStore registrerer kaldet).
- [ ] **Step 6:** `npm test` → PASS. Commit: `perf(store): watcher stat'er kun mappen og scanner ved aendring`.

### Task 3: Vinduets synlighed styrer watcherne

**Files:**
- Modify: `electron/main.cjs` (`createWindow()` ca. linje 660; `startWatcher()`/`startSharedWatcher()` ca. linje 293–335)

**Interfaces:**
- Consumes: `store.setWatchVisibility(visible)` og `sharedStore.setWatchVisibility(visible)` fra Task 2.

- [ ] **Step 1:** Tilføj modul-variabel `let windowVisible = true` og funktion `applyWatchVisibility()` der kalder `setWatchVisibility(windowVisible)` på `store` og `sharedStore` (hvis de findes). Kald den i slutningen af `startWatcher()` og `startSharedWatcher()`, så et team-skift arver tilstanden.
- [ ] **Step 2:** I `createWindow()`: `win.on('minimize')` og `win.on('hide')` → `windowVisible = false; applyWatchVisibility()`; `win.on('restore')` og `win.on('show')` → `windowVisible = true; applyWatchVisibility()`. (Et vindue der blot mister fokus forbliver "synligt".)
- [ ] **Step 3: Manuel verifikation:** `$env:TCD_HUB_DEBUG='1'; npm run electron:dev`; minimér vinduet 30 s og gendan; en ændring lavet fra en anden klient mens vinduet var minimeret vises straks ved gendannelse.
- [ ] **Step 4:** `npm test` → PASS. Commit: `perf(main): watcher tikker langsomt naar vinduet er skjult`.

## Fase 2 – Ingen frys

### Task 4: Registry-læsning uden synkron SMB efter første læsning

**Files:**
- Modify: `electron/registry.cjs` (`readJsonSafe` ca. linje 41–58, nyt modul-niveau single-flight, eksport)
- Test: `electron/registry.test.cjs`

**Interfaces:**
- Produces: `registry.whenRefreshed(): Promise<void>` – afventer alle igangværende baggrunds-opfriskninger (til tests og til `prefetchAsync`).
- Uændret: alle eksisterende `read*`/`list*`/`lookup*`-signaturer forbliver synkrone.

Adfærd: når `freshDepth === 0` og der findes en cache-post (også `value: undefined` for ENOENT): returnér altid kopien med det samme; er den ældre end `CACHE_TTL_MS`, start (single-flight pr. fil) en `fs.promises.readFile`-opfriskning der opdaterer cachen. Fejl i opfriskningen bevarer cachen. Uden cache-post: synkron læsning som i dag. `withFreshReads` er uændret (mutationer læser stadig frisk og synkront).

- [ ] **Step 1: Skriv fejlende tests** i `electron/registry.test.cjs`:
  - `an expired registry cache is served without a synchronous read and refreshed in the background` – skriv `teams.json` med team A, `readTeams` (varmer cache), skriv team B direkte til filen, skru `Date.now` 31 s frem, erstat `fs.readFileSync` med en der kaster → `readTeams` returnerer kun A; `await registry.whenRefreshed()` → `readTeams` indeholder B.
  - `a failed background refresh keeps serving the cached registry` – som ovenfor men slet filens mappe før opfriskning → efter `whenRefreshed()` returneres stadig A, intet kast.
  - `mutations still read the registry fresh` – efter ekstern ændring (inden for TTL) skal f.eks. `assignUserToTeam` bygge på den friske fil (eksisterende adfærd; testen skal blive grøn både før og efter).
- [ ] **Step 2:** `node --test electron/registry.test.cjs` → de to første FAIL.
- [ ] **Step 3: Implementér** i `readJsonSafe` + `whenRefreshed`. Lad `prefetchAsync` genbruge samme single-flight.
- [ ] **Step 4:** `node --test electron/registry.test.cjs` → PASS. Eksisterende tests der forventer frisk værdi efter TTL rettes til at `await registry.whenRefreshed()` først.
- [ ] **Step 5:** `npm test` → PASS. Commit: `perf(registry): udloebet cache serveres straks og opfriskes async`.

### Task 5: Login, resume, renew og logout uden synkron lås og I/O

**Files:**
- Modify: `electron/accountService.cjs` (efter `runAuthentication`, ca. linje 126; eksport-objektet)
- Modify: `electron/authService.cjs` (`createAuthService`-parametre, `login`, `resume`, `renew`, `logout`)
- Modify: `electron/main.cjs` (ca. linje 787–795: wire nye parametre)
- Test: `electron/accountService.test.cjs`, `electron/authService.test.cjs`

**Interfaces:**
- Produces (`accountService`): `runAuthenticationAsync(email: string, callback: ({ recovering: boolean }) => T | Promise<T>): Promise<T>` – `withFileLockAsync(globalLock(), …, { attempts: 40, delayMs: 200, staleMs: ACCOUNT_LOCK_STALE_MS })`, `recovering = !terminal(await readControlAsync())`, samme creator-regel som `runAuthentication`.
- Produces (`createAuthService` options): `runWriteAsync = async callback => callback()` og `runAuthenticationAsync = async (_email, callback) => callback({ recovering: false })`.
- Ændret: `renew(sender)` og `logout(sender)` bliver `async` (IPC-handlerne awaiter allerede). `login`/`resume` beholder signaturer.

Konkrete udskiftninger i `authService.cjs` (kun i `login`, `resume`, `renew`, `logout`):
- `account(email)` → `await accountAsync(email)`; `current(sender)` → `await currentAsync(sender)`.
- Brugernavns-opslaget i `login`: `openTeam(team).get('users', …)` → `await openTeam(team).getAsync('users', …)`.
- `runAuthentication(…)` → `await runAuthenticationAsync(…)`; inde i callbacken: `.mutate(` → `await ….mutateAsync(`.
- `logout`: `await runWriteAsync(() => openSessions().updateAsync('active-sessions', { op: 'deleteField', field: sessionKey(bound.token) }))`. Epoch/binding-oprydning sker stadig **før** første `await`.
- `registry.*`-kald forbliver synkrone (cachet, se Task 4); kald `await registry.prefetchAsync?.(getRoot())` først i `login` og `resume`.
- `signup` og `profile` røres ikke (afgrænset i spec).

- [ ] **Step 1: Skriv fejlende tests:**
  - `accountService.test.cjs`: `runAuthenticationAsync waits for a held account lock without blocking the event loop` – opret `_registry/account-operation.lock` med anden ejer; start `runAuthenticationAsync('a@x', () => 'ok')`; en `setImmediate`-callback skal køre før låsen frigives; slet låsfilen efter 300 ms → resolver `'ok'`.
  - `accountService.test.cjs`: `runAuthenticationAsync gives up with KV_LOCK_BUSY after its attempt budget` – lås holdes hele tiden, `delayMs` gjort lille via test-hook eller ventetid accepteret (≤ ~12 s) → rejecter med `code === 'KV_LOCK_BUSY'`.
  - `authService.test.cjs`: `login, resume, renew and logout never call synchronous store methods` – fixture-stores hvor `get`, `mutate`, `update`, `set` kaster `'SYNC_CALLED'`; et fuldt login → resume → renew → logout-forløb lykkes og `active-sessions` ender uden sessionen.
- [ ] **Step 2:** `node --test electron/accountService.test.cjs electron/authService.test.cjs` → nye tests FAIL.
- [ ] **Step 3: Implementér** `runAuthenticationAsync` og de fire auth-flows; wire `runWriteAsync: accountService.runWriteAsync, runAuthenticationAsync: accountService.runAuthenticationAsync` i `main.cjs`.
- [ ] **Step 4:** Samme kommando → PASS; derefter `npm test` → PASS.
- [ ] **Step 5:** `npm run test:electron-auth` → PASS (auth-smoke i rigtig Electron).
- [ ] **Step 6:** Commit: `perf(auth): login/resume/renew/logout venter async paa kontolaasen`.

### Task 6: Handlere og sygefravær-timer uden synkron M:

**Files:**
- Modify: `electron/main.cjs` – alle `authService.current(` i IPC-handlere (ca. linje 896, 914, 922, 923, 926, 949, 960, 996, 1096, 1283, 1288, 1289, 1303, 1307, 1440) og `purgeFinishedSickLeave` (ca. linje 542–561)
- Modify: `electron/warehouse/register.cjs:189` (`currentActor(event)` → `await currentActor(event)`; gør omsluttende funktion `async` hvis nødvendig)
- Modify: `electron/sickLeaveRetention.cjs` (ny async-tvilling)
- Test: `electron/sickLeaveRetention.test.cjs` (findes), `electron/warehouse/*.test.cjs`

**Interfaces:**
- Produces: `purgeStoreAsync(store, today: string): Promise<number>` – samme regler som `purgeStore`, men `getAsync`/`mutateAsync`.
- Ændret: `currentActor` i warehouse-wiring returnerer `Promise<actor>` (`event => authService.currentAsync(event.sender.id)`).

- [ ] **Step 1: Skriv fejlende test** `purgeStoreAsync removes finished sick leave and notices without synchronous store calls` – store-fake hvor `get`/`mutate` kaster; `getAsync`/`mutateAsync` virker; forventet antal fjernet = samme som `purgeStore` på samme data (genbrug eksisterende testdata hvis de findes).
- [ ] **Step 2:** Kør testen → FAIL.
- [ ] **Step 3: Implementér** `purgeStoreAsync`; gør `purgeFinishedSickLeave` `async`, brug `storeFor(...)` i stedet for `createStore(...)` (undgår synkron `mkdirSync`) og `purgeStoreAsync`. `setTimeout`/`setInterval` kalder den med `.catch(() => {})`.
- [ ] **Step 4:** Udskift alle `authService.current(event.sender.id)` / `authService.current(_event.sender.id)` i handlere med `await authService.currentAsync(…)` og gør handlerne `async`. Opdatér warehouse `currentActor` og `register.cjs:189`.
- [ ] **Step 5:** `grep -n "authService.current(" electron/main.cjs` → ingen træf. `npm test` og `npm run test:warehouse` → PASS.
- [ ] **Step 6:** Commit: `perf(main): handlere og sygefravaer-oprydning bruger async auth og store`.

## Fase 3 – Færre skrivninger og sikker lukning

### Task 7: Uændrede værdier skrives ikke

**Files:**
- Modify: `electron/store.cjs` (`updateDetailed`, `updateDetailedAsync`, `mutate`, `mutateAsync`)
- Test: `electron/store.test.cjs`

**Interfaces:**
- Uændrede signaturer og returværdier. Ny regel: hvis `JSON.stringify(next) === JSON.stringify(current)` (current = værdien læst under låsen), springes `setUnlocked`/`setUnlockedAsync` over. `compareAndSet`-grenen er allerede sådan.

- [ ] **Step 1: Skriv fejlende tests:**
  - `updateAsync with an unchanged field value does not rewrite the file` – `setAsync('client-versions', { a: { v: 1 } })`, notér filens `mtimeMs`, vent 20 ms, `updateAsync('client-versions', { op: 'setField', field: 'a', value: { v: 1 } })` → returnerer `{ a: { v: 1 } }`, `mtimeMs` uændret, ingen `*.tmp` i mappen.
  - `mutateAsync returning an equal value does not rewrite the file` – callback returnerer `structuredClone(current)` → `mtimeMs` uændret, returværdi = værdien.
  - `upsert of an identical item does not rewrite the file` – samme for `{ op: 'upsert', items: [sameItem] }`.
  - `a real change is still written` – `setField` med ny værdi → `mtimeMs` ændret og `getAsync(..., { skipCache: true })` giver ny værdi.
- [ ] **Step 2:** `npm run test:store` → de tre første FAIL.
- [ ] **Step 3: Implementér** sammenligningen i de fire funktioner (sync-tvillingerne også, for ens adfærd).
- [ ] **Step 4:** `npm test` → PASS. Commit: `perf(store): spring skrivning over naar vaerdien er uaendret`.

### Task 8: Lukning venter kort på igangværende skrivninger

**Files:**
- Modify: `electron/store.cjs` (modul-niveau sporing af skrivninger fra `serializeWrite`; eksport)
- Modify: `electron/main.cjs` (`before-quit`, ca. linje 1545–1553)
- Test: `electron/store.test.cjs`

**Interfaces:**
- Produces (modul-eksport fra `store.cjs`): `whenWritesSettled(timeoutMs: number): Promise<boolean>` – `true` hvis alle igangværende async-skrivninger (på tværs af store-instanser) blev færdige inden for `timeoutMs`, ellers `false`.
- Consumes: `multiplayer.settled()` (findes, `electron/multiplayer.cjs:1323`).

- [ ] **Step 1: Skriv fejlende tests:**
  - `whenWritesSettled resolves true once pending writes finish` – start `setAsync` uden await, `await whenWritesSettled(5000)` → `true` og værdien findes på disk.
  - `whenWritesSettled resolves false when the timeout passes first` – hold nøglens lås-fil (anden ejer) så skrivningen venter; `whenWritesSettled(100)` → `false` inden for ~200 ms; ryd låsen bagefter.
- [ ] **Step 2:** `npm run test:store` → FAIL.
- [ ] **Step 3: Implementér** sporingen (Set af promises der tilføjes/fjernes i `serializeWrite`).
- [ ] **Step 4:** I `main.cjs`: tilføj én `before-quit`-handler (samme mønster som warehouse-handleren: `preventDefault` én gang, flag mod gentagelse) der venter på `Promise.race([Promise.all([whenWritesSettled(10000), multiplayer.settled?.()]), timeout 10000])` og derefter `app.quit()`. Den skal kunne sameksistere med warehouse-handlerens 4 s ventetid (begge må ikke kalde `app.quit()` i en løkke – brug ét fælles flag eller kør warehouse-lukning inde i samme handler).
- [ ] **Step 5:** `npm test` → PASS. Manuel: start et træk og luk appen straks → trækket findes hos modstanderen.
- [ ] **Step 6:** Commit: `fix(main): lukning venter op til 10 s paa igangvaerende gemninger`.

## Fase 4 – Verifikation

### Task 9: Mål effekten og verificér UI

**Files:**
- Modify: `plans/m-drev-performance.md` (afkryds faser, tilføj målinger efter)
- Modify: `src/lib/changelog.ts` (1.6.7-indslag, samme format som 1.6.6) og `plans/development-1.6.7.md` hvis den findes

- [ ] **Step 1:** `npm run lint`, `npm run build`, `npm test` → alle PASS.
- [ ] **Step 2:** Start 1.6.7 mod M: og kør I/O-målingen fra diagnosen (30 s, vindue synligt, Hub-forsiden åben). Forventet: SCH main-proces < 3.550 "other"-ops (< 10 % af 35.500).
- [ ] **Step 3:** Brug appen 15 min (login, Hub, skak-træk, logout). `main.log`: 0 × `MAIN BLOCKED`. Opstår der én, står handlingen nu i linjen (Task 1) → fix den samme vej som Task 5/6 før release.
- [ ] **Step 4:** To klienter (fx kollega-PC): en ændring på A vises på B inden for ~2 s; med B minimeret vises den straks ved gendannelse.
- [ ] **Step 5 (spec D):** Skak, backgammon og ordspil: trækket står straks, turen skifter, "Sender…" vises og forsvinder når gemt; afbrudt netværk → toast og spillet genindlæses.
- [ ] **Step 6:** Opdatér changelog + `plans/m-drev-performance.md`. Commit: `docs: maalinger og changelog for M:-performance`.
