# Version watermark + per-bruger versionsoversigt + force-update

## Fase 1 — Version-vandmærke i Hub
- [x] Tilføj lille vandmærke nederst i venstre hjørne af Hub.tsx med "v{version}"
- [x] Hent version via `window.electronUpdates.getStatus()` (falder tilbage til package.json-version i browser-mode)

## Fase 2 — Klient-version rapportering
- [x] Ny KV-nøgle `client-versions` (object keyed by email): `{ version, platform, lastSeen, updatedAt }`
- [x] I App.tsx: efter login og hvert 5. minut, skriv egen version+lastSeen via `setKvObjectField('client-versions', email, {...})`
- [x] Ryd op i entries for brugere der er slettet (best effort, ikke kritisk) — udskudt, ikke kritisk for release

## Fase 3 — Oversigt i Manager Panel (Datalagring-fane)
- [x] Ny sektion under App-opdateringer: tabel med bruger, version, sidst set, status (up-to-date / outdated / offline)
- [x] Sammenlign med `status.manifest.version` (seneste publicerede) for at markere outdated
- [x] Badge farve: grøn/default = up-to-date, rød/destructive = outdated, outline = ikke set i 24t+

## Fase 4 — Force-update af specifik bruger
- [x] Ny KV-nøgle `force-update-requests` (object keyed by email)
- [x] Manager-knap pr. bruger: "Tving opdatering" → tilføjer email til nøglen
- [x] App.tsx: lytter efter egen email i force-update-requests → trigger automatisk `check()` + `install()`-flow uden brugerinteraktion → fjerner sig selv fra listen
- [x] Vis kort statusbesked/toast til brugeren når det sker

## Fase 5 — Byg og test
- [x] `npm run build` — success
- [ ] Test lokalt: to klienter, publicér ny version, force-update den ene, verificér automatisk installation
- [ ] Deploy til test-mappe

## Bonus (allerede løst)
- [x] Fix "g" der stak ud af ferie-badges i månedskalenderen (Manager Panel → Ferie Oversigt) — for stram line-height på text-[9px] badges

