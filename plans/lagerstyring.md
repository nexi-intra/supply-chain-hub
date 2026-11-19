# Lagerstyring (Optælling) i Supply Chain Hub – plan

> Udføres med superpowers:executing-plans i denne session (brugeren ønsker ingen subagenter). Hver fase slutter grøn og
> committes lokalt. Intet build, intet push, ingen release.

**Mål:** Nyt modul **Lagerstyring / Warehouse Management** i Hubben, kun for TCD og TRR. Modulet åbner **Optælling**
(det tidligere selvstændige program CountPoint). Hubert kan svare på optællingsspørgsmål, vise live-tal og åbne skærme.

**Arkitektur:** CountPoints hovedproces-kode flyttes til `electron/warehouse/` og kobles på Hubbens `main.cjs` med ét kald
(`registerWarehouse`). Brugeren og teamet kommer fra Hubbens session (`authService.current(sender)`), og teamet er den åbne hub.
Skærmene flyttes til `src/views/warehouse/` og åbnes som et lazy view fra en ny flise. Data ligger i hver hubs teammappe
(`<team>\lagerstyring\`), i et eget lager, adskilt fra Hubbens KV.

**Teknik:** Electron 44, React 19, Vite 7, Tailwind 4, TypeScript, node:test + vitest, exceljs, 32-bit cscript (SAP GUI Scripting).

---

## Design (godkendt af brugeren 20.10.2026)

| Emne | Beslutning |
|---|---|
| Flise | "Lagerstyring" (da) / "Warehouse Management" (en) / "Lagerstyrning" (sv) / "Varastonhallinta" (fi). Vises kun når den åbne hub er TCD eller TRR. **Ændret 20.10 (brugerens ønske):** flisen åbner Lagerstyrings egen hub-side med et felt pr. værktøj (i dag "Optælling"); Tilbage/Escape går ét niveau op. Senere værktøjer (Lager, Varemodtagelse) får et felt i `WarehouseHome.tsx` – ingen pladsholdere før de bygges. Deep links (Hubert, notifikationer) går direkte ind i Optælling |
| Login/roller | Ingen ekstra login. Hub-rollen i den åbne hub: user → bruger, manager → manager, creator → creator. Admin/status manager sættes i **Manager Panel > Rettigheder > "Optællingsroller"** (som Guide Admins). Andre hubs afvises i backend (`WAREHOUSE_TEAM_NOT_ALLOWED`) |
| Data | `Supply Chain Hub Storage\TCD\lagerstyring\` og `\TRR\lagerstyring\` (eget `createStore`, aldrig Hubbens KV-nøgler). Rapporter i `lagerstyring\rapporter`. Fælles SAP-fejltjek i `Supply Chain Hub Storage\_lagerstyring\`. Journaler/kladde lokalt i `<userData>\warehouse\`. CountPoint Storage på M: er tom (tjekket) → ingen migrering |
| Placeringsark | Kun TCD, nyeste fil i `M:\375750 - Terminal Configurations & Dispatch\4. Warehouse Management\1. Placeringer` |
| SAP | PS4 (produktion) som i CountPoint 5c1475c. QS4 kun via config/env til test |
| Sprog | Optælling på dansk og engelsk overalt (skærme, dialoger, fejl, toasts, Excel-rapporter); sv/fi får engelsk. Flise + Hubert-guide på alle 4 sprog |
| Udgår | CountPoints login, opdatering, header, brugermenu, tema-knap. Det selvstændige program udfases (ingen flere udgivelser) |
| Hubert | (1) hvordan-spørgsmål om Optælling, (2) live-tal (kun læsning, kun eget team), (3) navigation til Optælling/en optælling/Arkiv |

**Fejltekster på engelsk:** backend sender i dag `KODE: dansk detalje`. På dansk vises detaljen som nu; på engelsk vises
den engelske tekst for koden (fra `src/lib/warehouse/errors.ts`), så ingen dansk tekst slipper igennem.

**Kendt adfærd:** Hubbens secured IPC afviser et kald med `AUTH_CONTEXT_CHANGED`, hvis brugeren skifter hub, mens et
SAP-trin kører. SAP-trinnet er allerede udført; visningen genindlæses bare. Ingen ændring.

---

## Filstruktur

**Nyt i Hub (backend)** – `electron/warehouse/`
- Flyttet 1:1 fra CountPoint `electron/`: `config.cjs` (kun `placementsDir`/`sapSystem`), `countRepository`, `countService`,
  `importFile`, `journal`, `localCache`, `outlookDraft`, `piDocService`, `report`, `roles`, `sapBridge`, `sapCheckService`,
  `sapFetch`, `sapFixtures`, `sapPiDocs`, `sapShow`, `sapState`, `teams`, `core/*` + alle tests og `fixtures/`
- `sap/*.vbs` (13 SAP-scripts) og `outlook/draft.vbs` (asarUnpack, cscript kan ikke læse inde i asar)
- Nyt: `register.cjs` = `registerWarehouse({...})` (services + 70 IPC-kanaler `warehouse:*`), `hubUser.cjs` (Hub-aktør → Optælling-bruger, teamtjek) + tests
- Genbruger Hubbens `../store.cjs`, `../fileLock.cjs` (identiske kopier)
- Udgår: `hubAccess`, `session`, `updater`, `main`, `preload`, `trustedWindow`, `offlineSync`, `store`, `fileLock`

**Ændret i Hub (backend):** `electron/main.cjs` (ét kald), `electron/preload.cjs` (`electronWarehouse`-broen), `package.json`
(exceljs, test-script, `files`/`asarUnpack`)

**Nyt i Hub (frontend)**
- `src/views/warehouse/Warehouse.tsx` – modulets indgang (header med tilbage-knap, faner, SAP-indikator)
- `src/views/warehouse/*` – CountPoints views (Counts, NewCount, StatusView, Archive, Rules, SerialRules, SapCheck, Roles,
  StartStatusDialog, StatusChecklist) og `count/*`
- `src/components/warehouse/` – SapIndicator, SapActionButton, TableSelection; `SapStatusContext.tsx`
- `src/lib/warehouse/` – `errors.ts`, `format.ts`, `sapStatus.ts`, `sound.ts`, `text.ts` (da/en) + tests
- `src/types/warehouse.ts` (tidl. `types/countpoint.ts`)

**Ændret i Hub (frontend):** `src/views/Hub.tsx` (flise), `src/App.tsx` (view), `src/lib/appNavigation.ts` (`warehouse`),
`src/lib/translations.ts` (+ `.fi.json`/`.sv.json`) (flisens titel/beskrivelse), `src/lib/changelog.ts` (1.6.5)

**Hubert:** `electron/assistantAppGuide*.cjs` (guide-emner, 4 sprog), `electron/assistantCoverageManifest.cjs`,
nyt `electron/assistantWarehouse.cjs` (live-tal + navigation) + tests og træningsbank

---

## Fase 0 – Klargøring af Hub 1.6.5
- [x] Bekræft `npm ci`, Electron-binær og `tsc` i 1.6.5 (fra development-1.6.5.md fase 1)
- [x] Commit "Prepare development for version 1.6.5" (package.json, package-lock.json, plans/development-1.6.5.md)
- [x] Baseline: `node --test electron/*.test.cjs` + `npx vitest run` + `npx tsc -b` – tsc 0, vitest 1406 (+1 skip), electron 1119

## Fase 1 – Backend flyttes ind (`electron/warehouse/`)
- [x] Kopiér filerne (se Filstruktur) og `core/`, `fixtures/`, `sap/`, `outlook/`
- [x] Ret `require('./store.cjs')`/`fileLock.cjs` → `../store.cjs`/`../fileLock.cjs`; fjern `hubAccess`-afhængigheder
- [x] `npm install exceljs@^4.4.0` (npm 12: install-scripts er blokeret, exceljs har ingen)
- [x] `node --test electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs` → 186 flyttede (samme som CountPoint) + 6 nye = 192 grønne
- [x] package.json `test`: tilføj `electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs` (+ `test:warehouse`)
- [x] Commit (sammen med fase 2)

## Fase 2 – Kobling: Hub-bruger, data og IPC
- [x] TDD `hubUser.cjs`: `warehouseUser(actor, users)` → `{ email, fullName, role, team }`; kaster `WAREHOUSE_TEAM_NOT_ALLOWED`
      når `actor.activeTeam?.teamId` ikke er TCD/TRR; rolle = `actor.role` (user/manager/creator); fullName fra teamets `users`
- [x] TDD `register.cjs`: `registerWarehouse({ ipcMain, currentActor, teamDir, platformRoot, userDataDir, electron, broadcast, config, scriptsDir })`
      registrerer `warehouse:*` (68 kanaler, uden `auth:*`/`updates:*`/`app:*`); test med falsk ipcMain
      (alle kanaler registreret, fremmed hub afvist, TCD-bruger får sin mappe `<TCD>\lagerstyring`)
- [x] Teammappe via Hubbens `registeredTeamDir(...)` + `lagerstyring`; fælles SAP-tjek `platformRoot\_lagerstyring`; roller-siden læser teamets `users` (30 s cache)
- [x] Scripts: `app.asar` → `app.asar.unpacked`; package.json `asarUnpack` + `files`
- [x] Config: `supply-chan-hub.config` → `warehouse: { sapSystem, placementsDir }`; env `TCD_HUB_SAP_SYSTEM`, `TCD_HUB_SAP_FIXTURES_DIR`, `TCD_HUB_PLACEMENTS_DIR`, `TCD_HUB_OUTLOOK_FAKE_DIR`
- [x] `main.cjs`: `registerWarehouse(...)` efter links + `before-quit` venter højst 4 s på sidste scanninger; `preload.cjs`: `electronWarehouse`
- [x] Alle electron-tests grønne (1314; assistantWorker-subprocess-testen er følsom for belastning, grøn alene)

## Fase 3 – Skærmene ind i Hubben (dansk først)
- [x] Kopiér views/komponenter/lib/types; Hubbens `@/components/ui/*` (CountPoints `tabs.tsx` → `components/warehouse/ui.tsx`)
- [x] `window.countpoint` → `window.electronWarehouse`; Login, UpdateNotification, UserMenu, ThemeToggle, ThemeContext udgår; "CountPoint" → "Optælling" i tekster
- [x] `Warehouse.tsx`: header i Hub-stil + faner (Optællinger, Arkiv, Lagerregler, Serienummerregler (TCD), Tjek SAP-fejl); deep links via `consumeNavigationParams` (tab, itemId)
- [x] Flise i `Hub.tsx` (kun TCD/TRR), view `warehouse` i `App.tsx` + `appNavigation.ts` + desktop-notifikationernes view-liste; `src/lib/warehouseLabels.ts` (4 sprog)
- [x] Hubert-guide for modulet (10 opgaver, 4 sprog): `assistantAppGuideWarehouse(I18n).cjs`, `COMPONENT_FOLDERS.warehouse`
- [x] "SAP" er ikke et app-ord (EXTERNAL_SYSTEMS), så teamets egne SAP-guides stadig vinder
- [x] **Roller i Manager Panel** (brugerens ønske 20.10): kort "Optællingsroller" under Guide Admins (kun TCD/TRR); fanen Roller i Optælling er fjernet
- [x] `scripts/verify-warehouse.cjs` (PIM ingen flise + afvist, TCD-manager starter status, rolle fra Manager Panel, medarbejder ser status)
- [x] Commit "Lagerstyring: flise, Optællings-skærme og roller i Manager Panel"

## Fase 4 – Engelsk
- [x] `src/lib/warehouse/text.ts`: `t(da, en)` + `useWarehouseLanguage()`; da → dansk, en/sv/fi → engelsk. Modulet hedder "Stock count" på engelsk
- [x] Alle skærme, dialoger, toasts, tomme tilstande og labels via `t(...)`; faste tabeller er blevet funktioner, så sproget læses ved visning; `Warehouse` genmonteres ved sprogskift
- [x] `errors.ts`: dansk + engelsk tabel; engelsk viser aldrig den danske backend-detalje
- [x] Excel-rapporter (`report.cjs`): optællings- og statusrapport på dansk eller engelsk efter brugerens sprog (Excel-rapport-knappen og "Godkend og lås"); engelsk ark "Status history" (Excel reserverer "History"); tests for begge sprog
- [x] Scan efter dansk: `englishCoverage.test.ts` gennemgår kildekoden (TypeScript-AST) og fejler på dansk tekst uden for `t()`; engelsk gennemgang i dev-vindue mod midlertidige data
- [x] Rollekortet i Manager Panel: "Stock count roles" / "Inventointi" / "Inventering"; SAP-tjek-teksten peger på Manager Panel i stedet for den fjernede fane Roller
- [x] Commit "Lagerstyring: Optælling på engelsk"

## Fase 5 – E2E og live-tjek
- [x] `scripts/verify-warehouse.cjs`: midlertidig platformrod (registry + TCD/TRR/PIM-brugere), fake SAP, placeringsark, to brugere
      i hvert sit vindue: start status → optælling → scan → deltager/materiale-lås → tælleliste → godkend → SAP-dokument
      (opret/print/antal af admin fra Manager Panel/bogfør) → import → rapport → lås → Arkiv → Vis i SAP; PIM ser ingen flise.
      21 tjek grønne (porteret fra CountPoints verify-count.cjs; udklipsholder-tjek springes over, når Windows nægter den)
- [ ] **Brugerens trin** – dev-vindue mod rigtige data (kræver eget login og SAP-session; Claude taster ikke adgangskoder):
      åbn TCD-hub → Lagerstyring → tjek SAP-indikatoren (PS4/100). "Hent fra SAP" kræver en aktiv status, og en status på
      rigtige data ses af hele teamet – start den kun, hvis det er meningen (eller slet den bagefter). Ingen oprettelse i SAP
- [x] Commit "Lagerstyring: E2E"

## Fase 6 – Hubert
- [x] Guide (4 sprog): alle emner; nye opgaver "Tæl blocked og unblocked lager" og "Lange serienumre til SAP-dokumenter";
      knapnavne rettet til det, skærmene faktisk viser (dansk og engelsk, "Stock count" på engelsk). `assistantWarehouseGuide.test.cjs`
- [x] `assistantWarehouse.cjs` i hovedprocessen (ikke i workeren): læser gennem Optællings egne services som Hub-brugeren
      (`registerWarehouse(...).assistant`), så modulets regler gælder: kun TCD/TRR, kun eget team. Ny `countService.readCount`
      (læser tal, differencer, låse og områder uden at skrive – heller ikke opsummeringen). Svar: aktiv status og fremdrift,
      optællinger, materialer med difference (største værdi først), SAP-dokumenter der venter, hvem tæller hvad, seneste låste
      status med % difference. Hvordan-spørgsmål og SAP-koder (MI31, ZMS_…) går stadig til guiderne
- [x] Navigation: svaret har `navigation`, og Hubert viser knappen "Åbn Optælling" / "Åbn "status/optælling"" / "Åbn Arkiv"
      (`navigateTo('warehouse', { tab, itemId })`; chatten minimeres)
- [x] Guard: andre hubs får "kun i TCD- og TRR-hubben" uden at noget læses; skrive-ønsker ("slet/opret/lås/bogfør …") får
      "jeg kan kun læse" + knap; 4 sprog i `assistantWarehouse.test.cjs`; integrationstest i `register.test.cjs` (intet skrives);
      E2E: Hubert svarer i den rigtige app, og knappen åbner statussen
- [x] Commit "Hubert: svar om optællinger"

## Fase 7 – Afslutning
- [x] changelog 1.6.5, development-1.6.5.md (+ backlog: Lager, Varemodtagelse, live-tjek; E2E-kommando), CountPoint-README "udfaset – se Hub" (commit i CountPoint), `plans/countpoint.md` status, memory
- [x] Fuld verifikation: electron 1329/1329, vitest 1425 (+1 skip), tsc 0, E2E `verify-warehouse.cjs` 23/23; lokal commit; rapport til brugeren
- [ ] Brugerens live-tjek mod M:/SAP og aftale om push/release (se development-1.6.5.md)
