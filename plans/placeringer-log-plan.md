# Placeringer – log, fortryd og Placerings admin – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shared log of everything in Placeringer, undo of one action at a time for managers and the new role Placerings admin (given in Manager Panel).

**Architecture:** `repository.transact` already holds the state before and after every transaction, so it records the change (the pallets and locations that differ, before and after) on the transaction's first history event, and gives all its events one `tx` id. A pure `undo.cjs` turns a recorded change plus the current state into the opposite change or a conflict. The service adds `log` and `undo`; roles get `locationAdmins`; the screens get a log page and the Manager Panel card becomes "Lagerstyringsroller".

**Tech Stack:** Electron 44 main (CommonJS, node:test), React 19 + TypeScript + Tailwind (vitest), playwright-core E2E.

**Spec:** `plans/placeringer-log-design.md`

## Global Constraints

- Only TCD and TRR; the hub is the team (`teamOf`, `WAREHOUSE_TEAM_NOT_ALLOWED`).
- Everyone in the team sees the log; only managers (Hub `manager`/`creator`) and Placerings admins undo and maintain locations. Optælling's `admin` and `status-manager` give **no** rights in Placeringer.
- Only a (Hub) manager grants or removes Placerings admin; the role is given only in Manager Panel.
- One action at a time; an undo only when everything the action touched still equals what it left (`after`); later work is never rolled back. An undo is itself logged and cannot be undone. Import cannot be undone.
- A full place never blocks an undo.
- Error codes: `UNDO_CONFLICT` (Danish detail naming the later event), `UNDO_NOT_POSSIBLE`, `UNDO_ALREADY`, `UNDO_NOT_FOUND`, `LOCATIONS_MANAGER_ONLY`.
- All UI text through `t(da, en)`; Manager Panel card and Hubert guide in da/en/fi/sv. Danish user-facing copy as in the spec.
- Data stays in `<team>\lagerstyring` (`placeringer` store and `roller`); no new files on M:.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. No push.

## Review Focus

- An undo of a put-away of several pallets where one was taken since → refused as a whole, nothing half-undone → Task 1 + Task 2 tests.
- An undo of "placering oprettet" after a pallet was put on it → refused (the pallet would point at a missing place) → Task 1 test.
- An undo of a location rename (id changes) → old id back, new id gone, its pallets back on the old id → Task 1 test.
- Two people undo the same action at the same time → one succeeds, the other gets `UNDO_ALREADY` → Task 2 test.
- An undo while M: is down → queued once and replayed once (action id) → Task 5 test.

---

## File structure

- Create `electron/warehouse/locations/undo.cjs` – pure: `changeOf(before, after)`, `undoPlan(change, state)`.
- Modify `electron/warehouse/locations/repository.cjs` – record `tx`/`change`; `undo(team, …)`; `history` filters.
- Modify `electron/warehouse/roles.cjs` – `locationAdmins`, `isLocationAdmin`, `setLocationAdmin`, `list` columns.
- Modify `electron/warehouse/locations/service.cjs` – `isLocationAdmin` dependency, `log`, `undo`.
- Modify `electron/warehouse/locations/outbox.cjs`, `electron/warehouse/register.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts`.
- Create `src/views/warehouse/locations/LocationsLog.tsx`; modify `Locations.tsx`, `LocationsHome.tsx`, `src/lib/warehouse/locations.ts`, `src/lib/warehouse/errors.ts`.
- Modify `src/components/warehouse/WarehouseRolesCard.tsx`, `electron/assistantAppGuideWarehouse.cjs`, `…I18n.cjs`.
- Modify `electron/assistantLocations.cjs`.
- Modify `scripts/verify-locations.cjs`, `src/lib/changelog.ts`, `plans/placeringer-afgoerelser.md`.

---

### Task 1: The pure undo rules

**Files:**
- Create: `electron/warehouse/locations/undo.cjs`
- Test: `electron/warehouse/locations/undo.test.cjs`

**Interfaces:**
- Produces: `changeOf(before: State, after: State): Change | null` where `State = { locations, pallets }` and `Change = { before: { pallets: {[id]: Pallet|null}, locations: {[id]: Location|null} }, after: { same } }` – only ids whose JSON differs; `null` = absent; returns `null` when nothing differs.
- Produces: `undoPlan(change: Change, state: State): { ok: true, state: State } | { ok: false, conflict: { kind: 'pallet'|'location', id: string } }` – pure; `state` is the new `{ locations, pallets }` (clones).

- [ ] **Step 1: Write the failing tests** (`undo.test.cjs`, fixtures built inline as in `rules.test.cjs`)

```js
test('changeOf keeps only what differs, with null for what did not exist', () => { /* putAway of p1 on A1.1: before.pallets.p1 === null, after.pallets.p1 = {...}; untouched A1.2 absent; identical states → null */ })
test('undoPlan puts everything back as it was before when nothing changed since', () => { /* take X: pallet qty 90 → back to 100; take whole: pallet back; move: location back; putaway of p1+p2: both gone */ })
test('undoPlan refuses as a whole when one thing the action touched has changed since', () => { /* putaway p1+p2, then p2.quantity changed → { ok:false, conflict:{ kind:'pallet', id:'p2' } } and p1 is untouched in the result */ })
test('undoing a created place is refused while a pallet stands on it', () => { /* change created C9.9; state has pallet p7 on C9.9 → conflict { kind:'location', id:'C9.9' } */ })
test('undoing a rename brings the old id back and its pallets with it', () => { /* A1.1 renamed A1.9 with pallet p1 moved along → undo: locations.A1.1 back, A1.9 gone, p1.location 'A1.1' */ })
test('a pallet used up on a pick place comes back on undo, a full place does not block', () => { /* move p1 onto pick H1 (after.pallets.p1 null) → undo: p1 back on A1.1 even if A1.1 has capacity 1 and another pallet */ })
```

- [ ] **Step 2: Run** `node --test electron/warehouse/locations/undo.test.cjs` → FAIL (module missing).
- [ ] **Step 3: Implement `changeOf` and `undoPlan`.** Conflict check: every id in `change.after` must currently equal `change.after[id]` (JSON compare, `null` = absent). Apply: set every id to `change.before[id]` (`null` → delete). Then, for every pallet in the result whose location is not in the result's locations → conflict `{ kind: 'location', id: thatLocation }`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: regler for fortryd (før-/efter-billede)"`

### Task 2: Repository records changes and undoes them

**Files:**
- Modify: `electron/warehouse/locations/repository.cjs`
- Test: `electron/warehouse/locations/repository.test.cjs`

**Interfaces:**
- Consumes: `changeOf`, `undoPlan` (Task 1).
- Produces: every event gets `tx: string` (the `actionId` when given, else `newId()`) and `actionId` when given; the **first** event of a transaction gets `change: Change` (from `changeOf(before, tx)`) unless `transact(team, { snapshot: false }, fn)`.
- Produces: `undo(team, { tx: string, at: number, by: Person, actionId?: string }): Promise<{ undone: number }>` – locks the state keys, the current month and `monthKey(at)`; throws `UNDO_NOT_FOUND` (no event with that `tx` in that month), `UNDO_NOT_POSSIBLE` (no `change`, or an `import`/`undo` event), `UNDO_ALREADY` (already `undoneAt`), `UNDO_CONFLICT` with `{ conflict }` from `undoPlan`; on success writes the new state, sets `undoneAt`/`undoneBy` on all events of that `tx`, appends `{ type: 'undo', by, undoes: tx, material, location, pallet }` (taken from the first event) with its own `change`, and records `actionId` in `meta.applied` like `transact`.
- Produces: `history(team, { months = 3, location, pallet, material, person, type, since })` – `person` = `by.email`, `type` = event type, `since` = ms.

- [ ] **Step 1: Write the failing tests**

```js
test('a transaction records one tx id on all its events and the change on the first', async () => { /* transact with two events → same tx; events[0].change.before/after present; events[1].change undefined; snapshot:false → no change */ })
test('undo restores the state, marks the events and logs the undo', async () => { /* put p1, undo → p1 gone; history: original undoneAt set, new event type 'undo' undoes tx */ })
test('undo is refused when something changed since, when already undone, for import and for old events', async () => { /* UNDO_CONFLICT with conflict.id, UNDO_ALREADY, UNDO_NOT_POSSIBLE (event without change, import), UNDO_NOT_FOUND */ })
test('two PCs undo the same action at once: one succeeds, the other gets UNDO_ALREADY', async () => { /* two repos on one folder, Promise.allSettled */ })
test('an undo of an event from last month locks and marks that month', async () => { /* clock in October, put; clock November, undo with at from October → October file marked */ })
test('history filters by person, type and since', async () => {})
```

- [ ] **Step 2: Run** `node --test electron/warehouse/locations/repository.test.cjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test electron/warehouse/locations/*.test.cjs` → PASS (existing tests unchanged).
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: hændelser gemmer før-/efter-billede; repository kan fortryde"`

### Task 3: The role Placerings admin

**Files:**
- Modify: `electron/warehouse/roles.cjs`
- Test: `electron/warehouse/roles.test.cjs`

**Interfaces:**
- Produces: `isLocationAdmin(user): Promise<boolean>` – true for Hub manager/creator and for emails in `locationAdmins` (not for `statusManager` alone).
- Produces: `setLocationAdmin(user, { email, admin: boolean }): Promise<{ email, locationAdmin: boolean }>` – only a Hub manager (not a status manager) → else `MANAGER_ONLY`; same validation as `setRole` (`ROLE_INVALID`); log actions `location-admin-added` / `location-admin-removed`.
- Produces: `list(user)` users get `locationRole: 'manager' | 'location-admin' | 'user'`; `roleOf` unchanged.

- [ ] **Step 1: Write the failing tests**

```js
test('a manager makes a colleague Placerings admin, independent of the Optælling role, and it is logged', async () => { /* setRole(anna,'admin') + setLocationAdmin(anna,true) → list: role 'admin', locationRole 'location-admin'; log has 'location-admin-added'; setLocationAdmin(false) → 'user' + 'location-admin-removed'; setRole(anna,'user') keeps locationAdmin */ })
test('only a Hub manager grants Placerings admin; a status manager or admin cannot', async () => { /* rejects { code: 'MANAGER_ONLY' } for a status manager (statusManager:true) and for a user; ROLE_INVALID for a manager target or an email outside the team */ })
test('isLocationAdmin: managers and Placerings admins yes; Optælling admin and status manager no', async () => { /* manager true, creator true, location admin true, Optælling admin false, status manager false, user false */ })
```

- [ ] **Step 2: Run** `node --test electron/warehouse/roles.test.cjs` → FAIL.
- [ ] **Step 3: Implement** (`locationAdmins` next to `admins`/`statusManagers` in the `roller` value; `change()` keeps it).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Lagerstyring: rollen Placerings admin"`

### Task 4: Service – rights, log and undo

**Files:**
- Modify: `electron/warehouse/locations/service.cjs`
- Test: `electron/warehouse/locations/admin.test.cjs`, `electron/warehouse/locations/service.test.cjs`, `electron/warehouse/locations/sheetImport.test.cjs`

**Interfaces:**
- Consumes: `repo.undo`, `repo.history` filters (Task 2); `isLocationAdmin` (Task 3).
- Produces: `createLocationService({ …, isLocationAdmin })` replaces `roleOf` for rights: `requireAdmin(user)` = `user.role` manager/creator or `await isLocationAdmin(user)`, else `LOCATIONS_MANAGER_ONLY`. `list().canAdmin` follows it.
- Produces: `log(user, { query?, person?, type?, days = 90 }) → { events: (LocationEvent & { canUndo: boolean, reason?: string, description: string })[], canUndo: boolean /* the person may undo */ , people: { email, name }[] }` – newest first, max 500; `query` matches material/location/pallet/`document` of the pallet in `change`; `canUndo` per event = has `change`, not `import`/`undo`, not undone, and `undoPlan` would succeed against the current state; `reason` = Danish text otherwise ("Kan ikke fortrydes – Bo tog 5 stk. kl. 10:02", "Allerede fortrudt", "Fra før loggen kunne fortryde").
- Produces: `undo(user, { eventId, actionId }) → { undone: number }` – admin only; finds the event (3 months); `repo.undo(team, { tx, at, by, actionId })`; on `UNDO_CONFLICT` rethrows with the Danish detail naming the latest later event that touched the conflicting id ("Bo Berg tog 5 stk. fra A1.1 kl. 10:02 – fortryd den først").
- `applyImport` uses `transact(team, { snapshot: false }, …)`.

- [ ] **Step 1: Write the failing tests**

```js
// admin.test.cjs – roleOf in setup() becomes isLocationAdmin: user => ADA (Placerings admin)
test('Optælling admins and status managers cannot maintain locations; Placerings admins and managers can', async () => { /* createLocation by an Optælling admin → LOCATIONS_MANAGER_ONLY; by ADA (isLocationAdmin true) → ok; list(ADA).canAdmin true, list(ANNA).canAdmin false */ })
// service.test.cjs
test('the log shows every action newest first with who and what, for everyone in the team', async () => { /* putAway then take by ANNA → log(ANNA).events types ['take','putaway'], by.name 'Anna', canUndo false for ANNA; filters person/type/query narrow it; people lists Anna */ })
test('a Placerings admin undoes a take: the pallet is back and both lines are in the log', async () => { /* take 10 of 100 → undo(ADA,{eventId}) → quantity 100; log: take has undoneBy.name 'Ada', newest line type 'undo' */ })
test('an undo is refused with the later action named when something changed since', async () => { /* take 10 (Anna) then take 5 (Bo) → undo of the first rejects { code: 'UNDO_CONFLICT' } and the message matches /Bo .*5 stk.*fortryd den først/; log marks it canUndo false with that reason */ })
test('a plain user cannot undo (LOCATIONS_MANAGER_ONLY) and sees canUndo false', async () => { /* undo(ANNA) rejects LOCATIONS_MANAGER_ONLY; log(ANNA).canUndo false */ })
test('an import is in the log but cannot be undone', async () => { /* after applyImport the 'import' event has no change, canUndo false, undo → UNDO_NOT_POSSIBLE */ })
```

- [ ] **Step 2: Run** `node --test electron/warehouse/locations/*.test.cjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: log og fortryd i servicen; Placerings admin styrer rettighederne"`

### Task 5: IPC, bridge, types and the queue

**Files:**
- Modify: `electron/warehouse/register.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts`, `electron/warehouse/locations/outbox.cjs`, `src/lib/warehouse/errors.ts`
- Test: `electron/warehouse/register.test.cjs`, `electron/warehouse/locations/outbox.test.cjs`

**Interfaces:**
- Produces IPC: `warehouse:locations:log` (read), `warehouse:locations:undo` (write, through the outbox: `QUEUED_METHODS` gets `'undo'`), `warehouse:roles:set-location-admin`; `warehouse:roles:me` returns `{ role, locationAdmin: boolean }`.
- Produces bridge: `electronWarehouse.locations.log(request)`, `.undo(request /* WithActionId<{ eventId }> */)`; `electronWarehouse.roles.setLocationAdmin({ email, admin })`.
- Produces types: `LocationEvent` gains `tx?`, `change?`, `undoneAt?`, `undoneBy?`, `undoes?`, type `'undo'`; `LocationLog`; `RolesView.users[].locationRole`, log actions `location-admin-added|removed`.
- Error texts da/en: `UNDO_CONFLICT` "Handlingen kan ikke fortrydes – noget er ændret siden.", `UNDO_NOT_POSSIBLE` "Handlingen kan ikke fortrydes.", `UNDO_ALREADY` "Handlingen er allerede fortrudt.", `UNDO_NOT_FOUND` "Handlingen findes ikke i loggen."

- [ ] **Step 1: Write the failing tests** – register: the three channels exist; `roles:me` has `locationAdmin`; a manager sets a Placerings admin over IPC and that person may `create-location`. outbox: `QUEUED_METHODS` includes `undo`; a queued undo replays once.
- [ ] **Step 2: Run** `node --test electron/warehouse/register.test.cjs electron/warehouse/locations/outbox.test.cjs` → FAIL.
- [ ] **Step 3: Implement** (register passes `isLocationAdmin: user => roles.isLocationAdmin(user)` to the service).
- [ ] **Step 4: Run** the tests and `npx tsc -b` → PASS / exit 0.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: IPC og typer for log, fortryd og Placerings admin"`

### Task 6: The log screen

**Files:**
- Create: `src/views/warehouse/locations/LocationsLog.tsx`
- Modify: `src/views/warehouse/locations/Locations.tsx`, `LocationsHome.tsx`, `src/lib/warehouse/locations.ts` (+ `locations.test.ts`)

**Interfaces:**
- Consumes: `locations.log`, `locations.undo`, `roles.me().locationAdmin` (Task 5); `HistoryList` wording from `HistoryList.tsx` (reuse its `describe` by exporting it as `describeEvent`).
- Produces: target `{ kind: 'log'; id?: string }` (`targetFromItem('log')`, `'log:A1.1'` → query prefilled); a "Log" button next to "Administrér placeringer" on the front page for everyone; `canAdmin` in `Locations.tsx` = Hub manager or `roles.me().locationAdmin`.
- Screen: filters (search, person, type, period: i dag / 7 dage / 30 dage / 3 måneder); lines `HH:MM · person · describeEvent · materiale · beskrivelse`, click opens the card; undone lines struck through with "Fortrudt af X kl. HH:MM"; "Fortryd" for admins with a confirm dialog stating what happens; disabled with `reason` as tooltip.

- [ ] **Step 1: Write the failing vitest** – `targetFromItem('log:A1.1')` → `{ kind: 'log', id: 'A1.1' }`; `describeEvent({ type: 'undo', … })` → "Fortrudt: …".
- [ ] **Step 2: Run** `npx vitest run src/lib/warehouse` → FAIL.
- [ ] **Step 3: Implement the screen and wiring.**
- [ ] **Step 4: Run** `npx vitest run src/lib/warehouse` and `npx tsc -b` → PASS (incl. `englishCoverage.test.ts`).
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: loggen med fortryd"`

### Task 7: Lagerstyringsroller in Manager Panel and the guide

**Files:**
- Modify: `src/components/warehouse/WarehouseRolesCard.tsx`, `electron/assistantAppGuideWarehouse.cjs`, `electron/assistantAppGuideWarehouseI18n.cjs`
- Test: `electron/assistantWarehouseGuide.test.cjs`

**Interfaces:**
- Consumes: `roles.list().users[].locationRole`, `roles.setLocationAdmin` (Task 5).
- Card title "Lagerstyringsroller" / "Warehouse roles" / "Varastonhallinnan roolit" / "Lagerstyrningsroller"; per person two selects *Optælling* and *Placeringer* (Bruger / Placerings admin; managers "Automatisk via manager-rollen"); log lines for `location-admin-added|removed`; 4 languages as today.
- Guide task `warehouse-roles` title "Udnævn admin, status manager eller Placerings admin" with a step for Placeringer (4 languages); keywords `placerings admin`, `location admin`, `sijaintien admin`, `placeringsadmin`.

- [ ] **Step 1: Write the failing test** – the guide answers "hvordan gør jeg en kollega til placerings admin?" (and en/fi/sv) with the `warehouse-roles` task.
- [ ] **Step 2: Run** `node --test electron/assistantWarehouseGuide.test.cjs` → FAIL.
- [ ] **Step 3: Implement the card and the guide texts.**
- [ ] **Step 4: Run** the test, `node --test electron/assistant*.test.cjs`, `npx vitest run src`, `npx tsc -b` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Manager Panel: Lagerstyringsroller med Placerings admin"`

### Task 8: Hubert reads the log

**Files:**
- Modify: `electron/assistantLocations.cjs`
- Test: `electron/assistantLocations.test.cjs`

**Interfaces:**
- Consumes: `service.log` (Task 4).
- Produces: intent `'history'` for "hvad er der sket med A1.1 (i dag)?", "hvem flyttede pallen fra C1.3?", "what happened to A1.1 today?", "mitä A1.1:lle on tapahtunut?", "vad har hänt med A1.1?" (a place, material or 49/50 token + a history phrase); answer = up to 8 latest lines (`HH:MM · name · what`), navigation `{ tab: 'locations', itemId: 'log:<token>' }`; Hubert never undoes ("fortryd" requests → read-only answer).

- [ ] **Step 1: Write the failing tests** – the five questions → `history`; the answer lists the fake log lines newest first with the button; "fortryd at Anna tog pallen" → read-only, no service write.
- [ ] **Step 2: Run** `node --test electron/assistantLocations.test.cjs` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `node --test electron/assistant*.test.cjs` → PASS.
- [ ] **Step 5: Commit** — `git commit -m "Hubert: svar fra Placeringers log"`

### Task 9: E2E, verification and notes

**Files:**
- Modify: `scripts/verify-locations.cjs`, `src/lib/changelog.ts`, `plans/placeringer-afgoerelser.md`, `plans/development-1.6.5.md`

- [ ] **Step 1: Extend the E2E** – the manager opens Manager Panel → Rettigheder → "Lagerstyringsroller" and makes Anna Placerings admin; Anna takes 5 stk.; Anna opens "Log", sees the line, presses "Fortryd" and confirms → the pallet has its 5 stk. back; the log shows the take struck through and the undo line; a third (plain) user sees no "Fortryd" (or check over IPC: `undo` → `LOCATIONS_MANAGER_ONLY`).
- [ ] **Step 2: Run** `node scripts/verify-locations.cjs` (Vite on 5064) → `ALLE TJEK OK`.
- [ ] **Step 3: Full verification** – all electron tests from PowerShell, `npx vitest run`, `npx tsc -b`, `node scripts/verify-warehouse.cjs` → all green.
- [ ] **Step 4: Changelog (1.6.5) + notes** – log and undo; the role Placerings admin in Manager Panel; Optælling's roles no longer maintain Placeringer.
- [ ] **Step 5: Commit** — `git commit -m "Placeringer: log og fortryd – E2E, changelog og noter"`
