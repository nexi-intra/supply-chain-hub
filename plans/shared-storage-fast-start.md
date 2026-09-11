# Hurtig opstart + fælles storage på netværksdrev (10-15 klienter)

## Mål
1. **Hurtig opstart**: Appen skal starte på få sekunder. Roden til 1-minuts-opstarten er
   portable-formatet, der udpakker ~300 MB ved hvert klik. Distributionen ændres til
   udpakket mappe (ZIP) som eneste anbefalede format.
2. **Fælles storage**: Alle 10-15 klienter skal læse/skrive samme data. Data flyttes fra
   localStorage til **JSON-filer i en konfigurerbar mappe** — typisk på et fælles
   netværksdrev. Ændringer fra én klient opdages automatisk af de andre (polling af
   fil-tidsstempler, ~2 sek. latenstid).

## Arkitektur
- Electron **main process** ejer al fil-I/O (`electron/store.cjs`): én JSON-fil pr.
  KV-nøgle, atomiske skrivninger (tmp + rename), nøgler kodet som sikre filnavne.
- **Preload** (`electron/preload.cjs`) eksponerer `window.electronKv` (get/set/delete/
  keys/getAll + onChanged) via contextBridge/IPC.
- **Renderer**: `window.kv` peger på electron-broen når den findes, ellers localStorage
  (browser-dev). `useKV`-hooket abonnerer på ændringer → åbne views opdaterer live.
- **Datamappe-opløsning** (prioriteret): `TCD_HUB_DATA_DIR` env-var → `tcd-hub.config.json`
  ved siden af .exe'en (`{ "dataDir": "\\\\server\\share\\..." }`) → lokal userData-mappe.
  Utilgængelig netværksmappe → fallback til lokal mappe + fejllog.
- **Migrering**: Første start med tom datamappe kopierer evt. eksisterende
  localStorage-data over, så ingen mister det de har.

## Fase 1: Fil-baseret KV-store i Electron
- [x] `electron/store.cjs`: ren Node-modul (testbar) med get/set/delete/keys, atomiske
      skrivninger, filnavns-kodning af nøgler og mtime-baseret change-detection (poll ~2s).
- [x] Unit-røgtest af store.cjs direkte med node (set/get/delete/keys/ændringsdetektion
      mellem to store-instanser på samme mappe — alle checks OK).

## Fase 2: IPC-bro og main process
- [x] `electron/preload.cjs`: contextBridge med kv-API + `onChanged`-abonnement.
- [x] `electron/main.cjs`: datamappe-opløsning (env → config-fil → userData), IPC-handlers,
      start af watcher, broadcast af ændrede nøgler til alle vinduer.

## Fase 3: Renderer-integration
- [x] `src/vite-end.d.ts`: type for `window.electronKv`.
- [x] `src/main.tsx`: vælg bro vs. localStorage, kør engangsmigrering, async bootstrap.
- [x] `src/lib/localKvStore.ts`: tilføj `subscribe` (storage-event → sync på tværs af faner).
- [x] `src/hooks/useKV.ts`: abonnér på ændringer for nøglen → live opdatering i åbne views.

## Fase 4: Distribution og opstartstid
- [x] `package.json`: version 1.1.0; `electron:build` bygger ZIP (hurtig opstart) i stedet
      for portable; portable beholdes som eksplicit separat script.
- [x] README: udrulningsguide til 10-15 maskiner (app lokalt pr. maskine, datamappe på
      fælles drev, config-fil, latenstid, advarsel mod at køre .exe fra netværksdrev).

## Fase 5: Verificering + release
- [x] `npm run build` + typecheck uden nye fejl (+ `node --check` af alle electron-filer).
- [x] Browser-røgtest: login OK, KV-persistens OK, subscribe/live-update OK, ingen page errors.
- [x] Node-test af store.cjs (fil-mode) inkl. ændringsdetektion mellem to "klienter".
- [x] Byg ZIP (`release/TCD Hub-1.1.0-win.zip`).
- [ ] Opret PR og lav release v1.1.0 efter merge.

---
**Forslag:** Start med Fase 1 (storen er fundamentet), derefter Fase 2-3 (integration),
og afslut med Fase 4-5 (distribution + release).
