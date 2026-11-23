# Audit: Optælling (stock count) in Arbejdsværktøjer, version 1.6.8

Read-only audit. No code, git, SAP, VBS or M: was touched. Line numbers refer to the 1.6.8 worktree as read on 2026-11-23.

Scope read in full: `electron/warehouse/countService.cjs`, `countRepository.cjs`, `journal.cjs`, `piDocService.cjs`, `sapPiDocs.cjs`, `sapFetch.cjs`, `roles.cjs`, `report.cjs`, `core/{countState,snapshot,countDoc,piDocs,sapParsers,archive,scopes,period}.cjs`, `sap/{export,matdoc,pidoc-create,pidoc-count,pidoc-serials,pidoc-post,pidoc-delete}.vbs` (logic part), `src/views/warehouse/count/{CountView,ApprovalPanel,DocPanel,PiDocsSection,LinesPanel,ScanPanel,ImportPanel,MatdocImport,MaterialWork,MaterialFocus,OverviewPanel,MembersPanel,RefetchDialog,DeleteCountDialog}.tsx`, `src/views/warehouse/{Counts,NewCount,StatusView,StatusChecklist,StartStatusDialog,SerialRules}.tsx`, the count parts of `register.cjs` and `store.cjs` (`keysAsync`).
Skimmed only: `Rules.tsx`, `Archive.tsx`, `SapCheck.tsx`, `ProgressPanel.tsx`, `MovesPanel.tsx`, `RemoveSerial.tsx`, `optimisticState.ts`, `longserno.vbs`, `mm60.vbs`, `stockcheck.vbs`. No findings are reported from the skimmed files.

Not re-reported (already decided): the 2-year fallback for a material document without year, and the exact-string "already imported" check.

## Summary

| # | Severity | Title |
|---|---|---|
| C1 | Critical | "Læg antal på" enters quantities from an old "dagens SAP-tal" without any freshness check |
| C2 | Critical | "Nulstil" is allowed (and suggested) on a material that is already "Bogført i SAP" |
| C3 | Critical | A failed or empty SAP export is accepted as real stock and goes straight into the count document |
| C4 | Critical | Quantity lines on serial-managed materials count in the difference but are dropped by the count document |
| I1 | Important | Two PCs can create overlapping counts in the same status (scope check is not atomic) |
| I2 | Important | "Hent SAP igen" can replace newer SAP figures with older ones |
| I3 | Important | Material locks never expire, and managers/admins cannot release or answer them from the screen |
| I4 | Important | "Anden placering" with an already counted place silently replaces that line; "Tilføj tællelinje" adds |
| I5 | Important | A serial found in another count of the status still shows as missing in its own count |
| I6 | Important | After SAP has changed, a failure to record the result leaves CountPoint out of sync with SAP, with no way back |
| I7 | Important | "Intet er gemt" is shown after a timeout even when SAP may have posted |
| I8 | Important | PI document scripts read English SAP texts but have no logon-language guard |
| I9 | Important | The SAP document flow keeps running after the status is locked, but can no longer mark "Bogført" or fetch today's figures |
| I10 | Important | ZMS_COUNT_SERIAL step does not check that SAP's counted quantity equals the serials sent |
| I11 | Important | Closing and approving only check this PC's sync; other participants' unsent scans arrive later |
| I12 | Important | Deleting a count or a status deletes the only record of its SAP documents |
| M1 | Minor | `deleteLine` skips the lock and approval checks that `saveLine` makes |
| M2 | Minor | Scans need no place, and the place is sticky across sessions |
| M3 | Minor | Importing serials of an approved or locked material gives no warning (scanning does) |
| M4 | Minor | "Dine seneste importer" lists undone imports and loses imports after 20 events |
| M5 | Minor | A failed queued scan shows an error without the serial number |
| M6 | Minor | "Godkend alle uden difference" has no confirmation and its toast count is guessed on the client |
| M7 | Minor | Outdated text: "Markeringen er kun en note – Optælling bogfører intet." |
| M8 | Minor | Dead code that still costs M: I/O: `expected-prev` backup, `repo.deleteCount(s)` |
| M9 | Minor | Slow path: every refresh lists the whole team folder and reads journal chunks one by one |
| M10 | Minor | Slow path and memory: opened counts are never evicted; the checklist opens every count fully |
| M11 | Minor | A half-written refetch makes every PC re-read the full snapshot every 30 s, forever |
| M12 | Minor | Duplicated "approved or posted" logic and duplicated limits |
| M13 | Minor | Locking a status is not atomic with the reports it writes |
| M14 | Minor | `enterSerials` rejects serials the count itself accepts (uncertain if such serials occur) |
| M15 | Minor | Start status: year bounds differ between screen and backend; same quarter can be started twice |
| M16 | Minor | The serial index is keyed by serial only (uncertain) |
| M17 | Minor | Area claim is read-then-write; two PCs can both "win" an area |
| M18 | Minor | A quantity line's storage location is never chosen by the user |

Counts: **Critical 4, Important 12, Minor 18.** Suggested additions follow the findings.

---

## Critical

### C1. "Læg antal på" enters quantities from an old "dagens SAP-tal" without any freshness check

**Where:** `electron/warehouse/piDocService.cjs:97-141` (count), `electron/warehouse/core/countDoc.cjs:71-86` (`expectedQty = sapToday + diff`), `electron/warehouse/countService.cjs:1342-1351` (`fetchDocStock`, refuses when locked at 1345), `src/views/warehouse/count/DocPanel.tsx:195-198` (the only warning).

**What happens today:** The quantity sent to MI04 is `row.docQty`, computed from the stored "doc of the day" (`count-<id>-doc`) as SAP-stock-then + approved difference. `piDocService.count()` only checks `docQty !== null` and `>= 0` (line 120-121). It never compares `doc.fetchedAt` with today, with the PI document's `createdBy.at`, or with anything else. The only guard is an amber text in DocPanel when the date is not today.
Scenario: Monday 08:00 a manager fetches "dagens SAP-tal" and creates the MI31 document for R162-0717 (SAP 100, approved diff -3, docQty 97). Monday afternoon 20 pcs are issued in SAP. Wednesday an admin presses "Læg antal på": MI04 gets 97 although SAP's book quantity is now 80. MI20 then posts +17 instead of -3. The same happens within one day if goods move between the fetch and the count entry. For serial documents the serial list of the day is equally stale (`copySerials(forDoc)` uses the same stored doc).

**Why it matters to users:** It is a wrong stock correction in PS4, and the admin who enters the count is not the one who saw the warning.

**Exactly what should change:**
1. Store `docFetchedAt` on the PI document when it is created (`piDocService.create`, from `counts.countDoc().fetchedAt`).
2. In `piDocService.count()` refuse with a new code `PIDOC_DOC_STALE` when the stored doc of the day is older than the PI document's creation, or not from today (local date). Message: "Hent dagens SAP-tal igen, før antallet lægges på. Tallene er fra {dato}."
3. Better still: let `count()` fetch MB52/IQ09 itself for just the document's sloc right before MI04/ZMS_COUNT_SERIAL (it already holds `bridge.exclusive` access through the writer), and recompute `docQty`. Show the recomputed number in the SAP-waiting text.
4. Allow `fetchDocStock` when the status is locked (see I9), otherwise C1 cannot be fixed after locking.

**Risk of the change:** Low. Point 2 only adds a refusal; point 3 adds one SAP read (minutes) to the count step.

**Severity:** Critical (wrong SAP change).

### C2. "Nulstil" is allowed (and suggested) on a material that is already "Bogført i SAP"

**Where:** `electron/warehouse/countService.cjs:1172-1201` (`setApproval`), `src/views/warehouse/count/ApprovalPanel.tsx:134` and `:142`, `src/views/warehouse/count/OverviewPanel.tsx:166`. The behaviour is even locked in by `countService.test.cjs:696-706`.

**What happens today:** `setApproval(..., 'reset')` only refuses when an SAP document that is not deleted holds the material (`PIDOC_ACTIVE`). A material marked "Bogført i SAP" by hand (the "Bogført i SAP" button, no PI document) can be reset to open. The backend also accepts `approved` and `returned` on a posted material (the screen hides those two buttons, but not "Nulstil"). The screen actively points there: "+N talt efter godkendelse – Nulstil for at tage dem med" is shown for posted materials too, and the frozen badge says "Nulstil godkendelsen for at bruge de nye tal".
Scenario: R162-0717 was approved with -3 and posted in SAP by hand. Later a counter finds 2 more and scans/lines them. The manager follows the hint and presses "Nulstil", then approves again with the live numbers (still against the old snapshot: -1), fetches "dagens SAP-tal" (which already contains the -3 posting) and creates a new document: docQty = SAP today (97) + (-1) = 96. The difference is posted a second time.

**Why it matters to users:** Double correction of stock in PS4, guided by the app's own hint.

**Exactly what should change:**
- In `setApproval`, refuse `reset`, `returned` and `approved` when `current.status === 'posted'` (new message: "{materiale} er bogført i SAP og kan ikke ændres. Lav en ny optælling, hvis der skal rettes mere.").
- ApprovalPanel: hide "Nulstil" for `posted`; for posted rows with `countedAfter !== 0` show "talt efter bogføring, indgår ikke" instead of the reset hint. Same in `OverviewPanel` `FrozenBadge`.
- Update the test at `countService.test.cjs:696-706` to expect a refusal.

**Risk of the change:** Low. A wrong manual "Bogført" mark can then not be undone in the app; if that is needed, allow it only for managers with a reason and only when no SAP document exists, and log it.

**Severity:** Critical (wrong SAP change).

### C3. A failed or empty SAP export is accepted as real stock and goes straight into the count document

**Where:** `electron/warehouse/sap/export.vbs:194-199` (MB52 still on selection screen = success with 0 rows, status bar not checked) and `:218` (IQ09 without grid = success with 0 rows); compare `sap/matdoc.vbs:133-138`, which does check `MessageType = "E"`. `electron/warehouse/sapFetch.cjs:56-66` (no sanity check), `countService.cjs:1342-1351` (`fetchDocStock` writes the result with no preview), `piDocService.cjs:115` (empty serial list = zero count).

**What happens today:** If MB52 stays on screen 1000 for any reason (an error message in the status bar, an authorisation message), the script reports `ok:true, rows:0`; if IQ09 shows no grid (popup, error), it reports `ok:true, rows:0`. `fetchPlant` turns this into an empty stock list or an empty serial list. For a new count or "Hent SAP igen" the user at least sees a preview. `fetchDocStock` has no preview: it saves the empty result as "dagens SAP-tal". Then `sapToday = 0`, `docQty = diff` (0 for a material without difference) and every serial row gets `docSerials = []`. `piDocService.count()` turns an empty serial list into `{ qty: 0 }` for MI04, which sets "Zero Count".
I could not verify in SAP how often these screens occur; the code path itself is verified. **Trigger: uncertain.**

**Why it matters to users:** A zero count on a document posts the whole book stock of those materials as a loss.

**Exactly what should change:**
- `export.vbs`: on screen 1000 after F8 (MB52) and when no grid is found (IQ09), return `ok:false` with the status bar text when `MessageType` is `E` or `A`, exactly like `matdoc.vbs`.
- `sapFetch.run`: refuse (`SAP_EXPORT_EMPTY`) when MB52 returns no rows for D301, and when IQ09 unrestricted returns no rows while MB52 has INT materials with stock.
- `fetchDocStock`: refuse when the new doc of the day has no line for a material that is approved in the count and had SAP stock at approval, unless the user confirms; show "SAP i dag 0" rows in red.
- `piDocService.count()`: never turn an empty serial list into a zero count silently; require `row.sapToday === 0` or an explicit confirmation.

**Risk of the change:** Low to medium; a genuinely empty IQ09 list (no serials at all) would need the confirmation path.

**Severity:** Critical (wrong SAP change; trigger uncertain).

### C4. Quantity lines on serial-managed materials count in the difference but are dropped by the count document

**Where:** `electron/warehouse/countService.cjs:799-815` (`validateLine` accepts any material), `src/views/warehouse/count/LinesPanel.tsx:388` (only a soft hint), `electron/warehouse/core/countState.cjs:128` (`counted = countedSerials + countedLines`), `countState.cjs:247-258` (progress ignores `countedLines` for serial rows), `core/countDoc.cjs:84-85` (document quantity = serial list only), `countState.cjs:198-206` (`freezeRows` stores the unscanned serials as missing).

**What happens today:** "Tilføj tællelinje" lets a counter type a serial-managed material with a quantity ("Materialet har serienumre i SAP – scan dem helst i stedet." is only a hint), and the backend accepts it.
Scenario: INT4300-4921-0, SAP 10. A counter scans 8; two labels are unreadable, so she adds a line "2 stk." on Reol 3. Overview: counted 10, diff 0. Progress: 80 %. "Godkend alle uden difference" approves it as "Ingen difference" and freezes the 2 unscanned serials as `missingSerials`. The count document builds the serial list as SAP serials minus those 2, so `docQty = 8`, and DocPanel says "Serienumrene bestemmer". ZMS_COUNT_SERIAL then posts -2 for items that were counted.

**Why it matters to users:** The approved figure and the posted figure differ, and the screen tells the user to trust the wrong one.

**Exactly what should change:** In `validateLine` refuse lines for materials where `index.materials.get(material)?.serialManaged` is true (`LINE_SERIAL_MANAGED`: "Materialet har serienumre. Scan eller importér dem, eller brug Fjern serienummer."). In AddLine turn the hint into a blocking message. For existing counts that already have such lines, show them as an error in ApprovalPanel and block approval of that material until the lines are deleted.

**Risk of the change:** Low. Counters lose a workaround for unreadable labels; the matdoc import and manual typing of the serial cover that case.

**Severity:** Critical (wrong SAP change).

---

## Important

### I1. Two PCs can create overlapping counts in the same status (scope check is not atomic)

**Where:** `electron/warehouse/countService.cjs:276-289` (`createCount` → `assertScopeFree` at 121-126), `electron/warehouse/countRepository.cjs:39-56` (files first, index `setField` last, no compare).

**What happens today:** `assertScopeFree` reads the index, then `repo.createCount` writes four files (15-90 s each per the code comments) and only then adds the index entry with a plain `setField`. Two people who both press "Opret optælling" for D000 terminals within that window both pass the check, and both counts are created.

**Why it matters to users:** Two counts in one status cover the same stock. Every serial is found in one and "missing" in the other (or found in both as duplicates in neither), and the status report adds both differences: double-counted differences.

**Exactly what should change:** Reserve the scope inside the index lock first: `repo.createCount` does `mutateAsync(INDEX_KEY)` that re-runs `scopeOverlap` against the entries of the same status (including entries with `state: 'creating'`) and writes `{ ..., creating: true }`; then write the files; then flip `creating` off. Readers already skip unknown fields; `listCounts` should hide `creating` entries older than e.g. 10 min (crash).

**Risk of the change:** Medium: changes the order of writes in `createCount`; covered by existing repository tests plus one new race test.

**Severity:** Important.

### I2. "Hent SAP igen" can replace newer SAP figures with older ones

**Where:** `electron/warehouse/countService.cjs:1140-1170` (`previewRefetch` / `applyRefetch`).

**What happens today:** The preview token lives 30 min. `applyRefetch` checks only the token's owner and count, not whether the count's `meta.fetchedAt` changed since the preview, nor whether the count is still open.
Scenario: Admin A opens the refetch dialog at 10:00 (SAP data 10:00) and goes for coffee. Owner B refetches at 10:15 (data 10:15). At 10:25 A presses "Tag de nye tal i brug": the snapshot goes back to 10:00 data, and every PC adopts it via `adoptNewSnapshot`.

**Why it matters to users:** Differences are computed against older stock without anyone noticing. The only visible trace is that "SAP hentet" in the header goes back from 10:15 to 10:00.

**Exactly what should change:** Keep `basedOn: state.meta.fetchedAt` in the pending entry; in `applyRefetch` read meta fresh and refuse with `REFETCH_OUTDATED` ("En anden har hentet SAP igen imens. Hent igen for at se forskellene.") when `meta.fetchedAt !== basedOn` or `entry.snapshot.fetchedAt <= meta.fetchedAt`, and refuse `COUNT_CLOSED` when the count is closed.

**Risk of the change:** Low.

**Severity:** Important.

### I3. Material locks never expire, and managers/admins cannot release or answer them from the screen

**Where:** `electron/warehouse/countService.cjs:967-1033` (`takeMaterial`, `mayCount`, `answerMaterialRequest` at 1001, `releaseMaterial` at 1018), `src/views/warehouse/count/MaterialWork.tsx:108` and `:169`.

**What happens today:** A material lock has no idle time (area claims expire after 30 min, locks do not). `saveLine` refuses everyone else with "X tæller R162-0717 – anmod om at tælle med". The request goes to the holder or the count owner only (`answerMaterialRequest`). "Frigiv" for other people's locks is shown only to the owner, although the backend also lets managers release.
Scenario: Kim locks R162-0717 on Friday and goes on holiday. On Monday nobody can save count lines for it; the owner is out too; the manager sees no "Frigiv" button.

**Why it matters to users:** The count stops for that material until the right person turns up.

**Exactly what should change:**
- Expire a lock when the holder has no `line`/`scan` event on the material for e.g. 60 min (same idea as `CLAIM_IDLE_MS`); show "inaktiv siden {tid}".
- Show "Frigiv" and let `answerMaterialRequest` accept the answer from `rights.byRole` (managers and Optælling admins), matching `canDecideMembers`.

**Risk of the change:** Low; an expired lock only reopens the material to others.

**Severity:** Important.

### I4. "Anden placering" with an already counted place silently replaces that line; "Tilføj tællelinje" adds

**Where:** `src/views/warehouse/count/LinesPanel.tsx:205-221` (`MaterialRow.save`, `existing` at 209, `lineId` at 211) versus `:336-361` (`AddLine.save`, always `newLineId()` at 342).

**What happens today:** In the material list, choosing "Anden placering …" and typing a place that already has a line for that material reuses that line's id: the new quantity replaces the old one (even another counter's line). The quantity field is empty, unlike picking the place from the dropdown, which pre-fills the old quantity. In "Tilføj tællelinje" the same input adds a second line, and both are summed.
Scenario: Anna counts 10 on "Reol 3". Bo later finds a second box on Reol 3, types "Reol 3" under "Anden placering" and 6: the line now says 6, Anna's 10 are gone. The toast just says "Gemt: 6 × … på Reol 3".

**Why it matters to users:** Counted quantity is lost silently, and the same action means different things on two screens.

**Exactly what should change:** In `MaterialRow.save`, when `choice === OTHER` and `existing` is found, ask "Der er allerede talt {n} på {placering}. Erstat med {m} eller læg {m} til?" and send `qty: existing.qty + value` for "læg til". In AddLine, warn the same way when a line for the same place and material exists.

**Risk of the change:** Low (screen only).

**Severity:** Important (data loss).

### I5. A serial found in another count of the status still shows as missing in its own count

**Where:** `electron/warehouse/core/countState.cjs:36-44` (`matchSerial`: `index.others` is only consulted when the serial's SAP sloc is one of this count's slocs), `countService.cjs:392-406` (`refreshOthers` only feeds scan outcomes), `core/countDoc.cjs:47-61` (`missingAtApproval`).

**What happens today:** Count A (D000 terminals) scans serial X whose SAP sloc is D006. A records it as "Anden storage location" and puts it on the move list. Count B (D006 terminals, same status) never learns this: X stays "Mangler" in B, is frozen as missing at approval, and B's count document leaves it out. Unless someone moves it in SAP first, B's document writes off an item that A found.

**Why it matters to users:** Found stock is written off, and the person approving B cannot see why.

**Exactly what should change:** Build a status-wide "found elsewhere" map (serial → count name, place, by, at) from the other counts' `aggregate.serials.extra` (they are already loaded for `statusCounts`; cache per status like `refreshOthers`). Show it in B's "Mangler" lists and in MaterialFocus as "Fundet i '{A}' på {placering}". In `approveAllWithoutDifference` and `setApproval('approved')` warn when a material has missing serials found elsewhere; in `buildCountDoc` flag such serials like `serialMismatch`.

**Risk of the change:** Medium (reads other counts' journals); keep it read-only and cached.

**Severity:** Important.

### I6. After SAP has changed, a failure to record the result leaves CountPoint out of sync with SAP, with no way back

**Where:** `electron/warehouse/piDocService.cjs:43-75` (create: `catch` at 57 deletes the reservation; final write 63-74), `:144-180` (post), `:97-141` (count); `sap/pidoc-create.vbs:250-268` (errors after the user's F8: `left-mi31`, `not-created`, `no-access-mi22`, `mi22-screen-changed`, `created-but-not-found`, `read-failed`); `sapPiDocs.cjs:124-128`. Compare Softwareload: `register.cjs` "A SAP document is written here before M:, so a drive that fails right after SAP posted never loses it."

**What happens today:**
- Create: the user presses F8, MI31 creates the documents, then the MI22 lookup fails. The writer throws, `create()` deletes the reservation, the user sees "Oprettelsen i MI31 fejlede". SAP has active documents with CountPoint's reference; CountPoint has none. A new attempt fails in the MI31 test run (stock already has an active document), and CountPoint cannot delete the orphan (it has no record).
- Create, post, count: if the final `changePiDocs` write to M: fails after SAP succeeded, the result exists only in memory. The doc stays `creating` (ignored after 20 min), `printed` or `counted`. A posted document stays "Antal lagt på" forever; posting again finds nothing in MI20.

**Why it matters to users:** Managers see a state that contradicts SAP and have to clean up in SAP by hand; materials can get stuck as "Godkendt" although they are posted.

**Exactly what should change:**
- Keep a local, encrypted PI-doc journal (same pattern as `softwareload-journal`) written immediately after each script returns ok, replayed to M: until it succeeds.
- On any failure after the user's F8 in create, keep the entry as `status: 'unknown'` with its `reference` instead of deleting it.
- Add "Tjek i SAP" (see S1) that reads MI22 by reference / document number and sets `created`/`counted`/`posted`/`deleted` from SAP.

**Risk of the change:** Medium; new state `unknown` must be handled by `planDocument` (treat as taken) and by the UI.

**Severity:** Important.

### I7. "Intet er gemt" is shown after a timeout even when SAP may have posted

**Where:** `electron/warehouse/sapPiDocs.cjs:26-33` (`scriptFailure`: `timeout` → "Der blev ikke trykket i SAP i tide ({what}) – intet er gemt. Prøv igen"), `sap/pidoc-post.vbs:214-229` (the loop only ends when the user is back on the MI20 list).

**What happens today:** In MI20 the user presses "Post Difference" and Save, then presses Back to the selection screen (or goes to another transaction) instead of staying on the list. The loop never sees `SAPMSSY0/120/1` again and times out after 15 min. The user is told nothing was saved and to try again, while the documents are posted.

**Why it matters to users:** They may post manually again, or believe stock was not corrected.

**Exactly what should change:** In `pidoc-post.vbs`, on timeout still read MI22 (like the "window closed" path at 230-244) and return the status; in `sapPiDocs.postDocuments` treat timeout like a normal end. For MI04 and ZMS_COUNT_SERIAL after a timeout, read the item back (both scripts already have the read-back code) instead of saying "intet er gemt". Text when the state is unknown: "Optælling ved ikke, om SAP har gemt. Tryk Tjek i SAP."

**Risk of the change:** Low.

**Severity:** Important.

### I8. PI document scripts read English SAP texts but have no logon-language guard

**Where:** `sap/pidoc-create.vbs:251` (`InStr(title, "Created")`), `electron/warehouse/core/sapParsers.cjs:200-238` (`parseMi22`/`parseMi20` accept English headers only: `PhysInvDoc`, `Doc. Status`, `Book Quantity` …), `sapPiDocs.cjs:151-152` (`posted with m. doc.`, `/active/i`), `:169-170` (`/deleted/i`). Softwareload refuses non-English logons: `sap/sl-transfer.vbs:342`, `sap/sl-block.vbs:282`. `export.vbs` explicitly supports Danish logons ("so it also works with a Danish SAP logon").

**What happens today:** With a Danish logon, MI31 creates the document but the window title has no "Created": the script returns `not-created`, the reservation is deleted (orphan, see I6). In MI20/MI22 the parsers throw `SAP_FORMAT` after the user has posted.

**Why it matters to users:** SAP is changed, CountPoint says it failed.

**Exactly what should change:** Add the same check as Softwareload at the top of all `pidoc-*.vbs` (`s.Info.Language` must be `EN`/`E`, else `language-not-supported` before anything is filled), and map it in `scriptFailure` to "Log på SAP på engelsk (EN), og prøv igen".

**Risk of the change:** Low.

**Severity:** Important.

### I9. The SAP document flow keeps running after the status is locked, but can no longer mark "Bogført" or fetch today's figures

**Where:** `electron/warehouse/piDocService.cjs` (no lock check anywhere), `countService.cjs:1231-1234` (`markPosted` → `assertStatusOpen`), `piDocService.cjs:158-166` (the refusal is swallowed into `console.error`), `countService.cjs:1345` and `:1339` (`fetchDocStock` refused and `canFetch` false when locked), `src/views/warehouse/StatusChecklist.tsx:107` ("Bagefter kan intet i statussen ændres").

**What happens today:** The checklist accepts "Godkendt" as ready, so a status is usually locked before the documents are posted. After locking, managers can still create, print, count and post PI documents in SAP. But "Hent dagens SAP-tal" is gone (so C1 cannot be avoided), and when MI20 posts, `markPosted` throws `STATUS_LOCKED`, which is only logged: the materials stay "Godkendt", and the screen says "Materialerne er markeret Bogført i SAP" (DocPanel toast).

**Why it matters to users:** The archive and reports never show the posting; the toast is wrong.

**Exactly what should change:** Decide one rule and apply it in both places. Recommended: the SAP document steps and "Hent dagens SAP-tal" are allowed after lock (they are the follow-up), and `markPosted` bypasses `assertStatusOpen` (it only moves `approved` → `posted`). Return `marked.posted/skipped` from `piDocService.post` and only show the "markeret" toast for those. Change the LockDialog text to "Tal og godkendelser kan ikke ændres. SAP-dokumenterne kan stadig laves og bogføres."

**Risk of the change:** Low.

**Severity:** Important.

### I10. ZMS_COUNT_SERIAL step does not check that SAP's counted quantity equals the serials sent

**Where:** `sap/pidoc-serials.vbs:244-245` (checks only `XZAEL = "X"`), `electron/warehouse/sapPiDocs.cjs:72`, `piDocService.cjs:117-118`. Compare `sap/pidoc-count.vbs:212`, which compares `MENGE` with the wanted quantity.

**What happens today:** After "Update Count" the script only checks that the item is marked counted. If the user deleted rows in the grid, or SAP dropped some, the counted quantity differs from the list without anyone noticing; `remember()` stores SAP's `MENGE` but nothing compares it.

**Why it matters to users:** A wrong count goes to MI20 posting unnoticed.

**Exactly what should change:** In `pidoc-serials.vbs` return `not-counted: <MENGE>` when `CDbl(MENGE) <> count` (number of serials sent). In `piDocService.count` compare `result.counted` with `serials.length` and stop with `PIDOC_NOT_COUNTED` if different. Parse `MENGE` with `parseSapNumber`, not `Number()` (a value like "1.234" or "12,000" becomes wrong with `Number`).

**Risk of the change:** Low.

**Severity:** Important.

### I11. Closing and approving only check this PC's sync; other participants' unsent scans arrive later

**Where:** `electron/warehouse/countService.cjs:1096-1101` (`requireSynced` flushes this PC's journal only), `:1118-1132` (`closeCount`), `:1036-1060` (`submitMaterial`), `journal.cjs` (no information about other writers' pending events).

**What happens today:** A helper's PC loses M: for an hour and keeps 40 scans locally ("Offline · 40 venter" only on that PC). The owner closes the count and the manager approves with -40. When the helper's PC comes back, the scans upload into the closed count; the approved materials show "+40 talt efter godkendelse".

**Why it matters to users:** Approval is based on incomplete numbers, and nobody saw the risk at close time.

**Exactly what should change:** Each journal writes a small heartbeat in its chunk (`uploadedAt`, `pendingAtUpload`) on every flush, and a `lastEventAt`. In the close dialog and ApprovalPanel, list participants whose last event is newer than their last upload, or whose PC has not uploaded for more than N minutes while they had events in the last hour ("Bo's PC har ikke sendt siden 10:42"). See S4.

**Risk of the change:** Low (extra field in chunk files, read-only use).

**Severity:** Important.

### I12. Deleting a count or a status deletes the only record of its SAP documents

**Where:** `electron/warehouse/countService.cjs:1394-1440` (`deleteCount`, `removeCounts`, `deleteStatus`), `countRepository.cjs:91-97` (`removeCountFiles` removes every `count-<id>-*` file, including `sap-dokumenter`), `report.cjs` (no PI document or material document numbers in any report), `src/views/warehouse/count/DeleteCountDialog.tsx:31`, `StatusChecklist.tsx` delete dialog text.

**What happens today:** A count with created, counted or posted SAP documents can be deleted by its owner or a manager; a locked status with all its counts can be deleted. The dialogs say "Allerede gemte Excel-rapporter bliver liggende", but those reports do not contain the SAP document or material document numbers. The archive that shows them is computed live and is gone too.

**Why it matters to users:** Audit trail of what CountPoint posted in PS4 is lost; an active document in SAP can no longer be found from the app.

**Exactly what should change:** Refuse deleting a count that has a PI document in `creating/created/printed/counted` ("Slet SAP-dokumenterne først"). For posted documents, write them into the tombstone in the index (`deletedDocs: [{docNo, year, materialDoc}]`) or block deletion of locked statuses. Add a "SAP-dokumenter" sheet to the count and status reports (`docNo`, status, `materialDoc`, differences). Mention SAP documents in both delete dialogs.

**Risk of the change:** Low.

**Severity:** Important (data loss).

---

## Minor

### M1. `deleteLine` skips the lock and approval checks that `saveLine` makes

**Where:** `electron/warehouse/countService.cjs:829-835` vs `:817-827`; `LinesPanel.tsx` `OwnRow` shows edit and delete on every line to anyone with `canWrite`.
**What happens today:** Editing another counter's line on a material locked by someone else is refused (`MATERIAL_LOCKED`); deleting it is accepted. A line of an approved material can be deleted (it then shows as negative "talt efter godkendelse"). Only the person who deleted can undo it.
**Why it matters:** Counted quantity can disappear by mistake, inconsistently with edit.
**Change:** In `deleteLine` look up the line's material from `state.aggregate.lines`, then apply the same `takeMaterial` checks as `saveLine` (approved → refuse; locked by someone else → refuse unless owner/byRole).
**Risk:** Low. **Severity:** Minor.

### M2. Scans need no place, and the place is sticky across sessions

**Where:** `countService.cjs:745-766` (`scan` accepts an empty place), `ScanPanel.tsx:36` (place loaded from `localStorage`), session list (`ScanPanel.tsx` "Denne session") does not show the place.
**What happens today:** Import requires a place ("Stedet er obligatorisk, så man kan finde varerne igen") and lines require one; scans do not. And the last place is restored the next day, so a counter who forgets to change it attributes a whole pallet to yesterday's place.
**Why it matters:** The move list and "Fundet på" lose their value.
**Change:** Show the current place in the big result box and in each session row; ask for a place when it is empty (or mark the scan amber "uden sted"); clear the stored place when it is older than e.g. 8 hours.
**Risk:** Low. **Severity:** Minor.

### M3. Importing serials of an approved or locked material gives no warning (scanning does)

**Where:** `countService.cjs:840-880` (`checkSerials`/`importSerials` never read approvals or locks), `MatdocImport.tsx` `CheckSummary`.
**What happens today:** A scan of an approved material says "Materialet er allerede godkendt …"; importing 200 serials of the same material says nothing and they become "talt efter godkendelse".
**Change:** Add `approved` and `locked` counters to the check result and show them in `CheckSummary`.
**Risk:** Low. **Severity:** Minor.

### M4. "Dine seneste importer" lists undone imports and loses imports after 20 events

**Where:** `countService.cjs:553` (`myLastEvents`: last 20 non-undo events, including undone ones), `ImportPanel.tsx:81`.
**What happens today:** An undone import stays in the list with a "Fortryd" button that then fails with "Der er ikke noget at fortryde". After 20 scans the import is no longer listed and cannot be undone from the screen.
**Change:** Return `myImports` separately: all own `import` events not undone (via `activeEvents`), newest first.
**Risk:** Low. **Severity:** Minor.

### M5. A failed queued scan shows an error without the serial number

**Where:** `ScanPanel.tsx:71-93` (error toast at 88).
**What happens today:** When a queued scan fails (e.g. the count was just closed), the serial is dropped and the toast shows only the error message; five failures give five identical toasts.
**Change:** Include `next` in the toast and add the failed serial to the session list in red ("ikke gemt").
**Risk:** Low. **Severity:** Minor.

### M6. "Godkend alle uden difference" has no confirmation and its toast count is guessed on the client

**Where:** `ApprovalPanel.tsx:83-88`, `countService.cjs:1203-1229` (returns `{ approved }`, ignored by the screen).
**What happens today:** One click approves possibly hundreds of materials (including ones "Sendt tilbage" for recount); the toast count comes from the client's view, the server may approve a different number.
**Change:** Confirm with the list count, then show the server's `approved` number. Consider skipping `returned` materials.
**Risk:** Low. **Severity:** Minor.

### M7. Outdated text: "Markeringen er kun en note – Optælling bogfører intet."

**Where:** `ApprovalPanel.tsx:94`.
**What happens today:** Optælling does post via MI20 ("Bogfør" in "Til optællingsdokument") when the SAP document flow is on.
**Change:** "Bogført i SAP sættes automatisk, når et SAP-dokument bogføres herfra. Knappen er til materialer, der er bogført uden for Optælling." (Only show the manual button when no SAP document holds the material.)
**Risk:** None. **Severity:** Minor.

### M8. Dead code that still costs M: I/O: `expected-prev` backup, `repo.deleteCount(s)`

**Where:** `countRepository.cjs:140-148` (reads the old snapshot uncached and writes it as `expected-prev` on every refetch), `:301` `getPreviousSnapshot` (used only in tests), `:69-77` `deleteCount`/`deleteCounts` (used only in tests).
**What happens today:** Every "Hent SAP igen" does one extra full read and one extra full write of a plant-wide snapshot on M:, for a backup nothing reads.
**Change:** Remove the backup (or expose it in the refetch dialog as "Fortryd seneste SAP-hentning" if wanted); remove the unused repository functions and their tests.
**Risk:** Low. **Severity:** Minor.

### M9. Slow path: every refresh lists the whole team folder and reads journal chunks one by one

**Where:** `journal.cjs:22-38` (`readAllJournals`: `keysAsync()` then a sequential `await` per chunk), `store.cjs:437-443` (`keysAsync` = uncached `readdir` of the team folder), called from `countService.cjs:334-341` (`refresh`) at most every 1.5 s per open count, and the screen polls every 5 s (`CountView.tsx` `POLL_MS`).
**What happens today:** The team folder holds every count's files and journal chunks of all statuses; each refresh lists it all over SMB, then reads every non-full chunk sequentially.
**Change:** Read the chunks with `Promise.all`; cache the key list for a few seconds (or use the store watcher's change list); optionally keep a per-count list of writers.
**Risk:** Low. **Severity:** Minor.

### M10. Slow path and memory: opened counts are never evicted; the checklist opens every count fully

**Where:** `countService.cjs:50` (`opened`), `:309-332` (`load` keeps snapshot with the plant-wide serial index, journal, chunk cache), `:139-155` (`checklistData` → `reportData` → `load` + forced `refresh` + `flush` for every count), `piDocService.cjs:22-25` (`roles.roleOf` reads the roles file from M: on every call, bypassing `cachedRoleOf`).
**What happens today:** A manager who opens StatusView for a status with 10 counts loads 10 plant-wide snapshots and keeps them in memory until the app closes; each "Opdatér" re-reads all journals.
**Change:** Evict states not used for e.g. 10 min (after `journal.close()`); for the checklist use the stored summaries plus approvals and only load counts that are closed and changed since last time; pass the cached role into `piDocService`.
**Risk:** Low to medium. **Severity:** Minor.

### M11. A half-written refetch makes every PC re-read the full snapshot every 30 s, forever

**Where:** `countService.cjs:1154-1170` (`applyRefetch` writes snapshot and meta in parallel), `:362-381` (`adoptNewSnapshot` retries with `fresh: true` every `SNAPSHOT_RETRY_MS`).
**What happens today:** If the snapshot write fails and the meta write succeeds, meta says the new `fetchedAt` while the old snapshot stays. Every PC with the count open re-reads the full snapshot uncached every 30 s and never adopts it; the header shows the new "SAP hentet" time over the old numbers.
**Change:** Write the snapshot first, then the meta (the snapshot file is self-describing via `fetchedAt`); give up the retry after a few attempts and show "SAP-tallene kunne ikke hentes fra M:".
**Risk:** Low (slightly slower refetch). **Severity:** Minor.

### M12. Duplicated "approved or posted" logic and duplicated limits

**Where:** `['approved', 'posted'].includes(...)` in `countService.cjs` (checklistData, previewRefetch, approveAll, `isApprovedStatus`), `core/countState.cjs` (`applyApprovals`, `computeProgress`), `core/countDoc.cjs`, `ApprovalPanel.tsx`, `MaterialWork.tsx` `isApproved`; `MAX_LINES = 20` in `DocPanel.tsx` and `core/piDocs.cjs`.
**Change:** One `isApprovedStatus` exported from `core/countState.cjs` (and mirrored once in `src/lib/warehouse`), `MAX_LINES` sent with `piDocs.list()`.
**Risk:** Low. **Severity:** Minor.

### M13. Locking a status is not atomic with the reports it writes

**Where:** `countService.cjs:157-189`.
**What happens today:** The checklist is read, then all Excel reports are written (can take minutes on M:), then the status is set to locked with a compare on `open`. Meanwhile an owner can reopen a count or a manager can change an approval; the status then locks with an open count or with reports that do not match. Two managers locking at once both write reports; the loser leaves orphan files named "(2)".
**Change:** First CAS the status to `state: 'locking'` (refuse writes like locked), then build reports from a fresh read, then CAS to `locked`; on error CAS back to `open` and delete the files written.
**Risk:** Medium (new transient state). **Severity:** Minor.

### M14. `enterSerials` rejects serials the count itself accepts (uncertain if such serials occur)

**Where:** `sapPiDocs.cjs:59` (`/^[A-Z0-9]{1,40}$/`), `core/countState.cjs:7` (`SERIAL_PATTERN` also allows `. _ / -`).
**What happens today:** If one serial (or long serial) of a document contains `-`, `.`, `/` or `_`, the whole "Læg antal på" step stops with "Ugyldige serienumre". I did not check real data for such serials: **uncertain**.
**Change:** Use the same pattern as `normalizeSerial` in `enterSerials` and in `pidoc-serials.vbs` handling.
**Risk:** Low. **Severity:** Minor.

### M15. Start status: year bounds differ between screen and backend; same quarter can be started twice

**Where:** `StartStatusDialog.tsx:24` (2020-2100), `countRepository.cjs:210` (2000-2100, no check for an existing status with the same year and quarter).
**Change:** One bound; warn (not block) when a status with the same year and quarter exists: "Der findes allerede 'Status Q4 2026' (låst {dato})."
**Risk:** None. **Severity:** Minor.

### M16. The serial index is keyed by serial only (uncertain)

**Where:** `core/snapshot.cjs:148-153` (`indexSnapshot` from line 140), `core/countState.cjs` (`missing`, `found` maps by serial).
**What happens today:** SAP serial numbers are unique per material, not globally. If two materials in D301 share a serial, the second overwrites the first in the index: one is matched for every scan, the other stays "missing" forever. I did not check whether this happens in D301: **uncertain**.
**Change:** At `buildSnapshot`, detect serials that occur for two materials and list them in the preview; when scanned, ask which material.
**Risk:** Low. **Severity:** Minor.

### M17. Area claim is read-then-write; two PCs can both "win" an area

**Where:** `countService.cjs:929-939` (`getClaims` then `setClaim`, no compare).
**Change:** Use a `mutateAsync` on the claims file like material locks.
**Risk:** Low. **Severity:** Minor.

### M18. A quantity line's storage location is never chosen by the user

**Where:** `LinesPanel.tsx:344` (AddLine takes the first row's sloc), `countService.cjs:807-810` (`validateLine` takes `known[0]`), count lists use the sloc with the most stock (`countState.cjs:211-219`).
**What happens today:** In a terminal count over D000 and D006, a quantity line for a non-serial material is booked to whichever sloc comes first, regardless of where it was counted; the per-sloc difference is then + in one and - in the other. Accessories are limited to D000, so this only affects non-serial materials in multi-sloc counts (how many there are: **uncertain**).
**Change:** Show a sloc choice in AddLine/MaterialRow when the material has stock in more than one in-scope sloc.
**Risk:** Low. **Severity:** Minor.

---

## Suggested additions for warehouse users (grounded in today's code)

### S1. "Tjek i SAP" on each SAP document
`pidoc-create.vbs` already finds documents in MI22 by CountPoint's reference (INVNU), and `pidoc-post.vbs`/`pidoc-delete.vbs` already read a document's status in MI22 (read-only). Add one read-only action per document (and one for `creating`/`unknown` entries) that runs MI22 by reference or number and sets `created`/`counted`/`posted`/`deleted` plus `materialDoc`. This fixes the stuck states in I6, I7 and I8 without anyone opening SAP, and needs no SAP write.

### S2. Show where a "missing" serial was found in the status
Build on `index.others` / `statusCounts` (I5): in "Mangler" lists, MaterialFocus and ApprovalPanel, show "Fundet i 'D000 terminaler' på Palle 14.2 af Anna" for serials other counts of the same status recorded as extra. Approvers then move instead of write off.

### S3. Mark counted materials whose SAP quantity changed in "Hent SAP igen"
`diffSnapshots` (`countService.cjs:1469`) already lists changed material/sloc pairs, and the aggregate knows which have lines or scans. In `RefetchDialog`, tag rows "Allerede talt, tæl igen" when the material has count lines or found serials and its SAP quantity went up (a goods receipt after counting otherwise becomes a false minus difference), and offer "Send tilbage til optælling" for those materials after applying.

### S4. Participant sync status in "Deltagere"
The journal already knows `pending`, `lastFlushAt` and `online` per PC (`journal.status()`), but only the own PC sees it. Write `uploadedAt` and `pending` into each uploaded chunk and show per participant "Sidst sendt 10:42" / "Offline med ventende scanninger" in MembersPanel and in the "Afslut" confirmation (I11).

