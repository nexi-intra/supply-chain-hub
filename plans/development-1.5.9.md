# Supply Chain Hub 1.5.9 - lokal udvikling

Oprettet: 2026-10-01. Ingen release, installation eller publicering.

## Udgangspunkt

- Baseline: hele den aktuelle kildekode fra Supply-Chain-Hub 1.5.8,
  inklusive staged, unstaged og nye ikke-ignorerede filer.
- Git-baseline: 06a33be9cec464dc51c9d1998fe0e27ccf3f9bae.
- Separat Git-worktree med detached HEAD. Ingen ny branch eller commit.
- 1.5.8 bevares uaendret og kan fortsat udvikles separat.
- Gamle dist- og release-mapper er ikke kopieret.
- Historiske changelog- og release-noter bevares som reference;
  de er ikke en annoncering af 1.5.9.
- Appens eksisterende konfiguration peger paa rigtige faelles data.
  Lokal udvikling er ikke et isoleret datamiljoe.

## Fase 1 - klargoering

- [x] Opret separat versionsmappe med egen Git-worktree-reference.
- [x] Kopier aktuelle kildefiler og verificer dem med SHA-256.
- [x] Kontroller at 1.5.8 har uaendret Git-status.
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.5.9.
- [x] Klargoer lokale afhaengigheder uden at bygge eller udgive.
- [x] Verificer versionsmetadata, lokale vaerktoejer og fravaer af dist/release.
- [x] Koer TypeScript-kontrol og sammenlign fejl med 1.5.8.
- [x] Afklar eksisterende PDF-blokering i 1.5.9: gamle LibreOffice-importer
  og aktivering var blandet med den nye Word-konvertering. Rettet efter
  separat godkendelse; se plans/pdf-startup-repair.md. TypeScript og faktisk
  Word-konvertering passerer, og Electron starter. 1.5.8 er ikke aendret.

## Fase 2 - nye tiltag

- [ ] Aftal foerste tiltag og dets acceptkriterier.
- [ ] Implementer og test tiltaget i denne mappe.
- [ ] Registrer faktiske brugerrettede aendringer i changelog.

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal Git-branch og commit, naar det er relevant.
- [ ] Aftal separat releaseforloeb. Ingen release er bestilt nu.

Anbefalet start: afslut fase 1, og vaelg derefter foerste tiltag i fase 2.

## Lokal opstart

Fra denne mappe i foerste PowerShell-terminal:

```powershell
npm run dev -- --host 127.0.0.1 --port 5000 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://localhost:5000'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Hvis port 5000 er optaget, vaelg samme ledige port i begge terminaler.