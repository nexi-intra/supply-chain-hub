# Kortet i "Sæt palle på plads" (Placeringer, fase 3) – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** I "Sæt palle på plads" vises den valgte plads (eller et forslag, man trykker "Vis" på) med niveau i klar tekst, et lille kort over hallen med tingen fremhævet og reolen forfra skåret ned til pladsen ± ét fag.

**Architecture:** Rene hjælpere (`peek.ts`: niveau-tekst og hvilke slots der vises; `map.ts`: `frontData` delt med kortet), `RackFront` lærer at vise et udsnit (`visibleSlots`), og en ny komponent `PlacePeek` bruges af `PutAway`, som henter `layout()`, `list()` og `mapContents()` én gang. Ingen backend-ændring.

**Tech Stack:** React 19, TypeScript, Tailwind 4, vitest (node-miljø), playwright-core (E2E). Ingen nye biblioteker.

**Spec:** `plans/lager-kort-fase3-design.md` (godkendt 05.11.2026). Baggrund: `plans/lager-kort-design.md` (fase 2).

**Start med Fase 1.**

## Global Constraints

- Ingen nye biblioteker; ingen backend- eller M:-ændringer. Tekster via `t(da, en)`, dansk først.
- "Sæt palle på plads" må ikke blive langsommere: data hentes én gang (og igen ved `version`/`drawing.version`), aldrig pr. "Vis".
- Visningen må aldrig vise en anden plads end den, der gemmes, uden teksten "Forslag – ikke valgt".
- Formularen virker som i dag uden udgivet tegning, uden kort-data eller når pladsen ikke er på tegningen.
- Editoren (`RackFront mode="edit"`) og kortet fra fase 2 ændrer ikke adfærd.
- Kommandoer (npm.ps1 er blokeret): `node node_modules/vitest/vitest.mjs run <fil>`, `node node_modules/typescript/bin/tsc --noEmit -p .`, E2E: `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5064 --strictPort` + `node scripts/verify-layout.cjs`. Stop kun processer, du selv har startet (Stop-Process -Id).

## Review Focus

1. Plads skrevet med små bogstaver/mellemrum ("c16.3 ") skal vise C16.3 – test i Task 1 (`peekOf`) og Task 4 (E2E skriver med små bogstaver).
2. Plads ved reolens kant (første/sidste fag) viser kun én nabo og intet brud – test i Task 1 (`neighbourSlots`).
3. Plads i et udtræk under en pallereol viser kun udtræks-blokken (ikke pallefagene) – test i Task 1 (`neighbourSlots`).
4. Plads på en ting ovenpå vises på mini-kortet (etage = tingens) – test i Task 1 (`peekOf().floor`).
5. Efter "Vis" på et forslag og så skrivning i feltet viser visningen igen den valgte plads – test i Task 4 (E2E).

---

# Fase 1 – Regler og udsnit

### Task 1: Rene hjælpere (`peek.ts` + `frontData`)

**Files:**
- Create: `src/lib/warehouse/layout/peek.ts`, `src/lib/warehouse/layout/peek.test.ts`
- Modify: `src/lib/warehouse/layout/map.ts` (+ `frontData`), `src/lib/warehouse/layout/map.test.ts`, `src/views/warehouse/locations/map/LocationsMap.tsx:130-142` (brug `frontData`)

**Interfaces:**
- Consumes: `MapContext`, `placeOfSlot`, `slotStatus`, `cellText`, `contentTitle`, `findSlot` (`map.ts`); `bayNo`, `pullNo` (`slots.ts`); `locationKeyOf`.
- Produces:
  ```ts
  // map.ts
  export interface FrontData { status: Record<string, SlotStatus>; content: Record<string, { text: string; title: string }>; places: number; used: number }
  export function frontData(item: LayoutItem, ctx: MapContext): FrontData
  // peek.ts
  export function levelText(item: LayoutItem, slot: LayoutSlot): string
  export function itemTitle(item: LayoutItem): string            // "Reol C" for rack, else item.name
  export function neighbourSlots(item: LayoutItem, slot: LayoutSlot): Set<string>   // slot ids shown in the peek
  export interface Peek { placeId: string; name: string; item: LayoutItem; slotId: string; floor: 'ground' | 'mezz'; level: string; title: string; visible: Set<string> }
  export function peekOf(layout: Pick<WarehouseLayout, 'items'>, place: string, ctx: MapContext): Peek | null
  ```

Regler (spec "Niveau-tekst", "Reolen forfra (udsnit)"): `levelText` – rack-slot med `level`: 1 → "gulvniveau", ellers "`N`. niveau fra gulvet"; slot med `unit` eller `section`: "hylde `shelf` fra oven"; floorrow: "gulvplads (plads til `capacity` paller)" ("1 palle" ved 1); floor: "gulvområde"; special: "". `neighbourSlots` – samme blok som sloten: pallefag (pos ± 1 i fysisk rækkefølge), udtræk (unit ± 1), sektion (section ± 1), gulvrække (pos ± 1); alle slots i de kolonner. `peekOf` – `locationKeyOf(place)`; `findSlot`; null når ikke på tegningen; `floor = item.floor ?? 'ground'`; `name` = listens navn.

- [ ] **Step 1: Fejlende tests** i `peek.test.ts` (byg en rack C med 5 fag × 4 niveauer + udtræk med 2 enheder × 3 hylder, en floorrow S med depth 2, en shelfrack, et gulvområde, en ting `floor: 'mezz'`):

```ts
it('levelText names the level in plain words', () => {
  expect(levelText(rackC, slotAt(rackC, { pos: 3, level: 1 }))).toBe('gulvniveau')
  expect(levelText(rackC, slotAt(rackC, { pos: 3, level: 3 }))).toBe('3. niveau fra gulvet')
  expect(levelText(rackC, slotAt(rackC, { unit: 1, shelf: 2 }))).toBe('hylde 2 fra oven')
  expect(levelText(shelfRack, slotAt(shelfRack, { section: 1, shelf: 4 }))).toBe('hylde 4 fra oven')
  expect(levelText(rowS, slotAt(rowS, { pos: 1 }))).toBe('gulvplads (plads til 2 paller)')
  expect(levelText(floorA, floorA.slots[0])).toBe('gulvområde')
})
it('neighbourSlots shows the bay ± 1, only one neighbour at the edge, and only the pull-out block for a pull-out shelf', () => {
  expect(cols(rackC, neighbourSlots(rackC, slotAt(rackC, { pos: 3, level: 2 })))).toEqual([2, 3, 4])
  expect(cols(rackC, neighbourSlots(rackC, slotAt(rackC, { pos: 1, level: 2 })))).toEqual([1, 2])
  const pull = neighbourSlots(rackC, slotAt(rackC, { unit: 1, shelf: 2 }))
  expect([...pull].every(id => slotById(rackC, id).unit != null)).toBe(true)
})
it('peekOf finds a typed place however it is written, and gives null off the drawing', () => {
  expect(peekOf(layout, ' c3.3 ', ctx)).toMatchObject({ placeId: 'C3.3', level: '3. niveau fra gulvet', title: 'Reol C' })
  expect(peekOf(layout, 'K1.1', ctx)).toBeNull()
  expect(peekOf(layout, 'UP1', ctx)?.floor).toBe('mezz')
})
```
Og i `map.test.ts`: `frontData` giver samme `status`/`content` som før for reol A (flyt den eksisterende forventning fra skærmen hertil: `places`, `used`, en tom plads med `text: ''`, en slot uden plads uden `content`).

- [ ] **Step 2:** `node node_modules/vitest/vitest.mjs run src/lib/warehouse/layout` → FAIL (moduler/funktioner mangler).
- [ ] **Step 3:** Implementér; `LocationsMap.tsx` bruger `frontData` i stedet for sin egen løkke (samme resultat).
- [ ] **Step 4:** Samme kommando + `tsc` → PASS / 0 fejl.
- [ ] **Step 5: Commit** `Placeringer: peek rules – level text, neighbour slots, shared frontData`

### Task 2: `RackFront` viser et udsnit

**Files:**
- Modify: `src/views/warehouse/locations/layout/RackFront.tsx`

**Interfaces:**
- Produces: ny valgfri prop `visibleSlots?: Set<string>` (kun `mode="view"`): kolonner uden synlige slots og blokke uden synlige slots udelades; rækker (niveauer) uden synlige slots udelades ikke (niveauet skal kunne aflæses). Uden prop: uændret.

- [ ] **Step 1:** Implementér filtreringen i/efter `blocksOf` (view-mode); edit-mode uændret.
- [ ] **Step 2:** `tsc` → 0 fejl; `node node_modules/vitest/vitest.mjs run src/lib/warehouse/layout` → grøn.
- [ ] **Step 3: Commit** `Placeringer: the rack front can show a cut-out (view mode)`

---

# Fase 2 – Visningen i "Sæt palle på plads"

### Task 3: `PlacePeek` og `PutAway`

**Files:**
- Create: `src/views/warehouse/locations/map/PlacePeek.tsx`
- Modify: `src/views/warehouse/locations/PutAway.tsx`, `src/views/warehouse/locations/Locations.tsx` (giv `user`, `drawing`, `version`, `onOpen` til `PutAway`)

**Interfaces:**
- Consumes: Task 1 (`peekOf`, `frontData`, `Peek`), Task 2 (`visibleSlots`), `contextOf`, `LayoutCanvas`, `RackFront`.
- Produces: `PlacePeek({ peek, ctx, layout, chosen, onChoose, onShowOnMap }: { peek: Peek | null; ctx: MapContext; layout: WarehouseLayout; chosen: boolean; onChoose?: () => void; onShowOnMap: () => void })` – `data-testid="place-peek"`.

Regler (spec "Visningen"):
- `PutAway` henter, når `drawing` findes, `layout()` + `list()` + `mapContents()` én gang og igen ved `version`/`drawing.version`; fejl → én stille linje "Kortet kunne ikke hentes" / "The map could not be loaded" under "Plads" (ingen toast).
- Hver palle har `shown: string | null` (pladsen, man sidst trykkede "Vis" på); `draft.location` ændres → `shown = null`. Vist plads = `shown ?? draft.location`.
- Hvert forslag får en lille "Vis"-knap (tilgængeligt navn "Vis <plads>", `aria-pressed` når den vises) ved siden af forslagsknappen (ingen knap i knap). Ingen "Vis" uden tegning/data.
- `PlacePeek`: overskrift `<navn> · <itemTitle> · <level>` (level udelades hvis tom); når ikke valgt: "Forslag – ikke valgt" / "Suggestion – not chosen" + knap "Vælg" / "Choose" (sætter `draft.location`); venstre: `LayoutCanvas readOnly` bredde ~240 px (`zoom` så den fylder 240 px; `floorView` = `peek.floor`, `highlight=[item.id]`, `team`); højre: `RackFront mode="view" status/content` fra `frontData`, `visibleSlots=peek.visible`, `highlight=peek.slotId`, ingen `onSlot`; link-knap "Vis på kort" / "Show on map".
- "Vis på kort": hvis nogen palle har materiale/plads/dokument udfyldt → `window.confirm(t('Forlad uden at gemme?', 'Leave without saving?'))` før `onOpen({ kind: 'map', id })`.
- Feltet ikke tomt og `peekOf` null → "Pladsen er ikke på kortet" / "The place is not on the map". Tomt felt → intet.

- [ ] **Step 1:** Implementér.
- [ ] **Step 2:** `tsc` → 0 fejl; `node node_modules/vitest/vitest.mjs run src/lib/warehouse` → grøn.
- [ ] **Step 3:** (anbefalet) manuelt: Vite + `node scripts/verify-layout.cjs --open`.
- [ ] **Step 4: Commit** `Placeringer: Sæt palle på plads shows the place on a small map and the rack front`

---

# Fase 3 – E2E og afslutning

### Task 4: E2E, changelog og planer

**Files:**
- Modify: `scripts/verify-layout.cjs` (ny `putAwayPeek(page)` efter `mapForEveryone`), `src/lib/changelog.ts` (tilføj punkt til 1.6.6-posten), `plans/development-1.6.6.md`, `plans/lager-tegning-plan.md` (Task 21–23), denne plan.

- [ ] **Step 1: `putAwayPeek(page)`** som anna: Placeringer → "Sæt palle på plads"; materiale `R162-0717` + Enter → forslag; skriv `a1.9` (små bogstaver) i "Plads" → `place-peek` viser "A1.9", et niveau-tekst-match (`/niveau|gulv|hylde/`), et `svg[aria-label="Tegning af lageret"]` i visningen og cellen A1.9 med `outline-amber-500`; "Vis <andet forslag>" → overskriften skifter, "Forslag – ikke valgt" synlig; skriv i feltet igen → "Forslag – ikke valgt" væk og den skrevne plads vises; "Vælg" på et vist forslag sætter feltet; skriv `K1.1` → "Pladsen er ikke på kortet"; skærmbilleder `33-saet-paa-plads-visning`, `34-saet-paa-plads-forslag`. `console.log('ok - sæt på plads: …')` pr. blok.
- [ ] **Step 2:** Kør E2E → "ALLE TJEK OK"; se skærmbillederne.
- [ ] **Step 3:** Hele suiten: `node --test electron/*.test.cjs electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs electron/warehouse/locations/*.test.cjs`, `node node_modules/vitest/vitest.mjs run`, `tsc` (kendt ustabil: `assistantWorker.test.cjs` – kør alene igen).
- [ ] **Step 4:** Changelog 1.6.6: "Nyt: Sæt palle på plads viser pladsen på et lille kort over hallen og reolen forfra med niveauet (fx "3. niveau fra gulvet") – tryk "Vis" ved et forslag for at se det, før du vælger".
- [ ] **Step 5:** Afkryds planer; **Commit** `Placeringer: E2E for the put-away peek, changelog 1.6.6`
