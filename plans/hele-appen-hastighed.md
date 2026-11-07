# Hele appen – gennemgang for langsomhed (1.6.7)

Oprettet 2026-11-07. Fortsættelse af [langsom-optaelling-placeringer.md](./langsom-optaelling-placeringer.md).

## Det vi ved (målt)

- At **oprette en fil på M:** koster 3–10 s (serveren). Hver gemning = mindst 2 nye filer (lås + tmp). `main.log`: gemninger 19–24 s i snit (`multiplayer:command` 26×, snit 24 s, max 51 s; `kv:update` 14×, snit 20 s; `kv:set` 9×, snit 19 s).
- **Læsning** er billig: 150–300 ms pr. rundtur. Parallelt er langt bedre end efter hinanden (2,6 s → 0,33 s).
- Synkron fil-I/O i hovedprocessen fryser HELE appen (Placeringer: 32–42 s, rettet).
- `useKV` er optimistisk (skærmen opdateres straks, gemmer i baggrunden) – problemet er kaldere, der `await`'er gemningen, og kald uden om `useKV`.

## Tjekliste pr. modul

1. Skærmen venter på en gemning (`await setX`, `await window.kv.*`, `await window.electron*.<skriv>`) før den lukker/skifter/viser resultat.
2. Knapper der starter et langsomt kald uden at vise, at der er trykket (ingen loading/disabled).
3. Læsninger efter hinanden i skærmen, der kunne køre parallelt.
4. Hovedprocessen: synkron fil-I/O (`*Sync`, `store.get/set/update/mutate`, `withLockedKeys`) på IPC-/timer-veje.
5. Hovedprocessen: læsninger efter hinanden, unødige gemninger (skriver uændret værdi / skriver ved hver læsning), `skipCache` uden grund.
6. Polling mod M: der kunne være sjældnere / kun når synlig.

## Fase 1 – Kortlægning (6 parallelle undersøgere, kun læsning)

- [x] A–F gennemført (ca. 90 fund). Hvert fund nedenfor er tjekket i koden; afviste fund står under "Afvist".

## Fase 2 – Rettelser, prioriteret efter effekt

### 2.1 Opstart (alle brugere, hver gang)
- [ ] Madplan-migrationen tager den GLOBALE kontolås synkront ved hver opstart (`main.cjs` `runWrite(migrateSharedMealPlanIfNeeded)`) – opretter en låsefil på M: (3–10 s frossen hovedtråd) og blokerer andres login, selvom madplanen blev flyttet for længe siden. → tjek `meal-plan-weeks` asynkront først; kun hvis den mangler, køres den gamle vej.
- [ ] To synkrone fulde mappe-scanninger lige efter vinduet vises (TCD: 730 filer = 617 ms målt; `_shared` 125 ms). → `initialScan: 'async'` (samme vej som team-skift bruger i dag).

### 2.2 Knapper der venter på en gemning uden at vise det (Hub-moduler)
- [ ] Projekter, Notesbog, Links, Mail (send, ferie-godkend/afvis), Ferie (godkend/afvis/slet), Admin-/Creator-/Manager-panel (gem/slet bruger, gem team). Hvert sted: knappen viser, at den arbejder, og den efterfølgende genindlæsning venter man ikke på.

### 2.3 Læsninger efter hinanden → parallelt
- [ ] Vagtplan (users + fødselsdage; users + user-settings), Ferie (users + fødselsdage), Notesbog (noter + users + rolle), Admin (creator + users), Signup (creator + users).

### 2.4 Polling
- [ ] Mail læser `users` hvert 5. s – også når vinduet er skjult.
- [ ] Placeringer poller hvert 15. s uden synligheds-tjek og uden spærre mod overlap.

### 2.5 Lagerstyring – resten
- [ ] Optælling: efter en handling genindlæses `open` og `state` efter hinanden → parallelt.
- [ ] Placeringer: `ensureShelves` læser meta (forbi cachen) ved HVER oversigt → husk pr. session når migreret.
- [ ] Placeringer: kort (materiale/plads/palle/reol) læser data → beskrivelser → historik efter hinanden → parallelt.
- [ ] `rulesByTeam` læser holdenes regler efter hinanden → parallelt.

### 2.6 Billeder/filer (Guides)
- [ ] Upload: gemmer og læser bagefter det hele igen for at tjekke (`fileStorage.ts`) → én læsning færre pr. upload; gamle blob-stykker læses efter hinanden → parallelt.

### 2.7 Hovedprocessen – synkrone kald på IPC/timer
- [ ] `kv:update` (slet bruger) læser `users` synkront.
- [ ] Sygefravær-oprydning: `registry.listTeams` synkront (hver time).
- [ ] Backup: tre `existsSync` mod M: pr. kørsel.

### 2.8 Spil (efter arbejdsmodulerne, grundige tests)
- [ ] Træk/chat/reaktion/åbning af spil venter på forrige træks indeks-skrivning (`await settled()`); indeks-skrivninger samles ikke.

## Afvist / ikke rettet (med begrundelse)
- Watcherens løbende scanning "synkron" (F): forkert – den bruger `scanDirectoryAsync`. Kun første scan er synkron (2.1).
- Backup "hver klient dumper" (F): forkert – der tjekkes og låses FØR dumpen; kun én klient pr. time.
- "Materiale i fokus" (E): rettet i morges.
- `accountService` synkron `withLockedKeys` (omdøb/gendan konto): sjældne admin-handlinger, indlejrede transaktioner på tværs af stores – høj risiko, lav gevinst. Ikke rørt.

## Fase 3 – Verifikation

- [ ] Alle tests (inkl. `electron/warehouse/locations`), typecheck
- [ ] Målinger før/efter for de største rettelser
- [ ] Nyt lokalt build i `release-local`
