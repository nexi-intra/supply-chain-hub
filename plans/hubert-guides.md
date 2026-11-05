# Hubert × Guide Bibliotek – så Hubert virkelig kan hjælpe ud fra guiderne

Brugerønske (2026-10-02): "fokus på guide biblioteket som det eneste … test på test på test … rigtig god opdatering af guidebiblioteket-guiden samt Supply Chain Hub – den komplette håndbog … det er derfor jeg ville have Hubert ind i hubben".

Regler: TDD (RØD test først), syntetiske testdata (ingen guidetekst/personer fra produktion i tests), produktion (M:) må KUN læses – udgivelse af guides kræver brugerens eksplicitte ja. Ingen commit/release.

## Udgangspunkt (læst fra produktion, kun læsning)
- 75 guides: 72 team-guides (TCD 17, TRR 54, BPO 1) + 3 delte.
- **19 guides er rene Word-dokumenter** (kemi-datablade, quick guides): 0 sektioner → Hubert indekserer kun titlen og kan ikke svare ud fra indholdet.
- Mange trin-guides har meget lidt tekst (indholdet ligger i billeder) → tekstsøgning rammer kun hvis ordene står i trin/overskrift.
- Mange guides er på engelsk, mens spørgsmålene ofte stilles på dansk → ingen deterministisk oversættelse af søgeord.
- Søgningen kræver eksakte ord: "terminalen" ≠ "terminal", "kreditnotaen" ≠ "kreditnota".
- Svar = op til 3 enkelt-trin; et "hvordan gør jeg"-spørgsmål får ikke hele proceduren.
- Håndbogen (v1.xx) er forældet: gamle spilnavne, intet forbedringsmodul, Hubert-funktioner fra før runde 1–7.

## Fase 1 – Testbank og måling
- [x] Ny `electron/assistantGuideBank.test.cjs` (syntetisk korpus, 17 tests inkl. fremtidssikring: ny/rettet/delt/Word-guide forstås med det samme).
- [x] Skrivebeskyttet probe mod de rigtige guides. Baseline: **21/58 (36 %)**.

## Fase 2 – Bedre guidesøgning
- [x] Nyt `electron/assistantGuideSearch.cjs`: let stemming, korte danske rødder, sammensatte ord, modelnumre, da/en/fi-fagordliste, IDF-vægtning, "bløde" ord.
- [x] Hele proceduren (op til 30 trin), billed-trin markeres, budget til 4096-token-modellen.
- [x] Routing: produkt-/systemguides slår app-vejledning; spørgsmål uden modulord går til guides før fritekstsøgning; værnet blokerer ikke guideopslag; definitionsspørgsmål går til guides.

## Fase 3 – Word-guides
- [x] `electron/docxText.cjs` (synkront, afgrænset). Alle 21 rigtige Word-guides kan nu søges (før: 0).

## Fase 4 – Guidernes indhold
- [x] Håndbogen omskrevet (20 sektioner/80 trin, hvert faktum kontrolleret mod 1.5.9).
- [x] Guidebiblioteks-guiden opdateret (10 sektioner/36 trin, nyt afsnit "Spørg Hubert" + "Skriv guides, som Hubert kan finde", diagrammer bevaret).
- [x] Fælles `scripts/sharedGuidePublisher.cjs`: tør kørsel som standard, `--publish` kræves.
- [ ] **Udgivelse til produktion afventer brugerens ja.**

## Fase 5 – Regression
- [x] Probe: sæt 1 **58/58**, uafhængigt sæt **64/65**, Word-indhold **12/12**, nye guides **7/7**.
- [x] tsc OK, vitest 668/668, Electron 585/585, build OK.
