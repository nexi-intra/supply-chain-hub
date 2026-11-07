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

## Fase 2 – Placeringer fryser appen (fundet 07.11)

Målt på en KOPI af Placeringer-filerne i en midlertidig mappe på M: (slettet bagefter), med den rigtige kode:
én handling (fx sæt palle på plads) = **32–42 s, og hele appen fryser imens** (`withLockedKeys` er synkron).
Fordeling for én handling: 6 låsefiler oprettet = 18,9 s (op til 4,4 s hver), 2 midlertidige filer oprettet = 7,5 s,
18 læsninger = 2,5 s. **At oprette en ny fil på M: koster 3–4 s** (jf. IT-sagen i backloggen: on-access-scanning).

- [x] `withFileLocksAsync` (fileLock.cjs): samme låsefiler og ejerskab som i dag (virker sammen med 1.6.6), men alle låse oprettes parallelt, alt-eller-intet: er én optaget, slippes de andre, og hele sættet prøves igen efter jitter. Holder aldrig en lås, mens den venter → ingen dødlås med 1.6.6's låse i rækkefølge.
- [x] `withLockedKeysAsync` (store.cjs): låser async, læser nøglerne parallelt, kører den (stadig synkrone) transaktion i hukommelsen, skriver midlertidige filer parallelt og omdøber i den rækkefølge, de blev sat. Kast i transaktionen = intet skrives.
- [x] Placeringer (`transact`, `undo`, `writeDraft`) bruger den asynkrone udgave.
- [x] Tests: frisk data, låse på alle nøgler, kapabiliteter udløber, fejl skriver intet og slipper låse, event-loopet kører under transaktionen, optaget lås holdes ikke under ventetid.
- [x] Mål igen på kopi i midlertidig mappe på M: (16 tråde): **hovedtråden blokeret 15–23 ms (før 32.250–41.901 ms)**; selve handlingen 18–26 s (før 32–42 s). Tidslinje: 6 låse parallelt færdige efter 9,5 s, 2 tmp-filer 4,8–6,1 s – serveren var 5–10 s pr. ny fil under målingen.
- Afprøvet og droppet: oprette tmp-filer sammen med låsene. At skrive i en eksisterende fil er ikke billigere end at oprette (846 vs 849 ms; 2.472 vs 2.998 ms), og serveren skalerer ikke: 7 parallelle oprettelser 1,5–14 s, 14 parallelle 9–48 s. Flere filer ad gangen gør det værre. Stoppede skrive-målinger på M: for ikke at belaste drevet for andre.
- Tests: node 1638/1640 inkl. `electron/warehouse/locations` (som `npm test` ikke kører); eneste fejl er den kendte ustabile assistantWorker-timeout. Mutationstjek: "hold og vent" får den nye låse-test til at fejle.
- Kontosystemet (`accountService`, login) bruger stadig den synkrone `withLockedKeys` – egen opgave, ikke rørt her.

## Fase 3 – læsninger (forslag, efter fase 2)

- [ ] SAP-udtrækket (3,2 MB) fra lokal cache, når `meta.fetchedAt` er uændret (sparer ~1 s pr. åbning).
- [ ] Placeringer: genbrug data, når `meta.changedAt` er uændret (meta skrives sidst i en transaktion), og `ensureShelves` tjekker kun meta én gang pr. session.
- Droppet: "vis optællingen, så snart `open` er hentet" – efter fase 1 svarer `open` og `state` samtidig (~0,5 s).

## IT (ikke kode) – den største enkeltgevinst

At oprette en fil på M: tager 3–4 s (05.11: 5–9 s). Hver gemning i appen opretter mindst 2 filer (lås + midlertidig fil). Undtag `...\ai Tools\Supply Chain Hub Storage\` (`*.lock`, `*.tmp`, `*.json`) fra on-access-scanning på `\\VM-MSDK-2`.
