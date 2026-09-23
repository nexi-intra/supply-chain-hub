# Arcade-modulet — gennemgribende eftersyn (1.5.7)

## Baggrund: hvad er faktisk galt

Bekræftet mod de rigtige data på M: og den lokale spejl-cache, ikke gættet.

### Rod-årsag 1: den lokale spejl-cache ødelægger leaderboardet (giver "n.some is not a function")

`electron/offlineSync.cjs` spejler resultatet af en KV-opdatering ned i den lokale cache:

```js
const result = networkStore.update(key, operation)
mirrorToLocal(key, result)      // <-- forkert
```

For en **nested** opdatering (`{ op:'upsert', path:['medium'], items:[...] }`) returnerer
store'en kun **under-arrayet** for den sværhedsgrad — ikke hele objektet. Spejlet får
derfor et **fladt array** som hele nøglens værdi.

Bevist på denne maskine:

| Nøgle | På M: (rigtigt) | I spejlet (ødelagt) |
|---|---|---|
| `TCD/brickbreak-global-leaderboard` | `{easy,medium,hard,expert}` | **fladt array(1)** |

Konsekvenser:
1. Læses værdien fra spejlet (offline, langsomt drev, opstart) får spillet et fladt array.
   `Object.values(array).some(board => board.some(...))` kalder så `.some()` på et
   enkelt highscore-objekt → **"n.some is not a function"** → hele appen falder ned på
   den røde fejlskærm (`src/ErrorFallback.tsx` er en global fejlgrænse).
2. Gemmes en score mens spejlet er ødelagt, afvises den med
   `KV_INVALID_OPERATION: Stien kræver et objekt` — scoren er **tabt i stilhed**
   (kun `console.error`).

### Rod-årsag 2: hver eneste highscore-gemning giver en falsk fejl-besked

Alle fem spil gør:

```js
const updatedBoard = await upsertInNestedKvArray(key, [difficulty], [entry])  // skriver
setGlobalLeaderboard({ ...currentLeaderboard, [difficulty]: updatedBoard })   // skriver IGEN
```

`setGlobalLeaderboard` kommer fra `useKV`, og `persistKvChange` sammenligner den
gemte værdi med den værdi hook'en havde **før** upsert'en. Upsert'en har lige ændret
den — så sammenligningen fejler altid:

> "Data er ændret af en anden bruger. Genindlæs og prøv igen."

Den røde fejl-toast kommer altså hver gang man slår sin egen rekord. Samme problem i
migrerings-effekten, som både kalder `setGlobalLeaderboard(...)` og `window.kv.set(...)`.

### Rod-årsag 3: en tabt score ligger stadig på drevet som en efterladt temp-fil

`TCD/neon-snake-global-leaderboard.json.26684.….tmp` indeholder en score
(`jacob.remmer.creator`, hard, 1) der aldrig nåede at blive omdøbt på plads.

### Øvrige fund

- Highscore-gemningen er "læs, sammenlign, skriv" uden lås — to spillere der slutter
  samtidig kan sætte hinandens rekord ned.
- Play-counts skrives med `window.kv.set(hele objektet)` — to spillere samtidig
  betyder at den enes tælling forsvinder.
- Chickeninvasion tæller slet ikke spil (`endless-dodger-play-counts` findes ikke).
- Ingen af spillene pauser når vinduet mister fokus.
- Ingen tests dækker leaderboard-logik overhovedet.

---

## Fase 1 — Stop datatabet ved roden

- [x] `electron/store.cjs`: gør hele den gemte værdi tilgængelig for betroede kaldere
      (ikke kun operationens resultat), så spejling kan skrive det rigtige
- [x] `electron/offlineSync.cjs`: spejl **hele** værdien, både i `update` og `updateAsync`
- [x] Selvhelbredelse: en spejlet værdi med forkert form må aldrig spærre en skrivning
- [x] Tests i `electron/offlineSync.test.cjs` der fanger præcis denne fejl
- [x] Værktøj til at reparere allerede tabte scorer (`scripts/recover-arcade-scores.cjs`)

## Fase 2 — Ét robust leaderboard-lag i stedet for fem kopier

- [x] Nyt `src/lib/leaderboards.ts`: normalisering af både flad og opdelt form,
      frasortering af ugyldige rækker — så ingen skærm kan crashe på uventet data
- [x] Ny hook (`useLeaderboard`) der læser og lytter uden dobbeltskrivning
- [x] Fjernet de fem duplikerede migrerings-effekter
- [x] Fjernet den falske "Data er ændret af en anden bruger"-fejl
- [x] Hærdet fletningen på tværs af teams mod forkert formede data fra andre hubs
- [x] Samme normalisering i manager-panelet og på tværs-oversigten

## Fase 3 — Highscores der altid lander rigtigt

- [x] Fælles `submitHighscore` med genforsøg: højeste score vinder, uanset hvem der
      gemmer samtidig, og en score kan aldrig sættes ned
- [x] Spilleren får besked hvis gemningen fejler — i stedet for kun en linje i loggen
- [x] Play-counts skrives pr. bruger atomart, så ingen andres tælling overskrives
- [x] Chickeninvasion tæller spil som de øvrige spil
- [x] Gamle Tetris-tal regnes med i det samlede antal i stedet for at starte forfra

## Fase 4 — Selve spiloplevelsen

- [x] Pause automatisk når vinduet mister fokus, i alle fem spil
- [x] Ensartet pauseskærm og genoptag med mellemrum/P/Enter
- [x] Pausen tæller hverken med i spilletiden eller lader brikken falde videre
- [x] Brick Breaks powerup-nedtællinger står stille under pause
- [x] Tastetryk slippes ved pause, så skibet ikke driver af sted

## Fase 5 — Bevis at det virker

- [x] 28 nye unit-tests for normalisering, highscore-indsendelse og optælling
- [x] 6 nye tests i hovedprocessen for spejlingen
- [x] Hele testsuiten kørt flere gange: 149/149 og 428/428
- [ ] Byg og verificér pakken indefra
