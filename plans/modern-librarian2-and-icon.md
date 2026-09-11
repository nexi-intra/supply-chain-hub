# Nyt "Modern"-ikon + The Librarian 2 ind i Modern-modulet

## Baggrund
- "Modern"-modulets eget ikon (på GameCorner-kortet og Modern.tsx's header) er lige nu samme `Cube`-ikon
  som selve Cube Basher-spilkortet — for ens/forvirrende. Modern skal have sit EGET ikon, tematisk
  "moderne gaming" (matcher Arcades Joystick-tema, men signalerer noget nyere/skarpere).
- Andet spil til Modern: **The Librarian 2** (mreflow), ligger lokalt på `C:\TCD Tools\the-librarian-2-main`
  (ikke hentet fra GitHub denne gang — brugeren har allerede kildekoden liggende). Licens: `ISC` (bekræftet
  i package.json — permissiv, samme ånd som Cube Bashers "do whatever you want").

## Teknisk grundfakta (bekræftet ved gennemgang af den lokale mappe)
- FULDT Vite-projekt (ikke én statisk fil som Cube Basher): egen `package.json` (three@^0.185.1 +
  postprocessing@^6.39.4 som npm-deps, IKKE CDN-importmap), `vite.config.js`, `src/` (core/render/world/
  entities/systems/data/ui + main.js/game.js), `public/` (3 billeder: key-art, menu-baggrund, og-billede).
- `vite.config.js` har `base: '/'` (absolutte stier) + en custom "sitesBuild"-plugin der kopierer
  `worker/index.js` (Cloudflare Worker, KUN SPA-fallback-routing til Cloudflare Pages/Workers-hosting,
  INGEN runtime-afhængighed for selve spillet) og `.openai/hosting.json` ind i build-output — begge dele
  er irrelevante for os og ignoreres ved vendoring.
- `base: '/'` SKAL ændres til `base: './'` før build, ellers bliver de bundlede asset-stier absolutte
  (`/assets/xxx.js`) som ikke resolver korrekt når spillet ligger i en undermappe og loades via `file://`
  i den pakkede Electron-app (samme lærdom som TCD Hub's egen `base: './'`-opsætning).
- Ingen CDN-afhængigheder i selve spil-koden (kun Google Fonts-linket, samme mønster som Cube Basher —
  behold som ekstern, kosmetisk, fejler gracefuls offline). three.js/postprocessing bundles DIREKTE ind i
  det byggede JS af Vite — ingen separat vendoring af three.js nødvendig denne gang (modsat Cube Basher).
- Egen Esc-baseret pause (+ \`-debug-overlay, M-mute) — samme mønster som Cube Basher: skal IKKE afhænge
  af appens Escape-håndtering, styres udelukkende af en synlig "Tilbage"-knap uden for iframen.
- Bygget output havner i `dist/client/` (IKKE `dist/` roden — `outDir: 'dist/client'` i vite.config.js).

## Fase 1 — Nyt "Modern"-ikon
- [x] `src/views/GameCorner.tsx`: Modern-kortets ikon ændret fra `Cube` til `Headset`
- [x] `src/views/Modern.tsx`: header-ikonet ændret tilsvarende til `Headset` (Cube Basher-kortets eget
      ikon forbliver `Cube`)

## Fase 2 — Byg The Librarian 2 fra lokal kilde
- [x] Rediger `C:\TCD Tools\the-librarian-2-main\vite.config.js`: `base: '/'` → `base: './'`
- [x] `npm install` + `npm run build` (49 moduler, 1,06 MB JS + 41 KB CSS)
- [x] Verificeret: `dist/client/index.html` refererer relative stier (`./assets/...`)
- [x] Ekstra (brugerønske): to karakternavne omdøbt i `src/data/characters.js` — `name: 'Marion'` →
      `'Jacob'`, `name: 'Wolfe'` → `'Lasse'` (kun visningsnavnet; interne id'er `marion`/`wolfe` uændret)

## Fase 3 — Vendoring + wrapper-komponent
- [x] Kopieret `dist/client/*` til `tcd-hub-github/public/games/the-librarian-2/`
- [x] Nyt `src/components/TheLibrarian2Game.tsx` — samme mønster som `CubeBasherGame.tsx`

## Fase 4 — Wire ind i Modern.tsx
- [x] `src/views/Modern.tsx`: `view`-type + grid udvidet med kort **"The Librarian"** (Books-ikon),
      klik renderer `<TheLibrarian2Game>`

## Fase 5 — Verifikation & udrulning
- [x] `npm run build` + `npm test` (67/67 grønne)
- [x] Browser-test af det vendorede spil: menu + karaktervalg viste "Jacob"/"Lasse" korrekt, ingen
      "Not allowed to load local resource"-fejl
- [x] `npm run electron:build` + smoke-test + robocopy til `TCD-Hub 1.4.2` + asar-verifikation
      (35.265.483 bytes, matcher præcist — ~4 MB større end før, svarer til det vendorede spils
      JS+CSS+billeder)
- [x] git commit (`7f5dc5f`)
