# Kort over lageret (Placeringer, fase 2) – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle i hubben kan åbne "Kort over lageret", søge en plads eller et materiale (den ældste palle først), se reolen forfra med materialenummer på hver plads og hoppe dertil med "Vis på kort".

**Architecture:** Ét nyt læsekald `mapContents` i `service.cjs` (hvad der står på hver plads + ældste palle pr. materiale efter `rules.fifo`). Alt andet sker i rendereren: rene hjælpere i `src/lib/warehouse/layout/map.ts` (status, celletekst, søgning, find slot) og en tynd skærm `LocationsMap.tsx`, der genbruger `LayoutCanvas readOnly` og `RackFront mode="view"`.

**Tech Stack:** Electron 44, React 19, TypeScript, Tailwind 4, node:test (backend), vitest (rene TS-hjælpere, environment node), playwright-core (E2E). Ingen nye biblioteker.

**Spec:** `plans/lager-kort-design.md` (godkendt 05.11.2026). Baggrund: `plans/lager-tegning-design.md`, `plans/lager-tegning-plan.md` (fase 1).

**Start med Fase 1.**

## Global Constraints

- Ingen nye biblioteker. Ingen nye nøgler på M:; `mapContents` læser kun (`repository.read`), skriver aldrig, ingen historik.
- `mapContents` kræver kun hub-adgang (som `list()`), ikke admin.
- Forsiden, opgaverne og Admin må ikke hente mere end i dag – kun kortet kalder `mapContents`.
- "Ældste palle" = præcis `rules.fifo` (aktive pladser med formål `reserve`, laveste `receivedAt`, så `createdAt`).
- Tekster via `t(da, en)`; dansk først. Plads-id'er normaliseres med `locationKeyOf` / `locationKey`.
- Editorens udseende og adfærd (`RackFront mode="edit"`, `LayoutEditor`) ændres ikke.
- Tests og E2E kører mod midlertidige data, aldrig M:.
- Kommandoer (npm.ps1 er blokeret – brug node direkte eller `npm.cmd`):
  - backend: `node --test electron/warehouse/locations/service.test.cjs electron/warehouse/register.test.cjs`
  - vitest: `node node_modules/vitest/vitest.mjs run <fil>`
  - typer: `node node_modules/typescript/bin/tsc --noEmit -p .`
  - E2E: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5064 --strictPort` (terminal 1), `node scripts/verify-layout.cjs` (terminal 2)

## Review Focus

1. Scannet/indtastet plads med små bogstaver eller mellemrum (`" a1.9 "`) skal finde A1.9 – test i Task 2 (`searchMap`).
2. En slot på en TRR-ting med samme navn som en TCD-plads må aldrig få TCD's indhold eller kunne klikkes – test i Task 2 (`slotStatus`, `searchMap`).
3. Materiale uden SAP-beskrivelse (`description: ''`) må ikke give "undefined" eller " · " i boksen – test i Task 2 (`contentTitle`).
4. Materiale, der kun står på en deaktiveret eller reserveret plads, har ingen "ældste"; kortet falder tilbage til pluk-plads/største hylde og må ikke pege forkert – test i Task 1 (`oldest`) og Task 2 (`searchMap`).
5. Plads, der findes i listen men ikke på den udgivne tegning (K1.1 "uden for tegningen"), må ikke få en "Vis på kort"-knap og vises som "ikke på kortet" i søgningen – test i Task 2 (`canShowOnMap`, `searchMap`) og Task 6 (E2E).

---

# Fase 1 – Data

### Task 1: Læsekaldet `mapContents`

**Files:**
- Modify: `electron/warehouse/locations/service.cjs` (ny `mapContents` ved siden af `rackCard` ~l. 428; tilføj til return-objektet ~l. 846)
- Modify: `electron/warehouse/register.cjs:303` (`LOCATION_READS` + `'map-contents': 'mapContents'`)
- Modify: `electron/preload.cjs` (~l. 176: `mapContents: () => warehouse('locations:map-contents')`)
- Modify: `src/types/warehouse.ts` (typer + `mapContents(): Promise<MapContents>` i locations-bridgen efter `rackCard`)
- Test: `electron/warehouse/locations/service.test.cjs`, `electron/warehouse/register.test.cjs:87` (kanallisten)

**Interfaces:**
- Produces (TS, `src/types/warehouse.ts`):
  ```ts
  export interface MapMaterial { material: string; description: string; pallets: number; quantity: number | null; oldestAt: number | null; fixed: boolean }
  export interface MapPlaceContent { materials: MapMaterial[] }
  export interface MapContents { places: Record<string, MapPlaceContent>; oldest: Record<string, string> }
  ```
- Produces (backend): `service.mapContents(user) -> Promise<MapContents>`; bridge `window.electronWarehouse.locations.mapContents()`.

- [ ] **Step 1: Skriv de fejlende tests** i `service.test.cjs` (brug `setup()`, `place()`, `shelf()` og `seed()` som de øvrige tests):

```js
test('mapContents: what stands on every place, merged per material, oldest pallet first', async () => {
  const { pc1, seed } = setup()
  await seed([place('A1.1'), place('A1.2'), place('F1.0', { type: 'Gulv', capacity: 0 }), place('H26', { type: 'Hylde', purpose: 'pick', fixedMaterials: ['R162-0717'] }), place('A9.9', { active: false }), place('A17.1', { purpose: 'reserved' }), shelf('E9 H5'), place('Z1')], [
    { id: 'p1', location: 'F1.0', material: 'INT4300-4921-0', quantity: 10, receivedAt: day(2026, 9, 1) },
    { id: 'p2', location: 'F1.0', material: 'R162-0717', quantity: 5, receivedAt: day(2026, 8, 1) },
    { id: 'p3', location: 'F1.0', material: 'R162-0717', quantity: null, receivedAt: day(2026, 8, 5) },
    { id: 'p4', location: 'A1.2', material: 'R162-0717', quantity: 7, receivedAt: day(2026, 7, 1) },
    { id: 'p5', location: 'A9.9', material: 'R162-0717', quantity: 1, receivedAt: day(2025, 1, 1) },
    { id: 'p6', location: 'A17.1', material: 'X-ONLY-RESERVED', quantity: 1, receivedAt: day(2025, 1, 1) },
  ])
  await pc1.service.shelfPut(ANNA, { location: 'E9 H5', material: 'R162-0717', quantity: 40 })
  const map = await pc1.service.mapContents(ANNA)
  assert.deepEqual(map.places['F1.0'].materials.map(m => [m.material, m.pallets, m.quantity, m.oldestAt]), [['R162-0717', 2, 5, day(2026, 8, 1)], ['INT4300-4921-0', 1, 10, day(2026, 9, 1)]], 'oldest pallet first; a null quantity adds nothing')
  assert.equal(map.places['F1.0'].materials[0].description, 'Ethernet Cable RJ45 2m')
  assert.deepEqual(map.places['E9 H5'].materials.map(m => [m.material, m.pallets, m.quantity, m.fixed]), [['R162-0717', 0, 40, false]])
  assert.deepEqual(map.places.H26.materials.map(m => [m.material, m.pallets, m.quantity, m.fixed]), [['R162-0717', 0, null, true]], 'a pick place shows its fixed material')
  assert.equal(map.places['A1.1'], undefined, 'empty places are left out')
  assert.equal(map.places.Z1, undefined)
  assert.equal(map.oldest['R162-0717'], 'A1.2', 'same as Tag: the deactivated A9.9 does not count')
  assert.equal(map.oldest['X-ONLY-RESERVED'], undefined, 'a reserved place is never the oldest')
  assert.deepEqual(await pc1.service.mapContents(TRR), { places: {}, oldest: {} }, 'another hub sees only its own')
})

test('mapContents: fixed materials of a reserve place are not shown as content', async () => {
  const { pc1, seed } = setup()
  await seed([place('A1.1', { fixedMaterials: ['R162-0717'] }), place('I1', { type: 'Bord', purpose: 'station', fixedMaterials: ['INT4300-4921-0'] })])
  const map = await pc1.service.mapContents(ANNA)
  assert.equal(map.places['A1.1'], undefined)
  assert.deepEqual(map.places.I1.materials.map(m => [m.material, m.fixed]), [['INT4300-4921-0', true]])
})
```

Tilføj `'map-contents'` til `LOCATION_CHANNELS` i `register.test.cjs:87`.

- [ ] **Step 2: Kør og se dem fejle**

Run: `node --test electron/warehouse/locations/service.test.cjs electron/warehouse/register.test.cjs`
Expected: FAIL – `pc1.service.mapContents is not a function` og den manglende kanal.

- [ ] **Step 3: Implementér `async function mapContents(user)` i `service.cjs`**

Én `repo.read(teamOf(user))`; saml pr. plads-id et `Map<material, MapMaterial>` fra `state.pallets` (pallets++, quantity += tal, oldestAt = min receivedAt), `state.stock` (quantity += line.quantity) og `fixedMaterials` kun for formål `pick`/`station` (`fixed: true`, quantity forbliver `null` hvis intet andet). Rækkefølge pr. plads: `oldestAt` stigende (null sidst), så `quantity` faldende, så faste i listens rækkefølge. `oldest[material] = rules.fifo(state, material)[0]?.location` for materialer med paller. Én `describe()` for alle materialer. Registrér i `LOCATION_READS`, preload og bridge-typen.

- [ ] **Step 4: Kør og se dem bestå**

Run: `node --test electron/warehouse/locations/service.test.cjs electron/warehouse/register.test.cjs`
Expected: PASS (alle).

- [ ] **Step 5: Commit**

`git add electron/warehouse/locations/service.cjs electron/warehouse/locations/service.test.cjs electron/warehouse/register.cjs electron/warehouse/register.test.cjs electron/preload.cjs src/types/warehouse.ts`
`git commit -m "Placeringer: mapContents – what stands on every place for the map"`

---

# Fase 2 – Rene hjælpere og reolen forfra

### Task 2: Kortets regler (`map.ts`)

**Files:**
- Create: `src/lib/warehouse/layout/map.ts`
- Test: `src/lib/warehouse/layout/map.test.ts`

**Interfaces:**
- Consumes: `MapContents`, `MapPlaceContent` (Task 1); `LocationList`, `WarehouseLayout`, `LayoutItem`, `LayoutSlot`, `LayoutOwner` (`src/types/warehouse.ts`); `SlotStatus` (`RackFront.tsx`); `isUnnamed`, `slotLabel` (`slots.ts`); `locationKeyOf` (`locations.ts`).
- Produces:
  ```ts
  export type MapPlace = LocationList['locations'][number]
  export interface MapContext { team: LayoutOwner; places: Map<string, MapPlace>; linked: Set<string>; contents: MapContents }
  export function contextOf(list: LocationList, contents: MapContents, team: LayoutOwner): MapContext
  /** The place id a slot stands for, or null (unnamed pick, aisle, blocked, another team's item, not in the list or not linked). */
  export function placeOfSlot(item: LayoutItem, slot: LayoutSlot, ctx: MapContext): string | null
  export function slotStatus(item: LayoutItem, slot: LayoutSlot, ctx: MapContext): SlotStatus
  /** "R162-0717", "R330-0001 +2", "" when empty. */
  export function cellText(content: MapPlaceContent | undefined): string
  /** Tooltip: "A2.3 · 3 materialer\nR330-0001 · Kabelbakke 2m (1 palle)\n…\nKlik → pladskortet". */
  export function contentTitle(name: string, content: MapPlaceContent | undefined): string
  export function findSlot(layout: Pick<WarehouseLayout, 'items'>, placeId: string, ctx: MapContext): { itemId: string; slotId: string } | null
  export function canShowOnMap(placeId: string, drawing: LocationList['drawing']): boolean
  export interface MapHitPlace { id: string; name: string; itemId: string | null; slotId: string | null; oldest: boolean }
  export interface MapHit { kind: 'place' | 'material'; material?: string; description?: string; places: MapHitPlace[] }
  export interface MapSearch { hits: MapHit[]; focus: { itemId: string; slotId: string; placeId: string } | null; items: string[] }
  export function searchMap(query: string, layout: Pick<WarehouseLayout, 'items'>, ctx: MapContext): MapSearch
  ```

Regler fra spec'en (afsnit "Reolen forfra – hver plads" og "Søgning på kortet"):
- `slotStatus` rækkefølge: andet team → `other-team`; ingen plads (`placeOfSlot` null) → `none`; `!active` → `none`; formål `reserved` → `reserved`; `pick` → `pick`; `used > 0 || stockCount > 0` → `used`; ellers `empty`.
- `searchMap`: under 2 tegn (efter trim) → tom. Plads: `locationKeyOf(name)` starter med `locationKeyOf(query)`; præcist match først. Materiale: nummer starter med (store bogstaver) eller beskrivelse indeholder (små bogstaver). Højst 8 hits. `items` = alle `itemId`'er i hits (til gul ramme). `focus`: præcist plads-træf; ellers første materiale-træfs `oldest`-plads; ellers dets pluk-plads (fast materiale); ellers dets største `quantity`. `itemId/slotId = null` for pladser, der ikke er på tegningen ("ikke på kortet").

- [ ] **Step 1: Skriv de fejlende tests** i `map.test.ts`. Byg en lille tegning med en TCD-reol `A` (2 fag × 2 niveauer: slots `A1.1, A1.2, A2.1, A2.2`, ét af dem `pick-unnamed`), en TRR-reol `D` med en slot ved navn `A2.2`, og en liste/contents i hånden. Tests (navne og kerne-asserts):

```ts
it('slotStatus follows the order other-team, none, inactive, reserved, pick, used, empty', () => {
  expect(slotStatus(trrRack, trrRack.slots[0], ctx)).toBe('other-team')
  expect(slotStatus(rackA, unnamed, ctx)).toBe('none')
  expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { active: false, used: 1 } }))).toBe('none')
  expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { purpose: 'reserved' } }))).toBe('reserved')
  expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { purpose: 'pick', used: 0 } }))).toBe('pick')
  expect(slotStatus(rackA, slot('A1.1'), ctxWith({ 'A1.1': { stockCount: 1 } }))).toBe('used')
  expect(slotStatus(rackA, slot('A1.1'), ctx)).toBe('empty')
})
it('a TRR slot named like a TCD place is never that place', () => {
  expect(placeOfSlot(trrRack, trrRack.slots[0], ctx)).toBeNull()
  expect(searchMap('A2.2', layout, ctx).focus).toEqual({ itemId: 'A', slotId: slotIdOf('A2.2'), placeId: 'A2.2' })
})
it('cellText shows the first material and +N', () => {
  expect(cellText(undefined)).toBe('')
  expect(cellText({ materials: [m('R330-0001')] })).toBe('R330-0001')
  expect(cellText({ materials: [m('R330-0001'), m('R412-0090'), m('R550-1203')] })).toBe('R330-0001 +2')
})
it('contentTitle never shows undefined or an empty description', () => {
  const text = contentTitle('A2.3', { materials: [m('R330-0001', { description: '', pallets: 1 }), m('R550-1203', { description: 'Strips', pallets: 0, quantity: 40 })] })
  expect(text).toBe('A2.3 · 2 materialer\nR330-0001 (1 palle)\nR550-1203 · Strips (40 stk)\nKlik → pladskortet')
  expect(text).not.toMatch(/undefined| · \(/)
})
it('searchMap finds a typed or scanned place however it is written', () => {
  expect(searchMap(' a1.2 ', layout, ctx).focus?.placeId).toBe('A1.2')
  expect(searchMap('a', layout, ctx).hits).toEqual([])
})
it('searchMap points a material at the oldest pallet (same as Tag) and marks it', () => {
  const found = searchMap('R162', layout, ctx)  // R162-0717 on A1.1 and A2.2; oldest: A2.2
  expect(found.focus?.placeId).toBe('A2.2')
  expect(found.hits[0].places.find(p => p.oldest)?.id).toBe('A2.2')
  expect(found.items).toEqual(['A'])
})
it('searchMap falls back to the pick place, then the largest quantity, when there is no oldest pallet', () => {
  // X9: fixed on the pick place A2.1 and 30 pcs on A1.1's shelf lines; X8: only 5 on A1.1 and 30 on A1.2; neither in `oldest`.
  expect(searchMap('X9', layout, ctxNoOldest).focus?.placeId).toBe('A2.1')
  expect(searchMap('X8', layout, ctxNoOldest).focus?.placeId).toBe('A1.2')
})
it('a place outside the drawing is "ikke på kortet": no slot and no Vis på kort', () => {
  const found = searchMap('K1.1', layout, ctx)
  expect(found.hits[0].places[0]).toMatchObject({ id: 'K1.1', itemId: null, slotId: null })
  expect(found.focus).toBeNull()
  expect(canShowOnMap('K1.1', { version: 2, linked: ['A1.1'] })).toBe(false)
  expect(canShowOnMap('a1.1', { version: 2, linked: ['A1.1'] })).toBe(true)
  expect(canShowOnMap('A1.1', null)).toBe(false)
})
it('findSlot finds the item and slot of a place, null for another team or an unknown place', () => {
  expect(findSlot(layout, 'A1.1', ctx)).toEqual({ itemId: 'A', slotId: slotIdOf('A1.1') })
  expect(findSlot(layout, 'NOPE', ctx)).toBeNull()
})
```

- [ ] **Step 2: Kør og se dem fejle**

Run: `node node_modules/vitest/vitest.mjs run src/lib/warehouse/layout/map.test.ts`
Expected: FAIL – modulet findes ikke.

- [ ] **Step 3: Implementér `map.ts`** med signaturerne ovenfor. Pluralis: "1 palle"/"N paller", "N stk"; "1 materiale"/"N materialer" (via `t`).

- [ ] **Step 4: Kør og se dem bestå**

Run: `node node_modules/vitest/vitest.mjs run src/lib/warehouse/layout/map.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

`git add src/lib/warehouse/layout/map.ts src/lib/warehouse/layout/map.test.ts`
`git commit -m "Placeringer: map rules – status, cell text, search with the oldest pallet"`

### Task 3: Reolen forfra viser indhold (kun i visning)

**Files:**
- Modify: `src/views/warehouse/locations/layout/RackFront.tsx`

**Interfaces:**
- Consumes: intet nyt.
- Produces: ny valgfri prop på `RackFront`: `content?: Record<string, { text: string; title: string }>` (pr. slot id). Kun brugt når `mode === 'view'`.

- [ ] **Step 1: Udvid `RackFront`**: i `mode="view"` med `content` vises cellen i to linjer – `cellText(slot, column)` (pladsens navn, som i dag) og under den `content[slot.id].text` i monospace (eller "tom" for en plads uden indhold med status `empty`); `title`/`aria-label` = `content[slot.id].title` når den findes. Cellen bliver `h-10 min-w-20` i view-mode; edit-mode uændret (`h-6 min-w-9`). `highlight` (gul outline) virker som i dag.
- [ ] **Step 2: Typer og eksisterende tests**

Run: `node node_modules/typescript/bin/tsc --noEmit -p .` og `node node_modules/vitest/vitest.mjs run src/lib/warehouse/layout`
Expected: 0 fejl; alle grønne (editorens tests uændrede).

- [ ] **Step 3: Commit**

`git commit -am "Placeringer: the rack front shows what stands on each place (view mode)"`

---

# Fase 3 – Skærmen og "Vis på kort"

### Task 4: "Kort over lageret"

**Files:**
- Create: `src/views/warehouse/locations/map/LocationsMap.tsx`
- Modify: `src/lib/warehouse/locations.ts` (`LocationsTarget` + `| { kind: 'map'; id?: string }`; `targetFromItem` kender `map` og `map:<id>`)
- Modify: `src/lib/warehouse/locations.test.ts` (targetFromItem-test)
- Modify: `src/views/warehouse/locations/Locations.tsx` (tegningen for alle + route)
- Modify: `src/views/warehouse/locations/LocationsHome.tsx` (felt)

**Interfaces:**
- Consumes: Task 1 (`mapContents`), Task 2 (alle eksporter), Task 3 (`content`-prop); `LayoutCanvas` (`readOnly`, `highlight`, `floorView`, `zoom`, `team`, `onPointer`), `FloorView`.
- Produces: `LocationsMap({ user, focus, drawing, version, onOpen }: { user: WarehouseUser; focus?: string; drawing: LocationList['drawing']; version: number; onOpen: (target: LocationsTarget) => void })`. `Locations.tsx` holder `drawing: LocationList['drawing']` (i stedet for kun admins' `drawn`) og giver den videre til `LocationsHome`, `LocationCard`, `RackCard`, `SearchResults` (Task 5) og `LocationsMap`; `drawn = Boolean(drawing)` bevares for de eksisterende brugere.

- [ ] **Step 1: Fejlende test** i `locations.test.ts`:

```ts
it('targetFromItem opens the map, also on a place', () => {
  expect(targetFromItem('map')).toEqual({ kind: 'map' })
  expect(targetFromItem('map:A1.9')).toEqual({ kind: 'map', id: 'A1.9' })
})
```

Run: `node node_modules/vitest/vitest.mjs run src/lib/warehouse/locations.test.ts` → FAIL; implementér `LocationsTarget`/`targetFromItem` → PASS.

- [ ] **Step 2: `Locations.tsx`**: hent `list()` for alle (ikke kun `canAdmin`) og gem `result.drawing`; route `target.kind === 'map'` → `<LocationsMap key={target.id || ''} … focus={target.id} />`.
- [ ] **Step 3: `LocationsHome.tsx`**: ny prop `drawing`; når den findes, et felt "Kort over lageret" / "Map of the warehouse" (ikon `MapTrifold`, hint "Find en plads eller et materiale på tegningen" / "Find a place or a material on the drawing") sidst i opgavelisten → `{ kind: 'map' }`. Admins' knap "Tegning af lageret" bliver.
- [ ] **Step 4: `LocationsMap.tsx`** (layout A fra skitsen):
  - Henter `layout()` når `drawing?.version` ændres; `list()` + `mapContents()` når `version` ændres; `contextOf(list, contents, user.team)`.
  - Ingen `drawing` eller `layout === null`: "Tegningen er ikke udgivet endnu" / "The drawing has not been published yet". Fejl: `errorMessage` som resten af Placeringer.
  - Linje øverst: søgefelt (`aria-label` "Søg på kortet", placeholder "Søg eller scan: plads eller materiale"), etagefilter (Alle/Gulv/Ovenpå), zoom −/+.
  - `LayoutCanvas readOnly team={user.team} highlight={[...search.items, selectedItem]}`; `onPointer` 'up' med `itemId`: ting med flere slots (rack/floorrow/shelfrack) vælges; `floor`/`special` med en plads → `onOpen({ kind: 'location', id })`; andet → intet.
  - Under kortet når en ting er valgt: overskrift "Reol {navn} · {n} pladser · {optaget} optaget" og `RackFront mode="view" status={…} content={…} highlight={focusSlot} onSlot={id => placeOfSlot … && onOpen({ kind: 'location', id })}` samt forklaring (tom/optaget/pluk/reserveret/TRR eller ingen plads) med `STATUS_FILL`-farverne. `data-testid="map-front"` på panelet.
  - Søgelinje under feltet (`data-testid="map-hits"`): pr. hit materialenummer · beskrivelse og pladserne som knapper; "ældste" ved `oldest`; "ikke på kortet" ved `itemId === null` (åbner pladskortet). Ingen hits (≥ 2 tegn): "Ingen plads eller materiale på kortet matcher" / "No place or material on the map matches".
  - `focus` (prop eller søgningens `focus`) vælger tingen og fremhæver sloten; reolen forfra rulles i syne.
- [ ] **Step 5: Typer + tests**

Run: `node node_modules/typescript/bin/tsc --noEmit -p .` og `node node_modules/vitest/vitest.mjs run src/lib/warehouse`
Expected: 0 fejl; alle grønne.

- [ ] **Step 6: Commit**

`git add src/views/warehouse/locations src/lib/warehouse/locations.ts src/lib/warehouse/locations.test.ts`
`git commit -m "Placeringer: Kort over lageret for everyone"`

### Task 5: "Vis på kort"

**Files:**
- Modify: `src/views/warehouse/locations/LocationCard.tsx`, `RackCard.tsx`, `SearchResults.tsx`, `Locations.tsx` (giv `drawing` videre), `LocationsHome.tsx` (giv `drawing` til `SearchResults`)

**Interfaces:**
- Consumes: `canShowOnMap(placeId, drawing)` (Task 2); `{ kind: 'map', id }` (Task 4).
- Produces: ny prop `drawing: LocationList['drawing']` på de tre komponenter.

- [ ] **Step 1:** `LocationCard`: knap "Vis på kort" / "Show on map" (ikon `MapTrifold`, `size="sm" variant="outline"`) i overskriftslinjen når `canShowOnMap(place.id, drawing)`.
- [ ] **Step 2:** `RackCard`: samme knap når en af `card.shelves` er på tegningen; `id` = første sådan hylde.
- [ ] **Step 3:** `SearchResults`: lille knap "Vis på kort" til højre i hver plads-række, når `canShowOnMap`; `onClick` stopper rækkens eget klik.
- [ ] **Step 4:** Run: `node node_modules/typescript/bin/tsc --noEmit -p .` → 0 fejl.
- [ ] **Step 5: Commit** `git commit -am "Placeringer: Vis på kort from the place card, rack card and search"`

---

# Fase 4 – E2E, changelog og plan

### Task 6: E2E og afslutning

**Files:**
- Modify: `scripts/verify-layout.cjs` (ny `mapForEveryone(page)` efter `employeeLockedOut`, kaldt i `main()`; opdatér filens topkommentar)
- Modify: `src/lib/changelog.ts` (ny post `version: '1.6.6'` øverst)
- Modify: `plans/development-1.6.6.md`, `plans/lager-tegning-plan.md` (Fase 2 → henvis hertil, afkryds Task 17–20)

**Interfaces:**
- Consumes: tilstanden efter `renameFollows` (udgivet version 2; A1.9 med 1 palle R162-0717 × 5; K1.1 uden for tegningen) og anna logget ind fra `employeeLockedOut`.

- [ ] **Step 1: Skriv `mapForEveryone(page)`** med faste tjek (som anna, almindelig medarbejder):
  1. Placeringers forside har "Kort over lageret"; klik → `svg[aria-label="Tegning af lageret"]` synligt.
  2. Søg "r162-0717" i "Søg på kortet" → `map-hits` viser "A1.9" og "ældste"; `map-front` er synligt; cellen for A1.9 (`[data-slot]` med title der starter med "A1.9") indeholder "R162-0717".
  3. Søg "K1.1" → "ikke på kortet".
  4. Klik cellen A1.9 → overskriften `A1.9` (pladskortet); knappen "Vis på kort" findes; klik → kortet med `map-front` og A1.9 fremhævet.
  5. Skærmbilleder `30-kort-soeg-materiale`, `31-kort-reol-forfra`, `32-vis-paa-kort`.
  Hver blok slutter med en `console.log('ok - …')`-linje som resten af filen.
- [ ] **Step 2: Kør E2E**

Run: Vite i terminal 1 (se Global Constraints), så `node scripts/verify-layout.cjs`
Expected: sidste linje "ALLE TJEK OK", inkl. de nye `ok - kort …`-linjer.

- [ ] **Step 3: Hele suiten**

Run: `node --test electron/*.test.cjs electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs electron/warehouse/locations/*.test.cjs`, `node node_modules/vitest/vitest.mjs run`, `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: alle grønne (kendt ustabil: `assistantWorker.test.cjs` timeout – kør igen).

- [ ] **Step 4: Changelog 1.6.6** – ét punkt: "Nyt: Kort over lageret i Placeringer – alle kan se hallen, søge en plads eller et materiale (kortet peger på den ældste palle), se reolen forfra med materialet på hver plads og trykke "Vis på kort" fra pladskort, reolkort og søgning".
- [ ] **Step 5: Planer** – afkryds her og i `plans/development-1.6.6.md` (Fase 2-linjen) og `plans/lager-tegning-plan.md` (Task 17–20).
- [ ] **Step 6: Commit** `git commit -am "Placeringer: E2E for the map, changelog 1.6.6"`
