# Audit: Stempelkort and Softwareload (1.6.8)

Date: 23.11.2026. Read-only audit. No files were changed apart from this report. No SAP, VBS or M: access.

Scope read in full:
- `electron/warehouse/timeclockService.cjs`
- `electron/warehouse/softwareload/**` (service, SAP layer, `core/planMoves`, `core/bisect`, `core/targets`)
- `electron/warehouse/sap/sl-lookup.vbs`, `sl-transfer.vbs`, `sl-block.vbs` (block skimmed for its outputs and guards)
- `src/views/warehouse/timeclock/*.tsx`, `src/views/warehouse/softwareload/*.tsx`
- `src/lib/timeclock.ts`, `src/lib/softwareload.ts`, `src/lib/softwareloadScanQueue.ts`, `src/components/ShiftRoleDialog.tsx`
- The wiring in `electron/warehouse/register.cjs` (lines 201-217, 251, 373-424) and `electron/preload.cjs` (lines 160-198)
- `electron/warehouse/sapBridge.cjs` and `core/period.cjs` where the code above depends on them

Known items in `.superpowers/sdd/softwareload-plan/progress.md` marked "minor (deferred)" are not repeated unless noted.

## Summary

| Severity | Count |
|---|---|
| Critical | 0 |
| Important | 6 |
| Minor | 14 |

Plus 5 suggestions for additions at the end.

No path was found where a terminal is moved twice or where a KIF task moves a terminal to its destination without D005.
These guards hold up:
- the `from` check in `sl-transfer.vbs`
- the `uncertain` mark and `settledStep`
- the claim with `runId`
- the `finishing` marker
- the handover under the locks of the pending file and the month file
- runChunks leaving wave-1 failures out of wave 2

I checked the edge cases (resume after lost answers, failed -0 on D000, target D005, takeover after a stale claim). One edge case, the KIF task with target D005, gives a wrong record but no wrong move (M1).

---

## Important

### I1. A forgotten Softwareload task counts the whole night or weekend, and nobody can correct it

- **Where:**
  - `electron/warehouse/softwareload/softwareloadService.cjs:850-853` (`finish` ends the time at `now()` with no limit)
  - compare `electron/warehouse/timeclockService.cjs:85-99` (Stempelkort's `LONG_RUN_MS` rule)
  - `src/views/warehouse/softwareload/SoftwareloadStats.tsx` (only "Slet", no "Ret")
- **What happens today:** Stempelkort refuses a stop after 10 hours (`TIMECLOCK_LONG_RUN`) and asks "Hvornår stoppede du?". Softwareload has no such rule.
  - Example: a worker starts a task Friday at 13:00, scans 40 terminals and goes home without pressing "Afslut opgave".
  - On Monday at 07:00 they finish it. `endedAt` is Monday 07:00 and `workedMs` is about 66 hours.
  - The pace for that person and type falls to under 1 terminal per hour. The material rows share the 66 hours out, so the "Pr. materiale" pace is wrong as well.
  - A manager can only delete the whole task (`deleteTask`), which also removes the terminals from the statistics and the search.
- **Why it matters to users:** One forgotten task ruins the period's pace for a person, a type and the materials in that task. The manager has two bad choices: keep a wrong number or delete real history.
- **Exactly what should change:**
  1. In `finish`, accept an optional `endAt`, as Stempelkort does. Refuse with `SOFTWARELOAD_LONG_RUN` when `now - startedAt > LONG_RUN_MS` (reuse the constant from `timeclockService.cjs`) and no `endAt` is given.
     - Validate `endAt` with the same rule as Stempelkort: `>= last start or pause` and `<= now`.
     - Use it as `endedAt`, and mark `endCorrected: true`.
  2. In `SoftwareloadFinish.tsx`, show the same "Hvornår stoppede du?" dialog (the `LongRunDialog` from `Timeclock.tsx` can be shared). Send the chosen `endAt` together with `taskId` and `choice`.
  3. Show a warning on the running task screen after 10 hours, as `Timeclock.tsx:166` does.
- **Risk of the change:** Low.
  - `finish` already computes `endedAt` once and freezes it in the `finishing` marker, so the corrected value carries through a resumed finish.
  - The confirm step gains one more field. The `SOFTWARELOAD_CHANGED` check is not affected.
- **Severity:** Important

### I2. The time cannot be stopped when SAP is not available

- **Where:**
  - `src/views/warehouse/softwareload/SoftwareloadFinish.tsx:54-63` and `:159-164`
  - `electron/warehouse/softwareload/softwareloadService.cjs:527-533` (`preview` calls `sap.lookup`)
  - `:827-829` (`finish` calls `requireWrite`)
- **What happens today:** "Afslut opgave" opens the finish screen. That screen first looks up every serial in SAP. "Afslut og flyt i SAP" only shows up once that lookup has answered.
  - If SAP is not open, not logged in, not in English (sl-transfer refuses), or the cockpit is busy, the preview fails. The user only gets "Prøv igen".
  - The only ways out are "Pause" or "Annullér". Annullér throws away the time and all the scans.
  - Example: at 15:55 SAP has logged the worker out. They want to go home, but the clock keeps running until they log back into SAP. If they do not, the task becomes the I1 case the next morning.
  - The design says "Tiden stopper ved bekræftelsen", and the code already has a state for "time stopped, moves still missing": `venter-<id>` / "Venter på SAP".
- **Why it matters to users:** It produces wrong time, and it makes users choose between losing their scans and leaving the clock running. It also breaks the anti-goal "Scanneren venter på SAP": here the worker's time waits on SAP.
- **Exactly what should change:** Add a second way to finish: "Stop tiden nu, flyt i SAP senere".
  - The service hands the running task over to `venter-<id>` exactly as `finish` does, but without calling `execute`. Factor the mutate plus the `withLockedKeysAsync` handover out of `finish` into `handOver(user, confirmedId, confirmedChoice)`.
  - The confirmation can show the four choices and the number of terminals, without SAP's plan.
  - "Fortsæt i SAP" then does the lookup and the moves, as it does today after an interrupted finish.
  - Show the button on the finish screen when the preview failed, and also on the running task screen.
- **Risk of the change:** Medium.
  - The user moves terminals without having seen SAP's plan. The design's "Medarbejderen bekræfter" then happens at "Fortsæt i SAP" instead.
  - That could be done with a preview step in the Pending tab: call `planMoves` on a lookup and show it before `continueFinish`.
  - Without that preview step, the risk is the same as today's resume after an interruption, which also moves without a new confirmation.
- **Severity:** Important

### I3. Stempelkort pauses the Softwareload task silently, and scans keep landing while it is paused

- **Where:**
  - `electron/warehouse/register.cjs:375-385` (`timeclock:start` and `timeclock:resume` call `softwareload.pauseIfRunning` and throw its result away)
  - `electron/warehouse/softwareload/softwareloadService.cjs:477-489` (`pauseIfRunning` swallows every error)
  - `src/views/warehouse/timeclock/Timeclock.tsx:112-121` (no message about Softwareload)
  - `src/views/warehouse/softwareload/SoftwareloadTask.tsx:454` (scans are accepted while paused, with a small grey note)
- **What happens today:**
  1. A worker has a Softwareload task running and starts Stempelkort on "Pakning" for 10 minutes. The Softwareload task is paused, but the Stempelkort screen does not say so.
  2. They stop Stempelkort and go back to the Softwareload tab. The tab shows "Pause" (after its 30 s poll or on focus), but scanning still works (ruling "a pause stops the clock, not the scanner").
  3. They scan 60 terminals over the next hour without noticing the pause.
  4. The task is saved with that hour as pause. The statistics count 60 more terminals with no time for them, so the pace is inflated.
  - If `pauseIfRunning` fails (M: slow or the lock times out), it returns null without a word. Both clocks then run, and the same time is counted twice.
- **Why it matters to users:** Wrong pace numbers for exactly the comparisons the statistics exist for. In the error case, double-counted time. The person has no way to see either.
- **Exactly what should change:**
  1. Return the result from the handler: `{ ...started, pausedSoftwareload: view | null, softwareloadPauseFailed?: true }`. Have `pauseIfRunning` report a failure instead of swallowing it, e.g. return `{ failed: true }`.
  2. In `Timeclock.tsx`, show a toast: "Din softwareload-opgave er sat på pause" or, on failure, "Softwareload-opgaven kunne ikke sættes på pause. Sæt den på pause selv".
  3. In `SoftwareloadTask.tsx`, when a scan arrives while `running.paused`, show a clear amber banner with a "Fortsæt tiden" button. That button calls `resume`, which also stops Stempelkort. Alternatively, ask once per pause: "Opgaven holder pause. Fortsæt tiden?".
  - Keep the ruling that scans are not refused.
- **Risk of the change:** Low. These are UI and return-value changes. `resume` already stops Stempelkort correctly.
- **Severity:** Important

### I4. Stempelkort and Softwareload only see each other within the active hub, so time can be counted twice (uncertain how often)

- **Where:**
  - `electron/warehouse/register.cjs:201` and `:206` (both stores are `dataDirOf(user.team)`)
  - `electron/warehouse/hubUser.cjs:13` (`team = actor.activeTeam.teamId`)
  - `softwareloadService.cjs:353-361` (`stopTimeclock` uses the same `user`)
  - `:477-489` (`pauseIfRunning`)
- **What happens today:** The running files `aktiv-<hash>` live in `<team>\lagerstyring\stempelkort` and `<team>\lagerstyring\softwareload`, where the team is the hub that is open now.
  - Example: a person with access to both TCD and TRR starts Stempelkort while TCD is open, switches the Hub to TRR and starts a Softwareload task.
  - `timeclock.stop` looks in TRR's Stempelkort store, finds nothing and returns `TIMECLOCK_NOT_RUNNING`, which is ignored. Both clocks run.
  - The reverse order (Softwareload in TRR, then Stempelkort in TCD) has the same problem.
  - I could not verify how many users have both hubs. The Hub clearly supports switching (`activeTeam`).
- **Why it matters to users:** Double-counted time with no warning, and two separate running clocks that each show "I gang".
- **Exactly what should change:**
  - Option (a): in `stopTimeclock` and `pauseIfRunning`, check the other allowed team too. Loop over `TEAM_IDS` with `{ ...user, team }`, but only for teams the person belongs to, which `serviceUser` would need to supply.
  - Option (b), simpler: refuse to start or resume the one when the other runs in another team, with a message naming the hub ("Stempelkort kører i TCD. Stop det der først").
- **Risk of the change:** Medium.
  - Reading the other team's store means opening a second folder on M: on every start, resume and Stempelkort start.
  - It must not create folders for a team the person does not belong to (cf. `peekRules`, which only reads).
- **Severity:** Important (uncertain frequency)

### I5. The task list in Statistik shows a different "moved" number than the summary above it

- **Where:**
  - `src/views/warehouse/softwareload/SoftwareloadStats.tsx:34` (`movedOf` counts only `to-target`)
  - `:530` (shown as `moved/count`)
  - compare `src/lib/softwareload.ts:138-142` (`summarizeTasks.moved` = every terminal not marked failed)
- **What happens today:** Example: a task outside KIF with 10 terminals, 3 of which already stood on the target.
  - "Pr. person og type" shows "Loadet 10".
  - The same task in "Opgaver" shows "7/10".
  - The 3 have outcome `skipped`. They are loaded and in the right place, but they are not counted in the task list.
  - The same happens for failed terminals moved correctly (`to-blocked`, `to-d002`) and for `not-found`. A task with 2 failed -R terminals shows "8/10 (2 fejlet)", which reads as if 2 more than the failed ones are missing.
- **Why it matters to users:** Managers see two numbers for the same thing on one screen. They will think terminals are missing or that SAP failed when nothing went wrong.
- **Exactly what should change:** Decide what the column means and label it.
  - Recommended: show "Loadet" exactly as `summarizeTasks` counts it (`terminals not failed`), plus a red count of the problem outcomes (`isProblem` from `common.tsx`: `failed-sap`, `abandoned`, `interrupted`, `manual`, `not-found`, `blocked-stock`).
  - Example: "10 (1 SAP afviste)". Remove the local `movedOf` from the Stats view.
- **Risk of the change:** Very low. Display only.
- **Severity:** Important

### I6. "Flyt til D005" moves in SAP on a single click, without confirmation

- **Where:**
  - `src/views/warehouse/softwareload/SoftwareloadKif.tsx:126` (button calls `move` directly)
  - compare `SoftwareloadFinish.tsx:167-186` (AlertDialog "Afslut og flyt i SAP?")
- **What happens today:** The KIF preview has a large primary button "Flyt til D005" that starts the SAP Transfer at once. Finishing a task always asks for confirmation; moving into KIF never does.
  - The ledger records that this happened in PS4 on 23.11: "Jacob pressed 'Flyt til D005' by mistake on NXC600007637/38/39 ... doc 4900245235; he moved them back himself through a task".
  - There is also no way back in the app. Moving back takes a task with the old location as target, which in turn creates false task and time history.
- **Why it matters to users:** A wrong move in the production system that has already happened, and a cleanup that pollutes the statistics.
- **Exactly what should change:**
  - Wrap `move` in the same AlertDialog pattern as finishing: "Flyt N terminaler til D005 i SAP?", with the "Trin i SAP" lines (from → D005 and the count). Press "Flyt" to confirm.
  - Optionally use a secondary style for the preview button so it is not the obvious Enter target.
- **Risk of the change:** None for data. One extra click.
- **Severity:** Important

---

## Minor

### M1. A KIF task with target D005 records terminals already on D005 as "Flyttet til målet" without a move

- **Where:**
  - `electron/warehouse/softwareload/core/planMoves.cjs:51-56`
  - `softwareloadService.cjs:104-112` (`reached`)
  - `:115-121` (`movedOf`)
- **What happens today:** Verified by running `planMoves`. With `kif: true, target: 'D005'` and a terminal standing on D005, the result is no transfer and outcome `to-target`. Outside KIF, the same terminal is `skipped` ("Står allerede på målet").
  - The result table and the search show "Flyttet til målet", with documents "–" and "D005 → –".
  - If the task ever goes pending and a manager uses "Opgiv", `reached()` checks `lastTo(steps) === task.target`. That is null, so the terminal is written as `abandoned` although it stands on the target.
- **Why it matters to users:** The history claims a move that never happened, and an abandon claims a failure that never happened.
- **Exactly what should change:** In `planMoves`, in the KIF branch, set `outcome = 'skipped'` when `!failed && destination === KIF && row.sloc === KIF`. That covers `reached()`, the labels and the search. Add one test.
- **Risk of the change:** Low. `skipped` is already in `NOTHING_TO_MOVE` and handled everywhere.
- **Severity:** Minor

### M2. "Opgiv" writes terminals with an unresolved "uncertain" mark as not moved, and the search loses the warning

- **Where:**
  - `softwareloadService.cjs:898-924` (`abandon` neither asks SAP nor resolves `uncertain`)
  - `:115-121` (`movedOf` does not carry `uncertain`)
  - `:194-201` (`indexLines`)
- **What happens today:** Example:
  1. A finish times out (`SAP_TIMEOUT`) while transferring D005 → D006. SAP did post, but the answer was lost, so the serial keeps `uncertain: {from:'D005', to:'D006'}`.
  2. Later runs stop on a systemic refusal for other serials, and a manager abandons the task.
  3. The serial is written as `abandoned`, with last step `D005`.
  - The result card shows "SAP svarede ikke. Tjek i SAP", because `result.uncertain` is kept.
  - The search line says "D00x → D005, Opgivet" with no warning, although the terminal stands on D006.
  - (The ledger's known item is only "abandon does not merge the journal first". This one is about the mark.)
- **Why it matters to users:** The "hvem loadede X, og hvor er den" answer is wrong for exactly the terminals where SAP's answer was lost.
- **Exactly what should change:**
  - Option (a): in `abandon`, when `sap` is ready, run one lookup for the serials with a mark, and apply `stepsWithMark` as `moveInSap` does before writing `abandoned`.
  - Option (b), at least: carry `uncertain: true` into `movedOf` and show "(SAP svarede ikke, tjek i SAP)" on the search line.
- **Risk of the change:** Option (a) adds a SAP call to a manager action that is often used precisely because SAP fails. It should be best effort: fall back to (b) when the lookup throws. Option (b) carries no risk.
- **Severity:** Minor

### M3. Cancel and some other commands do not name the task, and cancel deletes the running file without a lock

- **Where:**
  - `softwareloadService.cjs:494-499` (`cancel` reads, then `deleteAsync` without lock or id)
  - `:441-450` (`markFailed` and `unmarkFailed` send no `taskId`, see `register.cjs:399-400`)
  - `timeclockService.cjs:85-99` and `:138-142` (Stempelkort `finish` and `cancel` delete `aktiv-…` without checking that it is still the same clock)
- **What happens today:** Scan and unscan carry `taskId` precisely so that a stale screen cannot touch the next task. Cancel does not.
  - Example: PC A still shows task T1. On PC B the same person finishes T1 and starts T2. Back on PC A they press "Annullér" → "Annullér opgaven". The dialog states T1's scan count, but `cancel` deletes T2 with its time and scans.
  - The focus reload on PC A makes this unlikely, but it is not prevented.
  - Stempelkort has the same pattern: two stops on two PCs at once can make the slower one delete a clock that was started in between.
- **Why it matters to users:** It can lose a task's time and scans. It is rare.
- **Exactly what should change:**
  - Send `taskId` with cancel, markFailed and unmarkFailed (and pause/resume, for symmetry).
  - In the service, do the delete under the lock with `withLockedKeysAsync([key], tx => { if (tx.get(key)?.id === taskId) tx.delete(key) else throw notRunning() })`. That is the same pattern as `retireRunning`.
  - In Stempelkort, compare `startedAt` before deleting.
- **Risk of the change:** Low. A renderer that sends no id would be refused, so the renderer and the main process must ship together, which they do.
- **Severity:** Minor

### M4. The progress of a KIF move and of a finish or continue mix on screen

- **Where:**
  - `src/views/warehouse/softwareload/common.tsx:38-49` (filters only on email)
  - `electron/warehouse/register.cjs:393`
- **What happens today:** The Task, Pending and KIF tabs stay mounted, and each listens to every `softwareload-progress` event for the user's email.
  - Example: a finish runs while the person starts a KIF move on the KIF tab. `bridge.exclusive` queues the SAP jobs, but both runs report progress.
  - Both progress bars jump between "Flytter terminalerne 40 af 200" and "Slår serienumrene op 0 af 3".
- **Why it matters to users:** A confusing progress display during a long SAP run, where users are told not to close SAP.
- **Exactly what should change:** Give each run an id: `onProgress` emits `{ email, run: runId, ... }`. Have the renderer pass a `runKey` (or receive the id in the first event) and filter on it. Alternatively, refuse to start a KIF move while a finish or continue runs in the same process.
- **Risk of the change:** Low.
- **Severity:** Minor

### M5. Stempelkort "Det passer, stop nu" saves the entry as "sluttid valgt", and the dialog proposes an end time the service refuses

- **Where:**
  - `src/views/warehouse/timeclock/Timeclock.tsx:236` (`onStop(Date.now())`)
  - `:222` (default = start + 8 h)
  - `:233` (`min` = start)
  - `electron/warehouse/timeclockService.cjs:91` and `:96`
- **What happens today:**
  - "Det passer, stop nu" sends `endAt = Date.now()` from the renderer. The main process's `now()` is a few ms later, so `end !== at` and the entry gets `endCorrected: true`. TimeclockOverview then shows "sluttid valgt" for an entry that ended right now.
  - The dialog's `min` is the start time, but the service requires `endAt >= the last start or pause`. If the person paused 9 hours in, the proposed default (start + 8 h) is refused with "Sluttiden skal ligge mellem seneste start eller pause og nu".
- **Why it matters to users:** A wrong badge in the managers' list, and an error the dialog itself caused.
- **Exactly what should change:**
  - Add `confirmLongRun: true` to `timeclock:stop`, so the service ends at `now()` without the LONG_RUN refusal and without `endCorrected`.
  - Send `lastEvent` in the status (or compute it from the running view) and use it as the input's `min`, with the default set to `max(lastEvent, start + 8h)`.
- **Risk of the change:** Low.
- **Severity:** Minor

### M6. A failed mark set after the preview changes the SAP move without the user seeing it

- **Where:**
  - `softwareloadService.cjs:827-860` (`finish` checks `taskId` and `choice` only)
  - `src/views/warehouse/softwareload/SoftwareloadFinish.tsx:84`
- **What happens today:** The finish compares the four choices with the preview, but not the terminals or their failed marks.
  - The ledger accepts the scan race ("the scan race on two PCs at the moment of finishing is accepted").
  - A failed mark is worse than an extra scan. It changes the destination: the terminal goes to D000 with MIGO 344, or to D002, instead of the target.
  - Example: on PC B, "Fejlet" is set on a terminal while PC A shows the preview "Til målet D006 (20)". PC A confirms. The terminal is moved to D000 and put in blocked stock, which the person did not confirm.
- **Why it matters to users:** A move to blocked stock that nobody saw. 343 can undo it, but it is noise in SAP.
- **Exactly what should change:**
  - Return a fingerprint of the terminals and their failed flags with the preview, e.g. a hash of the sorted `serial:failed` list.
  - Compare it in the `finish` mutate next to `sameChoice`, and refuse with `SOFTWARELOAD_CHANGED`. The UI already reloads the preview on that code.
  - This also closes the accepted scan race at no extra cost.
- **Risk of the change:** Low. A refusal only shows the new preview.
- **Severity:** Minor

### M7. A task that waits for SAP is missing from the statistics and the search until it is completed

- **Where:**
  - `softwareloadService.cjs:1103-1113` (`tasks` reads only `opgaver-*` with `state === 'faerdig'`)
  - `:672-680` (search lines are written only in `complete`)
- **What happens today:** Time and moves of a pending task live only in `venter-<id>`.
  - Example: a finish stops halfway through 150 terminals and the task waits for SAP over the weekend.
  - Its hours are not in the statistics.
  - A search for a serial that SAP did move (with a saved document) shows "Ingen hændelser".
- **Why it matters to users:** Both "who loaded X" and the period's numbers look incomplete without any hint why.
- **Exactly what should change:**
  - In `search`, also read the team's `venter-*` files, which managers already list. Return their lines with `pending: true`, and label them "Venter på SAP" in the UI.
  - In `tasks`, return pending tasks marked `pending: true`, and show them in the task list with a badge. Leave them out of the pace, or include them, as Jacob decides.
- **Risk of the change:** Low to medium. Search reads more files, but only from the own team and with a small number of pending tasks.
- **Severity:** Minor

### M8. Confusing or incomplete Softwareload texts

- **Where:**
  - `src/views/warehouse/softwareload/SoftwareloadTask.tsx:528` (Fejlet dialog)
  - `common.tsx:145` (`WriteDisabledLine`)
  - `SoftwareloadStats.tsx:540` (abandoned by)
  - `SoftwareloadSearch.tsx:131` (from → to)
- **What happens today:**
  - The Fejlet dialog says new (-0) go to D000 and blocked stock, and used (-R) to D002. It does not say that other materials are not moved at all (`manual`).
  - "Softwareload må endnu ikke flytte i dette SAP-system": "endnu" suggests it will come. The check is on the Hub's configured system (`config.sapSystem`), while the service text says "det SAP-system, du er logget ind i". The two texts disagree.
  - "Flytningerne blev opgivet af jacob@…" shows the email, while everywhere else names are shown.
  - The search shows "D001 · … → –" for a terminal that was `skipped` (already on the target). It reads as if it went nowhere.
- **Why it matters to users:** Small misunderstandings in the moments where people are deciding what to do with a terminal.
- **Exactly what should change:**
  - Fejlet dialog: add "Andre materialer flyttes ikke og skal håndteres manuelt."
  - WriteDisabled: "Softwareload må ikke flytte i SAP-systemet {system}". Pass the system in the status.
  - Save `abandoned.name` (as for claims) and show it.
  - Search: when `to` is null and the outcome is `skipped`, show "stod allerede på {from}".
- **Risk of the change:** None.
- **Severity:** Minor

### M9. The "Ny opgave" button in Stempelkort opens a dialog that says "Rolle"

- **Where:** `src/components/ShiftRoleDialog.tsx:66`, `:85`, `:89`, used from `Timeclock.tsx:214`
- **What happens today:** In Stempelkort the button is "Ny opgave" and the success toast says "Opgaven er oprettet". The dialog in between says "Tilføj Ny Rolle" and "Rolle Navn".
  - The empty-name error is a hard-coded Danish toast, "Indtast et rolle navn", not run through `t()`/AutoText. English users get Danish, and "rolle navn" is misspelt (should be "rollenavn").
  - Vagtplan itself also labels its button "Tilføj Opgave".
- **Why it matters to users:** Two names for one thing, and an untranslated error.
- **Exactly what should change:** Use "opgave" in the dialog ("Tilføj ny opgave", "Opgavens navn", "Skriv et navn på opgaven"), with the toast through AutoText or `t()`. This affects Vagtplan too, which already says "Opgave".
- **Risk of the change:** None.
- **Severity:** Minor

### M10. Deleting a Stempelkort registration leaves no trace, unlike Softwareload

- **Where:**
  - `electron/warehouse/timeclockService.cjs:162-199` (`changeEntry` and `deleteEntry` delete the entry outright)
  - `src/views/warehouse/timeclock/TimeclockOverview.tsx:69` and `Timeclock.tsx:129` (`window.confirm`)
- **What happens today:**
  - Softwareload keeps a deleted task under `deleted` with who and when, and logs it in `slettet-<yyyy-mm>`.
  - Stempelkort removes the registration with no log.
  - Stempelkort asks with the browser's `window.confirm`, where Softwareload uses the house `AlertDialog`/`DeleteDialog`.
- **Why it matters to users:** Managers can remove a colleague's hours without a trace, and the two tools in the same module behave differently.
- **Exactly what should change:**
  - In `deleteEntry`, move the entry to `deleted[id] = { ...entry, deletedBy, deletedAt }` in the same month file.
  - Use `DeleteDialog` (move it from `softwareload/common.tsx` to a shared place) in both Stempelkort places.
- **Risk of the change:** Low. `entries()` reads only `entries`, so deleted ones stay out.
- **Severity:** Minor

### M11. Dead code and logic duplicated between the two tools

- **Where:**
  - `electron/warehouse/register.cjs:211`: `indexStore.deleteAsync` is wired but never used by the service.
  - `register.cjs:377,383`: the return value of `pauseIfRunning` is thrown away (see I3).
  - `src/lib/softwareload.ts:16`: `TYPE_ORDER` is only an alias of `SOFTWARELOAD_TYPES`.
  - `timeclockService.cjs:15-24,28-29` and `softwareloadService.cjs:49-54,68-71,252-254` duplicate `lower`, `clean`, `pad`, `dayOf`, `writerOf`, `runningKey`, `pausedMs`, `isManager`, `me` and `codeError`. Only `dayOf`/`pad` are in the ledger.
  - The same pause/resume code shape appears in `changePause` in both services.
  - `src/views/warehouse/timeclock/Timeclock.tsx:26` duplicates `LONG_RUN_MS`.
  - `SoftwareloadKif.tsx:16` duplicates `KIF = 'D005'`.
  - `PERIODS`, `Figure` and the 60 s poll are copied between `TimeclockOverview.tsx:25-31` and `SoftwareloadStats.tsx:25-31`.
- **What happens today:** Nothing breaks now. But the manager rule, "a Hub manager or creator, not an Optælling status manager", lives in two places. The comment at `register.cjs:237` even says a status manager "acts as a manager everywhere", which is not true for these two tools.
- **Why it matters to users:** A future change to who counts as a manager, or to the long-run limit, could make Stempelkort and Softwareload disagree. For example, a status manager could see Softwareload statistics but not Stempelkort registrations.
- **Exactly what should change:**
  - Move `isManager`/`me`/`lower`/`clean`/`writerOf`/`pausedMs`/`dayOf` into a small `core/personalClock.cjs` and import them in both services.
  - Export `LONG_RUN_MS` and the period list for the renderer from one place.
  - Remove `indexStore.deleteAsync` and `TYPE_ORDER`.
  - Correct the `serviceUser` comment.
- **Risk of the change:** Low. Pure refactoring with existing tests.
- **Severity:** Minor

### M12. The design document still says employees see their own Softwareload tasks

- **Where:** `plans/softwareload-design.md:168` ("Synlighed: medarbejderen ser sine egne opgaver. Managers ser alles tider. Det er samme regel som i Stempelkort.")
- **What happens today:** Since Task 16, statistics are for managers only (`softwareloadService.cjs:1104`, `Softwareload.tsx:81,135`). Employees see their own tasks nowhere after the result screen (see suggestion S5).
- **Why it matters to users:** The next person who reads the spec will build or test against the old rule.
- **Exactly what should change:** Update the line to "Statistikken og kommentarerne er kun for managers (Jacob 23.11). Medarbejderen ser sit resultat ved afslutningen og kan søge på serienumre."
- **Risk of the change:** None.
- **Severity:** Minor

### M13. Every batch of scans triggers a full status read that lists and reads all pending tasks on M: (uncertain cost)

- **Where:**
  - `src/views/warehouse/softwareload/SoftwareloadTask.tsx:328` (`void reload()` in `processQueue`'s finally)
  - `softwareloadService.cjs:298-318` (`status` → `mergeJournal` + `pendingTasks`: `keysAsync` and one `getAsync` per `venter-*`)
- **What happens today:** After each drained scan queue (often one scan), the screen calls `softwareload:status`.
  - The status lists the team's folder and reads every pending task, which is the full task with all terminals and results. It also merges the local journal.
  - With many PCs scanning, that is a directory listing on the slow shared drive per scan per PC.
  - I could not verify how much `store.cjs`'s read cache saves for `keysAsync`.
- **Why it matters to users:** Load on M: during scanning. The scanner does not wait, but other tools on the same drive may.
- **Exactly what should change:**
  - After a scan, refresh only the running task: the `scan` answer can return `view(task)`, as `markFailed` does.
  - Leave the full status to the 30 s poll and to focus.
- **Risk of the change:** Low.
- **Severity:** Minor (uncertain)

### M14. A SAP script that times out leaves its own SAP session open (uncertain)

- **Where:**
  - `electron/warehouse/softwareload/softwareloadSap.cjs:17` (`SCRIPT_TIMEOUT_MS = 5 min`)
  - `electron/warehouse/sap/sl-transfer.vbs:49` (`WaitIdle` waits up to 3000 × 100 ms = 5 min per step, and the same in `sl-lookup`/`sl-block`)
  - `electron/warehouse/sapBridge.cjs:38-40` (on timeout cscript is killed, so `CloseOwnSession` never runs)
- **What happens today:** One slow SAP step can use the whole 5 minutes of the script's timeout, and the runner then kills cscript.
  - The session the script created stays open in SAP. It may sit on the Transfer popup or a MIGO document.
  - After a few such timeouts, SAP's limit on sessions per logon (normally 6) makes `base.CreateSession` fail ("session-not-created"). A session left in MIGO can also hold SAP locks.
  - The ledger's QS4 run mentions leftover sessions from a harness. I could not test the production case.
- **Why it matters to users:** After one bad SAP moment, further finishes and KIF moves fail with an unclear message until the user closes SAP windows by hand.
- **Exactly what should change:**
  - Cap each `WaitIdle` well below the script timeout, e.g. 60 s, and let the script finish with `unknown-result: busy` so it closes its own session.
  - Alternatively, raise `SCRIPT_TIMEOUT_MS` above the sum of the waits.
  - Add a line to the `SAP_TIMEOUT` text: "Luk eventuelle ekstra SAP-vinduer, som appen har åbnet".
- **Risk of the change:** Medium. A shorter wait can turn a slow but successful posting into `unknown-result`. That is safe because the `uncertain` mark resolves it, but the user gets an extra "Fortsæt".
- **Severity:** Minor (uncertain)

---

## Suggestions (additions that would clearly help users)

### S1. Managers can correct a Softwareload task's times, as in Stempelkort

- **Grounded in:** Stempelkort has `updateEntry` (start, end, task, logged with `editedBy`). Softwareload has only delete (`deleteTask`).
- **Addition:** On "Ret" in the Statistik task row, managers may change `startedAt`/`endedAt` within the task's day.
  - Pauses are clipped as in `timeclockService.updateEntry`.
  - `workedMs`/`pausedMs` are recomputed, and `editedBy`/`editedAt` are saved with the earlier values in `timeEdits`.
  - The search lines keep `at = endedAt`. Either rewrite them with `addToIndex(…, replaces)`, or keep `at` as is and document it.
- **Why:** Together with I1 this removes the only reason to delete real history.

### S2. Show Softwareload in Stempelkort's manager overview

- **Grounded in:** `TimeclockOverview` shows "I gang lige nu" and time per person and task, but Softwareload time is invisible there. Starting a Softwareload task stops Stempelkort on purpose, so the overview shows a gap exactly while people load.
- **Addition:**
  - In `timeclock:entries`, merge in the team's finished Softwareload tasks of the period as read-only rows: taskName "Softwareload (type)", a fixed colour, no edit and delete.
  - Add running Softwareload tasks to "I gang lige nu".
  - Both are read from the Softwareload store (`opgaver-*`, `aktiv-*`), which the manager may already read through `tasks()`.
- **Why:** The managers' question "hvad har folk brugt dagen på" gets one complete answer.

### S3. After finishing Softwareload, offer to restart the Stempelkort task it stopped

- **Grounded in:** `start` and `resume` return `stoppedTimeclock: { taskName, workedMs }`, and the screen shows "Stempelkort for X er stoppet". After the finish nothing helps the person go back, so the time until they remember is lost.
- **Addition:**
  - Have `timeclock.stop` also return `taskId` and `taskColor`, and keep them on the Softwareload task as `stoppedTimeclock`.
  - On the result screen, and after "Annullér", show a button "Start Stempelkort igen på X". It calls `timeclock.start` with that task, and that call pauses nothing because no Softwareload task runs any more.
- **Why:** It removes a common source of lost time without changing any rule.

### S4. "Venter på SAP": show why the task waits and what is left before Fortsæt or Opgiv

- **Grounded in:** `SoftwareloadPending.tsx` shows only name, end time and count. The service already has, per serial, `steps`, `uncertain`, `message` and the planned outcome. The error that stopped the last run (e.g. `refusedAll`'s "SAP afviste alle terminalerne i gruppen af samme grund: …") is thrown and then lost.
- **Addition:**
  - On a failed run, save `lastError: { message, code, at, by }` on the pending task in `execute`'s catch (best effort, before `releaseClaim`).
  - In the Pending card, show that message and the counts per state: moved, waiting, uncertain.
  - Add an expandable list per serial, using the existing `ResultTable`.
- **Why:** Managers decide on "Opgiv" without knowing whether SAP refused for a reason that is now fixed, and owners press "Fortsæt" repeatedly into the same refusal.

### S5. "Mine opgaver": the worker's own recent tasks and their results

- **Grounded in:** Since statistics are managers only, the result table of a finished task disappears for good when the worker presses "Færdig". Terminals SAP refused (`failed-sap`) or that need manual handling (`manual`) must then be handled in SAP by hand, but the worker can only find them again by searching one serial at a time.
- **Addition:** Add a read-only list of the person's own tasks from the last 7 days, read from their own `opgaver-<hash>-<month>` file through a new `softwareload:my-tasks` that only returns `task.email === user.email`.
  - Show the `ResultCard` per task and highlight the problem outcomes.
  - Do not show pace or other people's numbers, so Jacob's "statistik kun for managers" holds.
- **Why:** The worker can finish the job (fix the refused terminals) without asking a manager. Needs Jacob's confirmation, since it touches the visibility rule.
