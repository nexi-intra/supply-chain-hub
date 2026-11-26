# Finlandsforsendelser og værktøjer pr. team: implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Arbejdsværktøjer åbnes for alle teams med adgang pr. værktøj, får et manager-område, og den selvstændige app Finland T&T bygges ind som værktøjet Finlandsforsendelser for BPO og TCD med fælles data.

**Architecture:** En fælles værktøjsliste (backend `electron/warehouse/tools.cjs`, vindue `src/lib/warehouseTools.ts`) styrer, hvem der ser og kan kalde hvad. Nuværende kanaler beholder deres TCD/TRR-tjek uændret; nye kanaler registreres med `handleTool`. Finlandsforsendelser ligger i `electron/warehouse/finland/` (kerne, fælles data i `_lagerstyring\finlandsforsendelser`, Excel via PowerShell, SAP via `sapBridge`) og `src/views/warehouse/finland/`.

**Tech Stack:** Electron 44 (CommonJS i `electron/`), React + TypeScript + Tailwind/shadcn (Vite), `node --test` for backend, Vitest for `src/`, PowerShell 5.1 + Excel COM, SAP GUI scripting (VBS via 32-bit cscript).

**Spec:** `plans/finlandsforsendelser-design.md`. Facit for Finland-logikken: `C:\Supply Chain Tools\Finland TT` (kode, 131 tests, `README.md`).

## Global Constraints

- Arket er et arbejdsredskab for andre. Afprøvning mod Excel sker kun på en lokal kopi (`SaveCopyAs`). Det rigtige ark røres ikke uden Jacobs udtrykkelige ja.
- SAP afprøves kun med læsning (ZMS_CONS_INFO, F300, to måneder bagud).
- De fire nuværende værktøjer (Stempelkort, Placeringer, Optælling, Softwareload) og alle deres kanaler skal stadig afvise alt andet end TCD og TRR med `WAREHOUSE_TEAM_NOT_ALLOWED`.
- Finlandsforsendelser: teams `BPO` og `TCD`. Andre teams får `WAREHOUSE_TOOL_NOT_ALLOWED`.
- Kode i `electron/` er CommonJS (`.cjs`), uden semikolon, 2 mellemrum, kommentarer på engelsk, fejl som `codeError('KODE')` eller `KODE: dansk detalje`.
- Tekster i vinduet: `t(dansk, engelsk)` fra `src/lib/warehouse/text.ts`. Dansk tekst skrives som almindelige sætninger uden tankestreger som bindeled.
- Fælles data: `<platformRoot>\_lagerstyring\finlandsforsendelser\` med nøglerne `ikke-sendt`, `skrivelaas`, `dagslog`, `indstillinger` og `kladder-<16 hex af sha1(email)>`. Alle ændringer med `mutateAsync`.
- Testarkets adresse (standard indtil en manager sætter et andet): `https://christianiabpos.sharepoint.com/sites/NordicSupplyChain/Shared Documents/General/Testark - Ordre sendt til Finland fra Danmark.xlsx`, fane `Sheet1`, tabel `Table2`.
- Sporingsadresser: Postnord `https://www.postnord.dk/varktojer/track-trace?shipmentId={id}`, DHL `https://www.dhl.com/dk-en/home/tracking.html?tracking-id={id}&submit=1`, DSV `https://mydsv.dsv.com/app/tracking-public/` (uden `{id}`: T&T kopieres).
- Intet hentes af sig selv. SAP og arket læses kun, når brugeren trykker.
- Kør tests med `npm.cmd` på Windows.

## Review Focus

- M: forsvinder midt i arbejdet: intet må skrives i arket, og fejlen skal sige, at de fælles data ikke kan læses. Test i Task 9 (`no sheet write when the shared not-sent list cannot be read`).
- Hubben lukker eller går ned, mens den holder skrivelåsen: låsen skal udløbe af sig selv. Test i Task 7 (`an expired lock can be taken by someone else`).
- En person skifter hub fra TCD til TRR med værktøjet åbent: næste kald skal afvises med `WAREHOUSE_TOOL_NOT_ALLOWED`, ikke bruge gammel adgang. Test i Task 10 (`the open hub decides on every call`).
- ZMS-scriptet køres af hubbens 32-bit cscript (SysWOW64), appen brugte 64-bit: det skal virke mod rigtig SAP. Verifikation i Task 14, trin 2.
- En BPO-pc uden Excel eller med arket åbent skrivebeskyttet: fejlen skal være den danske tekst fra appen, ikke en teknisk fejl. Test i Task 8 (`excel error codes become the Danish texts`).

---

## Fase 1: Værktøjer pr. team

### Task 1: Værktøjslisten i backend og vindue

**Files:**
- Create: `electron/warehouse/tools.cjs`
- Create: `src/lib/warehouseTools.ts`
- Test: `electron/warehouse/tools.test.cjs`, `src/lib/warehouseTools.test.ts`

**Interfaces:**
- Produces (backend): `TOOLS: Readonly<Record<ToolId, readonly string[]>>`, `TOOL_IDS: ToolId[]`, `toolsForTeam(teamId: string | null | undefined): ToolId[]` (i rækkefølgen timeclock, locations, counts, softwareload, finland), `hasTool(teamId, toolId): boolean`. `ToolId = 'timeclock' | 'locations' | 'counts' | 'softwareload' | 'finland'`.
- Produces (vindue): `WarehouseTool` (samme fem id'er, flyttes hertil fra `WarehouseHome.tsx` og re-eksporteres derfra), `WAREHOUSE_TOOLS` med samme værdier, `toolsForTeam(teamId): WarehouseTool[]`.

- [ ] **Step 1: Skriv de fejlende tests**

`tools.test.cjs`: `toolsForTeam('TCD')` er `['timeclock','locations','counts','softwareload','finland']`, `toolsForTeam('TRR')` er de fire første, `toolsForTeam('BPO')` er `['finland']`, `toolsForTeam('PIM')`, `toolsForTeam('tcd')` og `toolsForTeam(null)` er `[]`. `hasTool('TRR','finland')` er `false`.
`warehouseTools.test.ts`: `WAREHOUSE_TOOLS` er deep-equal med `require('../../electron/warehouse/tools.cjs').TOOLS` (via `createRequire(import.meta.url)`), så de to lister aldrig glider fra hinanden.

- [ ] **Step 2: Kør og se dem fejle**

Run: `node --test electron/warehouse/tools.test.cjs` og `npx.cmd vitest run src/lib/warehouseTools.test.ts`
Expected: FAIL, modulerne findes ikke.

- [ ] **Step 3: Lav `tools.cjs` og `warehouseTools.ts` med tabellen fra designets afsnit A**

- [ ] **Step 4: Kør testene igen**

Expected: PASS.

- [ ] **Step 5: Commit** `feat(arbejdsvaerktoejer): faelles vaerktoejsliste pr. team`

### Task 2: Backend: modulet for alle teams, adgang pr. værktøj

**Files:**
- Modify: `electron/warehouse/hubUser.cjs` (ny `moduleUser`)
- Modify: `electron/warehouse/register.cjs` (`handleTool`, `me`, `sap:status`, `dataDirOf`)
- Test: `electron/warehouse/hubUser.test.cjs`, `electron/warehouse/register.test.cjs`

**Interfaces:**
- Consumes: `toolsForTeam`, `hasTool` (Task 1).
- Produces:
  - `moduleUser(actor, users): { email, fullName, role, team, tools: ToolId[] }`. Kaster `WAREHOUSE_TEAM_NOT_ALLOWED`, når `actor.activeTeam.teamId` ikke matcher `/^[A-Z][A-Z0-9]{1,15}$/`, eller rollen ikke er `user`, `manager` eller `creator`. `warehouseUser` er uændret.
  - I `register.cjs`: `handleTool(tools: ToolId[], channel: string, fn: (user, payload, event) => any)`. Brugeren laves med `moduleUser`, og kaldet afvises med `WAREHOUSE_TOOL_NOT_ALLOWED`, når teamet ikke har mindst ét af `tools`. Kanalen kommer i `channels` som de andre og bruger samme fejlhåndtering (`toIpcError`) og langsom-log.
  - `warehouse:me` (nu via `moduleUser`, alle teams): `{ email, fullName, role, team, storageLocations: TEAMS[team]?.storageLocations ?? [], tools }`.
  - `warehouse:sap:status` registreres med `handleTool(['counts','locations','softwareload','finland'], ...)`.
  - `dataDirOf(team)` tillader teams med mindst ét værktøj (`toolsForTeam(team).length > 0`).
  - `registerWarehouse` returnerer også `handleTool` internt videre til `registerFinland` (Task 10).

- [ ] **Step 1: Skriv de fejlende tests**

`hubUser.test.cjs`: `moduleUser` med team `BPO` giver `tools: ['finland']`; med `PIM` giver `tools: []`; `'tcd'`, `null` og rollen `admin` kaster `WAREHOUSE_TEAM_NOT_ALLOWED`.
`register.test.cjs`: tilføj aktørerne `bpo` (BPO, user), `bpoBoss` (BPO, manager) og `trrAnna` (TRR, user) i `setup`, og opret mappen `BPO` i roden.
- `me for every team`: `call('pim','me')` giver `tools: []` og `storageLocations: []`; `call('bpo','me')` giver `tools: ['finland']`. Den gamle forventning (linje ca. 89), at `pim` afvises på `me`, ændres hertil.
- `every existing channel still refuses other teams`: for hver kanal i `registered.channels`, der ikke er `me`, `sap:status`, `admin:*` eller `finland:*`, afvises `call('bpo', kanal, {})` med `/WAREHOUSE_TEAM_NOT_ALLOWED/`.
- `sap:status follows the tools`: `bpo` får et svar; `pim` afvises med `/WAREHOUSE_TOOL_NOT_ALLOWED/`.

- [ ] **Step 2: Kør og se dem fejle**

Run: `node --test electron/warehouse/hubUser.test.cjs electron/warehouse/register.test.cjs`
Expected: FAIL på de nye tests.

- [ ] **Step 3: Implementér `moduleUser`, `handleTool` og ændringerne i `register.cjs`**

`serviceUser` og den gamle `handle` røres ikke, så Optællings rolle-cache og Hubert opfører sig som før.

- [ ] **Step 4: Kør hele warehouse-suiten**

Run: `npm.cmd run test:warehouse`
Expected: PASS, også alle eksisterende tests.

- [ ] **Step 5: Commit** `feat(arbejdsvaerktoejer): modulet aabnes for alle teams, adgang tjekkes pr. vaerktoej`

### Task 3: Vinduet: modulet for alle, kun eget teams værktøjer

**Files:**
- Modify: `src/views/Hub.tsx:810-817` (`available: true`)
- Modify: `src/lib/warehouseLabels.ts` (beskrivelse uden "for TCD og TRR", fx da `Værktøjer til dit teams daglige arbejde`, en `Tools for your team's daily work`; fi/sv tilsvarende engelsk)
- Modify: `src/types/warehouse.ts` (`WarehouseUser.tools: WarehouseTool[]`)
- Modify: `src/views/warehouse/WarehouseHome.tsx` (filtrér `tools()` på `user.tools`; `statuses.activeProgress()` kun når `counts` er med; tom tilstand)
- Modify: `src/views/warehouse/Warehouse.tsx` (kommentarer, intet andet i denne task)
- Test: `src/views/warehouse/WarehouseHome.test.tsx`

**Interfaces:**
- Consumes: `WarehouseTool`, `toolsForTeam` (Task 1), `me().tools` (Task 2).

- [ ] **Step 1: Skriv de fejlende tests** (med `renderToStaticMarkup` fra `react-dom/server`, `window.electronWarehouse` sat til et objekt uden metoder)

- `shows only the team's tools`: bruger med `tools: ['finland']` giver markup med "Finlandsforsendelser" og uden "Optælling".
- `says when the team has no tools`: `tools: []` giver teksten `Dit team har ingen værktøjer i Arbejdsværktøjer endnu.`

- [ ] **Step 2: Kør og se dem fejle**

Run: `npx.cmd vitest run src/views/warehouse/WarehouseHome.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementér.** Flisen for Finlandsforsendelser: titel `Finlandsforsendelser` (samme på engelsk), beskrivelse da `Kolli fra Danmark til Finland: skriv dagens kolli i arket og følg op på leveringen hos PostNord, DHL og DSV.`, en `Parcels from Denmark to Finland: write the day's parcels in the sheet and follow up delivery with PostNord, DHL and DSV.`, ikon `Truck` og `Package`. Værktøjet åbner endnu ikke noget (Task 11).

- [ ] **Step 4: Kør testene og `npm.cmd run build`**

Expected: PASS og ingen typefejl.

- [ ] **Step 5: Commit** `feat(arbejdsvaerktoejer): alle teams kan aabne modulet og ser kun egne vaerktoejer`

## Fase 2: Administration og roller pr. værktøj

### Task 4: Roller pr. værktøj i backend

**Files:**
- Modify: `electron/warehouse/roles.cjs`
- Modify: `electron/warehouse/register.cjs` (nye kanaler)
- Test: `electron/warehouse/roles.test.cjs`, `electron/warehouse/register.test.cjs`

**Interfaces:**
- Produces:
  - Rollefilen får `finlandAdmins: Record<email, { by, at }>` ved siden af `locationAdmins`, læst og skrevet som dem.
  - `roles.isFinlandAdmin(user): Promise<boolean>`: `true` for manager og creator, ellers opslag i `finlandAdmins`. En status manager fra Optælling er ikke admin her.
  - `roles.setFinlandAdmin(user, { email, admin: boolean })`: kun `isManager(user) && !user.statusManager`, ellers `MANAGER_ONLY`. Personen skal være i teamet (`MEMBER_NOT_FOUND` som `setLocationAdmin`). Logges som `finland-admin-added` og `finland-admin-removed`.
  - `roles.toolRoles(user, tools: ToolId[])`: `{ team, canEdit, canGrantStatusManager, users: [{ email, fullName, role?, locationRole?, finlandRole? }], log }`. `role` kun med `counts`, `locationRole` kun med `locations`, `finlandRole: 'manager' | 'admin' | 'user'` kun med `finland`.
  - Kanaler: `warehouse:admin:roles` (`handleTool` med alle fem værktøjer, kun managere, ellers `MANAGER_ONLY`) og `warehouse:admin:set-finland-admin` (`handleTool(['finland'])`). De eksisterende `roles:*`-kanaler bruges fortsat til Optælling og Placeringer.

- [ ] **Step 1: Skriv de fejlende tests**

`roles.test.cjs`: manager giver Anna admin, `isFinlandAdmin(ANNA)` er `true`, og loggen har `finland-admin-added`; en status manager kan ikke give rollen (`MANAGER_ONLY`) og er ikke selv admin; `toolRoles` for `['finland']` har kun `finlandRole` på brugerne; Annas Optællingsrolle røres ikke.
`register.test.cjs`: `bpoBoss` kan kalde `admin:roles` og `admin:set-finland-admin`; `bpo` afvises med `MANAGER_ONLY`; `trrAnna` afvises på `admin:set-finland-admin` med `WAREHOUSE_TOOL_NOT_ALLOWED`; rollefilen for BPO ligger i `BPO\lagerstyring`.

- [ ] **Step 2: Kør og se dem fejle**

Run: `node --test electron/warehouse/roles.test.cjs electron/warehouse/register.test.cjs`

- [ ] **Step 3: Implementér**

- [ ] **Step 4: Kør `npm.cmd run test:warehouse`**

Expected: PASS.

- [ ] **Step 5: Commit** `feat(arbejdsvaerktoejer): roller pr. vaerktoej og admin i Finlandsforsendelser`

### Task 5: Administration i Arbejdsværktøjer

**Files:**
- Create: `src/views/warehouse/admin/WarehouseAdmin.tsx` (siden), `src/views/warehouse/admin/ToolRoles.tsx` (rollelisten pr. værktøj)
- Modify: `src/views/warehouse/WarehouseHome.tsx` (flisen "Administration" kun for `user.role` manager eller creator)
- Modify: `src/views/warehouse/Warehouse.tsx` (`Tool` får `'admin'`, titel `Administration`, deep link `tab = admin`)
- Modify: `src/views/ManagerPanel.tsx:1282` (kortet byttes ud med en henvisning)
- Delete: `src/components/warehouse/WarehouseRolesCard.tsx` (indholdet flyttes til `ToolRoles.tsx`, opdelt pr. værktøj)
- Modify: `electron/preload.cjs` og `src/types/warehouse.ts` (`admin.roles()`, `admin.setFinlandAdmin({ email, admin })`)
- Test: `src/views/warehouse/WarehouseHome.test.tsx`

**Interfaces:**
- Consumes: `warehouse:admin:roles`, `warehouse:admin:set-finland-admin`, de eksisterende `roles:set-role` og `roles:set-location-admin` (Task 4).
- Produces: `WarehouseAdmin({ user })` med et afsnit pr. værktøj i `user.tools`, hvor der er roller (Optælling, Placeringer, Finlandsforsendelser). Afsnittet for Finlandsforsendelser har pladser til indstillinger og kladder (Task 13).

- [ ] **Step 1: Skriv de fejlende tests**: `shows Administration to managers only` (manager ser flisen, user ser den ikke).
- [ ] **Step 2: Kør og se dem fejle**
- [ ] **Step 3: Implementér.** Rolleteksterne fra `WarehouseRolesCard` genbruges (da og en). Finlandsforsendelser: valg `Bruger` / `Admin`, hjælpetekst da `Admin kan slette en række i arket for kolli, der ikke blev sendt.` I Manager Panel: et kort med da `Roller i Arbejdsværktøjer findes nu i Arbejdsværktøjer under Administration.` og knappen `Åbn Administration`, der navigerer til `warehouse` med `tab: 'admin'` (samme navigationsfunktion som Huberts deep links).
- [ ] **Step 4: Kør testene og `npm.cmd run build`**
- [ ] **Step 5: Commit** `feat(arbejdsvaerktoejer): Administration med roller pr. vaerktoej, flyttet fra Manager Panel`

## Fase 3: Finlandsforsendelser, backend

### Task 6: Flyt kernen og dens tests

**Files:**
- Create: `electron/warehouse/finland/core/` med `courier.cjs`, `sapList.cjs`, `sheetIndex.cjs`, `compare.cjs`, `newRows.cjs`, `dayOverview.cjs`, `placement.cjs`, `reviewAction.cjs`, `followUp.cjs`, `followUpSync.cjs`, `manualRow.cjs`, `dateRange.cjs` (kopier fra `Finland TT\src`, kun `require`-stier ændres)
- Create: testene fra `Finland TT\tests` for samme moduler i `electron/warehouse/finland/core/*.test.cjs`, og `electron/warehouse/finland/fixtures/` med `sheet-2026-11-24.json` og `zms-2026-11-24.tsv`
- Modify: `package.json` (`test` og `test:warehouse` får `electron/warehouse/finland/*.test.cjs electron/warehouse/finland/core/*.test.cjs`; `files` får `!electron/warehouse/finland/fixtures/**`)

Ikke med: `drafts.cjs` (Task 7), `sapStatus.cjs` og `sap.cjs` (hubbens egne, Task 8), `excel.cjs` (Task 8).

- [ ] **Step 1: Kopier testene og fixtures, kør dem**

Run: `node --test electron/warehouse/finland/core/*.test.cjs`
Expected: FAIL, modulerne mangler.

- [ ] **Step 2: Kopier modulerne**

- [ ] **Step 3: Kør igen**

Expected: PASS, samme antal tests som de tilsvarende filer i appen.

- [ ] **Step 4: Commit** `feat(finlandsforsendelser): kernen og dens tests flyttet fra Finland T&T`

### Task 7: Fælles data

**Files:**
- Create: `electron/warehouse/finland/shared.cjs`
- Test: `electron/warehouse/finland/shared.test.cjs` (med `createStore` i en midlertidig mappe)

**Interfaces:**
- Produces: `createFinlandShared({ store, now = Date.now })` →
  - `notSent.list(): Promise<NotSent[]>`; kaster `STORAGE_UNAVAILABLE`, når nøglen mangler og mappen ikke findes (som `roles.cjs` `read`). `NotSent = { delivery, tracking, shippedOn, orderType, postalCode, by, byName, at }`.
  - `notSent.mark(user, entry)`, `notSent.restore(key)`, hvor `key = parcelKey(delivery, tracking)`.
  - `lock.acquire(user, { day, action, ttlMs }): Promise<() => Promise<void>>`. Holder en anden en lås, der ikke er udløbet, kastes `FINLAND_LOCKED: <navn> skriver <d.m> i arket lige nu`. Samme person må tage sin egen låsen igen. Den returnerede funktion frigiver kun, hvis låsen stadig er ens egen.
  - `dayLog.record(user, day, keys: string[])`, `dayLog.recentKeys(withinMs = 30 * 60000): Set<string>`, `dayLog.days(): Record<day, { byName, at, count }>`.
  - `settings.get(): { workbookUrl, sheetName, tableName, isTest }` med testarket som standard; `settings.set(user, values)` kun for manager og creator (`MANAGER_ONLY`).
  - `drafts(email)`: `{ all(), get(key), set(key, draft), remove(keys) }` (async, samme form som appens `createDraftStore`), gemt under `kladder-<hash>` med `{ email, name, drafts }`.
  - `drafts.others(email): Promise<{ email, name, byDay: Record<day, number>, keys: string[] }[]>` via `keysAsync`.
  - `drafts.clear(manager, email)`: kun manager og creator, ellers `MANAGER_ONLY`.

- [ ] **Step 1: Skriv de fejlende tests**

`marks and restores a parcel`, `the not-sent list is unreadable when the folder is gone` (kaster `STORAGE_UNAVAILABLE`), `a lock held by someone else refuses with the name and day`, `an expired lock can be taken by someone else` (flyt `now` forbi `ttlMs`), `release does not free a lock someone else has taken since`, `recent keys are forgotten after 30 minutes`, `settings default to the test sheet and only managers change them`, `drafts are per person and others are counted per day`, `only managers clear someone's drafts`.

- [ ] **Step 2: Kør og se dem fejle**

Run: `node --test electron/warehouse/finland/shared.test.cjs`

- [ ] **Step 3: Implementér**

- [ ] **Step 4: Kør igen**

Expected: PASS.

- [ ] **Step 5: Commit** `feat(finlandsforsendelser): faelles liste, skrivelaas, dagslog, indstillinger og kladder`

### Task 8: Excel og SAP

**Files:**
- Create: `electron/warehouse/finland/excel/` med `common.ps1`, `read-table.ps1`, `append-rows.ps1`, `fix-tracking.ps1`, `write-followup.ps1`, `delete-row.ps1` (kopier fra `Finland TT\excel`)
- Create: `electron/warehouse/finland/excel.cjs` (fra `Finland TT\src\excel.cjs`)
- Create: `electron/warehouse/sap/zms-cons-info.vbs` (fra `Finland TT\sap`)
- Create: `electron/warehouse/finland/sap.cjs`
- Modify: `electron/warehouse/sapBridge.cjs` (`SCRIPTS` får `'zms-cons-info': 'zms-cons-info.vbs'`)
- Modify: `package.json` (`asarUnpack` får `electron/warehouse/finland/excel/*.ps1`)
- Test: `electron/warehouse/finland/excel.test.cjs` (fra appens `tests/excel.test.cjs`), `electron/warehouse/finland/sap.test.cjs`, `electron/warehouse/sapScripts.test.cjs`

**Interfaces:**
- Produces:
  - `createFinlandExcel({ scriptsDir, tmpDir, workbook: () => Promise<{ workbookUrl, sheetName, tableName }> })` → `readSheet()`, `appendRows(rows, placement)`, `replaceTracking(fix)`, `writeFollowUp(writes)`, `deleteRow({ row, delivery, tracking })`. Samme svar og fejltekster som appen. `scriptsDir` er den udpakkede sti (`app.asar.unpacked`).
  - `fetchParcels({ bridge, runScript, system, salesOrg = 'F300', range: { from, to }, tmpDir }): Promise<Parcel[]>`: kører `runScript('zms-cons-info', [outFile, system, salesOrg, from, to], { timeoutMs: 600000 })` inde i `bridge.exclusive`, læser filen med `parseSapList` og sletter den. Scriptets fejlkoder (`wrong-language`, `session-not-created` osv.) bliver appens danske tekster.
  - Datoer i formatet `dd.mm.åååå`; `outFile` i `os.tmpdir()\finlandsforsendelser\` og skal passere `SAFE_ARGUMENT`.

- [ ] **Step 1: Skriv de fejlende tests**

`excel error codes become the Danish texts` (fx `read-only` giver `Arket er åbnet skrivebeskyttet. Tryk "Aktivér redigering" i Excel, og prøv igen.`), appens `appendTimeoutMs`-tests, `fetches parcels through the SAP queue` (falsk `runScript` skriver fixture-filen, falsk `bridge.exclusive` tæller kald: 1, resultatet har 1.560 kolli som appens `sapList`-test), `wrong language gives the Danish text`, og i `sapScripts.test.cjs` at `zms-cons-info.vbs` findes og er et læse-script.

- [ ] **Step 2: Kør og se dem fejle**

Run: `node --test electron/warehouse/finland/excel.test.cjs electron/warehouse/finland/sap.test.cjs electron/warehouse/sapScripts.test.cjs`

- [ ] **Step 3: Implementér.** I VBS-scriptet ændres intet ud over at læse system og klient fra `COUNTPOINT_SAP_SYSTEM` og `COUNTPOINT_SAP_CLIENT`, når de er sat.

- [ ] **Step 4: Kør igen**

Expected: PASS.

- [ ] **Step 5: Commit** `feat(finlandsforsendelser): Excel-scripts og ZMS_CONS_INFO gennem hubbens SAP-koe`

### Task 9: Servicen

**Files:**
- Create: `electron/warehouse/finland/service.cjs` (fra `Finland TT\app\service.cjs`)
- Test: `electron/warehouse/finland/service.test.cjs` (falsk Excel og SAP, ægte `createFinlandShared` på en midlertidig mappe)

**Interfaces:**
- Consumes: kernen (Task 6), `createFinlandShared` (Task 7), `createFinlandExcel` og `fetchParcels` (Task 8), `roles.isFinlandAdmin` (Task 4).
- Produces: `createFinlandService({ shared, excel, fetchParcels, isAdmin, now })` med:
  - `load(user)`, `loadSheet(user)`, `writeDay(user, date)`, `fixReview(user, delivery, tracking)`, `saveDraft(user, key, wanted, slaManual, base)`, `saveFollowUp(user, date | null)`, `resolveConflict(user, key, field, choice)`, `checkManual(user, input)`, `addManualRow(user, input)`, `markNotSent(user, delivery, tracking)`, `restoreNotSent(user, key)`, `deleteNotSentRow(user, key, row)`, `pending(user): number`.
  - Alle returnerer appens snapshot plus: `sheet.isTest`, `dayLog` (pr. dag: `byName`, `at`, `count`), `lock` (`{ byName, day, action }` eller `null`), `followUp.othersByDay` (pr. dag: `[{ name, count }]`), og på hver række i opfølgningen `othersPending: string[]` (navne).
  - Alt, der skriver i arket, går i denne rækkefølge: læs `notSent.list()` (fejl stopper alt), tag låsen (`ttlMs` = Excel-timeout + 60 s), læs arket igen, skriv, registrér i `dayLog`, frigiv låsen i `finally`.
  - `writeDay` og `fixReview` regner nøgler fra `notSent` og `dayLog.recentKeys()` som "står i arket".
  - `deleteNotSentRow` kræver `isAdmin(user)`, ellers `FINLAND_ADMIN_ONLY`.
  - Kladder hentes altid med `shared.drafts(user.email)`, så man kun kan gemme sine egne.
  - SAP-listen og den sidst læste ark-tilstand holdes i hukommelsen pr. hub-proces, som i appen.

- [ ] **Step 1: Skriv de fejlende tests**

Flyt appens adfærd med: genlæsning før skrivning, konflikt betyder at kolliet springes over, sletning kun ved én match. Nye tests:
- `no sheet write when the shared not-sent list cannot be read`: fjern mappen, `writeDay` kaster `STORAGE_UNAVAILABLE`, og den falske Excel fik intet skrive-kald.
- `a day someone else is writing is refused`: en anden holder låsen, `writeDay` kaster `FINLAND_LOCKED`, og Excel blev ikke kaldt.
- `the lock is released when Excel fails`.
- `parcels written by a colleague in the last 30 minutes are not written again`: `dayLog` har nøglen, arket har den ikke, `writeDay` skriver den ikke.
- `not-sent parcels are never written`.
- `only admins delete a row`.
- `a colleague's unsaved change is shown on the parcel but does not block`: Annas kladde vises som `othersPending: ['Anna Holm']` hos Mona, og Mona kan stadig gemme sin egen.
- `follow-up save sends only the person's own drafts`.

- [ ] **Step 2: Kør og se dem fejle**

Run: `node --test electron/warehouse/finland/service.test.cjs`

- [ ] **Step 3: Implementér**

- [ ] **Step 4: Kør igen og `npm.cmd run test:warehouse`**

Expected: PASS.

- [ ] **Step 5: Commit** `feat(finlandsforsendelser): service med faelles liste, skrivelaas og personlige kladder`

### Task 10: Kanaler, sporingsvinduer og preload

**Files:**
- Create: `electron/warehouse/finland/register.cjs`, `electron/warehouse/finland/tracking.cjs` (fra `Finland TT\app\tracking.cjs`)
- Modify: `electron/warehouse/register.cjs` (kalder `registerFinland`; valgfri `finlandDeps` til tests), `electron/preload.cjs`, `electron/main.cjs` (lukkeadvarsel)
- Create: `src/types/finland.ts`; Modify: `src/types/warehouse.ts` (`WarehouseBridge.finland`)
- Test: `electron/warehouse/finland/register.test.cjs`

**Interfaces:**
- Consumes: `handleTool` (Task 2), servicen (Task 9), `roles` (Task 4), `sap`, `runScript`, `opener.lazy` (fra `register.cjs`).
- Produces: kanalerne `warehouse:finland:<navn>` med `handleTool(['finland'], ...)` og appens validering fra `Finland TT\app\main.cjs` (`KEY`, `DATE`, `checkWanted`, `checkBase`, `checkManualInput`, `trackingUrl`): `load`, `load-sheet`, `write-day`, `fix-review`, `save-draft`, `save-followup`, `resolve-conflict`, `check-manual`, `add-manual-row`, `mark-not-sent`, `restore-not-sent`, `delete-not-sent-row`, `open-tracking`, `settings`, `set-settings`, `drafts-overview`, `clear-drafts`. Preload: `window.electronWarehouse.finland.<camelCase>(...)`. Lukkeadvarsel: når vinduet lukkes, og personen har kladder i Finlandsforsendelser, vises appens dialog (`Luk alligevel` / `Bliv i programmet`) med samme tekst.

- [ ] **Step 1: Skriv de fejlende tests**

`a TRR user is refused every Finland channel` (`WAREHOUSE_TOOL_NOT_ALLOWED`), `a BPO user reads the sheet` (falsk Excel via `finlandDeps`), `the open hub decides on every call` (samme e-mail: i TCD virker det, i TRR afvises det), `invalid input is refused before the service` (fx `write-day` med `2026-13-01`), `tracking only opens https addresses from the config`.

- [ ] **Step 2: Kør og se dem fejle**
- [ ] **Step 3: Implementér**
- [ ] **Step 4: Kør `npm.cmd test`**

Expected: PASS for alt.

- [ ] **Step 5: Commit** `feat(finlandsforsendelser): IPC-kanaler, sporingsvinduer og lukkeadvarsel`

## Fase 4: Finlandsforsendelser, skærmene

### Task 11: Værktøjet og "Skriv ind"

**Files:**
- Create: `src/views/warehouse/finland/Finland.tsx` (faner, titellinje med "N kolli er ikke gemt i arket", `Testark`-mærke, knapperne `Hent fra SAP` og `Læs arket`), `Calendar.tsx`, `WriteDay.tsx`, `ManualRow.tsx`, `src/lib/warehouse/finlandDates.ts` (fra `Finland TT\app\renderer\dates.js` og `calendar.js`)
- Modify: `src/views/warehouse/Warehouse.tsx` (tool `finland`, titel, `sapTool` med `finland`), `src/lib/warehouse/sapStatus.ts` (`SapTool` med `finland`)
- Test: `src/lib/warehouse/finlandDates.test.ts` (fra appens `dates.test.cjs` og `calendar.test.cjs`)

Indhold som appens `app.js` og `manual.js` (se designets afsnit H): kalender med farver, grupperne Mangler, Skal tjekkes, Ikke sendt og Står i arket, rettelser, "Ikke sendt" og "Sæt ind igen", sletning af række med rød bekræftelse (kun admin, ellers vises knappen ikke), "Tilføj række i hånden". Nyt: ved dagen vises `Sidst skrevet af <navn> kl. <tid>`, og mens en anden skriver, står `<navn> skriver <dag> i arket lige nu`, og skriveknapperne er slået fra.

- [ ] **Step 1: Skriv de fejlende tests for `finlandDates.ts`**
- [ ] **Step 2: Kør og se dem fejle**
- [ ] **Step 3: Implementér datoerne, derefter skærmene**
- [ ] **Step 4: Kør testene og `npm.cmd run build`; åbn værktøjet i `npm.cmd run electron:dev` mod en kopi og tag et skærmbillede**
- [ ] **Step 5: Commit** `feat(finlandsforsendelser): Skriv ind og Tilfoej raekke i haanden`

### Task 12: Opfølgning

**Files:**
- Create: `src/views/warehouse/finland/FollowUp.tsx` (liste og detalje), `src/views/warehouse/finland/SaveConfirm.tsx` (gem dag og gem alle)

Indhold som appens `followup.js`: kolonneoverskrifter og forklaring, Expected i listen, forslag, tastaturgenveje (Enter, piletaster, T, 1, 2, O, N), "Åbn hos PostNord/DHL/DSV", konflikter med "Brug arkets" og "Brug min", "Gem N i arket" og "Gem alle". Nyt: ved hver dag `Navn har N kolli, der ikke er gemt`, og på kolliet advarslen `Navn har en ændring på dette kolli, der ikke er gemt.`

- [ ] **Step 1: Implementér**
- [ ] **Step 2: `npm.cmd run build`, prøv i `electron:dev` mod en kopi, skærmbillede**
- [ ] **Step 3: Commit** `feat(finlandsforsendelser): Opfoelgning med kollegaers ikke gemte aendringer`

### Task 13: Finlandsforsendelser i Administration

**Files:**
- Create: `src/views/warehouse/admin/FinlandAdmin.tsx`
- Modify: `src/views/warehouse/admin/WarehouseAdmin.tsx`

Indhold: arkets adresse, fane og tabel med knappen `Gem`. Skift fra testarket kræver bekræftelsen da `Herefter skriver BPO og TCD i dette ark. Er det det rigtige ark?`. Oversigt over kladder pr. person (navn, antal, dage, senest ændret) med `Slet <navn>s ændringer` og bekræftelsen da `Ændringerne slettes kun i appen. Arket bliver ikke ændret.`

- [ ] **Step 1: Implementér**
- [ ] **Step 2: `npm.cmd run build`, prøv i `electron:dev`**
- [ ] **Step 3: Commit** `feat(finlandsforsendelser): ark og kollegaers kladder i Administration`

## Fase 5: Afprøvning og udgivelse

### Task 14: Afprøvning på kopi, pakning og changelog

**Files:**
- Modify: `src/lib/changelog.ts` (1.6.9: Arbejdsværktøjer for alle teams, Administration, Finlandsforsendelser)
- Modify: `C:\Supply Chain Tools\Finland TT\README.md` (afsnit: appen er afløst af Finlandsforsendelser i hubben og må ikke bruges mod det rigtige ark)

- [ ] **Step 1: `npm.cmd test` og `npm.cmd run build`**

Expected: alt PASS, ingen typefejl.

- [ ] **Step 2: Rigtig SAP, kun læsning.** I `electron:dev`, TCD-hub: `Hent fra SAP` i Finlandsforsendelser. Expected: omtrent samme antal kolli pr. dag som appen giver samme dag, og SAP-vinduet lukker igen. Bekræfter, at 32-bit cscript virker.

- [ ] **Step 3: Rigtig Excel på en kopi.** Lav en kopi med `SaveCopyAs` og sæt arket i Administration til kopien. Skriv én dag, ret et T&T, markér "Ikke sendt" og slet en række som admin, gem en opfølgning. Sammenlign kopien før og efter række for række som i appens afprøvning. Kopien lukkes og slettes bagefter.

- [ ] **Step 4: To personer.** Sæt en låseindgang med en anden e-mail i `skrivelaas` og kontrollér, at skriveknapperne er slået fra med navnet. Læg en kladde med en anden e-mail og kontrollér advarslen og oversigten i Administration.

- [ ] **Step 5: Adgang i vinduet.** Log på som (eller skift til) BPO, TRR og et team uden værktøjer, og kontrollér, hvad forsiden af Arbejdsværktøjer viser.

- [ ] **Step 6: Pakning.** `npm.cmd run electron:build` og kontrollér, at `release\win-unpacked\resources\app.asar.unpacked\electron\warehouse\finland\excel\` har de seks `.ps1`-filer og `...\warehouse\sap\zms-cons-info.vbs` findes.

- [ ] **Step 7: Commit** `docs(1.6.9): changelog for Finlandsforsendelser og Arbejdsvaerktoejer for alle teams`
