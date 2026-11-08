# Nisselegen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hver hverdag i december gemmer en nisse sig et nyt sted i hver hub fra kl. 10 dansk tid; den første der klikker vinder en chokolade, og Jacob (skaberen) får besked.

**Architecture:** Al logik om dage, steder og fund bor ét sted: `electron/nisse.cjs` (ren tidsplan + en "dommer"-tjeneste som high-fives). Renderer spørger main om dagens tilstand (`nisse:today`) og sender klik (`nisse:claim`); main afgør under compareAndSet på det fælles lager med M:'s tid. 24 `<NisseSpot>` placeres rundt i appen og viser kun nissen, når main siger, at den står netop dér.

**Tech Stack:** Electron (CommonJS main, `node --test`), React 19 + TypeScript (vitest, `renderToStaticMarkup`), eksisterende `createSharedStore`/`updateAsync({ op: 'compareAndSet' })`.

**Spec:** `plans/nisseleg-design.md`

## Global Constraints

- Dansk tid (`Europe/Copenhagen`) for "i dag", hverdag og kl. 10:00 – for alle, også i Finland.
- Kun hverdage mandag–fredag fra 1.12 til og med 24.12; appen regner dem ud hvert år (2026: 18 dage).
- Nissen vises fra kl. 10:00; kl. 10 kontrolleres ved klik mod M:'s tid, ikke pc'ens ur.
- Alle må vinde, også skaberen; ingen grænse for gentagne vindere. Kun den første pr. (hub, dag) vinder.
- Kun med, når juletemaet er aktivt (`useChristmas().active`); aldrig i spil, Lager, Admin eller Manager.
- Ingen stikord om nissen nogen steder (heller ikke i lågen).
- Hemmeligt: intet i `src/lib/changelog.ts`, "Nyheder" eller app-guiden; intet skrives på M: før årets første fund (tidligst 1.12 kl. 10). Nye komponenter ligger i `src/components/christmas/` (allerede `internal` i `assistantCoverageManifest.cjs`).
- Fælles nøgle: `nisse-finds-<år>` i `_shared`. IPC-kanaler: `nisse:today`, `nisse:claim`, `nisse:finds`; broadcast `nisse:changed`.
- Tekster i da/en/fi/sv (fi/sv må genbruge en for låge-fakta som i dag).

## Review Focus

- Et fund skrevet af en anden pc mens min app står åben → min nisse forsvinder og forsiden viser "fundet af …" inden for få sekunder (watcher-broadcast), uden genstart.
- Appen står åben fra 9:55 til 10:05 → nissen dukker op kl. 10:00 uden genstart, og hilsenen kommer, når man står på forsiden.
- M: utilgængeligt ved klik → venlig fejlbesked, intet "du vandt", nissen bliver stående.
- Brugeren skifter hub (manager med flere hubs) → nissen og "fundet af" følger den aktive hub, aldrig den forrige.
- Juletema slået fra → ingen nisse, ingen "fundet af"-linje, men hilsenen kl. 10 kommer stadig med knappen "Slå juletema til og vær med".

---

### Task 1: Tidsplanen – dage og steder

**Files:**
- Create: `electron/nisse.cjs` (kun schedule-delen i denne task)
- Test: `electron/nisse.test.cjs`

**Interfaces:**
- Produces (module.exports):
  - `SPOTS: { easy: string[8], medium: string[8], hard: string[8] }` med præcis disse id'er:
    easy `front-logo, front-board, front-tile, front-greeting, front-customize, front-drift, front-garland, front-sick`;
    medium `calendar, shifts, meals, email, team, todo, guides, notebook`;
    hard `knowledge, links, improvements, profile-menu, command-palette, calendar-approved, shifts-tasks, front-bottom`.
  - `danishParts(ms: number) → { year, month, day, weekday /*1=man..7=søn*/, hour, minute, date /*'YYYY-MM-DD'*/ }` via `Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Copenhagen', … })`.
  - `nisseDays(year: number) → string[]` – datoer 'YYYY-MM-DD' for man–fre 1.–24.12.
  - `spotFor(date: string, teamIndex: number) → string | null` – null hvis datoen ikke er en nissedag.
  - `startsAt(date: string) → number` – epoch ms for kl. 10:00 dansk tid den dag.

- [ ] **Step 1: Write the failing tests** (`node:test`)
  - `nisseDays(2026)` har længde 18, starter `'2026-12-01'`, slutter `'2026-12-24'`, indeholder ikke `'2026-12-05'`/`'2026-12-06'`.
  - `danishParts(Date.parse('2026-12-01T09:00:00Z')).hour === 10` (vintertid UTC+1) og `danishParts(Date.parse('2026-07-01T08:00:00Z')).hour === 10` (sommertid).
  - `startsAt('2026-12-01') === Date.parse('2026-12-01T09:00:00Z')`.
  - For hver teamIndex 0..7: de 18 steder er alle forskellige; dag 0–5 ∈ easy, 6–11 ∈ medium, 12–17 ∈ hard.
  - For hver dag: `spotFor(dag, k)` er forskellig for k = 0..7.
  - `spotFor('2026-12-05', 0) === null`, `spotFor('2026-11-30', 0) === null`.
  - Rækkefølgen er ikke den samme to år i træk: `nisseDays(2026).map(d => spotFor(d,0))` ≠ tilsvarende for 2027.
- [ ] **Step 2: Run** `node --test electron/nisse.test.cjs` – Expected: FAIL (modulet findes ikke).
- [ ] **Step 3: Implement.** Bånd: `band = Math.floor(i * 3 / n)`, `j = i - første dag i båndet`; `perm` = fast blanding af 0..7 pr. (år, bånd) med en seedet PRNG (fx mulberry32 som i `src/lib/christmas.ts`); sted = `SPOTS[band][(perm[j] + teamIndex) % 8]`.
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Nisseleg: tidsplan og steder"`

### Task 2: Dommeren (tjenesten i main)

**Files:**
- Modify: `electron/nisse.cjs` (tilføj tjenesten)
- Test: `electron/nisse.test.cjs`

**Interfaces:**
- Consumes: Task 1.
- Produces: `createNisseService({ getStore, getDirectory, listTeams, now = Date.now, driveNow, onChanged }) → { today(actor, preview?), claim(actor, input), finds(actor), invalidateDirectory() }`
  - `actor` = `authService.currentAsync(...)` (felter `email`, `role`, `homeRole`, `activeTeam: { teamId, folderName, name }`).
  - `getDirectory` som i `highFives.cjs` (giver `fullName` for e-mail).
  - `listTeams() → { teamId, name }[]`; `teamIndex` = position efter sortering på `teamId`.
  - `driveNow() → Promise<number>` (M:'s tid; implementeres i Task 3).
  - Lager-nøgle `nisse-finds-<år>`, værdi `{ finds: Array<{ teamId, teamName, date, email, name, at /*ISO*/ }> }`.
  - `today(actor, preview?: string)` → `{ status: 'off' } | { status: 'waiting', date, startsAt } | { status: 'hiding', date, spot } | { status: 'found', date, finder: { name, email, at } }`. `preview` ('YYYY-MM-DD') bruges kun når `actor.homeRole === 'creator'`, og giver altid 'hiding' (eller 'found' hvis rigtigt fundet).
  - `claim(actor, { date, spot, preview? })` → `{ result: 'won', at } | { result: 'taken', finder: { name, at } } | { result: 'preview' }`; fejlkoder `NISSE_NOT_TODAY`, `NISSE_TOO_EARLY`, `NISSE_WRONG_SPOT`, `NISSE_NO_HUB`, `NISSE_CONFLICT`.
  - `finds(actor)` → årets fund (alle hubs) hvis `actor.homeRole === 'creator'`, ellers `[]`.

- [ ] **Step 1: Write the failing tests** (falsk lager med `getAsync`/`updateAsync` der kaster `{ code: 'KV_CONFLICT' }` ved forkert `expected`; falsk `now`/`driveNow`):
  - `today` 30.11 → `{ status: 'off' }` **og** `getStore` er aldrig kaldt (intet på M: i november).
  - `today` 1.12 kl. 09:59 dansk → `waiting` med `startsAt`; kl. 10:00 → `hiding` med `spot === spotFor(date, k)`; lørdag → `off`.
  - `claim` med rigtigt sted kl. 10:01 (driveNow) → `won`; lageret har ét fund med navn fra directory.
  - Anden `claim` samme hub/dag → `taken` med første finders navn og tid; `today` → `found`.
  - To samtidige `claim` (begge læser tomt, den ene får `KV_CONFLICT`) → præcis én `won`, én `taken`.
  - `claim` når `now` siger 10:05 men `driveNow` siger 09:58 → `NISSE_TOO_EARLY`.
  - `claim` med forkert sted → `NISSE_WRONG_SPOT`; med gårsdagens dato → `NISSE_NOT_TODAY`; actor uden `activeTeam` → `NISSE_NO_HUB`.
  - To hubs samme dag → hver sit fund, begge `won`.
  - Skaber med `preview: '2026-12-16'` i november → `today` = `hiding`; `claim` → `{ result: 'preview' }`, intet skrevet. Ikke-skaber med `preview` → preview ignoreres (`off`).
  - `finds` for skaber → alle fund; for andre → `[]`.
  - `onChanged` kaldes efter `won`.
- [ ] **Step 2: Run** `node --test electron/nisse.test.cjs` – Expected: FAIL.
- [ ] **Step 3: Implement** efter `highFives.cjs`-mønstret (compareAndSet-løkke med 3 forsøg, directory med TTL). Dato i `claim` tjekkes mod `danishParts(await driveNow()).date`.
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Nisseleg: dommeren"`

### Task 3: Kobling i main og preload

**Files:**
- Modify: `electron/main.cjs` (opret tjenesten ved siden af high-fives ~linje 992; IPC-handlere; `createDebouncedBroadcast` ~linje 322: broadcast `nisse:changed` når en ændret nøgle starter med `nisse-finds-`; `QUIT_WRITE_CHANNEL_PREFIXES` ~linje 1683: tilføj `'ipc:nisse:'`)
- Modify: `electron/preload.cjs` (eksponér `window.electronNisse = { today(preview?), claim(input), finds(), onChanged(cb) }`)
- Create: `src/lib/nisse.ts` (typer + `NisseApi` på `Window`, som `src/lib/highFives.ts:61`)
- Test: `electron/nisseWiring.test.cjs`

**Interfaces:**
- Produces: `window.electronNisse?: NisseApi` med typerne fra Task 2 (`NisseToday`, `NisseClaimResult`, `NisseFind`).
- `driveNow` i main: skriv 1 byte med `r+` i `_shared/.nisse-clock` (opret én gang hvis den mangler), `fs.promises.stat` → `mtimeMs`; ved fejl brug `Date.now()` og log.
- Handlere bruger `authService.currentAsync(event.sender.id)` (ikke `sharedActor` – vi skal bruge `activeTeam` og `homeRole`). Lager: `createSharedStore(path.join(platformRoot, '_shared'))` som high-fives, med samme "utilgængelig"-tjek (`NISSE_UNAVAILABLE`).

- [ ] **Step 1: Write the failing test**: `main.cjs` indeholder `ipcMain.handle('nisse:today'`, `'nisse:claim'`, `'nisse:finds'`, `startsWith('nisse-finds-')` og `'ipc:nisse:'`; `preload.cjs` eksponerer `electronNisse` med `nisse:changed`.
- [ ] **Step 2: Run** `node --test electron/nisseWiring.test.cjs` – Expected: FAIL.
- [ ] **Step 3: Implement** koblingen.
- [ ] **Step 4: Run** testen + `npx.cmd tsc --noEmit -p .` – Expected: PASS, 0 fejl.
- [ ] **Step 5: Commit** `git commit -m "Nisseleg: kobling i main og preload"`

### Task 4: Nissen i appen (tilstand, knap, resultat)

**Files:**
- Create: `src/components/christmas/NisseContext.tsx`, `src/components/christmas/NisseSpot.tsx`, `src/lib/nisseLabels.ts`
- Modify: `src/App.tsx` (NisseProvider inde i ChristmasProvider i hovedgrenen), `src/views/Hub.tsx` (linjen "Dagens nisse blev fundet af …")
- Test: `src/components/christmas/nisse.test.tsx`

**Interfaces:**
- Consumes: `window.electronNisse` (Task 3), `useChristmas()`.
- Produces:
  - `NisseProvider({ children })` – henter `today(preview)` ved mount, på `onChanged`, ved `focus`, hvert 5. min og præcis ved `startsAt`; `preview` = `localStorage['tcd-hub:christmas-preview']`. Genhenter når aktiv hub skifter (App remounter allerede træet ved hub-skift via `hubNonce`).
  - `useNisse() → { state: NisseToday, claim(spot) }`.
  - `<NisseSpot spot={id} className?>` – renderer kun når `christmas.active && christmas.mode !== 'off' && state.status === 'hiding' && state.spot === spot`. En `<button type="button" aria-label={labels.nisse}>` med en 22 px stille nisse (tegnet SVG, samme stil som juletemaets nisse); `className` bruges til at placere den (absolut) på stedet.
  - `nisseLabels(language)` med `nisse, searching, wonTitle ('Du fandt dagens nisse! 🍫'), wonBody ('Din chokolade er på vej.'), taken(name, time) ('Nissen er allerede fundet i dag af {name} kl. {time}.'), preview ('Forhåndsvisning – dette fund tæller ikke.'), failed ('Nissen kunne ikke registreres lige nu. Prøv igen.'), foundLine(name, time) ('Dagens nisse blev fundet af {name} kl. {time}'), greetingTitle, greetingBody(hub), greetingOn ('Slå juletema til og vær med'), greetingGo ('God jagt!')` i da/en/fi/sv. Tider vises `HH:MM` dansk tid.
- [ ] **Step 1: Write the failing tests** (`renderToStaticMarkup` med `ChristmasContext.Provider` + en test-provider for nisse-tilstanden):
  - `NisseSpot spot="meals"` viser en knap med `aria-label="Nisse"` når tilstanden er `hiding/meals` og juletemaet aktivt.
  - Viser intet ved `spot="email"`, ved `found`, ved `waiting`, eller når `active=false`.
  - `nisseLabels('da').taken('Lasse', '10:42')` === `'Nissen er allerede fundet i dag af Lasse kl. 10:42.'`; alle fire sprog har alle nøgler.
  - Ingen label nævner et sted (ingen stikord): ingen af teksterne indeholder ord fra `SPOTS`-navnene (Madplan, Kalender, …).
- [ ] **Step 2: Run** `npx.cmd vitest run src/components/christmas/nisse.test.tsx` – Expected: FAIL.
- [ ] **Step 3: Implement**; klik → "Leder…" → dialog med resultatet; fejl → `failed`, nissen bliver.
- [ ] **Step 4: Run** testen + tsc – Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Nisseleg: nissen og resultatet"`

### Task 5: De 24 gemmesteder

**Files (én `<NisseSpot>` pr. sted):**
- `src/views/Hub.tsx`: `front-logo` (ved HubMark i headeren), `front-board` (dagens tavle), `front-tile` (et modulkort, der altid findes – Kalender), `front-greeting` (ved julehilsen-linjen), `front-customize` (ved "Tilpas dashboard"), `front-sick` (ved Syg-knappen), `front-bottom` (under modulgitteret, kun synlig ved rul til bunden)
- `src/components/christmas/ChristmasDecorations.tsx`: `front-drift` (i snedriven), `front-garland` (hængende på lyskæden) – kun i `full`-tilstand; disse to skal kunne klikkes (`pointer-events-auto` på nisse-knappen alene)
- `src/views/VacationCalendar.tsx`: `calendar` (header), `calendar-approved` (inde i fanen "Godkendt")
- `src/views/ShiftSchedule.tsx`: `shifts` (header), `shifts-tasks` (inde i fanen "Opgaver")
- `src/views/MealPlan.tsx`: `meals`; `src/views/EmailSystem.tsx`: `email`; `src/views/TeamOverview.tsx`: `team`; `src/views/ProjectBoard.tsx`: `todo`; `src/views/VirtualNotebook.tsx`: `notebook`; `src/views/LinkLibrary.tsx`: `links`; `src/views/Improvements.tsx`: `improvements`
- `src/views/GuideLibrary.tsx`: `guides` når `kind === 'guides'`, `knowledge` når `kind === 'knowledge'`
- `src/components/UserProfile.tsx`: `profile-menu` (inde i den åbne menu); `src/components/CommandPalette.tsx`: `command-palette` (inde i Ctrl+K-vinduet)
- Test: `src/components/christmas/nisseSpots.test.ts`

**Interfaces:**
- Consumes: `NisseSpot` (Task 4), `SPOTS` (Task 1 – testen læser listen fra `electron/nisse.cjs` via `createRequire`).
- Regler for placering: nissen kigger frem bag noget (halvt skjult af en kant/sne/ikon), dækker aldrig tekst eller en knap man skal bruge, og findes også i en tom hub uden data. Bytte et sted ud kræver ændring af `SPOTS` og testen.

- [ ] **Step 1: Write the failing test**: for hvert af de 24 id'er findes præcis én forekomst af `spot="<id>"` i `src/**/*.tsx`; ingen ukendte id'er.
- [ ] **Step 2: Run** `npx.cmd vitest run src/components/christmas/nisseSpots.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement** placeringerne.
- [ ] **Step 4: Run** testen + tsc – Expected: PASS. **Visuelt tjek** i dev-serveren med forhåndsvisning (testbruger i browserens egen lagring, som i juletemaet): gå alle 24 steder igennem ved midlertidigt at tvinge `state.spot` i NisseProvider; skærmbillede af hvert, i lyst og mørkt tema og en tom hub. Ret steder, der er for lette/svære eller dækker noget.
- [ ] **Step 5: Commit** `git commit -m "Nisseleg: de 24 gemmesteder"`

### Task 6: Julehilsenen kl. 10

**Files:**
- Create: `src/components/christmas/NisseGreeting.tsx`, `src/lib/nisseGreeting.ts`
- Modify: `src/App.tsx` (render `<NisseGreeting view={currentView} hubName={…} />` i hovedgrenen)
- Test: `src/lib/nisseGreeting.test.ts`

**Interfaces:**
- Produces: `shouldGreet({ state, view, seasonOn, shownDate }: { state: NisseToday; view: string; seasonOn: boolean; shownDate: string | null }) → boolean` – sand når `seasonOn`, `state.status` er `hiding` eller `found`, `view === 'hub'` og `shownDate !== state.date`. Vist dato huskes i `localStorage['tcd-hub:nisse-greeting']`.
- Dialog: `greetingTitle` + `greetingBody(hubName)`; knap `greetingOn` (kalder `setEnabled(true)`) når `!christmas.enabled`, ellers `greetingGo`. Vises også når juletemaet er slået fra (bruger `christmas.season`, ikke `active`).
- [ ] **Step 1: Write the failing tests**: sand på forsiden kl. 10:01 første gang; falsk i `games`, `warehouse`, `calendar`; falsk når `waiting`/`off`; falsk når `shownDate` = i dag; sand igen næste nissedag.
- [ ] **Step 2: Run** `npx.cmd vitest run src/lib/nisseGreeting.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Nisseleg: julehilsen kl. 10"`

### Task 7: Besked til Jacob

**Files:**
- Modify: `src/lib/hubNotifications.ts` (ny kind `'nisse'`, input `nisseFinds?: readonly NisseFind[]`), `src/hooks/useHubNotificationItems.ts` (hent `window.electronNisse.finds()` ved mount og på `onChanged`)
- Test: `src/lib/hubNotifications.test.ts`

**Interfaces:**
- Consumes: `NisseFind` (Task 3), `finds()` returnerer kun data til skaberen.
- Item: `id: 'nisse-<teamId>-<date>'`, `title: '🎅 {name} fandt nissen'`, `subtitle: '{teamName} · kl. {HH:MM}'` (da; tilsvarende en/fi/sv), `timestamp: Date.parse(at)`, `target: { view: 'hub' }`. Windows-notifikationen kommer via den eksisterende bro (samme id).
- [ ] **Step 1: Write the failing test**: `buildHubNotificationItems(base({ language: 'da', nisseFinds: [find] }))` giver ét item med ovenstående id/titel/undertitel; uden `nisseFinds` ingen nisse-items.
- [ ] **Step 2: Run** `npx.cmd vitest run src/lib/hubNotifications.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement**.
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Nisseleg: besked til skaberen"`

### Task 8: Lågen viser fakta om jul

**Files:**
- Modify: `src/lib/christmas.ts` (`DOORS_DA`, `DOORS_EN` → 24 fakta), `src/lib/christmas.test.ts`

**Interfaces:**
- Uændret: `doorMessage(day, language)`.
- Indhold: 24 korte fakta (≤ 220 tegn), mest dansk jul – fx nisser og risengrød, risalamande og mandelgaven, flettede julehjerter (H.C. Andersen), Lucia 13.12, julemærket (1904, Einar Holbøll), kravlenisser, flagranke, dans om juletræet, pebernødder, gløgg, julefrokost, klippe-klistre, julekalender i tv, nissehuen, juleaften d. 24. Hver fakta tjekkes mod en pålidelig kilde (fx Nationalmuseet, lex.dk) før den skrives; kilden noteres i en kommentar ved listen.
- [ ] **Step 1: Write the failing test**: 24 forskellige fakta på dansk og engelsk; ingen indeholder "nisseleg"/"gemmer"/et modulnavn (ingen stikord); hver ≤ 220 tegn; dag 1 ≠ den gamle tekst "Velkommen til december!…".
- [ ] **Step 2: Run** `npx.cmd vitest run src/lib/christmas.test.ts` – Expected: FAIL.
- [ ] **Step 3: Implement** (efter kildetjek).
- [ ] **Step 4: Run** – Expected: PASS.
- [ ] **Step 5: Commit** `git commit -m "Saesonpynt: fakta i lagen"`

### Task 9: Levering

- [ ] **Step 1:** Fuld verifikation: `npx.cmd tsc --noEmit -p .`, `npx.cmd vitest run`, `node --test --test-concurrency=4 electron/*.test.cjs electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs electron/warehouse/locations/*.test.cjs` – Expected: 0 fejl.
- [ ] **Step 2:** Tjek hemmeligholdelse: `src/lib/changelog.ts` uændret; ingen `nisse-finds-`-fil oprettes ved start i november (kør den byggede app med rigtige data, tjek `_shared` før/efter).
- [ ] **Step 3:** Code review af hele grenen (subagent), ret Critical/Important med TDD.
- [ ] **Step 4:** Byg `release-local-2` (`--config.electronDist=node_modules/electron/dist`), start appen med forhåndsvisning, find en nisse, og bekræft dialog, "fundet af"-linje og klokke-besked.

Start med Task 1.
