# Langsom Optælling og Placeringer – årsager og rettelser (1.6.7)

Oprettet 2026-11-07. Måle-scripts (kun læsning, mod de rigtige data på M:) ligger i sessionsmappen, ikke i repo.

## Målt (07.11, morgen, TCD)

| Hvad | Tid |
|---|---|
| Åbn optælling som i dag (læsninger efter hinanden) | 2.591 ms |
| De samme læsninger parallelt | 328 ms |
| SAP-udtræk (`count-…-expected.json`, 3,2 MB) | 1.023 ms |
| Én opdatering af en åben optælling (cache 3 s udløbet) | 665 ms |
| Én gemning på M: (lås + tmp + rename + oprydning) | ~2.000 ms nu; 20.000–50.000 ms i `main.log` i travle perioder |
| Lille læsning mens 6 store kører – Electron, 4 tråde / 16 tråde | 959 ms / 197 ms |
| Placeringer: meta + alle data (kold) | 257 + 1.479 ms |

## Årsager

1. **`getState` venter på at gemme resuméet på M:**, før optællingen vises (`await saveSummary`). Sker altid ved første åbning og igen hvert 10. s–2. min. En gemning koster 2–50 s.
2. **Ca. 12 læsninger fra M: efter hinanden** i `load` / `openCount` / `getState` / `access`.
3. **Kun 4 tråde (libuv) til al fil-I/O i hele appen** – watchere, gemninger og læsninger står i samme kø, når M: er langsom.
4. Lagerstyringens stores har ingen watcher → cachen holder kun 3 s → hver opdatering (hvert 1,5 s) læser 5 filer igen.

## Fase 1 – de målte årsager

- [x] `getState` venter ikke på at gemme resuméet (gemmer i baggrunden; fejl ignoreres som før). Test: `getState` svarer, selvom gemningen hænger.
- [x] Læs parallelt i `load`, `openCount`, `getState` og `access` (samme data, samme fejlhåndtering). Test: læsningerne kører samtidig.
- [x] Flere tråde til fil-I/O: `UV_THREADPOOL_SIZE=16` øverst i `electron/main.cjs` (verificeret i Electron: 959 → 197 ms).
- [x] Log langsomme Lagerstyrings-kald (≥ 2 s) i `main.log` med kanalnavn, så næste runde bygger på rigtige tal fra brug.
- [x] Tests (node 1466/1467 – kun kendt ustabil assistantWorker-timeout), typecheck 0 fejl. Målt med den rigtige optællingskode mod rigtige data (skrivninger spærret, resumé-gemning simuleret med målte 2 s): optælling vist efter 4.957 / 3.362 ms før → 498 / 485 ms efter.

## Fase 2 – efter måling fra rigtig brug (forslag)

- [ ] SAP-udtrækket (3,2 MB) fra lokal cache, når `meta.fetchedAt` er uændret (sparer ~1 s pr. åbning).
- [ ] Længere cache for lagerstyringens filer (watcher på mappen eller ændringsstempel), så opdateringer ikke læser 5 filer hvert 1,5 s.
- [ ] Placeringer: `ensureShelves` tjekker kun meta én gang pr. session (sparer ~260 ms pr. åbning).
- [ ] Optællingsskærmen vises, så snart `open` er hentet (tallene udfyldes bagefter).
