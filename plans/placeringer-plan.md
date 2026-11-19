# Placeringer (Lagerstyring) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Et nyt værktøj "Placeringer" i Lagerstyring (TCD/TRR) der erstatter placeringsarket: pladser og paller, sæt på plads / tag / fyld pluk-plads op / flyt, søgning og FIFO, import af TCD's ark med SAP-beskrivelser, historik – og Hubert der svarer "hvor henter jeg X?".

**Architecture:** Backend i `electron/warehouse/locations/` efter Optællings mønster: et repository oven på Hubbens `store.cjs` (pr. team i `<team>\lagerstyring\placeringer\`, atomare skrivninger med `withLockedKeys`), rene regler (FIFO, pladsforslag, kapacitet, import-oversættelse) og en service med rettighedstjek, registreret som IPC `warehouse:locations:*` i `register.cjs` med samme `serviceUser`. SAP bruges kun til opslag: MB52 (findes), materialedokumenter (findes) og et nyt read-only MM60-script til beskrivelser. Skærme i `src/views/warehouse/locations/`, nyt felt på Lagerstyring-siden. Huberts svar i `electron/assistantLocations.cjs`, koblet ind ved siden af `assistantWarehouse.cjs`.

**Tech Stack:** Electron 44, React 19, TypeScript, Tailwind 4, node:test (backend), vitest (frontend-helpers), exceljs (læsning af arket), VBScript/SAP GUI Scripting (32-bit cscript), playwright-core (E2E).

**Spec:** `plans/placeringer-design.md`

> **Rettelse (Task 5, 20.10.2026):** `fixedMaterial` er erstattet af `fixedMaterials: string[]`, og `pick` er nøglet `"<placering>|<materiale>"` (`pickKey`), fordi mange PLUK-pladser har flere materialer. `markEmpty`/`refill`/`refillSuggestion` tager `material` (påkrævet når pladsen har flere).

## Global Constraints

- Kun TCD og TRR (`isAllowedTeam`); hver hub har egne data i `<team>\lagerstyring\placeringer\`; andre hubs afvises med `WAREHOUSE_TEAM_NOT_ALLOWED`.
- Én palle = ét materiale. FIFO gælder kun reservepaller; pluk-pladser har intet antal (kun status `full`/`empty`); arbejdsstationer har hverken antal eller status.
- Materialebeskrivelser kommer altid fra SAP (MB52, materialedokument, MM60) – arkets "SAP Description" gemmes aldrig som beskrivelse.
- SAP kun læsning i dette scope; ingen MIGO (delprojekt 3). Placeringsarket ændres aldrig. Optællings læsning af arket (`core/placements.cjs`) røres ikke (delprojekt 4).
- Hubert læser kun; ingen skrivning via Hubert.
- Al tekst på skærmene via `t(da, en)` fra `src/lib/warehouse/text.ts` (`englishCoverage.test.ts` skal forblive grøn); feltet på Lagerstyring-siden på 4 sprog.
- Roller: alle i teamet kan sætte på plads, tage, fylde op, flytte, skifte storage location, rette en palle og søge. Managere (inkl. status managers) og Optællings admins kan oprette/rette/deaktivere placeringer og mærkater og køre importen.
- Alt kan rettes efter import (placeringer, formål, faste materialer, mærkater, paller); hver rettelse gemmes i historikken.
- Kode-navn `locations` (UI: "Placeringer"/"Locations") – `placements` er allerede Optællings egne placeringer.

## Review Focus

- Samme placering skrevet forskelligt ("a2.4 ", "A2.4", "Reol X 1" vs "REOL X  1") skal være samme plads → Task 1 `locationKey` + test.
- To personer tager/fylder op fra samme palle samtidig → den første vinder, den anden får `PALLET_GONE`, intet tælles dobbelt → Task 3 test.
- "Tag X stk." med X ≤ 0, ikke-heltal eller X ≥ pallens antal → afvises, hhv. bliver til "tag hele" → Task 3 test.
- Import efter første registrering, eller import mens SAP ikke er klar → afvises tydeligt (`LOCATIONS_LIVE`, `SAP_NOT_READY`); aldrig stille brug af arkets beskrivelser → Task 5 test.
- Deaktivering af en placering med paller på, eller ændring af formål til pluk-plads mens der står paller → afvises (`LOCATION_NOT_EMPTY`) → Task 4 test.

---

## Fil-struktur

| Fil | Ansvar |
|---|---|
| `electron/warehouse/locations/model.cjs` | Konstanter (formål, typer, nøgler), `locationKey`, `areaFromName`, validering af input |
| `electron/warehouse/locations/repository.cjs` | Læs/skriv pladser, paller, pluk-status, mærkater, meta og historik i teamets store; atomare transaktioner |
| `electron/warehouse/locations/rules.cjs` | Rene funktioner: belægning/kapacitet, FIFO, pladsforslag, påfyldningsforslag, søgning |
| `electron/warehouse/locations/catalog.cjs` | Fælles materialekatalog (SAP-beskrivelser) i `_lagerstyring`; opslag og opdatering |
| `electron/warehouse/locations/sheetImport.cjs` | Læs placeringsarket (exceljs) → rå rækker; oversæt rækker → import-forslag (ren) |
| `electron/warehouse/locations/service.cjs` | Rettigheder, daglige handlinger, opslag, administration, import (preview/apply) |
| `electron/warehouse/locations/outbox.cjs` | Lokal kø af daglige handlinger når M: er nede; afspilles senere |
| `electron/warehouse/sap/mm60.vbs` | Read-only MM60-materialeliste → `MATNR`, `MAKTX` |
| `electron/warehouse/core/sapParsers.cjs` | + `parseMm60(text)` |
| `electron/warehouse/sapFetch.cjs` | + `fetchMaterialTexts({ materials })` |
| `electron/warehouse/sapBridge.cjs`, `sapFixtures.cjs` | `mm60` i tilladt-listen og i fake-SAP |
| `electron/warehouse/register.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts` | IPC `locations:*`, bro `electronWarehouse.locations`, typer |
| `src/views/warehouse/locations/*` | Forside, flows, kort, administration, import |
| `src/views/warehouse/WarehouseHome.tsx`, `Warehouse.tsx` | Nyt felt og værktøj `locations` |
| `electron/assistantLocations.cjs` | Huberts live-svar om Placeringer |
| `electron/assistantAppGuideWarehouse*.cjs` | Guide-opgaver for Placeringer (4 sprog) |
| `scripts/verify-locations.cjs` | E2E (to brugere, midlertidige data, fake SAP) |

## Datamodel (bruges af alle tasks)

```js
// store-nøgler i <team>\lagerstyring\placeringer\
// 'locations' : { [id]: Location }     'pallets' : { [id]: Pallet }     'pick' : { [locationId]: PickStatus }
// 'tags' : string[]     'meta' : { importedAt?, importedFrom?, liveAt? }     'history-YYYY-MM' : Event[] (append)
Location   = { id, name, area, type, purpose /* 'reserve'|'pick'|'station'|'reserved' */, capacity /* int ≥1 */, fixedMaterial /* string|null */, active /* bool */, note, updatedAt, updatedBy }
Pallet     = { id, location /* Location.id */, material, quantity /* int|null */, receivedAt /* ms */, document /* normalizeMatdoc(...)|null */, serials /* string[] */, sloc /* 'D000' … */, tags /* string[] */, note, createdAt, createdBy }
PickStatus = { location, state /* 'full'|'empty' */, at, by }
Event      = { id, at, by: { email, name }, type /* 'putaway'|'take'|'move'|'sloc'|'empty'|'refill'|'edit-pallet'|'location'|'import' */, pallet?, location?, from?, to?, quantity?, material?, changes? }
Person     = { email, name }   // fra serviceUser
```

---

### Task 1: Model og repository

**Files:**
- Create: `electron/warehouse/locations/model.cjs`, `electron/warehouse/locations/repository.cjs`
- Test: `electron/warehouse/locations/repository.test.cjs`

**Interfaces:**
- Produces: `locationKey(name: string): string` (trim, samlede mellemrum, versaler); `areaFromName(name: string): string` (bogstaver før første ciffer/mellemrum, fx `A2.4`→`A`, `E9 H5`→`E`, `Reol X 1`→`REOL`, `Prep1`→`PREP`, `CW3`→`CW`); `PURPOSES = ['reserve','pick','station','reserved']`; `TYPES = ['Palle','Hylde','Reol','Bord','Swap','Gulv']`.
- Produces: `createLocationRepository({ storeFor: team => Store, now, newId })` → `{ read(team): Promise<{ locations, pallets, pick, tags, meta }>, transact(team, fn: (tx) => void): Promise<void>, history(team, { months = 3, location?, pallet?, material? }): Promise<Event[]> }`. `tx` har `locations`, `pallets`, `pick`, `tags`, `meta` (kloner) og `event(e)`; `transact` skriver de ændrede nøgler + appender events til `history-YYYY-MM` under `store.withLockedKeys([...])` (synkront callback; `fn` må kaste `codeError` for at afbryde uden at skrive).

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('locationKey treats case and spaces as the same place', () => {
  assert.equal(locationKey(' a2.4 '), 'A2.4'); assert.equal(locationKey('Reol  X 1'), 'REOL X 1')
})
test('areaFromName finds the area like the sheet, also for prefixes Sheet2 lacks', () => {
  for (const [name, area] of [['A2.4', 'A'], ['E9 H5', 'E'], ['Reol X 1', 'REOL'], ['CW3', 'CW'], ['Prep1', 'PREP'], ['K12', 'K'], ['F1.0', 'F']]) assert.equal(areaFromName(name), area)
})
test('transact writes all changed keys and the events at once; a thrown error writes nothing', async () => {
  // storeFor på tmp-mappe; transact sætter en location + en pallet + event → read() ser begge, history() ser eventet
  // transact der kaster codeError('PALLET_GONE') efter at have ændret tx.pallets → read() uændret, history() uændret
})
test('history is split per month and filtered by location, pallet and material', async () => { /* 2 events i to måneder → history({ months: 3 }) har begge, nyeste først */ })
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/locations/repository.test.cjs` → FAIL (`Cannot find module`).
- [ ] **Step 3: Implementér `model.cjs` og `repository.cjs`** — `transact` læser nøglerne inde i `withLockedKeys`, giver `fn` klonerne og skriver kun nøgler der ændrede sig (`JSON.stringify` sammenligning). Event-id = `newId()`, `at = now()`.
- [ ] **Step 4: Kør testene** — samme kommando → PASS.
- [ ] **Step 5: Commit** — `git add electron/warehouse/locations && git commit -m "Placeringer: model og repository"`

### Task 2: Regler – belægning, FIFO og forslag

**Files:**
- Create: `electron/warehouse/locations/rules.cjs`
- Test: `electron/warehouse/locations/rules.test.cjs`

**Interfaces:**
- Consumes: Location/Pallet/PickStatus (Datamodel).
- Produces (rene funktioner, `state = { locations, pallets, pick }`):
  - `occupancy(state): { [locationId]: { used, capacity, free } }`; `areaSummary(state): { area, capacity, used, free, empty /* pick-pladser løbet tør */ }[]` (kun aktive, formål `reserve`/`pick`).
  - `fifo(state, material, { now }): (Pallet & { ageDays })[]` – kun paller på aktive `reserve`-pladser, ældste `receivedAt` først, dernæst `createdAt`.
  - `suggestSlots(state, material, { limit = 8 }): { location, reason /* 'fixed'|'near'|'free' */ }[]` – ledige aktive `reserve`-pladser: 1) `fixedMaterial === material`, 2) samme område og gang (navn før sidste `.`) som eksisterende paller med materialet, 3) samme område, 4) resten (navn-sorteret, `localeCompare` numeric). Aldrig `reserved`/`pick`/`station`/inaktive/fulde.
  - `pickPlaces(state, material): Location[]`, `stations(state, material): Location[]`.
  - `refillSuggestion(state, pickLocationId, { now }): (Pallet & { ageDays }) | null` = `fifo(state, pick.fixedMaterial)[0]`.
  - `search(state, catalog, query): { materials: string[], locations: string[], pallets: string[] }` – matcher materialenummer (præfiks), beskrivelse (alle ord, ikke-følsom for store/små bogstaver), placeringsnøgle (præfiks), `document` (præfiks af cifre) og serienummer (præcis).

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('fifo gives the oldest reserve pallet first and ignores pick and station places', ...)        // R162-0717: A2.1 (2024-11-07) før A2.4 (2024-11-18); pluk-pladsen H26 er ikke med
test('suggestSlots prefers the fixed place, then the same aisle, then the area, never reserved or full places', ...)  // fixed C1.1 → 'fixed'; C16.x ledig → 'near'; 999-reserveret A17.1 aldrig
test('refillSuggestion for an empty pick place is the oldest reserve pallet of its fixed material', ...)
test('areaSummary counts capacity, used, free and empty pick places per area', ...)
test('search finds by material prefix, description words, location, 49/50 number and serial', ...)  // "ethernet 2m" → R162-0717; "5000032337" → pallen; "a2" → A2.1, A2.4
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/locations/rules.test.cjs` → FAIL.
- [ ] **Step 3: Implementér `rules.cjs`** — `ageDays = Math.floor((now - receivedAt) / 86400000)`.
- [ ] **Step 4: Kør testene** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: regler for FIFO, pladsforslag og søgning"`

### Task 3: Service – daglige handlinger

**Files:**
- Create: `electron/warehouse/locations/service.cjs`
- Test: `electron/warehouse/locations/service.test.cjs`

**Interfaces:**
- Consumes: repository (Task 1), rules (Task 2), `catalog` (Task 6 – i denne task en fake `{ describe(materials): Promise<{[m]: string}>, learn(entries) }`), `fetcher.fetchMatdoc({ team, document })` (findes i `sapFetch.cjs`).
- Produces `createLocationService({ repo, catalog, fetcher, roleOf: user => Promise<'user'|'admin'|'status-manager'|'manager'>, now, newId })` med (alle tager `user = { email, fullName, role, team }` fra `serviceUser`):
  - `overview(user)` → `{ areas: areaSummary, empty: { location, material, description, suggestion }[], counts: { locations, pallets } }`
  - `lookupDocument(user, { document })` → `{ document, materials: { material, description, quantity, serials }[] }` (fra `fetchMatdoc`; `quantity = serials.length`; som regel ét materiale pr. dokument; skærmen laver én palle pr. materiale)
  - `suggest(user, { material })` → `{ slots: suggestSlots(...), pickEmpty: Location|null }`
  - `putAway(user, { pallets: [{ location, material, quantity, document, serials, sloc = 'D000', receivedAt = now, tags, note }] })` → `{ created: Pallet[] }` (flere paller i én transaktion; afviser fuld/reserveret/inaktiv plads med `LOCATION_FULL`/`LOCATION_RESERVED`; lægges en palle på en `pick`-plads, sættes den til `full`)
  - `take(user, { pallet, quantity? })` → `{ pallet: Pallet|null, olderPallet: Pallet|null }` (uden `quantity` eller `quantity >= pallet.quantity` → hele pallen fjernes; `quantity` skal være heltal ≥1 ellers `QUANTITY_INVALID`; pallen væk → `PALLET_GONE`; `olderPallet` = ældre palle med samme materiale, til den milde advarsel – handlingen gennemføres alligevel)
  - `markEmpty(user, { location })`, `refill(user, { location, pallet, quantity? })` (tager fra reservepallen som `take` og sætter pluk-status `full`; `location` skal være `pick` → ellers `NOT_PICK_PLACE`)
  - `move(user, { pallet, to })`, `changeSloc(user, { pallet, sloc })` (`/^[A-Z]\d{3}$/`, ellers `SLOC_INVALID`), `editPallet(user, { pallet, changes: { material?, quantity?, receivedAt?, document?, serials?, tags?, note? } })` (event `edit-pallet` med `changes: { felt: [før, efter] }`)
  - `search(user, { query })`, `materialCard(user, { material })`, `locationCard(user, { location })`, `palletCard(user, { pallet })` – kort inkl. `description` og `history`

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('a whole goods receipt is put away in one go; a pallet on an empty pick place makes it full', ...)
test('take: whole pallet, X pcs, X >= quantity takes all, X <= 0 or 1.5 is QUANTITY_INVALID', ...)
test('two people take the same pallet: the first wins, the second gets PALLET_GONE and nothing is counted twice', ...)  // to service-instanser på samme store, Promise.all
test('taking a younger pallet works but returns the older one for the warning', ...)
test('refill takes from the oldest reserve pallet and sets the pick place full; markEmpty sets it empty', ...)
test('move and changeSloc keep the pallet and write from/to events; bad sloc is SLOC_INVALID', ...)
test('editPallet records every changed field before/after in the history', ...)
test('a full, reserved or inactive place is refused on putAway', ...)
test('the first daily action after an import sets meta.liveAt', ...)
test('another hub is refused and TCD never sees TRR pallets', ...)
test('lookupDocument returns material, description and serials from the material document', ...)  // fake fetcher
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/locations/service.test.cjs` → FAIL.
- [ ] **Step 3: Implementér daglige handlinger i `service.cjs`** — hver handling er én `repo.transact`; tjek pallens eksistens/antal inde i transaktionen (det giver "den første vinder"). Fejl via `codeError(code, dansk detalje)` som resten af `electron/warehouse`. Lærte beskrivelser fra `lookupDocument` sendes til `catalog.learn`. Den første daglige handling (putAway/take/markEmpty/refill/move/changeSloc/editPallet) sætter `meta.liveAt`, hvis den ikke er sat – derefter er importen låst (Task 5).
- [ ] **Step 4: Kør testene** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: service til sæt på plads, tag, fyld op og flyt"`

### Task 4: Service – administration

**Files:**
- Modify: `electron/warehouse/locations/service.cjs`
- Test: `electron/warehouse/locations/admin.test.cjs`

**Interfaces:**
- Produces på servicen: `createLocation(user, { name, area?, type, purpose, capacity = 1, fixedMaterial?, note? })` (`area` default `areaFromName`; navn findes → `LOCATION_EXISTS`), `createSeries(user, { prefix, aisles: [from, to], places: [from, to], type, purpose, capacity })` (fx `prefix 'C'`, `aisles [1,20]`, `places [1,6]` → `C1.1 … C20.6`; maks 500 pr. kald → ellers `SERIES_TOO_LARGE`; eksisterende springes over og returneres i `skipped`), `editLocation(user, { location, changes })`, `setActive(user, { location, active })`, `setTags(user, { tags: string[] })`. Alle kræver manager/status manager/admin (`roleOf`) → ellers `LOCATIONS_MANAGER_ONLY`.

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('only managers, status managers and admins maintain locations', ...)
test('createSeries makes C1.1–C20.6 once, skips existing names and refuses more than 500', ...)
test('a location with pallets cannot be deactivated or turned into a pick place or station (LOCATION_NOT_EMPTY)', ...)
test('editing a location keeps its pallets and is written to the history', ...)
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/locations/admin.test.cjs` → FAIL.
- [ ] **Step 3: Implementér administrationen i `service.cjs`.**
- [ ] **Step 4: Kør testene** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: administration af placeringer og mærkater"`

### Task 5: Import af placeringsarket

**Files:**
- Create: `electron/warehouse/locations/sheetImport.cjs`
- Modify: `electron/warehouse/locations/service.cjs`
- Test: `electron/warehouse/locations/sheetImport.test.cjs`

**Interfaces:**
- Consumes: `findNewestPlacementSheet(dir)` (findes i `core/placements.cjs`), `catalog.describeFromSap(materials, { onProgress })` (Task 6 – fake her).
- Produces: `readSheet(file): Promise<SheetRow[]>` med `SheetRow = { row, name, type, material, sheetDescription, quantity, date, supplier, comment, cellNote }` (fra arket "Data"; formelresultater, `#N/A` → `''`; celle-kommentarer fra kolonne H via exceljs `cell.note`; makroer køres aldrig); `planImport(rows, { sapTexts: {[m]: string}, now }): ImportPlan` med `ImportPlan = { locations: Location[], pallets: Pallet[], pick: PickStatus[], tags: string[], warnings: { row, name, code /* 'AREA_FROM_NAME'|'NOT_IN_SAP'|'DESCRIPTION_DIFFERS'|'UNKNOWN_TYPE' */, detail }[], stats: { locations, pallets, materials, byArea, byPurpose } }`.
- Oversættelsesregler (fra spec afsnit 3): kommentar indeholder `PLUK` i område `I` → `station`; `PLUK` andre steder → `pick` (status `full` hvis antal, ellers `empty`; antal gemmes ikke); `FAST` → `reserve` med `fixedMaterial`; materiale `999-999` → `reserved` med `note = sheetDescription`; materiale + antal → `Pallet` (`receivedAt` = Dato, ellers importdag; `document = normalizeMatdoc(supplier)` ellers `supplier` i note); tomme rækker → ledig `reserve`; flere rækker på samme `locationKey` → én placering med `capacity = max(1, antal rækker)`; kommentarer der matcher en kendt mærkat (`PLUK`, `FAST PLADS`, `SLUSE OPPE`, `SLUSE NEDE`, `BRANDSKAB`, `KASSE`, `RETUR TIL INGENICO BLOCK STOCK`, `RETUR TIL NEWLAND BLOCK STOCK`, `RETUR TIL CASTLES BLOCK STOCK`, `HUSK SERIENR`) → `tags`, resten + `cellNote` → `note`; materiale SAP ikke kender → warning `NOT_IN_SAP` og ingen palle (placeringen oprettes ledig).
- Service: `previewImport(user)` → `{ file, plan: ImportPlan (uden arrays af paller – kun stats + warnings + 50 eksempler) , token }`; `applyImport(user, { token, replace = false })` → `{ locations, pallets }`. Kræver manager/admin; kræver SAP klar (fra `describeFromSap`, ellers `SAP_NOT_READY`); data findes og `replace` er falsk → `LOCATIONS_NOT_EMPTY`; `meta.liveAt` sat (første daglige handling efter import sætter den) → `LOCATIONS_LIVE`. Token udløber efter 30 min (`PREVIEW_EXPIRED`).

- [ ] **Step 1: Skriv de fejlende tests** (arket bygges i testen med exceljs i samme form som det rigtige: ark "Data" med de 12 kolonner, formler med `result`, en celle-kommentar)

```js
test('readSheet reads values, formula results and cell notes, and treats #N/A as empty', ...)
test('planImport turns PLUK in area I into stations, PLUK elsewhere into pick places, FAST into fixed reserve places and 999-999 into reserved', ...)
test('pallets get quantity, date and the 49/50 number; other supplier numbers go to the note', ...)
test('descriptions come from SAP only; a sheet description that differs is a warning, a material SAP does not know is NOT_IN_SAP and no pallet', ...)
test('rows on the same location become one place with that capacity; #N/A areas come from the name with a warning', ...)
test('applyImport refuses without SAP, refuses over existing data unless replace, and refuses after go-live', ...)
test('the real sheet imports without errors', { skip: !process.env.TCD_HUB_PLACEMENT_SHEET }, ...)  // lokal kopi af det rigtige ark (aldrig i git); ~869 placeringer, ingen kast
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/locations/sheetImport.test.cjs` → FAIL.
- [ ] **Step 3: Implementér `readSheet`, `planImport`, `previewImport`, `applyImport`.**
- [ ] **Step 4: Kør testene** → PASS. Kør også mod den rigtige kopi: `TCD_HUB_PLACEMENT_SHEET="<scratchpad>\placeringsark\Placeringsark_20_10_2026_15_38.xlsm" node --test electron/warehouse/locations/sheetImport.test.cjs` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: import af placeringsarket med forhåndsvisning"`

### Task 6: SAP-beskrivelser (katalog, MB52, MM60)

**Files:**
- Create: `electron/warehouse/locations/catalog.cjs`, `electron/warehouse/sap/mm60.vbs`, `electron/warehouse/fixtures/sap/mm60-sample.txt`
- Modify: `electron/warehouse/core/sapParsers.cjs` (`parseMm60`), `electron/warehouse/sapFetch.cjs` (`fetchMaterialTexts`), `electron/warehouse/sapBridge.cjs` (`SCRIPTS.mm60 = 'mm60.vbs'`), `electron/warehouse/sapFixtures.cjs` (`mm60`), `electron/warehouse/register.cjs` (katalog lærer af `fetchPlant` og `fetchMatdoc`)
- Test: `electron/warehouse/locations/catalog.test.cjs`, `electron/warehouse/sapFetch.test.cjs`, `electron/warehouse/core/sapParsers.test.cjs`

**Interfaces:**
- Produces: `parseMm60(text): { material, description }[]` (kolonner `MATNR`/`Material` og `MAKTX`/`Material Description`/`Materialekorttekst`); `fetcher.fetchMaterialTexts({ materials: string[] }): Promise<{ material, description }[]>` (som `fetchLongSerials`: materialer i bidder af 500 på udklipsholderen + `in.txt`, `runScript('mm60', [dir, 'mm60.txt', 'in.txt'])`, `SAP_NOT_READY`/`SAP_NO_ACCESS`/`SAP_EXPORT_FAILED`).
- `mm60.vbs <outDir> <outFile> <inFile>`: egen session, `/nMM60`, materiale-multivalg fra udklipsholderen (som `longserno.vbs`), ingen plant-filter, F8, gem listen som UTF-8 tab-separeret `MATNR`, `MAKTX`, luk egen session; output `{"ok":true,"rows":N}`; kun læsning – ingen andre knapper.
- Produces: `createMaterialCatalog({ sharedStore, fetcher, now })` → `{ describe(materials): Promise<{[m]: string}> /* kun gemte */, learn(entries: { material, description, source /* 'mb52'|'matdoc'|'mm60' */ }[]): Promise<void>, describeFromSap(materials, { onProgress }): Promise<{ texts: {[m]: string}, unknown: string[] }> }`. Nøgle `materialtekster` i `_lagerstyring` (fælles; SAP-tekster er ens for TCD/TRR, ingen teamdata). `describeFromSap`: `fetchPlant()` (MB52) for alt med lager, `fetchMaterialTexts` for resten, `learn` alt, `unknown` = det SAP ikke kendte.

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('parseMm60 reads material and description from the MM60 list in English or Danish column names', ...)
test('fetchMaterialTexts puts the materials on the clipboard in chunks and parses the list', ...)  // fake runScript + clipboard, som longserno-testen
test('describeFromSap uses MB52 first, MM60 for the rest, learns everything and reports unknown numbers', ...)
test('the catalog learns descriptions when Optælling fetches from SAP and when a material document is looked up', ...)
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/locations/catalog.test.cjs electron/warehouse/sapFetch.test.cjs electron/warehouse/core/sapParsers.test.cjs` → FAIL.
- [ ] **Step 3: Implementér parser, fetcher-funktion, script, fixture, tilladt-liste, katalog og læring i `register.cjs`** (indpak `fetcher` så `fetchPlant`/`fetchMatdoc` sender beskrivelser til `catalog.learn` uden at ændre deres svar).
- [ ] **Step 4: Kør testene** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: SAP-beskrivelser via MB52, materialedokumenter og MM60"`

### Task 7: IPC, bro og typer

**Files:**
- Modify: `electron/warehouse/register.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts`
- Test: `electron/warehouse/register.test.cjs`

**Interfaces:**
- Produces IPC `warehouse:locations:<navn>` for hver service-metode i Task 3–5 (kebab-case: `overview`, `lookup-document`, `suggest`, `put-away`, `take`, `mark-empty`, `refill`, `move`, `change-sloc`, `edit-pallet`, `search`, `material-card`, `location-card`, `pallet-card`, `create-location`, `create-series`, `edit-location`, `set-active`, `set-tags`, `preview-import`, `apply-import`) via `handle()` (samme `serviceUser`); data-mappe `path.join(dataDirOf(team), 'placeringer')`. Efter hver skrivende handling `emit('locations:changed', { team })`.
- Produces bro `window.electronWarehouse.locations.<camelCase>(request)` og `onChanged(cb)`; TS-typer `Location`, `Pallet`, `PickStatus`, `LocationEvent`, `LocationsOverview`, `ImportPreview` i `src/types/warehouse.ts` (felter som Datamodel).

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('every Placeringer channel is registered under "warehouse:locations:" and data lands in <team>\\lagerstyring\\placeringer', ...)
test('another hub is refused on the Placeringer channels', ...)
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/register.test.cjs` → FAIL.
- [ ] **Step 3: Registrér kanaler, bro og typer.**
- [ ] **Step 4: Kør testene og `npx tsc -b`** → PASS / exit 0.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: IPC-kanaler, bro og typer"`

### Task 8: Lokal kø når M: er nede

**Files:**
- Create: `electron/warehouse/locations/outbox.cjs`
- Modify: `electron/warehouse/register.cjs` (daglige handlinger går gennem køen)
- Test: `electron/warehouse/locations/outbox.test.cjs`

**Interfaces:**
- Produces: `createOutbox({ dir, run: (action) => Promise<result>, isStorageError: error => boolean, now })` → `{ submit(action: { id, method, user, request }): Promise<{ queued: boolean, result? }>, flush(): Promise<{ done, failed: { action, code }[] }>, pending(): number }`. Kun `putAway`, `take`, `markEmpty`, `refill`, `move`, `changeSloc`, `editPallet` køes; fejler afspilningen med en forretningsfejl (fx `PALLET_GONE`), lægges den i `failed` og sendes som `locations:sync-failed` til skærmen.

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('when M: is down the action is queued locally and replayed in order when it is back', ...)
test('a replayed action that is no longer possible is reported, not retried forever', ...)
test('the same action id is never applied twice', ...)
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/warehouse/locations/outbox.test.cjs` → FAIL.
- [ ] **Step 3: Implementér køen (JSON-fil i `<userData>\warehouse\locations-outbox.json`, flush hvert 30. s og ved start).**
- [ ] **Step 4: Kør testene** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: lokal kø når M: er nede"`

### Task 9: Skærm – felt, forside og søgning

**Files:**
- Modify: `src/views/warehouse/WarehouseHome.tsx` (felt `locations`, ikon `MapPin`), `src/views/warehouse/Warehouse.tsx` (værktøj `locations`, deep link `tab: 'locations'` + `itemId: 'material:X'|'location:Y'|'pallet:Z'`), `src/lib/warehouseLabels.ts` (ingen ændring af flisen)
- Create: `src/views/warehouse/locations/LocationsHome.tsx`, `src/views/warehouse/locations/SearchResults.tsx`, `src/lib/warehouse/locations.ts` (+ `locations.test.ts`)

**Interfaces:**
- Consumes: bro fra Task 7.
- Produces: `LocationsHome({ user, onOpen: (target: LocationsTarget) => void })` – søgefelt (Enter/scanner), fire knapper (Sæt palle på plads, Tag en palle, Fyld pluk-plads op, Find materiale), listen "Løbet tør" med forslag, områdekort (kapacitet/ledige). `LocationsTarget = { kind: 'putaway'|'take'|'refill'|'material'|'location'|'pallet'|'admin', id?: string }`. Helpers i `src/lib/warehouse/locations.ts`: `formatAge(days): string` (`t('701 dage','701 days')`), `materialLabel(material, description): string` (`"R162-0717 · Ethernet Cable RJ45 2m"`).

- [ ] **Step 1: Skriv de fejlende vitest-tests** — `materialLabel` med/uden beskrivelse; `formatAge` 0/1/701 dage på da og en.
- [ ] **Step 2: Kør og se dem fejle** — `npx vitest run src/lib/warehouse/locations.test.ts` → FAIL.
- [ ] **Step 3: Implementér helpers og skærme** (stil som `WarehouseHome`/Optælling; alle tekster `t(da, en)`; opdatér ved `locations.onChanged`).
- [ ] **Step 4: Kør** `npx vitest run src/lib/warehouse` og `npx tsc -b` → PASS (inkl. `englishCoverage.test.ts`).
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: felt, forside og søgning"`

### Task 10: Skærm – sæt på plads, tag, fyld op

**Files:**
- Create: `src/views/warehouse/locations/PutAway.tsx`, `src/views/warehouse/locations/TakePallet.tsx`, `src/views/warehouse/locations/Refill.tsx`

**Interfaces:**
- Consumes: `lookupDocument`, `suggest`, `putAway`, `take`, `markEmpty`, `refill`, `search` (Task 7).
- Produces: **PutAway** – liste af paller der registreres i én omgang; hver række: 49/50-felt (scan → udfyld materiale/antal/serienumre), materiale (autoudfyld med beskrivelse), antal, plads (forslag som knapper: fast/nær/ledig), storage location (default D000), mærkater, note; banner "H26 er løbet tør – sæt pallen direkte der?" når `suggest().pickEmpty`; "Tilføj næste palle"; "Gem alle". **TakePallet** – søg/scan materiale → FIFO-liste (plads, alder, antal); "Tag hele pallen"/"Tag X stk."; ved yngre palle: advarsel med den ældre (`olderPallet`) og "Tag alligevel". **Refill** – listen "Løbet tør" + "Markér løbet tør"; forslag (ældste reservepalle) + "Fyldt op fra A2.4" (helt/delvist).

- [ ] **Step 1: Kør** `npx vitest run src/lib/warehouse/englishCoverage.test.ts` **efter at have tilføjet de tre filer med deres første danske tekster** → FAIL indtil alle tekster går gennem `t()`.
- [ ] **Step 2: Implementér de tre skærme.**
- [ ] **Step 3: Kør** `npx vitest run src/lib/warehouse` og `npx tsc -b` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "Placeringer: sæt på plads, tag og fyld op"`

### Task 11: Skærm – kort, flyt, storage location og ret

**Files:**
- Create: `src/views/warehouse/locations/MaterialCard.tsx`, `LocationCard.tsx`, `PalletCard.tsx`, `HistoryList.tsx`

**Interfaces:**
- Consumes: `materialCard`, `locationCard`, `palletCard`, `move`, `changeSloc`, `editPallet` (Task 7).
- Produces: **MaterialCard** – beskrivelse, arbejdsstation(er), pluk-plads(er) + status, reservepaller ældste først, samlet antal. **LocationCard** – indhold, formål, kapacitet, historik. **PalletCard** – alle felter, historik; knapper **Ret** (dialog, alle felter), **Flyt** (vælg plads med forslag), **Skift storage location** (felt `D000`-format; tekst: "registreres i Hubben – SAP-overførslen (MIGO) kommer senere").

- [ ] **Step 1: Kør** englishCoverage efter de første tekster → FAIL.
- [ ] **Step 2: Implementér kortene og dialogerne.**
- [ ] **Step 3: Kør** `npx vitest run src/lib/warehouse` og `npx tsc -b` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "Placeringer: kort, flyt, storage location og ret"`

### Task 12: Skærm – administration og import

**Files:**
- Create: `src/views/warehouse/locations/Admin.tsx`, `src/views/warehouse/locations/ImportSheet.tsx`

**Interfaces:**
- Consumes: `createLocation`, `createSeries`, `editLocation`, `setActive`, `setTags`, `previewImport`, `applyImport` (Task 7); `useSapStatus` (findes).
- Produces: **Admin** (kun managere/admins; andre ser ikke knappen) – liste over placeringer pr. område med filter; opret én / opret serie (prefix, gange fra–til, pladser fra–til, type, formål, kapacitet, med forhåndsvisning af navnene); ret (navn, type, formål, fast materiale, kapacitet, note); deaktivér; mærkater. **ImportSheet** – kræver SAP klar (SapActionButton), viser forhåndsvisning (stats pr. område/formål, warnings grupperet efter kode med rækkenummer, eksempler), "Importér" / "Erstat alt" (kun før go-live), fremdrift under SAP-opslag.

- [ ] **Step 1: Kør** englishCoverage efter de første tekster → FAIL.
- [ ] **Step 2: Implementér skærmene.**
- [ ] **Step 3: Kør** `npx vitest run src/lib/warehouse` og `npx tsc -b` → PASS.
- [ ] **Step 4: Commit** — `git commit -m "Placeringer: administration og import af placeringsarket"`

### Task 13: Hubert – svar om Placeringer

**Files:**
- Create: `electron/assistantLocations.cjs`, `electron/assistantLocations.test.cjs`
- Modify: `electron/warehouse/register.cjs` (`assistant.answer` spørger først Placeringer, derefter Optælling), `src/lib/assistantBridge.ts` (kilde `kind: 'warehouse'` findes), `electron/assistantAppGuideWarehouse.cjs` + `…I18n.cjs` (opgaver: "Sæt en palle på plads", "Tag en palle (FIFO)", "Fyld en pluk-plads op", "Find et materiale", "Opret placeringer", "Importér placeringsarket" – 4 sprog)

**Interfaces:**
- Consumes: `service.search`, `materialCard`, `locationCard`, `suggest`, `overview`, `palletCard` (Task 3), `serviceUser`.
- Produces: `locationsIntent(question): { intent: 'where'|'refill'|'free'|'contents'|'find-document'|'empty-list', material?, location?, document?, query? } | null` og `createLocationsAssistant({ userFor, service })` → `{ answer({ event, question, language }) }` med samme svarform som `assistantWarehouse.cjs` (`mode: 'data'`, `sources: [{ kind: 'warehouse', … }]`, `navigation: { view: 'warehouse', params: { tab: 'locations', itemId }, label }`). Kræver et Placerings-ord eller et materiale-/placerings-/49/50-token **og** et spørgsmålsord ("hvor", "hvad står", "fylde op", "ledig plads", "løbet tør" / en, fi, sv); hvordan-spørgsmål → `null` (guiden svarer); andre hubs → "kun i TCD- og TRR-hubben"; skrive-ønsker ("tag pallen", "flyt …") → "jeg kan kun læse" + knap.

- [ ] **Step 1: Skriv de fejlende tests**

```js
test('recognises where/refill/free/contents/document/empty questions in four languages and leaves other questions alone', ...)
test('"hvor henter jeg R162-0717?" gives station, pick place with status and reserve pallets oldest first, with descriptions', ...)
test('"hvor henter jeg ethernet kabler?" finds the material by its description', ...)
test('"H26 er tom" suggests the oldest reserve pallet with a button', ...)
test('Hubert never changes anything: write requests get "kun læse" and no service write is called', ...)
test('another hub is told Placeringer is only for TCD and TRR', ...)
test('the guide answers how-to questions about Placeringer in four languages', ...)  // via assistantTrainingBank ask()
```

- [ ] **Step 2: Kør og se dem fejle** — `node --test electron/assistantLocations.test.cjs electron/assistantWarehouseGuide.test.cjs` → FAIL.
- [ ] **Step 3: Implementér `assistantLocations.cjs`, koblingen i `register.cjs` og guide-opgaverne.**
- [ ] **Step 4: Kør testene + alle `electron/assistant*.test.cjs`** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Hubert: svar om Placeringer"`

### Task 14: E2E, verifikation og noter

**Files:**
- Create: `scripts/verify-locations.cjs`
- Modify: `src/lib/changelog.ts` (1.6.5: Placeringer), `plans/development-1.6.5.md`, `plans/placeringer-design.md` (status)

**Interfaces:**
- Consumes: alt ovenfor; mønster og hjælpere fra `scripts/verify-warehouse.cjs` (midlertidig platform, `signIn`, fake SAP via `TCD_HUB_SAP_FIXTURES_DIR`, `TCD_HUB_PLACEMENTS_DIR` med et genereret ark).

- [ ] **Step 1: Skriv E2E-forløbet** – manager importerer det genererede ark (forhåndsvisning → importér); medarbejder sætter to paller på plads via 49/50-nummer (fake MM60/matdoc); markerer pluk-plads løbet tør; fylder op fra ældste palle (FIFO); tager X stk. og en hel palle (advarsel ved yngre); flytter og skifter storage location; Hubert: "hvor henter jeg R162-0717?" → knap åbner materialekortet; PIM ser hverken felt eller data; to brugere tager samme palle → den anden får besked; data ligger kun i `TCD\lagerstyring\placeringer`.
- [ ] **Step 2: Kør** `node scripts/verify-locations.cjs` (Vite på 5064) → `ALLE TJEK OK`.
- [ ] **Step 3: Fuld verifikation** – `node --test electron/*.test.cjs electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs electron/warehouse/locations/*.test.cjs` (fra PowerShell), `npx vitest run`, `npx tsc -b`, `node scripts/verify-warehouse.cjs` → alt grønt.
- [ ] **Step 4: Changelog + noter** (inkl. brugerens live-tjek: import mod rigtig SAP/MM60 og første rigtige varemodtagelse).
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: E2E, changelog og noter"`
