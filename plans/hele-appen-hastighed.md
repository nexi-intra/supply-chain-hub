# Hele appen – gennemgang for langsomhed (1.6.7)

Oprettet 2026-11-07. Fortsættelse af [langsom-optaelling-placeringer.md](./langsom-optaelling-placeringer.md).

## Det vi ved (målt)

- At **oprette en fil på M:** koster 3–10 s (serveren). Hver gemning = mindst 2 nye filer (lås + tmp). `main.log`: gemninger 19–24 s i snit (`multiplayer:command` 26×, snit 24 s, max 51 s; `kv:update` 14×, snit 20 s; `kv:set` 9×, snit 19 s).
- **Læsning** er billig: 150–300 ms pr. rundtur. Parallelt er langt bedre end efter hinanden (2,6 s → 0,33 s).
- Synkron fil-I/O i hovedprocessen fryser HELE appen (Placeringer: 32–42 s, rettet).
- `useKV` er optimistisk (skærmen opdateres straks, gemmer i baggrunden) – problemet er kaldere, der `await`'er gemningen, og kald uden om `useKV`.

## Tjekliste pr. modul

0. **Hver knap skal vise, at der er trykket** – enten et resultat med det samme eller en indikator (spinner/"arbejder"), aldrig ingenting. (Jacob, 07.11)
1. Skærmen venter på en gemning (`await setX`, `await window.kv.*`, `await window.electron*.<skriv>`) før den lukker/skifter/viser resultat.
2. Knapper der starter et langsomt kald uden at vise, at der er trykket (ingen loading/disabled).
3. Læsninger efter hinanden i skærmen, der kunne køre parallelt.
4. Hovedprocessen: synkron fil-I/O (`*Sync`, `store.get/set/update/mutate`, `withLockedKeys`) på IPC-/timer-veje.
5. Hovedprocessen: læsninger efter hinanden, unødige gemninger (skriver uændret værdi / skriver ved hver læsning), `skipCache` uden grund.
6. Polling mod M: der kunne være sjældnere / kun når synlig.

## Fase 1 – Kortlægning (6 parallelle undersøgere, kun læsning)

- [x] A–F gennemført (ca. 90 fund). Hvert fund nedenfor er tjekket i koden; afviste fund står under "Afvist".

## Fase 2 – Rettelser, prioriteret efter effekt

### 2.0 Fælles (hele appen)
- [x] `kvArrays`-hjælperne (~55 steder) viser ændringen i alle åbne `useKV`-visninger med det samme (`kvPrediction` spejler `store.computeUpdate`); fejl → den gemte værdi vises igen. Tests i `useKV.test.ts`, `kvPrediction.test.ts`.
- [x] `Button`: returnerer `onClick` en promise, viser knappen spinner og er spærret, til den er færdig. 112 knapper (45 filer) sender nu deres promise videre (`() => void x()` → `() => x()`, kun hvor `onClick` med sikkerhed er knappens egen).
- [x] "Gemmer på det fælles drev …" nederst til venstre, mens en `window.kv`-gemning er på vej (efter 0,6 s; ikke offline).
- [x] Knapper hvor `onClick={() => void …}` står på en egen linje eller sidst i en blok – samme konvertering via TypeScript-AST (5 steder; "Stop" i Hubert bevidst udeladt).

### 2.1 Opstart (alle brugere, hver gang)
- [x] Madplan-migrationen tager den GLOBALE kontolås synkront ved hver opstart (`main.cjs` `runWrite(migrateSharedMealPlanIfNeeded)`) – opretter en låsefil på M: (3–10 s frossen hovedtråd) og blokerer andres login, selvom madplanen blev flyttet for længe siden. → tjek `meal-plan-weeks` asynkront først; kun hvis den mangler, køres den gamle vej.
- [x] To synkrone fulde mappe-scanninger lige efter vinduet vises (TCD: 730 filer = 617 ms målt; `_shared` 125 ms). → `initialScan: 'async'` (samme vej som team-skift bruger i dag).
- [x] "Hvad skete der, mens du var væk": 4 læsninger efter hinanden og vist FØRST efter tidsstemplet var gemt (23–37 s) → parallelt, vises før gemningen.

### 2.2 Knapper der venter på en gemning uden at vise det (Hub-moduler)
- [x] Projekter (deltag/forlad/færdig/slet/ret/opret, personlige to-dos), Notesbog (opret/ret/fastgør), Links (venter ikke på genindlæsning), Mail (send, ferie-godkend/afvis), Admin (indikator på slet bruger, venter ikke på genindlæsning), Creator (indikator på gem team). Ferie var allerede optimistisk (kun parallelle gemninger tilføjet).
- [x] Manager-panel (gem bruger, slet ferie venter ikke på genindlæsning; ferien forsvinder straks). Guides: Word/PDF-upload læser ikke hele filen igen (se 2.6). Login/signup: den fundne kode er kun browser-vejen – desktop bruger `electronAuth` (ikke rørt).

### 2.3 Læsninger efter hinanden → parallelt
- [x] Vagtplan (users + fødselsdage; users + user-settings), Ferie (users + fødselsdage), Notesbog (users + rolle), Admin (creator + users).
- Signup (creator + users): kun browser-vejen, ikke rørt.

### 2.4 Polling
- [x] Mail læser `users` hvert 5. s – også når vinduet er skjult. → læses ved ændring (`kv.subscribe`).
- [x] Placeringer poller hvert 15. s uden synligheds-tjek → M:-tjekket springes over, når vinduet er skjult (tjekker straks ved visning).

### 2.5 Lagerstyring – resten
- [x] Optælling: efter en handling genindlæses `open` og `state` efter hinanden → parallelt (første åbning forbliver efter hinanden: begge bygger optællingen op).
- [x] Placeringer: `ensureShelves` læser meta (forbi cachen) ved HVER oversigt → husk pr. session når migreret (test).
- [x] Placeringer: kort (materiale/plads/palle/reol) læser data → beskrivelser → historik efter hinanden → parallelt.
- [x] `rulesByTeam` læser holdenes regler efter hinanden → parallelt.

### 2.6 Billeder/filer (Guides)
- [x] Upload: gemmer og læser bagefter det hele igen for at tjekke (`fileStorage.ts`) → kontrol-læsningen fjernet (kv.set lykkes kun når filen er på plads); gamle blob-stykker læses parallelt.

### 2.7 Hovedprocessen – synkrone kald på IPC/timer
- [x] `kv:update` for `users` (opret/ret/slet bruger, rolle) GEMTE synkront (`store.mutate` → 20–40 s frossen app) → `updateUsersAsync` med samme regler og lås (test); "slet bruger" læser navnet asynkront.
- Registret (`registry.listTeams` m.fl.) har allerede en cache, der svarer straks og opdaterer i baggrunden – ikke et problem.
- [x] Backup: tre `existsSync` mod M: pr. kørsel → asynkront.

### 2.8 Spil (efter arbejdsmodulerne, grundige tests)
- [x] Træk/chat/reaktion/åbning af spil og lobby ventede på forrige træks indeks-skrivning (`await settled()`, 20+ s) → venter ikke; egne udestående poster vises i lobbyen, og heal rører ikke spil, PC'en selv skriver (test). Samling af flere indeks-skrivninger til én: ikke gjort (lav gevinst, risiko).

## Afvist / ikke rettet (med begrundelse)
- Watcherens løbende scanning "synkron" (F): forkert – den bruger `scanDirectoryAsync`. Kun første scan er synkron (2.1).
- Backup "hver klient dumper" (F): forkert – der tjekkes og låses FØR dumpen; kun én klient pr. time.
- "Materiale i fokus" (E): rettet i morges.
- `accountService` synkron `withLockedKeys` (omdøb/gendan konto): sjældne admin-handlinger, indlejrede transaktioner på tværs af stores – høj risiko, lav gevinst. Ikke rørt.

## Fase 3 – Verifikation

- [x] Alle tests: node 1643/1644 (1 skipped) inkl. `electron/warehouse/locations` og spil (73/73), vitest 1538 (1 skipped), typecheck 0 fejl, app-guide-dækning grøn.
- [x] Målinger: opstart "klar efter" 2.510–3.847 ms → 1.215 ms, og ingen `MAIN BLOCKED` ved opstart (før 2.847 ms). Optælling vist 3,4–5,0 s → 0,5 s; Placeringer-handling frøs appen 32–42 s → 15–23 ms (se `langsom-optaelling-placeringer.md`). Gemninger på M: tager stadig 12–20 s (serveren) – nu i baggrunden med "Gemmer …".
- [x] Nyt lokalt build i `release-local` (07.11, startet og kontrolleret via `main.log`).
- [x] Spil-knapper (omkamp, remis, ord-godkendelse, byt) viser spinner på den trykkede knap (`ActionChip`).

## Fase 4 – Ferie og gemninger på 80 s (07.11, efter brugerens test)

Målt i `main.log`: "giv fri dag" = 3 gemninger efter hinanden á 84 s; "slet ferie" 79 s – og ferien stod stadig i Manager-oversigten imens. Samme formiddag tog en ny fil 0,1–2,8 s at oprette → de 80 s var et overbelastet drev (backups/andre klienter), ikke koden.

- [x] Giv fri dag, ferieansøgning, forældreorlov, on/offboarding: dialogen lukker straks, mail + notifikation parallelt i baggrunden (commit 3290993).
- [x] Manager: slet/ret/godkend/afvis ferie opdaterer BÅDE afventende-listen og oversigten (`allVacations`) straks; sletning blokerer ikke andre knapper og genindlæsning viser ikke en ferie, der er ved at blive slettet.
- [x] Ferie-kalender: sletning gemte listen to gange (useKV-setter + `removeFromKvArray`) → én gang.
- [x] Alle `kvArrays`-hjælpere tæller med i "Gemmer på det fælles drev …".
- [x] Lås-hjerteslag: en async holder fornyer låsens mtime hvert 10. s (højst 10 min), og en lås med troværdig frisk mtime stjæles aldrig. Før kunne en 80 s-gemning miste låsen efter 30 s (set 05.11: "fjerner forladt laas (32s gammel)") → to skrivere i samme fil.
- [x] Luk app under gemning: vinduet bliver stående med "Gemmer dine sidste ændringer …" og lukker selv, når alt er gemt (højst 3 min, "Luk alligevel"). Før blev gemningen afbrudt efter 10 s.
- [x] Log: langsom skrivning (≥ 5 s) logges med tid pr. trin (kø | lås | læs | tmp | omdøb | frigiv), så næste langsomme gemning kan placeres præcist.
- [ ] Daglig fuld backup uden uforanderlige billeder (brugeren har sagt ja) – billederne skal stadig sikres én gang hver, før de udelades.

## Ikke gjort (bevidst) / næste skridt

- IT: undtag `...\ai Tools\Supply Chain Hub Storage\` fra on-access-scanning – hver ny fil koster 3–10 s. Den største enkeltgevinst for HELE appen.
- Kontosystemet (omdøb/gendan konto, login-lås) bruger stadig synkrone låse – sjældne handlinger, høj risiko.
- SAP-udtrækket fra lokal cache ved uændret `fetchedAt` (~1 s pr. åbning af optælling) og Placeringer-data genbrugt ved uændret `changedAt` – se `langsom-optaelling-placeringer.md` fase 3.
- Samling af flere indeks-skrivninger i spil til én.