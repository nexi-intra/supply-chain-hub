# Supply Chain Hub 1.6.6 - lokal udvikling

Oprettet: 2026-11-05. Ingen build, release eller push.

## Udgangspunkt

- Baseline: mappekopi af `Supply-Chain-Hub 1.6.5` (uden `release/` og `dist/`; `dist/translation` er kopieret med, så neural oversættelse virker i dev).
- 1.6.5 er uændret og kan bruges separat.
- Git (genetableret 2026-11-05): repo `C:\Supply Chain Tools\Supply Chain Hub\supply-chain-hub-github` (klon af `nexi-intra/supply-chain-hub`). Denne mappe er worktree på `develop/1.6.6`; `Supply-Chain-Hub 1.6.5` er worktree på `develop/1.6.5`.
- Det gamle lokale repo (`C:\TCD Tools\...`) med historikken for 1.6.0–1.6.5 er tabt og blev aldrig pushet. `develop/1.6.5` er derfor ét snapshot-commit (`906f855`) oven på `origin/develop/1.5.7`. Den detaljerede historik for 1.6.5-arbejdet (02.–04.11) ligger i `C:\Supply Chain Tools\.hub-shadow.git`.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.

## Fase 1 - klargøring

- [x] Kopiér `Supply-Chain-Hub 1.6.5` til `Supply-Chain-Hub 1.6.6` (inkl. `node_modules`).
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.6.
- [x] Afklar git: klon `nexi-intra/supply-chain-hub`, snapshot-commit af 1.6.5 på `develop/1.6.5`, worktree `develop/1.6.6` fra `develop/1.6.5`.
- [x] Commit "Prepare development for version 1.6.6" (lokalt).
- [x] Verifikation (05.11): tsc 0 fejl, node-tests 1369/1369, vitest 1486 grønne (1 skipped). Bemærk: `electron/assistantWorker.test.cjs` ("actual subprocess RPC …") er ustabil – timeout på 30 s under belastning, består ved genkørsel.
- Tip: `npm.ps1` er blokeret af execution policy – brug `npm.cmd` (fx `npm.cmd test`).

## Fase 2 - nye tiltag

- [ ] Aftal næste tiltag fra backloggen.
- [x] Placeringer: Tegning af lageret – Fase 2 "Kort over lageret" (kort for alle, reolen forfra med materiale, søgning med ældste palle, "Vis på kort") – design `plans/lager-kort-design.md` (godkendt 05.11), plan `plans/lager-kort-plan.md`. (Task 1–6 lokalt committet 05.11; E2E `scripts/verify-layout.cjs` grøn)
- [x] Placeringer: Tegning af lageret – Fase 3 (kortet i "Sæt palle på plads": lille kort + reolen forfra for den valgte plads, "Vis" ved forslag) – design `plans/lager-kort-fase3-design.md` (godkendt 05.11), plan `plans/lager-kort-fase3-plan.md`. (Task 1–4 lokalt committet 05.11; E2E `scripts/verify-layout.cjs` grøn)
- [ ] Overvej: øvrige skjulte standardgenveje (Ctrl+R / Ctrl+Shift+R genindlæser og smider ikke-gemt formulardata væk; Ctrl+M minimerer).
- [ ] Registrer brugerrettede ændringer i `src/lib/changelog.ts` under 1.6.6 — kun for ting der faktisk er lavet. (Kort over lageret registreret 05.11)

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal push af `develop/1.6.5` og `develop/1.6.6`, PR og release-tag, når det er relevant.
- [ ] Aftal separat releaseforløb (`npm run electron:build`, `node scripts/verify-packaged-release.cjs release/win-unpacked`, SHA-256).

## Backlog

Se backloggen i `plans/development-1.6.5.md` (overtaget uændret).

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.5):

```powershell
npm run dev -- --host 127.0.0.1 --port 5067 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5067'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.
