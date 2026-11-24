# Supply Chain Hub 1.6.0 - lokal udvikling

Oprettet: 2026-10-02. Ingen release, installation eller publicering.

## Udgangspunkt

- Baseline: hele den aktuelle kildekode fra Supply-Chain-Hub 1.5.9 (som blev bygget til
  `Supply Chain Hub-1.5.9-win.zip`, SHA-256 `DA2051FAF7EA17FC8A6441993DCB8FCCC54E840765B89643889B2CA7763789B9`),
  inklusive ændrede, nye og slettede filer.
- Git-baseline: `eb99a96` ("Supply Chain Hub 1.5.9" på `develop/1.5.9`).
- Branch `develop/1.6.0` i en separat worktree. Intet er pushet.
- 1.5.9 er uændret og kan fortsat bruges/udvikles separat.
- dist, release og node_modules er ikke kopieret (node_modules installeret med `npm ci`).
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.

## Fase 1 - klargøring

- [x] Opret worktree `Supply-Chain-Hub 1.6.0`, og flyt den til 1.5.9-commit `eb99a96` på branch `develop/1.6.0`.
- [x] Kopier 1.140 aktuelle kildefiler fra 1.5.9 og verificer med SHA-256 (0 afvigelser); fjern de 5 filer der er slettet i 1.5.9.
- [x] Kontroller at git-status er identisk med 1.5.9 (141 ændringer) og at 1.5.9 er uændret.
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.0.
- [x] `npm ci` (npm blokerede install-scripts for @swc/core, electron-winstaller og esbuild — som ved 1.5.8, uden betydning for tests/build). Electron 44.0.0-runtime kopieret fra 1.5.9 (identisk version, hash verificeret).
- [x] Verifikation: TypeScript OK, vitest 668/668, Electron-tests 585/585, produktions-build OK, Electron-binær starter.

## Fase 2 - nye tiltag

- [ ] Aftal første tiltag og dets acceptkriterier.
- [ ] Implementer og test tiltaget i denne mappe (TDD).
- [ ] Registrer faktiske brugerrettede ændringer i `src/lib/changelog.ts` under 1.6.0 — kun for ting der faktisk er lavet.

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal push af `develop/1.5.9` og `develop/1.6.0`, PR og release-tag, når det er relevant.
- [ ] Aftal separat releaseforløb (`npm run electron:build`, `node scripts/verify-packaged-release.cjs release/win-unpacked`, SHA-256).

## Backlog (brugeren vil igennem alle – rækkefølge aftales)

- [ ] Hubert: åbne punkter – sammenligninger ("sammenlign i dag med i går"), enkeltord som "ferie"/"vagtplan" viser i dag/denne uge i stedet for at spørge efter dato, teamets vagter i overblikket (se plans/hubert-trainer.md).
- [ ] Hubert: afprøv og finjustér AI-formuleringen af lange guide-procedurer med den lokale model; enkelt nøgleord ("isopropyl") går til samlet søgning (se plans/hubert-guides.md).
- [ ] Ny funktion i hubben (aftales).
- [ ] Gennemgang af hele appen: knapper, roller og fejlsituationer i alle moduler (åbent punkt fra 1.5.8-planen).

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.5.9, som kører på 5019):

```powershell
npm run dev -- --host 127.0.0.1 --port 5020 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5020'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
