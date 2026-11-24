# Supply Chain Hub 1.6.4 - lokal udvikling

Oprettet: 2026-10-14. Ingen build, release eller push.

## Udgangspunkt

- Baseline: 1.6.3, commit `6767bcc` på `develop/1.6.3`.
- 1.6.3-zip: `Supply Chain Hub-1.6.3-win.zip`, SHA-256 `DC117B7F73352691B075732499A70A71113CD079A4C2475D1C7C64676844CCD9`.
- Branch `develop/1.6.4` i en separat worktree. Intet er pushet.
- 1.6.3 og ældre versioner er uændrede og kan bruges separat.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.

## Fase 1 - klargøring

- [x] Opret worktree `Supply-Chain-Hub 1.6.4` på ny branch `develop/1.6.4` fra `develop/1.6.3`.
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.4.
- [x] `npm ci` + Electron-binær (`node node_modules\electron\install.js`).
- [x] Verifikation: TypeScript OK.
- [x] Commit "Prepare development for version 1.6.4" (lokalt).

## Fase 2 - nye tiltag

- [x] Link Library: titel/beskrivelse auto-oversættes + "Oversat fra finsk · Vis original" (også To Do og Notesbog). E2E: `scripts/verify-translation-note.cjs`.
- [x] Hubert: "Where is the link to PostNord?" finder linket (STOP-ord + test).
- [x] Neural oversættelse: tom sprogpar-liste caches ikke længere før login.
- [x] Sprog: Vagtplan (gitter, faste ord, kildesprog "da"), Ferie/fravær-kalender og guidernes review-interval følger valgt sprog.
- [x] Changelog 1.6.4 opdateret. Verifikation 2026-10-15: tsc 0, electron-tests 0, vitest 1404 grønne.
- [x] The Librarian fjernet (Modern-kort, komponent, `public/games/the-librarian-2`, kunst/CSS, Hubert-viden og tests i 4 sprog). tsc 0, electron-tests 0, vitest 1406 grønne.
- [x] Commit (lokalt, 2026-10-20 ved klargøring af 1.6.5).
- [x] Build 2026-10-16: `release\Supply Chain Hub-1.6.4-win.zip`, SHA-256 `29426096B1752359928784ABE729708423FF1189929662E660A403FB0720B529`, verify-packaged-release OK.
- [ ] Aftal næste tiltag fra backloggen.
- [ ] Registrer brugerrettede ændringer i `src/lib/changelog.ts` under 1.6.4 — kun for ting der faktisk er lavet.

Bemærk: i dev mangler `dist/translation` (laves af build) — kopieret fra 1.6.3 for at neural oversættelse virker lokalt.

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal push af `develop/1.6.3` og `develop/1.6.4`, PR og release-tag, når det er relevant.
- [ ] Aftal separat releaseforløb (`npm run electron:build`, `node scripts/verify-packaged-release.cjs release/win-unpacked`, SHA-256).

## Backlog

- [ ] Hubert: opgavenavne på præcis 4 bogstaver kan matche for bredt ("Lead" ~ "leader").
- [ ] Hubert: finsk brugerflade og finske eksempler skal læses af en finsk kollega (se `finsk-ordliste.md`).
- [ ] Multiplayer: hurtig drag af brikker er stadig tung (årsag ikke fundet).
- [ ] Link Library: evt. fane i Manager Panel til godkendelse (i dag ligger den i modulet).
- [ ] GDPR fase 2: punkter i `gdpr-datasikkerhed.md`, der kræver IT/ejer-beslutning.
- [ ] Idéer fra brainstorm 2026-10-09: vagtbytte, team-liga, personlig kalender (Outlook).

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.3):

```powershell
npm run dev -- --host 127.0.0.1 --port 5065 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5065'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.
