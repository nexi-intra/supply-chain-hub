## Supply Chain Hub 1.5.7

Brings together the 1.5.7 design, storage responsiveness, guide previews, vacation review and Arcade improvements.

- Original Word guides render as inline PDF in Electron while retaining their DOCX for editing. Authors need local LibreOffice; saved PDF previews do not require LibreOffice for readers.
- Shared M: reads and background work are reduced; common create/save flows give visible feedback and block repeated submissions.
- Arcade menus, scores and game start prompts follow light/dark themes. All five games wait for Space or a deliberate click; sticky-paddle catches no longer reopen the start prompt.
- Vacation previews are larger and usable at narrow widths. Access to guide PDF attachments follows the same cross-team authorization as the guide.
- Packaged runtime includes production dependencies. A new packaged-EXE smoke gate checks that the real login opens with isolated storage before releasing a ZIP.

Validation: 440 native tests, 179 frontend tests, TypeScript/Vite production build and isolated Electron auth smoke. The packaged 1.5.7 ZIP must also pass `scripts/verify-packaged-release.cjs` before merge or GitHub Release. No in-app updater package has been published to M: as part of this PR.