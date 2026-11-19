# Knowledge Base

## Requirements

- Separate knowledge module next to Guide Library in Supply Chain Hub 1.6.0.
- Module name: Knowledge Base (English).
- Upload PDF and Word documents and create knowledge articles manually.
- Reuse the established Guide Library experience where appropriate.
- Use a distinct existing-library icon not used by another module.
- Keep Game Corner in its existing location and preserve its contents.
- Reference content: Baxi LocalMode transaction result handling, version 1.2.
- No release builds, commits, production-data writes, or Hubert training rounds.

- Same access model as Guide Library: own team, cross-team access requests
  approved by managers, and multi-team sharing.
- Same translator as Guide Library (da/en/fi/sv) for knowledge articles.

## Approved design

- **Approach:** parameterise the existing Guide Library stack with a library kind
  (`guides` | `knowledge`) instead of copying ~5,000 lines. Each kind has its own
  storage keys, labels and access grants; behaviour (editor, viewer, drafts,
  versions, review, archive, sharing, translator) stays identical.
- **Storage (per team unless noted):**

  | Purpose | Guides (unchanged) | Knowledge Base |
  |---|---|---|
  | Items | `guides` | `knowledge-articles` |
  | Multi-team shared (platform `_shared/`) | `shared-guides` | `shared-knowledge-articles` |
  | Categories | `categories` | `knowledge-categories` |
  | Review requests | `guide-review-requests` | `knowledge-review-requests` |
  | Archive | `archived-guides` | `archived-knowledge-articles` |
  | Cross-team access requests | `guide-access-requests` | `knowledge-access-requests` |
  | Versions / drafts | `guide-versions-{id}` / `guide-draft-{id}` | `knowledge-versions-{id}` / `knowledge-draft-{id}` |
  | Reviewers | `guide-admin-emails` | same list (no new admin role) |

- **Security:** cross-team reads stay enforced in Electron (`teamReadPolicy.cjs`):
  other teams only receive title/category metadata until a manager approves an
  access request; files are only readable when owned by a granted article.
- **Documents:** Word (.docx) uses the existing importer (editable sections or
  original layout). PDF is new: stored as the original via `fileStorage.uploadPdf`
  and shown with the existing PDF file view; its text is extracted into sections
  so search and the translator work.
- **Hub:** tile `Knowledge Base` directly after Guide Library, own icon `Brain`
  (unused by other modules) and its own colour. Game Corner keeps its tile/place.
- **Hubert (required, user: "uhyre vigtigt"):** Hubert must read and understand
  knowledge articles with the same permission rules as guides (own team, shared,
  approved cross-team grants only) and cite them as sources. No new training rounds;
  covered by focused regression tests in Phase 6.
- **Out of scope now:** observer access views, release build.
- **Default categories:** `Payments & Terminals`, `Error Codes`, `Integrations`,
  `Processes`, `General`.

## Phase 1: Discovery and design approval

- [x] Locate Guide Library, import manager, and Hub navigation.
- [x] Establish that guides use separate team/shared storage and review workflows.
- [x] Confirm knowledge visibility and author/editor permissions.
- [x] Approve module design, import behaviour and translator reuse.

## Phase 2: Library configuration and secure storage (Electron)

- [x] RED: `src/lib/libraryConfig.test.ts` - guides keys unchanged, knowledge keys
      distinct and non-overlapping (+ parity with `electron/libraryKeys.cjs`).
- [x] Create `src/lib/libraryConfig.ts` (`LibraryKind`, `LIBRARY_KEYS`) and
      `electron/libraryKeys.cjs` (single Electron source, `libraryKeys.test.cjs`).
- [x] RED: `electron/teamReadPolicy.test.cjs` - knowledge articles from another team
      return metadata only; approved, unexpired `knowledge-access-requests` grant
      content; files only for granted articles; guide grants do not unlock knowledge.
- [x] Generalise `teamReadPolicy.cjs` (`guides()`, `ownsFile`, `submitRequest`) per kind.
- [x] Add `shared-knowledge-articles` to `SHARED_KV_KEYS` in `main.cjs` and `SHARED`
      in `assistantWorker.cjs` (both now use `PLATFORM_SHARED_KV_KEYS`).
- [x] IPC `registry:submit-knowledge-access-request` in `main.cjs`, `preload.cjs`,
      `securedIpc.cjs` `IDENTITY_WRITES`, renderer type declarations.
- [x] Account migration covers the new keys (generic migration already handled them;
      regression assertions added in `accountService.test.cjs`, green without code change).

Phase 2 result: 108/108 focused electron, 3/3 vitest, tsc 0; full electron 730/738 -
the 8 failures are the pre-existing Hubert round-8 bank/security tests (unchanged).

## Phase 3: Parameterise the Guide Library stack

- [x] `guideStore.ts`: version/draft key helpers take a kind (guides default); RED/GREEN
      test in `guideStore.test.ts`.
- [x] `GuideLibrary.tsx` -> accepts `kind` (wraps `LibraryProvider`); all KV keys from
      `LIBRARY_KEYS`, kind-specific access-request IPC, default categories and `Brain` icon.
- [x] `GuideEditor`, `GuideViewer`, `GuideCard`, `GuideReviewDashboard`, `GuideStepEditor`,
      `GuideLinkPreview`, `CategoryManager`: `useLibraryLanguage()` from
      `src/contexts/LibraryContext.tsx` (labels, keys, `kind`).
- [x] `guideImportManager` + `GuideImportStatus`: job/draft/completion carry the kind;
      "Open library" navigates to the right library. `guideExporter`: own export-folder
      setting per kind (`knowledge-library-settings`).
- [x] Labels: instead of ~350 duplicated strings, `src/lib/libraryTerms.ts` adapts the
      shared library wording per language (da vidensartikel, en article, sv artikel,
      fi artikkeli incl. inflections; library name `Knowledge Base` in all languages).
      `libraryTerms.test.ts` proves no guide wording remains in the library namespaces.
- [x] Translator: the viewer's existing translate flow used unchanged.
- [x] Regression: existing Guide Library keys unchanged (guides is the default everywhere).

Phase 3 result: tsc 0; full vitest 1051/1054 passed, 1 skipped. Failures: pre-existing
Mother Hen test, and a Route Runner autoplay timeout under full-suite load (passes 2/2
in isolation; game code untouched). Not visible in the app until Phase 5 registers it.

## Phase 4: PDF import

- [x] Add dependency `pdfjs-dist` 6.4.299 (exact). Runs in-process via the legacy
      worker module (`globalThis.pdfjsWorker`) - no worker URL, no CDN, works under
      file:// and in Node tests. v6 no longer uses eval/new Function in the worker.
- [x] RED: `src/lib/pdfImporter.test.ts` - pure parser on a Baxi-like layout (running
      header/page numbers removed, larger text -> headings, wrapped paragraphs joined,
      table rows `a | b | c` incl. wrapped cells and rows across pages) and a real
      generated PDF; non-PDF, wrong extension and text-less (scanned) PDFs rejected with
      clear localized messages and nothing stored.
- [x] Implement `src/lib/pdfImporter.ts` -> `GuideImportDraft` with `originalPdf`
      (stored via `fileStorage.uploadPdf`, validated `%PDF-`).
- [x] New article fields `originalPdfUrl`/`originalPdfName` (Guide, version snapshot,
      draft) - kept separate from the Word attachment logic. Electron `ownsFile` serves
      the original PDF only with an approved grant (RED/GREEN in teamReadPolicy.test.cjs).
- [x] Knowledge Base import dialog: Word (editable / original layout) or PDF; input
      accepts `.pdf` only in PDF mode; import manager routes `.pdf` to the PDF importer.
- [x] Editor: shows original PDF (download / remove), kept in drafts and versions,
      removed again if a fresh import is cancelled.
- [x] Viewer: "Text" / "Original PDF" tabs (text default -> translator and search work),
      download original PDF; cross-team reads use the same fileLoader/grant path.
- [x] Labels for the new UI in da/en/fi/sv.

Phase 4 result: tsc 0; vitest 1060/1062 (1 skipped; only the pre-existing Mother Hen
failure); electron 731/739 (only the 8 pre-existing Hubert round-8 failures).

## Phase 5: Module registration and manager tools

- [x] RED: `appNavigation.test.ts` - App click handler opens `knowledge` and `games`;
      Hub tiles parsed from source: `knowledge` directly after `guides`, available,
      icon `Brain`, all module icons unique, Game Corner unchanged (`GameController`).
- [x] `App.tsx` view `knowledge` (same lazy `GuideLibrary` with `kind="knowledge"`),
      `appNavigation.ts`, `Hub.tsx` tile (own colour), `CommandPalette.tsx` entry;
      import toast "Open library" navigates to the importing library.
- [x] `ManagerPanel.tsx`: Knowledge Base access requests next to guide requests in the
      access tab (combined badge); approve/reject via `src/lib/libraryAccess.ts`
      (RED/GREEN `libraryAccess.test.ts`; guide behaviour unchanged: 2-day approval).
- [x] Hub review badge for pending knowledge reviews (same reviewers as guides).
- [x] Hub labels `hub.modules.knowledge` / `hub.descriptions.knowledge` and manager
      labels in da/en/fi/sv.

Phase 5 result: tsc 0; vitest 1067/1069 (1 skipped; only the pre-existing Mother Hen
failure). Vite compiles all changed modules incl. pdf.js; dev Electron restarted with
the new main process and is running against :5020.

## Phase 6: Hubert reads knowledge articles

- [x] RED/GREEN: `assistantKnowledgeBase.test.cjs` / `assistantWorker.test.cjs` - a question
      about an own-team knowledge article (e.g. a synthetic "rejection reason 2:1")
      is answered from the article with source; other-team content without an
      approved, unexpired grant never leaks; shared articles only for listed teams.
- [x] `assistantContext.cjs`: shared `guidesFor(principal, { library })` covers both
      libraries with separate item/shared/access keys and rechecks file ownership.
- [x] `assistantKnowledge.cjs`: module `knowledge` with chunking of sections/steps,
      catalog labels (da/en/fi/sv), view `knowledge` for source links.
- [x] `assistantWorker.cjs` cache and `main.cjs` change broadcast include knowledge keys.
- [x] `assistantAppGuide.cjs` + I18n: how to use the Knowledge Base (create, import,
      request access); `assistantNextStep.cjs` mapping.
- [x] `HubAssistant.tsx`: source links pass their library to article/file IPC and
      wrap the viewer in the matching `LibraryProvider` (RED/GREEN navigation tests).
- [x] PDF/Word attachments are readable only when referenced by the authorized
      article; unrelated files and HTML content types are rejected.
- [x] Preserve result codes such as `2:1` through document ranking and concise
      fallback presentation; regression includes a PDF-imported layout and `2:10`.

Phase 6 status, 2026-10-06: existing implementation was partly complete before this
session. Completed renderer library routing, four-language module help, catalog
recognition, authorized document loading, and exact result-code retrieval/fallback.
105 context/knowledge regressions and 21 answer/article regressions passed; the
isolated Electron app answers `2:1` from a real imported PDF with its article source.

## Phase 7: Verification

- [x] Run `tsc -b`, full Vitest, electron `node --test` (note pre-existing reds:
      Mother Hen test and Hubert round-8 bank are unrelated and stay visible).
- [x] Dev app: create a manual article, import a .docx and a PDF (synthetic or the
      Baxi example into a temp data folder), translate, request/grant cross-team access,
      ask Hubert about the article content.
- [x] Confirm Guide Library keys/navigation and Game Corner location via regression
      tests; all dev runs use temp storage/profile, with no production-data writes.

### Verified in the isolated dev app

- [x] Open Knowledge Base with article-specific labels.
- [x] Create a manual article, submit it, claim the review, and publish it via UI.
- [x] Import a real generated .docx and publish its editable content via UI.
- [x] Import a real generated PDF, preserve its original, and publish extracted text.
- [x] Ask Hubert about rejection reason `2:1`; receive the correct explanation and
      a Knowledge Base source via real assistant IPC.
- [x] Expand Hubert's Sources disclosure, open the article source, and verify the
      original PDF and translated text in the viewer. (verify-knowledge-base.cjs 8/8, 2026-10-07)
- [ ] Complete request/approval/revocation through the cross-team UI (backend
      permission/grant/expiry tests pass; E2E covers the real IPC request/approval/revocation).

Verification tool: `scripts/verify-knowledge-base.cjs`, using real Electron, KV,
document import and review workflow. It writes only to an OS temp folder and closes
its own Electron instance gracefully. The last run stopped because Sources was
collapsed before the source-click selector; remaining UI checks are NOT complete.
Last evidence folder: `%TEMP%/hub-knowledge-UHN8R5`.

Latest renderer result: 1070 passed, 1 skipped, 2 failed (Mother Hen assertion and
Route Runner autoplay timeout, unrelated game files unchanged). Knowledge Base
focused renderer checks: 63/63 passed. TypeScript: clean.
Final full Electron result: 744/755, 11 failures confined to the existing
`assistantTraining.test.cjs` banks/security log checks (unchanged by this work).
No builds, releases, commits, or production-data writes.

Next: finish the remaining Phase 7 viewer/translation/access UI verification.