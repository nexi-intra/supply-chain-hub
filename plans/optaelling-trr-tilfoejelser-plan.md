# Optælling: TRR-tilføjelser - implementeringsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TRR (og TCD) kan tælle blocked, eksportere et materiales serienumre til Excel, importere et materialedokument fra optællingsoversigten til den ene rigtige optælling, og scanne 24-cifrede serienumre.

**Architecture:** To små rene moduler i `electron/warehouse/core/` (`serialInput.cjs` til 24 cifre, `matdocTarget.cjs` til afgørelsen af hvilken optælling et materialedokument hører til). `countService.cjs` bruger dem og får tre nye funktioner (`serialExport`, `lookupTeamMatdoc`, `importTeamMatdoc` + `teamMatdocExport`). `report.cjs` får to nye Excel-ark. Nye IPC-kanaler i `register.cjs`/`preload.cjs`, og to nye React-dele (`ExportPanel.tsx`, `TeamMatdocImport.tsx`).

**Tech Stack:** Electron 44 (CommonJS, `node --test`), React 19 + TypeScript (Vitest), exceljs.

**Spec:** [optaelling-trr-tilfoejelser-design.md](./optaelling-trr-tilfoejelser-design.md)

## Global Constraints

- Gælder TCD og TRR. Intet nyt dataformat på M:: importen skriver den eksisterende `import`-hændelse (`{ type: 'import', importId, place, area, serials, document }`), og Excel-filerne lægges i `reportsDir(team)` (`<data>/<team>/rapporter`).
- Ingen nye SAP-kørsler. Materialedokumentet hentes med `fetcher.fetchMatdoc({ team, document })` som i dag.
- 24 cifre: kun en værdi, der efter fjernede mellemrum matcher `^\d{24}$`, kortes til de sidste 18. Aldrig i `normalizeSerial`, aldrig på serienumre fra SAP, aldrig i `copySerials` (TCD's lange serienumre).
- Blocked: TCD kun D000 som i dag. TRR må tælle blocked på D001, D002, D003, enkeltvis eller sammen.
- Materialedokumentet fordeles aldrig: alt eller intet.
- Brugerrettet tekst med `t(da, en)`, uden tankestreger som bindeord.
- SAP-test kun i QS4.

## Review Focus

1. En scanning af et 24-cifret nummer i TCD's optælling må ikke ændre TCD's lange serienumre til optællingsdokumentet (`copySerials` returnerer stadig de lange). Test i Task 1: den eksisterende test `serial number rules decide per material and stock type…` skal stadig bestå uændret.
2. Et 24-cifret nummer med bogstaver eller med 23/25 cifre må ikke kortes (Task 1-test `only exactly 24 digits are shortened`).
3. En serie, der hører til to åbne optællinger på én gang (fx en gammel optælling uden status og en i statussen), må ikke importeres i en tilfældig af dem (Task 4-test `a serial in two counts is "several"`).
4. Optællingerne ændrer sig mellem opslag og import (en optælling lukkes eller oprettes): importen skal afvises, ikke ramme forkert (Task 5-test `import refuses when the target changed since the lookup`).
5. Eksport af et materiale med tusindvis af serienumre må ikke klippes ved 1000 som skærmens liste (Task 3-test `export has every serial, not the first 1000`).

---

## Fase 1 - små ændringer

### Task 1: 24-cifrede serienumre

**Files:**
- Create: `electron/warehouse/core/serialInput.cjs`, `electron/warehouse/core/serialInput.test.cjs`
- Modify: `electron/warehouse/countService.cjs` (`scan` ca. linje 964, `importSerials` ca. linje 1090), `electron/warehouse/softwareload/softwareloadService.cjs` (`serialOf` linje 302, `kifSerials` linje 1090, `search` linje 1228)
- Modify: `electron/warehouse/countService.test.cjs`, `electron/warehouse/softwareload/softwareloadService.test.cjs`

**Interfaces:**
- Produces: `scannedSerial(value: unknown): string` i `core/serialInput.cjs`. Returnerer de sidste 18 cifre, når værdien uden mellemrum er præcis 24 cifre, ellers `String(value ?? '')` uændret (den normale kontrol tager resten).

- [x] **Step 1: Skriv de fejlende tests**
  - `core/serialInput.test.cjs`:
    - `a 24-digit serial becomes its last 18 digits`: `scannedSerial('251427303201349258058038') === '303201349258058038'` og `scannedSerial(' 251427 303201349258058038 ') === '303201349258058038'`.
    - `only exactly 24 digits are shortened`: uændret for `'303201349258058038'`, 23 cifre `'51427303201349258058038'`, 25 cifre `'1251427303201349258058038'`, `'INT4300ABCDEF1234567890X'` og `''`.
  - `countService.test.cjs` `a scanned or pasted 24-digit serial counts as its last 18 digits`: `ctx.sap.serials.push(serial('303201349258058038', 'INT4300-4921-0', 'D000'))` før `newCount`. `scan(ANNA, id, { serial: '251427303201349258058038', place: 'A1.1' })` giver `outcome === 'found'` og `serial === '303201349258058038'`. `importSerials(ANNA, id, { text: '251427303201349258058038', place: 'P1', dryRun: true })` giver `found === 1`, `invalid === 0`, `unknown === 0`.
  - `softwareloadService.test.cjs` `a 24-digit terminal scan is kept as its last 18 digits`: efter samme mønster som den eksisterende scan-test. Scan `'251427303201349258058038'` og forvent, at opgavens terminal er `'303201349258058038'`. `search` med det lange nummer finder det korte.
- [x] **Step 2: Kør og se dem fejle:** `node --test electron/warehouse/core/serialInput.test.cjs electron/warehouse/countService.test.cjs electron/warehouse/softwareload/softwareloadService.test.cjs`. Forventet: serialInput kan ikke findes, de to service-tests fejler.
- [x] **Step 3: Implementér** `scannedSerial`. Brug den i `scan` (`normalizeSerial(scannedSerial(serial))`), i `importSerials` kun på tekst-grenen (`parseSerialList(text).map(scannedSerial)`, ikke på `serials`-arrayet, som kommer fra SAP), og i softwareload `serialOf`, de indtastede serienumre i `kifSerials` og `search`.
- [x] **Step 4: Kør igen:** samme kommando, alt PASS. Også den eksisterende test `serial number rules decide per material and stock type…` (Review Focus 1).
- [x] **Step 5: Commit** `feat(optaelling): 24-cifrede serienumre kortes til de sidste 18`.

### Task 2: Blocked for TRR

**Files:**
- Modify: `electron/warehouse/countService.cjs` (`newCountScope`, ca. linje 312)
- Modify: `src/views/warehouse/NewCount.tsx` (linje 27 og 70-74, 166)
- Test: `electron/warehouse/countService.test.cjs`

- [x] **Step 1: Skriv den fejlende test** `TRR counts blocked stock on D001, D002 and D003`: læg en åben TRR-status i `ctx.storeFor('TRR').set('statusser', …)` som `setup` gør for TCD. Push `stock('INT4300-4921-0-R', 'D001', 0, 2)`, `stock('INT4300-4921-0-R', 'D002', 0, 1)` og `serial('B7', 'INT4300-4921-0-R', 'D001', 'blocked')`. `trine.preview(TRINE, { scope: { type: 'slocs', slocs: ['D001', 'D002'], stockTypes: ['blocked'] } })` giver en `token`, og `createCount` giver en optælling, hvor en scanning af `B7` er `found`. TCD blocked på `['D000', 'D004']` afvises stadig med `SCOPE_INVALID` og `/D000/`.
- [x] **Step 2: Kør og se den fejle:** `node --test electron/warehouse/countService.test.cjs`. Forventet: `SCOPE_INVALID` "Blocked lager tælles kun i D000" for TRINE.
- [x] **Step 3: Implementér.** I `newCountScope` gælder D000-kravet for blocked kun, når `team === 'TCD'`. I `NewCount.tsx`: "Blocked" vises for TRR (ikke kun når teamet har D000), og storage locations låses kun til D000 for blocked, når teamet er TCD. Tilbehør er uændret.
- [x] **Step 4: Kør igen:** samme kommando PASS, og `npx.cmd tsc -b` uden fejl.
- [x] **Step 5: Commit** `feat(optaelling): TRR kan taelle blocked paa D001, D002 og D003`.

## Fase 2 - eksport

### Task 3: Eksport af et materiales serienumre

**Files:**
- Modify: `electron/warehouse/countService.cjs` (ny `serialExport` ved `materialSerials`, linje 796, og i `return`-objektet linje 1914)
- Modify: `electron/warehouse/report.cjs` (nye `buildSerialExportWorkbook`, `writeSerialExport`, eksporteres)
- Modify: `electron/warehouse/register.cjs` (ny `counts:serial-export` ved `counts:report`), `electron/preload.cjs` (counts-blokken linje 92-125), `src/types/warehouse.ts`
- Create: `src/views/warehouse/count/ExportPanel.tsx`
- Modify: `src/views/warehouse/count/CountView.tsx` (`CountTab` linje 30, faner linje 311-335)
- Test: `electron/warehouse/countService.test.cjs`, `electron/warehouse/report.test.cjs`

**Interfaces:**
- Produces:
  - `serialExport(user, id, { material }) → Promise<{ countName: string, material: string, description: string, found: SerialExportFound[], missing: SerialExportMissing[] }>`. `SerialExportFound = { serial, material, sloc, stockType, place, byName, at, source: 'scan' | 'import', document }`, `SerialExportMissing = { serial, material, sloc, stockType }`. Samme udvalg som `materialSerials` (`info.material === code && info.inScope`), men uden grænse og sorteret efter serienummer. Ukendt materiale giver `MATERIAL_NOT_FOUND`, et materiale uden serienumre giver `MATERIAL_NOT_SERIAL`.
  - `buildSerialExportWorkbook({ countName, material, description, found, missing, language }) → ExcelJS.Workbook` med fanerne `Fundet`/`Mangler` (en: `Found`/`Missing`). Kolonner da: Fundet `['Serienummer', 'Materiale', 'Storage location (SAP)', 'Lagertype', 'Fundet sted', 'Fundet af', 'Tidspunkt', 'Kilde']`, Mangler `['Serienummer', 'Materiale', 'Storage location (SAP)', 'Lagertype']`. Lagertype `Unblocked`/`Blocked`, Kilde som i den eksisterende rapport (`Scannet`, `Importeret`, `Matdok <dokument>`).
  - `writeSerialExport(data, dir, date = new Date()) → Promise<string>` med navnet `reportFileName({ name: '<countName> <material> serienumre' })` (en: `serial numbers`).
  - IPC `counts:serial-export` `{ id, material, language }` → `{ file, name }`. Preload `counts.serialExport(id, material, language)`.

- [x] **Step 1: Skriv de fejlende tests**
  - `countService.test.cjs` `export lists found and missing serials of one material`: efter `newCount` og en scanning af `N1` giver `serialExport(ANNA, id, { material: 'INT4300-4921-0' })` `found.map(s => s.serial) = ['N1']` med `place: 'A1.1'`, `source: 'scan'`, og `missing.map(s => s.serial) = ['N2']`. `R162-0717` afvises med `MATERIAL_NOT_SERIAL`.
  - `countService.test.cjs` `export has every serial, not the first 1000`: push 1500 serienumre `S0000`…`S1499` på `INT4300-4921-0` D000 før `newCount` og forvent `missing.length === 1502`.
  - `report.test.cjs` `serial export has a Found and a Missing sheet with the serial in column A`: byg arket med én fundet og én manglende, og forvent fanenavnene `['Fundet', 'Mangler']`, at A1 er `'Serienummer'`, at A2 på hver fane er serienummeret, og at Kilde for en import med `document: '4900229137'` er `'Matdok 4900229137'`.
- [x] **Step 2: Kør og se dem fejle:** `node --test electron/warehouse/countService.test.cjs electron/warehouse/report.test.cjs`.
- [x] **Step 3: Implementér** `serialExport`, `buildSerialExportWorkbook`, `writeSerialExport` og IPC-kanalen (skriver med `writeSerialExport(..., reportsDir(user.team))` og returnerer `{ file, name: path.basename(file) }` som `counts:report`). Typer og preload.
- [x] **Step 4: UI.** Ny fane `{ value: 'export', label: t('Eksport', 'Export') }` lige efter `import`, synlig for alle. `ExportPanel` viser en `NativeSelect` med optællingens materialer med serienumre (unikke `state.rows` med `serialManaged`, "materiale · beskrivelse") og knappen "Eksportér til Excel" (ikonet `FileXls`). Den kalder `counts.serialExport` og derefter `counts.openReport(result.file)`, ligesom `makeReport` i `CountView.tsx`. Fejl vises med `toast.error(errorMessage(error))`.
- [x] **Step 5: Kør igen:** samme kommando PASS, `npx.cmd tsc -b` uden fejl.
- [x] **Step 6: Commit** `feat(optaelling): eksport af et materiales serienumre til Excel`.

## Fase 3 - fælles import af materialedokument

### Task 4: Afgørelsen (ren funktion)

**Files:**
- Create: `electron/warehouse/core/matdocTarget.cjs`, `electron/warehouse/core/matdocTarget.test.cjs`

**Interfaces:**
- Produces: `matdocTarget({ serials: string[], counts: { id: string, name: string, fetchedAt: number, serials: Map<string, { material, sloc, stockType, inScope }> }[] })` →
  ```
  { outcome: 'ok' | 'mixed' | 'several' | 'outside' | 'none' | 'unknown',
    countId: string | null, countName: string | null, sloc: string | null, stockType: 'unrestricted' | 'blocked' | null,
    groups: { sloc, stockType, count }[],            // kendte serienumre pr. storage location + lagertype, sorteret
    byCount: { countId, countName, count }[],        // kendte serienumre pr. optælling, de tilhører
    rows: { serial, material, sloc, stockType, countId, countName }[],  // ukendte: material/sloc/stockType/countId = null
    unknown: number }
  ```
- Regler i denne rækkefølge:
  1. Et serienummer er "kendt", når mindst én optælling har det i `serials`. Dets storage location og lagertype tages fra den optælling, det hører til (`inScope`). Hører det ikke til nogen, tages de fra den optælling med størst `fetchedAt`, der kender det.
  2. Ingen kendte giver `unknown`.
  3. Mere end én `groups`-gruppe giver `mixed`.
  4. Et serienummer hører til hver optælling, hvor det er `inScope`. Ingen kendte hører til nogen giver `none`. Nogle kendte hører ikke til nogen giver `outside`.
  5. Mere end én optælling i `byCount` (også når samme serienummer hører til to) giver `several`.
  6. Ellers `ok` med `countId`, `countName`, `sloc` og `stockType`.

- [x] **Step 1: Skriv de fejlende tests** med to-tre håndlavede optællinger (`Map`s):
  - `one pallet in one count is ok` (2 kendte og 1 ukendt) → `outcome 'ok'`, `countId 'c1'`, `sloc 'D001'`, `stockType 'unrestricted'`, `unknown 1`.
  - `two storage locations are mixed` → `'mixed'`, `groups` `[{ sloc: 'D001', stockType: 'unrestricted', count: 2 }, { sloc: 'D002', stockType: 'unrestricted', count: 1 }]`.
  - `blocked and unblocked on one storage location are mixed` → `'mixed'`.
  - `a serial in two counts is "several"` → `'several'` med to rækker i `byCount`.
  - `terminals and accessories in two counts are "several"` → `'several'`.
  - `some serials outside every count is "outside"` → `'outside'`.
  - `no count counts the pallet is "none"` → `'none'` med `sloc` i `groups`.
  - `nothing known is "unknown"` → `'unknown'`, `countId null`.
  - `location of an unclaimed serial comes from the newest SAP figures`: kendt i c1 (fetchedAt 1, D001) og c2 (fetchedAt 2, D002), `inScope` i ingen → rækken har `sloc 'D002'`.
- [x] **Step 2: Kør og se dem fejle:** `node --test electron/warehouse/core/matdocTarget.test.cjs`.
- [x] **Step 3: Implementér** `matdocTarget` efter reglerne.
- [x] **Step 4: Kør igen:** PASS.
- [x] **Step 5: Commit** `feat(optaelling): afgoerelse af hvilken optaelling et materialedokument hoerer til`.

### Task 5: Opslag, import og fejl-eksport i service og IPC

**Files:**
- Modify: `electron/warehouse/countService.cjs` (nye funktioner ved `lookupMatdoc`, linje 1110, og i `return`-objektet)
- Modify: `electron/warehouse/report.cjs` (nye `buildMatdocSplitWorkbook`, `writeMatdocSplitExport`)
- Modify: `electron/warehouse/register.cjs`, `electron/preload.cjs`, `src/types/warehouse.ts`
- Test: `electron/warehouse/countService.test.cjs`, `electron/warehouse/report.test.cjs`

**Interfaces:**
- Consumes: `matdocTarget` (Task 4).
- Produces:
  - `lookupTeamMatdoc(user, { document })` → `{ document, transaction, serials, materials, target, canImport: boolean, reason: null | 'not-member' | 'closed' | 'locked', check: ImportCheck | null, alreadyImported: { byName, at, place } | null, importedElsewhere: { countName, byName, at, place }[] }`. Henter med `fetcher.fetchMatdoc`, åbne optællinger er `repo.listCounts(team)` med `status === 'open'` og uden `creating`, indlæses parallelt med `refresh(await load(user, id))`. Ved `ok`: `rights = await access(user, state)`, `canImport = rights.canWrite`, og `check`/`alreadyImported` som i `lookupMatdoc`. `importedElsewhere` er aktive `import`-hændelser med samme `document` i de andre åbne optællinger.
  - `importTeamMatdoc(user, { document, place, serials, countId })` → resultatet af `importSerials(user, countId, { serials, place, document, dryRun: false })` plus `{ countId, countName }`. Afgørelsen regnes igen ud fra `serials`. Er den ikke `ok` med samme `countId`, afvises importen med `MATDOC_TARGET_CHANGED` "Optællingerne har ændret sig siden opslaget. Slå dokumentet op igen".
  - `teamMatdocExport(user, { document, serials })` → `{ document, rows }` (`target.rows`).
  - `buildMatdocSplitWorkbook({ document, rows, language })`: én fane `Serienumre`/`Serial numbers`, kolonner da `['Serienummer', 'Materiale', 'Storage location (SAP)', 'Lagertype', 'Optælling']`, sorteret efter storage location, lagertype og serienummer, ukendte til sidst med lagertypen `Ukendt i SAP-tallene` (en `Unknown in the SAP figures`). `writeMatdocSplitExport(data, dir, date)` med navnet `reportFileName({ name: 'Materialedokument <document>' })` (en `Material document`).
  - IPC: `counts:team-matdoc-lookup` `{ document }`, `counts:team-matdoc-import` `{ document, place, serials, countId }`, `counts:team-matdoc-export` `{ document, serials, language }` → `{ file, name }`. Preload: `counts.teamMatdocLookup(document)`, `counts.teamMatdocImport(request)`, `counts.teamMatdocExport(document, serials, language)`. Type `TeamMatdocLookup`.

- [x] **Step 1: Skriv de fejlende tests** (stub `ctx.fetcher.fetchMatdoc` som testen ved linje 400). Push `serial('B1', 'INT4300-4921-0', 'D000', 'blocked')` før optællingerne oprettes, og opret to optællinger: D000 unblocked terminaler (Anna) og D000 blocked (Mona):
  - `team matdoc import puts a pallet in the one open count that counts it`: dokument med `N1`, `N2` → `target.outcome 'ok'`, `countId` er Annas, `canImport true`, `check.found 2`. `importTeamMatdoc(ANNA, { document, place: 'Palle 1', serials, countId })` giver `imported 2`, og Annas optælling har `N1`, `N2` fundet på `Palle 1` med `document`.
  - `blocked and unblocked on one pallet is refused`: `N1` + `B1` → `outcome 'mixed'`, og `importTeamMatdoc` afvises med `MATDOC_TARGET_CHANGED`.
  - `someone outside the count cannot import`: Bo (ikke med) får `canImport false`, `reason 'not-member'`.
  - `import refuses when the target changed since the lookup`: slå op, slet Annas optælling, og import afvises med `MATDOC_TARGET_CHANGED`.
  - `a document imported in another count is shown`: importér dokumentet i Monas optælling via `importSerials` med `document` først. Opslaget giver `importedElsewhere[0].countName` = Monas navn.
  - `report.test.cjs` `material document split sheet sorts by storage location and puts unknown last`.
- [x] **Step 2: Kør og se dem fejle:** `node --test electron/warehouse/countService.test.cjs electron/warehouse/report.test.cjs`.
- [x] **Step 3: Implementér** service-funktionerne, Excel-arket, IPC, preload og typer.
- [x] **Step 4: Kør igen:** PASS, og `npx.cmd tsc -b` uden fejl.
- [x] **Step 5: Commit** `feat(optaelling): faelles import af materialedokument`.

### Task 6: Dialog i optællingsoversigten, changelog og afprøvning

**Files:**
- Create: `src/views/warehouse/TeamMatdocImport.tsx`
- Modify: `src/views/warehouse/Counts.tsx` (knapperne linje 59-74), `src/lib/changelog.ts` (1.6.9), `plans/development-1.6.9.md` (fase 3)

**Interfaces:**
- Consumes: preload-funktionerne og `TeamMatdocLookup` fra Task 5.

- [x] **Step 1: Knap.** `SapActionButton` "Importér materialedokument" (ikonet `FileArrowDown`) ved siden af "Ny optælling", synlig for alle. Åbner `TeamMatdocImport`.
- [x] **Step 2: Dialog.** Felter: dokumentnummer og sted (påkrævet). "Slå op" kalder `teamMatdocLookup`. Visning efter `target.outcome`:
  - `ok`: optællingens navn, storage location, lagertype og samme tal som `CheckSummary` (genbrug fra `count/MatdocImport.tsx`). Advarsel ved `alreadyImported` (som i dag) og ved `importedElsewhere` ("Allerede importeret i '<navn>' af <navn> <tid> på <sted>"). Ved `canImport false` en tekst efter `reason` (fx "Du er ikke med i '<navn>'. Åbn optællingen og anmod om at være med"). "Importér <antal> på <sted>" kalder `teamMatdocImport` og viser en toast med optællingens navn.
  - `mixed`: "Serienumrene ligger forskellige steder i SAP. Ret det i SAP, og slå op igen" og fordelingen fra `groups` (fx "D001 unblocked: 40").
  - `several`: "Serienumrene hører til flere optællinger" og fordelingen fra `byCount`.
  - `outside`: "Nogle serienumre hører ikke til nogen åben optælling" og antallet.
  - `none`: "Ingen åben optælling tæller <sloc> <lagertype>".
  - `unknown`: "Ingen af serienumrene findes i de åbne optællingers SAP-tal".
  - Ved alt andet end `ok`: knappen "Eksportér til Excel" kalder `teamMatdocExport` og `openReport`.
- [x] **Step 3: Changelog.** Fire linjer i 1.6.9-posten:
  - `'Optælling: TRR kan nu tælle blocked lager på D001, D002 og D003'`
  - `'Optælling: ny fane "Eksport". Vælg et materiale og få dets serienumre i Excel, med en fane for fundne og en for manglende'`
  - `'Optælling: "Importér materialedokument" i optællingsoversigten lægger en palles serienumre i den optælling, der tæller dem. Ligger de forskellige steder i SAP, eller både blocked og unblocked, importeres intet, og du kan eksportere listen til Excel og rette det i SAP'`
  - `'Optælling og Softwareload: et serienummer på 24 cifre fra scanneren gemmes som de sidste 18 cifre, som SAP bruger'`
- [x] **Step 4: Fuld kontrol:** `npx.cmd tsc -b`, `npm.cmd run test:warehouse` og `npx.cmd vitest run`, alt bestået.
- [ ] **Step 5: Afprøv i dev-vinduet** på en lokal kopi af M:-data med `TCD_HUB_SAP_SYSTEM=QS4` (se "Local copy tests" i 1.6.8-planerne):
  - Ny optælling: blocked kan vælges for TRR.
  - Eksport: et materiale giver et ark med to faner.
  - Fælles import: et rigtigt materialedokument fra QS4 giver `ok` og importerer, og et blandet dokument giver fejl og fejl-arket.
  - Scan af et 24-cifret nummer.
- [x] **Step 6: Sæt flueben** i `plans/development-1.6.9.md` fase 3 med henvisning til denne plan, og commit `feat(optaelling): dialog til faelles import af materialedokument`.

## Resultat (27.11)

- Bygget med en hjælper pr. opgave og en gennemgang efter hver (alle godkendt), derefter en samlet gennemgang af hele grenen. Den fandt én kritisk fejl (Softwareload viste en 24-cifret scanning to gange) og tre vigtige (Fjern serienummer, import fra fil og unødige læsninger fra M:), som er rettet i én runde og gennemgået igen.
- Grenen `feature/1.6.9-optaelling-trr` ligger oven på `develop/1.6.9` (66f7fa1), uden Finlandsforsendelser og nShift. Rettet undervejs: Huberts appguide manglede zoomknappen fra guide-zoom (testfejl i `develop/1.6.9`).
- Kontrol: tsc 0 fejl, node-tests 2300/2301 (1 skip), vitest 1817 bestået (1 skip).
- Mangler: afprøvning i dev-vinduet med QS4 (Step 5).
