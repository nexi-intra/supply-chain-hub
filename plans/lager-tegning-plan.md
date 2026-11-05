# Tegning af lageret (Placeringer) – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** En Placerings-admin tegner hallen i appen; tegningen ejer de fysiske pladser (navn gemt pr. plads), og en udgivelse opdaterer pladslisten efter godkendelse – uden at nogen palle forsvinder. Senere ser alle kortet og forslag forfra.

**Architecture:** Tegningen er ét dokument pr. hub i placeringer-store (`layout`, `layout-draft`, `layout-versions`). Backend: rene moduler `layout.cjs` (validering, slot → plads) og `publish.cjs` (forskel + udførsel) og en `layoutService.cjs`, der bruger `repository.transact` med de nye nøgler låst sammen med pladser/paller/lager. Renderer: rene hjælpere i `src/lib/warehouse/layout/` (geometri, slots/navne, import af spike-filen, editor-reducer) og tynde React-komponenter i `src/views/warehouse/locations/layout/` (SVG).

**Tech Stack:** Electron 44, React 19, TypeScript, Tailwind 4, node:test (backend), vitest (rene TS-hjælpere, environment node), playwright-core (E2E). Ingen nye biblioteker.

**Spec:** `plans/lager-tegning-design.md` (godkendt 02.11.2026). Brugerens tegning: `plans/lager-tegning-tcd.json`. Spike (adfærdsreference, kopieres ikke): `.superpowers/brainstorm/22024-1793349768/content/tegn-lageret.html`.

**Start med Fase 1.** Fase 2 og 3 detaljeres, når Fase 1 er færdig.

## Global Constraints

- Ingen nye npm-pakker. Tegningen er SVG.
- Tests og E2E kører kun mod midlertidige mapper (`fs.mkdtempSync`), aldrig mod M: (`supply-chan-hub.config` peger på rigtige data).
- Al skærmtekst via `t(da, en)` fra `src/lib/warehouse/text.ts`; `src/lib/warehouse/englishCoverage.test.ts` skal forblive grøn. Nye fejlkoder får tekst i både `MESSAGES` og `MESSAGES_EN` i `src/lib/warehouse/errors.ts`.
- Pladsens id er `locationKey(name)` (`model.cjs`). Sammenligning tegning ↔ liste sker altid på id; en adopteret plads beholder listens stavemåde af navnet (`p1.1` på tegningen ændrer ikke `P1.1`).
- Kun slots, hvis ejer er hubbens team, bliver pladser. Ejer `Andet` bliver aldrig en plads.
- Tegningen ejer: findes, navn, type (Palle/Hylde/Gulv), kapacitet, pluk/reserve. Placeringer ejer: faste materialer, note, `reserved`, `active`, mærkater, paller og lager. Formålene `reserved` og `station` ændres aldrig af tegningen. Særlige pladser (Reol, Bord, Swap, station) beholder type og formål.
- En udgivelse kan ikke fortrydes med Fortryd (`UNDO_NOT_POSSIBLE`); de seneste **20** udgivne versioner gemmes.
- Tegning og udgivelse kræver M: (ingen outbox). Kun Placerings-admins (`locations.requireAdmin`) må se/rette kladden og udgive; alle i hubben må læse den udgivne tegning.
- Navne: højst 30 tegn (som `locationFrom`). Palle-kapacitet fra tegningen: 1–6.
- Git: projektets `.git` peger på en slettet worktree. Der bruges et **skygge-repo** uden for mappen: sæt `$env:GIT_DIR='C:\Supply Chain Tools\.hub-shadow.git'` (core.worktree er sat), og commit med `git add <filer>; git commit -m "<besked>"`. `[x]` i planen sættes af controlleren, når en task er godkendt.
- Ingen Node på PC'en. Kommandoer (PowerShell, fra app-roden; start med `1 | Out-Null;` pga. terminal-fejl):
  - node:test: `$env:ELECTRON_RUN_AS_NODE='1'; Start-Process .\node_modules\electron\dist\electron.exe -ArgumentList '--test','<fil>' -NoNewWindow -Wait -RedirectStandardOutput "$env:TEMP\t.txt" -RedirectStandardError "$env:TEMP\te.txt"; Get-Content "$env:TEMP\t.txt","$env:TEMP\te.txt" -Tail 40; Remove-Item Env:ELECTRON_RUN_AS_NODE`
  - vitest: samme, med `-ArgumentList 'node_modules/vitest/vitest.mjs','run','<sti>'`
  - typecheck: samme, med `-ArgumentList 'node_modules/typescript/bin/tsc','-b'`
  - Dev-vindue: se `/memories/repo/supply-chain-hub.md` (Vite på 5066 via Electron som node, derefter `ELECTRON_START_URL`).

## Review Focus

- To slots får samme navn (skrevet to gange eller en kopieret reol) → udgivelse blokeres med begge navne (`NAME_TWICE`); editoren markerer dubletter → Task 4 + Task 11.
- En reol gøres mindre (færre fag/niveauer), hvor der står paller → den fjernede plads blokerer (`NOT_EMPTY`), intet skrives → Task 4 + Task 6.
- To admins: én udgiver, mens den andens kladde bygger på en ældre version → `LAYOUT_STALE`; to der redigerer samtidig → `LAYOUT_DRAFT_BUSY` medmindre "Overtag" → Task 6.
- Omdøbning til et navn, der allerede er en anden plads i listen → `NAME_TAKEN`, aldrig sammenlægning; men en kæde/ombytning (A→B, B→A) virker, og pallerne følger rigtigt → Task 4 + Task 5.
- Stavemåde/mellemrum (`p1.1` vs `P1.1`, `Reol  X 1`) adopterer den eksisterende plads og beholder listens navn → Task 4.

---

## Fil-struktur

| Fil | Ansvar |
|---|---|
| `electron/warehouse/locations/model.cjs` | `palletLimit`: Palle med kapacitet > 1 |
| `electron/warehouse/locations/layout.cjs` (ny) | Tegningens dokument: konstanter, `normalizeLayout`, `placesOf` |
| `electron/warehouse/locations/publish.cjs` (ny) | `planPublish` (forskel) og `applyPublish` (udførsel på en transaktion) |
| `electron/warehouse/locations/repository.cjs` | Tegningens nøgler: `readLayout`, `writeDraft`, `transact(..., { withLayout })`; undo nægter `layout` |
| `electron/warehouse/locations/layoutService.cjs` (ny) | Rettigheder, kladde, forhåndsvisning, udgiv, versioner |
| `electron/warehouse/locations/service.cjs` | Værn efter udgivelse; `list()` får `drawing`; log nægter fortryd af `layout` |
| `electron/warehouse/register.cjs`, `electron/preload.cjs` | IPC `locations:layout-*` og bro |
| `src/types/warehouse.ts` | Layout-typer + bro-metoder |
| `src/lib/warehouse/errors.ts`, `src/lib/warehouse/locations.ts` | Fejltekster; `describeEvent('layout')`; `palletLimitOf`; target `layout` |
| `src/lib/warehouse/layout/geometry.ts` (ny) | Ruder, form, rotation, etiketboks |
| `src/lib/warehouse/layout/slots.ts` (ny) | Fag/niveau-nummerering, `regenerateSlots`, `proposeNames`, `slotLabel`, `duplicateNames` |
| `src/lib/warehouse/layout/fromSpike.ts` (ny) | Spike-fil → `LayoutDraft` |
| `src/lib/warehouse/layout/editor.ts` (ny) | Editorens tilstand som reducer (fortryd, kopiér/indsæt, rotér, felter, slots) |
| `src/views/warehouse/locations/layout/LayoutEditor.tsx` (ny) | Skærmen: værktøjslinje, autogem af kladde, overtag, import/eksport |
| `src/views/warehouse/locations/layout/LayoutCanvas.tsx` (ny) | SVG-tegning af hallen (genbruges read-only i Fase 2) |
| `src/views/warehouse/locations/layout/ItemPanel.tsx` (ny) | Egenskaber for den valgte ting |
| `src/views/warehouse/locations/layout/RackFront.tsx` (ny) | Reolen forfra: slots, navne, mønstre (genbruges i Fase 2/3) |
| `src/views/warehouse/locations/layout/PublishPanel.tsx` (ny) | Afstemning og udgiv |
| `src/views/warehouse/locations/Locations.tsx`, `Admin.tsx` | Target `layout`; knap "Tegning af lageret"; skrivebeskyttelse efter udgivelse |
| `scripts/verify-layout.cjs` (ny) | E2E mod midlertidige data |

## Datamodel (bruges af alle tasks)

```ts
type LayoutItemType = 'rack' | 'floorrow' | 'shelfrack' | 'floor' | 'special' | 'dock' | 'station' | 'receiving' | 'gate' | 'pc' | 'office' | 'text'
type LayoutSlotKind = 'pallet' | 'shelf' | 'floor' | 'special' | 'pick-unnamed' | 'aisle' | 'blocked'
type LayoutOwner = 'TCD' | 'TRR' | 'Andet'
// rack: pos (fysisk fag fra start, 1..bays) + level (rum nedefra). Udtræk: unit (1..count) + shelf (1 = øverst).
// shelfrack: section + shelf (1 = øverst). floorrow: pos. floor/special: ingen position.
// manual: navnet er rettet i hånden og overskrives ikke af mønstre, medmindre sloten vælges eksplicit.
interface LayoutSlot { id: string; name: string; kind: LayoutSlotKind; purpose: 'reserve' | 'pick'; capacity?: number; manual?: boolean; pos?: number; level?: number; unit?: number; shelf?: number; section?: number }
interface LayoutPull { count: number; firstNo: number; shelves: number; perUnit?: Record<number, number>; owner?: LayoutOwner }
interface LayoutItem {
  id: string; type: LayoutItemType; x: number; y: number; w: number; h: number
  rot?: { cx: number; cy: number; x: number; y: number }; cut?: [number, number][]
  name: string; note: string; owner?: LayoutOwner; floor?: 'ground' | 'mezz'; visual?: boolean
  bays?: number; levels?: number; firstNo?: number; firstBay?: 'start' | 'end'; bayLevels?: Record<number, number>; aisles?: number[]; spacers?: number[]; pull?: LayoutPull
  count?: number; depth?: number; depthFlip?: boolean
  sections?: number; shelves?: number; perSection?: Record<number, number>
  pattern?: string; levelPatterns?: Record<number, string>
  slots: LayoutSlot[]
}
interface WarehouseLayout { version: number; hall: { w: number; h: number }; notes: string; items: LayoutItem[]; publishedAt?: number; publishedBy?: PersonRef }
interface LayoutDraft extends WarehouseLayout { basedOn: number; editedBy: PersonRef; editedAt: number; decisions: { outside: string[]; remove: string[] } }
// Backend: en slot, der bliver en plads i hubben.
PlaceSpec = { slotId, itemId, name, id /* locationKey(name) */, type /* 'Palle'|'Hylde'|'Gulv'|null(særlig) */, purpose /* 'reserve'|'pick'|null */, capacity /* Palle 1–6, Hylde 1, Gulv 0, særlig null */ }
type PublishBlockCode = 'NAME_TWICE' | 'NAME_TAKEN' | 'NOT_EMPTY' | 'TYPE_REFUSED' | 'SPECIAL_UNKNOWN'
PublishPlan = {
  basedOn, version /* den udgivne version nu (0 = ingen) */,
  create: { slotId, name, type, purpose, capacity }[], rename: { slotId, from, to, pallets, stock }[],
  change: { slotId, name, changes: { [field]: [before, after] } }[], remove: { name, pallets, stock }[],
  outside: { name, type, purpose, pallets, stock }[], blocked: { code, name, detail }[],
  linked: string[] /* id'er der er på tegningen efter udgivelsen */,
  counts: { create, rename, change, remove, outside, blocked, unchanged },
}
// Store-nøgler (placeringer-store): 'layout' : WarehouseLayout   'layout-draft' : LayoutDraft   'layout-versions' : WarehouseLayout[] (nyeste først, højst 20)
// meta.layout = { version, linked: string[] } sættes ved udgivelse (meta læses i alle transaktioner).
// Event ved udgivelse: { type: 'layout', by, changes: { version: [før, efter] }, counts, detail: { created: string[], renamed: [string, string][], removed: string[], changed: string[] } }
```

---

# Fase 1 – Tegning, afstemning og første udgivelse (kun admins)

> **Tjek-trin i Task 12–15** udføres med playwright mod `scripts/verify-layout.cjs`-opsætningen (midlertidige data, Vite på `http://127.0.0.1:5066`): implementeren klikker forløbet igennem, gemmer screenshots i scriptets `evidence`-mappe og nævner stierne i sin rapport. Faste assertions lægges i scriptet i Task 16.

### Task 1: Palle med plads til flere paller

**Files:**
- Modify: `electron/warehouse/locations/model.cjs` (`palletLimit`)
- Modify: `src/lib/warehouse/locations.ts` (`palletLimitOf`)
- Test: `electron/warehouse/locations/rules.test.cjs`, `electron/warehouse/locations/admin.test.cjs`, `src/lib/warehouse/locations.test.ts`

**Interfaces:**
- Produces: `palletLimit(location)` / `palletLimitOf(location)`: Palle → `capacity > 1 ? capacity : 1` (alt andet uændret). `S0` fra tegningen får kapacitet 2.

- [x] **Step 1: Skriv de fejlende tests**

```js
// rules.test.cjs
test('a Palle with capacity 2 holds two pallets (S0 ovenpå)', () => {
  assert.equal(palletLimit({ type: 'Palle', purpose: 'reserve', capacity: 2 }), 2)
  assert.equal(palletLimit({ type: 'Palle', purpose: 'reserve', capacity: 1 }), 1)
  assert.equal(palletLimit({ type: 'Palle', purpose: 'reserve' }), 1)
})
```
```ts
// locations.test.ts
it('palletLimitOf mirrors palletLimit for a Palle with capacity 2', () => {
  expect(palletLimitOf({ type: 'Palle', purpose: 'reserve', capacity: 2 })).toBe(2)
  expect(palletLimitOf({ type: 'Palle', purpose: 'reserve', capacity: 1 })).toBe(1)
})
```
I `admin.test.cjs`: seed `S0` (`type: 'Palle', capacity: 2`) direkte med `repo.transact`; to `putAway` lykkes, den tredje afvises med `{ code: 'LOCATION_FULL' }`.

- [x] **Step 2: Kør – forvent FAIL** (`rules.test.cjs`, `admin.test.cjs`, vitest `src/lib/warehouse/locations.test.ts`)
- [x] **Step 3: Implementér** de to funktioner.
- [x] **Step 4: Kør – forvent PASS**, også hele `electron/warehouse/locations/*.test.cjs`.
- [x] **Step 5: Sæt [x]**

### Task 2: Tegningens dokument (`layout.cjs`)

**Files:**
- Create: `electron/warehouse/locations/layout.cjs`
- Test: `electron/warehouse/locations/layout.test.cjs`

**Interfaces:**
- Produces:
  - `ITEM_TYPES`, `SLOT_KINDS`, `OWNERS = ['TCD','TRR','Andet']`, `PLACE_KINDS = ['pallet','shelf','floor','special']`
  - `normalizeLayout(raw) → WarehouseLayout` (kaster `LAYOUT_INVALID` med dansk detalje). Udfylder: `owner 'TCD'`, `floor 'ground'`, `slot.purpose 'reserve'`, `pallet capacity 1`, `notes ''`; navne trimmes og mellemrum samles. Bevarer ukendte editor-felter, hvis de er JSON-værdier, og på slots `manual` (boolean) og positionsfelterne.
  - `normalizeDraft(raw) → LayoutDraft` (= normalizeLayout + `basedOn` heltal ≥ 0 + `decisions` med to string-lister).
  - `slotOwner(item, slot) → LayoutOwner` (udtræksslot: `item.pull.owner ?? 'TCD'`, ellers `item.owner ?? 'TCD'`).
  - `placesOf(layout, team) → PlaceSpec[]` (springer `visual`-ting over; kun `PLACE_KINDS` med navn og `slotOwner === team`).
- Grænser i `normalizeLayout`: hall 10–300; højst 500 ting, 400 slots pr. ting, 5000 slots i alt; slot-id unikt i hele dokumentet; navn ≤ 30 tegn og påkrævet for `PLACE_KINDS`; ting inden for hallen; JSON ≤ 2 MB.

- [x] **Step 1: Skriv de fejlende tests**

```js
test('normalizeLayout keeps a valid drawing and fills the defaults', () => {
  const out = normalizeLayout({ version: 0, hall: { w: 59, h: 68 }, items: [{ id: 'r1', type: 'rack', x: 1, y: 1, w: 4, h: 1, name: 'A', bays: 2, levels: 1, slots: [
    { id: 's1', name: ' A1.1 ', kind: 'pallet', pos: 1, level: 1 }, { id: 's2', name: 'Reol  X 1', kind: 'shelf', pos: 2, level: 1 }] }] })
  assert.equal(out.items[0].owner, 'TCD'); assert.equal(out.items[0].floor, 'ground'); assert.equal(out.notes, '')
  assert.deepEqual(out.items[0].slots.map(s => [s.name, s.purpose, s.capacity]), [['A1.1', 'reserve', 1], ['Reol X 1', 'reserve', undefined]])
  assert.equal(out.items[0].bays, 2, 'editor fields are kept')
})
test('normalizeLayout refuses what cannot be a drawing', () => {
  for (const bad of [unknownType, slotIdTwice, nameOf31Chars, palletWithoutName, itemOutsideHall, capacity7]) assert.throws(() => normalizeLayout(bad), { code: 'LAYOUT_INVALID' })
})
test('placesOf gives the places of one hub, never visual things, aisles or other teams', () => {
  // rack A (TCD): pallet 'A1.1', pallet/pick 'A1.2', aisle 'A2.1', blocked, pick-unnamed;
  // rack E (TRR) with pull { owner: 'TCD' }: shelf 'E0 H1' (unit 1, shelf 1) and its own pallet 'E1.1';
  // floorrow S (floor 'mezz'): pallet 'S0' capacity 2; floor 'A.Gulv'; special 'I1'; shelfrack visual with a shelf slot 'Papir1'
  const tcd = placesOf(layout, 'TCD')
  assert.deepEqual(tcd.map(p => [p.name, p.type, p.purpose, p.capacity]), [
    ['A1.1', 'Palle', 'reserve', 1], ['A1.2', 'Palle', 'pick', 1], ['E0 H1', 'Hylde', 'reserve', 1],
    ['S0', 'Palle', 'reserve', 2], ['A.Gulv', 'Gulv', 'reserve', 0], ['I1', null, null, null]])
  assert.deepEqual(placesOf(layout, 'TRR').map(p => p.name), ['E1.1'])
  assert.equal(tcd[0].id, 'A1.1')
})
```
- [x] **Step 2: Kør – forvent FAIL** ("Cannot find module './layout.cjs'")
- [x] **Step 3: Implementér** `layout.cjs` (codeError som i `service.cjs`).
- [x] **Step 4: Kør – forvent PASS**
- [x] **Step 5: Sæt [x]**

### Task 3: Repository – tegningens nøgler

**Files:**
- Modify: `electron/warehouse/locations/repository.cjs`, `electron/warehouse/locations/model.cjs` (`LAYOUT_KEYS`)
- Test: `electron/warehouse/locations/repository.test.cjs`

**Interfaces:**
- Produces:
  - `LAYOUT_KEYS = { layout: 'layout', draft: 'layout-draft', versions: 'layout-versions' }` (model.cjs)
  - `repo.readLayout(team) → { layout: WarehouseLayout|null, draft: LayoutDraft|null, versions: WarehouseLayout[] }` (skipCache)
  - `repo.writeDraft(team, fn: (current: LayoutDraft|null) => LayoutDraft|null) → LayoutDraft|null` – låser kun `layout-draft`; `null` sletter nøglen (`locked.delete`).
  - `repo.transact(team, { withLayout: true, snapshot: false, actionId? }, fn)` – låser også de tre layout-nøgler; `tx.layout`, `tx.layoutVersions` (default `[]`), `tx.draft` er tilgængelige; ændrede skrives, `tx.draft === null` sletter kladden. Uden `withLayout` læses de ikke.
  - `repo.undo` kaster `UNDO_NOT_POSSIBLE` for en handling med en `layout`-hændelse.

- [x] **Step 1: Skriv de fejlende tests**

```js
test('readLayout is empty before anything is drawn', async () => assert.deepEqual(await repo.readLayout('TCD'), { layout: null, draft: null, versions: [] }))
test('writeDraft keeps the draft apart from the places', async () => {
  await repo.writeDraft('TCD', () => draft)
  assert.deepEqual((await repo.readLayout('TCD')).draft, draft)
  assert.equal((await repo.read('TCD')).meta.changedAt, undefined)
  await repo.writeDraft('TCD', () => null)
  assert.equal((await repo.readLayout('TCD')).draft, null)
})
test('transact withLayout writes the drawing, its versions and clears the draft in one go', async () => {
  await repo.writeDraft('TCD', () => draft)
  await repo.transact('TCD', { withLayout: true, snapshot: false }, tx => { tx.layout = { ...layout, version: 1 }; tx.layoutVersions = []; tx.draft = null; tx.event({ type: 'layout', by: MONA_REF }) })
  const after = await repo.readLayout('TCD')
  assert.equal(after.layout.version, 1); assert.equal(after.draft, null)
  assert.ok((await repo.read('TCD')).meta.changedAt)
})
test('a drawing publish cannot be undone', async () => {
  const [event] = await repo.history('TCD', { type: 'layout' })
  await assert.rejects(repo.undo('TCD', { eventId: event.id, by: MONA_REF }), { code: 'UNDO_NOT_POSSIBLE' })
})
test('transact without withLayout has no layout on tx', async () => repo.transact('TCD', tx => assert.equal(tx.layout, undefined)))
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** (udvid `keys` i `withLockedKeys`, `readLocked`/`writeState` for layout-nøglerne kun når `withLayout`; tilføj `'layout'` ved siden af `'import'` i undo-tjekket).
- [x] **Step 4: Kør – forvent PASS** (hele `repository.test.cjs` og `undo.test.cjs`)
- [x] **Step 5: Sæt [x]**

### Task 4: Udgivelsesplan (`planPublish`)

**Files:**
- Create: `electron/warehouse/locations/publish.cjs`
- Test: `electron/warehouse/locations/publish.test.cjs`

**Interfaces:**
- Consumes: `placesOf`, `slotOwner` (Task 2); `locationKey`, `isShelf` (model.cjs).
- Produces: `planPublish({ next: LayoutDraft, previous: WarehouseLayout|null, state: { locations, pallets, stock }, team }) → PublishPlan`.

Algoritme (testene bestemmer ikke rækkefølgen):
1. `nextPlaces = placesOf(next, team)`, `prevBySlot = map slotId → PlaceSpec` fra `placesOf(previous, team)`.
2. Samme id to gange i `nextPlaces` → `NAME_TWICE` (detalje: begge stavemåder).
3. For hver `p` i `nextPlaces`: hvis `prevBySlot[p.slotId]` findes med andet id, og den gamle plads findes i `state` → **rename**. Ellers hvis `state.locations[p.id]` findes → **adopt** (særlig: kun adopt; ellers `SPECIAL_UNKNOWN`). Ellers → **create** (særlig → `SPECIAL_UNKNOWN`).
4. Rename-mål: `NAME_TAKEN`, hvis `state.locations[to]` findes og ikke selv omdøbes væk eller fjernes i samme plan.
5. Adopt/rename → **change** for tegningens felter: `type` (ikke for særlige), `capacity` kun når typen er `Palle`, `purpose` kun når listens formål er `reserve` eller `pick`. Navnets stavemåde ændres aldrig ved adopt; ved rename bliver navnet tegningens.
6. Typeskift: til lagerhylde (`Hylde`+`reserve`) med paller, eller fra lagerhylde med lagerlinjer → `TYPE_REFUSED` (samme regler som `editLocation`).
7. Slots i `previous`, men ikke i `next`, hvis plads findes → **remove**; med paller/lager → `NOT_EMPTY`.
8. Pladser i `state`, der hverken er linket eller fjernes: i `next.decisions.remove` → **remove** (med indhold → `NOT_EMPTY`); ellers **outside**.
9. `linked` = id'erne efter udgivelsen for alle `nextPlaces`, sorteret med `localeCompare(…, 'da', { numeric: true })`; `counts.unchanged` = adopt uden ændringer.

- [x] **Step 1: Skriv de fejlende tests** (hjælpere: `L(name, type='Palle', purpose='reserve', extra)`, `pallet(id, location)`, `line(location, material)`, `rackWith(slots, extra)`, `draftOf(items, decisions)`)

```js
test('first publish adopts by name, keeps the list spelling, creates the rest and leaves the others outside', () => {
  const plan = planPublish({ next: draftOf([rackWith([P('s1', 'p1.1'), SH('s2', 'H1', 'pick'), P('s3', 'A1.6')])]), previous: null, state: stateOf([L('P1.1'), L('H1', 'Hylde', 'pick'), L('K1.1', 'Hylde')]), team: 'TCD' })
  assert.deepEqual(plan.create.map(c => c.name), ['A1.6'])
  assert.deepEqual([plan.rename.length, plan.change.length, plan.blocked.length], [0, 0, 0])
  assert.deepEqual(plan.outside.map(o => o.name), ['K1.1'])
  assert.equal(plan.counts.unchanged, 2)
  assert.deepEqual(plan.linked.sort(), ['A1.6', 'H1', 'P1.1'])
})
test('a slot keeps its place when renamed: the pallets go along', () => {
  const plan = planPublish({ previous: layoutOf([rackWith([P('s1', 'A1.1')])]), next: draftOf([rackWith([P('s1', 'A1.9')])]), state: stateOf([L('A1.1')], [pallet('p1', 'A1.1')]), team: 'TCD' })
  assert.deepEqual(plan.rename, [{ slotId: 's1', from: 'A1.1', to: 'A1.9', pallets: 1, stock: 0 }])
})
test('the drawing changes type, capacity and pick/reserve – never reserved, station or special places', () => {
  // S0 Palle cap 1 → slot capacity 2; P1.1 reserved ← slot pallet reserve; I1 Bord/station ← special slot; H1 Hylde/pick ← shelf reserve
  assert.deepEqual(plan.change.map(c => [c.name, c.changes]), [['S0', { capacity: [1, 2] }], ['H1', { purpose: ['pick', 'reserve'] }]])
})
test('blocks: name twice, name taken, not empty, refused type, unknown special place', () => {
  assert.deepEqual(plan.blocked.map(b => [b.code, b.name]).sort(), [['NAME_TAKEN', 'B1.1'], ['NAME_TWICE', 'A1.1'], ['NOT_EMPTY', 'C1.1'], ['SPECIAL_UNKNOWN', 'I99'], ['TYPE_REFUSED', 'D1.1']])
})
test('a chain or swap of names is fine', () => {
  // previous s1 A1.1, s2 A1.2 → next s1 A1.2, s2 A1.1, both with pallets
  assert.deepEqual([plan.rename.length, plan.blocked.length], [2, 0])
})
test('decisions: an empty place can be removed, one with goods is blocked', () => {
  assert.deepEqual(plan.remove.map(r => r.name), ['K1.1']); assert.ok(!plan.outside.some(o => o.name === 'K1.1'))
  assert.deepEqual(blockedWithGoods.blocked.map(b => b.code), ['NOT_EMPTY'])
})
test('slots of another team never become places here', () => assert.equal(planPublish({ next: draftOf([rackWith([P('d1', 'D1.1')], { owner: 'TRR' })]), previous: null, state: stateOf([]), team: 'TCD' }).create.length, 0))
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** `planPublish`.
- [x] **Step 4: Kør – forvent PASS**
- [x] **Step 5: Sæt [x]**

### Task 5: Udfør udgivelsen (`applyPublish`)

**Files:**
- Modify: `electron/warehouse/locations/publish.cjs`
- Test: `electron/warehouse/locations/publish.test.cjs`

**Interfaces:**
- Consumes: `PublishPlan` (Task 4); `stockId` (shelves.cjs); `areaFromName`, `shelfOf` (model.cjs).
- Produces: `applyPublish(tx, plan, { at, by }) → { linked: string[] }` – ændrer `tx.locations`, `tx.pallets`, `tx.stock`; kaster `LAYOUT_BLOCKED`, hvis `plan.blocked.length`. Skriver **ikke** layout-nøglerne og ingen event (det gør servicen).

Rækkefølge (bindende, ruling T4): (1) slet `remove` – id'erne fra tilstanden før omdøbningerne (en plads kan blive omdøbt oven på et navn, der fjernes i samme plan); (2) alle omdøbninger i to trin – tag alle omdøbte pladser ud, indsæt dem under nye id'er (navn = tegningens; Hylde får `rack`/`shelf` fra `shelfOf`), flyt paller (`pallet.location`) og lagerlinjer (ny nøgle `stockId(nyId, materiale)`) via én map gammelt→nyt; (3) opret `create` som `{ id, name, area: areaFromName(name), type, purpose, capacity, fixedMaterials: [], ...shelfOf(name) for Hylde, active: true, note: '', updatedAt: at, updatedBy: by }`; (4) anvend `change`.

- [x] **Step 1: Skriv de fejlende tests**

```js
test('applyPublish renames with pallets and stock, deletes, creates and changes in one go', () => {
  applyPublish(tx, plan, { at: 1000, by: MONA_REF })
  assert.ok(!tx.locations['A1.1']); assert.equal(tx.locations['A1.9'].name, 'A1.9'); assert.equal(tx.pallets.p1.location, 'A1.9')
  assert.deepEqual(Object.keys(tx.stock), ['H9|R1']); assert.equal(tx.stock['H9|R1'].location, 'H9')
  assert.deepEqual(pick(tx.locations['A1.6'], ['type', 'purpose', 'capacity', 'area', 'fixedMaterials', 'active']), { type: 'Palle', purpose: 'reserve', capacity: 1, area: 'A', fixedMaterials: [], active: true })
  assert.deepEqual([tx.locations['E9 H1'].rack, tx.locations['E9 H1'].shelf], ['E9', 1])
  assert.ok(!tx.locations['K1.1']); assert.equal(tx.locations.S0.capacity, 2)
})
test('a swap of two names keeps each pallet on its physical place', () => {
  applyPublish(tx, swapPlan, { at: 1000, by: MONA_REF })
  assert.deepEqual([tx.pallets.p1.location, tx.pallets.p2.location], ['A1.2', 'A1.1'])
})
test('applyPublish refuses a blocked plan', () => assert.throws(() => applyPublish(tx, { ...plan, blocked: [{ code: 'NAME_TWICE', name: 'A1.1', detail: '' }] }, { at: 1, by: MONA_REF }), { code: 'LAYOUT_BLOCKED' }))
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** `applyPublish`.
- [x] **Step 4: Kør – forvent PASS**
- [x] **Step 5: Sæt [x]**

### Task 6: Tegningens service (`layoutService.cjs`)

**Files:**
- Create: `electron/warehouse/locations/layoutService.cjs`
- Test: `electron/warehouse/locations/layoutService.test.cjs` (setup som `admin.test.cjs`: midlertidig store, `ANNA` bruger, `MONA` manager, `ADA` Placerings-admin)

**Interfaces:**
- Consumes: `repo` (Task 3), `normalizeDraft` (Task 2), `planPublish`/`applyPublish` (Task 4–5), `locations.requireAdmin(user) → team`, `locations.teamOf(user)`.
- Produces `createLayoutService({ repo, locations, now = Date.now }) →`
  - `layout(user) → { layout: WarehouseLayout|null }` (alle i hubben)
  - `draft(user) → { draft: LayoutDraft|null, version: number }` (admin)
  - `startDraft(user) → { draft }` – findes der en kladde, returneres den; ellers kopi af den udgivne (eller tom: hall 59×68) med `basedOn = version`, `decisions: { outside: [], remove: [] }`.
  - `saveDraft(user, { draft, takeOver = false }) → { editedAt }` – `LAYOUT_DRAFT_BUSY` ("<navn> redigerer tegningen") hvis en anden står som `editedBy` og ikke `takeOver`; `basedOn` bevares fra den gemte kladde.
  - `discardDraft(user) → { ok: true }`
  - `previewPublish(user) → PublishPlan` (`LAYOUT_NO_DRAFT` uden kladde)
  - `publish(user) → { version, counts }` – i `repo.transact(team, { withLayout: true, snapshot: false }, ...)`: `LAYOUT_NO_DRAFT`; `LAYOUT_STALE` hvis `draft.basedOn !== (tx.layout?.version ?? 0)`; plan på `tx`'s tilstand; `LAYOUT_BLOCKED` (detalje: de første 3 navne); `applyPublish`; `tx.layoutVersions = [tx.layout, ...tx.layoutVersions].slice(0, 20)` når der var en; `tx.layout` = kladden uden `basedOn/editedBy/editedAt/decisions`, `version + 1`, `publishedAt`, `publishedBy`; `tx.draft = null`; `tx.meta.layout = { version, linked }`; én event `type: 'layout'` (se Datamodel).
  - `versions(user) → { versions: { version, publishedAt, publishedBy }[] }`
  - `openVersion(user, { version, takeOver = false }) → { draft }` – den version som kladde, `basedOn` = nuværende version.

- [x] **Step 1: Skriv de fejlende tests**

```js
test('only admins see and change the draft; everyone in the hub reads the published drawing', async () => {
  await assert.rejects(layouts.draft(ANNA), { code: 'LOCATIONS_MANAGER_ONLY' })
  assert.deepEqual(await layouts.layout(ANNA), { layout: null })
})
test('one draft at a time: another admin must take over', async () => {
  const { draft } = await layouts.startDraft(MONA); assert.equal(draft.basedOn, 0)
  await assert.rejects(layouts.saveDraft(ADA, { draft }), err => err.code === 'LAYOUT_DRAFT_BUSY' && /Mona/.test(err.message))
  await layouts.saveDraft(ADA, { draft, takeOver: true })
  assert.equal((await layouts.draft(MONA)).draft.editedBy.email, 'ada@x.test')
})
test('publish writes places and drawing together, keeps 20 versions and clears the draft', async () => {
  // A1.1 med palle; kladde omdøber slot s1 til A1.9
  const result = await layouts.publish(MONA)
  assert.deepEqual([result.version, result.counts.rename], [1, 1])
  assert.equal((await locations.locationCard(ANNA, { location: 'A1.9' })).pallets.length, 1)
  assert.equal((await layouts.draft(MONA)).draft, null)
  assert.deepEqual((await repo.read('TCD')).meta.layout, { version: 1, linked: ['A1.9'] })
  for (let i = 0; i < 21; i++) { await layouts.startDraft(MONA); await layouts.publish(MONA) }
  assert.equal((await layouts.versions(MONA)).versions.length, 20)
})
test('a draft based on an older drawing is refused', async () => {
  await repo.writeDraft('TCD', current => ({ ...current, basedOn: 0 }))   // efter én udgivelse
  await assert.rejects(layouts.publish(MONA), { code: 'LAYOUT_STALE' })
})
test('a blocked plan writes nothing', async () => {
  // kladde med to slots 'A1.1'
  await assert.rejects(layouts.publish(MONA), { code: 'LAYOUT_BLOCKED' })
  assert.equal((await layouts.layout(ANNA)).layout, null); assert.deepEqual(Object.keys((await repo.read('TCD')).locations), ['A1.1'])
})
test('openVersion puts an old drawing back as a draft on top of the current one', async () => {
  const { draft } = await layouts.openVersion(MONA, { version: 1 })
  assert.equal(draft.basedOn, 2)
})
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** `layoutService.cjs`.
- [x] **Step 4: Kør – forvent PASS**
- [x] **Step 5: Sæt [x]**

### Task 7: Værn i Placeringer efter udgivelse

**Files:**
- Modify: `electron/warehouse/locations/service.cjs` (`editLocation`, `createLocation`, `createSeries`, `createRack`, `addShelf`, `deleteLocations`, `previewImport`, `applyImport`, `list`, `log`)
- Test: `electron/warehouse/locations/admin.test.cjs`

**Interfaces:**
- Consumes: `tx.meta.layout` / `state.meta.layout` (Task 6).
- Produces:
  - Når `meta.layout` findes: `createLocation`/`createSeries`/`createRack`/`addShelf`/`previewImport`/`applyImport` → `LAYOUT_OWNS_PLACES`.
  - `editLocation` på en linket plads: ændring af `name`, `type`, `capacity` eller `purpose` mellem `reserve`/`pick` → `LOCATION_ON_DRAWING`; `note`, `fixedMaterials`, `purpose` til/fra `reserved` er tilladt; en linket pluk-plads må gemmes uden faste materialer (`emptyPick`).
  - `deleteLocations`: linkede pladser lægges i `kept` med grunden "`<navn>` er på tegningen – fjern den på tegningen".
  - `list(user)` får `drawing: { version, linked } | null`.
  - `log`: `type === 'layout'` → `{ canUndo: false, reason: 'Kan ikke fortrydes' }`.

- [x] **Step 1: Skriv de fejlende tests** (hjælper `publishDrawing(names)` via `createLayoutService`)

```js
test('after the first publish places are made on the drawing, not in the list', async () => {
  await publishDrawing([P('s1', 'A1.1'), SH('s2', 'H1', 'pick')])
  for (const call of [() => service.createLocation(MONA, { name: 'A9.9', type: 'Palle', purpose: 'reserve' }), () => service.createSeries(MONA, { prefix: 'C', aisles: [1, 1], places: [1, 1], type: 'Palle', purpose: 'reserve' }), () => service.createRack(MONA, { name: 'Z', shelves: 1 }), () => service.applyImport(MONA, { token: 'x' })])
    await assert.rejects(call(), { code: 'LAYOUT_OWNS_PLACES' })
})
test('a place on the drawing keeps its physical fields; the rest can still be changed', async () => {
  await assert.rejects(service.editLocation(MONA, { location: 'A1.1', changes: { name: 'A1.2' } }), { code: 'LOCATION_ON_DRAWING' })
  await assert.rejects(service.editLocation(MONA, { location: 'A1.1', changes: { purpose: 'pick', fixedMaterials: ['R1'] } }), { code: 'LOCATION_ON_DRAWING' })
  assert.equal((await service.editLocation(MONA, { location: 'A1.1', changes: { purpose: 'reserved', note: 'Brandskab' } })).location.purpose, 'reserved')
  assert.equal((await service.editLocation(MONA, { location: 'H1', changes: { note: 'mangler materiale' } })).location.note, 'mangler materiale')
  assert.match((await service.deleteLocations(MONA, { locations: ['A1.1'] })).kept[0].reason, /tegningen/)
  assert.deepEqual((await service.list(MONA)).drawing, { version: 1, linked: ['A1.1', 'H1'] })
})
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** værnene.
- [x] **Step 4: Kør – forvent PASS** (hele `electron/warehouse/locations/*.test.cjs`)
- [x] **Step 5: Sæt [x]**

### Task 8: IPC, bro, typer, fejltekster og log-tekst

**Files:**
- Modify: `electron/warehouse/register.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts`, `src/lib/warehouse/errors.ts`, `src/lib/warehouse/locations.ts`, `src/views/warehouse/locations/LocationsLog.tsx` (filtervalg "Tegning")
- Test: `src/lib/warehouse/locations.test.ts`, `src/lib/warehouse/errors.test.ts` (eksisterende paritet)

**Interfaces:**
- Produces:
  - register.cjs: `const layouts = createLayoutService({ repo: <samme repo som locations>, locations })` (træk repo ud i en variabel). Læsninger: `locations:layout` → `layout`, `locations:layout-draft` → `draft`, `locations:layout-preview` → `previewPublish`, `locations:layout-versions` → `versions`. Skrivninger (ingen outbox, `emit('locations:changed')` kun efter `publish`): `layout-start-draft`, `layout-save-draft`, `layout-discard-draft`, `layout-publish`, `layout-open-version`.
  - preload.cjs `locations`: `layout()`, `layoutDraft()`, `layoutPreview()`, `layoutVersions()`, `startLayoutDraft()`, `saveLayoutDraft(request)`, `discardLayoutDraft()`, `publishLayout()`, `openLayoutVersion(request)`.
  - TS: typerne fra "Datamodel" + `PublishPlan`, `LocationList.drawing`, `LocationEventType` + `'layout'`, `LocationEvent.counts?`/`detail?`, metoderne i `LocationsBridge`.
  - `LocationsTarget` + `{ kind: 'layout' }`; `targetFromItem('layout')` → `{ kind: 'layout' }`.
  - errors.ts (DA/EN): `LAYOUT_INVALID`, `LAYOUT_NO_DRAFT`, `LAYOUT_DRAFT_BUSY`, `LAYOUT_STALE` ("Tegningen er udgivet af en anden imens – hent den nye og ret igen"), `LAYOUT_BLOCKED`, `LAYOUT_OWNS_PLACES` ("Pladser oprettes nu på tegningen"), `LOCATION_ON_DRAWING` ("Ret navn, type og kapacitet på tegningen").
  - `describeEvent` for `'layout'`: `t(\`Tegningen udgivet (version ${v}): ${c.create} nye, ${c.rename} omdøbt, ${c.remove} nedlagt\`, \`Drawing published (version ${v}): ${c.create} new, ${c.rename} renamed, ${c.remove} removed\`)`.

- [x] **Step 1: Skriv den fejlende test**

```ts
it('describes a drawing publish', () => {
  expect(describeEvent({ id: 'e', at: 1, by: { email: 'm', name: 'M' }, type: 'layout', changes: { version: [0, 1] }, counts: { create: 12, rename: 3, change: 0, remove: 2 } } as LocationEvent))
    .toBe('Tegningen udgivet (version 1): 12 nye, 3 omdøbt, 2 nedlagt')
})
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** alle filer.
- [x] **Step 4: Kør** vitest `src/lib/warehouse` (PASS, inkl. englishCoverage og errors), node:test for `electron/warehouse/*.test.cjs` (PASS) og typecheck (ingen fejl).
- [x] **Step 5: Sæt [x]**

### Task 9: Rene hjælpere – geometri og slots

**Files:**
- Create: `src/lib/warehouse/layout/geometry.ts`, `src/lib/warehouse/layout/slots.ts`
- Test: `src/lib/warehouse/layout/geometry.test.ts`, `src/lib/warehouse/layout/slots.test.ts`

**Interfaces:**
- Consumes: typerne fra Task 8.
- Produces:
  - geometry.ts: `cellsOf(item) → [number, number][]`, `setCells(item, cells) → LayoutItem`, `toggleCell(item, cell: {x,y}, add: boolean) → LayoutItem` (mindst én rude tilbage), `rotateItem(item, hall) → LayoutItem` (som spikens `rotateSelected`: genbruger `rot`-centrum når tingen ikke er flyttet, drejer `cut`, holder sig i hallen), `labelBox(item) → { x, y, w, h }` (største hele rektangel), `clampToHall(item, hall) → LayoutItem`. Alle returnerer nye objekter.
  - slots.ts:
    - `bayNo(item, pos)`, `bayPos(item, no)`, `levelsOf(item, pos)`, `isSpacer(item, pos)`, `pullNo(item, unit)`, `shelvesOfUnit(item, unit)` – samme formler som spiken (`firstNo` default 1 for reoler, `firstBay 'end'` vender).
    - `slotKey(slot) → string` (`b{pos}-l{level}`, `u{unit}-h{shelf}`, `s{section}-h{shelf}`, `p{pos}`, `one`).
    - `regenerateSlots(item, newId: () => string) → LayoutSlot[]` – alle positioner for tingens nuværende mål; eksisterende slots bevares på `slotKey` (id, navn, kind, purpose, capacity); nye får foreslået navn og default-kind (rack niveau 1 i en køregang → `aisle`, ellers `pallet`; udtræk/hylder → `shelf`; floorrow → `pallet` med `capacity = depth`; floor → `floor`; special → `special`); `visual` og ting uden pladser → `[]`.
    - `proposeNames(item, { slotIds?: string[] }) → LayoutItem` – springer slots med `manual: true` over, medmindre de er nævnt i `slotIds`; navne ud fra `item.levelPatterns[level] ?? item.pattern ?? default` med pladsholdere `{reol}` (item.name), `{fag}`, `{n}` (tæller nedefra: pallet, shelf og aisle tæller; pick-unnamed og blocked springes over), `{niveau}`, `{udtræk}`, `{hylde}`, `{nr}` (løbenummer). Defaults: rack `{reol}{fag}.{n}`, udtræk `{reol}{udtræk} H{hylde}`, shelfrack `{reol}{nr}`, floorrow `{reol}{nr}`, floor/special `{reol}`. Kun de valgte slots, når `slotIds` er givet. Aisle/blocked/pick-unnamed får navnet `''`.
    - `slotLabel(item, slot) → string` – navnet, eller `Pluk under {reol}{fag}` / `Køregang` / `Ingen plads`.
    - `duplicateNames(layout, team) → Set<string>` – id'er brugt af flere plads-slots (til markering i editoren).

- [x] **Step 1: Skriv de fejlende tests**

```ts
it('names count from the floor; an aisle keeps its number and pick without name is skipped', () => {
  const rack = { ...base, name: 'A', bays: 11, levels: 3, firstNo: 1, aisles: [10], slots: [] }
  const named = proposeNames({ ...rack, slots: regenerateSlots(rack, ids()) }, {})
  expect(names(named, 10)).toEqual({ 1: '', 2: 'A10.2', 3: 'A10.3' })            // køregang i niveau 1
  // P22: niveau 1 'pick-unnamed' → 'Pluk under P22', niveau 2 hedder P22.1
  expect(slotLabel(p22, slotAt(p22, 22, 1))).toBe('Pluk under P22'); expect(slotAt(p22, 22, 2).name).toBe('P22.1')
})
it('levelPatterns name S31 GULV and S31 on the two levels', () => {
  const s = proposeNames({ ...rackS, levelPatterns: { 1: '{reol}{fag} GULV', 2: '{reol}{fag}' } }, {})
  expect([slotAt(s, 31, 1).name, slotAt(s, 31, 2).name]).toEqual(['S31 GULV', 'S31'])
})
it('regenerateSlots keeps id and a hand-typed name when the rack grows, and drops removed positions', () => {
  const grown = regenerateSlots({ ...rack, levels: 4, slots: rack.slots.map(s => s.id === 'keep' ? { ...s, name: 'K1.GULV' } : s) }, ids())
  expect(grown.find(s => s.id === 'keep')!.name).toBe('K1.GULV'); expect(grown.length).toBe(rack.bays! * 4)
  expect(regenerateSlots({ ...rack, bays: 1 }, ids()).every(s => s.pos === 1)).toBe(true)
})
it('pull-outs are named E9 H1 with H1 at the top, floorrow S0 holds depth pallets, a visual shelf rack has no slots', () => {
  const withSlots = (item: LayoutItem) => proposeNames({ ...item, slots: regenerateSlots(item, ids()) }, {})
  const e = withSlots({ ...rackBase, name: 'E', bays: 20, levels: 2, pull: { count: 28, firstNo: 0, shelves: 5, owner: 'TCD' } })
  expect(e.slots.filter(s => s.unit === 10).map(s => [s.shelf, s.name])).toEqual([[1, 'E9 H1'], [2, 'E9 H2'], [3, 'E9 H3'], [4, 'E9 H4'], [5, 'E9 H5']])
  const s = withSlots({ ...floorrowBase, name: 'S', count: 8, depth: 2, firstNo: 0 })
  expect(s.slots.slice(0, 2).map(x => [x.name, x.capacity])).toEqual([['S0', 2], ['S1', 2]])
  expect(withSlots({ ...shelfBase, visual: true, shelves: 5 }).slots).toEqual([])
})
it('rotateItem turns back exactly after a turn clamped at the wall, and turns the cut cells', () => {
  const hall = { w: 20, h: 20 }
  const once = rotateItem({ ...base, x: 18, y: 5, w: 2, h: 6, cut: [[0, 0]] }, hall)
  expect([once.x, once.y, once.w, once.h]).toEqual([14, 7, 6, 2]); expect(once.cut).toEqual([[5, 0]])
  const twice = rotateItem(once, hall)
  expect([twice.x, twice.y, twice.w, twice.h]).toEqual([18, 5, 2, 6]); expect(twice.cut).toEqual([[1, 5]])
})
it('duplicateNames finds A1.1 used twice regardless of spelling', () => expect([...duplicateNames(twoA11, 'TCD')]).toEqual(['A1.1']))
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** (port spikens formler; ingen DOM).
- [x] **Step 4: Kør – forvent PASS**
- [x] **Step 5: Sæt [x]**

### Task 10: Import af spike-tegningen (`fromSpike`)

**Files:**
- Create: `src/lib/warehouse/layout/fromSpike.ts`
- Test: `src/lib/warehouse/layout/fromSpike.test.ts` (læser `plans/lager-tegning-tcd.json` med `node:fs`)

**Interfaces:**
- Consumes: `regenerateSlots`, `proposeNames`, `bayNo` (Task 9).
- Produces: `fromSpike(raw: unknown, newId: () => string) → Omit<LayoutDraft, 'editedBy' | 'editedAt'>` (`version 0`, `basedOn 0`, tomme `decisions`). Oversættelse: spikens `level` → `floor`; rack `slots['pos-level']`: `pallet`→pallet/reserve, `pick-named`→pallet/pick, `pick`→pick-unnamed, `shelf`→shelf, `blocked`→blocked; `aisles` → aisle i niveau 1; navne efter spikens regel (= default-mønstret); `pull.on` → `pull` (uden `on`); floorrow → én slot pr. position, navn `{reol}{nr}`, `capacity = depth`; shelfrack uden `visual` → `sections: 1`, `shelves` som i filen, navne `{reol}{nr}`; spikens `pick` (område) → `floor` med `purpose 'pick'`; `inside`/`above` droppes. Kaster `LAYOUT_INVALID` for noget, der ikke er en spike-fil.

- [x] **Step 1: Skriv den fejlende test**

```ts
it('reads the TCD drawing', () => {
  const draft = fromSpike(JSON.parse(readFileSync('plans/lager-tegning-tcd.json', 'utf8')), ids())
  const all = draft.items.flatMap(i => i.slots.map(s => ({ item: i, s })))
  const byName = (n: string) => all.find(x => x.s.name === n)!
  expect(byName('A10.2').s.kind).toBe('pallet'); expect(all.find(x => x.item.name === 'A' && x.s.pos === 10 && x.s.level === 1)!.s.kind).toBe('aisle')
  expect([byName('S0').s.capacity, byName('S0').item.floor]).toEqual([2, 'mezz'])
  expect(byName('E0 H1').s.kind).toBe('shelf'); expect(byName('E0 H1').item.owner).toBe('TRR'); expect(byName('E0 H1').item.pull!.owner).toBe('TCD')
  expect(draft.items.filter(i => i.visual).every(i => i.slots.length === 0)).toBe(true)
  expect(draft.items.find(i => i.name === 'H' && i.type === 'shelfrack')!.slots.map(s => s.name).slice(0, 2)).toEqual(['H1', 'H2'])
  expect(draft.hall).toEqual({ w: 59, h: 68 })
})
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** `fromSpike`.
- [x] **Step 4: Kør – forvent PASS**
- [x] **Step 5: Sæt [x]**

### Task 11: Editorens tilstand (`editor.ts`)

**Files:**
- Create: `src/lib/warehouse/layout/editor.ts`
- Test: `src/lib/warehouse/layout/editor.test.ts`

**Interfaces:**
- Consumes: Task 9.
- Produces:
  - `type EditorState = { draft: LayoutDraft; selected: string | null; undo: string[]; clipboard: LayoutItem | null; dirty: boolean }`
  - `initEditor(draft) → EditorState`
  - `editorReducer(state, action) → EditorState` med handlingerne: `add {itemType, x, y, w, h}` (standardmål/navn som spiken; næste ledige bogstav for reoler; slots via `regenerateSlots` + `proposeNames`), `select {id|null}`, `move {id, x, y}`, `resize {id, w, h}`, `rotate {id}`, `remove {id}`, `copy {id}`, `paste {x, y}` (**nye id'er til ting og alle slots**), `set {id, patch}` (genberegner slots når mål/fag/niveauer/udtræk/hylder ændres; nye positioner får navne), `cycleSlot {itemId, slotId}` (pallet → pallet/pick → pick-unnamed → shelf → blocked → pallet; omdøber efterfølgende slots i faget efter mønstret, medmindre de er håndrettet), `renameSlot {itemId, slotId, name}`, `renameSlots {itemId, slotIds, pattern}`, `toggleCell {id, x, y, add}`, `setHall {w, h}`, `decide {name, as: 'outside' | 'remove' | null}`, `undo`.
  - Hver handling, der ændrer `draft`, lægger den forrige `JSON.stringify(draft)` på `undo` (højst 200) og sætter `dirty = true`; `select`/`copy` gør ikke.
  - `renameSlot` og `renameSlots` sætter `manual: true` på de rettede slots.

- [x] **Step 1: Skriv de fejlende tests**

```ts
it('paste gives the copy new ids for the item and every slot', () => {
  let s = initEditor(draftWith([rackA]))
  s = editorReducer(s, { type: 'copy', id: rackA.id }); s = editorReducer(s, { type: 'paste', x: 0, y: 10 })
  const [a, b] = s.draft.items
  expect(b.id).not.toBe(a.id); expect(b.slots.some(x => a.slots.some(y => y.id === x.id))).toBe(false)
  expect([...duplicateNames(s.draft, 'TCD')]).toContain('A1.1')
})
it('undo goes back one change; select does not count', () => {
  let s = editorReducer(initEditor(draftWith([])), { type: 'add', itemType: 'rack', x: 1, y: 1, w: 10, h: 1 })
  const id = s.draft.items[0].id
  s = editorReducer(editorReducer(s, { type: 'select', id }), { type: 'move', id, x: 5, y: 5 })
  s = editorReducer(s, { type: 'undo' }); expect([s.draft.items[0].x, s.draft.items[0].y]).toEqual([1, 1])
  s = editorReducer(s, { type: 'undo' }); expect(s.draft.items).toEqual([])
})
it('cycling P22 level 1 to pick without name renames P22.2 to P22.1, but keeps a hand-typed name', () => {
  // reol P, fag 22, 3 niveauer: P22.1, P22.2, P22.3 (slots l1, l2, l3)
  let s = editorReducer(start, { type: 'renameSlot', itemId, slotId: l3, name: 'P22 TOP' })
  s = editorReducer(editorReducer(s, { type: 'cycleSlot', itemId, slotId: l1 }), { type: 'cycleSlot', itemId, slotId: l1 })
  expect(bay22(s).map(x => x.name)).toEqual(['', 'P22.1', 'P22 TOP'])
  expect(slotLabel(itemOf(s), bay22(s)[0])).toBe('Pluk under P22')
})
it('shrinking a rack drops the slots of the removed bays', () => {
  const s = editorReducer(start22, { type: 'set', id: itemId, patch: { bays: 20 } })
  expect(itemOf(s).slots.every(x => (x.pos ?? 0) <= 20)).toBe(true)
})
it('decide marks a list place as outside or to remove, and null clears it', () => {
  let s = editorReducer(start, { type: 'decide', name: 'K1.1', as: 'outside' }); expect(s.draft.decisions).toEqual({ outside: ['K1.1'], remove: [] })
  s = editorReducer(s, { type: 'decide', name: 'K1.1', as: 'remove' }); expect(s.draft.decisions).toEqual({ outside: [], remove: ['K1.1'] })
  s = editorReducer(s, { type: 'decide', name: 'K1.1', as: null }); expect(s.draft.decisions).toEqual({ outside: [], remove: [] })
})
```
- [x] **Step 2: Kør – forvent FAIL**
- [x] **Step 3: Implementér** reduceren.
- [x] **Step 4: Kør – forvent PASS**
- [x] **Step 5: Sæt [x]**

### Task 12: Editor-skærmen (`LayoutEditor`, `LayoutCanvas`, `ItemPanel`)

**Files:**
- Create: `src/views/warehouse/locations/layout/LayoutEditor.tsx`, `LayoutCanvas.tsx`, `ItemPanel.tsx`
- Create: `scripts/verify-layout.cjs` – kun opsætningen fra `scripts/verify-locations.cjs` (midlertidig platform med manager `chef@example.test` og medarbejder `anna@example.test`, ingen M:) og flaget `--open`, der logger manageren ind og lader vinduet stå åbent til manuelle tjek. Assertions kommer i Task 16.
- Modify: `src/views/warehouse/locations/Locations.tsx` (target `layout` → `<LayoutEditor user={user} onDone={toHome} />`, kun når `canAdmin`), `src/views/warehouse/locations/Admin.tsx` (knap "Tegning af lageret" → `onOpen({ kind: 'layout' })`)

**Interfaces:**
- Consumes: bro-metoderne (Task 8), `editorReducer` (Task 11), `geometry.ts`/`slots.ts` (Task 9), `fromSpike` (Task 10).
- Produces:
  - `LayoutCanvas({ layout, selected?, highlight?: string[], duplicates?: Set<string>, floorView: 'all'|'ground'|'mezz', zoom: number, readOnly?: boolean, onPointer?(event: { kind: 'down'|'move'|'up'; x: number; y: number; itemId?: string; handle?: 'resize' }) })` – ren SVG (1 enhed = 1 rude), tegner ting som spiken (`drawRack`, `drawFloorRow`, former, etiketter, ejer-skravering for TRR, "kun visuelt" grå stiplet, "OVENPÅ" stiplet). Bruges read-only i Fase 2.
  - `ItemPanel({ item, dispatch })` – felterne fra spikens `TYPES[*].fields` + navnemønster + "Navngiv igen"; hyldereol: `sections`, `shelves`, `perSection`, "Kun visuelt"; særlig plads: navn.
  - `LayoutEditor({ user, onDone })`: henter `layoutDraft()`; uden kladde `startLayoutDraft()`; autogemmer `saveLayoutDraft({ draft })` 3 s efter sidste ændring og ved Escape/forlad; `LAYOUT_DRAFT_BUSY` → dialog "X redigerer tegningen – overtag?" (`takeOver: true`); værktøjslinje: værktøjer, Fortryd (Ctrl+Z), Kopiér/Indsæt (Ctrl+C/V ved musens rude), Rotér (R), Slet (Delete), Form, Vis etage, Zoom, "Hent tegning fra fil" (`<input type="file">` → `fromSpike` eller en tidligere eksport), "Gem som fil" (download af kladden), "Kassér kladde", "Tidligere versioner" (`layoutVersions()` → vælg → `openLayoutVersion({ version })` efter bekræftelse), "Udgiv …" (åbner `PublishPanel`, Task 14). Status "Kladde gemt hh:mm".

- [x] **Step 1: Implementér** komponenterne (logik ligger i Task 9–11; komponenterne må ikke have egen tilstandslogik ud over UI-tilstand som værktøj/zoom/hover).
- [x] **Step 2: Kør typecheck** – ingen fejl; vitest `src/lib/warehouse` – PASS (englishCoverage).
- [x] **Step 3: Tjek med `scripts/verify-layout.cjs --open`** (midlertidige data, aldrig M:): hent `plans/lager-tegning-tcd.json`, flyt/rotér/kopiér en reol, Fortryd, genindlæs → kladden er der stadig.
- [x] **Step 4: Sæt [x]**

### Task 13: Reolen forfra (`RackFront`)

**Files:**
- Create: `src/views/warehouse/locations/layout/RackFront.tsx`
- Modify: `ItemPanel.tsx` (viser `RackFront` for rack, shelfrack, floorrow)

**Interfaces:**
- Consumes: `slots.ts` (Task 9), `editorReducer`-handlingerne `cycleSlot`, `renameSlot`, `renameSlots` (Task 11).
- Produces: `RackFront({ item, mode: 'edit' | 'view', duplicates?: Set<string>, link?: Record<string, 'linked'|'new'|'blocked'>, status?: Record<string, 'empty'|'used'|'pick'|'reserved'|'other-team'|'none'>, highlight?: string, onSlot?(slotId), dispatch? })` – tabel med niveauer (øverst først) × fag; udtræk under pallerne; hyldereol som sektioner × hylder. `edit`: klik skifter kind (`cycleSlot`), dobbeltklik retter navnet (`renameSlot`), markér flere + "Giv navne efter mønster …" (`renameSlots`); dubletter rød kant. `view` (Fase 2/3): farver efter `status`, klik → `onSlot`.

- [x] **Step 1: Implementér** `RackFront`.
- [x] **Step 2: Kør typecheck og vitest** – PASS.
- [x] **Step 3: Tjek med `scripts/verify-layout.cjs --open`**: sæt `S`-reolens `levelPatterns` så niveau 1 hedder `S31 GULV`; ret `P22` niveau 1 til "pluk uden navn" → `P22.2` bliver `P22.1`; to ens navne vises røde.
- [x] **Step 4: Sæt [x]**

### Task 14: Afstemning og udgiv (`PublishPanel`)

**Files:**
- Create: `src/views/warehouse/locations/layout/PublishPanel.tsx`
- Modify: `LayoutEditor.tsx` (åbner panelet; "Find på tegningen" sætter editoren i vælg-slot-tilstand)

**Interfaces:**
- Consumes: `layoutPreview()`, `publishLayout()`, `saveLayoutDraft()` (Task 8); `decide`, `renameSlot` (Task 11); `RackFront` (Task 13).
- Produces: `PublishPanel({ draft, dispatch, onFindSlot(name), onPublished(version) })`: gemmer kladden, henter `PublishPlan` og viser
  - tal: nye / omdøbt / ændret / nedlægges / uden for tegningen / blokeret
  - **Kun i listen** (`outside`, med paller/lager-tal): "Find på tegningen" (`onFindSlot` → næste klik på en slot giver den navnet), "Uden for tegningen" (`decide outside`), "Nedlæg" (`decide remove`, kun når tom)
  - **Kun på tegningen** (`create`): "Ikke en plads" → `cycleSlot` til `blocked`
  - Slots farves i `RackFront` efter planen via `link` (linket grøn, ny blå, blokeret rød)
  - **Ændres** (`change`) med før → efter; **Blokeret** (`blocked`) med grund og "Vis" (vælger tingen)
  - "Udgiv" (deaktiveret ved blokeringer) → bekræftelse med tallene → `publishLayout()`; `LAYOUT_STALE` → besked + genindlæs.

- [x] **Step 1: Implementér** `PublishPanel`.
- [x] **Step 2: Kør typecheck og vitest** – PASS.
- [x] **Step 3: Tjek med `scripts/verify-layout.cjs --open`** (opret få pladser og én palle via broen i DevTools): "Kun i listen" viser pladsen med palle; "Find på tegningen" giver en slot navnet; udgiv → loggen viser "Tegningen udgivet (version 1) …".
- [x] **Step 4: Sæt [x]**

### Task 15: Admin efter udgivelse

**Files:**
- Modify: `src/views/warehouse/locations/Admin.tsx`, `src/views/warehouse/locations/LocationsHome.tsx` (import-feltet skjules når `drawing`), `src/views/warehouse/locations/LocationCard.tsx` (ret-dialogens felter)

**Interfaces:**
- Consumes: `LocationList.drawing` (Task 7/8).
- Produces: når `drawing` findes: knapperne "Ny placering", "Serie", "Reol", "Tilføj hylde" og "Importér placeringsark" skjules og erstattes af "Tegning af lageret"; i ret-dialogen for en linket plads er navn, type, kapacitet og pluk/reserve låst med teksten `t('Rettes på tegningen', 'Changed on the drawing')`; note, faste materialer, reserveret og aktiv kan rettes; listen viser "mangler materiale" ved pluk-pladser uden materialer og et lille "ikke på kortet" ved pladser uden for `linked`.

- [x] **Step 1: Implementér**.
- [x] **Step 2: Kør typecheck og vitest** – PASS.
- [x] **Step 3: Sæt [x]**

### Task 16: E2E, changelog og plan

**Files:**
- Modify: `scripts/verify-layout.cjs` (fra Task 12) – tilføj forløbet og assertions
- Modify: `src/lib/changelog.ts`, `plans/development-1.6.5.md`, denne plan

**Interfaces:**
- Consumes: hele Fase 1.

- [x] **Step 1: Skriv E2E** – manager opretter `A1.1`, `A1.2`, `K1.1` og sætter en palle på `A1.1` (bro-kald i `page.evaluate`); åbner Admin → "Tegning af lageret"; henter en lille spike-fil (skrevet i temp-mappen: reol A, 2 fag × 1 niveau + floorrow S) via filfeltet; Udgiv-panelet viser `K1.1` under "Kun i listen" og `S0` under nye; retter slot `A1.1` til `A1.9`; markerer `K1.1` "Uden for tegningen"; udgiver. Tjek: pladskortet for `A1.9` har pallen; `editLocation({ location: 'A1.9', changes: { name: 'A1.8' } })` afvises med `LOCATION_ON_DRAWING`; "Ny placering" er væk; medarbejderen kan ikke åbne tegningen (`layoutDraft()` → `LOCATIONS_MANAGER_ONLY`). Screenshots i `evidence/`.
- [x] **Step 2: Kør** (Vite på 5066 + `WAREHOUSE_VERIFY_URL=http://127.0.0.1:5066`, Electron som node) – forvent `ALL OK`.
- [x] **Step 3: Kør alle tests** – node:test `electron/warehouse/**/*.test.cjs` (inkl. `locations/`), vitest, typecheck – alt grønt.
- [x] **Step 4: Changelog** – punkt under nuværende version (spørg brugeren før versionsnummeret hæves): "Nyt: Placerings-admins kan tegne lageret i appen og udgive tegningen – pladserne følger tegningen". Notér Fase 1 som færdig i `plans/development-1.6.5.md`.
- [x] **Step 5: Sæt [x]** og ryd op: slet `.superpowers/brainstorm/22024-1793349768/content/pladsliste-data.js` og `lager-tegning-data.js` (kopier af rigtige data).

---

# Fase 2 – Kortet for alle (detaljeres før start)

- [ ] **Task 17: Kort over lageret** – `LocationsTarget { kind: 'map'; id?: string }`, felt på Placeringer-forsiden; `LayoutCanvas readOnly` med etagefilter, zoom og søgefelt (plads/materiale) der fremhæver; data fra `layout()` + `list()`; caches pr. `drawing.version`.
- [ ] **Task 18: Reolen forfra med belægning** – `RackFront mode="view"` med `status` ud fra paller/lager/formål/ejer; klik → `LocationCard`.
- [ ] **Task 19: "Vis på kort"** – knap på `LocationCard`, `RackCard` og plads-søgeresultater → `{ kind: 'map', id }` med pladsen fremhævet og reolen forfra.
- [ ] **Task 20: E2E + changelog** – udvid `scripts/verify-layout.cjs`.

# Fase 3 – Kortet i hverdagen (detaljeres før start)

- [ ] **Task 21: Mockup** i brainstorm-vinduet af "Vis" ved forslag i "Sæt palle på plads" – godkendes af brugeren.
- [ ] **Task 22: "Vis" ved forslag og valgt plads** – lille `RackFront mode="view"` med pladsen fremhævet, niveau ("3. niveau fra gulvet") og naboer.
- [ ] **Task 23: E2E + changelog.**
