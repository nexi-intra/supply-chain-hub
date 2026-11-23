# Audit: Arbejdsværktøjer – shared parts (1.6.8)

Read-only audit of the parts every tool shares (IPC wiring, roles, SAP bridge/state/show/fetch, status/show scripts, material
catalog, preload, the module shell and SAP indicator, `src/lib/warehouse`, `src/types/warehouse.ts`, Hubert's warehouse guide).
Nothing was edited. Only existing unit tests were run (`node --test electron/warehouse/register.test.cjs
electron/warehouse/sapCheckService.test.cjs`: 21/21 pass, which matters for finding C1). Line numbers refer to the files as they
are on disk on 2026-11-23 (HEAD `75497dd`).

Summary: **1 Critical, 10 Important, 15 Minor**, plus 6 suggested additions at the end.

| # | Severity | Title |
|---|---|---|
| C1 | Critical | "Tjek SAP-fejl" cannot save a check or record a mail: the shared store has no `mutateAsync` |
| I1 | Important | Copy buttons say "kopieret" even when Windows refused the clipboard |
| I2 | Important | Posting PI documents re-reads the clipboard after up to 15 minutes, and PI writes run outside the SAP queue |
| I3 | Important | Write scripts are not pinned to the configured SAP system; the "scripts check it again" safeguard does not exist |
| I4 | Important | Client 100 is never checked for PI-document writes or "Vis i SAP"; connection choice differs from the status check |
| I5 | Important | The CountPoint role cache fails open: a removed status manager/admin keeps rights while the roles file cannot be re-read |
| I6 | Important | Error codes that reach the UI without a Danish and/or English text |
| I7 | Important | Synchronous file calls on M: in the main process (whole app freezes on a slow drive) |
| I8 | Important | The tools page reads every count's files on M: to show one line |
| I9 | Important | Hubert hides "Læg antal på" from admins and status-manager tasks from status managers |
| I10 | Important | SAP indicator tells Softwareload users "you always press F8, Save or Post yourself" – Softwareload posts in PS4 on its own |
| M1 | Minor | `toIpcError`: Node `ERR_*` codes pass through raw; any ENOENT is shown as "M: is down, scans are saved locally" |
| M2 | Minor | Slow-call logging: wrong channel list and misleading "heraf bruger" time |
| M3 | Minor | `me` reports a status manager as "manager": the header can never say "Status manager", and the UI never notices a demotion |
| M4 | Minor | Four different definitions of "manager"; the status-manager promotion relies on every service remembering `!user.statusManager` |
| M5 | Minor | `listTeamUsers` treats `isManager: true` as manager even when `role` says user (auth does not) |
| M6 | Minor | Status managers can change admin roles over IPC although UI/guide say only managers can; new users wait 30 s |
| M7 | Minor | `sapShow`: unparsable script output becomes "uventet fejl"; English hint is wrong for missing MI03/MIGO access |
| M8 | Minor | Material catalog: unlocked read-modify-write of one shared file, whole file re-read on every lookup |
| M9 | Minor | Read-only screens (material card, Hubert questions) start background MM60 runs that hold the SAP queue |
| M10 | Minor | Hubert guide states things the program does not do |
| M11 | Minor | Dead code |
| M12 | Minor | Duplicated helpers that should be shared |
| M13 | Minor | Comments that contradict the code |
| M14 | Minor | SAP/placement env overrides are honoured in packaged builds; client is hard-coded; legacy config file ignored |
| M15 | Minor | `SAFE_ARGUMENT` rejects temp paths with non-ASCII characters (uncertain) |

---

## C1 – "Tjek SAP-fejl" cannot save a check or record a mail: the shared store has no `mutateAsync`

- **Where:** `electron/warehouse/register.cjs:106-111` (the `sharedStore` wrapper); used by `electron/warehouse/sapCheckService.cjs:119-130` (`run`) and `:168-177` (`createMail`).
- **What happens today:** `register.cjs` hands the SAP check service a hand-written wrapper with only `getAsync`, `setAsync`, `updateAsync` and `deleteAsync`. Commit `cc741f1` ("Alle gem-knapper…") changed `sapCheckService` from `updateAsync` to `sharedStore.mutateAsync(...)` but did not add `mutateAsync` to the wrapper (verified with `git diff cc741f1~1 cc741f1`). The service tests pass because they give the service a real store directly, and `register.test.cjs` never calls `sap-check:run` or `sap-check:mail`.
  - Scenario 1: A TCD admin opens Optælling > "Tjek SAP-fejl" and clicks "Tjek SAP nu". MB52 + IQ09 + ZMS_STOCK_SER_CHK2 run for several minutes. Then `Promise.all([...])` is built: `sharedStore.setAsync(checkKey(id), check)` has already started (the check file is written to `_lagerstyring`), and the next element `sharedStore.mutateAsync(...)` throws `TypeError: sharedStore.mutateAsync is not a function`. `toIpcError` turns it into `UNEXPECTED_ERROR` ("Der skete en uventet fejl"). The index is never updated and old checks are never deleted, so the new check never appears in the overview or history, "nye/åbne/rettede" is always computed against the last check from before 1.6.8, and an orphan check file is left on M: every time.
  - Scenario 2: On an older check, "Lav mail til SAP-teamet": the Excel file is written, the Outlook draft opens, then the mail is recorded with `mutateAsync` → same TypeError → the user sees an error although the draft is open, clicks again, and gets a second draft and a second Excel file.
- **Why it matters to users:** A whole tab (and the reminder before a status, the guide's `sap-check` task) is broken in production after a several-minute SAP run; results are lost; duplicate mails can go to the SAP team.
- **Exactly what should change:** Add `mutateAsync: (...args) => openStore(path.join(platformRoot(), SHARED_FOLDER)).mutateAsync(...args)` to the wrapper (and drop the now unused `updateAsync`, see M11). Better: replace the wrapper by `const sharedStore = () => openStore(...)` and call methods on the real store, as `softwareloadIndex()` already almost does, so a missing method can never happen again. Add a test in `register.test.cjs` that runs `sap-check:run` and `sap-check:mail` through IPC with a fixture fetcher and a fake drafter.
- **Risk of the change:** Very low; `mutateAsync` exists on every store (`electron/store.cjs:687`, exported at `:1018`). The first run after the fix will compare against an old index entry once.
- **Severity:** Critical (feature broken in production with lost results and possible duplicate mails).

## I1 – Copy buttons say "kopieret" even when Windows refused the clipboard

- **Where:** `electron/warehouse/register.cjs:278-282` (`clipboard:write`), `:347-351` (`counts:copy-serials`); callers `src/views/warehouse/count/DocPanel.tsx:299-309` (`CopyQtyButton`), `src/views/warehouse/count/OverviewPanel.tsx:129-140` (`CopySerialsButton`), `src/components/warehouse/TableSelection.tsx:68-70`. The helper that should be used: `electron/warehouse/clipboardText.cjs:8-11`.
- **What happens today:** `clipboardText.cjs` documents that Electron 44's `clipboard.writeText` resolves even when Windows refuses the clipboard, and the SAP fetchers therefore read the text back (`putOnClipboard`). The two IPC handlers used by people do not: they `await clipboard.writeText(...)` and return `{ ok: true }`. Scenario: on the "Til optællingsdokument" tab a person clicks "Antal" for R162-0717 D004 (qty 42); the clipboard is locked by another program for a moment; the toast says "42 kopieret"; the clipboard still holds the previous row's "37"; the person pastes 37 into MI04/ZMS_COUNT_SERIAL in PS4. The same applies to "Kopiér"/"Lange" serial lists (the previous material's serials get pasted).
- **Why it matters to users:** A wrong quantity or serial list entered by hand in PS4 is a wrong SAP count that can be posted. The toast actively tells them it is safe.
- **Exactly what should change:** In both handlers use `putOnClipboard(clipboard, text)`; if it returns false throw a new code `CLIPBOARD_REFUSED` with the `CLIPBOARD_REFUSED` Danish text, and add DA/EN texts in `src/lib/warehouse/errors.ts`. Use the same code instead of `SAP_EXPORT_FAILED`/`PIDOC_SAP_FAILED` in `sapFetch.cjs:133,184` and `sapPiDocs.cjs:93,144`, so the English UI no longer says "The SAP lookup failed" for a clipboard problem. See also suggestion S2.
- **Risk of the change:** Low; one extra `readText` per copy (milliseconds). Line endings are already normalised by `sameText`.
- **Severity:** Important (can lead to wrong values typed into PS4).

## I2 – Posting PI documents re-reads the clipboard after up to 15 minutes, and PI writes run outside the SAP queue

- **Where:** `electron/warehouse/sapPiDocs.cjs:139-156` (`postDocuments`), `:43-54` (`exclusiveWrite` does not use `bridge.exclusive`), `:58-89`, `:158-197`; `electron/warehouse/sap/pidoc-post.vbs:84-99` (`UploadClipboard`), `:193` and `:254`; `electron/warehouse/sapBridge.cjs:1-3, 60-65` ("one SAP job at a time").
- **What happens today:** For several documents, `postDocuments` puts the document numbers on the clipboard once, then `pidoc-post.vbs` uploads the clipboard into MI20 (checked: the first number must match, line 199 `Check`), waits up to `WAIT_SECONDS` (15 min) for the manager to press "Post Difference" and Save, and then uploads **the clipboard again** into MI22 to read the status (line 254) – with **no** `Check` afterwards. `UploadClipboard` tries three times and then simply returns. Scenario: a manager posts 3 documents, and while MI20 is open copies a material number in SAP (very likely within 15 minutes). After posting, MI22 is filled from the new clipboard text; the list does not contain the 3 documents; `posted` (line 152) is empty, and the Hub reports all 3 as still open although SAP posted them. Separately, all PI-document write scripts except the MI31 test run run outside `bridge.exclusive`, so a Softwareload transfer, a long-serial lookup or an MM60 lookup on the same PC (all of which also write the clipboard) can run at the same time, contrary to the bridge's "one SAP job at a time" contract.
- **Why it matters to users:** The count document shows posted documents as not posted; the next "Bogfør" fails or confuses; the archive/report can be wrong until someone checks SAP by hand.
- **Exactly what should change:** (1) In `pidoc-post.vbs` fill MI22 from the list file that JavaScript already writes (or from arguments), not from the clipboard; at minimum add `Check "wnd[0]/usr/txtIM_IBLNR-LOW", firstDoc` after line 254 and finish with `status-not-verified` if it fails, so the service reports "unknown" instead of "open". Make `UploadClipboard` end with `Finish False, "multiple-selection-failed"` when the third attempt does not match. (2) In `postDocuments`, never conclude "open" from an MI22 read that does not contain all requested numbers; report them as "unknown – check in SAP". (3) Document in `sapBridge.cjs` that PI writes deliberately bypass the queue (because they wait for F8) or take the queue only for the clipboard upload phase.
- **Risk of the change:** Medium: the VBS changes need a run in QS4 (MI20/MI22 screens). The JavaScript change is low risk.
- **Severity:** Important (wrong state recorded about a PS4 posting; no wrong SAP change by itself).

## I3 – Write scripts are not pinned to the configured SAP system; the "scripts check it again" safeguard does not exist

- **Where:** `electron/warehouse/sapBridge.cjs:10-17, 32-39`; `electron/warehouse/config.cjs:9`; `electron/warehouse/register.cjs:186`; `electron/warehouse/softwareload/softwareloadSap.cjs:52`.
- **What happens today:** The runner accepts a write script when `args[0]` is in `WRITE_SYSTEMS` (or `SCRIPT_WRITE_SYSTEMS`), i.e. PS4 **or** QS4, regardless of which system this installation is configured for (`system` is passed to the runner, line 32, but only used for the read scripts' environment). The comment on line 10 says the write scripts "check it again"; none of the `.vbs` files contains an allow-list (searched for `"PS4"`, `"QS4"`, `not-allowed`). Because `WRITE_SYSTEMS` now equals `SAP_SYSTEMS`, the gates `writeEnabled: WRITE_SYSTEMS.includes(config.sapSystem)` and `SOFTWARELOAD_WRITE_SYSTEMS.includes(system)` are always true, so the `SOFTWARELOAD_WRITE_DISABLED` and `SAP_WRITE_SYSTEM_NOT_ALLOWED` paths can no longer happen. Scenario: a tester runs a QS4 build (`warehouse.sapSystem: "QS4"`); any future code path that passes a stored document's `system` (e.g. a document created in PS4 before the switch) to a write would be accepted and change PS4. There is also no way to switch PS4 writes off quickly without a new release.
- **Why it matters to users:** PS4 is production. The only thing standing between a QS4 test install and PS4 is that every caller passes `config.sapSystem` correctly.
- **Exactly what should change:** In `createCscriptRunner`, reject a write script unless `args[0] === system` (the configured system) **and** it is on the allow-list; return `SAP_WRITE_SYSTEM_NOT_ALLOWED`. Remove the false "scripts check it again" sentence (or add the check to the scripts: compare `WScript.Arguments(0)` with the `COUNTPOINT_SAP_SYSTEM` environment variable that the runner already sets). Replace the always-true allow-lists by a config switch (suggestion S6).
- **Risk of the change:** Low; all current callers already pass `config.sapSystem`. Fixture runs need the same system string.
- **Severity:** Important (defence in depth for PS4 writes).

## I4 – Client 100 is never checked for PI-document writes or "Vis i SAP"; connection choice differs from the status check

- **Where:** `electron/warehouse/sapState.cjs:22-29`; `electron/warehouse/register.cjs:79`; `electron/warehouse/sapPiDocs.cjs` (no status check at all); `src/views/warehouse/count/DocPanel.tsx:102,119,131,146,159` (plain buttons, not `SapActionButton`); `electron/warehouse/sap/pidoc-create.vbs:130-135` (and the same loop in pidoc-print/count/serials/post/delete); `electron/warehouse/sap/sl-transfer.vbs:82-91`, `sl-block.vbs` `SystemConnection`; `electron/warehouse/sap/sap-show.vbs:36-41, 67`.
- **What happens today:** "Expected client 100" exists only in `computeSapState`, which the indicator, the fetchers and Softwareload use. PI-document writes never call it (neither in `sapPiDocs.cjs` nor in the UI, which uses ordinary buttons). The write scripts pick the connection by `Children(0).Info.SystemName` only, never by client, and the PI scripts take the **last** matching connection (no `Exit For`), whereas `export.vbs`/`sl-transfer.vbs` and `computeSapState` take the **first**. After creating their session the scripts check `s.Info.SystemName` again, but never `Info.Client`. Scenario (uncertain – depends on whether PS4 has a second client the users can log on to): a manager has PS4/100 and PS4/<other client> open; the indicator says "SAP klar PS4/100"; "Opret SAP-dokument" drives MI31 on the last PS4 connection, i.e. the other client. A more certain, milder scenario: two PS4 connections where the last one sits on the logon screen → the script fails with a confusing error although the indicator was green.
- **Why it matters to users:** The indicator promises PS4/100; writes may land elsewhere or fail unexpectedly. Also: the selection loops rely on VBScript's behaviour of running the `Then` branch when the condition raises an error under `On Error Resume Next`; only the later per-session system check makes this safe.
- **Exactly what should change:** Pass the expected client as an argument to every write script and to `sap-show.vbs`; select the connection with `Info.SystemName = system And Info.Client = client` and `Exit For` on the first match (same rule as `computeSapState`), and after `CreateSession` finish with `wrong-system` unless both system and client match. In `sapPiDocs.cjs`, run the same `computeSapState(...)` check as `softwareloadSap.cjs:57` before each write; in `DocPanel.tsx` use `SapActionButton` for create/print/count/post/delete.
- **Risk of the change:** Medium: changes six write scripts; verify in QS4 first. No effect for users with one connection.
- **Severity:** Important (uncertain whether a wrong-client write is possible in practice; the missing readiness check is certain).

## I5 – The CountPoint role cache fails open: a removed status manager/admin keeps rights while the roles file cannot be re-read

- **Where:** `electron/warehouse/register.cjs:160-185` (`readRole`, `cachedRoleOf`, `dropRoles`), `:240-247` (`serviceUser`); `electron/warehouse/roles.cjs:42-44`; `electron/warehouse/piDocService.cjs:23`.
- **What happens today:** Every call uses a 30-s cached role; after 30 s the **old** value is still returned and a refresh runs in the background. If the refresh fails (e.g. `roller` file busy/locked/unreadable, `STORAGE_UNAVAILABLE` from `roles.read`), the old value is kept, with its old timestamp, forever – every call returns it and starts another background read. Only the PC that made the change drops the cache (`dropRoles`). The flag `statusManager` from this cache also decides PI-document rights, because `roles.roleOf` returns `'status-manager'` straight from `user.statusManager` without reading the file. Scenario: Hub manager on PC A removes Bob as status manager. On PC B, Bob keeps manager rights in Optælling for at least 30 s plus one more call; if B cannot re-read the roles file (EBUSY/EIO bursts on M:), indefinitely, while scans keep working through the local journal. The first-time read, by contrast, fails closed (`'user'`).
- **Why it matters to users:** Authorization should fail closed. A removed status manager can still approve materials, decide members, or start PI steps from a PC that has not refreshed.
- **Exactly what should change:** Give each cache entry a hard maximum age (e.g. 2 × TTL); past it, await the fresh read and fall back to `'user'` on failure. On refresh failure keep the value only until that hard limit. Optionally write a small "roles changed at" stamp next to `roller` and compare it (cheap `statAsync`) so other PCs drop their cache at once.
- **Risk of the change:** Low; when M: is down, elevated actions already need M:. A status manager may briefly be treated as a user during a long outage.
- **Severity:** Important (authorization).

## I6 – Error codes that reach the UI without a Danish and/or English text

- **Where:** `src/lib/warehouse/errors.ts:25-162` (Danish), `:182-337` (English), `:173-181` (`errorMessage`); throw sites listed below.
- **What happens today:** `errorMessage` shows, in Danish, the backend detail or `MESSAGES[code]`, and in English only `MESSAGES_EN[code]` (except three codes). Codes without text fall back to "Der skete en uventet fejl"/"Something unexpected went wrong". Found by scanning `electron/warehouse`, `electron/authService.cjs`, `electron/securedIpc.cjs`:
  - **No text in either language and no detail (Danish users also see "uventet fejl"):** `REPORT_OPEN_FAILED` (`register.cjs:336`; it has only an English text), `MEMBER_NOT_FOUND` (`countService.cjs:923`), `CLAIM_INVALID` (`:932`), `APPROVAL_INVALID` (`:1177`), `JOURNAL_CLOSED` (`journal.cjs:136`), `SAP_SCRIPT_NOT_ALLOWED` (`sapBridge.cjs:37`), `AUTH_FORBIDDEN`/`AUTH_UNTRUSTED_WINDOW` (`securedIpc.cjs:12,19`), `AUTH_PENDING`/`AUTH_REJECTED`/`AUTH_CREDENTIALS` (`authService.cjs:73-90`, reached through `currentActor`).
  - **Danish detail exists but English shows "Something unexpected went wrong":** `CLAIM_TAKEN` ("X tæller allerede område Y", `countService.cjs:935`), `IMPORT_INVALID` (`:865,867`), `IMPORT_FILE_TYPE`/`IMPORT_FILE_TOO_LARGE` (`importFile.cjs:38,40`), `PLACEMENT_INVALID` (`countRepository.cjs:152`), `COUNT_INVALID` (`countRepository.cjs:41`), `PLACEMENTS_FORMAT` (`core/placements.cjs:80`), `SAP_FORMAT` (`core/sapParsers.cjs:4`), `APPROVAL_INVALID` (`:1180-1181,1299`).
  - **English only (Danish relies on a detail that is present today):** `SAP_SHOW_INVALID`, `SAP_SHOW_FAILED`, `IMPORT_EMPTY`, `IMPORT_TOO_LARGE`, `LINE_INVALID`, `MATDOC_INVALID`, `SCOPE_INVALID`, `PIDOC_EMPTY`, `PIDOC_INVALID`, `PIDOC_NOT_APPROVED`.
  - Scenario: an English-speaking TRR colleague tries to claim area "Reol 4" that Anna is counting; the screen says "Something unexpected went wrong. Try again." instead of "Anna is already counting area Reol 4".
- **Why it matters to users:** Normal, expected situations look like crashes; people retry or call for help.
- **Exactly what should change:** Add DA and EN texts for every code above (`AUTH_*` can reuse the Hub's login texts). Add `CLAIM_TAKEN` to `EN_WITH_DETAIL`-like handling only if an English detail is produced; otherwise write an English text with the name passed as a structured field. Add a unit test that scans `electron/warehouse/**/*.cjs` for `codeError('X'`, `fetchError('X'`, `writeError('X'`, `{ code: 'X' }` and asserts both tables contain X (suggestion S4), so this cannot drift again.
- **Risk of the change:** None (texts only).
- **Severity:** Important.

## I7 – Synchronous file calls on M: in the main process (whole app freezes on a slow drive)

- **Where:** `electron/warehouse/register.cjs:93-104` (`openStore` → `createStore` → `fs.mkdirSync`, `electron/store.cjs:191`), `:229-234` (`reportFile` → `fs.existsSync`), `:133` and `:194` (`findNewestPlacementSheet` → `fs.readdirSync` + one `fs.statSync` per file, `electron/warehouse/core/placements.cjs:19-25`).
- **What happens today:** The first call per folder creates the store with a synchronous `mkdirSync` on M:. If it fails, nothing is cached, so **every** later IPC call that needs that store repeats the synchronous `mkdirSync` on the main thread. For a plain user this includes every call (also the 5-s SAP indicator poll) because `serviceUser` → `cachedRoleOf` → `roles.read` → `storeFor(team)` while no role is cached. Scenario: M: hangs (SMB not answering, not cleanly disconnected) right after start; the Hub window freezes for the SMB timeout on every poll in Optælling/Placeringer/Softwareload, in all open windows, not only in the warehouse tool. `reportFile` (open/show report) and the placement-sheet scan (each count preview, Placeringer import) do the same in smaller doses.
- **Why it matters to users:** The comment in `securedIpc.cjs` already notes that synchronous M: reads "froze the whole app"; these are the remaining ones in the shared warehouse path.
- **Exactly what should change:** Create the store with `await fs.promises.mkdir(dir, { recursive: true })` before calling `createStore` (or give `createStore` an async factory) and cache a failed attempt for a few seconds (negative cache) so a down drive is not retried on every poll. Use `fs.promises.access` in `reportFile` and `fs.promises.readdir/stat` in `findNewestPlacementSheet` (make it async; both callers already `await`).
- **Risk of the change:** Low; `openStore` becomes async, so `storeFor`, `sharedStore` and the `peekRules` path must await it (all callers are already async).
- **Severity:** Important (slow path on M:).

## I8 – The tools page reads every count's files on M: to show one line

- **Where:** `src/views/warehouse/WarehouseHome.tsx:86-92`; `electron/warehouse/countService.cjs:76-91, 100-111`.
- **What happens today:** Opening "Arbejdsværktøjer" calls `statuses.overview()` only to print "Igangværende: <status> · NN %" on the Optælling tile. `statusOverview` calls `listCounts`, which reads `summary` and `members` for **every** count the team ever made (closed ones are cached in memory only after the first read in this process). Scenario: after starting the Hub, a TCD employee opens Arbejdsværktøjer to clock in. With 4 statuses × ~15 counts, ~120 encrypted files are read through the shared read slots before Stempelkort's own reads get their turn, on every PC that opens the page after a restart; the list grows every quarter.
- **Why it matters to users:** The page everybody opens every morning (Stempelkort) pays for a decorative line, and competes with the user's first real action for M:.
- **Exactly what should change:** Add `statuses:active-progress` that reads `repo.getActiveStatus(team)` and only the summaries of that status's counts (`statusCounts(team, id)`), or store the progress on the status record when a summary is written. Call it from `WarehouseHome`.
- **Risk of the change:** Low (new read-only endpoint).
- **Severity:** Important (slow path on M:).

## I9 – Hubert hides "Læg antal på" from admins and status-manager tasks from status managers

- **Where:** `electron/assistantAppGuideWarehouse.cjs:45-49` (`start-status`), `:105-109` (`approve-materials`), `:119-123` (`sap-documents`), `:145-149` (`lock-status`), `:179-183` (`warehouse-roles`); gating in `electron/assistantAppGuide.cjs:1059` (`allowed`) and `:1148-1152`; role from `electron/assistantContext.cjs:495,500,762` (`principal.role`, the Hub role).
- **What happens today:** Guide tasks marked `requires: MANAGER` are only shown to Hub managers/creators; others get `userTask` instead. CountPoint's own roles are ignored. The person who **must** do "Læg antal på" is an Optælling admin (`core/piDocs.cjs:8,60`: `count: 'admin'`, managers may not), who is a Hub *user*. Scenario: admin asks Hubert "hvordan lægger jeg antal på SAP-dokumentet?" → `sap-documents` is not allowed → Hubert answers with "Tæl et materiale og send det til godkendelse". A status manager asking "hvordan starter jeg en status?" gets "Opret en optælling". A plain user asking about roles gets `warehouse-roles`' `userTask`, which is `sap-documents` – a manager-only page.
- **Why it matters to users:** Hubert sends exactly the people who do these steps to the wrong instructions.
- **Exactly what should change:** Let warehouse tasks declare `requires: 'count-manager'` (manager or status manager) or `requires: 'count-admin'`, and have the assistant resolve those through the same `serviceUser`/`roles.roleOf` the module uses (the warehouse assistant already has `userFor: serviceUser`, `register.cjs:485`). Make `sap-documents` visible to managers, status managers and admins; `start-status`, `approve-materials`, `lock-status` to managers and status managers. Change `warehouse-roles`' `userTask` to a task a user may read (or none, so `rolesAnswer` explains it).
- **Risk of the change:** Low–medium: touches the shared guide matcher; restrict the new role kinds to the warehouse module.
- **Severity:** Important.

## I10 – SAP indicator tells Softwareload users "you always press F8, Save or Post yourself" – Softwareload posts in PS4 on its own

- **Where:** `src/components/warehouse/SapIndicator.tsx:68` (and `:31` title), `src/lib/warehouse/sapStatus.ts:13-21`; behaviour in `electron/warehouse/sap/sl-transfer.vbs:1-12` and `sl-block.vbs:1-6`.
- **What happens today:** The SAP pill is shown in Optælling, Placeringer and Softwareload (`Warehouse.tsx:75`). Its popover always says "Optælling læser fra SAP. Optællingsdokumenter udfyldes i SAP, men du trykker altid selv F8, Gem eller Post." In Softwareload, "Afslut og flyt i SAP" and "Flyt til D005" press Transfer/Enter (ZMS_REP/ZMS_PREP) and Check/Post (MIGO 343/344) themselves, in PS4. Every state text ("Optælling åbner sin egen SAP-session", "så Optælling kan bruge SAP", "Optælling bruger PS4") names Optælling even inside Placeringer and Softwareload.
- **Why it matters to users:** A Softwareload user who reads the popover believes nothing is posted until they press something in SAP – the opposite of reality in production.
- **Exactly what should change:** Pass the tool to `SapIndicator` (`<SapIndicator tool={tool} />`) and show per tool: Optælling – the current text; Placeringer – "Placeringer læser kun fra SAP (materialedokumenter og beskrivelser)."; Softwareload – "Softwareload flytter terminalerne i SAP selv, når du klikker 'Afslut og flyt i SAP' eller 'Flyt til D005'. Der bogføres i {system}." Replace "Optælling" in `sapStatus.ts` with "appen"/"the app" or the tool name.
- **Risk of the change:** None (texts); update `sapStatus.test.ts` and keep the English coverage test green.
- **Severity:** Important (users' understanding of PS4 writes).

## M1 – `toIpcError`: Node `ERR_*` codes pass through raw; any ENOENT is shown as "M: is down, scans are saved locally"

- **Where:** `electron/warehouse/register.cjs:39-52`; `src/lib/warehouse/errors.ts:31,189`.
- **What happens today:** `CODE` matches any `A_B` code, so Node's own `ERR_INVALID_ARG_TYPE`, `ERR_STRING_TOO_LONG` etc. reach the window with Node's message as "detail" (the comment says internal details never do). `ENOENT` is treated as "storage unavailable" wherever it comes from. Scenario: an SAP export reports `ok` but SAP saved the file under another name; `fs.promises.readFile(path.join(dir, 'mb52.txt'))` in the local temp folder throws ENOENT; the user is told "Kan ikke nå lagerstyrings-data på M:. Scanninger gemmes lokalt…" during an SAP fetch. The same text appears in Softwareload, Stempelkort and the roles card where nothing is "saved locally". `ENOSPC`/`EMFILE` become "uventet fejl".
- **Why it matters to users:** The message sends people to check M: when the problem is SAP, and promises local saving that does not exist in those tools.
- **Exactly what should change:** Only accept codes that do not start with `ERR_`; map ENOENT to `STORAGE_UNAVAILABLE` only for errors whose `path` is under the platform root (`error.path?.startsWith(platformRoot())`); make the `STORAGE_UNAVAILABLE` text neutral ("Kan ikke nå data på M: lige nu. Prøv igen om lidt.") and let Optælling's scan screen add its own "scanninger gemmes lokalt" line.
- **Risk of the change:** Low.
- **Severity:** Minor.

## M2 – Slow-call logging: wrong channel list and misleading "heraf bruger" time

- **Where:** `electron/warehouse/register.cjs:250-266`.
- **What happens today:** `waitsForSap` exempts every `sap-check:*` and `pidocs:*` channel (`sap-check:overview/latest/settings`, `pidocs:list` are M:-only), but not `counts:copy-serials` (can run ZMS_LONG_SERNO for minutes) nor `counts:import-file` (waits for the user in a file dialog), which are therefore logged as "LANGSOM". When `serviceUser` itself throws (e.g. slow `currentActor`), `userMs` stays 0, so the log says "heraf bruger 0 ms" although all time was spent there.
- **Why it matters to users:** Slow M: calls in the check overview are hidden, while harmless dialogs produce noise; diagnosis of "it is slow" goes the wrong way.
- **Exactly what should change:** Use an explicit set of SAP-waiting channels (`sap:status`, `sap:show-doc`, `sap-check:run`, `pidocs:create|print|count|post|delete`, `counts:copy-serials`, plus the existing counts/locations/softwareload ones) and a separate set of user-waiting channels (`counts:import-file`). Set `userMs` in a `finally` around `serviceUser`.
- **Risk of the change:** None (logging only).
- **Severity:** Minor.

## M3 – `me` reports a status manager as "manager": the header can never say "Status manager", and the UI never notices a demotion

- **Where:** `electron/warehouse/register.cjs:270`; `src/views/warehouse/Warehouse.tsx:80, 138-148, 167`; `src/types/warehouse.ts:105-111`.
- **What happens today:** `serviceUser` turns a status manager into `{ role: 'manager', statusManager: true }`; `me` returns only `role: 'manager'`. `WarehouseContent` starts with `appRole = 'manager'` and calls `roles.me()` only when `user.role === 'user'`, so the `appRole === 'status-manager'` branch of the header label is unreachable and status managers see "Manager". `me` is read once when the module opens; if a status manager is demoted (or a Hub manager loses the role) the manager buttons stay until the module is reopened, and every click then fails with `MANAGER_ONLY`.
- **Why it matters to users:** Wrong label (people think they have more rights than they do); stale buttons that fail.
- **Exactly what should change:** See suggestion S1: return `appRole`, `locationAdmin` and `statusManager` from `me`, use them directly, refresh `me` on window focus and every 60 s instead of `roles.me`, and type `WarehouseUser` accordingly.
- **Risk of the change:** Low.
- **Severity:** Minor.

## M4 – Four different definitions of "manager"; the status-manager promotion relies on every service remembering `!user.statusManager`

- **Where:** `electron/warehouse/register.cjs:237-247`; `roles.cjs:19`; `countService.cjs:53`; `timeclockService.cjs:28`; `softwareload/softwareloadService.cjs:248`; `locations/service.cjs:21`; `core/piDocs.cjs:4`; `sapCheckService.cjs:42`.
- **What happens today:** A status manager is passed to every service as `role: 'manager'`. Timeclock, Softwareload and the default `isLocationAdmin` must (and do) add `&& !user.statusManager`; Optælling must not; PI documents and SAP check re-derive the role through `roles.roleOf`. Each file has its own `isManager`. Scenario: a new tool (or a new manager-only action in an existing one) that writes `user.role === 'manager'` silently gives status managers manager rights there, e.g. over Stempelkort times.
- **Why it matters to users:** Stempelkort times and Softwareload statistics are explicitly "kun managere (ikke status managere)"; one forgotten condition leaks them.
- **Exactly what should change:** Keep the Hub role untouched and add explicit fields in `serviceUser`: `hubManager: boolean`, `countRole: 'manager'|'status-manager'|'admin'|'user'`. Export `isHubManager(user)` and `isCountManager(user)` from `roles.cjs` and use them in all services; make `countService` use `isCountManager`.
- **Risk of the change:** Medium (touches every service's checks); covered by the existing service tests.
- **Severity:** Minor (no current leak found; fragile).

## M5 – `listTeamUsers` treats `isManager: true` as manager even when `role` says user (auth does not)

- **Where:** `electron/warehouse/register.cjs:155-158` vs `electron/authService.cjs:200`.
- **What happens today:** Auth: manager if `role === 'manager' | 'admin'` or (`!role && isManager`). Warehouse list: manager if `role === 'manager' | 'admin'` **or `isManager`**. Scenario (uncertain how often the data looks like this; the Hub's own role changes keep both fields in step): a user record `{ role: 'user', isManager: true }` (hand-edited or legacy). The person works as a plain user, but the roles card shows "Automatisk via managerrolle" and `setRole`/`setLocationAdmin` refuse with "Managers har allerede alle rettigheder", so nobody can make them admin.
- **Why it matters to users:** A manager cannot appoint that colleague and sees wrong information.
- **Exactly what should change:** Use the auth rule: `user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager)`; better, export it from one module (`userRoles`) used by both.
- **Risk of the change:** Very low.
- **Severity:** Minor.

## M6 – Status managers can change admin roles over IPC although UI/guide say only managers can; new users wait 30 s

- **Where:** `electron/warehouse/roles.cjs:54-55, 66-77`; `src/components/warehouse/WarehouseRolesCard.tsx:39, 166`; `electron/assistantAppGuideWarehouse.cjs:190`; `register.cjs:120-127` (`cachedUsers`).
- **What happens today:** `roles.list` returns `canEdit: true` and `setRole` accepts admin changes from a status manager (only the status-manager role itself is refused), while the roles card (Manager Panel, for Hub managers) and Hubert say "Kun managere kan ændre rollerne". Separately, `setRole`/`setLocationAdmin` check membership against the 30-s user cache: a manager approves a new employee in Manager Panel and immediately sets "Admin" → `ROLE_INVALID: Brugeren er ikke i teamet`.
- **Why it matters to users:** Backend rights and documented rights disagree; a confusing failure right after approving someone.
- **Exactly what should change:** Decide the rule. If only managers: `canEdit: isManager(user) && !user.statusManager` and the same check in `setRole`. Either way, in `setRole`/`setLocationAdmin` re-read the team users once (bypass `cachedUsers`) when the target is not found before refusing.
- **Risk of the change:** Low.
- **Severity:** Minor.

## M7 – `sapShow`: unparsable script output becomes "uventet fejl"; English hint is wrong for missing MI03/MIGO access

- **Where:** `electron/warehouse/sapShow.cjs:23-28`; `src/lib/warehouse/errors.ts:190-191` (`SAP_SHOW_FAILED` EN).
- **What happens today:** `JSON.parse(...)` is not guarded (the other modules use `lastJsonLine` returning null). Empty or non-JSON stdout throws `SyntaxError` → `UNEXPECTED_ERROR`. In English every `SAP_SHOW_FAILED` says "Make sure you are logged on to SAP and have fewer than 6 windows open", also when the real reason is "no access to MI03". `sap-show.vbs` does not check SAP readiness/client (I4).
- **Why it matters to users:** "Vis i SAP" in the archive fails with a meaningless text.
- **Exactly what should change:** Use the shared `lastJsonLine`; on null throw `SAP_SHOW_FAILED: SAP svarede ikke som ventet`. Add distinct codes `SAP_NO_ACCESS` (already has texts) for `no-access-*`, and `SAP_NOT_READY` for `not-logged-in-*`/`sap-busy`/`max-sessions`.
- **Risk of the change:** None.
- **Severity:** Minor.

## M8 – Material catalog: unlocked read-modify-write of one shared file, whole file re-read on every lookup

- **Where:** `electron/warehouse/locations/catalog.cjs:9, 26-37`; `electron/store.cjs:263-271` (cached value returned by reference).
- **What happens today:** `learn` reads `materialtekster`, mutates the returned object **in place** (it is the store's cached object) and writes the whole file with `setAsync`, without the file lock. Two PCs learning at once (e.g. TCD creates a count preview while TRR fetches a material document) – the last writer wins and the other's new descriptions are lost until learned again. The file holds every material ever seen, is shared by both teams, and `describe` re-reads and decrypts it whenever the 3-s cache has expired – on every Placeringer search, list and material card.
- **Why it matters to users:** Descriptions intermittently missing ("bare numre"), and extra M: traffic on the most-used Placeringer screens.
- **Exactly what should change:** Use `sharedStore.mutateAsync(CATALOG_KEY, current => …)` (requires the C1 fix) and copy before mutating. Keep a process-level in-memory copy with a longer TTL (descriptions change rarely) and refresh it after `learn`.
- **Risk of the change:** Low.
- **Severity:** Minor.

## M9 – Read-only screens (material card, Hubert questions) start background MM60 runs that hold the SAP queue

- **Where:** `electron/warehouse/locations/catalog.cjs:79-92` (`describeMissing`); `electron/warehouse/locations/service.cjs:306, 138, 228, 387`; `electron/warehouse/sapFetch.cjs:170-200`.
- **What happens today:** Opening a material card without a stored text (also through Hubert's "hvor står X?", which reads through the same service) starts `describeMissing` in the background: a `status.vbs` run, then one MM60 SAP session per material (up to 5, each up to 4 minutes timeout) inside `bridge.exclusive`. There is no in-flight guard, so two quick card views queue two runs for the same material. While they run, the SAP indicator poll and the user's own "Hent fra SAP" wait in the queue. When SAP is not ready the material is not marked as tried, so every view spawns another status check.
- **Why it matters to users:** Unexplained delays on SAP buttons right after browsing Placeringer, and SAP sessions opening in the background.
- **Exactly what should change:** Keep a `Set` of materials in flight; mark as tried also on `SAP_NOT_READY` (shorter retry, e.g. 1 min); trigger lookups only from write actions (put-away/shelf-put), not from `materialCard`; or run them only when the SAP queue is idle.
- **Risk of the change:** Low; some texts arrive later.
- **Severity:** Minor.

## M10 – Hubert guide states things the program does not do

- **Where:** `electron/assistantAppGuideWarehouse.cjs:68` (+ `assistantAppGuideWarehouseI18n.cjs:12,51,90`), `:190` (+ I18n `:22` and fi/sv), `:169-176`; `src/components/warehouse/WarehouseRolesCard.tsx:39,55,71,87`.
- **What happens today:** (1) "Programmet læser kun fra SAP, når en optælling oprettes." – the app also reads SAP on "Hent SAP igen" (`CountView.tsx:284`), "Hent dagens SAP-tal" (`DocPanel.tsx:184`), material-document lookups, "Lange" (ZMS_LONG_SERNO) and "Tjek SAP-fejl". (2) "managere har altid alle rettigheder" (guide and roles-card intro) – managers and status managers may not "Læg antal på"; only an admin may (`core/piDocs.cjs:8,60`), and status managers do not see Stempelkort times/Softwareload statistics. (3) `sap-check` step 3 tells everyone to click "Lav mail til SAP-teamet", which only admins/managers/status managers can (`SapCheck.tsx:287-293`). All labels quoted by the guide do exist in the UI (checked automatically for da and en).
- **Why it matters to users:** A manager told they "always have all rights" looks for the "Læg antal på" button and cannot find it; users ask why SAP is read when the guide says it is not.
- **Exactly what should change:** (1) "Programmet læser fra SAP, når du opretter en optælling, henter SAP igen, henter dagens SAP-tal, slår et materialedokument eller lange serienumre op, og i Tjek SAP-fejl. Det ændrer kun noget i SAP på fanen Til optællingsdokument." (2) "Managere har alle rettigheder undtagen at lægge antal på SAP-dokumenter – det gør en admin, så to personer altid er involveret." (same in the roles card). (3) Add "Kun admins og managere kan lave mailen." to `sap-check` notes. Update en/fi/sv.
- **Risk of the change:** None.
- **Severity:** Minor.

## M11 – Dead code

- **Where / what:**
  - `electron/warehouse/teams.cjs:9, 15-22, 24`: `TEAM_IDS` and `teamDataDir` (and its `TEAM_NOT_ALLOWED` code) are used only by `teams.test.cjs`; `errors.ts:29,187` keep texts for it.
  - `src/lib/warehouse/singleFlight.ts` (+ test): `createSingleFlight` is not imported anywhere; `src/lib/warehouse/locations.ts:58` has the `singleFlight()` that is used.
  - `electron/warehouse/register.cjs:109`: `sharedStore.updateAsync` – no caller since `cc741f1`.
  - `src/lib/warehouse/errors.ts`: texts for codes never thrown by the backend: `IPC_FORBIDDEN` (:30, :188; the real codes are `AUTH_FORBIDDEN`/`AUTH_UNTRUSTED_WINDOW`), `COUNT_CREATE_FAILED` (:201), `SERIAL_INVALID` (:212), `PLACE_REQUIRED` (:213), `QTY_INVALID` (:214), `LINE_NOT_FOUND` (:216).
  - `src/views/warehouse/Warehouse.tsx:167`: the `'status-manager'` label branch (M3).
  - `electron/warehouse/sapBridge.cjs:14-17`: `SCRIPT_WRITE_SYSTEMS`/`SOFTWARELOAD_WRITE_SYSTEMS` equal `WRITE_SYSTEMS`, which equals `SAP_SYSTEMS`; the `writeEnabled` gates built on them are always true (I3).
- **Why it matters to users:** Not directly; it misleads maintainers (e.g. `IPC_FORBIDDEN` suggests the real refusal is covered when it is not).
- **Exactly what should change:** Delete the unused exports/files/texts; move `IPC_FORBIDDEN`'s text to `AUTH_FORBIDDEN`; replace the allow-lists by the config switch of S6.
- **Risk of the change:** Very low (tests reference `teamDataDir`/`TEAM_IDS`/`createSingleFlight`; remove those tests too).
- **Severity:** Minor.

## M12 – Duplicated helpers that should be shared

- **Where / what:**
  - Team storage locations in three places: `electron/warehouse/teams.cjs:5-8`, `src/lib/warehouse/teams.ts:4-7` (used only by `SapCheck.tsx:27`), and team ids in `src/lib/warehouseLabels.ts:17` – although `me` already returns `storageLocations`.
  - `lastJsonLine`/`parseLastJsonLine` in `sapBridge.cjs:50`, `sapFetch.cjs:27`, `sapPiDocs.cjs:18`, `softwareload/softwareloadSap.cjs`, inline in `sapShow.cjs:24`.
  - The block "status → `computeSapState` → `SAP_NOT_READY` → `mkdtemp` → try/finally `rm`" five times in `sapFetch.cjs` (around lines 49-51, 92-94, 124-126, 150-152, 174-176) and again in `softwareloadSap.cjs:56-60`.
  - `codeError` in at least eight files with two different message formats (`CODE` vs `CODE: detail`), email `lower`/`normalize` in `register.cjs:180`, `roles.cjs:18`, `hubUser.cjs:5`.
- **Why it matters to users:** A change to the SAP readiness rule (e.g. the client check of I4) must be made in six places; one missed place is a write without the check.
- **Exactly what should change:** Add `withSapSession(bridge, runScript, expected, job)` in `sapBridge.cjs` that does status check + temp dir + cleanup inside `exclusive`; export `lastJsonLine` from there; a tiny `errors.cjs` with `codeError(code, detail)`; return both teams' slocs from the backend (`me.teams`) or put them in one JSON imported by both sides.
- **Risk of the change:** Low–medium (mechanical refactor; good test coverage).
- **Severity:** Minor.

## M13 – Comments that contradict the code

- **Where / what:**
  - `electron/warehouse/sapBridge.cjs:1-3` "one SAP job at a time" – PI writes bypass the queue (I2); `:10` "the scripts check it again" – they do not (I3).
  - `electron/warehouse/roles.cjs:3` "main.cjs passes them on as managers" – it is `register.cjs:245`.
  - `src/types/warehouse.ts:888` "Managers, status managers and Optælling's admins maintain the locations" and `electron/warehouse/locations/service.cjs:503` (same) – in fact managers and Placerings admins only (`roles.cjs:94-97`, error text at `service.cjs:506`).
- **Why it matters to users:** Wrong comments on safety rules lead to wrong changes later.
- **Exactly what should change:** Correct the four comments as described.
- **Risk of the change:** None.
- **Severity:** Minor.

## M14 – SAP/placement env overrides are honoured in packaged builds; client is hard-coded; legacy config file ignored

- **Where:** `electron/warehouse/config.cjs:31-42`; `electron/warehouse/register.cjs:79-81`; `electron/main.cjs:200-201`.
- **What happens today:** `TCD_HUB_SAP_SYSTEM` and `TCD_HUB_PLACEMENTS_DIR` override the config file also in the packaged app, whereas the SAP fixtures are correctly limited to `!isPackaged`. Scenario: a tester sets `warehouse.sapSystem: "QS4"` in the config next to the exe but has `TCD_HUB_SAP_SYSTEM=PS4` left in the user environment → the app silently works against PS4 (the TEST-SAP badge does not appear, which is the only hint). The expected client `'100'` is hard-coded and cannot be set for QS4. `main.cjs` reads `supply-chan-hub.config` **or** the legacy `tcd-hub.config.json`; the warehouse section is only read from the former.
- **Why it matters to users:** A test installation may write to production without the tester noticing.
- **Exactly what should change:** Ignore the two env overrides when `isPackaged` (pass it to `resolveWarehouseConfig`), or at least log and show them in the SAP popover. Add `warehouse.sapClient` (default `"100"`) to the config. Read the warehouse section from the same file `main.cjs` chose.
- **Risk of the change:** Low (development uses unpackaged runs).
- **Severity:** Minor.

## M15 – `SAFE_ARGUMENT` rejects temp paths with non-ASCII characters (uncertain)

- **Where:** `electron/warehouse/sapBridge.cjs:18, 38`; temp dirs from `os.tmpdir()` in `sapFetch.cjs:35`, `sapPiDocs.cjs:40`, `softwareloadSap.cjs:51`.
- **What happens today:** Every script argument must match `[A-Za-z0-9 _.:\\/-]`. The output folder is under `%TEMP%`, normally `C:\Users\<login>\AppData\Local\Temp`. If a PC's login or a redirected TEMP contains æ/ø/å, parentheses or `&`, every SAP fetch/write fails with `SAP_INVALID_ARGUMENT` ("Ugyldige data til SAP"). Uncertain: corporate logins are usually ASCII.
- **Why it matters to users:** A misleading error and no SAP functions at all on that PC.
- **Exactly what should change:** Create the temp folders under `path.join(userDataDir, 'warehouse', 'sap-tmp')` after checking it against `SAFE_ARGUMENT`, or fall back to `C:\ProgramData\...`; give a specific error text ("Midlertidig mappe har tegn SAP-scriptet ikke kan bruge").
- **Risk of the change:** Low.
- **Severity:** Minor (uncertain).

---

## Suggested additions (grounded in the code)

- **S1 – One `me` with the real rights.** Return `{ …, appRole, statusManager, locationAdmin, countAdmin }` from `warehouse:me` (`register.cjs:270`, all already computed in `serviceUser`/`roles`) and refresh it on window focus. Fixes M3, removes the 60-s `roles:me` polling in `Warehouse.tsx:139-146` and the separate `roles.me()` in `Locations.tsx:55`, and lets every tool hide buttons the person cannot use.
- **S2 – Say what was copied.** After the verified copy of I1, the toast should show the value(s): "Kopieret: 42 – R162-0717 · D004" and for serial lists the first and last serial and the count ("118 serienumre, 4710000012 … 4710000377"). People can compare with the SAP screen before they paste. All data is already in `DocPanel.tsx:302` and the `copySerials` result.
- **S3 – Show the target SAP before a write.** The confirm dialogs of "Afslut og flyt i SAP", "Flyt til D005", "Opret SAP-dokument" and "Bogfør" should show "Flyttes/oprettes i PS4/100 som <SAP-bruger>" from the `sap:status` answer (`system`, `client`, `user`, `expectedSystem` are already in `SapStatus`), and refuse when the status is not `ready` (closes the UI side of I4 for PI documents).
- **S4 – Error-text coverage test.** Next to `englishCoverage.test.ts`, a test that collects every code thrown in `electron/warehouse/**` (and `AUTH_*` from `securedIpc.cjs`) and requires a Danish and an English text (I6).
- **S5 – `statuses:active-progress`.** A small read for the tools page (I8) that also lets the Optælling tile show "Tjek SAP-fejl sidst kørt <dato>" from `sap-check:latest`, which `StartStatusDialog` already reads.
- **S6 – A configurable write switch.** `warehouse.sapWrites: false` in `supply-chan-hub.config` (read in `config.cjs`) to stop PI documents and Softwareload from changing SAP on an installation without a release, used by the runner (I3) and shown in the UI through the existing `writeEnabled` flags (`piDocService.cjs:29-38`, `softwareloadService.cjs:321`), which today are always true.
