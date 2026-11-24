# Supply Chain Hub 1.5.8

## Baseline

- Release baseline: GitHub `v1.5.7`, merge commit `cbc4b1fee2f4aa168b2267eed50b25e66f503ff5`.
- Local workspace: `C:/TCD Tools/Supply Chain Hub/Supply-Chain-Hub 1.5.8` on `develop/1.5.8`.
- Do not edit the published `v1.5.7` tag, its release ZIP, or production M: storage when preparing this workspace.

## Phase 1 - prepare development

- [x] Create a separate worktree from the merged 1.5.7 tag.
- [x] Bump package and lockfile to 1.5.8.
- [x] Install dependencies and verify local typecheck, complete tests and production build.

## Phase 2 - prioritized follow-up

- [ ] Audit every app button and command across modules, roles and languages for immediate feedback, keyboard support, double-click safety, slow storage and errors.
- [ ] Design and test async offline replay without weakening account migration locks, operation order, conflict handling or pending-write recovery.
- [ ] Evaluate converter provisioning for authoring PCs while keeping original DOCX bytes and saved PDF previews unchanged.

## Phase 3 - future release gate

- [ ] Maintain a user-facing 1.5.8 changelog as real changes land.
- [ ] Run isolated native/frontend tests and packaged EXE login smoke with local temp storage before publishing a ZIP.
- [ ] Tag only the merged, tested commit; verify the GitHub asset hash against the local release ZIP.

Start with Phase 1. Do not invent changelog entries for work not yet implemented.

Baseline verification on 2026-09-23: `npm ci` installed 770 packages, TypeScript and Vite build passed, and 440 native plus 179 frontend tests passed with local real-DOCX samples enabled. npm blocked three dependency install scripts, but they did not prevent these checks. No 1.5.8 release package or tag has been created.