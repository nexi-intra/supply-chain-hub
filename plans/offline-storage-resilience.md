# Offline-robusthed: bevar forbindelse til datastien, arbejd lokalt ved afbrydelse, synkronisér ved genopretning

## Baggrund — hvad sker der i dag (research)

`resolveDataDir()` i `electron/main.cjs` vælger data-mappen ÉN gang ved opstart (prioritet:
env-var → `tcd-hub.config.json` → brugervalgt mappe → `<userData>/data`). Hvis det delte
netværksdrev (fx `M:\...`) forsvinder **midt i en session** (VPN falder, drevet afmonteres,
laptop går i dvale), opdager appen det IKKE — `store.dataDir` peger stadig på den nu
utilgængelige sti, og:

- **`store.get()`** (electron/store.cjs) prøver 5 gange med 100ms mellemrum, og **kaster en
  fejl** hvis alle fejler — MEN hvis hele drevet er væk, rapporterer Windows det ofte som
  `ENOENT` (samme kode som "filen findes ikke"), hvilket koden allerede fortolker som
  **"nøglen findes ikke" → returnerer `undefined`**. Det betyder at et fuldt drev-udfald i
  værste fald kan vises som **tomt bibliotek/tom brugerliste** i stedet for en tydelig fejl.
- **`store.set()`** prøver 30 gange (op til 3 sekunder blokerende), kaster så en fejl.
  `window.kv.set()` (via `withErrorToast`) fanger den og viser en fejl-toast — **men**
  `useKV.ts`'s `setValue()` kalder `window.kv.set()` uden `.catch()`, og React-state er
  **allerede optimistisk opdateret**. Brugeren ser altså ændringen i UI'et, får en kort
  fejl-toast, men **ændringen er tabt permanent** hvis de ikke selv prøver igen med det
  samme — der er ingen kø, intet retry-forsøg senere.
- **`store.watch()`**'s polling (hvert 5. sek.) sluger fejl fra `fs.readdirSync(dataDir)`
  stille (`catch { return new Map() }`) — dette er faktisk det oplagte sted at opdage
  forbindelsestab, men bruges i dag ikke til det.
- Der findes **ingen** eksisterende "er vi forbundet"-tilstand, offline-kø eller lokal
  spejl-cache nogen steder i koden (verificeret ved søgning).
- `DataStorageManager.tsx` (Manager Panel → Datalagring) viser allerede den aktive
  data-sti + kilde (env/config/user/default) — naturligt sted at vise live status.

Dette er ikke kun "manglende feature" — det er **to reelle, eksisterende risici** for
stille datatab, som denne funktion samtidig løser.

## Arkitektur-forslag

**Genbrug `createStore()` to gange**: én instans peger på netværksstien (som i dag), én
peger på en ALTID-tilgængelig lokal mappe (`<userData>/offline-cache`) — samme
kryptering, samme atomare skrivninger, ingen ny lagrings-motor at bygge/teste. En ny,
lille orkestrerings-modul (`electron/offlineSync.cjs`, uden Electron-imports ligesom
`store.cjs`, så den kan unit-testes isoleret) binder de to sammen:

- **Forbindelses-tjek genbruger den eksisterende 5-sek. polling** (`store.watch()`) i
  stedet for at tilføje endnu en timer — samme loop der allerede scanner mappen for
  ændringer, tjekker nu OGSÅ om scanningen lykkedes overhovedet.
- **Mens forbundet**: læs/skriv går til netværksstien som i dag, men enhver vellykket
  værdi spejles også (best-effort, ikke-blokerende) til den lokale cache — så cachen
  altid er nogenlunde frisk, IKKE tom, den første gang en afbrydelse sker.
- **Ved afbrydelse**: `get()` falder automatisk tilbage til lokal cache i stedet for at
  kaste/fejlfortolke. `set()`/`update()`/`delete()` anvendes med det samme på den lokale
  cache (så UI'et fungerer normalt) OG lægges i en **persisteret operations-kø**
  (gemt i selve den lokale store, så den overlever et genstart af appen).
- **Ved genopretning**: køen afspilles i rækkefølge mod netværks-stien. Array-baserede
  operationer (append/upsert/remove-by-id — som allerede er den atomare model for
  emails, ferie, noter osv.) afspilles som **operationer**, ikke som rå overskrivning af
  hele arrayet — det betyder at hvis en anden klient OGSÅ har ændret samme nøgle imens vi
  var offline, bevares begge ændringer (samme sikkerhed som den eksisterende låsefil-baserede
  `update()`-mekanisme allerede giver mellem to ONLINE klienter).
- **UI**: synligt banner/toast ved tab og genopretning + permanent lille statusindikator
  mens man er offline (ikke kun én toast der forsvinder) + udvidelse af det eksisterende
  Datalagring-panel med live status og antal ikke-synkroniserede ændringer.

## Fase 1 — Forbindelsesstatus: opdag og VIS afbrydelse (ingen offline-skriving endnu)
- [x] Udvid `store.watch()`'s polling-loop til at rapportere om `fs.readdirSync(dataDir)` reelt lykkedes (ikke kun ændrede filer)
- [x] Ny IPC-broadcast `storage:connection-changed` (connected: boolean, since: timestamp) fra main.cjs
- [x] `preload.cjs`: eksponér `onStorageConnectionChanged(callback)` + `getStorageConnectionStatus()`
- [x] Ny `src/hooks/useStorageConnection.ts` + globalt banner/toast (mount i App.tsx, ligesom `UpdateNotification`): "⚠️ Mistet forbindelse til datalageret" ved tab, "✅ Forbindelse genoprettet" ved retur, + permanent lille badge mens offline (ikke kun en engangs-toast)
- [x] `DataStorageManager.tsx`: vis live forbindelsesstatus ved siden af den eksisterende sti-visning
- [x] Håndter "appen startes mens forbindelsen allerede er nede" (ikke kun tab midt i session)
- [x] Tests for den nye connection-detection-logik (mirroring store.test.cjs-mønsteret)

## Fase 2 — Lokal spejl-cache + læse-fallback
- [x] Instantiér en ANDEN `createStore()`-instans peget på `<userData>/offline-cache` (samme kryptering/atomare skrivninger genbruges)
- [x] Ved hver vellykket netværks-læsning/-skrivning: spejl værdien til lokal cache (best-effort, blokerer ikke hovedoperationen)
- [x] Ved `get()`-fejl pga. afbrydelse: server transparent fra lokal cache i stedet for at kaste/fejlfortolke som "findes ikke"
- [x] Sikr at dette IKKE ændrer opførsel mens man er online (kun et sikkerhedsnet ved afbrydelse)
- [x] Tests: simulér netværks-udfald og verificér at læsninger stadig virker fra cache

## Fase 3 — Offline skrive-kø + gensynkronisering ved genopretning
- [x] Persisteret operations-kø (gemt i den lokale store) — `set`/`update`/`delete` mens offline lægges i køen ud over at blive anvendt lokalt med det samme
- [x] Ved genopretning: afspil køen i rækkefølge mod netværksstien — array-operationer (append/upsert/remove-by-id) afspilles som operationer via den eksisterende `update()`-mekanisme, ikke som rå overskrivning
- [x] Ryd køposter efterhånden som de lykkes; behold + vis fejlede poster tydeligt (sjældent tilfælde)
- [x] UI: toast med fremskridt ("Synkroniserer 3 ændringer…" → "✅ Synkroniseret"), Datalagring-panel viser antal afventende + manuel "Prøv igen"-knap
- [x] Tests: konkurrerende ændring fra en anden (online) klient mens vi var offline på samme nøgle — begge ændringer skal overleve

## Fase 4 — Finpudsning & kantsager
- [ ] Backoff/kredsløbsafbryder så en fejlbehæftet (men ikke helt død) sti ikke bliver banket konstant med genforsøg
- [ ] Manuel "Gensynkronisér nu"-knap i Datalagring-panelet uafhængigt af automatisk detektion
- [ ] Verificér lang offline-periode (mange køede ændringer) + genstart af appen midt i en offline-periode (køen skal overleve)
- [ ] Opdater repo-hukommelse/dokumentation med den nye arkitektur

## Efter hver fase
- `npm run build` + alle tests (electron + vitest)
- `npm run electron:build` + deploy til `TCD-Hub 1.4.2`
- Commit med beskrivende besked
