# Real Word guides: format and editing

## Phase 1 - inspect the actual documents

- [x] Locate the two full DOCX files in Downloads.
- [x] Measure original Word layout features against the current in-app preview.
- [x] Identify the smallest reliable preview and editing workflow for these files.

## Phase 2 - implement and verify

- [x] Preserve the exact DOCX when importing, downloading, replacing, and exporting.
- [x] Make the in-app guide view honest and usable for the real document layouts.
- [x] Add regression checks using the real files locally, without committing the files.
- [x] Run focused tests, typecheck, build, and a code review of the result.

## Phase 3 - leave a usable result

- [ ] Import both documents into the intended team through the app's authenticated review workflow.
- [ ] Verify published/review state, open the resulting guide and leave it available to the user.

The already uploaded "Quick Guide Foerste hjaelp Kemi (003)" is present in the
authenticated TCD guide library. Its original DOCX now opens as a three-page
inline PDF without changing the stored guide. The second document has not been
submitted. Import it through Guide Bibliotek with "Bevar original Word-layout"
and verify its review state before marking Phase 3 complete. A reviewer must
approve publication through the normal workflow.

## Phase 4 - inline page-faithful preview

- [x] Validate offline DOCX-to-PDF conversion against both supplied guides.
- [x] Verify PDF pages render inside the Electron window without downloading.
- [x] Generate and store a PDF preview on original-layout guide submission.
- [x] Show saved PDF previews inline; convert older DOCX guides locally on first open.
- [x] Cover real-file conversion, PDF storage, errors, and version restoration in tests.
- [x] Verify the chemical guide in-app and document converter setup for authors.

The authoring computer needs LibreOffice for local PDF generation. The PDF is
stored alongside the unmodified DOCX so readers of newly submitted guides do
not need LibreOffice. Older guides without a stored PDF still need LibreOffice
on the reading computer for local conversion. The tested portable installation
is under %LOCALAPPDATA%/TCD Hub/libreoffice; other authoring computers must
install or provision LibreOffice as described in README.md.
An approved cross-team reader can access the referenced preview PDF, but
unapproved readers cannot fetch its file chunks.
If PDF generation is unavailable, an original-layout submission must fail with
an explicit error instead of publishing a guide that cannot be viewed inline.

The configured M: directory is live shared storage. Do not seed it by writing raw KV
records or bypass the app's guide review permissions. The local file inspection is
read-only. Confirm the destination team before any live import if ambiguous.