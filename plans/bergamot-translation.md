# Bergamot neural oversættelse (da↔en) — offline i appen

Status: **UNDER UDVIKLING** (del af 1.4.0). Erstatter ordbogs-oversætteren med ægte neural MT (samme modelklasse som LibreTranslate/Firefox Translations) — 100 % offline, ingen server, ingen API-nøgler.

## Arkitektur-beslutninger
- **Modeller på det delte drev** (`<datamappe>/translation-models/daen|enda/`): én download tjener alle klienter, app-zippen vokser ikke, og modeller kan opdateres uden ny app-version.
- **Fallback-kæde:** Bergamot (hvis modeller findes og WASM initialiserer) → ordbogs-oversætter (altid tilgængelig). UI markerer hvilken motor der oversatte.
- **Søgningen beholder ordbogen** — BM25 skal bruge ord-par, ikke sætninger.
- Al oversættelse går allerede gennem `translator.ts` → vi indfører `translateTextAsync()` og konverterer de tre kald-steder (preview-toggle, chat-citater, oversat DOCX).

## Fase 1 — Rekognoscering
- [x] Electron kører loadFile (file://) hvor fetch/Worker-URL'er er blokeret → alle assets læses via IPC; worker bygges som Blob m. prelude der patcher fetch (wasm) og importScripts (glue)
- [x] WASM-distribution: `@browsermt/bergamot-translator@0.4.9` (npm) — worker/glue/wasm vendored til `public/translation/`
- [x] Modeller: GitHub LFS døde (410) og de fleste CDN'er er proxy-blokerede — men Node har direkte netadgang, og Mozillas Remote Settings CDN virker via node-fetch. `daen`/`enda` tiny (BLEU 46) hentet.

## Fase 2 — Fundament
- [x] IPC `translation:worker-assets` / `translation:registry` / `translation:model-files` i main + preload + bridge-typer
- [x] `src/lib/bergamotTranslator.ts`: IpcBacking (loadModelRegistery/loadTranslationModel/loadWorker), blob-worker m. prelude, status-API, d.ts for npm-pakken
- [x] `translator.ts`: `translateTextAsync()` — Bergamot først, ordbog som fallback; returnerer motor til UI-badge

## Fase 3 — UI-integration
- [x] GuideViewer: async oversættelse m. "Oversætter…"-status og motor-badge ("Neural oversættelse (offline)" / "ordbogsbaseret"); DOCX-eksport af vist sprog følger med automatisk
- [x] GuideChat: async citat-oversættelse m. "· neural"-mærke

## Fase 4 — Modeller & validering
- [x] `scripts/download-translation-models.cjs` — henter da↔en fra Mozilla Remote Settings, gunzipper og navngiver korrekt; kørt mod lokal TCD HUB STORAGE (42 MB). SKAL også køres mod M:-drevets datamappe før udrulning.
- [x] `npm run build` + `npm test` (15/15) + pakket/deployet 1.4.0 test-build (app.asar 7,6 MB inkl. WASM)
- [ ] Manuel test (BRUGER): åbn guide → skift sprog (badge skal vise "Neural oversættelse (offline)"), chat på tværs af sprog, og omdøb evt. translation-models-mappen for at verificere ordbogs-fallback
