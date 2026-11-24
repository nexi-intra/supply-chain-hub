# Optælling – end-to-end test og klarmelding (Hub 1.6.5)

> Mål: Optællingsmodulet (Lagerstyring → Optælling) er gennemtestet og klar til brug 03.11.2026.
> Regel: **Intet bogføres eller oprettes i SAP.** Alle SAP-trin i test kører mod fixtures (`TCD_HUB_SAP_FIXTURES_DIR`,
> kun i upakket app), og data ligger i en midlertidig platformrod – aldrig M: eller produktionsdata.
> Parallelt arbejde: en anden session kører `lager-tegning-plan` (Placeringer/tegning) i samme mappe – rør ikke dens filer.

## Fase 1 – Sikkerhed og baseline
- [x] Bekræft at fixtures-tilstand erstatter cscript-runneren helt (`register.cjs` → `createFixtureRunner`, ingen `execFile`)
- [x] Bekræft at `sapScripts.test.cjs` kun kompilerer VBS (Quit efter `Option Explicit`)
- [x] Unit-tests backend (Electron som node, `ELECTRON_RUN_AS_NODE=1`): 369 → nu 378 (1 skip: rigtigt placeringsark)
- [x] Unit-tests frontend `vitest run src/lib/warehouse src/views/warehouse`: 72 → nu 77 grønne
- [x] Typecheck `tsc --noEmit -p tsconfig.json`: 0 fejl

## Fase 2 – Eksisterende E2E (to brugere, to Electron-vinduer, fake SAP)
- [x] Vite på port 5064 (den anden session bruger 5066)
- [x] `scripts/verify-warehouse.cjs`: 23/23 grønne (før og efter rettelserne)
- [x] Fund: "udklipsholder utilgængelig" i E2E → rodårsag: Electron 44's clipboard er async (se Fase 5)

## Fase 3 – Dybdetest ud over eksisterende E2E
- [x] Review af countService / countState / piDocService / journal / LinesPanel (10 fund, verificeret i koden – se nedenfor)
- [x] "Tjek SAP-fejl" mod rigtig SAP (brugerens kørsel 11:22 gemt i `_lagerstyring`); første fejl kunne ikke genskabes (ingen fejltekst)
- [ ] Ekstra scenarier: slet optælling, genhent fra SAP, blocked/unblocked, serienummerregler, engelsk

## Fase 4 – Klar til i morgen (kun læsning af rigtigt miljø)
- [x] `supply-chan-hub.config`: ingen `warehouse`-sektion → PS4 + standard-placeringsmappe på M:
- [x] Nyeste placeringsark (`Placeringsark_30_10_2026_13_34.xlsm`) læses: 1.256 placeringer, 13 områder, 0,56 s
- [x] 32-bit cscript findes; `status.vbs` (kun læsning) → PS4/100 klar
- [x] Udgivet version på M: er 1.6.4 – Lagerstyring findes først i 1.6.5 (ikke bygget/udgivet); `dist/` har ingen `index.html`
- [x] Beslutning (bruger): hvordan bruges 1.6.5 i morgen? → kun dev-vindue på egen PC (ingen release)
- [x] Windows-udklipsholderen nægter adgang (fejl 5) for processer startet af automatisering; brugerens egen kopiér/indsæt virker

## Fase 5 – Rettelser (TDD: failing test → rettelse → grøn)
- [x] Electron 44 clipboard: `await` + læs-tilbage før SAP startes (MI31, MI20, ZMS_LONG_SERNO, MM60, Kopiér) – `clipboardText.cjs`
- [x] Fake-SAP læser async udklipsholder; E2E's `clipboardWorks` er async
- [x] "Send til godkendelse"/"Afslut" afvises (`STORAGE_UNAVAILABLE`), når denne PC's scanninger ikke er nået til M:
- [x] Dobbelt Enter på tilbehørslinjer ("Anden placering", "Tilføj tællelinje") gemmer kun én gang (`singleFlight.ts`)
- [x] Beslutning (bruger): skal scanning efter godkendelse blokeres? → nej, behold som nu (gemmes + advarsel)

## Kendte risici (ikke rettet – sjældne samtidigheds-tilfælde, driftsråd)
- [ ] To admins lægger antal på samme SAP-dokument samtidig (`piDocService.count`) → kun én person gør SAP-trinnene
- [ ] To managers opretter overlappende optællinger i samme sekund → opret optællinger én ad gangen
- [ ] Scanning på en optælling, som en anden PC lige har afsluttet / slettet / statussen låses under rapport
- [ ] Ur-forskel mellem PC'er kan ændre rækkefølgen af rettelser (domæne-PC'er er normalt tidssynkroniserede)
- [ ] Materiale-låse udløber ikke, hvis en PC går ned → ejeren/manager frigiver låsen

## Fase 6 – Rapport og forslag
- [x] Opsummering til brugeren: hvad er testet, hvad er rettet, hvad skal brugeren selv tjekke i morgen, forslag
- [x] Beslutninger (bruger 02.11): kun dev-vindue på egen PC i morgen (ingen release); scanning efter godkendelse beholdes som nu;
      kopiér/indsæt virker for brugeren (blokeringen gælder kun processer startet af automatisering)

## I morgen – start dev-vinduet (der er ingen Node/npm på PC'en; `npm run dev` i development-1.6.5.md virker ikke her)

Luk først et evt. kørende dev-vindue via X (det nuværende har ikke dagens backend-rettelser – de kræver genstart).
Pas på: lad være med at udvikle i mappen, mens der tælles (Vite genindlæser vinduet ved hver filændring).

Terminal 1 (Vite):
```powershell
cd "C:\Supply Chain Tools\Supply Chain Hub\Supply-Chain-Hub 1.6.5"
$env:ELECTRON_RUN_AS_NODE = '1'
Start-Process .\node_modules\electron\dist\electron.exe -ArgumentList '.\node_modules\vite\bin\vite.js','--host','127.0.0.1','--port','5066','--strictPort' -NoNewWindow -Wait
```

Terminal 2 (Hub):
```powershell
cd "C:\Supply Chain Tools\Supply Chain Hub\Supply-Chain-Hub 1.6.5"
$env:ELECTRON_START_URL = 'http://127.0.0.1:5066'
& .\node_modules\electron\dist\electron.exe .
```

Tjek i vinduet: TCD-hub → Lagerstyring → Optælling, SAP-indikatoren viser "SAP klar PS4/100".
Hvis "Opret SAP-dokument" med flere materialer siger "Udklipsholderen virker ikke lige nu": vælg ét materiale ad gangen.

## Kommandoer brugt i dag (Electron som node)
- Backend: `$env:ELECTRON_RUN_AS_NODE='1'; Start-Process .\node_modules\electron\dist\electron.exe -ArgumentList '--test','<filer>' -NoNewWindow -Wait`
- Frontend: samme med `'node_modules/vitest/vitest.mjs','run','src/lib/warehouse','src/views/warehouse'`
- E2E: Vite på 5064 (som ovenfor), derefter `$env:WAREHOUSE_VERIFY_URL='http://127.0.0.1:5064'` + `'scripts/verify-warehouse.cjs'`
- Kendte ustabile tests uden for Optælling (miljø: ENOTEMPTY i %TEMP%): `electron/updater.test.cjs`, `electron/teamReadPolicy.test.cjs`, af og til `offlineSync`/`core/archive` under belastning
