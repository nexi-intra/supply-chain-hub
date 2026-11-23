# Softwareload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Nyt værktøj "Softwareload" i Arbejdsværktøjer: én persons tidsmålte opgave med scannede serienumre, flytning i SAP ved afslutning (KIF via D005, fejlede til blocked stock eller D002), "Flyt ind i KIF", søgning på serienummer på tværs af TRR og TCD, og statistik.

**Architecture:**
- **Rene funktioner** i `electron/warehouse/softwareload/core/` afgør hvad der skal flyttes (`planMoves`) og finder den skyldige i en fejlet gruppe (`bisect`).
- **SAP-lag** `softwareloadSap.cjs` kører tre nye VBS-scripts: opslag (læs), cockpit-Transfer (skriv) og MIGO 344 (skriv). Skrivescriptene har deres egen systemliste, som først kun indeholder QS4.
- **Service** `softwareloadService.cjs` holder opgaver i teamets store og et fælles søgeindeks i `_lagerstyring\softwareload`.
- **Wiring:** `register.cjs` kobler det til IPC. React-visningen ligger i `src/views/warehouse/softwareload/`.

**Tech Stack:**
- Electron (CommonJS, `node --test`) og React + TypeScript (vitest).
- SAP GUI Scripting via 32-bit cscript.
- Den krypterede store (`store.cjs`, `mutateAsync`).

**Spec:** [softwareload-design.md](./softwareload-design.md)

Status 23.11.2026: Alle faser er færdige. Fuld test mod QS4 23.11 (34 tjek, 0 fejl), PS4 slået til samme dag efter Jacobs godkendelse. Brugerfladen er endnu ikke klikket igennem i appen.

Start med **Fase 1**. Den er ren logik uden SAP og uden UI, og den låser reglerne fast.

## Global Constraints

- **Teams:** kun TRR og TCD (Arbejdsværktøjer findes kun for dem via `isAllowedTeam`).
- **Plant:** D301.
- **Typer, i denne rækkefølge og med disse tekster:**
  - `sw+key` = "Softwareload + keyload"
  - `sw` = "Softwareload"
  - `key` = "Keyload"
- **KIF:** I KIF går alle terminaler via D005, også fejlede og dem der allerede står på målet. Uden for KIF springes terminaler på målet over.
- **Fejlede terminaler:**
  - Materiale der slutter på `-0`: til D000, derefter MIGO 344 på D000.
  - Materiale der slutter på `-R`: til D002.
- **Blocked stock** findes kun på D000. Terminaler i blocked stock kan ikke flyttes med Transfer.
- **Cockpit:** TCD bruger ZMS_REP og TRR bruger ZMS_PREP. Ved `no-access` prøves det andet cockpit.
- **Skrivesystemer:** `SOFTWARELOAD_WRITE_SYSTEMS = ['QS4']`. PS4 tilføjes først i Fase 6, efter Jacobs godkendelse.
- **SAP-arbejde** sker kun i appens egen SAP-session.
- **Udklipsholderen:** brugerens indhold læses før og lægges tilbage efter.
- **Ejerskab:** en opgave er én persons. Medarbejdere ser egne opgaver, managers ser alle (`isManager` som i Stempelkort). Søgning er for alle i TRR og TCD.
- **Tekster** er på dansk og engelsk via `t()`. Hubert-guiden skrives på fire sprog (da, en, fi, sv).
- **Sprog og stil:** ingen tankestreger som sætningsbindere i brugertekster.

## Review Focus

1. **Samme serienummer scannet to gange, med mellemrum eller små bogstaver:** normaliseres med `normalizeSerial` og afvises som dublet i opgaven (Task 4).
2. **SAP lukkes midt i afslutningen:** genoptagelse flytter ingen terminal to gange, og KIF-trinnet springes over for dem, der allerede har passeret D005 i opgaven (Task 1 og Task 5).
3. **Serienummer findes ikke i SAP (fx et langt serienummer):** markeres "ikke fundet" og flyttes ikke. Resten af opgaven afsluttes (Task 1).
4. **Målet er D005 i en KIF-opgave:** kun ét trin (X til D005), aldrig "D005 til D005" (Task 1).
5. **Fejlet terminal hvis materiale hverken slutter på -0 eller -R:** flyttes ikke og vises som "kræver manuel håndtering" (Task 1, min beslutning).

---

## Fase 1: Regler (ren logik)

### Task 1: `planMoves`, hvad der skal flyttes hvorhen

**Files:**
- Create: `electron/warehouse/softwareload/core/planMoves.cjs`
- Test: `electron/warehouse/softwareload/core/planMoves.test.cjs`

**Interfaces:**
- Produces:
  - `materialKind(material: string): 'new'|'used'|'other'`. Slutter på `-0` giver `new`, slutter på `-R` giver `used`, ellers `other`.
  - `normalizeSloc(value): string|null`. Trim og store bogstaver, og den skal matche `/^[A-Z]\d{3}$/`.
  - `planMoves({ kif, target, terminals, sapRows, passedD005 })` med:
    - `kif: boolean`, `target: string`
    - `terminals: {serial, failed: boolean}[]`
    - `sapRows: {serial, material, sloc, blocked: boolean}[]`
    - `passedD005: Set<string>`

    Den returnerer `{ transfers: {wave: 1|2, from, to, serials: string[]}[], blocks: {material, serials: string[]}[], outcomes: Record<serial, Outcome> }`.
  - `Outcome = 'to-target'|'to-blocked'|'to-d002'|'not-found'|'blocked-stock'|'already-blocked'|'skipped'|'manual'`
  - `KIF = 'D005'`, `BLOCKED_SLOC = 'D000'`, `USED_FAILED_SLOC = 'D002'`

**Reglerne (algoritmen, som testene skal fastholde):**

```
for hver terminal:
  row = sapRows[serial]; mangler -> 'not-found'
  destination = failed ? (kind new -> D000, kind used -> D002, other -> 'manual' og stop) : target
  row.blocked:
    failed && kind new && row.sloc == D000 -> 'already-blocked' (intet at gøre)
    ellers -> 'blocked-stock' (flyttes ikke)
  path = []
  hvis kif:
    hvis row.sloc != D005 og serial ikke i passedD005: path += (row.sloc -> D005)
    sidste = (path tom ? row.sloc : D005)
    hvis destination != D005: hvis sidste != destination eller path ikke tom eller serial ikke i passedD005:
       path += (D005 -> destination)       // også når terminalen allerede stod på målet
    (står den på D005 og målet er D005: ingen flytning, outcome stadig 'to-target')
  ellers:
    hvis row.sloc != destination: path += (row.sloc -> destination)
    ellers hvis !failed: outcome 'skipped'
  wave: i KIF er en flytning TIL D005 wave 1 og en flytning FRA D005 wave 2; uden for KIF er alt wave 1
  samme (wave, from, to) samles i én transfer
  failed && kind new: læg serial i blocks[material] (344 på D000 efter alle transfers)
```

Bemærk: i KIF med `serial i passedD005` og `row.sloc == destination` er terminalen færdig, og outcome er destinationens outcome uden flytning. Det er tilfældet ved genoptagelse.

- [x] **Step 1: Skriv de fejlende tests** (`node:test` og `assert`, samme stil som `timeclockService.test.cjs`)

```js
const row = (serial, material, sloc, blocked = false) => ({ serial, material, sloc, blocked })
test('materialKind: -0 is new, -R is used, the rest is other', () => {
  assert.equal(materialKind('INT4100-7883-0'), 'new'); assert.equal(materialKind('INT4100-7922-0-R'), 'used'); assert.equal(materialKind('R162-0717'), 'other')
})
test('normalizeSloc uppercases and rejects anything but a letter and three digits', () => {
  assert.equal(normalizeSloc(' d002 '), 'D002'); assert.equal(normalizeSloc('D5'), null); assert.equal(normalizeSloc('D0055'), null)
})
test('in KIF a terminal on D000 goes D000 -> D005 (wave 1) and D005 -> target (wave 2)', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: false }], sapRows: [row('A', 'M-0', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D005', serials: ['A'] }, { wave: 2, from: 'D005', to: 'D006', serials: ['A'] }])
  assert.equal(p.outcomes.A, 'to-target')
})
test('in KIF a terminal already on the target still goes via D005', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: false }], sapRows: [row('A', 'M-0', 'D006')], passedD005: new Set() })
  assert.deepEqual(p.transfers.map(t => [t.wave, t.from, t.to]), [[1, 'D006', 'D005'], [2, 'D005', 'D006']])
})
test('in KIF with target D005 there is one move only', () => {
  const p = planMoves({ kif: true, target: 'D005', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D000'), row('B', 'M-0', 'D005')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D005', serials: ['A'] }])
})
test('outside KIF a terminal on the target is skipped and the rest move directly', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D006'), row('B', 'M-0', 'D000')], passedD005: new Set() })
  assert.equal(p.outcomes.A, 'skipped'); assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D006', serials: ['B'] }])
})
test('failed new terminals go to D000 and into blocked stock; in KIF via D005', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: true }], sapRows: [row('A', 'M-0', 'D005')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 2, from: 'D005', to: 'D000', serials: ['A'] }])
  assert.deepEqual(p.blocks, [{ material: 'M-0', serials: ['A'] }]); assert.equal(p.outcomes.A, 'to-blocked')
})
test('failed used terminals go to D002; outside KIF directly', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: true }], sapRows: [row('A', 'M-0-R', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D002', serials: ['A'] }]); assert.deepEqual(p.blocks, []); assert.equal(p.outcomes.A, 'to-d002')
})
test('a failed new terminal already on D000 outside KIF is only blocked', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: true }], sapRows: [row('A', 'M-0', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, []); assert.deepEqual(p.blocks, [{ material: 'M-0', serials: ['A'] }])
})
test('not in SAP, blocked stock, already blocked and other materials are never moved', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'X', failed: false }, { serial: 'B', failed: false }, { serial: 'C', failed: true }, { serial: 'O', failed: true }], sapRows: [row('B', 'M-0', 'D000', true), row('C', 'M-0', 'D000', true), row('O', 'R162-0717', 'D000')], passedD005: new Set() })
  assert.deepEqual([p.outcomes.X, p.outcomes.B, p.outcomes.C, p.outcomes.O], ['not-found', 'blocked-stock', 'already-blocked', 'manual'])
  assert.deepEqual(p.transfers, []); assert.deepEqual(p.blocks, [])
})
test('resume: a terminal that passed D005 in this task and stands on the target is done', () => {
  const p = planMoves({ kif: true, target: 'D006', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D006'), row('B', 'M-0', 'D005')], passedD005: new Set(['A', 'B']) })
  assert.deepEqual(p.transfers, [{ wave: 2, from: 'D005', to: 'D006', serials: ['B'] }]); assert.equal(p.outcomes.A, 'to-target')
})
test('terminals with the same wave, from and to share one transfer', () => {
  const p = planMoves({ kif: false, target: 'D006', terminals: [{ serial: 'A', failed: false }, { serial: 'B', failed: false }], sapRows: [row('A', 'M-0', 'D000'), row('B', 'N-0', 'D000')], passedD005: new Set() })
  assert.deepEqual(p.transfers, [{ wave: 1, from: 'D000', to: 'D006', serials: ['A', 'B'] }])
})
```

- [x] **Step 2: Kør og se dem fejle**
  - Kør: `node --test electron/warehouse/softwareload/core/planMoves.test.cjs`
  - Forventet: FAIL med "Cannot find module './planMoves.cjs'".
- [x] **Step 3: Implementér `planMoves.cjs` efter reglerne ovenfor.** Transfers sorteres efter wave og derefter efter rækkefølgen af terminalerne.
- [x] **Step 4: Kør testene igen.** Forventet: alle PASS.
- [x] **Step 5: Commit** med `feat(softwareload): regler for flytning (planMoves)`.

### Task 2: `bisect`, find den skyldige i en fejlet gruppe

**Files:**
- Create: `electron/warehouse/softwareload/core/bisect.cjs`
- Test: `electron/warehouse/softwareload/core/bisect.test.cjs`

**Interfaces:**
- Produces: `bisect(items: string[], attempt: (items) => Promise<{ok: true, doc: string} | {ok: false, message: string}>)`. Den returnerer `Promise<{ done: {items: string[], doc: string}[], failed: {item: string, message: string}[] }>`.
  - Prøver hele listen. Fejler den, og der er mere end ét element, deles listen i to halvdele (første halvdel er `Math.ceil(n/2)`), og hver halvdel prøves rekursivt.
  - Et enkelt element, der fejler, ender i `failed` med SAP's besked.
- Kaster aldrig for SAP-afvisninger. Fejler `attempt` med en exception (fx SAP lukket), kastes den videre, så afslutningen kan genoptages.

- [x] **Step 1: Skriv de fejlende tests**

```js
test('all at once when SAP accepts the group', async () => {
  const calls = []
  const r = await bisect(['A', 'B', 'C'], async items => { calls.push(items); return { ok: true, doc: '49' } })
  assert.deepEqual(calls, [['A', 'B', 'C']]); assert.deepEqual(r, { done: [{ items: ['A', 'B', 'C'], doc: '49' }], failed: [] })
})
test('one bad item is isolated and the rest still move', async () => {
  const r = await bisect(['A', 'B', 'C', 'D'], async items => items.includes('C') ? { ok: false, message: 'Deficit' } : { ok: true, doc: items.join('') })
  assert.deepEqual(r.done.flatMap(d => d.items).sort(), ['A', 'B', 'D']); assert.deepEqual(r.failed, [{ item: 'C', message: 'Deficit' }])
})
test('an exception (SAP closed) is not swallowed', async () => {
  await assert.rejects(bisect(['A'], async () => { throw Object.assign(new Error('x'), { code: 'SAP_NOT_READY' }) }), { code: 'SAP_NOT_READY' })
})
```

- [x] **Step 2: Kør og se dem fejle.** Kør `node --test electron/warehouse/softwareload/core/bisect.test.cjs`. Forventet: FAIL.
- [x] **Step 3: Implementér `bisect.cjs`.**
- [x] **Step 4: Kør testene igen.** Forventet: PASS.
- [x] **Step 5: Commit** med `feat(softwareload): find fejlende serienummer i en gruppe (bisect)`.

## Fase 2: SAP

### Task 3: Tre SAP-scripts, egne skrivesystemer og SAP-laget

**Files:**
- Create: `electron/warehouse/sap/sl-lookup.vbs` (læs)
- Create: `electron/warehouse/sap/sl-transfer.vbs` (skriv)
- Create: `electron/warehouse/sap/sl-block.vbs` (skriv)
- Modify: `electron/warehouse/sapBridge.cjs`, som får `SCRIPTS`, `WRITE_SCRIPTS`, ny `SCRIPT_WRITE_SYSTEMS` og tjekket i `createCscriptRunner`
- Modify: `electron/warehouse/core/sapParsers.cjs`, som får `parseSlLookup` og `parseSlErrors`
- Create: `electron/warehouse/softwareload/softwareloadSap.cjs`
- Test:
  - `electron/warehouse/sapBridge.test.cjs`
  - `electron/warehouse/core/sapParsers.test.cjs`
  - `electron/warehouse/softwareload/softwareloadSap.test.cjs`
- Fixtures: `electron/warehouse/core/fixtures/sl-lookup-prep-sample.txt` og `sl-lookup-rep-sample.txt`, skrevet ud fra de rigtige kolonnenavne nedenfor.

**Interfaces:**
- **`sapBridge.cjs`:**
  - `SCRIPTS['sl-lookup'] = 'sl-lookup.vbs'`
  - `WRITE_SCRIPTS['sl-transfer']` og `WRITE_SCRIPTS['sl-block']`
  - `SCRIPT_WRITE_SYSTEMS = Object.freeze({ 'sl-transfer': ['QS4'], 'sl-block': ['QS4'] })`
  - `SOFTWARELOAD_WRITE_SYSTEMS = SCRIPT_WRITE_SYSTEMS['sl-transfer']` (eksporteres)
  - Runneren afviser skrivning, når `!(SCRIPT_WRITE_SYSTEMS[name] || writeSystems).includes(args[0])`, med `SAP_WRITE_SYSTEM_NOT_ALLOWED`.
- **Scripts (alle åbner deres egen session, lukker den altid og skriver én JSON-linje sidst, som `matdoc.vbs`):**
  - **`sl-lookup.vbs <rep|prep> <outDir> <outFile>`**
    - Læser serienumre fra udklipsholderen. Bruger radP_SERIAL, `S_PLANT-LOW=D301`, multiple selection på S_SERNR (`btn%_S_SERNR_%_APP_%-VALU_PUSH`, `wnd[1]/tbar[0]/btn[24]`, `btn[8]`) og F8.
    - Skriver tab-separeret `SERNR, MATNR, LGORT|WERKS_LGORT, STOCK_TYPE_ICON|STOCK_TYPE, USER_STAT|USER_STAT_TXT`, kun de kolonner der findes.
    - Svar: `{"ok":true,"rows":N}`.
  - **`sl-transfer.vbs <system> <rep|prep> <to> <outDir> <inFile> <errFile>`**
    - Serienumrene står i `inFile` og på udklipsholderen. Laver samme søgning som opslaget.
    - Tjekker at grid'ets SERNR-sæt er præcis lig `inFile`. Ellers `{"ok":false,"error":"rows-mismatch"}`, og der trykkes ikke Transfer.
    - Derefter `tbar[1]/btn[5]`, `tbar[1]/btn[36]`, `wnd[1]/usr/sub:SAPLSPO4:0300/ctxtSVALD-VALUE[0,21]=<to>` og Enter.
    - Ved popuppen "Transfer Movement (\d+) successfully created" svarer den `{"ok":true,"doc":"<nr>"}`.
    - Ved log-grid'et skriver den rækker med TYPE=E til `errFile` (`MESSAGE\tMESSAGE_V3\tMESSAGE_V4`) og svarer `{"ok":false,"error":"sap-errors"}`.
  - **`sl-block.vbs <system> <outDir> <inFile> <material> <344|343>`**
    - MIGO: sæt `cmbGODYNPRO-ACTION` Key `A08` og `REFDOC` `R10`, hvis carrier er 0003. Sæt BWART, Enter, og luk "Tip"-popuppen (SAPLMIGO 1300) med Enter.
    - Sæt `MAKTX=<material>`, `NAME1=D301`, `LGOBE=D000`, `ERFMG=<antal>` og Enter.
    - Fanen Serial Numbers: skriv `GOSERIAL-SERIALNO[0,i]`. Rul tabellen med `verticalScrollbar.position` ved flere end de synlige rækker. Ingen Enter.
    - Check (`btn[7]`). Popuppen SAPLRHRD 100 lukkes med `btnSPOP-OPTION1`. Kræver status "Document is O.K." (ellers `{"ok":false,"error":"sap: <tekst>"}`).
    - Post (`btn[23]`). Status "Material document (\d+) posted" giver `{"ok":true,"doc":"<nr>"}`.
  - Alle skrivescripts tjekker igen, at `Info.SystemName = <system>`. De svarer `not-logged-in-<system>` eller `no-access-<tcode>` som de eksisterende scripts.
- **`softwareloadSap.cjs`:** `createSoftwareloadSap({ bridge, runScript, clipboard, system, expected, tempRoot })` returnerer:
  - `writeEnabled: boolean` (= `SOFTWARELOAD_WRITE_SYSTEMS.includes(system)`)
  - `lookup({ team, serials }): Promise<{serial, material, plant, sloc, blocked, userStatus}[]>`. Opdeles i bidder af `LOOKUP_CHUNK = 500`. Tom liste giver `[]` uden SAP.
  - `transfer({ team, serials, to }): Promise<{ok: true, doc} | {ok: false, message}>`. Højst `TRANSFER_CHUNK = 200` serienumre pr. kald (kaster `SOFTWARELOAD_INVALID` ellers). `rows-mismatch` bliver til `{ok: false, message: 'SAP fandt ikke præcis de serienumre'}`.
  - `block({ material, serials, bwart = '344' }): Promise<{ok: true, doc} | {ok: false, message}>`. Højst `BLOCK_CHUNK = 20`.
  - Cockpit: `team === 'TCD' ? 'rep' : 'prep'`. Ved `no-access-*` prøves det andet én gang. Fejler begge, kastes `SAP_NO_ACCESS`.
  - Hvert kald kører i `bridge.exclusive`. Først tjekkes `status` (`SAP_NOT_READY`).
  - Udklipsholderen: `const saved = await clipboard.readText()` før, og `clipboard.writeText(saved)` i `finally`. Listen lægges på med `putOnClipboard` (`CLIPBOARD_REFUSED` ved fejl).
  - Skrivning, når `!writeEnabled`, kaster `SOFTWARELOAD_WRITE_DISABLED`.
- **`sapParsers.cjs`:**
  - `parseSlLookup(text)` returnerer `{serial, material, plant, sloc, blocked, userStatus}[]`. `blocked` er sand, når `STOCK_TYPE_ICON === '@06@'` eller `STOCK_TYPE === '07'`. WERKS_LGORT splittes som i `parseMatdoc`.
  - `parseSlErrors(text)` returnerer `{message, material, where}[]`.

- [x] **Step 1: Skriv de fejlende tests**
  - `sapBridge.test.cjs`: `'softwareload write scripts only run on their own systems'`. Med `system` PS4 afviser runneren `run('sl-transfer', ['PS4', 'prep', 'D005', 'C:\\t', 'in.txt', 'err.txt'])` med `SAP_WRITE_SYSTEM_NOT_ALLOWED`. QS4 kalder `execFile`. `pidoc-post` med PS4 er stadig tilladt.
  - `sapParsers.test.cjs`: `'sl lookup rows from ZMS_PREP and ZMS_REP give the same shape and blocked flag'` med fixtures:
    - En prep-række `393031157352189282 INT4100-7883-0 D000 @06@ ONHA` giver `{ serial: '393031157352189282', material: 'INT4100-7883-0', plant: '', sloc: 'D000', blocked: true, userStatus: 'ONHA' }`.
    - En rep-række med `WERKS_LGORT=D301-D000`, `STOCK_TYPE=01` og `USER_STAT_TXT=On Hand` giver `plant: 'D301'`, `sloc: 'D000'`, `blocked: false`.
  - `softwareloadSap.test.cjs` (falsk `runScript` og `clipboard` som i `sapFetch.test.cjs`):
    - `'lookup uses ZMS_REP for TCD, falls back to ZMS_PREP on no access, and restores the clipboard'`: det første kald svarer `{"ok":false,"error":"no-access-zms_rep"}`, det andet bruger `prep`, og `clip.at(-1)` er brugerens oprindelige tekst.
    - `'transfer returns the document number'`: svaret `{"ok":true,"doc":"4905204921"}` giver `{ ok: true, doc: '4905204921' }`, og args[0] er systemet.
    - `'transfer with SAP errors returns the message, not an exception'`: errFile `Deficit of SL Unrestricted-use 1 EA : INT4320-7842-0 D301 D000\tINT4320-7842-0\tD301 D000` giver `{ ok: false, message: /Deficit/ }`.
    - `'writing is refused when the system is not enabled'`: med `system: 'PS4'` kaster `transfer` en fejl med `code` lig `SOFTWARELOAD_WRITE_DISABLED`.
- [x] **Step 2: Kør og se dem fejle.** Kør `node --test electron/warehouse/sapBridge.test.cjs electron/warehouse/core/sapParsers.test.cjs electron/warehouse/softwareload/softwareloadSap.test.cjs`.
- [x] **Step 3: Implementér ændringerne i `sapBridge.cjs`, de to parsers og `softwareloadSap.cjs`.**
- [x] **Step 4: Skriv de tre VBS-scripts** med skærm-id'erne ovenfor og `matdoc.vbs` som skabelon (egen session, `CloseOwnSession`, `SystemConnection`).
- [x] **Step 5: Kør testene igen.** Forventet: PASS.
- [x] **Step 6: Røgtest i QS4** med Jacobs QS4 åben og ét serienummer (`393031157352189282`, INT4100-7883-0):
  1. Opslag.
  2. Transfer til D005 og tilbage til D000.
  3. 344 og derefter 343.

  Kør det med en lille node-stub, der kalder `softwareloadSap` med den rigtige cscript-runner (`system: 'QS4'`). Forventet: fire materialedokumentnumre, og terminalen står til sidst på D000 som ONHA uden blocked.
- [x] **Step 7: Commit** med `feat(softwareload): SAP-scripts til opslag, Transfer og blocked stock (kun QS4)`.

## Fase 3: Service og IPC

### Task 4: Opgavens livsløb (start, scan, fejlet, pause og annullér)

**Files:**
- Create: `electron/warehouse/softwareload/softwareloadService.cjs`
- Test: `electron/warehouse/softwareload/softwareloadService.test.cjs` (falsk store som i `timeclockService.test.cjs`)

**Interfaces:**
- Consumes:
  - `normalizeSerial` fra `core/countState.cjs`
  - `normalizeSloc` fra Task 1
- Produces: `createSoftwareloadService({ storeFor, indexStore, sap, timeclock, now = Date.now, newId })`, hvor `storeFor(team)` er `<team>\lagerstyring\softwareload` og `indexStore` er `<platform>\_lagerstyring\softwareload`.
  - **Nøgler i teamets store:**
    - `aktiv-<writer>` er den kørende opgave
    - `venter-<taskId>` er en opgave, der mangler SAP
    - `opgaver-<writer>-<yyyy-mm>` gemmer `{ tasks: { [id]: Task } }`
    - `kif-<yyyy-mm>` gemmer `{ moves: { [id]: KifMove } }`
    - `versioner` gemmer `string[]`

    `writer` er sha256(email) på 16 tegn som i Stempelkort.
  - **Nøgler i indekset:** `serier-<yyyy-mm>` gemmer `{ lines: IndexLine[] }`.
  - **`Task`** har felterne:
    - `id, team, email, name`
    - `type: 'sw+key'|'sw'|'key'`, `kif: boolean`, `target`, `version`
    - `startedAt, pauses: {from, to}[]`
    - `terminals: Record<serial, {at, failed?: {note, at, by}}>`
    - `endedAt?, workedMs?, pausedMs?`
    - `state: 'running'|'mangler-sap'|'faerdig'`
    - `results?: Record<serial, {material, from, outcome, steps: {from?, to?, bwart?, doc, by, at}[], message?}>`
    - `abandoned?: {by, reason, at}`
  - **`TaskView`** er `{ id, type, kif, target, version, startedAt, paused, pausedMs, workedMs, now, terminals: {serial, at, failed?: {note}}[] }` med nyeste scan først.
  - **Funktioner:**
    - `status(user)` returnerer `{ running: TaskView|null, pending: {id, name, email, endedAt, count}[], isManager, writeEnabled: sap.writeEnabled }`. `pending` er egne opgaver, eller alle for en manager.
    - `start(user, { type, kif, target, version })` returnerer `TaskView`:
      - `type` skal være en af de tre.
      - `normalizeSloc(target)` skal give en værdi.
      - `version` renses (højst 60 tegn) og må ikke være tom. Den tilføjes `versioner` (unik, nyeste først, højst 50).
      - Kører en opgave allerede, kastes `SOFTWARELOAD_RUNNING`.
      - Kører Stempelkort (`timeclock.status(user).running`), kaldes `timeclock.stop(user, {})`, og svaret får `stoppedTimeclock: {taskName, workedMs}`.
    - `scan(user, { serial })` returnerer `{ serial, count }`. `SOFTWARELOAD_INVALID` ved tomt serienummer og `SOFTWARELOAD_DUPLICATE` hvis det allerede er i opgaven.
    - `unscan(user, { serial })`, `markFailed(user, { serial, note })` (note renses til højst 200 tegn og må ikke være tom) og `unmarkFailed(user, { serial })`.
    - `pause(user)`, `resume(user)` og `pauseIfRunning(user)`. Den sidste fejler aldrig og bruges, når Stempelkort startes.
    - `cancel(user)` sletter den kørende opgave uden at gemme.
    - `versions(user)` returnerer `string[]`.
  - Fejlkoder: `SOFTWARELOAD_NOT_RUNNING`, `SOFTWARELOAD_RUNNING`, `SOFTWARELOAD_PAUSED`, `SOFTWARELOAD_NOT_PAUSED`, `SOFTWARELOAD_INVALID`, `SOFTWARELOAD_DUPLICATE`, `MANAGER_ONLY`.

- [x] **Step 1: Skriv de fejlende tests**
  - `'start saves type, KIF, target and version, and remembers the version'`. `start({ type: 'sw+key', kif: true, target: ' d006 ', version: 'v2.1.3' })` giver `target: 'D006'`, og `versions()` giver `['v2.1.3']`.
  - `'start refuses an unknown type, an invalid target and an empty version'`. Det giver tre `SOFTWARELOAD_INVALID`.
  - `'start stops a running Stempelkort task and reports it'`. Den falske timeclock svarer `running`, og `stop` bliver kaldt én gang. `stoppedTimeclock.taskName === 'Pakning'`.
  - `'a second start while one runs is refused'`. Det giver `SOFTWARELOAD_RUNNING`.
  - `'scan normalizes and refuses duplicates'`. `scan(' abc123 ')` giver `ABC123`, og `scan('ABC123')` giver `SOFTWARELOAD_DUPLICATE`.
  - `'a failed terminal needs a note and can be undone'`. Tom note giver `SOFTWARELOAD_INVALID`. Efter `markFailed` har viewet `failed.note`, og efter `unmarkFailed` er den væk.
  - `'pause and resume, and pauseIfRunning never throws'`. `pausedMs` tæller med det falske ur. `pauseIfRunning` uden kørende opgave resolver.
  - `'another person cannot see or change my running task'`. ANNAs `status` viser ikke BOs opgave.
- [x] **Step 2: Kør og se dem fejle.** Kør `node --test electron/warehouse/softwareload/softwareloadService.test.cjs`.
- [x] **Step 3: Implementér livsløbet i `softwareloadService.cjs`.** `mutateAsync` bruges til `aktiv-*`. Læsninger før ændringer bruger `{ skipCache: true }` som `requireRunning` i Stempelkort.
- [x] **Step 4: Kør testene igen.** Forventet: PASS.
- [x] **Step 5: Commit** med `feat(softwareload): opgavens livsløb`.

### Task 5: Afslutning med flytning, genoptagelse og opgivelse

**Files:**
- Modify: `electron/warehouse/softwareload/softwareloadService.cjs`
- Test: `electron/warehouse/softwareload/softwareloadService.test.cjs`

**Interfaces:**
- Consumes:
  - `planMoves` (Task 1), `bisect` (Task 2)
  - `sap.lookup`, `sap.transfer` og `sap.block` (Task 3)
- Produces:
  - **`preview(user)`** returnerer `{ outcomes: Record<serial, Outcome>, transfers, blocks, rows }` for den kørende opgave. Den ændrer intet.
  - **`finish(user, { onProgress })`** returnerer `FinishResult = { taskId, results: Task['results'], counts: Record<Outcome|'failed-sap', number>, state }`.
    1. Stopper tiden.
    2. Flytter opgaven fra `aktiv-*` til `venter-<id>` (state `mangler-sap`).
    3. Kører `execute`.
  - **`continueFinish(user, { taskId, onProgress })`** returnerer `FinishResult`. Kun ejeren eller en manager.
  - **`abandon(user, { taskId, reason })`**. Kun manager. Uflyttede terminaler får outcome `abandoned`, og `abandoned` sættes.
  - **`execute` (intern), i denne rækkefølge:**
    1. `passedD005` er de serienumre i `venter-<id>.results`, hvis `steps` har `to: 'D005'`.
    2. `sap.lookup` på alle opgavens serienumre.
    3. `planMoves`.
    4. For hver transfer, wave 1 før wave 2, delt i bidder af `TRANSFER_CHUNK`: `bisect(serials, s => sap.transfer({ team, serials: s, to }))`.
    5. Hvert `done` skrives straks til `venter-<id>.results[serial].steps` med `{from, to, doc, by: user.email, at}`, før næste kald.
    6. Et serienummer, der fejler i wave 1, er IKKE med i wave 2 og 344. I KIF når det altså aldrig målet uden om D005.
    7. Derefter `bisect` på `blocks` med `sap.block`, og steps får `{bwart: '344', doc, by, at}`.
    8. Fejlede får outcome `failed-sap` og `message`.
    9. Til sidst skrives opgaven til `opgaver-<writer>-<yyyy-mm>` (måneden for `startedAt`) med state `faerdig`. `venter-<id>` slettes, og der tilføjes én `IndexLine` pr. serienummer til `serier-<yyyy-mm>`.
  - **`IndexLine`** er `{ serial, team, kind: 'load', taskId, email, name, at: endedAt, type, version, kif, from, to, docs: string[], outcome, note? }`.
  - Kaster SAP en exception (fx `SAP_NOT_READY`), bliver `venter-<id>` stående. Svaret er fejlen, og `continueFinish` kan tage over.
  - `onProgress({ done, total, step: 'lookup'|'transfer'|'block' })`.

- [x] **Step 1: Skriv de fejlende tests** (falsk `sap` der husker kaldene og kan sættes til at fejle)
  - `'finish in KIF moves via D005 and records every document per serial'`. To terminaler på D000, mål D006. Kaldene er `transfer(to D005)` og derefter `transfer(to D006)`. `results.A.steps.map(s => s.to)` er `['D005', 'D006']`. Indekset har to linjer med `kind: 'load'` og `team: 'TCD'`.
  - `'a failed new terminal ends in blocked stock with its note in the index'`. Kaldet `block({ material: 'M-0', serials: ['A'] })` sker, og indekslinjen har `note`.
  - `'one serial SAP refuses is isolated and the rest still move'`. Den falske transfer fejler, når `C` er med. `results.C.outcome === 'failed-sap'`, og de andre er `to-target`.
  - `'SAP closing mid-finish leaves the task pending and continueFinish never moves a terminal twice'`:
    1. Det første kald i wave 2 kaster `SAP_NOT_READY`.
    2. `status().pending` har opgaven.
    3. Det falske lookup svarer nu D005 for alle.
    4. `continueFinish` laver kun wave 2-kaldet, og ingen serial får to D005-steps.
  - `'the owner can start a new task while one is pending'`.
  - `'only the owner or a manager can continue, only a manager can abandon'`. Det giver `MANAGER_ONLY`.
  - `'abandon marks the unmoved terminals and keeps who and why'`.
  - `'writing disabled: finish is refused before the clock stops'`. Med `sap.writeEnabled = false` kaster `finish` `SOFTWARELOAD_WRITE_DISABLED`, og opgaven kører stadig.
- [x] **Step 2: Kør og se dem fejle.**
- [x] **Step 3: Implementér `preview`, `finish`, `continueFinish`, `abandon` og `execute`.**
- [x] **Step 4: Kør testene igen.** Forventet: PASS.
- [x] **Step 5: Commit** med `feat(softwareload): afslutning med SAP-flytning, genoptagelse og opgivelse`.

### Task 6: Flyt ind i KIF, søgning og opgavelister

**Files:**
- Modify: `electron/warehouse/softwareload/softwareloadService.cjs`
- Test: `electron/warehouse/softwareload/softwareloadService.test.cjs`

**Interfaces:**
- Consumes: `fetcher.fetchMatdoc({ team, document })` fra `sapFetch.cjs` (returnerer `{ document, rows: {serial, ...}[] }`). Den sendes ind som `matdocs` i `createSoftwareloadService`.
- Produces:
  - **`kifPreview(user, { serials?, document? })`** returnerer `{ serials, outcomes, transfers }`.
    - `serials` normaliseres. Med `document` hentes de fra `matdocs`.
    - Planen er `planMoves({ kif: false, target: 'D005', terminals: serials.map(s => ({serial: s, failed: false})), ... })`.
  - **`kifMove(user, { serials, document? })`** returnerer `{ id, results, counts }`. Den kører transfers med `bisect` og gemmer `KifMove = { id, team, email, name, at, document?, results }` i `kif-<yyyy-mm>`. Indekslinjen er `kind: 'kif'`.
  - **`search(user, { serial })`** returnerer `IndexLine[]`, nyeste først. Den læser alle `serier-*` i indekset og dækker begge teams.
  - **`tasks(user, { from, to })`** returnerer `Task[]` med state `faerdig`, hvis `startedAt`-dag ligger i perioden. Medarbejderen får egne, managers alle i teamet. Perioden valideres som `monthsBetween` i Stempelkort (højst 370 dage).

- [x] **Step 1: Skriv de fejlende tests**
  - `'kif move by material document moves to D005 and is found by search from the other team'`. TCD flytter via dokument. `search` som en TRR-bruger finder linjen med `kind: 'kif'` og `team: 'TCD'`.
  - `'kif move skips terminals already on D005'`. Outcome er `skipped`, og der er ingen transfer.
  - `'search returns every event for a serial, newest first, across months'`.
  - `'tasks: an employee gets own tasks, a manager all in the period'`.
- [x] **Step 2: Kør og se dem fejle.**
- [x] **Step 3: Implementér funktionerne.**
- [x] **Step 4: Kør testene igen.** Forventet: PASS.
- [x] **Step 5: Commit** med `feat(softwareload): flyt ind i KIF, søgning og opgavelister`.

### Task 7: IPC, preload og typer

**Files:**
- Modify: `electron/warehouse/register.cjs`
  - Opret servicen: `storeFor: team => openStore(path.join(dataDirOf(team), 'softwareload'))` og `indexStore = openStore(path.join(platformRoot(), SHARED_FOLDER, 'softwareload'))`.
  - Kanaler: `handle('softwareload:…')`.
  - `waitsForSap` får `|^softwareload:(preview|finish|continue|kif-preview|kif-move)$`.
  - `timeclock:start` kalder `softwareload.pauseIfRunning(user)` efter en vellykket start.
- Modify: `electron/preload.cjs` med `electronWarehouse.softwareload = { status, start, scan, unscan, markFailed, unmarkFailed, pause, resume, cancel, versions, preview, finish, continueFinish, abandon, kifPreview, kifMove, search, tasks, onProgress }`.
- Modify: `src/types/warehouse.ts` med typerne `SoftwareloadType`, `SoftwareloadTaskView`, `SoftwareloadOutcome`, `SoftwareloadFinishResult`, `SoftwareloadIndexLine` og `SoftwareloadTask`, plus `window.electronWarehouse.softwareload`.
- Test: `electron/warehouse/register.test.cjs`

**Interfaces:**
- **Kanaler:**
  - `softwareload:status`, `start`, `scan`, `unscan`, `mark-failed`, `unmark-failed`, `pause`, `resume`, `cancel`, `versions`
  - `softwareload:preview`, `finish`, `continue`, `abandon`, `kif-preview`, `kif-move`, `search`, `tasks`
- **Fremskridt:** `emit('softwareload-progress', { email, done, total, step })`, broadcastet som `warehouse:softwareload-progress`. `onProgress(cb)` i preload filtrerer ikke. Visningen viser kun sit eget.

- [x] **Step 1: Skriv den fejlende test** `'softwareload channels are registered and starting Stempelkort pauses a running softwareload task'` i samme stil som de eksisterende kanaltests. Kald `warehouse:softwareload:start` og derefter `warehouse:timeclock:start`, og forvent at `warehouse:softwareload:status` svarer `running.paused === true`.
- [x] **Step 2: Kør og se den fejle.** Kør `node --test electron/warehouse/register.test.cjs`.
- [x] **Step 3: Implementér wiring, preload og typer.**
- [x] **Step 4: Kør testene igen og typetjek.**
  - `node --test electron/warehouse/register.test.cjs`
  - `node node_modules/typescript/bin/tsc --noEmit -p .`

  Forventet: PASS og 0 fejl.
- [x] **Step 5: Commit** med `feat(softwareload): IPC og preload`.

## Fase 4: Brugerflade

### Task 8: Rene hjælpere til visningen

**Files:**
- Create: `src/lib/softwareload.ts`
- Test: `src/lib/softwareload.test.ts`

**Interfaces:**
- Produces:
  - `TYPE_LABELS: Record<SoftwareloadType, {da: string, en: string}>` med teksterne fra Global Constraints.
  - `outcomeLabel(outcome: SoftwareloadOutcome): {da, en}`.
  - `previewGroups(outcomes)` returnerer `{ toTarget: string[], toBlocked: string[], toD002: string[], notFound: string[], blockedStock: string[], skipped: string[], manual: string[], alreadyBlocked: string[] }`.
  - `summarizeTasks(tasks: SoftwareloadTask[])` returnerer `{ key: string, name: string, type: SoftwareloadType, tasks: number, moved: number, failed: number, workedMs: number, perHour: number }[]`, en række pr. person og type.
    - `moved` er serienumre med outcome `to-target`.
    - `failed` er dem med `failed` sat på terminalen.
    - `perHour = moved / (workedMs / 3_600_000)`, afrundet til én decimal, og 0 når `workedMs` er 0.

- [x] **Step 1: Skriv de fejlende tests**
  - `'previewGroups sorts outcomes into the confirmation groups'`.
  - `'summarizeTasks: per person and type, failed counted apart and not in pace'`. To opgaver for Anna, `sw+key`: 30 flyttet og 2 fejlede på 1,5 timer giver `perHour` 20.
  - `'summarizeTasks: zero worked time gives pace 0, not Infinity'`.
- [x] **Step 2: Kør og se dem fejle.** Kør `node node_modules/vitest/vitest.mjs run src/lib/softwareload.test.ts`.
- [x] **Step 3: Implementér hjælperne.**
- [x] **Step 4: Kør testene igen.** Forventet: PASS.
- [x] **Step 5: Commit** med `feat(softwareload): hjælpere til visning og statistik`.

### Task 9: Værktøjet i Arbejdsværktøjer

**Files:**
- Modify:
  - `src/views/warehouse/WarehouseHome.tsx` med typen `WarehouseTool` og et nyt kort `softwareload`. Ikonerne er `Cpu` og `Barcode` fra `@phosphor-icons/react`. Teksten er "Softwareload" og "Start en opgave, scan terminalerne og lad appen flytte dem i SAP. Søg på et serienummer for at se hvem der loadede det." / "Start a task, scan the terminals and let the app move them in SAP. Search a serial number to see who loaded it."
  - `src/views/warehouse/Warehouse.tsx`:
    - Deep link `params.tab === 'softwareload'`.
    - `usesSap` gælder også for `'softwareload'`.
    - Brødkrummen viser "Softwareload".
- Create:
  - `src/views/warehouse/softwareload/Softwareload.tsx`: faner "Min opgave", "Flyt ind i KIF", "Søg serienummer" og "Statistik". Fanen "Venter på SAP" vises, når `status.pending` ikke er tom.
  - `src/views/warehouse/softwareload/SoftwareloadTask.tsx`:
    - Startformular: type, I KIF eller ej, mål og version. Versionen bruger en datalist fra `versions()`. Målet foreslår `TEAMS`-locations for begge teams, men kan skrives frit.
    - Kørende opgave: ur som i `Timeclock.tsx`, scanfelt med autofokus, liste over scannede serienumre, "Fejlet"-knap med note, pause/genoptag og annullér med bekræftelse.
    - Scan vises med det samme og gemmes i baggrunden, samme mønster som scanneren i Optælling.
  - `src/views/warehouse/softwareload/SoftwareloadFinish.tsx`:
    - Kalder `preview` og viser grupperne fra `previewGroups`. Vises `stoppedTimeclock`, får brugeren besked.
    - "Afslut og flyt i SAP" kalder `finish`, viser fremskridt fra `onProgress` og bagefter resultatet pr. serienummer med SAP's besked ved fejl.
    - Når `writeEnabled` er falsk, er knappen deaktiveret med teksten "Softwareload må endnu ikke flytte i dette SAP-system".
  - `src/views/warehouse/softwareload/SoftwareloadKif.tsx`: scan eller indsæt serienumre, eller skriv et materialedokument. Derefter `kifPreview`, en oversigt og "Flyt til D005", som kalder `kifMove`.
  - `src/views/warehouse/softwareload/SoftwareloadSearch.tsx`: et felt og en liste af `IndexLine` med team, hvem, hvornår, type, software, KIF, fra og til, dokumenter, udfald og note.
  - `src/views/warehouse/softwareload/SoftwareloadStats.tsx`: periodevælger (genbrug `periodRange` fra `src/lib/timeclock.ts`), filtre for person, type og version, og en tabel fra `summarizeTasks`. Managers ser alle, medarbejdere sig selv. En liste over opgaver kan foldes ud til serienumrene.
  - `src/views/warehouse/softwareload/SoftwareloadPending.tsx`: venter-opgaver med "Fortsæt i SAP" (`continueFinish`) og, for managers, "Opgiv" med begrundelse (`abandon`).

- [x] **Step 1: Byg visningerne.** Følg stilen i `Timeclock.tsx` og `TimeclockOverview.tsx`: kort, `t()`, spinner på knapper, fejltekst fra IPC-fejlkoden efter `CODE: detalje`.
- [x] **Step 2: Typetjek og kør hele vitest.**
  - `node node_modules/typescript/bin/tsc --noEmit -p .` (forventet: 0 fejl)
  - `node node_modules/vitest/vitest.mjs run` (forventet: ingen nye fejl)
- [x] **Step 3: Manuel test i dev-vinduet** (Vite på 5069 og Electron med `TCD_HUB_USER_DATA_DIR=%APPDATA%\tcd-hub-dev-168`):
  1. Start en opgave.
  2. Scan tre serienumre, en dublet og et med mellemrum.
  3. Marker ét som fejlet.
  4. Pause og genoptag.
  5. Start Stempelkort og se, at Softwareload er sat på pause.
  6. Vis afslutningens oversigt.

  Kør uden at bekræfte flytning.
- [x] **Step 4: Commit** med `feat(softwareload): værktøjet i Arbejdsværktøjer`.

### Task 9b: Faste mål-lokationer med SAP-beskrivelse (Jacobs ønske 20.11)

Jacob: D102–D106 må ikke kunne vælges, og målet skal vise SAP's rigtige lokationsbeskrivelse og om lokationen hører til TCD eller TRR.

Beskrivelser er aflæst i SAP (QS4, MB52 F4-hjælp på Storage Location, plant D301) 20.11.2026:

| Lokation | SAP-beskrivelse | Team |
|---|---|---|
| D000 | Central Warehous | TCD |
| D001 | Raw Terminals | TRR |
| D002 | Repair | TRR |
| D003 | SWAP Inbound | TRR |
| D004 | SWAP Outbound | TCD |
| D005 | SA – secure room | TCD |
| D006 | Forecast Prep | TCD |

**Files:**
- Create: `electron/warehouse/softwareload/core/targets.cjs` med `SOFTWARELOAD_TARGETS` (listen ovenfor, frosset, i den rækkefølge) og `isSoftwareloadTarget(sloc)`
- Modify: `electron/warehouse/softwareload/softwareloadService.cjs`, så `start` afviser et mål uden for listen med `SOFTWARELOAD_INVALID` ('Vælg en lokation fra listen')
- Modify: `src/lib/softwareload.ts` (samme liste til visningen, `targetLabel(sloc)` giver "D002 · Repair (TRR)" og falder tilbage til koden for ukendte), `src/views/warehouse/softwareload/SoftwareloadTask.tsx` (målet er en select med de 7 lokationer, ikke fritekst; `TEAM_SLOCS` bruges ikke længere her)
- Overalt hvor et mål eller fra/til vises (Finish, Søg, Statistik, Venter, KIF): brug `targetLabel`
- Test: `softwareloadService.test.cjs` ('start refuses a target outside the list, e.g. D102'), `src/lib/softwareload.test.ts` ('targetLabel shows SAP description and team')

- [x] Tests først, se dem fejle, implementér, se dem bestå, typecheck og vitest, commit `feat(softwareload): faste mål-lokationer med SAP-beskrivelse`

## Fase 5: Hubert, changelog og oprydning

### Task 10: Guide, coverage og changelog

**Files:**
- Modify:
  - `electron/assistantAppGuideWarehouse.cjs` og `electron/assistantAppGuideWarehouseI18n.cjs`. Opgaverne er "start en softwareload-opgave", "marker en terminal som fejlet", "afslut og flyt i SAP", "flyt ind i KIF", "søg på et serienummer" og "se softwareload-statistik", på fire sprog med bøjede nøgleord for fi og sv. "Hvor kan jeg se ..."-spørgsmål får `direct: true`.
  - `electron/assistantCoverageManifest.cjs`, så hver ny komponent under `views/warehouse/softwareload/` mappes.
  - `src/lib/changelog.ts`, som får 1.6.8-punkter om Softwareload.
- Test:
  - `electron/assistantWarehouseGuide.test.cjs` (eksisterende coverage-test)
  - `electron/assistantCoverageAudit.test.cjs`

- [x] **Step 1: Tilføj guide, manifest og changelog.**
- [x] **Step 2: Kør alle node-tests.** Kør `node --test electron/*.test.cjs electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs electron/warehouse/softwareload/*.test.cjs electron/warehouse/softwareload/core/*.test.cjs`. Forventet: alle PASS. `assistantWorker.test.cjs` kan være ustabil under belastning og køres så alene.
- [x] **Step 3: Commit** med `docs(softwareload): Hubert-guide, coverage og changelog`.

### Task 11: Ryd Stempelkort-designet for softwareload

**Files:**
- Modify: `plans/stempelkort-felter-og-hold-design.md`. Fjern softwareload, terminalkatalog og valglister fra kataloget. Behold felter pr. opgave, fælles opgaver og "Afslut for holdet".

- [x] **Step 1: Ret dokumentet og læs det igennem for rester.**
- [x] **Step 2: Commit** med `docs: Stempelkort-design uden softwareload`.

## Fase 6: QS4 fra ende til anden, derefter PS4

### Task 12: Fuld test i QS4 med Jacob

**Ingen kodeændring.** Sæt `sapSystem` til QS4 i dev-konfigurationen og brug små antal serienumre (højst 3) på INT4100-7883-0 (ONHA på D000). Alt rulles tilbage bagefter.

- [x] **Step 1: KIF-opgave med mål D006.** Brug to OK-terminaler og én fejlet -0. Forventet:
  - de to går D000 til D005 til D006
  - den fejlede går D000 til D005 til D000 og 344
  - dokumentnumrene står i resultatet og i søgningen
- [x] **Step 2: Gruppefejl.** Tilføj et serienummer i blocked stock (efter 344 i Step 1) til en ny opgave. Forventet: outcome `blocked-stock`, og resten flyttes.
- [x] **Step 3: Afbrydelse.** Luk QS4 midt i wave 2. Forventet: opgaven står under "Venter på SAP". Efter login fortsætter "Fortsæt i SAP" uden dobbelte D005-trin.
- [x] **Step 4: Flyt ind i KIF** med et materialedokument fra Step 1.
- [x] **Step 5: Rul tilbage.** Brug 343 og flyt til D000. Bekræft i ZMS_PREP, at alle står på D000 som ONHA uden blocked.
- [x] **Step 6: Jacob godkender flowet.** Ingen PS4 før det.

### Task 13: Slå PS4 til

**Files:**
- Modify: `electron/warehouse/sapBridge.cjs` med `SCRIPT_WRITE_SYSTEMS` `['PS4', 'QS4']` for `sl-transfer` og `sl-block`, og en kommentar med datoen for godkendelsen, som for `WRITE_SYSTEMS`.
- Test: `electron/warehouse/sapBridge.test.cjs`

- [x] **Step 1: Ret testen** fra Task 3 så PS4 nu er tilladt for `sl-transfer`.
- [x] **Step 2: Kør den og se den fejle, ret `SCRIPT_WRITE_SYSTEMS`, og kør igen.** Forventet: PASS.
- [x] **Step 3: Kør den fulde suite** (tsc, node-tests og vitest).
- [x] **Step 4: Commit** med `feat(softwareload): PS4 slået til efter QS4-godkendelse`.
