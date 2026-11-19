# Supply Chain Hub 1.6.5 - lokal udvikling

Oprettet: 2026-10-20. Ingen build, release eller push.

## Udgangspunkt

- Baseline: 1.6.4, commit `d887e99` på `develop/1.6.4`.
- 1.6.4-zip: `Supply Chain Hub-1.6.4-win.zip`, SHA-256 `29426096B1752359928784ABE729708423FF1189929662E660A403FB0720B529`.
- Branch `develop/1.6.5` i en separat worktree. Intet er pushet.
- 1.6.4 og ældre versioner er uændrede og kan bruges separat.
- Appens konfiguration (`supply-chan-hub.config`) peger på de rigtige fælles data på M:.
  Lokal udvikling er IKKE et isoleret datamiljø.

## Fase 1 - klargøring

- [x] Opret worktree `Supply-Chain-Hub 1.6.5` på ny branch `develop/1.6.5` fra `develop/1.6.4`.
- [x] Opdater package.json og begge rodversioner i package-lock.json til 1.6.5.
- [x] `npm ci` + Electron-binær (`node node_modules\electron\install.js`).
- [x] Verifikation: TypeScript OK (baseline 20.10: tsc 0, vitest 1406, electron 1119 grønne).
- [x] Commit "Prepare development for version 1.6.5" (lokalt).

## Fase 2 - nye tiltag

- [ ] Aftal næste tiltag fra backloggen.
- [x] Lagerstyring (Optælling) for TCD/TRR + Hubert-svar – se `plans/lagerstyring.md` (fase 0–7 lokalt committet 20.10; live-tjek mod M:/SAP er brugerens trin).
- [x] Lagerstyring > Placeringer (kerne + Hubert) – se `plans/placeringer-design.md` og `plans/placeringer-plan.md` (Task 1–14 lokalt committet 21.10; E2E `scripts/verify-locations.cjs` grøn).
- [x] Placeringer: log, fortryd og rollen Placerings admin (Manager Panel > Lagerstyringsroller) – se `plans/placeringer-log-design.md` og `plans/placeringer-log-plan.md` (Task 1–9 lokalt committet 22.10; begge E2E grønne).
- [x] Placeringer: reoler, hylder (hyldelager), gulvpladser og opret/slet placeringer – se `plans/placeringer-reoler-design.md` og `plans/placeringer-reoler-plan.md` (Task 1–11 lokalt committet 22.10; begge E2E grønne).
- [x] Placeringer: Tegning af lageret – Fase 1 (tegning, afstemning, udgivelse) – se `plans/lager-tegning-plan.md` (Task 1–16 lokalt committet 02.11; E2E `scripts/verify-layout.cjs` grøn).
- [ ] Placeringer: Tegning af lageret – Fase 2 (kort over lageret for alle, reolen forfra med belægning, "Vis på kort") – se `plans/lager-tegning-plan.md`.
- [ ] Placeringer: Tegning af lageret – Fase 3 (kortet i "Sæt palle på plads": "Vis" ved forslag og valgt plads) – se `plans/lager-tegning-plan.md`.
- [x] Registrer brugerrettede ændringer i `src/lib/changelog.ts` under 1.6.5 — kun for ting der faktisk er lavet.
- [x] Fejl: appen lukkede "ud af det blå" (30.10). Årsag: Electrons standardmenu (aldrig fjernet, kun skjult) har Ctrl+W = Luk vindue → `window-all-closed` → `app.quit()`. Rettet i `electron/main.cjs` (`before-input-event` blokerer Ctrl+W). Reproduceret og verificeret med rigtigt tastetryk i Electron 44 (negativ kontrol lukker, rettet app forbliver åben).
- [ ] Overvej: øvrige skjulte standardgenveje (Ctrl+R / Ctrl+Shift+R genindlæser og smider ikke-gemt formulardata væk; Ctrl+M minimerer).

Bemærk: i dev mangler `dist/translation` (laves af build) — kopieret fra 1.6.4 for at neural oversættelse virker lokalt.

## Fase 3 - senere, kun efter godkendelse

- [ ] Aftal push af `develop/1.6.3`, `develop/1.6.4` og `develop/1.6.5`, PR og release-tag, når det er relevant.
- [ ] Aftal separat releaseforløb (`npm run electron:build`, `node scripts/verify-packaged-release.cjs release/win-unpacked`, SHA-256).

## Backlog

- [ ] Lagerstyring: flere værktøjer (Lager, Varemodtagelse) – et felt i `src/views/warehouse/WarehouseHome.tsx` + egen visning i `Warehouse.tsx`.
- [ ] Lagerstyring: live-tjek i dev-vindue mod rigtige data (TCD-hub → Lagerstyring → Optælling, SAP-indikator PS4/100) – brugerens trin.
- [ ] Placeringer: live-tjek – brugerens trin: (1) importér det rigtige placeringsark mod rigtig SAP (MB52 + MM60; felt-id'erne i `electron/warehouse/sap/mm60.vbs` er ikke prøvet mod SAP), (2) gennemgå formål, faste materialer og områder (RE/PR fra arket) og ret det nødvendige, (3) første rigtige varemodtagelse med 49/50-nummer.
- [ ] Placeringer delprojekt 3: MIGO-overførsel af storage location (man bekræfter selv i SAP).
- [ ] Placeringer delprojekt 4: Optælling bruger Placeringer i stedet for placeringsarket – når I har besluttet, at Placeringer er godt nok.

- [ ] Hubert: opgavenavne på præcis 4 bogstaver kan matche for bredt ("Lead" ~ "leader").
- [ ] Hubert: finsk brugerflade og finske eksempler skal læses af en finsk kollega (se `finsk-ordliste.md`).
- [ ] Multiplayer: hurtig drag af brikker er stadig tung (årsag ikke fundet).
- [ ] Link Library: evt. fane i Manager Panel til godkendelse (i dag ligger den i modulet).
- [ ] GDPR fase 2: punkter i `gdpr-datasikkerhed.md`, der kræver IT/ejer-beslutning.
- [ ] Idéer fra brainstorm 2026-10-09: vagtbytte, team-liga, personlig kalender (Outlook).
- [ ] Managere på tværs af teams: skal en ekstra manager kunne oprette egen ferie i et andet team? (I dag gemmes den i det aktive team.)
- [ ] Hub-vælgerens "venter"-tal tæller ventende brugere med, også når klokken ikke viser dem — overvej at samkøre helt.

## Lokal opstart

Fra denne mappe i første PowerShell-terminal (brug en anden port end 1.6.4):

```powershell
npm run dev -- --host 127.0.0.1 --port 5066 --strictPort
```

Fra denne mappe i anden PowerShell-terminal:

```powershell
$env:ELECTRON_START_URL = 'http://127.0.0.1:5066'
& '.\node_modules\electron\dist\electron.exe' .
```

Brug Electron-vinduet til normal Hub-login. Browseren har ikke samme auth-bridge.
Luk dev-vinduet via X-knappen (aldrig force-kill), så der ikke efterlades en forladt lås på M:.

## Lagerstyring – E2E mod midlertidige data

Kører mod en midlertidig platform og falsk SAP (rører aldrig M: eller SAP). Vite på port 5064 (eller sæt `WAREHOUSE_VERIFY_URL`):

```powershell
npm run dev -- --host 127.0.0.1 --port 5064 --strictPort
```

```powershell
node scripts/verify-warehouse.cjs
node scripts/verify-locations.cjs
```
