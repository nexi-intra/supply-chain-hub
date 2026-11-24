# Placeringer – reoler, hylder, gulvpladser og opret/slet – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Racks with shelves holding material + quantity ("hyldelager"), pallet places of exactly one pallet, floor places without limit, and easy creation and deletion of places (one, a rack, or many at once).

**Architecture:** A third kind of state, `stock` (one line per shelf and material), sits next to `locations` and `pallets`; the repository writes it in the same transactions, so the log and undo cover it through `undo.cjs`'s `KINDS`. Pure rules (`shelves.cjs`, `rules.cjs`, `model.cjs`) decide what may stand where by the place's type; the service adds shelf actions, rack/delete administration and a one-time migration of today's shelf pallets. Shelves are ordinary locations with `rack`/`shelf`; the rack is the group of its shelves.

**Tech Stack:** Electron 44 main (CommonJS, node:test), React 19 + TypeScript + Tailwind (vitest), playwright-core E2E.

**Spec:** `plans/placeringer-reoler-design.md`

## Global Constraints

- Only TCD and TRR (`teamOf`, `WAREHOUSE_TEAM_NOT_ALLOWED`).
- What may stand where is decided by **type**: Palle = exactly 1 pallet; Gulv = pallets, no limit; Hylde with purpose `reserve` ("lagerhylde") = stock lines, no limit; Hylde `pick`/`station` = as today (fixed materials, no quantity); Bord, Swap and the old "Reol" type = pallets with the capacity number as today.
- A shelf line is material + whole quantity ≥ 1, merged per material, removed at 0; no age, FIFO, 49/50 or serials on shelves (49/50/serials only kept in `note` by the migration).
- Shelf names are `${rack} H${shelf}` (e.g. `E9 H5`); recognised by `/^(.+?)\s+H(\d{1,2})$/i`.
- Create/delete/rack/shelves-admin: managers and Placerings admins (`requireAdmin`); put on / take from / move / set quantity on shelves: everyone in the team.
- Deleting only empty places (no pallets, no stock); bulk = at most 500; one transaction = one log line; deletions undoable.
- New error codes: `LOCATION_IS_SHELF`, `NOT_A_SHELF`, `STOCK_TOO_LOW`, `STOCK_GONE`, `RACK_INVALID`, `RACK_NOT_EMPTY` (+ existing `LOCATION_NOT_EMPTY`, `LOCATION_FULL`).
- Writing shelf methods go through the local queue with `actionId` (`QUEUED_METHODS`): `shelfPut`, `shelfTake`, `shelfMove`, `shelfSet`.
- All UI text through `t(da, en)`; Hubert answers and guide in da/en/fi/sv; Danish copy as in the spec.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

- Taking more than a shelf line holds, or from a line another PC just emptied → `STOCK_TOO_LOW` / `STOCK_GONE`, nothing changes → Task 3 test.
- Renaming a shelf (`E9 H5` → `E9 H6`) or changing its purpose to pick while it holds stock → the stock follows the new id; to pick is refused with `LOCATION_NOT_EMPTY` → Task 4 test.
- Bulk delete where one place got a pallet between list and click → that one is kept with its reason, the rest deleted, one log line → Task 4 test.
- Undo of a shelf put after the shelf was deleted or became pick → conflict, nothing half-done → Task 1 test.
- The migration runs on two PCs at once → it runs once (flag under the lock), no doubled quantities → Task 3 test.

---

## File structure

- Modify `electron/warehouse/locations/model.cjs` – `KEYS.stock`, `shelfOf(name)`, `isShelf(location)`, `holdsPallets(location)`, `palletLimit(location)`.
- Create `electron/warehouse/locations/shelves.cjs` – pure stock rules: `stockId`, `putStock`, `takeStock`, `stockOn`, `stockOf`, `shelfForRefill`, `migrateShelves`.
- Modify `electron/warehouse/locations/undo.cjs` – `stock` kind; restored stock needs a lagerhylde.
- Modify `electron/warehouse/locations/rules.cjs` – occupancy/area/suggest by type; search finds racks.
- Modify `electron/warehouse/locations/repository.cjs` – `stock` in the state and snapshots.
- Modify `electron/warehouse/locations/service.cjs` – shelf actions, refill from a shelf, cards, migration, rack/delete administration.
- Modify `electron/warehouse/locations/sheetImport.cjs` – shelf rows become stock; `PALLET_PLACE_MANY`.
- Modify `electron/warehouse/register.cjs`, `electron/warehouse/locations/outbox.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts`, `src/lib/warehouse/errors.ts`.
- Modify `src/lib/warehouse/locations.ts` – targets `shelf`/`rack`, `describeEvent`, `describeUndoEffect`.
- Create `src/views/warehouse/locations/ShelfPut.tsx`, `RackCard.tsx`; modify `LocationsHome.tsx`, `Locations.tsx`, `TakePallet.tsx`, `Refill.tsx`, `MovePallet.tsx`, `LocationCard.tsx`, `MaterialCard.tsx`, `FetchGuide.tsx`, `SearchResults.tsx`, `Admin.tsx`.
- Modify `electron/assistantLocations.cjs`, `electron/assistantAppGuideWarehouse.cjs`, `electron/assistantAppGuideWarehouseI18n.cjs`.
- Modify `scripts/verify-locations.cjs`, `src/lib/changelog.ts`, `plans/placeringer-afgoerelser.md`, `plans/development-1.6.5.md`.

---

### Task 1: Model, pure shelf rules and undo of stock

**Files:**
- Modify: `electron/warehouse/locations/model.cjs`, `electron/warehouse/locations/undo.cjs`, `electron/warehouse/locations/rules.cjs`
- Create: `electron/warehouse/locations/shelves.cjs`
- Test: `electron/warehouse/locations/shelves.test.cjs` (new), `undo.test.cjs`, `rules.test.cjs`

**Interfaces:**
- Produces (model.cjs): `KEYS.stock = 'stock'` (so `STATE_KEYS` includes it); `shelfOf(name) → { rack: string, shelf: number } | null`; `isShelf(location) → boolean` (type `Hylde` and purpose `reserve`); `holdsPallets(location) → boolean` (not a lagerhylde, purpose not pick/station/reserved); `palletLimit(location) → number` (`Palle` 1, `Gulv` Infinity, else `location.capacity`).
- Produces (shelves.cjs): `stockId(location, material) → string` (`${location}|${material}`); `putStock(stock, { location, material, quantity, by, at }) → line` (adds, merges); `takeStock(stock, { location, material, quantity? }) → { left: line | null, taken: number }` (throws `STOCK_GONE` / `STOCK_TOO_LOW` with `codeError(code, danishText)`); `stockOn(state, locationId) → line[]` (by material); `stockOf(state, material) → line[]` (largest first); `shelfForRefill(state, material) → line | null` (largest line on an active lagerhylde); `migrateShelves(state, { at, by }) → { stock, removedPallets: string[], shelved: string[] }` (pure; returns the new stock map and what changed).
- Produces (undo.cjs): `KINDS` includes `['stock', 'stock']`; `undoCheck` refuses (conflict `{ kind: 'location', id }`) when a restored stock line's place is missing or not a lagerhylde, and when a place the undo removes still has stock not restored by the change.
- Produces (rules.cjs): `occupancy` uses `palletLimit` (free = `Infinity` on Gulv → reported as `free: null`, `capacity: null`); `areaSummary` counts only places where `palletLimit` is finite and `holdsPallets`; `suggestSlots` offers places where `holdsPallets` and room (Gulv always); `search(...)` also returns `racks: string[]` (rack names whose name starts with the query).

- [ ] **Step 1: Write the failing tests**

```js
// shelves.test.cjs
test('shelfOf reads "E9 H5" as rack E9, shelf 5, and nothing else', () => {
  assert.deepEqual(shelfOf('E9 H5'), { rack: 'E9', shelf: 5 }); assert.deepEqual(shelfOf('reol x 1 h12'), { rack: 'REOL X 1', shelf: 12 })
  for (const name of ['A1.1', 'H26', 'E9H5', 'E9 H']) assert.equal(shelfOf(name), null, name)
})
test('putStock merges the same material on a shelf; takeStock removes the line at 0', () => {
  const stock = {}
  putStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 40, by, at: 1 }); putStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 10, by, at: 2 })
  assert.equal(stock['E9 H5|R162-0717'].quantity, 50)
  assert.deepEqual(takeStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 5 }).taken, 5)
  assert.throws(() => takeStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 46 }), { code: 'STOCK_TOO_LOW' })
  assert.equal(takeStock(stock, { location: 'E9 H5', material: 'R162-0717' }).left, null); assert.equal(stock['E9 H5|R162-0717'], undefined)
  assert.throws(() => takeStock(stock, { location: 'E9 H5', material: 'R162-0717', quantity: 1 }), { code: 'STOCK_GONE' })
})
test('migrateShelves turns pallets on lagerhylder into stock, merged, with 49/50 and serials in the note', () => {
  // E9 H5 (Hylde, reserve) with two R162-0717 pallets (10 + 5, one with document 5000032337 and serial S1) and A1.1 (Palle) with one pallet
  // → stock['E9 H5|R162-0717'].quantity === 15, note matches /5000032337/ and /S1/; A1.1's pallet stays; E9 H5 gets rack 'E9', shelf 5
})
// undo.test.cjs
test('undoing a shelf put is refused when the shelf was deleted or became a pick shelf since', () => { /* conflict { kind: 'location', id: 'E9 H5' } in both cases */ })
test('undoing the creation of a shelf is refused while stock stands on it', () => { /* conflict on the shelf */ })
// rules.test.cjs
test('a pallet place takes exactly one pallet, a floor place any number, and shelves hold no pallets', () => {
  // occupancy: Palle with 1 pallet → free 0; Gulv with 7 → { used: 7, capacity: null, free: null }; suggestSlots never offers a Hylde, offers a Gulv with 7 pallets
  // areaSummary counts neither Gulv nor Hylde; search('E9') returns racks ['E9']
})
```

- [ ] **Step 2: Run** `node --test electron/warehouse/locations/shelves.test.cjs electron/warehouse/locations/undo.test.cjs electron/warehouse/locations/rules.test.cjs` → FAIL (`shelves.cjs` missing).
- [ ] **Step 3: Implement** the Interfaces above. `migrateShelves` only touches places where `isShelf` (after setting `rack`/`shelf` from `shelfOf(name)` on every Hylde whose name matches); its note joins unique `document` values and serials (`49/50: …`, `Serienumre: …`), at most 500 characters.
- [ ] **Step 4: Run** the same command, then `node --test electron/warehouse/locations/*.test.cjs` → PASS (existing tests with Palle capacity > 1 on the import or service may need `type: 'Gulv'`/`'Bord'` – ledger each changed fixture as a ruling).
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: hyldelager, typer styrer pladsen, fortryd af hyldelager"`

### Task 2: Repository writes stock

**Files:**
- Modify: `electron/warehouse/locations/repository.cjs`
- Test: `electron/warehouse/locations/repository.test.cjs`

**Interfaces:**
- Consumes: `KEYS.stock` (Task 1), `KINDS` with stock (Task 1).
- Produces: `read(team)` returns `stock: {}` by default; `transact` gives `tx.stock`, writes it when changed, and the change snapshot (`placesOf`) includes `stock`; `undo` restores stock.

- [ ] **Step 1: Write the failing test** – `test('a stock change is written, recorded and undone like pallets')`: transact puts `E9 H5|R162-0717` (40); `read` shows it; the first history event's `change.after.stock['E9 H5|R162-0717'].quantity === 40`; `undo(team, { eventId })` removes it again.
- [ ] **Step 2: Run** `node --test electron/warehouse/locations/repository.test.cjs` → FAIL.
- [ ] **Step 3: Implement** – `EMPTY.stock = {}`; `placesOf = state => ({ locations, pallets, stock })`.
- [ ] **Step 4: Run** `node --test electron/warehouse/locations/*.test.cjs` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: hyldelager i lageret og loggen"`

### Task 3: Service – shelf actions, refill from a shelf, cards and migration

**Files:**
- Modify: `electron/warehouse/locations/service.cjs`
- Test: `electron/warehouse/locations/service.test.cjs`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:
  - `shelfPut(user, { location, material, quantity, actionId }) → { line }` – `NOT_A_SHELF` unless `isShelf`; `LOCATION_INACTIVE`; event `{ type: 'shelf-put', location, material, quantity }`; unknown descriptions are looked up as in `putAway`.
  - `shelfTake(user, { location, material, quantity?, actionId }) → { left, taken }` – event `shelf-take`.
  - `shelfMove(user, { from, to, material, quantity?, actionId }) → { line }` – `to` must be a lagerhylde; event `shelf-move` with `from`, `to`.
  - `shelfSet(user, { location, material, quantity, actionId }) → { line | null }` – sets the exact quantity (0 removes); event `shelf-set` with `changes: { quantity: [before, after] }`.
  - `refill(user, { location, pallet?, shelf?, material?, quantity, actionId })` – with `shelf` it takes `quantity` (required) from that shelf's line of the pick place's material; event `refill` with `from: shelf`.
  - `roomIn` throws `LOCATION_IS_SHELF` for a lagerhylde and uses `palletLimit` (Gulv never full).
  - `locationCard` adds `stock: { id, material, description, quantity, note, updatedAt, updatedBy }[]`; `materialCard` adds `shelves: { location, name, quantity }[]` and counts them in `total`; new `rackCard(user, { rack }) → { rack, area, purpose, shelves: { location: Location, stock: line[] }[] (highest shelf first), history }` (`RACK_INVALID` when no shelf has that rack); `search` returns `racks`; `refillSuggestion` result is complemented by `shelf: shelfForRefill(...)` when there is no pallet (card field `suggestion.shelf`).
  - `ensureShelves(team)` – called from `overview`: when `meta.shelvesMigratedAt` is missing, one transaction (flag checked again inside) runs `migrateShelves`, deletes the moved pallets, writes `stock`, sets the flag and logs `{ type: 'migrate', changes: { shelves: [null, n] } }`; `log` never offers undo for `migrate`.
  - `said()` and `effectOf()` know the new types; `effectOf` adds `stock: { location, material, from, to }[]` (`null` = no line).

- [ ] **Step 1: Write the failing tests**

```js
test('Anna puts 40 and then 10 more on E9 H5, takes 5, and the shelf holds 45', async () => { /* shelfPut ×2, shelfTake 5 → locationCard('E9 H5').stock[0].quantity === 45; log types ['shelf-take','shelf-put','shelf-put'] */ })
test('taking more than the shelf holds, or from an emptied line, changes nothing', async () => { /* STOCK_TOO_LOW, then pc2 takes all → pc1 STOCK_GONE; quantity unchanged after the refusals */ })
test('pallets never go on a lagerhylde, stock never on a pallet place; a pallet place is full at one, a floor never', async () => {
  // putAway onto E9 H5 → LOCATION_IS_SHELF; shelfPut onto A1.1 → NOT_A_SHELF; second pallet onto Palle A1.1 → LOCATION_FULL; 3 pallets onto Gulv F1.0 → ok
})
test('a pick place is refilled from a shelf when there is no reserve pallet', async () => { /* refill({ location: 'H26', shelf: 'E9 H5', quantity: 10 }) → shelf line −10; materialCard total counts the shelf */ })
test('the rack card shows the shelves highest first with their stock; search finds the rack', async () => { /* rackCard({ rack: 'E9' }).shelves.map(s => s.location.name) → ['E9 H3','E9 H2','E9 H1'] */ })
test('the migration turns shelf pallets into stock once, also when two PCs open at the same time', async () => {
  // seed E9 H5 (Hylde reserve) with 2 pallets of R162-0717 (10 + 5); await Promise.all([pc1.service.overview(ANNA), pc2.service.overview(ANNA)])
  // → stock quantity 15 (not 30), no pallets on E9 H5, exactly one 'migrate' event; a third overview changes nothing
})
test('an undo of a shelf take puts the quantity back and the dialog effect says so', async () => { /* log(ADA) effect.stock → [{ location: 'E9 H5', material: 'R162-0717', from: 35, to: 40 }] */ })
```

- [ ] **Step 2: Run** `node --test electron/warehouse/locations/service.test.cjs` → FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `node --test electron/warehouse/locations/*.test.cjs` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: læg på, tag fra og flyt på hylder; reolkort; omlægning af hyldepaller"`

### Task 4: Service – create and delete places, racks and shelves

**Files:**
- Modify: `electron/warehouse/locations/service.cjs`
- Test: `electron/warehouse/locations/admin.test.cjs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `locationFrom` sets `rack`/`shelf` from `shelfOf(name)` for type Hylde and ignores `capacity` for Palle (stored 1) and Gulv (stored 0).
  - `createSeries(user, { …, type })` accepts `Gulv`.
  - `createRack(user, { name, shelves, area?, purpose = 'reserve' }) → { created: Location[] }` – `shelves` 1–20 (`RACK_INVALID` otherwise), names `${NAME} H1…Hn`, type Hylde, purpose `reserve` or `pick`; existing names → `LOCATION_EXISTS`; one event `{ type: 'location', changes: { rack: [null, 'E9 (5 hylder)'] } }`.
  - `addShelf(user, { rack }) → { location }` – next number, purpose and area of the rack's shelves.
  - `deleteLocations(user, { locations: string[], allOrNothing = false }) → { deleted: string[], kept: { name, reason }[] }` – at most 500 (`SERIES_TOO_LARGE`); a place with pallets or stock is kept with reason "Der står 2 paller på A1.1" / "Der står 3 materialer på E9 H5"; `allOrNothing` (delete rack) deletes nothing when any is kept and throws `RACK_NOT_EMPTY` with the kept names; one event `{ type: 'location', location: <only one>, changes: { deleted: [names.join(', '), null] } }`.
  - `setActiveMany(user, { locations: string[], active }) → { changed: number }` – one event.
  - `editLocation`: a rename moves the shelf's stock lines to the new id (`stockId` changes); changing a lagerhylde with stock to another type or purpose → `LOCATION_NOT_EMPTY` ("Der står 3 materialer på E9 H5").
  - `list` adds `rack`, `shelf`, `stockCount` per place.

- [ ] **Step 1: Write the failing tests**

```js
test('a rack is created with its shelves in one action, and a shelf is added with the next number', async () => { /* createRack({ name: 'e9', shelves: 3 }) → E9 H1..H3, rack 'E9'; addShelf → E9 H4; shelves: 0 and 21 → RACK_INVALID; one log line per action */ })
test('only empty places are deleted; the rest are kept with the reason, in one log line that can be undone', async () => {
  // A1.1 has a pallet, E9 H2 has stock, C1.1 and C1.2 are empty → deleted ['C1.1','C1.2'], kept [{ name: 'A1.1', reason: /1 palle/ }, { name: 'E9 H2', reason: /1 materiale/ }]
  // undo of that line brings C1.1 and C1.2 back
})
test('deleting a rack deletes all its shelves or none', async () => { /* one shelf has stock → RACK_NOT_EMPTY, nothing deleted; after taking it → all deleted */ })
test('renaming a shelf keeps its stock; making a stocked shelf a pick shelf is refused', async () => { /* E9 H5 → E9 H6: locationCard('E9 H6').stock length 1; purpose pick → LOCATION_NOT_EMPTY */ })
test('a place that got a pallet between the list and the click is kept, the others deleted', async () => { /* putAway onto C1.2 then deleteLocations(['C1.1','C1.2']) → kept C1.2 */ })
test('a plain user cannot create racks or delete places', async () => { /* LOCATIONS_MANAGER_ONLY for createRack, addShelf, deleteLocations, setActiveMany */ })
```

- [ ] **Step 2: Run** `node --test electron/warehouse/locations/admin.test.cjs` → FAIL.
- [ ] **Step 3: Implement** the Interfaces above.
- [ ] **Step 4: Run** `node --test electron/warehouse/locations/*.test.cjs` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: opret reol, tilføj hylde og slet placeringer (én, reol eller mange)"`

### Task 5: Import – shelf rows become stock

**Files:**
- Modify: `electron/warehouse/locations/sheetImport.cjs`, `electron/warehouse/locations/service.cjs` (`applyImport`)
- Test: `electron/warehouse/locations/sheetImport.test.cjs`

**Interfaces:**
- Produces: `planImport(...)` also returns `stock: line[]` and `stats.stock`; a lagerhylde's rows with material and quantity become one line per material (summed) instead of pallets; Hylde names matching `shelfOf` get `rack`/`shelf`; a `Palle` place with more than one pallet row warns `PALLET_PLACE_MANY` ("flere paller på en palleplads – ret typen til Gulv eller flyt pallerne") and keeps all pallets. `applyImport` writes `tx.stock` and sets `meta.shelvesMigratedAt`.

- [ ] **Step 1: Write the failing test** – `test('rows on a lagerhylde become summed stock, rack and shelf are read from the name, and a crowded pallet place is warned about')`: rows `E9 H5 Hylde R162-0717 10`, `E9 H5 Hylde R162-0717 5`, `E9 H5 Hylde R133-0032 7`, `A1.1 Palle R162-0717 3`, `A1.1 Palle R162-0717 4` → `plan.stock` quantities `{ 'E9 H5|R162-0717': 15, 'E9 H5|R133-0032': 7 }`, no pallets on E9 H5, E9 H5 `rack 'E9' shelf 5`, A1.1 keeps 2 pallets and a `PALLET_PLACE_MANY` warning; PLUK shelf rows stay fixed materials as today.
- [ ] **Step 2: Run** `node --test electron/warehouse/locations/sheetImport.test.cjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test electron/warehouse/locations/*.test.cjs` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: import lægger hylderækker som hyldelager"`

### Task 6: IPC, bridge, types and error texts

**Files:**
- Modify: `electron/warehouse/register.cjs`, `electron/warehouse/locations/outbox.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts`, `src/lib/warehouse/errors.ts`
- Test: `electron/warehouse/register.test.cjs`, `electron/warehouse/locations/outbox.test.cjs`

**Interfaces:**
- Produces: reads `rack-card` → `rackCard`; writes `shelf-put`, `shelf-take`, `shelf-move`, `shelf-set` (queued), `create-rack`, `add-shelf`, `delete-locations`, `set-active-many` (not queued); preload `locations.rackCard/shelfPut/shelfTake/shelfMove/shelfSet/createRack/addShelf/deleteLocations/setActiveMany`; `QUEUED_METHODS` adds the four shelf methods.
- Types: `Location.rack?: string; shelf?: number`; `StockLine`; `LocationCardView.stock`; `MaterialCardView.shelves`; `RackCardView`; `SearchResult.racks`; `LocationEventType` adds `'shelf-put' | 'shelf-take' | 'shelf-move' | 'shelf-set' | 'migrate'`; `UndoEffect.stock`; listed places `rack`, `shelf`, `stockCount`; `DeleteResult`.
- Error texts (da/en): `LOCATION_IS_SHELF` "Pladsen er en hylde – brug Læg på hylde.", `NOT_A_SHELF` "Pladsen er ikke en lagerhylde.", `STOCK_TOO_LOW` "Der er ikke så mange på hylden.", `STOCK_GONE` "Materialet er ikke på hylden længere.", `RACK_INVALID` "Ugyldig reol – 1 til 20 hylder.", `RACK_NOT_EMPTY` "Reolen har hylder med indhold – tøm dem først."

- [ ] **Step 1: Write the failing tests** – register: the channel lists include the new ones; `locations:shelf-put` with M: down is queued and replayed once (like `take`); outbox: `QUEUED_METHODS` sorted equals `['changeSloc','editPallet','move','putAway','refill','shelfMove','shelfPut','shelfSet','shelfTake','take','undo']`.
- [ ] **Step 2: Run** `node --test electron/warehouse/register.test.cjs electron/warehouse/locations/outbox.test.cjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the same, `npx tsc -b` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: kanaler og typer til hylder, reoler og sletning"`

### Task 7: Front-end helpers

**Files:**
- Modify: `src/lib/warehouse/locations.ts`
- Test: `src/lib/warehouse/locations.test.ts`

**Interfaces:**
- Produces: targets `{ kind: 'shelf'; id?: string }` (Læg på hylde) and `{ kind: 'rack'; id: string }`; `targetFromItem('rack:E9')`, `targetFromItem('shelf:E9 H5')`; `describeEvent` for `shelf-put` "Lagt på E9 H5 · 40", `shelf-take` "Taget fra E9 H5 · 5", `shelf-move` "Flyttet E9 H5 → E9 H2 · 10", `shelf-set` "Antal rettet på E9 H5: 40 → 38", `migrate` "Hyldepaller lagt om til hyldelager", location `deleted` "Placeringen C1.1 slettet" / "3 placeringer slettet", `rack` "Reol E9 oprettet (5 hylder)" (all with en); `describeUndoEffect` stock lines "R162-0717 på E9 H5 får 40 stk. igen (nu 35)" / "R162-0717 fjernes fra E9 H5" / "R162-0717 kommer tilbage på E9 H5 (40 stk.)".

- [ ] **Step 1: Write the failing tests** with the exact strings above (da, and one en each for shelf-put and the stock effect).
- [ ] **Step 2: Run** `npx vitest run src/lib/warehouse` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/warehouse` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: tekster for hylder, reoler og sletning"`

### Task 8: Screens for daily work with shelves

**Files:**
- Create: `src/views/warehouse/locations/ShelfPut.tsx`, `src/views/warehouse/locations/RackCard.tsx`
- Modify: `LocationsHome.tsx`, `Locations.tsx`, `TakePallet.tsx`, `Refill.tsx`, `MovePallet.tsx`, `LocationCard.tsx`, `MaterialCard.tsx`, `FetchGuide.tsx`, `SearchResults.tsx`

**Interfaces:**
- Consumes: Task 6 bridge, Task 7 helpers.
- Screens (Danish copy fixed by the spec):
  - Front page: new task **"Læg på hylde"** next to "Sæt palle på plads"; "Tag en palle" → **"Tag"**; "Flyt palle" → **"Flyt"**.
  - ShelfPut: field "Hylde" (scan/write, `E9 H5`), "Materiale" (suggestions with description as in FetchGuide), "Antal", optional "49/50-nummer" (fills material and quantity from `lookupDocument`), preview "40 stk. → 50 stk." when the line exists, **Gem** → toast "Lagt på E9 H5: 10 stk. R162-0717"; hylde suggestions from `materialCard().shelves` first, else rack/area.
  - Tag: under the reserve pallets the section **"På hylder"** with `E9 H5 · 40 stk.`, field "Antal" and buttons **"Tag X stk."** / **"Tag alt"**.
  - Fyld pluk-plads op: without a reserve pallet the shelf suggestion with "Antal taget fra hylden" and **"Fyldt op fra E9 H5"**.
  - Flyt: scanning a lagerhylde lists its lines (radio), "Antal", "Ny hylde" → **Flyt** → toast "10 stk. flyttet fra E9 H5 til E9 H2".
  - LocationCard of a lagerhylde: the lines with **"Tag"**, **"Flyt"**, **"Ret antal"** (dialog with the new quantity), and a link to its rack ("Reol E9").
  - RackCard: shelves highest first with their lines; clicking a shelf opens its card.
  - MaterialCard and FetchGuide: section **"På hylder"**; total includes shelves. SearchResults: a "Reoler" group.

- [ ] **Step 1: Run** `npx tsc -b` and `npx vitest run src` after building the screens → PASS (screen behaviour is proven by the E2E in Task 11; `englishCoverage.test.ts` must stay green).
- [ ] **Step 2: Commit** — `git commit -m "Placeringer: læg på hylde, tag og flyt fra hylder, reolkort"`

### Task 9: Administration screen – racks, delete, select many, filters

**Files:**
- Modify: `src/views/warehouse/locations/Admin.tsx`, `src/views/warehouse/locations/LocationCard.tsx`, `src/views/warehouse/locations/RackCard.tsx`

**Interfaces:**
- Consumes: Task 6 bridge (`createRack`, `addShelf`, `deleteLocations`, `setActiveMany`, `list` with `rack/shelf/stockCount`).
- Screens:
  - Admin: buttons **"Opret placering"**, **"Opret serie"** (type list includes Gulv), **"Opret reol"** (dialog: Navn, Antal hylder 1–20, Område, Formål Lager/Pluk).
  - Location dialog: type decides the fields – Palle: no capacity ("1 palle"); Gulv: no capacity ("ingen grænse"); Hylde: name `E9 H5` shows "Reol E9, hylde 5"; Bord/Swap/Reol: capacity as today.
  - List: filters **Område**, **Type**, **"Kun tomme"**; a checkbox per row and **"Vælg alle i søgningen"**; with a selection **"Slet valgte"** (confirm "Slet N placeringer? Kun tomme slettes.") and **"Deaktivér valgte"**; the result dialog lists `kept` with reasons; toast "N placeringer slettet".
  - LocationCard (admin): **"Slet"** (disabled with tooltip when not empty); RackCard (admin): **"Tilføj hylde"**, **"Fjern hylde"** (the top shelf, only when empty) and **"Slet reol"** (shows `RACK_NOT_EMPTY` names).

- [ ] **Step 1: Run** `npx tsc -b` and `npx vitest run src` → PASS.
- [ ] **Step 2: Commit** — `git commit -m "Placeringer: opret reol, slet og vælg flere i Administrér placeringer"`

### Task 10: Hubert and the guide

**Files:**
- Modify: `electron/assistantLocations.cjs`, `electron/assistantAppGuideWarehouse.cjs`, `electron/assistantAppGuideWarehouseI18n.cjs`
- Test: `electron/assistantLocations.test.cjs`, `electron/assistantWarehouseGuide.test.cjs`

**Interfaces:**
- Consumes: `materialCard().shelves`, `locationCard().stock`, `rackCard` (Task 3).
- Produces: a shelf token `/(?<![\p{L}\p{N}])([a-z]{1,4}\d{1,3}) h(\d{1,2})(?![\p{L}\p{N}])/iu` read before places (so `E9 H5` is one place, not E9 and H5) and a rack question ("hvad står i reol E9", "what is in rack E9", "mitä hyllyssä E9 on", "vad står i reol E9") → intent `rack`; "hvor henter jeg …" adds the line `Hylder: E9 H5 (40 stk.), E9 H2 (10 stk.)` (en "Shelves", fi "Hyllyt", sv "Hyllor"); "hvad står på E9 H5?" lists the stock lines; rack answer lists shelves highest first with a button `rack:E9`; "læg 10 på E9 H5" / "slet A1.1" → read-only answer. Guide tasks `locations-shelf-put` ("Læg på hylde"), `locations-rack-create` ("Opret reol"), `locations-delete` ("Slet placeringer") in 4 languages; "Tag en palle"/"Flyt palle" in existing guide steps renamed to "Tag"/"Flyt".

- [ ] **Step 1: Write the failing tests** – the intents above in four languages; the answers' lines and buttons with the fake service extended with `shelves`, `stock`, `rackCard`; the guide answers "hvordan lægger jeg noget på en hylde?", "how do I create a rack?", "miten poistan sijainteja?", "hur skapar jag en reol?" with the new tasks.
- [ ] **Step 2: Run** `node --test electron/assistantLocations.test.cjs electron/assistantWarehouseGuide.test.cjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test electron/assistant*.test.cjs` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Hubert: hylder og reoler i Placeringer"`

### Task 11: E2E, full verification and notes

**Files:**
- Modify: `scripts/verify-locations.cjs`, `src/lib/changelog.ts`, `plans/placeringer-afgoerelser.md`, `plans/development-1.6.5.md`

- [ ] **Step 1: Extend the E2E** (and rename its "Tag en palle"/"Flyt palle" clicks to "Tag"/"Flyt"):
  - the manager opens Administrér placeringer → **"Opret reol"** E9 with 3 hylder → E9 H1–H3 exist;
  - Anna: **"Læg på hylde"** `E9 H2`, R162-0717, 40 → Gem; again 10 → the preview shows "40 stk. → 50 stk." → the shelf card shows 50;
  - Anna: **"Tag"** R162-0717 → "På hylder" `E9 H2 · 50 stk.` → Tag 5 → 45;
  - "Hvor henter jeg?" R162-0717 shows `E9 H2`;
  - the manager deletes the empty `E9 H3` (Slet on its card) → gone; "Slet reol" E9 → refused, naming E9 H2;
  - the manager filters "Kun tomme" in area C, "Vælg alle i søgningen", "Slet valgte" → the result names the kept ones (if any) and the deleted count matches.
- [ ] **Step 2: Run** `node scripts/verify-locations.cjs` (Vite on 5064) → `ALLE TJEK OK`.
- [ ] **Step 3: Full verification** – all electron tests from PowerShell, `npx vitest run`, `npx tsc -b`, `node scripts/verify-warehouse.cjs` → all green.
- [ ] **Step 4: Changelog (1.6.5) + notes** – reoler med hylder og hyldelager (materiale og antal), pallepladser til én palle og gulvpladser uden grænse, "Læg på hylde", opret reol, slet placeringer (én, reol eller flere på én gang); the one-time migration; rulings to `plans/placeringer-afgoerelser.md`; `plans/development-1.6.5.md` line.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: reoler og hylder – E2E, changelog og noter"`
