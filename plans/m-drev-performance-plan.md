# M:-drev performance â€“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SCH 1.6.7 fryser aldrig pÃ¥ M:, belaster `\\VM-MSDK-2\org` langt mindre og viser kollegers Ã¦ndringer mindst lige sÃ¥ hurtigt som i dag.

**Architecture:** Watcheren i `electron/store.cjs` stat'er kun selve mappen hvert tick og laver fuld scan ved Ã¦ndret mappe-`mtime` eller sikkerheds-scan. Synkrone M:-kald pÃ¥ almindelige brugsstier (auth, registry-lÃ¦sning, `current()`, sygefravÃ¦r) flyttes til eksisterende async-varianter. UÃ¦ndrede vÃ¦rdier skrives ikke. Ved lukning ventes kort pÃ¥ igangvÃ¦rende skrivninger.

**Tech Stack:** Electron (main: CommonJS `.cjs`, `node:test`), React/TypeScript (renderer, vitest).

**Spec:** [m-drev-performance-design.md](./m-drev-performance-design.md) Â· diagnose: [m-drev-performance.md](./m-drev-performance.md)

Alle stier herunder er relative til `Supply-Chain-Hub 1.6.7/`. Kommandoer kÃ¸res i den mappe.

## Global Constraints

- Intet nyt dataformat pÃ¥ M: â€“ 1.6.6 og 1.6.7 skal kunne kÃ¸re samtidig pÃ¥ samme filer.
- LÃ¥semodellen (lÃ¥s-fil pr. nÃ¸gle, global `account-operation.lock`), kryptering og backup-politik Ã¦ndres ikke.
- Watcher-vÃ¦rdier: tick 1 s synlig / 10 s skjult; sikkerheds-scan 30 s synlig / 120 s skjult; Ã¦ndrings-udlÃ¸ste fulde scans hÃ¸jst hver 2 s.
- Lukning venter hÃ¸jst 10 s pÃ¥ igangvÃ¦rende skrivninger.
- Opstart fÃ¸r vinduet vises mÃ¥ ikke blive langsommere.
- Kommentarer pÃ¥ dansk som resten af `electron/` (ASCII-stil `oe/aa/ae` er OK, som eksisterende kode).

## Review Focus

1. **NetvÃ¦rksdrev forsvinder midt i et tick** (mappe-`stat` fejler) â†’ `onConnectionChange(false)` prÃ¦cis som i dag, og reconnect giver fuld scan. *Test i Task 2.*
2. **Ã†ndring der ikke flytter mappe-`mtime`** (in-place overskrivning, 1.6.6-sÃ¦rtilfÃ¦lde, SMB-cache) â†’ fanges senest af sikkerheds-scan. *Test i Task 2.*
3. **UdlÃ¸bet registry-cache mens en kollega lige har Ã¦ndret teams/manager-adgang** â†’ gammel vÃ¦rdi serveres hÃ¸jst Ã©n baggrunds-rundtur lÃ¦ngere end i dag; mutationer lÃ¦ser stadig frisk. *Test i Task 4.*
4. **Login mens en anden klient holder kontolÃ¥sen** â†’ venter uden at fryse vinduet og ender med samme fejlkode `KV_LOCK_BUSY` efter 40 forsÃ¸g som i dag. *Test i Task 5.*
5. **Skrivning med uÃ¦ndret vÃ¦rdi** fra flere klienter (`setField` med samme vÃ¦rdi) â†’ ingen fil-skrivning, ingen Ã¦ndrings-broadcast, men kalderen fÃ¥r samme returvÃ¦rdi som fÃ¸r. *Test i Task 7.*

---

## Fase 1 â€“ MÃ¥ling og billig watcher

### Task 1: Frys-diagnostik viser hvad main lavede

**Files:**
- Create: `electron/mainActivity.cjs`
- Create: `electron/mainActivity.test.cjs`
- Modify: `electron/main.cjs` (watchdog ved `MAIN BLOCKED`, ca. linje 760â€“770; wrap af `ipcMain.handle` fÃ¸r fÃ¸rste handler registreres)

**Interfaces:**
- Produces: `createActivityTracker({ now = Date.now } = {}) â†’ { begin(label: string): () => void, describe(): string }`. `describe()` returnerer fx `"i gang: ipc:auth:login (8120 ms) Â· sidst startet: ipc:auth:login"`; tom tracker â†’ `"i gang: â€“ Â· sidst startet: â€“"`.

- [x] **Step 1: Skriv fejlende tests** i `electron/mainActivity.test.cjs`:
  - `describe lists in-flight labels with their age and the last started label` â€“ `now` styres manuelt: `begin('ipc:a')` ved t=0, `begin('ipc:b')` ved t=100, `end` af b, `now=500` â†’ `describe()` indeholder `ipc:a (500 ms)` og `sidst startet: ipc:b`, ikke `ipc:b (`.
  - `an ended label is not reported twice and end is idempotent` â€“ kald `end()` to gange; `describe()` indeholder `i gang: â€“`.
- [x] **Step 2:** `node --test electron/mainActivity.test.cjs` â†’ FAIL (modul findes ikke).
- [x] **Step 3: ImplementÃ©r** `createActivityTracker` (Map af id â†’ {label, startedAt}; `lastStarted` gemmes i `begin`).
- [x] **Step 4:** `node --test electron/mainActivity.test.cjs` â†’ PASS.
- [x] **Step 5: Wire i `main.cjs`:** opret Ã©n tracker ved modul-load; erstat `ipcMain.handle` med en wrapper der kalder `tracker.begin('ipc:' + channel)` og afslutter i `finally` (ogsÃ¥ for handlere der kaster synkront). Wrapperen skal installeres fÃ¸r `securedIpc`/andre handlere registreres. Watchdog-linjen bliver: ``diagnostics.write('warn', `MAIN BLOCKED ${ms} ms â€“ ${tracker.describe()}`)``. Brug ogsÃ¥ `tracker.begin('timer:sick-purge')` / `'timer:auto-backup'` / `'watcher:team'` / `'watcher:shared'` omkring de tilsvarende callbacks.
- [x] **Step 6:** `npm test` â†’ PASS. Commit: `perf(diagnostics): MAIN BLOCKED viser hvilken handling der frÃ¸s main`.

### Task 2: Watcher med mappe-`mtime`, sikkerheds-scan, loft og synlighed

**Files:**
- Modify: `electron/store.cjs` (konstanter ca. linje 60â€“66, `watch()` ca. linje 699â€“733, eksport-objektet)
- Modify: `electron/offlineSync.cjs` (`watch()` ca. linje 423, eksport-objektet)
- Test: `electron/store.test.cjs`, `electron/offlineSync.test.cjs`

**Interfaces:**
- Produces (eksporteret fra `store.cjs` modul): `decideWatchTick(state, config) â†’ 'full' | 'skip' | 'defer'` hvor `state = { visible: boolean, dirMtimeMs: number, lastDirMtimeMs: number | null, nowMs: number, lastFullScanAtMs: number, lastChangeScanAtMs: number | null, forceFull: boolean }` og `config = { safetyScanMs, hiddenSafetyScanMs, minScanGapMs }`.
- Produces (store-instans): `watch(onChange, onConnectionChange, options?)` hvor `options` er enten et tal (legacy = synligt tick, clampes til `MIN_WATCH_INTERVAL_MS` som i dag) eller `{ intervalMs = 1000, hiddenIntervalMs = 10000, safetyScanMs = 30000, hiddenSafetyScanMs = 120000, minScanGapMs = 2000 }` (objekt-vÃ¦rdier clampes **ikke**, sÃ¥ tests kan bruge smÃ¥ tal). Returnerer fortsat en stop-funktion.
- Produces (store-instans og resilient store): `setWatchVisibility(visible: boolean): void`. Skift til `true` sÃ¦tter `forceFull` og kÃ¸rer et tick med det samme.

Regler for `decideWatchTick` (algoritmen er ikke givet af signaturen):

```text
safetyDue = nowMs - lastFullScanAtMs >= (visible ? safetyScanMs : hiddenSafetyScanMs)
changed   = forceFull || dirMtimeMs !== lastDirMtimeMs
if (!changed && !safetyDue) return 'skip'
if (changed && !safetyDue && !forceFull && lastChangeScanAtMs !== null && nowMs - lastChangeScanAtMs < minScanGapMs) return 'defer'
return 'full'
```

Tick-forlÃ¸b: `fs.promises.stat(dataDir)` â†’ fejl = uopnÃ¥elig (samme forbindelses-logik som i dag). Ved `'full'`: kÃ¸r eksisterende `scanDirectoryAsync(snapshot)`, sÃ¦t `lastDirMtimeMs` til den mtime der blev mÃ¥lt **fÃ¸r** scannen, `lastFullScanAtMs = now`, og `lastChangeScanAtMs = now` hvis scannen var Ã¦ndrings-udlÃ¸st. Den indledende synkrone scan i `watch()` sÃ¦tter `lastFullScanAtMs` og `lastDirMtimeMs`, men **ikke** `lastChangeScanAtMs`. Brug `setTimeout`-kÃ¦de (`unref`) i stedet for `setInterval`, sÃ¥ intervallet kan skifte med synlighed; behold `scanning`-vagten.

- [x] **Step 1: Skriv fejlende tests** i `electron/store.test.cjs`:
  - `decideWatchTick skips an unchanged directory, scans on change, defers within the gap and runs the safety scan` â€“ tabeltest: uÃ¦ndret og ikke forfalden â†’ `'skip'`; Ã¦ndret mtime, `lastChangeScanAtMs` 500 ms siden, gap 2000 â†’ `'defer'`; samme men 2500 ms siden â†’ `'full'`; uÃ¦ndret men `nowMs - lastFullScanAtMs = 30000` synlig â†’ `'full'`; samme 30000 men `visible:false` â†’ `'skip'`; `forceFull:true` inden for gap â†’ `'full'`.
  - `an unchanged directory is not rescanned file by file` â€“ 20 nÃ¸gler skrevet; `watch(..., { intervalMs: 30, safetyScanMs: 60000 })`; tÃ¦l kald til `fs.promises.stat` hvis sti â‰  `directory` over 200 ms â†’ `0`.
  - `a write from another store instance is reported on the next tick` â€“ `watch(..., { intervalMs: 30, minScanGapMs: 0 })`, `other.set('k', 1)`, vent â‰¤ 500 ms â†’ `changed` indeholder `'k'`.
  - `the safety scan finds a change that left the directory mtime untouched` â€“ gem mappens mtime, `other.set('k', 2)`, `fs.utimesSync(directory, atime, previousMtime)`; `watch(..., { intervalMs: 20, safetyScanMs: 150, minScanGapMs: 0 })`; efter 80 ms ikke rapporteret, efter 400 ms rapporteret.
  - `a hidden watcher slows down and becoming visible scans at once` â€“ `{ intervalMs: 20, hiddenIntervalMs: 5000, hiddenSafetyScanMs: 60000 }`, `setWatchVisibility(false)`, `other.set('k', 3)`, vent 150 ms â†’ ikke rapporteret; `setWatchVisibility(true)` â†’ rapporteret inden for 100 ms.
  - Eksisterende tests (`a watched store serves cached readsâ€¦` med legacy `1000`, disconnect/reconnect-testen med `5000`) skal fortsat bestÃ¥ uÃ¦ndret.
- [x] **Step 2:** `npm run test:store` â†’ de nye tests FAIL.
- [x] **Step 3: ImplementÃ©r** `decideWatchTick`, den nye `watch()` og `setWatchVisibility` i `store.cjs`.
- [x] **Step 4:** `npm run test:store` â†’ PASS.
- [x] **Step 5:** I `offlineSync.cjs`: send `options` uÃ¦ndret videre i `watch()` og tilfÃ¸j `setWatchVisibility: visible => networkStore.setWatchVisibility?.(visible)` til det returnerede objekt. TilfÃ¸j test i `offlineSync.test.cjs`: `the resilient store forwards watch visibility to the network store` (fake networkStore registrerer kaldet).
- [x] **Step 6:** `npm test` â†’ PASS. Commit: `perf(store): watcher stat'er kun mappen og scanner ved aendring`.

### Task 3: Vinduets synlighed styrer watcherne

**Files:**
- Modify: `electron/main.cjs` (`createWindow()` ca. linje 660; `startWatcher()`/`startSharedWatcher()` ca. linje 293â€“335)

**Interfaces:**
- Consumes: `store.setWatchVisibility(visible)` og `sharedStore.setWatchVisibility(visible)` fra Task 2.

- [x] **Step 1:** TilfÃ¸j modul-variabel `let windowVisible = true` og funktion `applyWatchVisibility()` der kalder `setWatchVisibility(windowVisible)` pÃ¥ `store` og `sharedStore` (hvis de findes). Kald den i slutningen af `startWatcher()` og `startSharedWatcher()`, sÃ¥ et team-skift arver tilstanden.
- [x] **Step 2:** I `createWindow()`: `win.on('minimize')` og `win.on('hide')` â†’ `windowVisible = false; applyWatchVisibility()`; `win.on('restore')` og `win.on('show')` â†’ `windowVisible = true; applyWatchVisibility()`. (Et vindue der blot mister fokus forbliver "synligt".)
- [ ] **Step 3: Manuel verifikation:** `$env:TCD_HUB_DEBUG='1'; npm run electron:dev`; minimÃ©r vinduet 30 s og gendan; en Ã¦ndring lavet fra en anden klient mens vinduet var minimeret vises straks ved gendannelse.
- [x] **Step 4:** `npm test` â†’ PASS. Commit: `perf(main): watcher tikker langsomt naar vinduet er skjult`.

## Fase 2 â€“ Ingen frys

### Task 4: Registry-lÃ¦sning uden synkron SMB efter fÃ¸rste lÃ¦sning

**Files:**
- Modify: `electron/registry.cjs` (`readJsonSafe` ca. linje 41â€“58, nyt modul-niveau single-flight, eksport)
- Test: `electron/registry.test.cjs`

**Interfaces:**
- Produces: `registry.whenRefreshed(): Promise<void>` â€“ afventer alle igangvÃ¦rende baggrunds-opfriskninger (til tests og til `prefetchAsync`).
- UÃ¦ndret: alle eksisterende `read*`/`list*`/`lookup*`-signaturer forbliver synkrone.

AdfÃ¦rd: nÃ¥r `freshDepth === 0` og der findes en cache-post (ogsÃ¥ `value: undefined` for ENOENT): returnÃ©r altid kopien med det samme; er den Ã¦ldre end `CACHE_TTL_MS`, start (single-flight pr. fil) en `fs.promises.readFile`-opfriskning der opdaterer cachen. Fejl i opfriskningen bevarer cachen. Uden cache-post: synkron lÃ¦sning som i dag. `withFreshReads` er uÃ¦ndret (mutationer lÃ¦ser stadig frisk og synkront).

- [ ] **Step 1: Skriv fejlende tests** i `electron/registry.test.cjs`:
  - `an expired registry cache is served without a synchronous read and refreshed in the background` â€“ skriv `teams.json` med team A, `readTeams` (varmer cache), skriv team B direkte til filen, skru `Date.now` 31 s frem, erstat `fs.readFileSync` med en der kaster â†’ `readTeams` returnerer kun A; `await registry.whenRefreshed()` â†’ `readTeams` indeholder B.
  - `a failed background refresh keeps serving the cached registry` â€“ som ovenfor men slet filens mappe fÃ¸r opfriskning â†’ efter `whenRefreshed()` returneres stadig A, intet kast.
  - `mutations still read the registry fresh` â€“ efter ekstern Ã¦ndring (inden for TTL) skal f.eks. `assignUserToTeam` bygge pÃ¥ den friske fil (eksisterende adfÃ¦rd; testen skal blive grÃ¸n bÃ¥de fÃ¸r og efter).
- [ ] **Step 2:** `node --test electron/registry.test.cjs` â†’ de to fÃ¸rste FAIL.
- [ ] **Step 3: ImplementÃ©r** i `readJsonSafe` + `whenRefreshed`. Lad `prefetchAsync` genbruge samme single-flight.
- [ ] **Step 4:** `node --test electron/registry.test.cjs` â†’ PASS. Eksisterende tests der forventer frisk vÃ¦rdi efter TTL rettes til at `await registry.whenRefreshed()` fÃ¸rst.
- [ ] **Step 5:** `npm test` â†’ PASS. Commit: `perf(registry): udloebet cache serveres straks og opfriskes async`.

### Task 5: Login, resume, renew og logout uden synkron lÃ¥s og I/O

**Files:**
- Modify: `electron/accountService.cjs` (efter `runAuthentication`, ca. linje 126; eksport-objektet)
- Modify: `electron/authService.cjs` (`createAuthService`-parametre, `login`, `resume`, `renew`, `logout`)
- Modify: `electron/main.cjs` (ca. linje 787â€“795: wire nye parametre)
- Test: `electron/accountService.test.cjs`, `electron/authService.test.cjs`

**Interfaces:**
- Produces (`accountService`): `runAuthenticationAsync(email: string, callback: ({ recovering: boolean }) => T | Promise<T>): Promise<T>` â€“ `withFileLockAsync(globalLock(), â€¦, { attempts: 40, delayMs: 200, staleMs: ACCOUNT_LOCK_STALE_MS })`, `recovering = !terminal(await readControlAsync())`, samme creator-regel som `runAuthentication`.
- Produces (`createAuthService` options): `runWriteAsync = async callback => callback()` og `runAuthenticationAsync = async (_email, callback) => callback({ recovering: false })`.
- Ã†ndret: `renew(sender)` og `logout(sender)` bliver `async` (IPC-handlerne awaiter allerede). `login`/`resume` beholder signaturer.

Konkrete udskiftninger i `authService.cjs` (kun i `login`, `resume`, `renew`, `logout`):
- `account(email)` â†’ `await accountAsync(email)`; `current(sender)` â†’ `await currentAsync(sender)`.
- Brugernavns-opslaget i `login`: `openTeam(team).get('users', â€¦)` â†’ `await openTeam(team).getAsync('users', â€¦)`.
- `runAuthentication(â€¦)` â†’ `await runAuthenticationAsync(â€¦)`; inde i callbacken: `.mutate(` â†’ `await â€¦.mutateAsync(`.
- `logout`: `await runWriteAsync(() => openSessions().updateAsync('active-sessions', { op: 'deleteField', field: sessionKey(bound.token) }))`. Epoch/binding-oprydning sker stadig **fÃ¸r** fÃ¸rste `await`.
- `registry.*`-kald forbliver synkrone (cachet, se Task 4); kald `await registry.prefetchAsync?.(getRoot())` fÃ¸rst i `login` og `resume`.
- `signup` og `profile` rÃ¸res ikke (afgrÃ¦nset i spec).

- [ ] **Step 1: Skriv fejlende tests:**
  - `accountService.test.cjs`: `runAuthenticationAsync waits for a held account lock without blocking the event loop` â€“ opret `_registry/account-operation.lock` med anden ejer; start `runAuthenticationAsync('a@x', () => 'ok')`; en `setImmediate`-callback skal kÃ¸re fÃ¸r lÃ¥sen frigives; slet lÃ¥sfilen efter 300 ms â†’ resolver `'ok'`.
  - `accountService.test.cjs`: `runAuthenticationAsync gives up with KV_LOCK_BUSY after its attempt budget` â€“ lÃ¥s holdes hele tiden, `delayMs` gjort lille via test-hook eller ventetid accepteret (â‰¤ ~12 s) â†’ rejecter med `code === 'KV_LOCK_BUSY'`.
  - `authService.test.cjs`: `login, resume, renew and logout never call synchronous store methods` â€“ fixture-stores hvor `get`, `mutate`, `update`, `set` kaster `'SYNC_CALLED'`; et fuldt login â†’ resume â†’ renew â†’ logout-forlÃ¸b lykkes og `active-sessions` ender uden sessionen.
- [ ] **Step 2:** `node --test electron/accountService.test.cjs electron/authService.test.cjs` â†’ nye tests FAIL.
- [ ] **Step 3: ImplementÃ©r** `runAuthenticationAsync` og de fire auth-flows; wire `runWriteAsync: accountService.runWriteAsync, runAuthenticationAsync: accountService.runAuthenticationAsync` i `main.cjs`.
- [ ] **Step 4:** Samme kommando â†’ PASS; derefter `npm test` â†’ PASS.
- [ ] **Step 5:** `npm run test:electron-auth` â†’ PASS (auth-smoke i rigtig Electron).
- [ ] **Step 6:** Commit: `perf(auth): login/resume/renew/logout venter async paa kontolaasen`.

### Task 6: Handlere og sygefravÃ¦r-timer uden synkron M:

**Files:**
- Modify: `electron/main.cjs` â€“ alle `authService.current(` i IPC-handlere (ca. linje 896, 914, 922, 923, 926, 949, 960, 996, 1096, 1283, 1288, 1289, 1303, 1307, 1440) og `purgeFinishedSickLeave` (ca. linje 542â€“561)
- Modify: `electron/warehouse/register.cjs:189` (`currentActor(event)` â†’ `await currentActor(event)`; gÃ¸r omsluttende funktion `async` hvis nÃ¸dvendig)
- Modify: `electron/sickLeaveRetention.cjs` (ny async-tvilling)
- Test: `electron/sickLeaveRetention.test.cjs` (findes), `electron/warehouse/*.test.cjs`

**Interfaces:**
- Produces: `purgeStoreAsync(store, today: string): Promise<number>` â€“ samme regler som `purgeStore`, men `getAsync`/`mutateAsync`.
- Ã†ndret: `currentActor` i warehouse-wiring returnerer `Promise<actor>` (`event => authService.currentAsync(event.sender.id)`).

- [ ] **Step 1: Skriv fejlende test** `purgeStoreAsync removes finished sick leave and notices without synchronous store calls` â€“ store-fake hvor `get`/`mutate` kaster; `getAsync`/`mutateAsync` virker; forventet antal fjernet = samme som `purgeStore` pÃ¥ samme data (genbrug eksisterende testdata hvis de findes).
- [ ] **Step 2:** KÃ¸r testen â†’ FAIL.
- [ ] **Step 3: ImplementÃ©r** `purgeStoreAsync`; gÃ¸r `purgeFinishedSickLeave` `async`, brug `storeFor(...)` i stedet for `createStore(...)` (undgÃ¥r synkron `mkdirSync`) og `purgeStoreAsync`. `setTimeout`/`setInterval` kalder den med `.catch(() => {})`.
- [ ] **Step 4:** Udskift alle `authService.current(event.sender.id)` / `authService.current(_event.sender.id)` i handlere med `await authService.currentAsync(â€¦)` og gÃ¸r handlerne `async`. OpdatÃ©r warehouse `currentActor` og `register.cjs:189`.
- [ ] **Step 5:** `grep -n "authService.current(" electron/main.cjs` â†’ ingen trÃ¦f. `npm test` og `npm run test:warehouse` â†’ PASS.
- [ ] **Step 6:** Commit: `perf(main): handlere og sygefravaer-oprydning bruger async auth og store`.

### Task 6b: Async lås venter uden synkron læsning af låsens ejer

*(Tilføjet under udførelse 06.11 – fundet i Task 5: `acquireFileLockAsync` kalder `readOwner` = `fs.readFileSync` ved hver optaget-lås-ventetid når `staleMs > 0`, dvs. én synkron SMB-læsning pr. forsøg på main.)*

**Files:**
- Modify: `electron/fileLock.cjs` (`readOwner`, `acquireFileLockAsync`)
- Test: `electron/fileLock.test.cjs` (opret hvis den ikke findes; ellers udvid)

**Interfaces:**
- Produces: intern `readOwnerAsync(target): Promise<string | null>` (samme semantik som `readOwner`: fejl → `null`). `acquireFileLockAsync` bruger den; sync `acquireFileLock` bruger fortsat `readOwner`. Ingen ændring af eksporterede signaturer, lås-format, `staleMs`-regler eller `isAbandonedLock`.

- [ ] **Step 1: Skriv fejlende test** `acquireFileLockAsync never reads the lock owner synchronously while waiting` – opret lås-fil med anden ejer, erstat `fs.readFileSync` med en der kaster for stier der ender på `.lock`, kald `withFileLockAsync(target, fn, { attempts: 3, delayMs: 10, staleMs: 60000 })` → rejecter med `code === 'KV_LOCK_BUSY'` (ikke med den kastede fejl); gendan `fs.readFileSync`.
- [ ] **Step 2:** `node --test electron/fileLock.test.cjs` → FAIL.
- [ ] **Step 3: Implementér** `readOwnerAsync` og brug den i `acquireFileLockAsync`. Release-funktionen er allerede async.
- [ ] **Step 4:** `node --test electron/fileLock.test.cjs` → PASS; `npm test` → PASS.
- [ ] **Step 5:** Commit: `perf(lock): async laas laeser ejer async mens den venter`.

## Fase 3 â€“ FÃ¦rre skrivninger og sikker lukning

### Task 7: UÃ¦ndrede vÃ¦rdier skrives ikke

**Files:**
- Modify: `electron/store.cjs` (`updateDetailed`, `updateDetailedAsync`, `mutate`, `mutateAsync`)
- Test: `electron/store.test.cjs`

**Interfaces:**
- UÃ¦ndrede signaturer og returvÃ¦rdier. Ny regel: hvis `JSON.stringify(next) === JSON.stringify(current)` (current = vÃ¦rdien lÃ¦st under lÃ¥sen), springes `setUnlocked`/`setUnlockedAsync` over. `compareAndSet`-grenen er allerede sÃ¥dan.

- [ ] **Step 1: Skriv fejlende tests:**
  - `updateAsync with an unchanged field value does not rewrite the file` â€“ `setAsync('client-versions', { a: { v: 1 } })`, notÃ©r filens `mtimeMs`, vent 20 ms, `updateAsync('client-versions', { op: 'setField', field: 'a', value: { v: 1 } })` â†’ returnerer `{ a: { v: 1 } }`, `mtimeMs` uÃ¦ndret, ingen `*.tmp` i mappen.
  - `mutateAsync returning an equal value does not rewrite the file` â€“ callback returnerer `structuredClone(current)` â†’ `mtimeMs` uÃ¦ndret, returvÃ¦rdi = vÃ¦rdien.
  - `upsert of an identical item does not rewrite the file` â€“ samme for `{ op: 'upsert', items: [sameItem] }`.
  - `a real change is still written` â€“ `setField` med ny vÃ¦rdi â†’ `mtimeMs` Ã¦ndret og `getAsync(..., { skipCache: true })` giver ny vÃ¦rdi.
- [ ] **Step 2:** `npm run test:store` â†’ de tre fÃ¸rste FAIL.
- [ ] **Step 3: ImplementÃ©r** sammenligningen i de fire funktioner (sync-tvillingerne ogsÃ¥, for ens adfÃ¦rd).
- [ ] **Step 4:** `npm test` â†’ PASS. Commit: `perf(store): spring skrivning over naar vaerdien er uaendret`.

### Task 8: Lukning venter kort pÃ¥ igangvÃ¦rende skrivninger

**Files:**
- Modify: `electron/store.cjs` (modul-niveau sporing af skrivninger fra `serializeWrite`; eksport)
- Modify: `electron/main.cjs` (`before-quit`, ca. linje 1545â€“1553)
- Test: `electron/store.test.cjs`

**Interfaces:**
- Produces (modul-eksport fra `store.cjs`): `whenWritesSettled(timeoutMs: number): Promise<boolean>` â€“ `true` hvis alle igangvÃ¦rende async-skrivninger (pÃ¥ tvÃ¦rs af store-instanser) blev fÃ¦rdige inden for `timeoutMs`, ellers `false`.
- Consumes: `multiplayer.settled()` (findes, `electron/multiplayer.cjs:1323`).

- [ ] **Step 1: Skriv fejlende tests:**
  - `whenWritesSettled resolves true once pending writes finish` â€“ start `setAsync` uden await, `await whenWritesSettled(5000)` â†’ `true` og vÃ¦rdien findes pÃ¥ disk.
  - `whenWritesSettled resolves false when the timeout passes first` â€“ hold nÃ¸glens lÃ¥s-fil (anden ejer) sÃ¥ skrivningen venter; `whenWritesSettled(100)` â†’ `false` inden for ~200 ms; ryd lÃ¥sen bagefter.
- [ ] **Step 2:** `npm run test:store` â†’ FAIL.
- [ ] **Step 3: ImplementÃ©r** sporingen (Set af promises der tilfÃ¸jes/fjernes i `serializeWrite`).
- [ ] **Step 4:** I `main.cjs`: tilfÃ¸j Ã©n `before-quit`-handler (samme mÃ¸nster som warehouse-handleren: `preventDefault` Ã©n gang, flag mod gentagelse) der venter pÃ¥ `Promise.race([Promise.all([whenWritesSettled(10000), multiplayer.settled?.()]), timeout 10000])` og derefter `app.quit()`. Den skal kunne sameksistere med warehouse-handlerens 4 s ventetid (begge mÃ¥ ikke kalde `app.quit()` i en lÃ¸kke â€“ brug Ã©t fÃ¦lles flag eller kÃ¸r warehouse-lukning inde i samme handler).
- [ ] **Step 5:** `npm test` â†’ PASS. Manuel: start et trÃ¦k og luk appen straks â†’ trÃ¦kket findes hos modstanderen.
- [ ] **Step 6:** Commit: `fix(main): lukning venter op til 10 s paa igangvaerende gemninger`.

## Fase 4 â€“ Verifikation

### Task 9: MÃ¥l effekten og verificÃ©r UI

**Files:**
- Modify: `plans/m-drev-performance.md` (afkryds faser, tilfÃ¸j mÃ¥linger efter)
- Modify: `src/lib/changelog.ts` (1.6.7-indslag, samme format som 1.6.6) og `plans/development-1.6.7.md` hvis den findes

- [ ] **Step 1:** `npm run lint`, `npm run build`, `npm test` â†’ alle PASS.
- [ ] **Step 2:** Start 1.6.7 mod M: og kÃ¸r I/O-mÃ¥lingen fra diagnosen (30 s, vindue synligt, Hub-forsiden Ã¥ben). Forventet: SCH main-proces < 3.550 "other"-ops (< 10 % af 35.500).
- [ ] **Step 3:** Brug appen 15 min (login, Hub, skak-trÃ¦k, logout). `main.log`: 0 Ã— `MAIN BLOCKED`. OpstÃ¥r der Ã©n, stÃ¥r handlingen nu i linjen (Task 1) â†’ fix den samme vej som Task 5/6 fÃ¸r release.
- [ ] **Step 4:** To klienter (fx kollega-PC): en Ã¦ndring pÃ¥ A vises pÃ¥ B inden for ~2 s; med B minimeret vises den straks ved gendannelse.
- [ ] **Step 5 (spec D):** Skak, backgammon og ordspil: trÃ¦kket stÃ¥r straks, turen skifter, "Senderâ€¦" vises og forsvinder nÃ¥r gemt; afbrudt netvÃ¦rk â†’ toast og spillet genindlÃ¦ses.
- [ ] **Step 6:** OpdatÃ©r changelog + `plans/m-drev-performance.md`. Commit: `docs: maalinger og changelog for M:-performance`.
