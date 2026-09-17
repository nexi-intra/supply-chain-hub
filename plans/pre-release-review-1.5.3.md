# App-review foer 1.5.3-release - fokus: M:-forbindelse og responsivitet

Symptom: appen foeles ind imellem langsom/lagger. Hypoteser der skal efterproeves:
1) Synkron M:-I/O paa main-processens event loop (blokerer AL IPC -> UI-lag)
2) kv:get laeser ALTID fra M: (skipCache) -> hver useKV = netvaerks-rundtur
3) Watcher-polling (5s) scanner M: synkront -> periodiske hak
4) Unoedige gen-laesninger/gen-renders ved kv:changed-bursts

## Fase 1 - Kortlaegning af I/O-stien (ingen aendringer)
- [x] Laes electron/store.cjs til bunds (get/getAsync/watch/cache/offline)
- [x] Laes main.cjs KV-wiring (kv:get/get-many/set, watcher, broadcast)
- [x] Laes offlineSync.cjs (resilient wrapper)
- [x] Notér praecist hvor synkron I/O rammer main-traaden

### HOVEDFUND (aarsag til lag)
ALLE skrivninger (kv:set/update/delete) koerte SYNKRONT paa main-processens
event-loop: konto-laas paa M: -> migrations-gate-laesning -> noegle-laas
(op til 50x100ms Atomics.wait-spin!) -> writeFileSync/renameSync (op til
30x100ms sync retry) -> to laas-frigivelser. ~8 sekventielle SMB-rundture
som FRYSER AL INPUT i appen pr. gem (100ms-5s+). Ekstra dumt: metadata()/
users-laesninger lavede createStore (sync mkdirSync mod M:) pr. kald, og
kv:get sprang laese-cachen over ved HVERT opslag. Konto-laas attempts:1 gav
falske KV_LOCK_BUSY ved samtidige skrivninger/logins.

## Fase 2 - Maalrettede fixes
- [x] Asynkron skrivevej: withFileLockAsync (fileLock), setAsync/deleteAsync/
      updateAsync/keysAsync (store, delt computeUpdate), async-tvillinger i
      offlineSync (samme koe-semantik), runWriteAsync m. readControlAsync
      (accountService, attempts 10x150 ikke-blokerende), securedIpc bruger den
- [x] kv:set/delete/update/keys-IPC bruger async-vejen; main-traaden blokeres aldrig
- [x] kv:get/get-many bruger 3s-laesecachen (watcher invaliderer aendrede noegler;
      egne skrivninger opdaterer cachen) - 'users' laeses fortsat frisk
- [x] Cached store-instans for users/metadata (ingen mkdirSync pr. kald)
- [x] Login-laas: 6 korte gen-forsoeg i stedet for attempts:1 (faerre falske fejl)
- [x] Praecis KV_LOCK_BUSY-besked ved login (da/en/fi) i stedet for "Kunne ikke oprette forbindelse"

## Fase 3 - Generelt kvalitets-review
- [x] Gennemgaaet: renew kun ved app-start (ok), accountDataChanged sjaelden (ok),
      watcher allerede async, debounced broadcasts ok, updater-flow ok

## Fase 4 - Verifikation
- [x] 342/342 electron-tests (6 nye async-tvilling-tests), 69/69 vitest, tsc rent
- [ ] Manuel foelelses-test i dev + prod-build (bruger tester)
