# Improvements and Suggestions Implementation Plan

> Use Superpowers subagent-driven-development for bounded implementation tasks,
> TDD for behavior, and verification-before-completion. Use real available tools
> and reviewers. Do not commit, branch, migrate production data, or release.

**Goal:** A real shared Supply Chain improvement module with accepted cross-team
assignments and leader-approved completion in local 1.5.9 development.

**Architecture:** Dedicated authenticated Electron IPC commands operate on one
encrypted shared case array. Writes use fresh per-case snapshots and the
existing atomic replaceItem operation; caller payloads cannot supply roles or
identity. UI calls a typed bridge and uses current real approved people/teams.

**Tech Stack:** Existing Electron CommonJS, React/TypeScript, Phosphor/Radix,
encrypted store, Node tests, Vitest, and Playwright/Edge. No new dependencies.

## Confirmed product boundaries

- All authenticated Supply Chain employees read all improvement cases.
- All submit/comment; only accepted owner/contributors update progress.
- Managers/Creator prioritize and invite approved people from any team.
- Invitations remain pending until their recipient accepts or declines.
- Only an accepted owner submits Ready for approval; leaders approve completion
  or return it with feedback. No silent completion or invitation acceptance.
- Keep author distinct from assignment. Use real identity/department labels.
- Preserve ProjectBoard and unrelated private team data.
- No Excel import, code generation/execution, ROI engine, or release.
- UI remains responsive; no new platform-wide periodic scans/polling.

## Contract for implementation

Case: id, revision, title, problem, proposal, category, originTeamCode,
affectedTeamCodes, createdBy, createdByName, createdAt, updatedAt, priority,
status, nextAction, dueDate, assignments[], history[], notifications[].

Statuses: new, assessment, planned, in-progress, testing, ready-for-approval,
completed, on-hold, declined. Categories: process, automation, quality,
workplace, cost, other. Priorities: critical, high, medium, low.

Assignment: id, email, name, teamCode, kind owner/contributor, status
pending/accepted/declined, invitedBy, invitedAt, respondedAt.
One accepted owner; reject conflicting owner invitations rather than silently
changing existing responsibility. Reassignment beyond this first flow is deferred.

History: id, type, actorEmail, actorName, at, message. Notifications are persisted
with the case mutation, scoped to recipients and acknowledged individually.
Use client operation IDs for retry safety; reject conflicting reuse.

API snapshot(): { cases, people, teams, actor }. Actor: email, fullName,
teamCode, role user/manager/creator, readOnly. Public people contain email,
fullName, teamCode only; no account secrets. Teams: folderName, name.

API command(command): returns updated case (or snapshot for acknowledgement).
Command shape: { operationId, type, caseId?, ...typed fields }.
Types: create, comment, invite, respond, update, submit, approve, return,
acknowledge. Server validates and constructs all persisted values.

## Reviewed command and persistence safeguards

- Use the authoritative raw encrypted shared store, not the resilient offline
  mutation queue. Unavailable writes fail visibly; do not queue future acceptance
  or role-sensitive decisions for replay without reauthorization.
- invite/update/submit/approve/return require expectedRevision from the displayed
  case. Reject a stale client revision; do not replace fields from a stale form.
- comment/respond/acknowledge are additive/recipient-scoped; bounded CAS retries
  reread and reauthorize the actual latest case.
- Persist actor/payload-bound operation receipts with their case mutation;
  repeated create finds its committed original case. Conflicting operation-ID
  reuse is denied. Reserved IDs cannot be claimed by another actor while retrying.
- Raw operation markers never appear as user comments. Public responses omit
  internal hashes and expose only the current actor's notification records.
- Notification fields are id, type, recipientEmail, createdAt, message, readAt,
  and optional assignmentId. Every command returns the updated projected case.
- respond uses accept:boolean; update clears dueDate with an empty string.
  update may carry message for hold/decline reasons; approve optionally carries
  a result message. No caller-supplied sender, recipient, history, or role.

First-version status matrix:

- From new/assessment/planned, accepted assignees can start in-progress.
- From in-progress, accepted assignees can move to testing; from testing, they
  can return to in-progress. Only an accepted owner submits in-progress/testing.
- Leaders assess/plan cases and put nonfinal cases on hold or decline with a
  reason. Only leaders resume on-hold to assessment/planned.
- ready-for-approval freezes progress/priority/invitation edits; only approve
  or return changes its state. Return requires feedback and resumes in-progress.
- completed/declined cannot be reopened by a generic update. Comments and own
  notification acknowledgements remain available.
- A person's acceptance remains separate from case progress; invitations may
  not be silently activated or alter a closed case.

Account migration: operational assignment email, invitedBy and notification
recipientEmail must follow a rename through accountReferences; audit history
actorEmail/name remains historical. Previous operation IDs remain bound to their
original identity; after forced re-login, new actions use new operation IDs.

## Phase 1 - real shared backend

### Approved extension - deletion, deadlines and completion wording

- [x] Add responseDueDate per invitation and feedbackDueDate per case, configured
  by leaders independently of the existing work dueDate; dates are optional,
  validated calendar dates and clearable. Overdue dates do not auto-accept/decline.
- [x] Add manager/Creator deletion with reason and confirmation, preserving
  audit/history/retry receipts in a hidden tombstone; deny later case mutations.
- [x] Allow users to request deletion with a reason, notify leaders, deduplicate
  pending requests, and let leaders delete or reject the request with feedback.
- [x] Protect set-deadlines/delete/reject-deletion with expectedRevision and
  backend roles; preserve old cases without the optional fields.
- [x] Display the existing completed state as Gennemfoert in Danish and make
  owner completion submission clear; keep leader final approval unchanged.
- [x] Add DA/EN/FI controls and badges, tests and isolated native/UI verification.
- [x] Restart the development app gracefully after verification; no release.

Extension verification: TypeScript passed; 63 real encrypted-store backend
tests and 77 model/dialog tests passed. Scoped review found a deletion reason
length mismatch, repaired with a red/green boundary test and accessible limits.
The actual native Hub flow passed with isolated data/profile: response and
feedback dates, accepted assignment, owner submission, leader completion,
Gennemfoert display, user deletion request, denied user deletion, leader UI
confirmation, list/snapshot removal and retained encrypted audit tombstone.
No test suggestions were written to production storage; no release or import.
The normal development window was restarted to load the new native commands
and confirmed responsive. Old-window invalid-command errors preceded restart.

Files: electron/improvements.cjs, electron/improvements.test.cjs,
electron/securedIpc.cjs and its tests, electron/main.cjs, electron/preload.cjs.

- [ ] Write failing tests using real temporary encrypted stores.
- [ ] Verify missing behavior with node --test electron/improvements.test.cjs.
- [ ] Implement authoritative validation, roles, invitation ownership,
  transitions, history and notification records.
- [ ] Use replaceItem expected snapshots; retry/reject concurrent changes
  without overwriting another case or losing comments.
- [ ] Block generic KV reads/writes for improvement-cases; only scoped API can
  mutate it. Route improvement commands through the account write gate.
- [ ] Wire real public identity directory and shared store in Electron.
- [ ] Test unauthenticated/observer/forged identity, pending users, wrong invite
  responder, duplicate retries, approvals, cross-team people and concurrent writes.
- [ ] Spec and quality review; repair findings and rerun the same tests.

## Phase 2 - usable module

### Hub navigation and visual identity fixes

- [x] Escape from the list returns to the main Hub, but open dialogs and Ctrl+K
  consume Escape first; do not navigate while a mutation is in flight.
- [x] Use a lightbulb icon for improvements, distinct from the To Do checklist.
- [x] Register the module in the Ctrl+K palette with the same localized title
  and icon; preserve custom/observer palette overrides.
- [x] Verify real isolated native Hub clicks, palette navigation and layered
  Escape handling, then restart the development window gracefully. No release.

- [x] Swap Game Corner and Notebook so Game Corner takes the earlier corner slot.

Navigation fixes were observed failing first, then passed in the real isolated
native Hub flow. Escape closes create/palette dialogs before leaving the module;
Ctrl+K opens the localized improvements entry; tile icons differ. The same
verification now checks Game Corner before Notebook. TypeScript and the two
existing App route tests pass. Scoped review approved the navigation changes.
The normal development window was reopened and confirmed responsive.

Files: src/lib/improvements.ts and tests, src/views/Improvements.tsx,
src/lib/improvementsLabels.ts, src/App.tsx, src/lib/appNavigation.ts,
src/views/Hub.tsx, src/vite-env.d.ts or the existing global bridge declaration.

- [ ] Define typed native bridge and pure combined filter/sort helpers with tests.
- [x] Add the main-Hub module tile and route.
- [ ] Build a dense responsive shared list with search, status, priority,
  departments, people and presets All/My suggestions/Assigned to me/My department.
- [ ] Add create/detail forms, comments/history, invitation responses and leader
  controls. Pending invitations do not appear as accepted work assignments.
- [ ] Use real snapshot data; show honest unavailable/loading/error states.
- [ ] Localize controls/statuses in DA/EN/FI using existing theme conventions.
- [ ] Keep mutations nonduplicating, visibly saving, with recoverable errors.
- [ ] Spec and quality review; rerun targeted tests/typecheck.

## Phase 3 - notifications and verification

Files: scripts/verify-improvements.cjs and relevant module integrations.

- [ ] Show outstanding invitations/review notifications and mark-read commands.
- [ ] Test real backend + browser workflow with isolated temporary data, not
  live shared suggestions; use the actual implemented service and UI.
- [ ] Verify invitation/accept/progress/owner submit/leader return/approval,
  filters, comments, persistence/reopen, and mobile/light/dark layout.
- [ ] Run scoped Node security tests, frontend tests, TypeScript and local build.
- [ ] Check requirements and document remaining real-account live conditions.
- [ ] Gracefully restart the development window and verify it is responsive.
- [ ] Update this plan incrementally. Release remains separately unauthorized.

Recommended start: Phase 1. Validation commands use existing local executables:

Navigation regression: App's tile click handler initially omitted improvements.
The missing branch is repaired. Two focused handler tests and TypeScript pass.
The actual isolated Electron login -> Hub tile -> module/create action passes
with scripts/verify-improvements.cjs --navigation-only; no browser errors.

```powershell
node --test electron/improvements.test.cjs electron/securedIpc.test.cjs
.\node_modules\.bin\vitest.cmd run src/lib/improvements.test.ts --maxWorkers=2
.\node_modules\.bin\tsc.cmd --noEmit
npm run build
node scripts/verify-improvements.cjs
```