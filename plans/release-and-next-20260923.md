# 1.5.7 release and 1.5.8 preparation

## Phase 1 - validate source and artifact
- [x] Check changelog, remote main and complete release scope; exclude generated local preview assets.
- [x] Run tests, build 1.5.7 Windows ZIP, verify version, exe, asar and checksum, and smoke-test the packaged EXE with isolated storage.

## Phase 2 - GitHub delivery
- [ ] Commit and push 1.5.7 source on release branch; open PR to main.
- [ ] Merge only after checks and no conflicting changes; tag merged commit and publish GitHub release with verified ZIP.

## Phase 3 - prepare next version locally
- [ ] Prepare C: folder and development branch for 1.5.8 from merged 1.5.7.
- [ ] Bump package version and lockfile, add fresh 1.5.8 plan, check source and report URLs and paths.

Do not publish the in-app update to M: during this workflow. Start with Phase 1.

The 20:54 ZIP is NOT release-ready: `electron/openWordGuide.cjs` requires `jszip`, but the old ASAR excluded all `node_modules`. Packaging now includes production dependencies. Run `node scripts/verify-packaged-release.cjs <win-unpacked path>` against a fresh build before replacing the ZIP or creating a PR/release. The old `release/win-unpacked` has running crashed processes holding Windows file locks; package in a clean isolated output directory until a verified candidate exists.

Resolved: `package.json` now includes production dependencies in the ASAR and explicitly declares the smoke tools as dev dependencies. The candidate ASAR has 32942 entries, including `node_modules/jszip/lib/index.js`; the packaged EXE showed login using isolated C: storage, first from Temp and then at `release/win-unpacked`. The 86-entry ZIP at `release/Supply Chain Hub-1.5.7-win.zip` is 201751450 bytes with SHA-256 `4B44E64BA6CA99CD66148CC215C03836230913E3440F26EFC3568F1DE4A5B03C`; its embedded ASAR hash matches the smoke-tested one. Broken old release files are preserved under `%LOCALAPPDATA%/Temp/sch-157-broken-20260923`. Do not publish a GitHub release before the PR is merged.