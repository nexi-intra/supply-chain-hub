# Supply Chain Hub 1.6.8 - lokal udvikling

Oprettet: 2026-11-18. Ingen build, release eller push.

## Udgangspunkt

- Baseline: `develop/1.6.7` ved commit `e0b4660` (sidste lokale 1.6.7-build i `release-local-2`, 08.11 kl. 21:40).
- Git: repo `C:\Supply Chain Tools\Supply Chain Hub\supply-chain-hub-github` (klon af `nexi-intra/supply-chain-hub`). Denne mappe er worktree på `develop/1.6.8`. `Supply-Chain-Hub 1.6.7` er worktree på `develop/1.6.7` og forbliver uændret.
- Ikke-versionerede dele kopieret fra 1.6.7: `node_modules`, `dist/translation` (neural oversættelse i dev) og `.superpowers`. Ikke kopieret: `release/`, `release-local/`, `release-local-2/` og resten af `dist/`.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.
- Kun én instans pr. brugerprofil (single-instance lock siden 1.6.6). Kører den udgivne app med samme profil, fokuserer dev-starten bare den. Brug `TCD_HUB_USER_DATA_DIR` til en separat dev-profil.
- Intet nyt dataformat på M: uden en plan for, at 1.6.7 og 1.6.8 kører side om side på de samme filer.
- Diagnose: `%APPDATA%\tcd-hub\logs\main.log` (+ `main.1.log`) og lokale crash-dumps i `%APPDATA%\tcd-hub\Crashpad`.
- Tip: `npm.ps1` er blokeret af execution policy. Brug `npm.cmd` (fx `npm.cmd test`).

## Fase 1 - klargøring

- [x] Worktree `Supply-Chain-Hub 1.6.8` på ny gren `develop/1.6.8` fra `develop/1.6.7`.
- [x] Kopiér `node_modules`, `dist/translation` og `.superpowers` fra 1.6.7 (filantal kontrolleret: 62.325 / 3 / 105).
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.8 (`npm.cmd version 1.6.8 --no-git-tag-version`).
- [x] Verifikation: tsc og testsuite. Se commit-beskrivelsen.
- [x] Commit "Prepare development for version 1.6.8" (lokalt).

## Fase 2 - nye tiltag

- [x] Optælling: admin-adgang, ens tal på alle klienter og notifikationer i hubben. Se `plans/optaelling-admin-sync-notifikationer-plan.md`.
- [ ] Optælling: værdi ud fra indkøbsværdi (parkeret, mangler et eksempel på et materiale med forkert værdi). Se samme plan, fase 5.
- [x] Registrer brugerrettede ændringer i `src/lib/changelog.ts` under en ny 1.6.8-post, kun for ting der faktisk er lavet.

## Fase 3 - senere, kun efter godkendelse

- [ ] Releasebuild 1.6.8: `npm.cmd run electron:build` og `node scripts/verify-packaged-release.cjs release/win-unpacked`.
- [ ] Udgiv zip'en (brugerens trin).
- [ ] Aftal push af `develop/1.6.5` til `develop/1.6.8`, PR og release-tags, når det er relevant.

## Backlog

- Overtaget fra 1.6.7: overvej øvrige skjulte standardgenveje (Ctrl+R / Ctrl+Shift+R genindlæser og smider ikke-gemt formulardata væk; Ctrl+M minimerer).
- IT-sag (ikke kode): filserveren `\\VM-MSDK-2` er periodisk 5 til 9 s om at OPRETTE nye filer (målt 05.11). Undtag `...\ai Tools\Supply Chain Hub Storage\` (`*.lock`, `*.tmp`, `*.json`) fra on-access-scanning. Se `plans/responsiv-app.md`.
- Følg op på `logs\main.log` hos brugere, der har oplevet nedbrud eller "Svarer ikke".
- Valgfrit (arkitektur): lille realtime-backend til multiplayer i stedet for SMB-filshare. Se `plans/multiplayer-hastighed.md` fase 3.
- M:-performance mulighed 2: ændrings-markør pr. mappe / opdeling af `multiplayer-index`. Se `plans/m-drev-performance-design.md`.
- Ældre backlog: `plans/development-1.6.7.md` og `plans/development-1.6.5.md`.

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.7):

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5069 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5069'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.
