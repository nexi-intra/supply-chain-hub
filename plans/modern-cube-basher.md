# Nyt undermodul "Modern" i Game Corner + Cube Basher

## Baggrund
- Game Corner skal have et nyt sideordnet undermodul ved siden af Arcade: **Modern** — hjem for større,
  moderne 3D-spil (roguelite/survivor-likes), i modsætning til Arcades små klassiske retro-spil.
- Første spil i Modern: [Cube Basher](https://github.com/mreflow/cube-basher) (licens: "do whatever you
  want with it"). Flere store spil (fx The Librarian 2) kan følge senere — Modern skal ikke være
  cube-specifik i navn/struktur.

## Teknisk grundfakta (bekræftet)
- Cube Basher er ÉN `index.html`-fil: inline CSS + `<script type="module">`, importerer three.js r0.160.0
  + et par `three/addons/...`-moduler via et importmap fra jsdelivr-CDN'en. Ingen build-step i sig selv.
- Spillet tegner sin egen `<canvas>` direkte via `document.body.appendChild(renderer.domElement)`, sætter
  sine egne `window`/`document`-keydown-lyttere (WASD/Shift/Space/P/Esc/M), og kører en uendelig
  `requestAnimationFrame`-løkke UDEN nogen form for oprydnings-/dispose-logik (det er skrevet til at være
  den eneste ting på en side, aldrig unmountet). At omskrive dette til en ren React-komponents
  mount/unmount-livscyklus ville kræve en betydelig, risikabel omskrivning af ukendt tredjeparts-kode.
- Egen Escape/P-håndtering: skifter internt mellem 'play'/'pause' og viser/skjuler en `#pauseScr`-div —
  det er IKKE det samme som appens egen Escape-baserede tilbage-navigation.
- Gemte data: én `localStorage`-nøgle (`cubebasher_v1`, JSON: coins + permanente upgrades). Simpel,
  browser-lokal — ingen ændring nødvendig for v1 (ingen krydsklient-leaderboard for dette spil endnu).
- Appens Electron-opsætning: `nodeIntegration:false`, `contextIsolation:true`, `sandbox:true`, INGEN
  `nodeIntegrationInSubFrames` → en iframe med tredjeparts-indhold kører allerede fuldt sandboxed uden
  Node/Electron-adgang. Ingen CSP sat; appen loades via `win.loadFile` (`file://`) med Vite `base: './'`,
  og der findes allerede en `public/`-mappe hvis indhold Vite kopierer uændret til `dist/`.

## Valgt tilgang: iframe til en lokalt vendoret, offline-klar kopi
I stedet for at omskrive Cube Bashers tætkoblede modul-kode til en React-komponent (høj risiko for at
ødelægge fysik/balancing ved et uheld), køres spillet i en `<iframe>` der peger på en lokal, offline-klar
kopi af `index.html`. En iframe er sit eget browsing-context: at afmontere iframe'en rydder GARANTERET
alle dens event-listeners og stopper dens rAF-løkke — det løser mount/unmount-problemet uden at røre
spillets interne kode. Escape/pause håndteres af spillet selv INDE i iframen; tilbage til Modern-oversigten
sker via en synlig knap uden for iframen (ligesom de øvrige "Tilbage til X"-knapper i appen).

## Fase 1 — Vendoring (offline-adgang, ingen CDN-afhængighed)
- [x] `npm install three@0.160.0` (pinned til samme version som spillets importmap)
- [x] Kopiér `node_modules/three/build/three.module.js` samt HELE `node_modules/three/examples/jsm/`
      (ikke kun de 6 filer spillet direkte importerer — resten af `jsm`-træets interne relative imports
      skal også kunne resolve) til `public/games/cube-basher/vendor/three/`
- [x] Hent spillets `index.html` fra GitHub (raw) ned i `public/games/cube-basher/index.html`
- [x] Eneste redigering af selve spilfilen: omskriv `<script type="importmap">` fra jsdelivr-URLs til
      lokale relative stier (`./vendor/three/build/three.module.js` osv.) — INGEN ændringer i selve
      spillogikken
- [x] Vurdér Google Fonts-linket (Lilita One/Nunito): behold som ekstern (fejler gracefuls til
      fallback-font offline) — bevidst valg, ikke vendoret (kosmetisk, ingen funktionel blokering)
- [x] Verificér lokalt at spillet kan åbnes direkte uden netværkskald til jsdelivr (testet i browser:
      menu + faktisk gameplay med 3D-terræn/fjender renderer korrekt fra det lokale vendorede three.js)

## Fase 2 — "Modern" undermodul + iframe-wrapper
- [x] `src/views/GameCorner.tsx`: tilføjet et andet kort "Modern" ved siden af "Arcade", `view`-type
      udvidet til `'hub' | 'arcade' | 'modern'`
- [x] Nyt `src/views/Modern.tsx`: landing-side i samme stil som Arcade/GameCorner — header "Modern" +
      ét kort "Cube Basher" (Cube-ikon fra phosphor-icons), klik åbner selve spil-wrapperen
- [x] Nyt `src/components/CubeBasherGame.tsx`: renderer en `<iframe src="./games/cube-basher/index.html">`
      i fuld skærm, `sandbox="allow-scripts allow-pointer-lock"`, `title`-attribut for tilgængelighed
- [x] `data-game-active`-attribut sættes på `<body>` mens komponenten er monteret, fjernes ved unmount
- [x] Synlig "← Tilbage"-knap oven på iframen der navigerer tilbage til Modern's `view='hub'`

## Fase 3 — Navigation & Escape-koordinering
- [x] `Modern.tsx` får samme mønster som `GameCorner.tsx`: egen Escape-lytter der tjekker
      `isAnyModalOpen()` og eget `view !== 'hub'`-niveau, før den kalder sin egen `onNavigateBack()`
- [x] `GameCorner.tsx`s eksisterende Escape-lytter defer'er korrekt når `view === 'modern'` (det
      generiske `if (view !== 'hub') return`-tjek dækker det automatisk)
- [x] `src/lib/modalStack.ts`: kommentar opdateret til at nævne Modern/Cube Basher ved siden af Arcade

## Fase 4 — Verifikation & udrulning
- [x] `npm run build` + `npm test` (67/67 grønne)
- [x] Manuel test af selve spillet (i browser, samme relative sti-opløsning som pakket app): menu +
      gameplay renderer korrekt, ingen CDN-kald til jsdelivr (kun Google Fonts, bevidst behold)
- [x] `npm run electron:build` + smoke-test + robocopy til `TCD-Hub 1.4.2` + asar-verifikation
      (app.asar 31.283.282 bytes, matcher præcist mellem source og deployed)
- [x] git commit (`e484355`, plus doc-fix `a0b0dff`)

**Bemærk:** fuld klik-igennem-test i selve TCD Hub-appen (login → Hub → Game Corner → Modern →
Cube Basher) blev IKKE udført af agenten, da der ikke var login-oplysninger tilgængelige. Anbefales
at brugeren selv verificerer denne klik-vej i den udrullede `TCD-Hub 1.4.2`.
      (app.asar 31.283.282 bytes, matcher præcist mellem source og deployed)
- [x] git commit (`e484355`, plus doc-fix `a0b0dff`)

**Bemærk:** fuld klik-igennem-test i selve TCD Hub-appen (login → Hub → Game Corner → Modern →
Cube Basher) blev IKKE udført af agenten, da der ikke var login-oplysninger tilgængelige. Anbefales
at brugeren selv verificerer denne klik-vej i den udrullede `TCD-Hub 1.4.2`.
