# Plan: Laesehastighed 1.5.4 — fra 3,7 s til oejeblikkelig

## Diagnose (maalt paa M: 2026-09-17)

| Maaling | Resultat |
|---|---|
| Laes 1 lille fil (0,1 KB) | 120-370 ms (SMB-rundtur, uafhaengig af stoerrelse) |
| readdir + stat af 521 filer (= et watcher-tick) | 27 ms (billigt!) |
| 11 noegler sekventielt (forsiden i 1.5.3) | **3.751 ms** |
| 11 noegler parallelt (som 1.4.3) | **1.487 ms** |
| TCD-mappen | 519 json-filer, 41 MB (239 er fil-chunks) |

**Rodaarsag til regressionen 1.4.3 -> 1.5.3:** `MAX_CONCURRENT_READS = 1` i
`electron/store.cjs` serialiserer ALLE netvaerkslaesninger. Forsiden batcher 11
noegler i ET IPC-kald, men bagenden laeser dem en ad gangen. 1.4.3 laeste
parallelt uden begraensning.

**Sekundaere aarsager:**
- `users` laeses altid med `skipCache: true` (main.cjs kv:get) -> fuld rundtur hver gang
- Read-cache TTL er kun 3 s -> alt genlaeses fra M: hvert 3. sekund, selvom watcheren
  allerede ved hvilke filer der er aendret
- `active-sessions` ligger i `_shared` og rammes ved hvert login-tjek
- Det lokale spejl (`offline-cache`) bruges KUN naar M: er helt vaek — ikke som
  hurtig foerste kilde

**Hvorfor "mappe pr. bruger" ikke hjaelper:** den dyre del er rundturen pr. fil,
ikke mappen. Team-data (vagtplan, ferie, guides, mails) er faelles og skal ligge
et sted. Per-bruger noegler er allerede smaa og faa (~35 filer).

## Princip: laes lokalt, synk i baggrunden (som OneDrive)

Appen har allerede (a) et lokalt spejl pr. team og (b) en watcher der hvert 5. s
ved praecis hvilke filer der er aendret paa M:. Vend det om:

1. Laesninger serveres fra hukommelse/lokalt spejl -> 0 ms
2. Cache udloeber IKKE paa tid — kun naar watcheren ser en aendret mtime
3. M: rammes kun i baggrunden, og parallelt
4. Ingen ny storage-struktur paa M: -> ingen migrering, ingen risiko for 40 klienter

---

## Fase 1 — Quick wins (1.5.4, lav risiko, stor effekt) — FAERDIG

- [x] `store.cjs`: haev `MAX_CONCURRENT_READS` fra 1 til 6 (maalt: 2,5x hurtigere;
      alt er nu async saa main-traaden blokeres ikke laengere af parallelisme)
- [x] `store.cjs`: watcher-drevet cache-invalidering i stedet for 3 s TTL —
      `readCache` beholdes indtil `scanDirectoryAsync` melder noeglen aendret
      (sker allerede: `for (const key of changedKeys) readCache.delete(key)`).
      TTL bruges kun som sikkerhedsnet (60 s) hvis watcheren er doed/afbrudt.
      Cache ryddes helt ved genforbindelse. Sync `get()` laver ikke laengere
      baggrunds-readFileSync paa main-traaden pr. cache-hit naar watcheren koerer.
- [x] `main.cjs`: `users` -> drop `skipCache: true` paa IPC-laesevejen. usersStore
      oprettes med `externallyWatched: true` og invalideres af hoved-watcheren
      naar 'users' aendres. `publicUsers()`-filtrering bevares.
- [x] `store.cjs`: watcher-interval fra 5 s til 2 s (min 1 s)
- [x] Tests: 5 nye i store.test.cjs (watched cache overlever TTL og invalideres
      af watcher; unwatched udloeber; externallyWatched + invalidate; parallel)
- [x] Maalt mod M: (11 forside-noegler): koldt 3.750 -> 1.844 ms; efter 3,5 s
      3.750 -> **0 ms**

**Effekt:** forsiden ca. 2x hurtigere foerste gang, og oejeblikkelig ved
efterfoelgende navigation (alt i cache indtil noget aendres).

## Fase 2 — Stale-while-revalidate fra lokalt spejl (1.5.4) — FAERDIG

- [x] `store.cjs`: `peekCache(key)` (frisk cache-vaerdi uden I/O)
- [x] `offlineSync.cjs` `getAsync`: netvaerks-cache -> ellers lokalt spejl MED DET
      SAMME + `revalidate(key)` i baggrunden (dedupliceret pr. noegle); afviger
      M:-vaerdien opdateres spejlet og `onRevalidated([key])` fyres; slettet paa
      M: -> fjernes fra spejlet. `skipCache` gaar altid direkte til M:.
- [x] `offlineSync.cjs` `revalidateMirror({ concurrency })`: opstarts-varmning af
      alle spejlede noegler (ikke chunks/koe/allerede friske), lav parallelisme
- [x] `main.cjs`: `resilientOptions()` faelles for alle 4 stores med
      `onRevalidated: broadcastKvChanged` (debounced kv:changed);
      `scheduleMirrorWarmUp()` 1,5 s efter team-skift (team + _shared)
- [x] Renderer: `useKV` haandterer allerede `kv:changed` -> ingen aendring
- [x] Tests: 6 nye i offlineSync.test.cjs
- [x] Maalt mod M: (11 forside-noegler, ny proces med spejl): 1.343 -> **12 ms**

**Effekt:** appen foeles oejeblikkelig ved opstart — forsiden vises fra sidste
sessions data paa ~10 ms og opdateres stille inden ~1 s hvis noget er aendret.

## Fase 3 — Mindre I/O paa M: (1.5.4 eller 1.5.5)

- [ ] Flyt fil-chunks (`*_chunk_*`, `*_meta`) til undermappe `files/` i team-
      mappen saa watcheren ikke stat-er 239 chunk-filer hvert tick (bagud-
      kompatibel: laes gammel placering hvis ny mangler; ny upload skriver nyt sted)
- [ ] `active-sessions`: kun skriv ved reel aendring (ikke ved hvert heartbeat
      hvis indhold er identisk) — sammenlign JSON foer skrivning
- [ ] `accountService.readControl`: cache med watcher-invalidering i stedet for
      `skipCache: true` paa hvert secured IPC-kald

## Fase 4 — Strukturel (kun hvis fase 1-3 ikke er nok; ny mappe paa M:)

Kun vaerd at overveje hvis latensen stadig er et problem efter fase 1-3:

- [ ] Team-snapshot: en samlet `_snapshot.json` pr. team med alle smaa noegler,
      genskrevet af den klient der sidst skrev (1 rundtur ved opstart i stedet
      for 50). Kompleksitet: snapshot kan vaere forsinket; enkelt-filer er stadig
      sandheden. Kraever ny mappe/version-markoer for at koere side om side.
- [ ] (Langsigtet) En lille HTTP-tjeneste paa en server i netvaerket i stedet for
      SMB-filer — fjerner rundturs-latensen helt, men kraever hosting/IT.

---

**Anbefaling: start med Fase 1.** Det er 4 smaa, maalbare aendringer i to filer,
uden nogen aendring af data paa M:, og det fjerner den konkrete regression fra
1.4.3. Fase 2 bygger ovenpaa og goer appen oejeblikkelig.
