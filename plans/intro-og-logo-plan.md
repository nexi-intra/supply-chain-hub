# Intro ved start og nyt logo – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Den hvide skærm ved start erstattes af en midnatsblå intro, hvor terminaler og hubbens ting flyver ind i det nye Kæde-H-logo, og som toner ud når appen viser sin første rigtige skærm; logoet bliver også programikon og favicon.

**Architecture:** Introen er ren HTML/CSS/SVG inde i `index.html` (vises før appens kode er indlæst). `src/lib/startupIntro.ts` fjerner den med en fade, kaldt fra `App.tsx`, når første rigtige skærm vises (og fra fejlskærmen). Ikonet `build/icon.ico` laves af et script, der tegner logo-SVG'en i Electron og pakker PNG'erne i en ICO.

**Tech Stack:** HTML/CSS/SVG, React/TS (vitest, node-miljø – ingen DOM), Electron 44 (node:test).

**Spec:** [intro-og-logo-design.md](./intro-og-logo-design.md)

## Global Constraints

- Farver: midnat `#0B1422`/`#1D2E47`, guld `#F8DC9C → #E6B04F → #C98A22`, navn `#F7E7C4`. Vinduets `backgroundColor: '#0B1422'`.
- Logo = nr. 9 "Kæde-H" (geometri som i browser-udkastet `logo-kaede-h.html`, symbol `h9`): flise 124×124 rx 30; stående led `rect 27,25 19×78 rx 9.5` og `82,25 19×78`; liggende led `35,54 58×20 rx 10`; streg 7; fletning: venstre led over tværleddet nederst, højre led over øverst.
- Navn i introen: "Supply Chain Hub", Segoe UI Semibold. Intet hentes udefra (ingen http(s)-adresser i `index.html`).
- Introens ting: 5 terminaler (Lane/3600, Move/3500, N950, X70, P70) + dokument, kalender, mail, guide, kolli – egne tegninger.
- Fade ud ~400 ms; derefter fjernes elementet. `prefers-reduced-motion`: logoet stille, ingen flyvende ting.
- Introen skal se færdig ud når som helst: logoet samles inden for ~0,6 s, tingene strømmer ind i en løkke.

## Review Focus

- Appen fejler under start (ErrorBoundary) → introen må ikke dække fejlskærmen.
- Appen er meget langsom (M: nede) → introen bliver stående, indtil appen er klar, men aldrig længere end 30 s.
- Første skærm er login, hubvælger eller hub → introen toner ud i alle tre tilfælde.
- Introen må ikke kunne fanges af klik/tastatur (den ligger øverst, mens appen tegnes under den).
- Lav ydeevne (ingen GPU, `data-render-mode`) → animationerne bruger kun transform/opacity.

---

### Task 1: Logo-filer og programikon

**Files:**
- Modify: `public/app-logo.svg`, `src/assets/images/app-logo.svg` (identiske: det nye logo)
- Create: `scripts/build-icon.cjs` (kører i Electron: tegner `public/app-logo.svg` i 16/24/32/48/64/128/256 px og skriver `build/icon.ico` med PNG-indgange)
- Modify: `build/icon.ico` (genereret)
- Test: `electron/appIcon.test.cjs`

- [x] **Step 1: Write the failing test** `electron/appIcon.test.cjs`
  - `the app icon is a real ICO with every Windows size as PNG` – læs `build/icon.ico`: reserved 0, type 1, antal 7; bredder (0 = 256) `[16,24,32,48,64,128,256]`; hver indgangs data starter med PNG-signaturen `89 50 4E 47`.
  - `the logo files are the chain-H and identical` – begge SVG'er er ens; indeholder tre `rect` med `rx="9.5"`/`rx="10"` på de gyldne koordinater og `#E6B04F`; ingen `>SCH<`.
- [x] **Step 2: Run** `node --test electron/appIcon.test.cjs` – Expected: FAIL (gammel ICO har andre størrelser / SVG har SCH).
- [x] **Step 3: Implement** SVG'erne og `scripts/build-icon.cjs` (offscreen `BrowserWindow`, `loadURL` af SVG'en som data-URL, `capturePage().toPNG()` pr. størrelse, ICO-header + katalog + PNG-data). Kør `npx.cmd electron scripts/build-icon.cjs`.
- [x] **Step 4: Run** `node --test electron/appIcon.test.cjs` – Expected: PASS.
- [x] **Step 5: Commit** `git commit -m "Nyt Kaede-H-logo som programikon og favicon"`

### Task 2: Introen i `index.html` og midnatsblåt vindue

**Files:**
- Modify: `index.html` (blok `<div id="startup-intro">` + `<style>` før `#root`)
- Modify: `electron/main.cjs` (`backgroundColor: '#0B1422'` i `new BrowserWindow`)
- Test: `src/lib/startupIntro.test.ts` (læser `index.html` som tekst)

- [x] **Step 1: Write the failing test** (`describe('the startup intro markup')`)
  - `index.html shows the intro before the app code` – `#startup-intro` står før `<div id="root">`; `aria-hidden="true"`; `pointer-events: none`.
  - `it fetches nothing from outside and stays small` – ingen `http://`/`https://` i filen (udover XML-navnerum `http://www.w3.org/2000/svg`); intro-blokken < 40 KB.
  - `every item flies in` – `data-item`-værdierne er præcis `lane3600, move3500, n950, x70, p70, document, calendar, mail, guide, parcel`.
  - `reduced motion keeps the logo still` – CSS'en har `@media (prefers-reduced-motion: reduce)` der stopper `.si-item`-animationer.
  - `the window starts midnight blue` – `electron/main.cjs` indeholder `backgroundColor: '#0B1422'`.
- [x] **Step 2: Run** `npx.cmd vitest run src/lib/startupIntro.test.ts` – Expected: FAIL.
- [x] **Step 3: Implement** markup + CSS (kun transform/opacity i animationer; løkke ~5 s med forskudte starttider; logoets led glider sammen inden 0,6 s; guldpuls når en ting når midten) og `backgroundColor`.
- [x] **Step 4: Run** testen – Expected: PASS. Se introen i browseren (byg `dist`, åbn `dist/index.html`) og tag skærmbilleder ved 0,3 s / 1,5 s / 3 s.
- [x] **Step 5: Commit** `git commit -m "Intro ved start i stedet for hvid skaerm"`

### Task 3: Introen toner ud, når appen er klar

**Files:**
- Create: `src/lib/startupIntro.ts`
- Modify: `src/App.tsx` (kald når første rigtige skærm vises), `src/ErrorFallback.tsx` (kald ved fejl), `index.html` (inline fail-safe efter 30 s)
- Test: `src/lib/startupIntro.test.ts`

**Interfaces:**
- Produces: `dismissStartupIntro(doc: Pick<Document, 'getElementById'> = document, { fadeMs = 400 }?: { fadeMs?: number }): void` – idempotent; tilføjer klassen `is-leaving`, fjerner elementet efter `transitionend` eller senest `fadeMs + 200` ms.

- [x] **Step 1: Write the failing test** (`describe('dismissStartupIntro')`, falsk element med `classList`, `remove`, `addEventListener`, fake timers)
  - `fades the intro out and removes it` – `is-leaving` sat; efter `transitionend` er `remove` kaldt én gang.
  - `removes it even if no transition event comes` – efter 600 ms er `remove` kaldt.
  - `calling it twice or without an intro does nothing more` – andet kald ændrer intet; `getElementById` → `null` kaster ikke.
- [x] **Step 2: Run** `npx.cmd vitest run src/lib/startupIntro.test.ts` – Expected: FAIL.
- [x] **Step 3: Implement** funktionen; i `App.tsx` en `useEffect`, der kalder den når `!isCheckingAuth && (!userSession || hubChoice?.token === userSession.token)`; i `ErrorFallback` kald ved mount; inline-script i `index.html`: efter 30 s tilføj `is-leaving` og fjern – men kun hvis app-koden aldrig startede (`markAppStarted()` i `main.tsx` sætter `data-app-started`), så et langsomt M: ikke giver en tom skærm.
- [x] **Step 4: Run** testen + `npx.cmd tsc --noEmit -p .` – Expected: PASS, 0 fejl.
- [x] **Step 5: Commit** `git commit -m "Introen toner ud naar appen er klar"`

### Task 4: Levering

- [x] **Step 1:** Ændringslog 1.6.7: "Nyt logo og en intro, når appen starter – ingen hvid skærm mere".
- [x] **Step 2:** Fuld verifikation: `npx.cmd tsc --noEmit -p .`, `npx.cmd vitest run`, node-suite med `--test-concurrency=4` – Expected: 0 fejl.
- [x] **Step 3:** Byg `release-local-2`, start appen, kontrollér med skærmbilleder at der ikke er hvid skærm, at introen toner ud, og at proceslinjeikonet er det nye. Commit.

Start med Task 1.
