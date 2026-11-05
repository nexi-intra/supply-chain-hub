# Skak: bekræft trækket før det sendes – implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Et skaktræk står kun på ens egen skærm, til man trykker "Bekræft"; "Fortryd" sætter brikken tilbage – som i backgammon.

**Architecture:** Skak-skærmen (`ChessGame.tsx`) holder ét ventende træk i stedet for at sende det fra `onMove`; brættet viser det allerede lokalt. "Fortryd" bruger den eksisterende `syncKey`-nulstilling. En ren hjælper i `chessView.ts` afgør, om det ventende træk stadig gælder. Ingen ændring i regler, tjeneste eller data.

**Tech Stack:** React 19, TypeScript, vitest (node), playwright-core (E2E). Ingen nye biblioteker.

**Spec:** `plans/skak-bekraeft-design.md` (godkendt 05.11.2026).

**Start med Fase 1.**

## Global Constraints

- Ingen ændring i `electron/games/chess/rules.cjs`, `electron/multiplayer.cjs`, gemte data eller backgammon.
- Altid slået til – ingen indstilling.
- Tekster i alle fire sprog i `ChessLabels` (`src/lib/multiplayerLabels.ts`): da "Fortryd"/"Bekræft", en "Undo"/"Confirm", sv "Ångra"/"Bekräfta", fi "Peru"/"Vahvista"; hint da "Trækket er ikke sendt endnu – tryk Bekræft eller Fortryd", en "Your move is not sent yet – press Confirm or Undo", sv "Draget är inte skickat än – tryck Bekräfta eller Ångra", fi "Siirtoa ei ole vielä lähetetty – paina Vahvista tai Peru".
- Delt arbejdsmappe: andre har ucommittede filer (bl.a. `electron/multiplayer.cjs`, `electron/store.cjs`) – `git add` kun egne filer, rør aldrig deres.
- Kommandoer (npm.ps1 blokeret): `node node_modules/vitest/vitest.mjs run <fil>`, `node node_modules/typescript/bin/tsc --noEmit -p .`; E2E: Vite `node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5064 --strictPort` + `node scripts/verify-chess.cjs` (se filens topkommentar for URL/port). Stop kun egne processer (Stop-Process -Id).

## Review Focus

1. Modstanderen opgiver/tilbyder remis, mens et træk venter → det ventende træk forsvinder, brættet viser tjenestens stilling – test i Task 1 (`pendingStillValid` med ny revision).
2. Bondeforvandling: det valgte forvandlingsstykke sendes ved "Bekræft" – test i Task 1 (hjælper bevarer `promotion`) og Task 2 (E2E hvis stillingen tillader; ellers kun Task 1).
3. Dobbeltklik på "Bekræft" sender ikke to gange – Task 1: knappen er `disabled` mens `busy`; E2E i Task 2 tjekker `serverMoves()` stiger med præcis 1.
4. Escape med ventende træk fortryder (går ikke til lobbyen) – test i Task 2 (E2E).
5. "Fortryd" sender intet – test i Task 2 (E2E: `serverMoves()` uændret, brikken tilbage).

---

# Fase 1 – Skak-skærmen

### Task 1: Ventende træk med Fortryd/Bekræft

**Files:**
- Modify: `src/lib/chessView.ts` (+ `PendingMove`, `pendingStillValid`), `src/lib/chessView.test.ts`
- Modify: `src/components/chess/ChessGame.tsx` (onMove gemmer; knapper; tastatur; nulstilling)
- Modify: `src/lib/multiplayerLabels.ts` (`ChessLabels` + 4 sprog: `undo`, `confirm`, `pendingHint`)

**Interfaces:**
- Produces:
  ```ts
  // chessView.ts
  export interface PendingMove { from: string; to: string; promotion?: MultiplayerChessPromotion; revision: number }
  /** The staged move still applies: same game revision and still a legal move in the current list. */
  export function pendingStillValid(pending: PendingMove | null, revision: number, legal: readonly MultiplayerChessLegalMove[]): boolean
  ```

- [ ] **Step 1: Fejlende tests** i `chessView.test.ts`:

```ts
it('pendingStillValid keeps a staged move only while the game is unchanged and the move is still legal', () => {
  const legal = [{ from: 'e2', to: 'e4', flags: 'b', san: 'e4' }, { from: 'e7', to: 'e8', flags: 'np', promotion: 'q', san: 'e8=Q' }] as MultiplayerChessLegalMove[]
  expect(pendingStillValid(null, 3, legal)).toBe(false)
  expect(pendingStillValid({ from: 'e2', to: 'e4', revision: 3 }, 3, legal)).toBe(true)
  expect(pendingStillValid({ from: 'e2', to: 'e4', revision: 3 }, 4, legal)).toBe(false)   // opponent resigned / offered a draw
  expect(pendingStillValid({ from: 'e2', to: 'e5', revision: 3 }, 3, legal)).toBe(false)
  expect(pendingStillValid({ from: 'e7', to: 'e8', promotion: 'q', revision: 3 }, 3, legal)).toBe(true)
})
```
(Tilpas fixture-felterne til `MultiplayerChessLegalMove`'s faktiske form og `findLegal`.)

- [ ] **Step 2:** `node node_modules/vitest/vitest.mjs run src/lib/chessView.test.ts` → FAIL.
- [ ] **Step 3: Implementér** `pendingStillValid` (genbrug `findLegal`). I `ChessGame.tsx`:
  - `const [pending, setPending] = useState<PendingMove | null>(null)`; `onMove` sætter `pending` (med spillets nuværende revision) i stedet for `sendMove`.
  - Brættets `interactive` = `moveAllowed && !pending`.
  - En effekt nulstiller (`setPending(null)` + `setSyncKey(k => k + 1)`) når `!pendingStillValid(pending, revision, legalMoves)`.
  - Under brættet, når `pending`: `pendingHint` + "Fortryd" (`bgr-chip`, `ArrowCounterClockwise`) → `setPending(null)` + `setSyncKey(k => k + 1)`; "Bekræft" (`bgr-chip data-tone="primary"`, `Check`, `disabled={busy}`) → `sendMove(pending.from, pending.to, pending.promotion)` og så `setPending(null)` (ved afvisning nulstiller `sendMove` allerede brættet).
  - Tastatur: Enter (ikke i tekstfelter/chat; ikke når en dialog er åben) bekræfter; Escape fortryder før de nuværende Escape-trin.
  - Forlades skærmen, sendes intet (pending er kun state).
- [ ] **Step 4:** test → PASS; `tsc` → 0 fejl; `node node_modules/vitest/vitest.mjs run src/lib` → grøn.
- [ ] **Step 5: Commit** `Skak: et træk venter på Bekræft – Fortryd sætter brikken tilbage`

---

# Fase 2 – Test og afslutning

### Task 2: E2E, changelog og plan

**Files:**
- Modify: `scripts/verify-chess.cjs`, `src/lib/changelog.ts` (tilføj til den eksisterende `1.6.6`-post), `plans/development-1.6.6.md`, denne plan

- [ ] **Step 1: E2E**: `clickMove`/`dragMove` efterfølges af et klik på "Bekræft" (ny hjælper `confirmMove()` der også tjekker, at `serverMoves()` først stiger efter klikket). Nyt tjek før 1.e4: Anna trækker e2→e3, ser "Fortryd"/"Bekræft" og hint; `serverMoves()` er stadig 0; "Fortryd" → `e3` er tom, `e2` har den hvide bonde. Nyt tjek: et træk + **Escape** fortryder (ikke til lobbyen). Nyt tjek: et træk + **Enter** bekræfter (serverMoves +1). Bevar alle eksisterende tjek. `step('…')`-linjer som resten af filen.
- [ ] **Step 2:** Kør E2E → alle `ok - …` + slutlinjen filen udskriver ved succes.
- [ ] **Step 3:** `node node_modules/vitest/vitest.mjs run`, `tsc`.
- [ ] **Step 4:** Changelog 1.6.6: "Skak: et træk sendes først, når du trykker Bekræft – Fortryd sætter brikken tilbage (som i backgammon)". Afkryds planen og tilføj en linje i `plans/development-1.6.6.md` Fase 2.
- [ ] **Step 5: Commit** `Skak: E2E for Bekræft/Fortryd, changelog 1.6.6`
