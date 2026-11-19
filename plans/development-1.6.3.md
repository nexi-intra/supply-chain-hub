# Supply Chain Hub 1.6.3 - lokal udvikling

Oprettet: 2026-10-13. Ingen build, release eller push.

## Udgangspunkt

- Baseline: 1.6.2, commit `ec53d7e` ("Release 1.6.2") på `develop/1.6.2`.
- 1.6.2-zip: `Supply Chain Hub-1.6.2-win.zip`, SHA-256 `E8A4C5166C4FB60F2C59753DF82953439C75B2BFF5489D37FE5142CC2B049494`.
- Branch `develop/1.6.3` i en separat worktree. Intet er pushet.
- 1.6.2 og ældre versioner er uændrede og kan bruges separat.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.

## Fase 1 - klargøring

- [x] Opret worktree `Supply-Chain-Hub 1.6.3` på ny branch `develop/1.6.3` fra `develop/1.6.2`.
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.3.
- [x] `npm ci` (npm blokerer install-scripts for @swc/core, electron-winstaller og esbuild — uden betydning for tests/build). Electron-binær installeret med `node node_modules\electron\install.js`.
- [x] Verifikation: TypeScript OK.
- [x] Commit "Prepare development for version 1.6.3" (lokalt).

## Fase 2 - nye tiltag

- [ ] Aftal første tiltag og dets acceptkriterier.
- [ ] Implementer og test tiltaget i denne mappe (TDD).
- [ ] Registrer faktiske brugerrettede ændringer i `src/lib/changelog.ts` under 1.6.3 — kun for ting der faktisk er lavet (der er endnu ingen 1.6.3-post).

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal push af `develop/1.6.1`, `develop/1.6.2` og `develop/1.6.3`, PR og release-tag, når det er relevant.
- [ ] Aftal separat releaseforløb (`npm run electron:build`, `node scripts/verify-packaged-release.cjs release/win-unpacked`, SHA-256).

## Backlog (fra 1.6.2)

- [ ] Notesbog: egen notifikationsliste med "Markér alle som læst" inde i modulet - flyt til klokken på Hubben (se `notifications-hub-central.md` fase 3).
- [ ] Hubert: forklaringen om Team Oversigt kunne nævne "spørg Hubert" om andre teams' vagtplaner.
- [ ] Hubert: opgavenavne på præcis 4 bogstaver kan matche for bredt ("Lead" ~ "leader").
- [ ] Hubert: strukturerede `sources` (recordId/owner) bærer stadig kollegers e-mail.
- [ ] Hubert: finsk brugerflade og finske eksempler skal læses af en finsk kollega (se `finsk-ordliste.md`).
- [ ] Multiplayer: hurtig drag af brikker er stadig tung (årsag ikke fundet).
- [ ] Idéer fra brainstorm 2026-10-09: Ctrl+K der søger i alt, vagtbytte, "Min uge", Huberts morgenbriefing, flere Hubert-handlinger, high-fives, team-liga, personlig kalender (Outlook).

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.2):

```powershell
npm run dev -- --host 127.0.0.1 --port 5031 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5031'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.
