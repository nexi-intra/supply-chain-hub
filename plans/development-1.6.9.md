# Supply Chain Hub 1.6.9 - lokal udvikling

Oprettet: 2026-11-24. Ingen build, release eller push uden godkendelse.

## Udgangspunkt

- Baseline: `develop/1.6.8` ved commit `f470c58` (1.6.8 er udgivet på GitHub fra `740a762`, tag `v1.6.8`).
- Git: repo `C:\Supply Chain Tools\Supply Chain Hub\supply-chain-hub-github` (klon af `nexi-intra/supply-chain-hub`). Denne mappe er worktree på `develop/1.6.9`. `Supply-Chain-Hub 1.6.8` er worktree på `develop/1.6.8` og forbliver uændret.
- Ikke-versionerede dele kopieret fra 1.6.8: `node_modules`, `dist/translation` (neural oversættelse i dev) og `.superpowers`. Ikke kopieret: `release/` og resten af `dist/`.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø. Brug lokale kopier af M:-data til tests (se `plans/arbejdsvaerktoejer-gennemgang.md` i 1.6.8).
- Kun én instans pr. brugerprofil. Brug `TCD_HUB_USER_DATA_DIR` til en separat dev-profil, fx `%APPDATA%\tcd-hub-dev-169`.
- Intet nyt dataformat på M: uden en plan for, at 1.6.8 og 1.6.9 kører side om side på de samme filer.
- Diagnose: `%APPDATA%\tcd-hub\logs\main.log` (+ `main.1.log`) og lokale crash-dumps i `%APPDATA%\tcd-hub\Crashpad`.
- Tip: `npm.ps1` er blokeret af execution policy. Brug `npm.cmd` (fx `npm.cmd test`).

## Fase 1 - klargøring

- [x] Worktree `Supply-Chain-Hub 1.6.9` på ny gren `develop/1.6.9` fra `develop/1.6.8`.
- [x] Kopiér `node_modules`, `dist/translation` og `.superpowers` fra 1.6.8 (filantal kontrolleret: 62.325 / 3 / 334).
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.9 (`npm.cmd version 1.6.9 --no-git-tag-version`).
- [x] Commit "Prepare development for version 1.6.9" (lokalt).

## Fase 2 - sikkerhedsopdateringer af pakker (Dependabot)

Udgangspunkt 24.11: `npm audit` viser 31 sårbarheder (13 høje, 17 mellem, 1 lav, 0 kritiske). GitHub viser 50 på `main`, som har en ældre pakkeliste.

- [x] Electron 44.0.0 → 44.11.5 (mindst 44.9.1 for den høje advisory om eMudhra certifikater).
- [x] Vite 7.3.2 → 7.3.8 (mindst 7.3.7, launch-editor og `server.fs`).
- [x] Zod 4.4.3 → 4.6.7 (hukommelsesforbrug ved store samlinger).
- [x] Opdater de faste `overrides` i package.json, som selv er blevet sårbare: `postcss` 8.5.10 → 8.5.33, eslints `minimatch` 3.1.3 → 3.1.5. Overriden af typescript-estree's `minimatch` er fjernet, fordi typescript-eslint 8.74.0 selv bruger minimatch 11.
- [x] `npm audit fix` uden `--force` for de transitive pakker (brace-expansion, js-yaml, nanoid, flatted, fast-uri, undici, xmldom, source-map-js, esbuild, vitest m.fl.). eslint 9.39.1 → 9.39.5 for ajv 6.14.
- [x] Vurder resten, hvor npm kun foreslår en nedgradering. Løst uden nedgradering: `"minimatch@>=7.0.0 <11.0.1": "11.0.9"` (bruges kun af electron-builder ved build, samme API) og `exceljs` → `uuid` 11.1.1 (exceljs bruger kun `v4`).
- [x] Verifikation: tsc 0 fejl, node-tests 2268/2270 (1 skip, kun den kendte assistantWorker-timeout under fuld belastning, 18/18 alene), vitest 1796 bestået (1 skip), `npm.cmd run electron:build` bestået med Electron 44.11.5, Word→PDF fra den pakkede app.asar bestået.
- [x] `verify-packaged-release` bestået med 1.6.8 lukket: login åbner i den pakkede 1.6.9 (40.553 ASAR-filer), Word→PDF bestået. Bemærk: den pakkede app bruger altid `%APPDATA%\tcd-hub`, så testen lukker straks med kode 0, hvis Supply Chain Hub kører på samme PC (single-instance lås).
- [ ] Start dev-vinduet og kontroller login, forsiden og et Optælling-dokument på en lokal kopi.
- [x] Commit med før/efter tal fra `npm audit`: 31 (13 høje, 17 mellem, 1 lav) → 0.

Bemærk: eslint 9 er markeret som ikke længere understøttet (eslint 10 findes). Projektet har ingen `eslint.config.js`, så `npm run lint` har aldrig virket. Ikke en del af denne opgave.

## Fase 3 - nye tiltag

- [ ] Guides og Knowledge Library: zoom i en åben guide. Se `plans/guide-zoom-design.md` og `plans/guide-zoom-plan.md`.
- [ ] Registrer brugerrettede ændringer i `src/lib/changelog.ts` under en ny 1.6.9-post, kun for ting der faktisk er lavet.

## Fase 4 - senere, kun efter godkendelse

- [ ] Releasebuild 1.6.9.
- [ ] GitHub-release og push af `develop/1.6.9`, `release/1.6.9` og tag `v1.6.9`.
- [ ] Udgiv zip'en på opdateringsdrevet på M: (brugerens trin).

## Backlog

- Overtaget fra 1.6.8:
  - 3.11/3.12 i `plans/arbejdsvaerktoejer-gennemgang.md`, når alle PC'er kører 1.6.8.
  - Optælling: værdi ud fra indkøbsværdi (mangler et eksempel på et materiale med forkert værdi).
  - Fase 6 småting i `plans/arbejdsvaerktoejer-gennemgang.md`.
  - Notifikationsklokken ved "anmod om at være med" er ikke prøvet live.
  - Evt. vise `onWaiting` fra SAP-køen som hint i UI'et.
- IT-sag (ikke kode): filserveren `\\VM-MSDK-2` er periodisk 5 til 9 s om at OPRETTE nye filer. Se `plans/responsiv-app.md`.
- Ældre backlog: `plans/development-1.6.8.md`.

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.8):

```powershell
npm.cmd run dev -- --host 127.0.0.1 --port 5070 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5070'
$env:TCD_HUB_USER_DATA_DIR = "$env:APPDATA\tcd-hub-dev-169"
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.
