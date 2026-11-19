# Supply Chain Hub 1.6.7 - lokal udvikling

Oprettet: 2026-11-06. Ingen build, release eller push.

## Udgangspunkt

- Baseline: `develop/1.6.6` ved release-commit `e48dc38` (1.6.6 er udgivet 06.11).
- Git: repo `C:\Supply Chain Tools\Supply Chain Hub\supply-chain-hub-github` (klon af `nexi-intra/supply-chain-hub`). Denne mappe er worktree på `develop/1.6.7`; `Supply-Chain-Hub 1.6.6` er worktree på `develop/1.6.6` og forbliver uændret.
- Ikke-versionerede dele kopieret fra 1.6.6: `node_modules`, `dist/translation` (neural oversættelse i dev) og `.superpowers`. Ikke kopieret: `release/` og resten af `dist/`.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.
- Kun én instans pr. brugerprofil (single-instance lock siden 1.6.6): kører den udgivne app med samme profil, fokuserer dev-starten bare den. Brug `TCD_HUB_USER_DATA_DIR` til en separat dev-profil.
- Diagnose siden 1.6.6: `%APPDATA%\tcd-hub\logs\main.log` (+ `main.1.log`) og lokale crash-dumps i `%APPDATA%\tcd-hub\Crashpad`.

## Fase 1 - klargøring

- [x] Worktree `Supply-Chain-Hub 1.6.7` på ny gren `develop/1.6.7` fra `develop/1.6.6`.
- [x] Kopiér `node_modules`, `dist/translation` og `.superpowers` fra 1.6.6.
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.7.
- [x] Commit "Prepare development for version 1.6.7" (lokalt).
- [x] Verifikation: se commit-beskrivelsen. `electron/assistantWorker.test.cjs` ("actual subprocess RPC …") er stadig ustabil – timeout på 30 s under fuld belastning, består alene.
- Tip: `npm.ps1` er blokeret af execution policy – brug `npm.cmd` (fx `npm.cmd test`).

## Fase 2 - nye tiltag

- [ ] Aftal næste tiltag fra backloggen.
- [x] M:-performance (fase 1–4): se `plans/m-drev-performance-plan.md`. Brugerrettet changelog registreret under 1.6.7.
- [x] Registrer brugerrettede ændringer i `src/lib/changelog.ts` under 1.6.7 — kun for ting der faktisk er lavet.

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal push af `develop/1.6.5`, `develop/1.6.6` og `develop/1.6.7`, PR og release-tags, når det er relevant.
- [x] Releasebuild 1.6.7 (07.11, fra commit `1145e8b`): `npm.cmd run electron:build` → `release/Supply Chain Hub-1.6.7-win.zip` (241.087.675 bytes), `node scripts/verify-packaged-release.cjs release/win-unpacked` bestået ved 2. kørsel (1. kørsel: "Packaged app exited with 0" uden output – forbigående; login, Word→PDF, 40.493 ASAR-filer), app.asar i zip = verificeret win-unpacked, exe 1.6.7. SHA-256 `246BEAE97A3BB4912DFBB3C8576DD3581BA2CDEFE6B171AD16D57C1CBFE4B8F6`. Før build: tsc 0 fejl, node-tests 1464/1465 (kun kendt ustabil assistantWorker-timeout), vitest 1525/1526 (pdfImporter-timeout under belastning, 8/8 alene).
- [ ] Udgiv zip'en (brugerens trin) og aftal push/tag af `develop/1.6.7`.

## Backlog

- Overtaget fra 1.6.6: overvej øvrige skjulte standardgenveje (Ctrl+R / Ctrl+Shift+R genindlæser og smider ikke-gemt formulardata væk; Ctrl+M minimerer).
- IT-sag (ikke kode): filserveren `\\VM-MSDK-2` er periodisk 5-9 s om at OPRETTE nye filer (målt 05.11). Undtag `...\ai Tools\Supply Chain Hub Storage\` (`*.lock`, `*.tmp`, `*.json`) fra on-access-scanning. Se `plans/responsiv-app.md`.
- Følg op på `logs\main.log` hos brugere, der har oplevet nedbrud eller "Svarer ikke" i 1.6.6.
- Valgfrit (arkitektur): lille realtime-backend til multiplayer i stedet for SMB-filshare – se `plans/multiplayer-hastighed.md` fase 3.
- M:-performance mulighed 2: ændrings-markør pr. mappe / opdeling af `multiplayer-index` – se `plans/m-drev-performance-design.md`.
- Ældre backlog: `plans/development-1.6.5.md`.

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.6):

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5068 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5068'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.
