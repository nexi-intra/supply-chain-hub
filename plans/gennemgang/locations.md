# Audit – Placeringer (Arbejdsværktøjer › Lagerstyring) – Supply Chain Hub 1.6.8

Date: 2026-11-23. Read-only audit. Nothing was changed, no tests were needed to settle a doubt (every claim below was
checked by reading the code paths named under "Where").

Scope read: `electron/warehouse/locations/*.cjs` (service, repository, outbox, undo, rules, shelves, model, catalog,
layout, layoutService, publish, sheetImport), the Placeringer wiring in `electron/warehouse/register.cjs`, the parts of
`electron/store.cjs`, `electron/fileLock.cjs`, `electron/mainActivity.cjs` and `electron/main.cjs` that decide how a
Placeringer write reaches M:, `src/views/warehouse/locations/**/*.tsx` and `src/lib/warehouse/*.ts`.

Not re-reported (already decided): a 49/50 number without year is looked up 2 years back.

## Summary

| Severity | Count |
|---|---|
| Critical | 5 |
| Important | 12 |
| Minor | 15 |

Plus 4 concrete additions at the end.

Index

- C1 Editing a pallet re-sends every field and silently reverts other people's (and your own) takes
- C2 A partial take or refill from a pallet with unknown quantity deletes the whole pallet
- C3 A transaction is committed file by file; a failure mid-commit plus the outbox replay applies the action twice
- C4 Queued actions are thrown away as "failed" on a transient lock timeout (KV_LOCK_BUSY) when M: comes back
- C5 Actions waiting in the window's queue are lost when the Hub is closed or reloaded (and nothing is written ahead)
- I1 Undo can put a pallet back on a place that is now full, reserved or deactivated
- I2 "Ret antal" (shelf) and pallet quantity are blind absolute writes over a stale screen
- I3 Pallets on deactivated, reserved or station places cannot be found by material or taken
- I4 The monthly history file is read and rewritten whole on every action, and re-read by every card
- I5 `meta` (2000 action ids + drawing links) is rewritten on every action and polled every 15 s by every window
- I6 Sæt palle på plads checks the place only on M:, 15–40 s later, and refuses the whole batch
- I7 Front-page search: Enter opens the hit of the previous query (or nothing)
- I8 MaterialPicker: Enter takes a stale highlighted suggestion instead of the scanned number
- I9 Læg på hylde: a 49/50 number with several materials only ever gives the first
- I10 The same 49/50 number / serial numbers can be put away twice without any warning
- I11 Fyld pluk-plads op does not warn when a younger pallet is used (Tag does)
- I12 "Scanninger gemmes lokalt" is shown for Placeringer actions that are not saved locally
- M1 – M15 Minor items
- Additions A1 – A4

---

## Critical

### C1 – Editing a pallet re-sends every field and silently reverts other people's (and your own) takes

- **Where:** `src/views/warehouse/locations/PalletCard.tsx:119-128` (EditDialog builds `changes` with all seven fields and sends all of them), `electron/warehouse/locations/service.cjs:279-303` (`EDITABLE` / `editPallet` writes every field that differs from the stored pallet).
- **What happens today:** The dialog's "changed" check (line 120) only decides whether to send at all. If anything changed, the request contains `material, quantity, receivedAt, document, serials, tags, note` with the values the dialog was opened with. The backend compares each with the pallet *as it is now* and overwrites every difference.
  Scenario A (two PCs): pallet on A2.4 shows 100 stk. on Bo's pallet card. Lis takes 30 on her PC → 70. Bo adds a note "Hjørne skadet" and saves → request has `quantity: 100` → backend sets the pallet back to 100. Lis's take is undone without anyone noticing; the log only shows "Pallen rettet".
  Scenario B (one PC): Bo takes 5 from the pallet in Tag (the take sits 15–40 s in the window's queue), opens the pallet card (it reads 100, the take has not landed), edits the note → the renderer queue runs the take (→95) and then the edit (→100).
- **Why it matters:** Wrong stock with no trace of why; FIFO and the material card's total are off; nobody looks for a problem because the person only changed a note.
- **Exactly what should change:** In `EditDialog.save()` send only the fields in `changed` (`Object.fromEntries(changed.map(f => [f, changes[f]]))`). In the backend, accept an optional `expected` object (the value each changed field had when the dialog opened) and refuse with a new code `PALLET_CHANGED` ("Pallen er ændret af {navn} imens – se den igen") when the stored value differs, at least for `quantity` and `material`.
- **Risk of the change:** Low. The backend already handles a partial `changes` object (it filters to `EDITABLE`); the undo snapshot is unaffected. Old clients that still send everything keep working; only the optional check is new.
- **Severity:** Critical

### C2 – A partial take or refill from a pallet with unknown quantity deletes the whole pallet

- **Where:** `electron/warehouse/locations/service.cjs:92-101` (`takeFrom`: `pallet.quantity === null` → `delete tx.pallets[...]`), used by `take` (142-152) and `refill` from a pallet (170-178); UI: `src/views/warehouse/locations/TakePallet.tsx:110-114` (the "stk." field and "Tag X stk." are shown for every pallet, also "antal ukendt"), `Refill.tsx:62-72` and its quantity field, `src/lib/warehouse/locationActions.ts:94-104` (`takeFromCard` mirrors the deletion).
- **What happens today:** A pallet put away without a quantity (allowed in Sæt palle på plads: the field is optional) shows "antal ukendt". A picker types 5 and presses "Tag 5 stk." The toast says "5 stk. taget fra A2.4", but the pallet is deleted from Placeringer; the log stores `quantity: null`. The pallet is still physically on A2.4 with the rest of the goods.
- **Why it matters:** Physical stock disappears from the system; the place shows as free, so the next put-away is sent to an occupied place (LOCATION_FULL is never raised because the pallet is gone); FIFO skips it.
- **Exactly what should change:** In `takeFrom`, when `pallet.quantity === null` and an amount is given, keep the pallet (quantity stays null) and log the take with `quantity: amount`; delete only on "Tag hele pallen" (no amount). Mirror it in `takeFromCard`. In TakePallet/Refill, label the field for such pallets "stk. taget (pallen bliver stående)" and offer "Tæl pallen" (see A4).
- **Risk of the change:** Low. Undo snapshots are by value, so they keep working. Anyone who relied on "type a number to clear an unknown pallet" now uses "Tag hele pallen".
- **Severity:** Critical

### C3 – A transaction is committed file by file; a failure mid-commit plus the outbox replay applies the action twice

- **Where:** `electron/warehouse/locations/repository.cjs:31-35` (`writeState` sets `locations, pallets, stock, tags`, then `meta` with the applied action id) and `:99-103` (history is set last); `electron/store.cjs:751-768` (`withLockedKeysAsync` renames the prepared temp files **one at a time** in that order); `electron/warehouse/locations/outbox.cjs:113-126` and `register.cjs:442` (a storage error queues the action for replay); `repository.cjs:92` (the duplicate check only looks at `meta.applied`).
- **What happens today:** For a put-away the commit is `pallets` → `meta` → `history-YYYY-MM`. If M: drops (EIO / ECONNRESET / ETIMEDOUT) after `pallets` is renamed but before `meta` is, the call throws a storage error. The outbox treats it as "not done", queues it and replays it later. The replay finds no action id in `meta.applied`, runs the put-away again with a new UUID → **two pallets** for one physical pallet. For a partial take the quantity is reduced twice. If the failure is between `meta` and the history file, the action is applied but has no log line, so it cannot be seen or undone. The same happens if the rename of `pallets` reached the server but the SMB answer was lost (ECONNRESET after success).
  Second, smaller window: the dedupe list keeps the last 2000 ids (`KEEP_APPLIED`); a PC that comes back after a weekend with an action whose first attempt actually landed can re-apply it once 2000 other actions have happened.
- **Why it matters:** Duplicated pallets / double deductions exactly when M: is flaky – the situation the outbox was built for. Nobody sees it until a count.
- **Exactly what should change:** Make the commit roll forward instead of half-done: (1) write the action's whole result (all new key values + action id) as one journal key `tx-<actionId>` first, (2) rename the data keys, (3) delete the journal. At the start of every `transact`/`undo`, under the same locks, finish any journal left behind (re-apply its values) before running `fn`. As a cheap first step, also make put-away idempotent on its own: derive pallet ids from the action id (`${actionId}:${index}`) and skip creating a pallet that already exists.
- **Risk of the change:** Medium: it touches the shared write path (also 1.6.6 clients write these keys; a journal key they don't know is harmless, but they would not finish one). The deterministic pallet id alone is low risk.
- **Severity:** Critical

### C4 – Queued actions are thrown away as "failed" on a transient lock timeout (KV_LOCK_BUSY) when M: comes back

- **Where:** `electron/warehouse/register.cjs:442` (`isStorageError` = `STORAGE_UNAVAILABLE` or an fs code; `KV_LOCK_BUSY` is not one), `electron/warehouse/locations/outbox.cjs:68-77` (any other error → recorded as a failure, `markApplied`, never retried), `electron/fileLock.cjs:277-293` and `store.cjs:29` (a lock that stays busy for ~60 rounds throws `KV_LOCK_BUSY`).
- **What happens today:** M: is down for 10 minutes; five PCs queue actions. When it comes back every PC's 30-s timer flushes at the same time, all of them need the same `locations`/`meta`/`history` locks, and some transactions give up with `KV_LOCK_BUSY`. The outbox records each of those as a permanent failure, drops it from the queue and shows "En handling gemt på denne PC kunne ikke gennemføres: Lageret er optaget lige nu. Prøv igen om et øjeblik." – but there is nothing to try again; the request is gone once the toast was shown (`acknowledge`). The same code path also hits a direct (not queued) action on a busy morning: it is refused instead of waiting.
- **Why it matters:** Put-aways, takes and moves that people did while M: was down are lost right after M: returns, and the person who sees the toast may not be the one who did the work.
- **Exactly what should change:** Treat `KV_LOCK_BUSY` (nothing was written – the lock was never taken) as retryable: in `register.cjs` add it to the retry set used by the outbox (keep the action at the head of the queue, `wentDown()` with a short pause, e.g. 5 s plus jitter), and in `submit` queue a direct action that fails with it instead of throwing. Only business errors (`PALLET_GONE`, `LOCATION_FULL`, …) should become failures.
- **Risk of the change:** Low. `KV_LOCK_BUSY` is thrown before the callback runs, so a retry can never double-apply; the action id dedupe stays as the safety net.
- **Severity:** Critical

### C5 – Actions waiting in the window's queue are lost when the Hub is closed or reloaded (and nothing is written ahead)

- **Where:** `src/lib/warehouse/locationActions.ts:56-90` (every action waits in an in-memory `queue` in the window until the previous one is done – "one action is a transaction of 15–40 s"), `electron/main.cjs:825-836` + `electron/mainActivity.cjs:19-33` (the close guard only waits for IPC calls that are already running in main), `electron/warehouse/locations/outbox.cjs:113-126` (an action is written to `locations-outbox.json` only after it failed with a storage error).
- **What happens today:** At the end of a shift Bo takes three pallets quickly. The screen and the toasts say all three are taken. Take 1 is on its way to M:; takes 2 and 3 wait in the window. Bo closes the Hub: the guard sees take 1 running and waits; when take 1 finishes, `whenIdle` resolves synchronously, before the window has sent take 2 → the window closes and takes 2 and 3 never reach main. The same happens on a renderer reload or crash, on "Luk alligevel", and on a PC that is switched off while take 1 is being written (it is not in the outbox file yet).
- **Why it matters:** Stock the user was told is registered is never registered, with no failure message anywhere.
- **Exactly what should change:** (1) Hand every action to main at once (drop the renderer queue; main's outbox already keeps order per PC: `submit` puts an action behind the queue when the queue is not empty). (2) In `outbox.submit`, append the entry to the outbox file **before** calling `run` (write-ahead) and remove/mark it after success; the replay is safe because of the action id. (3) Until then at least, let the window report `locationActionsInFlight()` to main and include it in `hasPendingWrites`.
- **Risk of the change:** Medium for (1) (screens rely on "one at a time" for their optimistic state – the order is still kept by main). (2) is low risk (one extra local file write per action, on the local disk, not M:).
- **Severity:** Critical

---

## Important

### I1 – Undo can put a pallet back on a place that is now full, reserved or deactivated

- **Where:** `electron/warehouse/locations/undo.cjs:34-53` (`undoCheck`: a pallet put back only needs its place to exist and not be pick or a lagerhylde), used by `repository.cjs:122-150` (undo) and `service.cjs:858-865` (the log's "Fortryd" verdict).
- **What happens today:** 09:00 Bo moves pallet P from A2.4 to B1.1. 09:20 Lis puts a new pallet on A2.4 (capacity 1). 10:00 the manager undoes Bo's move: P itself is unchanged, so the undo is allowed and P goes back to A2.4 → two pallets on a one-pallet place. The same for undoing a take or a "Tag hele pallen" after the place was reused, deactivated or made "reserveret".
- **Why it matters:** The list shows a place over capacity, the next put-away is refused there ("A2.4 er fuld") while the map says something else, and the restored pallet may sit on a place that is out of FIFO.
- **Exactly what should change:** In `undoCheck`, count pallets per place after the undo (current pallets not in `change.before` plus the restored ones) and return a conflict `{ kind: 'location', id }` when it exceeds `palletLimit(place)` or the place is `reserved`/`station`/inactive (when it was not so before). `blocker()` then names who used the place ("Kan ikke fortrydes – Lis satte … på A2.4 kl. 09:20 – fortryd den først").
- **Risk of the change:** Low; it only refuses more undos. Add a test for "move back onto a reused place".
- **Severity:** Important

### I2 – "Ret antal" (shelf) and pallet quantity are blind absolute writes over a stale screen

- **Where:** `src/views/warehouse/locations/ShelfLines.tsx:73-80` (sends `quantity: next`), `electron/warehouse/locations/service.cjs:261-277` (`shelfSet` writes the absolute number); the pallet quantity in `PalletCard.tsx` EditDialog (see C1).
- **What happens today:** Mia opens "Ret antal" on E9 H5 / R162-0717 (shows 40) and starts counting. Meanwhile Ole takes 10 (30 left). Mia counts 30 physically… or she counted before Ole's take and types 40. Either way the backend sets 40; Ole's take is erased. Because every write takes 15–40 s and screens keep their optimistic state while actions are in flight, the number in the dialog is often older than M:.
- **Why it matters:** Counts are the moment stock is supposed to become right; here they can make it wrong again silently.
- **Exactly what should change:** Send `expected: line.quantity` (the number the dialog showed) with `shelfSet`; in the backend refuse with `STOCK_CHANGED` ("Antallet er ændret til 30 af Ole kl. 10:12 – tæl igen eller gem alligevel") when the stored quantity differs, and let the dialog offer "Gem alligevel" (resend without `expected`). Same for a pallet's quantity in C1.
- **Risk of the change:** Low; a new optional parameter.
- **Severity:** Important

### I3 – Pallets on deactivated, reserved or station places cannot be found by material or taken

- **Where:** `electron/warehouse/locations/rules.cjs:36-42` (`fifo` = active `reserve` places only), `service.cjs:382-400` (`materialCard.reserve` and `total` come only from `fifo`), `src/views/warehouse/locations/TakePallet.tsx` (lists `card.reserve` only), `MovePallet.tsx:82-85` (search by material uses `card.reserve`), `PalletCard.tsx:66` ("Tag" opens Tag for the material), `Admin.tsx:365-367` (tells the admin the pallets "kan flyttes eller tages bagefter"), `Admin.tsx:101-102` (deactivate toast).
- **What happens today:** An admin deactivates A3.1 for repair, or turns a reserve place into a station/"reserveret"; the pallets stay (by design). From then on: the material card and "Hvor henter jeg?" do not show them and the total ("På lager") does not count them; Tag does not list them; "Flyt" by material does not find them; on the pallet card "Tag" opens a list without that pallet. The only way out is to find the place, open the pallet, move it to an active reserve place and then take it. Pallets with unknown quantity add 0 to the total, yet the card says "på 3 reservepaller".
- **Why it matters:** Goods look out of stock while they are on the floor; pickers order or search for nothing; the admin's own dialog promises something the screens do not offer.
- **Exactly what should change:** Return these pallets from `materialCard` in a separate list `elsewhere` (with the reason: "deaktiveret", "reserveret", "arbejdsstation") and show it under the reserve list in MaterialCard, FetchGuide, Tag and Flyt (not first in FIFO). Let Tag take them (the backend `take` already allows it). In "På lager" show "≥ N stk." or "+ k paller uden antal" when quantities are unknown.
- **Risk of the change:** Low; FIFO order and suggestions stay as they are.
- **Severity:** Important

### I4 – The monthly history file is read and rewritten whole on every action, and re-read by every card

- **Where:** `electron/warehouse/locations/repository.cjs:89-104` (every `transact` locks `history-YYYY-MM`, reads it and writes it back with the new events appended), `undo.cjs:9-27` (`changeOf` stores whole pallet objects – including every serial number – before and after), `repository.cjs:161-171` (`history` reads 3 months), `service.cjs:382-455` (material, location, pallet and rack cards each read the history), `service.cjs:841-875` (the log reads 4 months and computes a verdict per line, `blocker()` scanning all events again).
- **What happens today:** Every take, move, put-away and shelf action makes M: read, decrypt, re-encrypt and rename the full month file under the lock. An event for a pallet with 200 serial numbers carries them twice (before/after). By the end of a busy month the file is several MB (estimate – not measured), so the cost of every action grows through the month and all other PCs wait on the same lock. Every action also changes that file, so the watcher drops it from every PC's cache, and the next card or log view (re-read on every change via the 15-s stamp) reads the whole file again.
- **Why it matters:** This is a large part of the "15–40 s per action" the code comments mention, and it grows with use; long lock holds also cause C4's `KV_LOCK_BUSY`.
- **Exactly what should change:** Write events to a small per-day key (`history-YYYY-MM-DD`) or to a per-PC append file merged on read; store in `change` only the fields that changed (a pallet's serials only when they changed); let cards read the last 30 days unless "Vis mere" is pressed; cache the log's verdicts per `tx` and skip `blocker()` until a line is actually hovered/clicked.
- **Risk of the change:** Medium: history readers (cards, log, undo lookup by month, Hubert) must read the new keys; old month files stay readable.
- **Severity:** Important

### I5 – `meta` (2000 action ids + drawing links) is rewritten on every action and polled every 15 s by every window

- **Where:** `electron/warehouse/locations/repository.cjs:12, 31-34` (`meta.applied` keeps 2000 UUIDs, `meta.changedAt` set on every change), `service.cjs:311-313` (`stamp` reads the whole `meta` past the cache), `src/views/warehouse/locations/Locations.tsx:71-79` (every open Placeringer window polls `stamp` every 15 s), `layoutService.cjs:142` (`meta.layout.linked` lists every place on the drawing).
- **What happens today:** `meta` holds ~2000 × 40 bytes of ids plus the list of all linked places; it is read past the cache by every window every 15 s and rewritten (all of it) by every action. Ten PCs = 40 full reads per minute just to see whether a timestamp moved.
- **Why it matters:** Constant load on the slow share and one more large file in every action's lock set.
- **Exactly what should change:** Move `applied` to its own key (only read/written inside `transact`) and put `changedAt` in a tiny key `stamp` that `stamp()` reads; keep `meta` for import/go-live/layout.
- **Risk of the change:** Low–medium: a one-time move of `applied` (read both places during the transition).
- **Severity:** Important

### I6 – Sæt palle på plads checks the place only on M:, 15–40 s later, and refuses the whole batch

- **Where:** `src/views/warehouse/locations/PutAway.tsx:73-101` (the place list is only read when a drawing is published), `:138-166` (`save` sends without checking the places), `electron/warehouse/locations/service.cjs:109-140` (one transaction for all pallets; the first `roomIn` error refuses all).
- **What happens today:** The person registers 6 pallets from one delivery, types A2.4 for one of them (already full, or deactivated, or a lagerhylde), presses "Gem alle". The form is cleared and "6 paller er sat på plads" is shown; 30 s later all 6 come back with "A2.4 er fuld" – while the person has moved on. Without a published drawing there is no place list at all on this screen. Flyt and the pallet card check the same things on screen at once (`moveTargetCheck`).
- **Why it matters:** Lost time and confusion at goods receipt; a person who has walked away may never see the rollback and leaves 6 pallets unregistered.
- **Exactly what should change:** Always read `list()` in PutAway (not only with a drawing) and show `moveTargetCheck(...)` under each pallet's place field (with `from` undefined); count pallets already in the form for the same place; disable "Gem" while a place is blocked. Optionally let the backend put away the pallets that fit and return the refused ones (`refused: [{ index, code, message }]`) so only those come back.
- **Risk of the change:** Low for the on-screen check; the partial batch needs care with the undo snapshot (still one transaction).
- **Severity:** Important

### I7 – Front-page search: Enter opens the hit of the previous query (or nothing)

- **Where:** `src/views/warehouse/locations/SearchResults.tsx:18-37`.
- **What happens today:** The search waits 200 ms after typing and then a round trip to the service. A scanner types the code and Enter within milliseconds. When Enter arrives, `result` is still the answer for the *previous* text (it is never cleared when `query` changes). If that answer had exactly one hit, Enter opens that card – the wrong pallet/place. If there was no previous answer nothing happens and the user must press Enter again. The docstring promises "with a scanner a single hit opens at once".
- **Why it matters:** Opens the wrong card on a scan; the person may take or move the wrong pallet from there.
- **Exactly what should change:** Store the query with the result (`{ query, found }`); on Enter, if the result belongs to the current query and has one hit, open it; otherwise set a flag `openWhenReady` and open when the matching result arrives (only if it has exactly one hit).
- **Risk of the change:** Low.
- **Severity:** Important

### I8 – MaterialPicker: Enter takes a stale highlighted suggestion instead of the scanned number

- **Where:** `src/views/warehouse/locations/MaterialPicker.tsx:31-41, 52-58` (used by Læg på hylde and Hvor henter jeg?).
- **What happens today:** The list is fetched 150 ms after typing. The user typed "R162" (list open, R162-0717 highlighted), then scans R162-0999 + Enter. The list still belongs to "R162" and does not contain R162-0999, so `exact` is undefined and `open ? suggestions[active]` picks R162-0717. In Læg på hylde the quantity is then put on the shelf as R162-0717. The docstring says "an exact number wins over the highlighted suggestion", which only holds when the exact number happens to be in the stale list.
- **Why it matters:** Wrong material on a shelf, which is then wrong in Tag and the material card.
- **Exactly what should change:** Remember which text the suggestions belong to; use `suggestions[active]` only when the user moved with the arrow keys or the suggestions are for the current text; otherwise choose the typed value.
- **Risk of the change:** Low.
- **Severity:** Important

### I9 – Læg på hylde: a 49/50 number with several materials only ever gives the first

- **Where:** `src/views/warehouse/locations/ShelfPut.tsx:63-80`.
- **What happens today:** "Nummeret har 3 materialer – det første er valgt". The other two materials and their quantities from SAP are discarded; scanning again gives the first again. The user has to type the others by hand (and count them). Sæt palle på plads handles the same document correctly (one line per material).
- **Why it matters:** Extra typing and counting at the shelf; quantities typed by hand instead of SAP's.
- **Exactly what should change:** Keep `found.materials` in state and show them as buttons ("R162-0717 · 12 stk.", …); choosing one fills material and quantity; after a save the next unsaved one is pre-selected and the 49/50 number is kept until all are done.
- **Risk of the change:** Low.
- **Severity:** Important

### I10 – The same 49/50 number / serial numbers can be put away twice without any warning

- **Where:** `electron/warehouse/locations/service.cjs:109-140` (no check), `src/views/warehouse/locations/PutAway.tsx:124-137` (`lookup` shows nothing about existing pallets); the data to check is there: `rules.cjs:86-87` already finds pallets by document and serial.
- **What happens today:** Two people receive the same delivery note, or one person saves, gets a rollback (I6) and saves again after the original actually landed on retry, or re-scans a 49/50 he already did yesterday. Each save gets a new action id, so nothing stops a second pallet with the same document and the same serial numbers.
- **Why it matters:** Duplicate pallets (phantom stock), FIFO pointing at a pallet that does not exist.
- **Exactly what should change:** In `lookupDocument`, also return the existing pallets/shelf lines with that document (and any serial already on a pallet). In PutAway show "Allerede sat på plads: A2.4 (Bo, i går)" and ask before saving; in `putAway`, refuse a serial that is already on another pallet unless `allowDuplicate: true`.
- **Risk of the change:** Low; partial deliveries with the same 49/50 still work (warning, not block, for the document).
- **Severity:** Important

### I11 – Fyld pluk-plads op does not warn when a younger pallet is used (Tag does)

- **Where:** `src/views/warehouse/locations/Refill.tsx:62-72, 143-155` vs `TakePallet.tsx:51-54, 117-124`.
- **What happens today:** In Tag, choosing a pallet that is not the oldest asks "Der står en ældre palle på … – Tag alligevel". In Refill every pallet has a "Fyldt op fra …" button and nothing asks; the first one is only badged "Forslag".
- **Why it matters:** FIFO breaks in exactly the flow that consumes most pallets (pick places), and the two screens behave differently for the same decision.
- **Exactly what should change:** Reuse Tag's confirm in Refill (same text and "Tag alligevel"/"Fyld op alligevel" button) when the chosen pallet's `receivedAt` is later than `card.reserve[0].receivedAt`.
- **Risk of the change:** Low.
- **Severity:** Important

### I12 – "Scanninger gemmes lokalt" is shown for Placeringer actions that are not saved locally

- **Where:** `src/lib/warehouse/errors.ts:31` (and English `:189`); Placeringer admin actions and the drawing are never queued (`register.cjs:451-460`, `:468-482`).
- **What happens today:** M: is down. An admin creates a rack or deactivates places; the Admin screen shows it at once, then rolls back with the toast "Kan ikke nå lagerstyrings-data på M:. Scanninger gemmes lokalt og sendes, når forbindelsen er tilbage." The admin reads "saved locally" and moves on; nothing was saved. The same text appears when a card or the log cannot be read.
- **Why it matters:** A wrong promise about data; the admin believes the change will arrive later.
- **Exactly what should change:** Give Placeringer its own text for non-queued failures, e.g. pass `failure: () => t('M: kan ikke nås – ændringen er ikke gemt. Prøv igen, når forbindelsen er tilbage.', …)` from Admin/RackAdmin/LayoutEditor, or make the generic STORAGE_UNAVAILABLE text neutral ("Kan ikke nå lagerstyrings-data på M: lige nu.") and keep the "gemt lokalt" sentence only in Optælling's scan path and in `deferredText`.
- **Risk of the change:** Low (text only).
- **Severity:** Important

---

## Minor

### M1 – Sæt palle på plads takes "today" in UTC: after midnight the date is yesterday

- **Where:** `src/views/warehouse/locations/PutAway.tsx:43` (`new Date().toISOString().slice(0, 10)`); the pallet card uses local time (`PalletCard.tsx:104`).
- **What happens today:** Between 00:00 and 01:00 (02:00 in summer) Danish time the date field defaults to the previous day; the pallet gets yesterday as received date.
- **Why it matters:** Wrong date and FIFO position for night-shift receipts.
- **Exactly what should change:** Use the local date like `dayOf(Date.now())` in PalletCard.
- **Risk of the change:** None.
- **Severity:** Minor

### M2 – Dead code and duplicated helpers

- **Where:** `src/lib/warehouse/singleFlight.ts:2` (`createSingleFlight`, only used by its own test; the screens use `singleFlight` in `src/lib/warehouse/locations.ts:58`, the same logic); `electron/warehouse/locations/rules.cjs:66-74` (`refillSuggestion` – not used outside tests); `service.cjs:146,150` (`take` computes `olderPallet` with a full FIFO sort inside the lock; no screen reads it); `src/lib/warehouse/locations.ts:89` (`case 'empty'` – no backend event has that type).
- **What happens today:** Two implementations of the same guard; a FIFO sort over all pallets in every take's lock for nothing; a text for an event that never occurs.
- **Why it matters:** Maintenance confusion; a little time inside the lock.
- **Exactly what should change:** Delete `singleFlight.ts` (+ test), `refillSuggestion` (+ tests), the `older` computation (or use it: return it and show it after a take, as Tag already does before), and the `'empty'` case.
- **Risk of the change:** None (check the Hubert assistant does not use `olderPallet`; grep found no use).
- **Severity:** Minor

### M3 – Missing validation on daily actions in the backend

- **Where:** `electron/warehouse/locations/service.cjs:180-199` (`move` to the pallet's own place is allowed on a floor/multi-place: logs "Flyttet A → A"), `:245-258` (`shelfMove` with `from === to` logs a move and rewrites the line), `:202-213` (`changeSloc` to the same sloc logs an event), `:261-266` (`shelfSet` works on a deactivated shelf while `shelfPut` refuses it), `:56-66` (`roomIn` ignores a reserve place's `fixedMaterials`; only suggestions respect it).
- **What happens today:** The screens block most of these, but a queued replay, Hubert or a future screen can create no-op log lines and changes on deactivated shelves; any material can be put on a "Fast plads for R162-0717".
- **Why it matters:** Log noise that blocks undo of real actions (a no-op event "touches" the pallet), and fixed places silently filled with other goods.
- **Exactly what should change:** Refuse `move` when `target.id === pallet.location` (`ALREADY_THERE`), `shelfMove` when `from === to`, skip the event when `changeSloc` changes nothing, use `shelfIn(..., { active: true })` in `shelfSet` when the line is new, and return a warning (not an error) from `putAway`/`move` when the material is not one of the place's fixed materials so the screen can show "A2.4 er fast plads for …".
- **Risk of the change:** Low.
- **Severity:** Minor

### M4 – The log's action filter has no shelf actions

- **Where:** `src/views/warehouse/locations/LocationsLog.tsx:20-32`.
- **What happens today:** `shelf-put`, `shelf-take`, `shelf-move`, `shelf-set` and `migrate` cannot be filtered on, although they are a large part of the daily work and "Ret antal" is what a manager looks for after a count.
- **Why it matters:** Hard to answer "who changed the quantity on E9 H5?".
- **Exactly what should change:** Add "Lagt på hylde", "Taget fra hylde", "Flyttet mellem hylder", "Antal rettet" (and "Hyldelager oprettet" for migrate).
- **Risk of the change:** None.
- **Severity:** Minor

### M5 – Misleading log texts

- **Where:** `service.cjs:856-866` (verdict `'Fra før loggen kunne fortryde'` whenever there is no `change`), `service.cjs:116-121` (put-away straight onto a pick place changes no pallets, so it has no `change`), `service.cjs:609-616` + `locations.ts:87` (a place made a pick place logs its pallets as "Flyttet A2.4 → A2.4"), `LocationsLog.tsx:150` (the undo confirmation shows "kl. 10:32" without the date).
- **What happens today:** A put-away onto a pick place from today says it is "from before the log could undo"; pallets used up by an admin's purpose change read "Flyttet A2.4 → A2.4"; undoing an action from last week asks about "kl. 10:32".
- **Why it matters:** Users stop trusting the log's explanations.
- **Exactly what should change:** Reason "Intet at fortryde (pallen blev brugt op på pluk-pladsen)" when the group's events have a `tx` but no change; log those pallets as `type: 'refill'`-like "Brugt op på A2.4 (pladsen blev pluk-plads)"; use `formatDateTime` in the confirmation when the action is not from today.
- **Risk of the change:** None.
- **Severity:** Minor

### M6 – In English the backend's detail is dropped

- **Where:** `src/lib/warehouse/errors.ts:173-178`.
- **What happens today:** English users get "The location is full." without which place, "Undo not possible – something changed" without the blocker sentence, LOCATION_NOT_EMPTY without the count.
- **Why it matters:** In a 6-pallet put-away an English user cannot tell which place is full.
- **Exactly what should change:** Add the Placeringer codes whose detail names a place or a person (LOCATION_FULL, LOCATION_INACTIVE, LOCATION_NOT_FOUND, LOCATION_NOT_EMPTY, UNDO_CONFLICT, STOCK_TOO_LOW, MATERIAL_MISMATCH) to `EN_WITH_DETAIL`, or send the place/person as structured fields and format them on screen.
- **Risk of the change:** Low.
- **Severity:** Minor

### M7 – Search misses shelf-only materials that have no SAP text

- **Where:** `electron/warehouse/locations/rules.cjs:82` (`known` = texts ∪ pallet materials ∪ fixed materials), `service.cjs:369-379` (passes texts only for materials that have one).
- **What happens today:** A material that is only on lagerhylder and whose description is not in the catalog yet (typed by hand, MM60 not run because SAP was closed) is not found by its number on the front page, in MaterialPicker or in Flyt.
- **Why it matters:** "Intet fundet" for goods that are on a shelf.
- **Exactly what should change:** Add `Object.values(state.stock).map(line => line.material)` to `known` in `rules.search` (or pass `known` from the service).
- **Risk of the change:** None.
- **Severity:** Minor

### M8 – Every daily action reads unused keys from M: past the cache before locking

- **Where:** `electron/warehouse/locations/repository.cjs:85-87`.
- **What happens today:** A take (writes `pallets`) reads `stock` and `tags` with `skipCache: true`; a shelf action reads `pallets` and `tags`. None of them is used to decide anything; they are only compared to themselves afterwards.
- **Why it matters:** One or two extra full-file round trips on M: per action (the stock file can be large).
- **Exactly what should change:** For `writes` transactions, leave unread keys out of `state` (or read them from the cache), and let `changeOf`/`writeState` ignore keys that were not read.
- **Risk of the change:** Low; add an assertion that a `writes` transaction never sets an unread key (the store already throws on a key that is not locked).
- **Severity:** Minor

### M9 – Material texts can be lost when two PCs learn at the same time

- **Where:** `electron/warehouse/locations/catalog.cjs:25-36` (read, change, `setAsync` without a lock around the read).
- **What happens today:** PC A learns 300 texts from MB52 while PC B learns one from a 49/50 lookup; the later write overwrites the other's additions.
- **Why it matters:** Materials show as bare numbers again until the next fetch.
- **Exactly what should change:** Use the store's locked read-modify-write (`mutateAsync`) for `materialtekster`.
- **Risk of the change:** Low.
- **Severity:** Minor

### M10 – Avoidable reads on every change

- **Where:** `src/views/warehouse/locations/Locations.tsx:44-54` and `LocationsHome.tsx:22-28` (both call `overview()` on every version bump), `PutAway.tsx:113-121` (`describe` calls the full `materialCard` – state + 3 months of history – only to get the description, plus `suggest` which reads the state again).
- **What happens today:** On the front page every change from any PC triggers two identical overview reads; each scanned material in Sæt palle på plads reads the history.
- **Why it matters:** More load on M: during goods receipt.
- **Exactly what should change:** Let Locations pass its overview down to LocationsHome; add a light `describe`/`suggest` call that returns description + slots in one read without history.
- **Risk of the change:** Low.
- **Severity:** Minor

### M11 – Making a place a pick place uses up all pallets on it now, not the ones the admin was shown

- **Where:** `electron/warehouse/locations/service.cjs:575-611` (`toPick` takes `palletsOn(tx, …)` at write time), `src/views/warehouse/locations/Admin.tsx:324-336` (the admin confirms "en palle" based on the list read earlier).
- **What happens today:** The admin opens A2.4 (1 pallet) and makes it a pick place; meanwhile a floor/2-place A2.4 got a second pallet; both are deleted as "used up".
- **Why it matters:** A pallet nobody confirmed disappears.
- **Exactly what should change:** Send the pallet ids the dialog showed (`usePallets: ['id1']`) and refuse (`LOCATION_NOT_EMPTY` with the new count) when the set differs.
- **Risk of the change:** Low.
- **Severity:** Minor

### M12 – The sheet import accepts fractional, zero and negative quantities

- **Where:** `electron/warehouse/locations/sheetImport.cjs:56, 118, 129-151`.
- **What happens today:** A cell with 2,5 or -3 or 0 becomes a pallet/shelf line with that quantity; the rest of Placeringer only accepts whole numbers ≥ 1 (≥ 0 for edit), so such a line cannot be taken exactly (`STOCK_TOO_LOW` maths with decimals) and a 0-line shows as "0 stk." until someone corrects it.
- **Why it matters:** Odd data from day one that the screens cannot handle cleanly.
- **Exactly what should change:** In `planImport`, warn (`QUANTITY_ODD`) and import such rows with quantity `null` (pallet) or skip them (shelf) so the preview lists them.
- **Risk of the change:** None (import is only possible before go-live).
- **Severity:** Minor

### M13 – Pallets kept on lagerhylder (no quantity) are invisible on the rack card and in Flyt's shelf scan

- **Where:** `electron/warehouse/locations/shelves.cjs:64-80` (`migrateShelves` keeps pallets without a quantity "so someone can count it"), `service.cjs:433-455` (`rackCard` returns only stock lines), `src/views/warehouse/locations/RackCard.tsx:54` ("Tom"), `MovePallet.tsx:71-79` (a scanned lagerhylde shows only its lines).
- **What happens today:** E9 H5 holds a kept pallet; the rack card says "Tom"; scanning E9 H5 in Flyt says "Hylden er tom." Only the place card shows the pallet.
- **Why it matters:** The pallet the migration asked people to count is hard to find.
- **Exactly what should change:** Return `pallets` per shelf in `rackCard` and list them ("1 palle uden antal – tæl den"); in Flyt list a shelf's pallets as candidates too.
- **Risk of the change:** None.
- **Severity:** Minor

### M14 – A 49/50 lookup only returns serialised lines (uncertain)

- **Where:** `electron/warehouse/locations/service.cjs:348-362` (quantity = number of serial rows); the fetcher uses the serial report (ZMS_REP, `sapFetch.cjs:84`).
- **What happens today:** For a document with both serialised terminals and non-serialised accessories, only the terminals come back; the accessories are silently missing from the put-away form (the "ingen serienumre" warning only appears when *nothing* comes back). I did not read `sapFetch.cjs` in depth – uncertain whether non-serial lines are ever returned.
- **Why it matters:** Accessories on the same delivery are easily forgotten.
- **Exactly what should change:** Verify with a mixed document; if confirmed, add the non-serial lines from MB51/MIGO display, or at least say "Kun materialer med serienumre er hentet – tilføj resten selv".
- **Risk of the change:** Low.
- **Severity:** Minor

### M15 – A status manager sees admin buttons until roles answer

- **Where:** `src/views/warehouse/locations/Locations.tsx:37` (`useState(user.role === 'manager')`; a status manager arrives as `role: 'manager'` from `register.cjs` `serviceUser`).
- **What happens today:** On a slow M: the status manager sees "Administrér placeringer"/"Fortryd" until `roles.me()` answers (or forever if it fails), and gets LOCATIONS_MANAGER_ONLY when using them.
- **Why it matters:** Confusing, and optimistic admin screens show changes that are then rolled back.
- **Exactly what should change:** Start with `false` (or `user.role === 'manager' && !user.statusManager` if that flag is sent to the window).
- **Risk of the change:** None.
- **Severity:** Minor

---

## Additions that would clearly help the warehouse users

### A1 – "Gør igen" on a failed queued action

The outbox keeps the full request of every failed replay (`outbox.cjs:72`), but `locations:pending` sends only the label and code to the window and the failure is acknowledged as soon as the toast is shown (`Locations.tsx:61-69`). For a refused put-away the serial numbers, dates and notes are gone. Add a "Gør igen" button on the toast that opens Sæt palle på plads / Tag / Flyt pre-filled from `request` (only for the failing person's own actions), and acknowledge only when the user has acted or dismissed it.

### A2 – Show what is waiting for M:

The banner says "3 handling(er) venter på M:" (`Locations.tsx:102-105`). The outbox already has a label per action (`outbox.cjs:92`). Let the banner open a small list ("Tag R162-0717 fra A2.4 – 10:41") so people know what is not registered yet and do not do it twice from another PC.

### A3 – "Allerede registreret" when a 49/50 number is scanned

`rules.search` already finds pallets by document and serial. When Sæt palle på plads / Læg på hylde looks up a 49/50 number, show the pallets and shelf lines that already carry it ("A2.4 · 24 stk. · Bo i går") before the user saves (see I10).

### A4 – "Tæl pallen" for pallets with unknown quantity

Tag, Fyld op and the material card show "antal ukendt" pallets (C2, I3) but the only way to set the number is the full pallet edit dialog. Add a one-field "Tæl" action on those rows that calls `editPallet` with just `quantity` (and `expected: null`, see C1). It makes partial takes and the stock total meaningful.
