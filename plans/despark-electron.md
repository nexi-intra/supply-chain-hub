# Fjern Putt Panic + gør appen Spark-uafhængig + Windows .exe

## Mål
1. Fjern alt Putt Panic-relateret (spil, integrationer, scripts, dependencies).
2. Fjern al afhængighed af GitHub Spark (`@github/spark`), så appen kører helt selvstændigt.
3. Erstat Spark KV med **lokal persistent storage** (localStorage), så data gemmes lokalt.
4. Gør appen til en desktop-app (Electron) med en Windows **.exe**, som kan bygges direkte fra repoet.

## Fase 1: Fjern Putt Panic
- [x] Slet `src/components/putt-panic/` (hele mappen).
- [x] Fjern PuttPanic fra `GameCorner.tsx` (lazy import, GameView-type, spilkort, view-blok).
- [x] Fjern PuttPanic fra `ManagerPanel.tsx` (state, load/edit/delete-funktioner, under-fane, tab-indhold, redigeringsdialog, Flag-ikon hvis ubrugt).
- [x] Slet `scripts/debug-puttpanic*.mjs` (4 filer).
- [x] Slet `plans/putt-panic-minigolf.md`.
- [x] Afinstaller dependencies: `@react-three/fiber`, `@react-three/drei`, `@react-three/rapier`, `zustand`, `howler`, `@types/howler` (+ `three`/`@types/three` — var ubrugte).

## Fase 2: Fjern GitHub Spark
- [x] Ny `src/lib/localKvStore.ts`: localStorage-backed async KV (get/set/delete/keys) med in-memory fallback — data persisterer lokalt i både browser og Electron.
- [x] Globalt: erstat alle 279 `window.spark.kv` → `window.kv` (sed) + typedeklaration i `vite-end.d.ts`.
- [x] `main.tsx`: fjern `import "@github/spark/spark"`, registrér `window.kv = localKv`.
- [x] Erstat alle 15 `window.spark.llm`-kald (7 filer) med lokale skabelonfunktioner i `src/lib/emailTemplates.ts` (deterministiske danske emails — ingen AI-backend nødvendig).
- [x] `ChatAssistant.tsx`: erstat LLM-chat med lokal nøgleordssøgning i guides.
- [x] `vite.config.ts`: fjern `sparkPlugin` + `createIconImportProxy`.
- [x] `package.json`: fjern `@github/spark`; omdøbt pakken til `tcd-hub`.
- [x] Slet `spark.meta.json` og `runtime.config.json` (+ orældet `src/styles/theme.css` med `#spark-app`-selectors).
- [x] Opdater `src/hooks/useKV.ts` til localKv; slet `sessionKvStore.ts`.
- [x] Opdater README (Spark-omtale + nye kørsels-/bygge-instruktioner).

## Fase 3: Electron desktop-app (.exe)
- [x] Tilføj devDeps: `electron`, `electron-builder`.
- [x] Opret `electron/main.cjs` (BrowserWindow, load dist/index.html, dev-mode support).
- [x] `vite.config.ts`: `base: './'` så assets virker via file:// (+ fast port 5000 til electron:dev).
- [x] `package.json`: `main`-felt, electron-builder-konfiguration (win portable .exe), scripts: `electron:dev`, `electron:build`.
- [x] localStorage persisterer automatisk i Electrons userData — lokal storage følger med gratis.
- [x] `.gitignore`: tilføj `release/`.

## Fase 4: Verificering
- [x] `npm run build` uden fejl.
- [x] Fuld typecheck af ændrede filer (ingen nye fejl).
- [x] Playwright røgtest i browser: login → data gemmes i localStorage (`tcd-hub:`-prefix) → reload → data persisterer, ingen page errors.
- [x] Byg .exe med electron-builder — `release/TCD Hub 1.0.0.exe` (portable, 112 MB) bygget succesfuldt.
- [x] Opdater README med "Sådan bygger du .exe på din pc".

---
**Forslag:** Start med Fase 1 (oprydning), derefter Fase 2 (Spark-fjernelse — største del), så Fase 3 (Electron) og til sidst Fase 4 (verificering).
