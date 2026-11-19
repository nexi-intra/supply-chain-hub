# Hurtigere gemning på M: – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En gemning på M: opretter ingen nye filer mens der gemmes: den skriver i en forberedt tmp-fil og tager låsen som et hardlink til en forberedt ejer-fil (målt 10,5 s → 3,4 s), og appen laver færre faste baggrundsgemninger.

**Architecture:** Nyt modul `electron/preparedFiles.cjs` holder pr. mappe et lille lager af tomme tmp-filer og ejer-filer, oprettet i baggrunden. `fileLock.acquireFileLockAsync` tager låsen med `utimes`+`link` når en ejer-fil er klar, ellers som i dag. `store.writeTmpAsync` skriver i en forberedt tmp-fil (`r+`) når en er klar, ellers som i dag. Main kobler lageret på, rydder op ved lukning og fejer efterladte filer væk.

**Tech Stack:** Node.js (Electron 44 main), `fs.promises`, `node:test`; React/TS + vitest for renderer-delen.

**Spec:** [hurtigere-gemning-design.md](./hurtigere-gemning-design.md)

## Global Constraints

- Låsefilens navn er uændret: `<nøgle>.json.lock` (og `mutation.lock`, `backup-in-progress.lock`); datafiler uændret. 1.6.6 kører samtidig.
- Forberedte filer må ikke ende på `.json` eller `.json.lock` og må ikke matche dagens tmp-mønster `/\.json\.\d+\.(\d+)\.[0-9a-f]{8}\.tmp$/`.
- Navne: `~hub-prep-<pid>-<ms>-<hex8>.tmp` og `~hub-owner-<pid>-<ms>-<hex8>.lockowner`; fælles fejemønster `/^~hub-(prep|owner)-\d+-(\d+)-[0-9a-f]{8}\.(tmp|lockowner)$/`.
- Én ejer-fil = én lås ad gangen, hver med sit eget ejer-id (`<pid>:<uuid>`). Ejer-fil får kun nyt indhold når låsen bevisligt er slettet; ellers kasseres den.
- Ingen synkron fs i main-processen på disse veje. Ingen ventetid på forberedelse: tomt lager = dagens metode.
- Sync-låsen (`acquireFileLock`/`withFileLock`) og `withLockedKeys` ændres ikke.
- Lagerstørrelse pr. mappe: 2 som standard, hævet af `want(dir, n)` op til 12.
- Baggrundsgemninger: `client-versions` højst hver 6. t (ellers ved ny version/platform); husket login fornyes kun når `expiresAt - now < 335 døgn`; `digest-last-seen` gemmes kun når der blev vist noget, eller den gemte værdi er > 24 t gammel.

## Review Focus

- En Placeringer-transaktion med 9 låse i samme mappe, lager med 2 klar → 2 som link, 7 som i dag; ingen ventetid, ingen dobbelt brug af en ejer-fil.
- En klient går ned mens den holder en link-lås → låsen holder op med at få frisk mtime og tages som forladt efter `staleMs`, præcis som en `wx`-lås.
- Skrivning i en forberedt tmp-fil fejler halvvejs → datafilen er urørt, den forberedte fil slettes og genbruges aldrig.
- Forberedte filer i en datamappe → optræder aldrig som nøgle (`keysAsync`), i watcher-scanning eller i backup-dump.
- Drevet er væk under opfyldning → lageret er tomt, gemning går dagens vej (og offline-køen tager over som i dag); ingen uhåndterede afvisninger.

---

### Task 1: Lager af forberedte filer (`electron/preparedFiles.cjs`)

**Files:**
- Create: `electron/preparedFiles.cjs`
- Test: `electron/preparedFiles.test.cjs`

**Interfaces:**
- Produces: `createPreparedFiles({ fsp = fs.promises, pid = process.pid, now = Date.now, newOwnerId = () => `${pid}:${crypto.randomUUID()}`, poolSize = 2, maxPoolSize = 12 } = {})` →
  - `takeTmp(dir: string): string | null` – synkron: en klar, tom tmp-fil (fjernet fra lageret), ellers `null`; starter opfyldning af `dir`.
  - `takeOwner(dir: string): { file: string, owner: string } | null` – synkron, samme regel.
  - `releaseOwner(dir: string, entry, { reusable: boolean }): void` – reusable: skriv nyt `newOwnerId()` ind med `r+`+truncate i baggrunden og læg tilbage; ellers slet bedst muligt og glem.
  - `discardTmp(file: string): void` – slet bedst muligt.
  - `want(dir: string, count: number): void` – hæv mål for `dir` til `min(maxPoolSize, count)`.
  - `markLinkUnsupported(dir)` / `linkSupported(dir): boolean`.
  - `closeAll(): Promise<void>` – stop opfyldning, slet alle klar-filer i alle mapper.
  - `whenIdle(): Promise<void>` – (til tests) når al opfyldning er færdig.
- Konstant eksporteret: `PREPARED_FILE_PATTERN` (fejemønsteret ovenfor).

- [x] **Step 1: Write the failing tests** (rigtige filer i `os.tmpdir()`)
  - `takeTmp returns null on the first call, then a ready empty file after refill` – første kald `null`; efter `whenIdle()` giver `takeTmp` en sti der findes, størrelse 0, navn matcher `PREPARED_FILE_PATTERN` og ikke `.json`.
  - `takeOwner gives each lock its own owner id, written in the file` – to `takeOwner` → forskellige `owner`, og `readFile(file) === owner`.
  - `releaseOwner reusable writes a new id into the same file and returns it to the pool` – samme `file` kommer igen med nyt `owner` ≠ gammelt, filindhold = nyt.
  - `releaseOwner not reusable deletes the file and never hands it out again`.
  - `want raises the pool for a folder up to maxPoolSize` – `want(dir, 9)` → efter `whenIdle()` kan 9 `takeOwner` lykkes; `want(dir, 50)` → højst 12.
  - `a failing drive leaves the pool empty without unhandled rejections` – `fsp.open` der kaster `EIO` → `takeTmp` giver `null`, `whenIdle()` resolver, ingen `unhandledRejection`.
  - `closeAll removes every ready file` – mappen indeholder bagefter ingen filer der matcher mønstret.
- [x] **Step 2: Run** `node --test electron/preparedFiles.test.cjs` – Expected: FAIL (modul findes ikke).
- [x] **Step 3: Implement** `createPreparedFiles` som beskrevet. Opfyldning pr. mappe kører én ad gangen (single-flight) og opretter manglende filer parallelt med `open(file,'wx')` (+ skriv ejer-id for ejer-filer); en fejl stopper opfyldningen for den runde.
- [x] **Step 4: Run** `node --test electron/preparedFiles.test.cjs` – Expected: PASS.
- [x] **Step 5: Commit** `git add electron/preparedFiles.cjs electron/preparedFiles.test.cjs; git commit -m "Forberedte filer pr. mappe til hurtigere gemning paa M:"`

### Task 2: Lås som hardlink i `acquireFileLockAsync`

**Files:**
- Modify: `electron/fileLock.cjs` (`acquireFileLockAsync`, eksporter)
- Test: `electron/fileLock.test.cjs`

**Interfaces:**
- Consumes: Task 1 (`takeOwner`, `releaseOwner`, `want`, `linkSupported`, `markLinkUnsupported`).
- Produces: `setPreparedFiles(pool | null): void` eksporteret fra `fileLock.cjs`. `withFileLocksAsync` kalder `pool.want(dirname, antal mål i samme mappe)` før tilegnelse.

- [x] **Step 1: Write the failing tests** (`setPreparedFiles(createPreparedFiles())` i `t.before`, `setPreparedFiles(null)` i `t.after`)
  - `a link lock keeps a wx locker out and the other way round` – efter opfyldning: `withFileLockAsync(target, …)` holder låsen; inde i den kaster `withFileLock(target, …, { attempts: 1 })` `KV_LOCK_BUSY`; og omvendt: en `wx`-låst fil (`writeFileSync(target,'other')`) giver `KV_LOCK_BUSY` for `withFileLockAsync(..., { attempts: 2, delayMs: 1 })`.
  - `a link lock is the prepared owner file and is released by unlinking only the link` – inde i låsen er `readFileSync(target)` = ejer-id; efter frigivelse findes `target` ikke, og ejer-filen er tilbage i lageret med nyt id.
  - `release never removes a lock someone else has taken meanwhile` – inde i låsen: `unlinkSync(target); writeFileSync(target,'thief')`; efter frigivelse er `target` stadig `'thief'`, og ejer-filen er kasseret (ikke genbrugt).
  - `an abandoned link lock is reclaimed after staleMs like any lock` – lav en link-lås, sæt mtime 61 s tilbage, `withFileLock(target, () => 42, { attempts: 1, staleMs: 60000 })` → 42.
  - `nine locks in one folder with two prepared owners: two by link, the rest as today, none waits` – `withFileLocksAsync([9 mål], fn)` lykkes i ét forsøg; ingen ejer-fil udleveres to gange.
  - `when links are not supported the lock falls back and remembers it` – stub `fs.promises.link` til at kaste `ENOTSUP`: låsen lykkes via `wx`; `linkSupported(dir)` er `false`; næste lås kalder ikke `link`.
- [x] **Step 2: Run** `node --test electron/fileLock.test.cjs` – Expected: de nye FAIL.
- [x] **Step 3: Implement.** I hvert forsøg: hvis en pulje er sat, `linkSupported(dir)` og `takeOwner(dir)` giver en ejer-fil: `utimes(ejer-fil, now)` og `link(ejer-fil, target)`. EEXIST → samme vej som dagens EEXIST (forladt-tjek, jitter, nyt forsøg; ejer-filen beholdes til næste forsøg). Anden link-fejl → prøv dagens `open('wx')` i samme forsøg; lykkes den, `markLinkUnsupported(dir)` og `releaseOwner(…, { reusable: true })`. Uden ejer-fil → dagens metode uændret. Frigivelse: læs, slet hvis indhold = ejer-id; `releaseOwner(dir, entry, { reusable: sletningen lykkedes })`. Hjerteslag og max-tid uændret.
- [x] **Step 4: Run** `node --test electron/fileLock.test.cjs electron/store.test.cjs electron/registry.test.cjs` – Expected: PASS.
- [x] **Step 5: Commit** `git commit -m "Laas som hardlink til forberedt ejer-fil (1.6.6-kompatibel)"`

### Task 3: Forberedt tmp-fil i `store.writeTmpAsync`

**Files:**
- Modify: `electron/store.cjs` (`writeTmpAsync`; `createStore` option `preparedFiles`)
- Test: `electron/store.test.cjs`

**Interfaces:**
- Consumes: Task 1 (`takeTmp`, `discardTmp`).
- Produces: `createStore(dataDir, { externallyWatched, preparedFiles })` – `preparedFiles` valgfri; uden den opfører store sig som i dag. Gælder både `setUnlockedAsync` og `withLockedKeysAsync` (begge bruger `writeTmpAsync`).

- [x] **Step 1: Write the failing tests**
  - `a save with a prepared temp file creates no new file during the save` – efter opfyldning: spion på `fs.promises.open` registrerer flag; `setAsync('k', {a:1})` åbner tmp med `'r+'` og aldrig med `'w'`/`'wx'` for en `.tmp`; `getAsync('k',{skipCache:true})` = `{a:1}`.
  - `a failed write into a prepared file leaves the data file untouched and the file is not reused` – stub `handle.write` til at kaste én gang: `setAsync` afviser, gammel værdi består, den forberedte sti findes ikke længere og udleveres ikke igen.
  - `prepared files never show up as keys, in a scan or in a dump` – med klar-filer i mappen: `keysAsync()`, `scanDirectoryAsync(null).snapshot` og `dumpAllAsync()` indeholder dem ikke.
- [x] **Step 2: Run** `node --test electron/store.test.cjs` – Expected: de nye FAIL.
- [x] **Step 3: Implement** i `writeTmpAsync`: `const file = preparedFiles?.takeTmp(dataDir)`; findes den: åbn `'r+'`, skriv `encryptPayload(json)`, luk, returnér `file`; ved fejl `discardTmp(file)` og kast. Ellers dagens kode.
- [x] **Step 4: Run** `node --test electron/store.test.cjs electron/warehouse/locations/*.test.cjs` – Expected: PASS.
- [x] **Step 5: Commit** `git commit -m "Gemning skriver i forberedt tmp-fil i stedet for at oprette en ny"`

### Task 4: Kobling i main, oprydning ved lukning og fejning af efterladte filer

**Files:**
- Modify: `electron/main.cjs` (opret én pulje, `setPreparedFiles`, giv den til `createStore` i `storeFor`, aktive/delte stores og `electron/warehouse/register.cjs`' `openStore`; `closeAll()` i before-quit-flush; fejning ved opstart)
- Modify: `electron/store.cjs` (`sweepStaleTempFilesAsync` fjerner også `PREPARED_FILE_PATTERN` når navnets ms og mtime er > 24 t)
- Modify: `electron/warehouse/register.cjs` (`openStore` tager puljen)
- Test: `electron/store.test.cjs`

**Interfaces:**
- Consumes: Task 1–3.

- [x] **Step 1: Write the failing tests**
  - `sweep removes prepared files left behind for over 24 h, from any pid, and keeps recent ones` – en `~hub-prep-999-<gammel ms>-…tmp` og `~hub-owner-999-<gammel ms>-…lockowner` med gammel mtime fjernes; en med nyt navn eller ny mtime bliver.
- [x] **Step 2: Run** `node --test electron/store.test.cjs` – Expected: FAIL.
- [x] **Step 3: Implement** fejemønsteret; i main: én `createPreparedFiles()`; `setPreparedFiles(pool)` ved opstart; alle `createStore`-kald for datamapper på M: får `{ preparedFiles: pool }` (lokale spejl-/cache-stores ikke); fejning ved opstart (baggrund) for den aktive team-mappe, dens `placeringer`, `_registry`, `_shared`, `_shared\multiplayer`; `pool.closeAll()` med i lukke-flush (inden for den eksisterende tidsgrænse).
- [x] **Step 4: Run** `node --test electron/*.test.cjs electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs electron/warehouse/locations/*.test.cjs --test-concurrency=4` – Expected: alle PASS.
- [x] **Step 5: Commit** `git commit -m "Forberedte filer koblet paa alle delte mapper, ryddes op ved lukning"`

### Task 5: Færre faste baggrundsgemninger

**Files:**
- Modify: `src/App.tsx` (`WRITE_AFTER_MS` → `6 * 60 * 60 * 1000`)
- Modify: `electron/authService.cjs` (`renew`: skriv kun når `expiresAt - now() < 335 * DAY`)
- Modify: `src/components/LoginDigest.tsx` (gem kun når `result.length > 0` eller `now - lastSeen > 24 t`)
- Test: `electron/authService.test.cjs`, `src/components/LoginDigest.test.tsx` (ny, hvis ingen findes – ellers den eksisterende)

- [x] **Step 1: Write the failing tests**
  - `renew does not rewrite a session renewed less than 30 days ago` – session med `expiresAt = now + 360 døgn`: `renew` lykkes, `active-sessions` filens mtime uændret; med `now + 300 døgn` skrives `expiresAt = now + 365 døgn`.
  - `the digest does not save last seen when nothing was shown and it is less than a day old` – `kv.set` kaldes ikke; med vist indhold kaldes den én gang; med `lastSeen` 25 t gammel og intet vist kaldes den én gang.
- [x] **Step 2: Run** `node --test electron/authService.test.cjs; npx.cmd vitest run src/components/LoginDigest` – Expected: FAIL.
- [x] **Step 3: Implement** de tre ændringer.
- [x] **Step 4: Run** de samme kommandoer – Expected: PASS; `npx.cmd tsc --noEmit -p .` 0 fejl.
- [x] **Step 5: Commit** `git commit -m "Faerre faste baggrundsgemninger paa M:"`

### Task 6: Måling på M:, ændringslog, build

**Files:**
- Create: `c:/Users/jacso/.copilot/session-state/1e041704-ef01-47d5-90c3-88eae421ede5/files/measure-store-prepared.cjs` (måling, ikke i repo)
- Modify: `src/lib/changelog.ts` (1.6.7-linje), `plans/hurtigere-gemning-design.md` (resultat), denne plan (afkrydsning)

- [x] **Step 1:** Mål med appens rigtige `createStore` i en midlertidig mappe på M: (slettes bagefter), 5 runder skiftevis: `updateAsync` uden pulje vs. med varm pulje; samt `withLockedKeysAsync` med 6 nøgler. Expected: median med pulje tydeligt under uden (mål ~3× ved samme belastning). Notér tallene i designet.
- [x] **Step 2:** Ændringslog: "Gemning på det fælles drev er op til 3× hurtigere: appen gør filer klar i baggrunden, så der ikke oprettes nye filer, mens du gemmer" + "Appen gemmer færre ting af sig selv på drevet".
- [x] **Step 3:** Fuld verifikation: `npx.cmd tsc --noEmit -p .`, `npx.cmd vitest run`, node-suite med `--test-concurrency=4`. Expected: 0 fejl.
- [x] **Step 4:** Commit; nyt lokalt build i `release-local-2` (`npm.cmd run build` + `npx.cmd electron-builder --win zip "--config.directories.output=release-local-2"`), kontrollér at `electron/preparedFiles.cjs` er i asar.

## Faser

- **Fase 1 – Kernen (Task 1–3):** forberedte filer, link-lås, tmp-skrivning – alt bag en valgfri pulje, så intet ændrer sig før den kobles på.
- **Fase 2 – Kobling (Task 4):** puljen tændes i appen, oprydning og fejning.
- **Fase 3 – Baggrundsgemninger (Task 5).**
- **Fase 4 – Måling og levering (Task 6).**

Start med fase 1.
