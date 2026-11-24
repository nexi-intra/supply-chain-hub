# Guide formatting and links - brainstorming

Date: 2026-10-01. Local 1.5.9 development using the Superpowers workflow.
Application changes stay in 1.5.9. No commits, shared-data test writes, or release.
Status: the user approved the initial Hub-only feature design on 2026-10-01.
The user also approved all five additional proposals for inclusion in the plan.
The user requested continuation through planning, code, tests, review, and
verification on 2026-10-01. Local implementation is now authorized.
No commit, shared-data testing, change to 1.5.8, or release is authorized.

## Phase 1 - understand and choose

- [x] Load using-superpowers and brainstorming from TCD Tools/Skills.
- [x] Inspect the actual step editor, guide model, link viewer, DOCX export,
  and current development baseline.
- [x] Assess visual-companion need: the current question is about behavior
  and export scope, not visual layout. No mockup or missing script is needed.
- [x] Confirm export scope: the user requires this feature inside Hub only.
- [x] Compare approaches with the user and approve the initial feature design.
- [x] Obtain approval to include all five additional proposals in the plan.

Start with phase 1. Keep the existing sections, steps, images, and review flow.

## Verified current state

- GuideEditor uses Textarea and updates GuideStep.text as plain text.
- GuideStep has text and imageIds, but no rich-text or link metadata.
- linkifyText recognizes visible URLs and Windows/UNC paths. Arbitrary
  selected text cannot currently carry a different destination.
- docxGenerator exports each step as a single plain TextRun.
- Original-layout Word guides are separate attachments, not editable steps.
- Development baseline: 06a33be, with existing local development changes.

## Candidate approaches

1. Compact Tiptap React editor per step: recommended. Supports the requested
   selection-based formatting without replacing the structured guide model.
2. Markdown: simpler text representation, but does not provide the requested
   familiar Word-like interaction without additional editing UI.
3. Full document editor: greater scope and more layout complexity than needed
   for numbered procedural steps. Keep original Word documents edited in Word.

## Approved initial feature design

- A compact toolbar for bold, italic, underline, readable text colors,
  predefined sizes, links, clear formatting, undo, and redo.
- Preserve the current selection when opening a link picker or format control.
- Offer three link targets: an internal guide, an HTTPS document/website,
  or an approved shared document path through the native file-opening bridge.
- Internal guide targets should use guide ID plus team/shared scope, not titles
  or development-server URLs. Renaming must not break a link. Enforce existing
  permissions at resolution and handle archived or unavailable targets.
- Prefer portable HTTPS/UNC document references over machine-specific drives.
- Store validated rich-text JSON and derive plain text for search and Hubert.
  Do not save arbitrary HTML or allow unsafe URL schemes or executable targets.
- Preserve content in drafts, review proposals, history, restores, and sharing.
- Keep legacy guides readable without a bulk rewrite of shared storage.
- Plan mixed-version editing: older clients can discard unknown formatting
  fields when saving. A plain-text fallback alone does not prevent data loss.
- Use DA/EN/FI labels and tooltips and the existing icon/design conventions.

## Confirmed Hub-only scope

The user confirmed that formatting and links only need to work inside Hub.
Apply the feature to the step editor, saved guide content, and guide viewer.
Internal guide links navigate inside the app and keep existing access checks.
External documents/websites continue to use the appropriate browser/native
opening route; Hub-only scope does not require embedding their contents.

Do not extend Word/PDF export, register an app protocol, or introduce an
external deep-link destination. Existing exports continue using the derived
plain-text step content. Do not promise exported formatting or clickable
rich-text links. Keep existing export behavior working without enhancements.

Original Word attachments and their original-layout previews remain unchanged;
the step editor must not silently alter those attachments.

## Approved additional features - implemented locally

- [x] Link preview: show permitted target title/category and a short preview
  before navigating. Support keyboard focus and touch as well as mouse hover.
  Do not expose restricted cross-team guide content or metadata.
- [x] Guide-link health checks: warn about archived/deleted guide targets before
  submission for review. Treat temporary network errors as unknown availability,
  not proof that a guide is deleted. Missing access is not proof of deletion.
  External-document availability is separate from internal guide-link checks.
- [x] Specific-step links: target stable section/step IDs, not displayed
  numbering. Reordering or renaming must not break the target. If a step is
  removed, offer the guide with a clear message instead of a broken destination.
- [x] Semantic note/warning blocks: provide "Bemaerk" and "Vigtigt" blocks with
  localized labels/icons as well as color. Preserve the message in the plain-text
  projection and support the new content type throughout save/review/history.
- [x] Backlinks: show accessible guides that reference the current guide,
  useful when evaluating the impact of a change. Use guide IDs and scoped
  indexing/resolution; do not leak restricted guide titles or content.

All five features are implemented locally. Live native team/asset behavior
still needs user testing; this is not a release approval.

## Phase 2 - approved design

- [x] Document the approved workflow, content model, Hub-only scope,
  permissions, compatibility, and verification criteria.
- [x] Keep the approved scope in plans; do not commit without approval.
- [x] Review specification compliance using an available permitted reviewer; do not
  claim to use missing bundled prompts or unavailable named agents.
- [x] Obtain user approval of the design and authorization to continue the workflow.

## Phase 3 - local implementation

- [x] Load writing-plans after the design is approved.
- [x] Create a scoped implementation plan and verification criteria.
- [x] Obtain authorization to continue local implementation with Superpowers.
- [ ] Obtain separate authorization for any release activity.

### Implementation phase A - editor and content foundation

- [x] Add src/lib/guideRichText.test.ts, run the focused failing tests, then
  implement src/lib/guideRichText.ts with validated JSON, plain-text projection,
  safe typed links, supported styling, and bounded node/depth limits.
- [x] Add optional richContent to GuideStep in src/lib/guideTypes.ts. Each
  content payload records its derived plain-text baseline; if an older editor
  changes step.text, use the updated plain text instead of stale rich content.
- [x] Check the offline cache and install pinned Tiptap 3.31.4 after the user
  approved downloading the missing packages. No hand-built editor was used.
- [x] Add a compact src/components/GuideStepEditor.tsx using Tiptap and integrate
  it into GuideEditor.tsx without rewriting its autosave/review logic.
- [x] Add safe read-only rich-content rendering to GuideViewer.tsx while
  keeping original Word/PDF previews and exports unchanged.
- [x] Define validated rich-text/link data, legacy fallback, and mixed-version
  editing protections before touching shared guide content.
- [x] Implement the approved toolbar, guide/document/website link selection,
  and safe rendering with current access checks.
- [x] Preserve formatting and links in drafts, reviews, history, and restores.

### Implementation phase B - link navigation and checks

- [x] Add accessible guide-link previews and internal guide-link health checks.
- [x] Add stable section/step targets and graceful handling of removed steps.
- [x] Add a return path to the original guide after following a link.
- [x] Load granted foreign-team targets on demand through existing native readers,
  with account/home-team/latest-status/expiry checks and scoped attachment loaders.

### Implementation phase C - guidance and change impact

- [x] Add localized note/warning blocks without depending on color alone.
- [x] Add permission-filtered backlinks showing where a guide is referenced.

### Implementation phase D - verification

- [x] Verify save/reopen, undo/redo, paste, and selection preservation using
  extension tests and the isolated real-component browser workflow.
- [ ] Verify renames, reordered/removed steps, archived/deleted guides, access
  changes, and temporary network failures against the expected link behavior.
- [x] Verify scoped preview/backlink filtering and backend team/file access tests.
- [x] Verify DA/EN/FI labels, keyboard controls, mobile preview/editor fit,
  and long-guide responsiveness. Native touchscreen use remains a manual check.
- [x] Verify existing plain-text exports and original Word previews remain
  unchanged by the Hub-only feature scope.

Recommended implementation start: phase A. No phase authorizes a release.

## Recorded verification

- Frontend suite: 260 tests passed; one file skipped by its existing setup.
- Backend teamReadPolicy: 22 tests passed, including rejected/expired grants
  and access limited to the guide's referenced assets.
- TypeScript and local Vite build passed. CSS optimizer and large-chunk
  warnings remain; no packaging or release was performed.
- scripts/verify-guide-rich-text.cjs uses real local KV saves and version
  snapshots, real DOCX data, and the actual editor/viewer components.
- Browser checks passed for selection, formatting, links, notes, save/snapshot,
  previews, stable original-Word anchors, backlinks, Back, scoped file reading,
  mobile fit, and no browser errors. No test writes to the production share.
- 105-step typing: 3,985ms with all editors mounted; 755ms after mounting
  Tiptap only for the active step.
- Spec and quality reviews ran. Findings were reproduced with regression
  tests and repaired before validation was repeated.

## Manual follow-up

- [ ] Test native cross-team assets with real grants in the development window.
- [ ] Test permission revocation during an open session/multi-key download.
- [ ] Verify native cross-team backlinks after the on-demand catalogue loads.
- [ ] Authorize any release separately after user testing.

## Verification gates

- Focused domain tests first, with an observed failure before implementation.
- Existing guideStore and guide-related tests for persistence and fallback.
- TypeScript for the touched integration, then a local Vite build if UI changes.
- Real-component browser checks for formatting/link creation and save/reopen,
  using isolated local storage rather than writing production guides.
- Spec-compliance and quality review using actual available reviewers, followed
  by fresh validation of any repairs. Supporting prompt files are not bundled.
- Check requirements and report exactly which implementation phases remain.

## Editor field clarity - screenshot feedback

- [x] Restore visible labels for headings and step text, including nonempty fields.
- [x] Restore localized placeholders in inactive and active empty fields.
- [x] Use Hub theme surfaces instead of fixed white boxes; retain readable text.
- [x] Keep headings compact and distinguish them from multiline step text.
- [x] Verify light/dark, mobile/desktop, and existing editing behavior.
- [x] Reopen the development app gracefully; no release.

Field-clarity verification: TypeScript and 76 focused tests passed. Actual
appearance checks passed at 1440px and 390px in light/dark themes, including
active/inactive placeholders, readable fixed palette colors (contrast >=4.5),
compact headings and field bounds. Screenshots were inspected. The complete
editor/viewer local-storage workflow passed; a 105-step edit took 831ms.
Read-only scoped presentation review approved with no blocking findings.
The polished development window was reopened and confirmed responsive.

## Section-heading parity - approved extension

The user requested the same formatting and links in section headings.

- [x] Extend section data with optional headingRichContent and derived heading text.
- [x] Reuse the existing active-field editor for heading formatting/link controls.
- [x] Preserve heading formatting through draft/save/history and stale-client fallback.
- [x] Render safe formatted headings while keeping navigation/TOC/export plain text.
- [x] Include heading links in health checks, previews, navigation, and backlinks.
- [x] Run domain/renderer tests, real editor/viewer browser checks, and typecheck.
- [x] Restart the development window gracefully; no release or changes to 1.5.8.

Heading extension verification: the focused guide suite passed (85 tests before
the final inline-note spacing regression), and the final renderer suite passed
23 tests. The browser verified bold/color/size/guide links in headings, actual
local save/version snapshots, inline viewing, and native/ProseMirror selection
agreement. Ctrl+Home/End now commit explicit editor transactions to avoid the
post-focus native selection safeguard discarding intentional selections.
Final TypeScript validation passed, and the reopened native development window
was confirmed responsive. Heading scope review approved; its inline-note spacing
finding was reproduced and fixed with the passing 23-test renderer suite.