# PDF startup repair - 1.5.9

Local development only. Preserve 1.5.8. No release or shared-data changes.

## Phase 1 - frontend imports

- [x] Identify mixed LibreOffice and Microsoft Word conversion code.
- [x] Use the existing Word PDF error messages in both guide components.
- [x] Validate TypeScript.

## Phase 2 - conversion and startup

- [x] Align the converter with the existing Word helper and converter tests.
- [x] Remove obsolete activation wiring while preserving actual PDF previews.
- [x] Run focused converter tests and startup validation.

## Phase 3 - development preview

- [x] Open 1.5.9 in Electron against the local development server.
- [x] Confirm an application window and report remaining limitations.

Start with phase 1, then verify each following phase locally.

## Verified results

- TypeScript and Electron main/preload syntax checks passed.
- Seven focused converter tests passed.
- Actual Microsoft Word conversion: 8,521 DOCX bytes to 39,220 PDF bytes.
- Input bytes remained unchanged; conversion used temporary local files.
- Electron opened a responsive Supply Chain Hub window using port 5019.
- PDF conversion requires a local Microsoft Word installation.
- No release, installation, commit, or change to 1.5.8 was made.