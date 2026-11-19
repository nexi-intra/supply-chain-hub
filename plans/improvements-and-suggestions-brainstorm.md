# Improvements and Suggestions - brainstorming

Date: 2026-10-01. Initial workflow approved; the user authorized local
implementation with Superpowers. See improvements-mvp-implementation.md.
Production-data migration and release remain unauthorized.
Working DA name: Forbedringer og forslag.
Working EN name: Improvements and Suggestions.
Finnish naming and labels remain to be agreed.

## Phase 1 - understand the existing process

- [x] Load Superpowers brainstorming and the user's workflow preferences.
- [x] Locate the actual supplied workbook in Downloads and read it without edits.
- [x] Identify the ImpList and DATA worksheets and their actual header fields.
- [x] Inspect the existing Hub project/team-member model as a nearby reference.
- [x] Clarify visibility: all Supply Chain employees may see every suggestion.
- [x] Record the requirement to filter and sort the common list by parameters.
- [x] Approve initial editing rights: all may create/comment, assigned people
  update progress, and leaders manage priority/assignment.
- [x] Require recipient acceptance before an assignment becomes active.
- [x] Approve final completion: accountable owner marks ready; a leader approves closure.
- [ ] Finalize exact status transitions and the handling of declined improvement proposals.
- [ ] Clarify the difference between an accountable owner and contributors.
- [ ] Agree on scope: general improvements with AI/automation as a solution type.

Start with phase 1. Do not implement while these governance decisions are open.

## Confirmed visibility and list behavior

The user confirmed that everyone in Supply Chain must see all improvements and
suggestions across departments. Use one common list; department filters are
view preferences, not access restrictions. This grants access to improvement
records, not unrelated account, personnel, or team-private data.

The common list must support filtering and sorting. Exact filter choices are
proposals pending confirmation:

- Status and priority.
- Submitting department and affected departments, kept as distinct fields.
- Accountable owner, contributors, and original submitter, kept distinct.
- Category/solution type, such as AI/automation or process improvement.
- Date range and, if due dates are included, overdue items.
- Text search across title/problem/proposed solution.

Proposed sort orders: recently updated, newest/oldest, priority, and due date.
Convenient presets: All, My suggestions, Assigned to me, and My department.
Allow combined filters with a clear reset action. Empty results must not look
like missing data or loss of access.

## Confirmed initial editing rights

The user accepted the proposed division:

- Every Supply Chain employee may create a suggestion and comment.
- The accountable owner and contributors with accepted assignments may update progress.
- Leaders manage priority and assignment of people.

Do not interpret common read access as unrestricted editing. The user approved
leader approval for final completion. Decline, reassignment details, and mapping
to existing Hub roles still need explicit design decisions.

## Ownership proposal and confirmed invitation requirement

Proposed structure: one accountable owner plus multiple contributors, selected
from real Supply Chain identities across departments. The owner coordinates
the next action; contributors help implement or test it.

The user requires acceptance: leader assignment creates an invitation, not an
immediately active responsibility. Keep invitation state separate from case
status, so a case does not appear staffed merely because invitations were sent.

- The recipient receives a notification and an invitation awaiting response.
- Only that recipient can accept on their own behalf.
- Acceptance activates their assignment-based progress rights. Pending
  invitations do not grant those rights; common read/comment rights remain.
- Show pending invitations separately from active assignments in the case and
  the recipient's personal overview.

Recommended supporting behavior, pending design approval: the recipient may
decline, the inviter is notified of acceptance/decline, and changes appear in
the case timeline. Reminder cadence, withdrawal, reassignment, and any required
decline reason remain open; do not implement automatic acceptance or silently
replace an active accountable owner with an unaccepted candidate.

## Confirmed final completion

The user approved the proposed closure model on 2026-10-01:

- The accepted accountable owner marks the case ready for approval.
- A leader reviews the result and marks the improvement completed.
- Being an accepted contributor does not itself grant final closure rights.
- "Ready for approval" and "Completed" remain distinct states.

Recommended supporting behavior: record who submitted/completed the case and
when; notify the reviewer/owner, and permit returning the case with feedback
instead of treating missing approval as completion. These details belong in
the consolidated first-version design, not in an unreviewed implementation.

## Consolidated first-version proposal

Recommend a separate Forbedringer og forslag module in the main Hub, with the
current project board unchanged. A suggestion-only inbox would not support
the accepted invitation/progress/approval workflow; turning the general to-do
board into a broad shared improvement system would mix distinct purposes.

First version should cover:

- One shared Supply Chain list with search, combined filters, sorting and
  presets for All, My suggestions, Assigned to me, and My department.
- A short submission form: title, problem, proposed solution, originating
  department and affected departments; the actual author/time are recorded.
- Separate accountable owner and contributors from real approved identities;
  assignment only activates after the invited person accepts.
- A case detail view with next action, status, comments, and a timeline of
  decisions/invitations/assignments/progress changes.
- The agreed role boundaries: everyone reads/submits/comments, accepted people
  update progress, leaders prioritize/assign and approve final completion.
- Notifications for invitations and the agreed review stage.
- Ordinary improvements plus an AI/automation category, without automatically
  generating programs or executing uploaded code.

Candidate lifecycle for review: New -> Assessment -> Planned -> In progress
-> Testing -> Ready for approval -> Completed, with On hold and Declined handled
separately and with explanations. Final transitions are not yet an implemented
permission contract.

Defer Excel import, extensive savings/ROI reporting, automated reminder
escalation, and advanced integrations until the core workflow is tested.
Preserve the workbook unchanged. A later import needs explicit mapping and
approval, and a release always needs separate authorization.

Suggested first delivery phase: real shared data and authorization foundation,
then the list/detail/forms and invitation flow, then notifications/final review.
Use isolated data, TDD, role/concurrency tests, browser verification, and review
before calling any implementation phase complete.

## Workbook evidence

The supplied Continuous Improvement list (1).xlsx is read from the user's
Downloads folder. ImpList has employee suggestions and a Team Manager Action
area, not merely software requests.

Fields: ID, Raised date, Raised by, Area, Affected areas, Topic, Issue,
Solution proposal, Priority, Status, Feedback date, Feedback, Responsible.

DATA lists priorities Critical/High/Medium/Low and statuses Open/On hold/
Completed/Closed. Departments include Prepare/Warehouse, Repair, PTA, TSS,
Supply Chain Excellence, and Supply Chain BPO Nordic, DA and CH.

Actual examples include reusable shipping cages, SAP field automation, and a
shared social area. A responsible field can contain multiple people's initials.
Some feedback fields combine several dates/updates. XML row counts include
formatted blank rows and are not asserted to equal the number of suggestions.

## Preliminary ideas - not yet approved

- A shared improvement intake in the main Hub for everyday process issues.
- A quick submission: title, current problem, proposed solution, submitting
  department, affected departments, and optional evidence/attachments.
- One accountable owner plus named contributors across departments, linked to
  real user identities rather than a manually maintained initials string.
- Explicit next action and optional due date, with assignment notifications.
- Timeline of comments, decisions, assignments, and status changes instead of
  overwriting a single feedback cell.
- Candidate lifecycle: New -> Assessment -> Planned -> In progress -> Testing
  -> Completed. On hold and Declined need reasons. Exact states remain open.
- AI/automation as a category/solution type alongside ordinary process changes.
- Capture expected benefit and, after completion, measured benefit: time saved,
  fewer errors, reduced cost, or improved working conditions. Do not invent ROI.
- Views for My suggestions, Assigned to me, My department, and cross-team items,
  subject to the agreed access policy; simple status/owner/priority filters.
- Optional link to the actual developed tool and related guides when available.
- Preserve the original workbook. Any import/migration needs separate mapping,
  duplicate checks, and explicit approval; do not turn its formatted blank rows
  into improvement records or overwrite shared production data.

## Existing technical reference and constraints

ProjectBoard currently persists projects in the current team's projects key.
It already has a title, description, owner/creator, teamMembers, status and due
date, but lacks the workbook's intake/decision/feedback/benefit process.

Cross-department work requires an explicit shared ownership/access model and
approved identity directory. Do not bypass team boundaries, duplicate a shared
case into each team, or use broad account access for assignment dropdowns.
Keep shared-drive reads bounded and mutations atomic; no startup-wide polling.

## Phase 2 - compare and agree on the design

- [ ] Compare a lightweight suggestion inbox, a shared improvement case board,
  and extensions to the existing project board; explain the trade-offs.
- [ ] Present the workflow and role/access model in small reviewable sections.
- [ ] Discuss visual options only after behavior is clear; offer a browser view
  separately if useful, without claiming missing visual-companion assets exist.
- [ ] Get approval of the scoped design and record the specification in plans.
- [ ] Review the specification using a real available reviewer.
- [ ] Ask the user to review the written specification before implementation.

## Phase 3 - implementation planning only after approval

- [ ] Use writing-plans for a phased, testable implementation plan.
- [ ] Plan TDD, accessibility, DA/EN/FI, permissions, concurrent writes, history,
  account changes, and isolated-data verification.
- [x] Obtain authorization for local code implementation with Superpowers.
- [ ] Obtain separate authorization for any production-data migration.
- [ ] Keep release/publication separate; none is requested.