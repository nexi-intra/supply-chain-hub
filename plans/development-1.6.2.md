# Supply Chain Hub 1.6.2 - lokal udvikling

Oprettet: 2026-10-09. Ingen build, release eller push.

## Udgangspunkt

- Baseline: 1.6.1, commit `ab2fc77` ("Release 1.6.1") på `develop/1.6.1`.
- 1.6.1-zip: `Supply Chain Hub-1.6.1-win.zip`, SHA-256 `8181F3F306A523A0C6FC0BDD27750DE733BD723C5BB28D931836BFD784B7351D`.
- Branch `develop/1.6.2` i en separat worktree. Intet er pushet.
- 1.6.1 og 1.6.0 er uændrede og kan bruges separat.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.

## Fase 1 - klargøring

- [x] Opret worktree `Supply-Chain-Hub 1.6.2` på ny branch `develop/1.6.2` fra `develop/1.6.1`.
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.2.
- [x] `npm ci` (npm blokerer install-scripts for @swc/core, electron-winstaller og esbuild — uden betydning for tests/build). Electron-binær installeret med `node node_modules\electron\install.js`.
- [x] Verifikation: TypeScript OK.
- [x] Commit "Prepare development for version 1.6.2" (lokalt).

## Fase 2 - nye tiltag

- [x] Word-Puzzle passer i vinduet uden scroll (højdebudget 6.2rem -> 8.4rem inkl. hint-linjen fra 1.6.1, min. felt 1.1rem). Målt i Electron ved 7 vinduesstørrelser: bordet slutter præcis ved vinduets bund som i skak. E2E 17/14 grøn.
- [ ] Aftal første tiltag og dets acceptkriterier.
- [ ] Implementer og test tiltaget i denne mappe (TDD).
- [ ] Registrer faktiske brugerrettede ændringer i `src/lib/changelog.ts` under 1.6.2 — kun for ting der faktisk er lavet (der er endnu ingen 1.6.2-post).

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal push af `develop/1.6.1` og `develop/1.6.2`, PR og release-tag, når det er relevant.
- [x] Releasebuild 2026-10-12: `Supply Chain Hub-1.6.2-win.zip`, SHA-256 `E8A4C5166C4FB60F2C59753DF82953439C75B2BFF5489D37FE5142CC2B049494`; `verify-packaged-release` OK (rigtig Word→PDF). E2E før build: Word-Puzzle 19, skak 14, Forbedringer grøn.
- [x] Ved udrulning: `node scripts\backfill-top-words.cjs --apply` (kørt 2026-10-12).

## Backlog (fra 1.6.1)

- [ ] Hubert: strukturerede `sources` (recordId/owner) bærer stadig kollegers e-mail — kræver ændring i `main.cjs` eller renderer.
- [ ] Hubert: fritekst i data, der ligner instruktioner, kan markeres.
- [ ] Hubert: finsk brugerflade er maskinoversat — de finske eksempler (bl.a. datoformater) skal læses af en finsk kollega (se `finsk-ordliste.md`).
- [ ] Hubert: datoformat — behold korte datoer i sætninger og forkortet engelsk ugedag ("Wed")?
- [ ] Hubert viser ikke multiplayer-rangeringslister (bevidst udeladt).
- [ ] Multiplayer: hurtig drag af brikker er stadig tung (årsag ikke fundet).
- [ ] Bekræft grain-baggrunden (`image-set`) visuelt i et pakket vindue (kun set i bygget CSS og i Vite).
- [ ] Hubert: åbne punkter fra `development-1.6.0.md` (sammenligninger, enkeltord, AI-formulering af lange procedurer).
- [ ] Gennemgang af hele appen: knapper, roller og fejlsituationer i alle moduler.

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.1):

```powershell
npm run dev -- --host 127.0.0.1 --port 5030 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5030'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.
