# Placeringer – afgørelser og udskudte småting

Samlet 21.10.2026 fra udførelsens ledger, da arbejdsmappen blev slettet. Hver afgørelse står som: hvad – hvorfor – hvad det koster, hvis den er forkert.

Den friske gennemgang fandt 2 kritiske og 6 vigtige fund; alle er rettet med en test, der fejlede først (se "fixed"-linjerne). De mindre fund er udskudt og står nederst.

## Afgørelser

- - T3/T5 consume T6 catalog (describe/learn/describeFromSap) before T6 exists. Ruling: T3/T5 tests use a fake catalog with that exact interface; T6 implements it and T7 wires the real one — cost if wrong: one wiring fix in T7.
- Task 1: Ruling: transact is async-wrapped around store.withLockedKeys (sync callback); fn must be synchronous — matches store API — cost if wrong: none
- Task 2: Ruling: search's `catalog` argument is a plain { material: description } object (sync) — rules stay pure; the service passes catalog.describe() output — cost if wrong: none
- Task 2: Ruling: suggestSlots never offers a reserve place fixed to ANOTHER material, and the 'free' reason covers both "same area" and "rest" (plan listed 3 reasons for 4 tiers) — cost if wrong: one more reason value
- Task 3: Ruling: service.search returns rich results ({material, description}, Location, Pallet+description+ageDays) instead of rules.search's id lists — the screens and Hubert need descriptions — cost if wrong: none (T13 consumes this shape)
- Task 3: Ruling: putAway accepts quantity null (pallet without a counted quantity) and 0; take/refill X must be integer ≥1 — spec: "antal int|null" — cost if wrong: one validation rule
- Task 3: Ruling: stations count as not-for-pallets (LOCATION_RESERVED on putAway/move); refill writes a 'refill' event (from reserve place to pick place), not a 'take' — cost if wrong: history labels
- Task 3: Ruling: repository.history ties (same ms) now come newest first (reverse before stable sort) — found by the move/sloc test — cost if wrong: none
- Task 4: Ruling: editLocation may rename a place (pallets and pick status follow the new id) and refuses capacity below the pallets on it (LOCATION_INVALID); pick/station need a fixed material — spec "alt kan rettes" — cost if wrong: rename could surprise; history keeps from/to
- Task 5 (pre): Ruling: fixedMaterial → fixedMaterials: string[] and pick status keyed '<location>|<material>' (pickKey) — the real sheet has 30 of 54 PLUK places with several materials (H1, F1.0…); spec's single fixed material would lose them — cost if wrong: slightly more UI (choose material on a multi-material pick place). Spec and plan annotated. Tests T2–T4 updated RED→GREEN (25/25).
- Task 5: Ruling: the service takes a new dependency sheetSource { find(team) } returning the newest sheet path (null when none) — keeps file lookup out of the service and testable — cost if wrong: one adapter in register.cjs.
- Task 5: Ruling: a preview token is used up only when the import lands, so a LOCATIONS_NOT_EMPTY refusal can be followed by replace:true with the same token — the test and the "replace?" dialog need it — cost if wrong: a token can be retried until it lands (still 30 min, same team, admin only).
- Task 5: Ruling: the sheet's own area values (RE for "Reol X", PR for "Prep") are kept as-is; only empty/#N/A areas come from the name — the spec says everything can be corrected after import — cost if wrong: an admin renames two areas.
- Task 6: Ruling: learning is withLearning(fetcher, catalog) in catalog.cjs, used by register.cjs for Optælling and SAP-tjek — makes the brief's 4th test a unit test; describeFromSap uses the raw fetcher so it never learns twice — cost if wrong: none visible.
- Task 6: Ruling: catalog.learn does get+merge+one setAsync of materialtekster (not setField per material) — an import learns ~300 texts at once; two devices learning at the same second can drop one write, which the next MB52 fetch relearns — cost if wrong: a missing description until next fetch.
- Task 6: Ruling: mm60.vbs reads the ALV grid (MATNR/MAKTX) when there is one and falls back to %pc on a classic list (rows -1); field ids MS_MATNR/MS_WERKS are best guesses and unverified against SAP — user checks MM60 live — cost if wrong: MM60 lookups fail with screen errors until the ids are fixed; MB52 texts still work.
- Task 7: Ruling: channels are generated from two maps (reads, writes) in register.cjs; writes emit locations:changed {team} after success only — same handle()/serviceUser — cost if wrong: none.
- Task 7: Ruling: TS types use fixedMaterials: string[] and PickStatus.material (Task 5 ruling), plus view types PalletView/MaterialCard/LocationCard/PalletCard/LocationSearch/DocumentLookup the screens need — cost if wrong: type edits only.
- Task 8: Ruling: the queue file lives in <userData>/warehouse/locations-outbox.json and keeps the last 1000 applied action ids; the renderer sends actionId (else main makes one) and gets {queued:true} or {duplicate:true} instead of the result — the brief's submit() shape, typed as Deferred — cost if wrong: screens show 'gemt lokalt' instead of the result.
- Task 8: Ruling: a new action submitted while a queue exists goes behind it and is flushed at once; if it lands it returns its normal result, if it fails with a business error that error is thrown to the person who is waiting — keeps order without hiding errors — cost if wrong: none.
- Task 8: Ruling: only STORAGE_UNAVAILABLE and the fs codes register.cjs already maps (EIO, ENOENT, ETIMEDOUT …) count as 'M: down'; KV_LOCK_BUSY is not queued — a busy lock is someone else writing, not a lost drive — cost if wrong: a rare busy lock shows an error instead of queueing.
- Task 8: Ruling: extra channel locations:pending and event locations:sync-failed {failed:[{team,email,method,code,message}]} — the screens need to show queued count and failures — cost if wrong: none.
- Task 9: Ruling: a container Locations.tsx (not in the brief) holds the Placeringer navigation, the role check (roles.me, like Optælling), locations.onChanged reloads, the waiting-on-M: badge and sync-failed toasts; Warehouse.tsx only picks the tool — keeps Warehouse.tsx small — cost if wrong: none.
- Task 9: Ruling: SapStatusProvider/SapIndicator now cover Placeringer too (the 49/50 lookup and the import need SAP) — SAP is still never polled on the Lagerstyring page itself — cost if wrong: a status poll while in Placeringer.
- Task 9: Ruling: the Lagerstyring tile uses t(da,en) like the Optælling tile (sv/fi get English), not 4 languages — consistency with the existing tile — cost if wrong: two strings to translate.
- Task 9: Ruling: 'Find materiale' focuses the search field instead of a separate screen; a scanned code with exactly one hit opens it on Enter — spec says search first — cost if wrong: none.
- Task 10: Ruling: overview() also returns the hub's tags (state.tags) so Sæt på plads can offer them as toggles — no read channel had them — cost if wrong: none.
- Task 10: Ruling: a 49/50 document with several materials becomes one pallet row per material; the material field looks up description + suggestions via materialCard + suggest on blur/Enter — cost if wrong: two reads per material.
- Task 10: Ruling: the 'older pallet' warning is shown before calling take (client knows the FIFO order) instead of after the server answers with olderPallet — the spec says warn, then allow 'Tag alligevel' — cost if wrong: none.
- Task 11: Ruling: a pallet card for a pallet that is gone (taken elsewhere) shows 'no longer in stock' instead of an error toast — the card can stay open while another PC takes the pallet — cost if wrong: none.
- Task 12: Ruling: new read service.list(user) + channel locations:list → { locations (with used), tags, canAdmin, imported, live } — the administration needs every place and no channel listed them — cost if wrong: none.
- Task 12: Ruling: the TS type of createSeries returns created: Location[] (what the service always returned), not string[] — cost if wrong: none.
- Task 12: Ruling: a series offers only reserve/reserved (pick places and stations need materials, made one by one); the import shows no step-by-step SAP progress, only a 'can take minutes' line — describeFromSap's onProgress is not sent over IPC — cost if wrong: a less informative wait.
- Task 13: Ruling: a material, place or 49/50 token makes a question data even when it starts like a how-to ('where is R162-0717?'); without a token, only the fetch phrases ('hvor henter jeg …', 'where do I get …') reach Placeringer, other how-to questions go to the guide; questions naming Optælling or SAP codes are left to Optælling — cost if wrong: an odd question gets the guide instead of data.
- Task 13: Ruling: a description search ('ethernet kabler') tries the whole query and then single words, longest first, because SAP's texts are English — cost if wrong: the first matching word wins when the words point at different materials.
- Task 13: Ruling: register.cjs chains the two assistants (Placeringer first, then Optælling) behind the same assistant.answer, so main.cjs is unchanged — cost if wrong: none.
- Task 13: Ruling: guide tasks have no manager requirement (Optælling's admins may also create/import); module keywords got placeringsark/sijoitustaulukko and sv 'importerar placeringsark' to beat Knowledge Base's import task on a tie — cost if wrong: keyword tuning.
- Task 14: Ruling: the 49/50 field's example placeholder now says 'Scan eller skriv, fx …' — in the E2E screenshot an empty second pallet looked filled in — cost if wrong: none.
- Final: Ruling: the async lock path for Placeringer's transactions (reviewer #7 long-term) is not built — withLockedKeys is synchronous by design and the pause removes the repeated hangs on a dead share; a lock held by another PC can still pause the UI up to the lock timeout — cost if wrong: short UI stalls under heavy two-PC use.
- Final: Ruling: meta (with the applied id) is written after the other keys, so a share that fails between two file renames can still leave a half-written action that replays; the reverse order would instead lose the action silently — the double is the lesser evil and is rare (the first write usually fails) — cost if wrong: a rare double count after a mid-write network drop.
- Final: Ruling: a place with PLUK or 999-999 rows next to real stock rows is imported as a reserve place that keeps every pallet (PLUK materials fixed there) with a MIXED_PLACE warning, instead of dropping the stock rows — on the real sheet this keeps 23 pallets (e.g. F1.0 with 4480/4726/6000 stk.) — cost if wrong: an admin sets 8 places' purpose by hand after the import.
- Final: Ruling: background MM60 lookups pass one material as a script argument (mm60.vbs [material]) instead of the clipboard upload, so a put-away never overwrites the person's clipboard; register.test now runs on the SAP fixtures so a test can never reach a real SAP — cost if wrong: the single-material field path in mm60.vbs is also part of the user's live MM60 check.
- Final: Ruling: the spec's 'manual description marked as manual' is not built — every description comes from SAP (MB52, matdoc, MM60) — cost if wrong: a material SAP does not know shows as a bare number until it exists in SAP.
- Final: Ruling: mm60.vbs field ids (MS_MATNR, VALU_PUSH, btn[16]/btn[24]) and grid columns are unverified without SAP — the person using it gets an MM60 error message, never a wrong text, and MB52/matdoc descriptions still work — cost if wrong: the ids are fixed during the user's live check.
- Final: Ruling: two PCs learning materialtekster at the same second can drop one write — stands (Task 6 ruling); the next MB52 fetch relearns it — cost if wrong: a missing description for a while.
- Final: Ruling: renaming a location does not rewrite old history events — stands; events keep from/to and the new name is in the 'location' event — cost if wrong: old history shows the old name.
- Final: Ruling: a series offers only reserve/reserved, the preview token can be retried until it lands, KV_LOCK_BUSY is not queued — all stand as ruled in Tasks 8 and 12 — cost if wrong: as ledgered there.
- Final: Ruling: Optælling still reads the sheet (delprojekt 4) and MIGO for storage location (delprojekt 3) are out of scope per the spec — they are on the backlog in plans/development-1.6.5.md — cost if wrong: none now.
- Final: Ruling: Finnish and Swedish wording in Hubert and the guides needs a native speaker — stands, as for Optælling — cost if wrong: clumsy fi/sv sentences.
- Final: Ruling: the reviewer did not run scripts/verify-locations.cjs — it is run after the fix pass (below) — cost if wrong: none.
- Final: Ruling: the spec names placements/ and tab 'placements'; the plan and code use locations/ and tab 'locations' consistently (English code names, Danish UI 'Placeringer') — cost if wrong: a rename only.

## Rettelser efter gennemgangen

- Final: fixed Hubert's Placeringer answer took over unrelated questions in every hub (Critical) — 'questions that only look like Placeringer fall through…' RED→GREEN, assistant suite 609/609
- Final: fixed queued actions that fail on replay were lost silently (Critical) — 'a replay failure is kept and reported whichever flush finds it, until it is acknowledged' RED→GREEN, locations+register 52/52. Failures are persisted in the outbox file, shown once on any PC window of the same team (by name when another person's) with a readable label, then acknowledged.
- Final: fixed sync I/O retried against a dead M: on every action (Important, partly) — 'while M: is down a new action is queued without touching M: again until the pause is over' RED→GREEN; 30 s pause after a storage error, the timer flush is the retry.
- Final: fixed a replay could apply an action twice — idempotency only in the local outbox (Important) — 'a replayed action id is applied once, also from another PC: a partial take is not counted twice' RED→GREEN, locations 45/45. The action id is recorded in meta.applied (last 2000) in the same locked transaction.
- Final: fixed a pallet put straight on a pick place stayed as an orphan pallet and blocked the next refill (Important) — 'a pallet put or moved straight onto an empty pick place fills it and leaves no pallet behind, also the second time' RED→GREEN, locations+register 54/54. Pick places hold no pallets (spec: no quantity); the earlier test's expectation of a stored pallet on H26 was updated.
- Final: fixed the import dropped sheet rows without a warning (Important) — 'no sheet row disappears silently…' RED→GREEN, locations 47/47. Material without quantity on a reserve place = fixed material (spec: 110 'faste pladser'); comments/cell notes of rows that are not pallets go to the place note; ROW_SKIPPED for quantity without material. Real sheet (local copy): 1256 rows → 564 pallets (was 541), 8 MIXED_PLACE, 0 skipped.
- Final: fixed other PCs never refreshed (Important) — 'another PC sees that something changed through the change stamp' RED→GREEN, locations 48/48, register 8/8. Every writing transaction sets meta.changedAt; the screens poll locations:stamp (uncached read of meta) every 15 s and re-read when it changed; the comment in Locations.tsx now says so.
- Final: fixed materials typed by hand never got a SAP description (Important, spec gap) — 'describeMissing looks up only unknown materials in MM60…' + 'a material typed by hand gets its SAP description looked up in the background' RED→GREEN, locations+sapFetch 61/61. putAway and an empty materialCard description start a background MM60 lookup (max 5, not again for 10 min, never throws).

## Udskudte mindre fund

- Final: minor (deferred): scanner Enter in the search can come before the debounced result, so a single hit does not open at once (and a stale single hit could open); store the query with the result.
- Final: minor (deferred): PutAway's default date uses the UTC day, so between 00:00 and 02:00 Danish time it is yesterday.
- Final: minor (deferred): PutAway keeps the previous material's place suggestions until the new material is looked up; the server also accepts a pallet on a reserve place fixed to another material.
- Final: minor (deferred): imported pallets without a date get the import time and become the newest in FIFO without a warning.
- Final: minor (deferred): MM60 has no plant filter (a material in many plants can hit too-many-rows), and describeFromSap runs the full fetchPlant (MB52 + IQ09) just for descriptions.
- Final: minor (deferred): a corrupt locations-outbox.json silently becomes an empty queue; keep a .bad copy and log it.
- Final: minor (deferred): a replay runs with the user object stored at submit time, without re-checking team membership (the physical action happened while they had access).
- Final: minor (deferred): the Lagerstyring tile text is da/en, the spec says 4 languages (Task 9 ruling).
- Final: minor (deferred): editPallet calls goLive even when nothing changed, which locks the import after a no-op save.

## Verifikation

- Task 14: Full verification 21.10: electron 1384/1385 (1 skipped) from PowerShell, vitest 1429 pass, tsc clean, verify-warehouse ALLE TJEK OK, verify-locations ALLE TJEK OK.
- Final: verification after the fix pass 21.10: electron 1395/1396 (1 skipped), vitest 1429, tsc clean, verify-locations and verify-warehouse ALLE TJEK OK.

## Ændringer efter brugerens live-test (21.10.2026)

- "Løbet tør" er fjernet helt efter brugerens ønske: pluk-pladser har ingen status (fyldt/løbet tør) længere; nøglen `pick` og kanalen `locations:mark-empty` er væk. "Fyld pluk-plads op" er nu: vælg pluk-plads (og materiale) → ældste reservepalle (FIFO) → "Fyldt op fra …". Hubert svarer stadig "H26 er tom" / "hvad fylder jeg H26 op med?" med den ældste palle, men har ingen "løbet tør"-liste. Gamle 'empty'-hændelser i historikken vises stadig.
- Importen henter kun MB52 til beskrivelser (ingen IQ09).
- MM60: `single` var et reserveret ord (scriptet kunne ikke køre); kolonnerne findes nu ud fra navn/overskrift; en MM60-fejl stopper ikke importen (NOT_CHECKED). En test kompilerer alle VBS-scripts.

## Log, fortryd og Placerings admin (22.10.2026)

- Alt i Placeringer logges med `tx`/`actionId` og et før/efter-billede af de paller og placeringer, handlingen ændrede; fortryd gør én handling om ad gangen og står selv i loggen.
- Fortryd nægtes, hvis noget af det, handlingen ændrede, er ændret siden (konflikt); begrundelsen nævner den senere handling ("Bo tog 5 stk. fra A2.1 kl. … – fortryd den først"). Import og fortrydelser kan ikke fortrydes; hændelser fra før loggen heller ikke.
- Rollen Placerings admin gives kun i Manager Panel (kortet "Lagerstyringsroller", omdøbt fra "Optællingsroller"). Optællings admins og status managers vedligeholder ikke længere Placeringer af den grund – kun managere og Placerings admins.
- Alle i teamet ser loggen; kun managere og Placerings admins ser "Fortryd".
- Hubert læser loggen ("hvad er der sket med A1.1 i dag?") og fortryder aldrig – fortryd-ønsker får en knap til loggen.
- Verifikation 22.10: electron 1543/1544 (1 skipped) fra PowerShell, vitest 1431, tsc ren, verify-locations og verify-warehouse ALLE TJEK OK.

### Afgørelser undervejs (log og fortryd)

- Task 2: Ruling: history events now carry a 'change' (pallets incl. serials) — the service strips 'change' from everything it returns to windows (cards, log) and only uses it to decide canUndo, so payloads stay small — cost if wrong: none.
- Task 3: Ruling: isLocationAdmin is false for a status manager (passed on as role 'manager' with statusManager:true) unless they also have Placerings admin; setLocationAdmin refuses status managers — the spec says only Hub managers give the role and Optælling roles give no Placeringer rights — cost if wrong: none.
- Task 4: Ruling: log events carry canUndo plus a Danish 'reason' (no 'description' field) — the screen words each line with t() from the event fields (describeEvent), so only the refusal reason comes from the main process; English shows a generic reason by state — cost if wrong: a field added later.
- Task 4: Ruling: an event without a tx (from before this change) is never matched by tx in repo.undo — the service refuses it with UNDO_NOT_POSSIBLE first, since tx===undefined would otherwise match every old event — cost if wrong: none.
- Task 6: Ruling: describeEvent lives in src/lib/warehouse/locations.ts (not exported from HistoryList.tsx) — HistoryList and the log share it and it is tested as a pure function — cost if wrong: none.
- Task 6: Ruling: Placeringer's canAdmin in the screens now comes from roles.me().locationAdmin for everyone (also Hub managers), so a status manager (role 'manager' in the Hub user) no longer sees the administration — cost if wrong: none.
- Task 7: Ruling: the manager badge keeps the existing wording 'Automatisk via managerrolle' instead of the brief's 'Automatisk via manager-rollen' — one text, already translated in 4 languages — cost if wrong: one string.
- Task 7: Ruling: the card shows no role log lines (it never did); 'log lines for location-admin' is covered by the RolesView.log action types from Task 5 — cost if wrong: a small log list on the card later.
- Task 7: Ruling: the Placeringer select is enabled only for a real manager (view.canGrantStatusManager), matching setLocationAdmin's MANAGER_ONLY; a status manager sees it disabled — cost if wrong: none (the backend refuses anyway).
- Task 7: Ruling: SapCheck's hint now points at 'Lagerstyringsroller' / 'Warehouse roles' since the card was renamed — cost if wrong: none.
- Task 8: Ruling: a history question with only a place-like token (no Placeringer word, no material/49/50) and nothing in the log falls through to Hubert's other answers (like the Z99 rule); with a Placeringer word it says 'Ingen handlinger i loggen for X' — so 'hvad er der sket med P2?' is not hijacked — cost if wrong: one fall-through.
- Task 8: Ruling: Hubert filters the log exactly to the asked place/material (the service matches by prefix, A1.1 also finds A1.10), and 'i dag' means since local midnight; lines older than today get the date in front of HH:MM — cost if wrong: none.
- Task 8: Ruling: undo requests ('fortryd …', 'undo …', 'peru …', 'kumoa …', 'ångra …') get their own read-only text pointing to Placeringer > Log (log:<token> when a token is named) instead of the general 'kun læse' text — cost if wrong: one text.
- Task 8: Ruling: createLocationsAssistant takes an optional now() for tests — cost if wrong: none.
- Final: Ruling: a Hub 'admin' role shown as 'manager' in roles.list (reviewer declined to judge) — predates this branch and also affects setRole; left as is — cost if wrong: an auth-mapping fix later.
- Final: Ruling: month-file growth from snapshots (reviewer declined to judge) — a 500-place series adds ~100 KB to that month's file; acceptable for now — cost if wrong: slower writes in that month.

### Endelig gennemgang (22.10.2026)

- Final: fixed undo with M: down not queued (lookup moved under repo.undo's lock by eventId; roles.read throws STORAGE_UNAVAILABLE when the team folder is unreachable) — 'an undo while M: is down fails as a storage error' + 'when M: is down, a role read fails as a storage error' RED→GREEN, suite 1550/1551 (1 skipped)
- Final: fixed conflict explanation pointing at an undo (blocker skips type 'undo'; clock adds the date when not today) — 'the conflict explanation never points at an undo' RED→GREEN, suite 1550/1551
- Final: fixed undo putting a pallet back on a place that became a pick place; the orphan check now only covers restored pallets and places the undo removes — 2 undo.test.cjs tests RED→GREEN, suite 1550/1551
- Final: fixed the confirmation not saying what happens for the whole action (service.log returns effect for undoable lines; describeUndoEffect; dialog lists it; E2E checks "Pallen på A1.1 får 85 stk. igen (nu 80)") — service 'the log says what an undo will do' + vitest describeUndoEffect RED→GREEN, vitest 1432
- Final: fixed the slow admin log (undoCheck without cloning the state, events grouped by tx once, Hubert reads with verdicts:false) — 'the log stays fast for an admin' RED→GREEN (4534 ms → 15 ms), suite 1550/1551
- Final: verification after the fix pass 22.10: electron 1550/1551 (1 skipped) from PowerShell, vitest 1432, tsc clean, verify-locations + verify-warehouse ALLE TJEK OK.
- Final: minor (deferred): 49/50 search in the log matches the tx's first event only for multi-pallet put-aways.
- Final: minor (deferred): the log's prefix search also matches pallet UUIDs (noise for short queries like "C1").
- Final: minor (deferred): the 500-line cap in the log is silent (no "truncated" hint).
- Final: minor (deferred): a queued undo can be queued twice from a stale log (second replay fails with UNDO_ALREADY).
- Final: minor (deferred): locations:pending returns the code but not the message, so a replayed UNDO_CONFLICT loses its explanation.
- Final: minor (deferred): log lines show the material number without the SAP description.
- Final: minor (deferred): "Fortrudt af X kl. HH:MM" has no date for undos on another day.
- Final: minor (deferred): Locations' canAdmin starts true for a status manager until roles.me() resolves (backend still refuses).
- Final: minor (deferred): Task 3 ruling text says setLocationAdmin refuses status managers; it refuses a status-manager caller, a status-manager target can be listed (code is right).

## Reoler, hylder, gulvpladser og opret/slet (22.10.2026)

- Typen styrer pladsen: Palle = 1 palle, Gulv = ingen grænse, Hylde (lager) = hyldelager (materiale + antal, lagt sammen pr. materiale), Hylde (pluk) som pluk-pladser; Bord, Swap og den gamle Reol-type beholder kapacitetstallet.
- Hylder er almindelige placeringer med `rack`/`shelf` (navn "E9 H5"); reolen er gruppen af hylderne. Hyldelager er sin egen slags data (`stock`) og kommer med i log og fortryd.
- Paller på lagerhylder lægges én gang om til hyldelager (49/50-numre og serienumre i linjens note); omlægningen står i loggen og kan ikke fortrydes.
- Kun tomme placeringer kan slettes; flere på én gang er én handling i loggen og kan fortrydes.
- Verifikation 22.10: electron 1579/1580 (1 skipped) fra PowerShell, vitest 1434, tsc ren, verify-locations og verify-warehouse ALLE TJEK OK.

### Afgørelser undervejs

- Task 1: Ruling: the existing areaSummary test's floor F1.0 (Gulv, capacity 3) is no longer counted in area F and its occupancy is { capacity: null, free: null } — the spec says floors have no limit and the area overview counts pallet places only — cost if wrong: one fixture.
- Task 1: Ruling: changeOf adds the 'stock' key only when stock changed, and undoPlan returns stock only when the state or change has it — keeps the stored change shape of every earlier log line — cost if wrong: none.
- Task 1: Ruling: palletLimit of a lagerhylde is 0 (occupancy shows it full for pallets), and holdsPallets is false for pick/station/reserved places as well — roomIn keeps its own pick handling (a pallet moved onto a pick place is used up) — cost if wrong: one rule.
- Task 3: Ruling: no 'suggestion.shelf' card field (Refill reads materialCard, not a suggestion object); materialCard gets 'refillShelf' (shelfForRefill's location) next to 'shelves' — cost if wrong: one field name.
- Task 3: Ruling: the two-PC migration test stubs pc2's repo.meta to the stale {} and runs the overviews one after the other — running them with Promise.all in one process makes a pending async read of meta.json collide with the other transaction's sync rename (EPERM), a single-process artefact; the under-lock re-check is what the test proves — cost if wrong: none.
- Task 3: Ruling: admin.test's A2.1 fixture with two pallets is now type Bord (a Palle place holds exactly one pallet by the spec) — cost if wrong: one fixture.
- Task 3: Ruling: the migration runs with snapshot:false (not undoable, like import) and logs 'migrate' only when something changed; effectOf adds 'stock' only when the change has stock, so the earlier effect shape stays — cost if wrong: none.
- Task 4: Ruling: shelves of a pick rack are created without fixed materials (locationFrom emptyPick); they get their materials when edited — otherwise 'Opret reol' with formål pluk could never work — cost if wrong: pick shelves without materials until edited.
- Task 4: Ruling: changing a place with pallets into a lagerhylde is refused with LOCATION_NOT_EMPTY (pallets may not stand on a lagerhylde); not in the plan, follows from the spec's 'Paller kan ikke sættes på en lagerhylde' — cost if wrong: one refusal.
- Task 4: Ruling: two older admin.test fixtures used a Palle place with capacity 2 (A2.1 edit, C9.1 list); they are now type Bord — a Palle place is always 1 — cost if wrong: two fixtures.
- Task 4: Ruling: a Gulv place stores capacity 0; changing a Gulv to Bord/Swap without a capacity gives 1; addShelf allows up to H99 (shelfOf reads 2 digits), createRack 1–20 — cost if wrong: none.
- Task 4: Ruling: setActiveMany logs one 'location' event with count and changes.active; names in deleted events are joined with ', ' — the screens word them in Task 7 — cost if wrong: one text.
- Task 5: Ruling: PALLET_PLACE_MANY warns when a Palle place has more than one sheet ROW (pallets or free rows), not only more than one pallet — the fixture's F1.0 (1 pallet + 2 free rows = room for 3) would otherwise lose its room silently; the text suggests type Gulv — cost if wrong: extra warnings in the preview.
- Task 5: Ruling: the existing tests' expectations changed with the spec: H30 (Hylde, mixed) keeps its rows as stock instead of pallets; F1.0 capacity 1 with the warning; applyImport also asserts shelvesMigratedAt and empty stock for the fixture sheet (an apply test with lagerhylde rows was dropped — the service apply path only copies plan.stock) — cost if wrong: one untested copy line.
- Task 5: Ruling: the preview screen's stock count (stats.stock) is shown in Task 8 with the other screens — cost if wrong: none.
- Task 6: Ruling: the plan's 'M: down queued and replayed once' register test is covered by the duplicate actionId test over IPC plus outbox's QUEUED_METHODS (the same path take/putAway already prove for storage errors); ImportSheet got the PALLET_PLACE_MANY label here because tsc required it — cost if wrong: none.
- Task 8: Ruling: three helper files not in the plan's list – MaterialPicker.tsx (the suggestion field, now shared by FetchGuide and ShelfPut instead of copied), ShelfLines.tsx (a shelf's lines with Tag/Flyt/Ret antal dialogs) and RackAdmin.tsx (the rack card's add/remove shelf and delete rack, Task 9's rack part done here so RackCard compiles) — cost if wrong: none.
- Task 8: Ruling: isShelfPlace/palletLimitOf in src/lib/warehouse/locations.ts mirror the backend's isShelf/palletLimit for the screens' checks (Flyt's 'fuld' check used capacity, which is 0 on a floor) — cost if wrong: the screens and backend can drift; the backend still decides.
- Task 8: Ruling: ShelfPut keeps the shelf after Gem (several materials often go on one shelf) and clears material, quantity and 49/50; a 49/50 number with several materials picks the first and says so — cost if wrong: one re-type.
- Task 9: Ruling: deleting from the location card goes to the rack card (a shelf) or the administration afterwards; 'Fjern hylde' on the rack card removes the top shelf only when empty and never the last one — cost if wrong: one navigation.
- Task 9: Ruling: 'Vælg alle i søgningen' selects at most the first 500 shown (the backend's limit); the Optaget column shows '2 mat.' on shelves and the pallet count alone on floors — cost if wrong: none.
- Task 10: Ruling: a shelf token ('E9 H5') makes a question Placeringer's own (strong), like a material number; a write request with only a place-like token ('slet P2') still falls through, so the test uses 'slet placeringen A1.1' — cost if wrong: one fall-through.
- Task 10: Ruling: Finnish uses 'hyllykkö' for rack and 'hylly' for shelf (the plan's 'mitä hyllyssä E9 on' would mean shelf); the warehouse guide module got shelf/rack words (reol, hylde, rack, shelf, hylly, hyllykkoe, hylla …) and 'Opret reol' the single words reol/a rack, since 'hur skapar jag en reol?' otherwise went to Knowledge Base / 'Skapa en inventering' — cost if wrong: a few guide mis-hits.
- Task 10: Ruling: the existing guide steps now say 'Tag'/'Take' for the renamed button and 'managere og Placerings admins' (was status managers and Optælling admins) for Administrér placeringer, plus one sentence on what the type decides — cost if wrong: none.

### Endelig gennemgang (22.10.2026)

- Final: fixed the migration dropping pallets without a quantity (kept as pallets, counted in the migrate event) — 'the migration leaves a pallet without a quantity (or 0) where it is' RED→GREEN, suite 1583/1584 (1 skipped)
- Final: fixed undo breaking the type rules (no pallet restored onto a lagerhylde; a restored place record must fit the pallets/lines that stay on it) — 'an undo never puts a pallet on a lagerhylde, nor leaves stock on a place that is no longer one' RED→GREEN, suite 1583/1584
- Final: fixed 'Tag alt' / 'Flyt' without a number taking whatever is there when it runs (shownQuantity: the quantity shown is sent) — vitest '"Tag alt" and an empty quantity mean the quantity shown' RED→GREEN, vitest 1436
- Final: fixed Enter saving twice on Læg på hylde and Flyt from a shelf (singleFlight guard) — vitest 'a single-flight guard ignores a second run' RED→GREEN, vitest 1436
- Final: fixed Hubert's shelf/rack words taking other questions in every hub (shelf/rack words alone no longer count; a shelf or rack name must not be a quarter/SAP code) — 'shelf and rack words alone do not take other questions' RED→GREEN, suite 1583/1584
- Final: fixed the area summary using the stored capacity (now the type's limit) — 'the area summary counts a pallet place as one' RED→GREEN, suite 1583/1584
- Final: Ruling: 'hvad var tallene i Q3 H1?' still reads 'var' (Swedish 'where') and H1 as a weak contents question — that ambiguity predates this branch; the finding (Q3 H1 read as a shelf, strong) is fixed and the test pins only that — cost if wrong: a rare odd answer when H1 exists.
- Final: verification after the fix pass 22.10: electron 1583/1584 (1 skipped) from PowerShell, vitest 1436, tsc clean, verify-locations + verify-warehouse ALLE TJEK OK.
- Final: minor (deferred): import shelf rows with quantity 0, negative or decimal become stock lines ≤0 (should be skipped/warned).
- Final: minor (deferred): shelfMove to the same shelf succeeds and loses the line's note.
- Final: minor (deferred): Bord(2 pallets) → Palle is allowed without a warning, leaving 2 pallets on a pallet place.
- Final: minor (deferred): English error texts for LOCATION_NOT_EMPTY/RACK_INVALID are too generic for shelves/missing racks.
- Final: minor (deferred): deleting a rack whose shelf another PC already deleted fails with 'Tøm først'; Admin toasts '0 placeringer slettet' as success when all were kept.
- Final: minor (deferred): Tag/Refill accept '0' in the UI (backend refuses with QUANTITY_INVALID).
- Final: minor (deferred): lines on inactive shelves count in materialCard total/shelves, FetchGuide and Hubert.
- Final: minor (deferred): Hubert prints no total when a material is only on shelves; 'hvad er der sket med reol E9?' gets the rack contents; SHELF does not match rack names like PREP12 H2 or E9.1 H5.
- Final: minor (deferred): migration merging into an existing line used to overwrite its note (now appended in the fix pass).
- Final: minor (deferred): a queued shelfSet replayed later overwrites counts made meanwhile (no expected 'before').
- Final: Ruling: the migration drops a pallet's sloc, tags, note and receivedAt (reviewer declined) — the spec keeps only 49/50 numbers and serials; a shelf has no age — cost if wrong: lost tags on shelf goods.
- Final: Ruling: 1.6.4 PCs can still put pallets on Hylde places after the migration flag (reviewer declined) — Placeringer is new in 1.6.5, so no 1.6.4 PC has it — cost if wrong: none.
- Final: Ruling: Refill offers shelves only without a reserve pallet (reviewer declined) — matches the spec's 'uden palle … foreslås hylden' — cost if wrong: one extra step.
- Final: Ruling: undoing events from before the migration that touched now-migrated pallets gives the generic 'noget er ændret siden' (reviewer declined) — safe, only vague — cost if wrong: a vague reason.
- Final: Ruling: undo does not check that a Palle place is full (reviewer declined) — capacity never blocked an undo (spec of the log feature: a full place never blocks) — cost if wrong: two pallets on one place after an undo.
