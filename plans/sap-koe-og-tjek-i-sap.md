# SAP-kø, klient 100 og "Tjek i SAP" (1.6.8)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Mål:** PI-skrivninger går altid til PS4/QS4 på klient 100, to SAP-scripts kan aldrig tage hinandens session, bogføringen læser ikke udklipsholderen igen, en lukket MI31 efter F8 giver "ukendt", og en manager kan slå et ukendt dokument op i SAP med én knap.

**Arkitektur:** Køen i `sapBridge.cjs` holdes fra et skrivescript starter, til det har sin egen session og har overladt skærmen til brugeren (linjen `{"stage":"waiting"}` på stdout). Klienten sendes til alle scripts som `COUNTPOINT_SAP_CLIENT`. "Tjek i SAP" er et nyt script, der kun læser (MI22 og MI20). Det udfylder afklaringsdialogen, og manageren gemmer selv.

**Teknik:** Electron (CommonJS), VBScript (SAP GUI Scripting, 32-bit cscript), React og TypeScript, node:test og vitest.

**Spec:** `plans/arbejdsvaerktoejer-gennemgang.md`, punkt 5.3, 5.4, 7.1 og QS4-punkt 12 (afsnittet "QS4-test 24.11.2026" med de nye fund om `session-not-created` og samtidige scripts).

## Global Constraints

- Worktree `C:\Supply Chain Tools\Supply Chain Hub\Supply-Chain-Hub 1.6.8`, branch `develop/1.6.8`. Commits er lokale, intet pushes.
- Ingen test eller kørsel må skrive til PS4. SAP-kørsler sker kun i QS4, og først i Fase 5 sammen med Jacob.
- Skrivescripts trykker aldrig selv F8, Gem, Post eller Update Count. Det gør brugeren.
- Den forventede klient er `'100'` (`EXPECTED.client` i `sapState.cjs`).
- Linjen ved overdragelse er præcis `{"stage":"waiting"}`. Det sidste JSON-svar er stadig den sidste linje på stdout.
- Nye danske tekster i appen bruger ikke tankestreger som bindeled mellem sætninger.
- `npm` er blokeret. Kør: `node --test electron/warehouse/*.test.cjs electron/warehouse/core/*.test.cjs electron/warehouse/locations/*.test.cjs electron/warehouse/softwareload/*.test.cjs electron/warehouse/softwareload/core/*.test.cjs`, `node --test electron/*.test.cjs`, `node node_modules/typescript/bin/tsc --noEmit -p .`, `node node_modules/vitest/vitest.mjs run`.
- Commit-beskeder skrives til en fil (UTF-8 uden BOM) og bruges med `git commit -F`, med trailer `Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>`.

## Review Focus

- To SAP-jobs på samme PC samtidig (en PI-skrivning og en Softwareload-flytning eller en hentning): det andet job må først starte, når PI-scriptet har sin session, og må ikke vente i 15 minutter.
- Et script, der dør eller fejler før `{"stage":"waiting"}`: køen skal altid slippes.
- To forbindelser til samme system (PS4/100 og PS4/200): scriptet skal tage den med klient 100, også når den ikke er den sidste.
- MI31 lukket mens SAP arbejder efter F8: aldrig "intet oprettet", når SAP kan have oprettet.
- "Tjek i SAP" med flere dokumenter på samme reference: appen må ikke selv vælge ét af dem.

---

## Fase 1: Køen holdes til overdragelsen, og SAP tjekkes før hver skrivning

### Task 1: Runner med klient og linjer undervejs, kø med overdragelse

**Files:**
- Modify: `electron/warehouse/sapBridge.cjs`
- Modify: `electron/warehouse/sapPiDocs.cjs`
- Modify: `electron/warehouse/register.cjs` (runneren får `client`)
- Test: `electron/warehouse/sapBridge.test.cjs`, `electron/warehouse/sapPiDocs.test.cjs`

**Interfaces:**
- Produces: `createCscriptRunner({ ..., client = '100' })` sætter `COUNTPOINT_SAP_CLIENT` i scriptets miljø. `runScript(name, args, { timeoutMs, onLine })` kalder `onLine(objekt)` for hver linje på stdout, der er JSON med feltet `stage`, mens scriptet kører.
- Produces: `bridge.handOver(job)` hvor `job(release)` returnerer et promise. Køen holdes, til `release()` kaldes eller jobbet slutter (også ved fejl).
- Produces: hver skrivning i `createPiDocWriter` (opret både prøvekørsel og oprettelse, print, serienumre, antal, bogføring, sletning) kører gennem `bridge.handOver`, kører først `status` og `computeSapState(..., { system, client: '100' })`, og afviser med `SAP_NOT_READY` (med `sapState`), når SAP ikke er klar. `onWaiting()` kaldes ved `{"stage":"waiting"}` og ikke før.

- [x] Skriv tests: runneren sætter `COUNTPOINT_SAP_CLIENT`. `onLine` får `{stage:'waiting'}` før scriptet slutter. Et `exclusive`-job sat i kø under en `handOver` starter først efter `release()`. Køen slippes, når jobbet kaster en fejl før `release()`. En PI-skrivning med SAP ikke klar afviser med `SAP_NOT_READY` og kører intet skrivescript. `onWaiting` kaldes ikke, når scriptet fejler før overdragelsen.
- [x] Kør testene og se dem fejle.
- [x] Implementér. `execFile` beholdes, og stdout læses linje for linje via `child.stdout.on('data')`.
- [x] Kør alle lagertests og electron-tests, og se dem bestå.
- [x] Commit.

### Task 2: Scripts vælger system og klient, venter længere på sessionen og melder overdragelsen

**Files:**
- Modify: `electron/warehouse/sap/pidoc-create.vbs`, `pidoc-print.vbs`, `pidoc-serials.vbs`, `pidoc-count.vbs`, `pidoc-post.vbs`, `pidoc-delete.vbs`, `sap-show.vbs`, `sl-transfer.vbs`, `sl-block.vbs`
- Test: `electron/warehouse/sapPiDocs.test.cjs` (kildetekst-tests som dem for `logonLanguage`), `electron/warehouse/softwareload/softwareloadSap.test.cjs` hvis nødvendigt

**Interfaces:**
- Consumes: `COUNTPOINT_SAP_CLIENT` fra Task 1.
- Produces: alle ni scripts læser klienten med `CreateObject("WScript.Shell").Environment("PROCESS")("COUNTPOINT_SAP_CLIENT")` og afslutter med fejlen `arguments`, når den er tom. Forbindelsen er den første, hvor både `Info.SystemName` og `Info.Client` passer (`Exit For`). Efter `CreateSession` ventes op til 30 sekunder (300 gange 100 ms) på den nye session, og sessionen afvises med `wrong-system`, medmindre både system og klient passer.
- Produces: de seks PI-scripts skriver `{"stage":"waiting"}` på stdout lige før ventesløjfen, hvor brugeren får skærmen. `pidoc-create.vbs` gør det kun i tilstanden `create`.

- [x] Skriv kildetekst-tests: hvert af de ni scripts læser `COUNTPOINT_SAP_CLIENT`, sammenligner `Info.Client` i forbindelsesløkken og efter `CreateSession`, og venter 300 gange. De seks PI-scripts skriver stage-linjen før ventesløjfen.
- [x] Kør testene og se dem fejle.
- [x] Ret de ni scripts.
- [x] Kør alle lagertests og se dem bestå.
- [x] Commit.

## Fase 2: Bogføringen læser ikke udklipsholderen igen

### Task 3: MI22 efter bogføring udfyldes med et interval, ikke fra udklipsholderen

**Files:**
- Modify: `electron/warehouse/sap/pidoc-post.vbs`
- Modify: `electron/warehouse/sapPiDocs.cjs` (`postDocuments`)
- Modify: `electron/warehouse/sapBridge.cjs` (kommentaren om PI-skrivninger og køen)
- Test: `electron/warehouse/sapPiDocs.test.cjs`

**Interfaces:**
- Produces: ny brug `pidoc-post.vbs <system> <year> <outDir> <listFile> <statusFile> <waitSeconds> <doc> <low> <high> [clipboard]`. `<low>` og `<high>` er det mindste og største af dokumentnumrene. MI22 udfyldes med `IM_IBLNR-LOW = low` og `IM_IBLNR-HIGH = high`, og begge tjekkes med `Check`. MI20 bruger stadig udklipsholderen til flere dokumenter. Passer tredje forsøg i `UploadClipboard` ikke, afsluttes med `multiple-selection-failed`.
- `postDocuments` filtrerer allerede MI22-listen på de valgte numre og melder numre, MI22 ikke viser, som ukendte. Det beholdes.

- [x] Skriv tests: `postDocuments` sender low og high (talmæssigt mindst og størst, også når listen ikke er sorteret). Et dokument i intervallet, som ikke er valgt, påvirker ikke resultatet. Kildetekst: MI22-delen kalder ikke `UploadClipboard`.
- [x] Kør testene og se dem fejle.
- [x] Implementér.
- [x] Kør alle lagertests og se dem bestå.
- [x] Commit.

## Fase 3: MI31 lukket efter F8

### Task 4: Lukket vindue slås op i MI22 på referencen

**Files:**
- Modify: `electron/warehouse/sap/pidoc-create.vbs`
- Modify: `electron/warehouse/sapPiDocs.cjs` (kun hvis `beforeF8` skal kende den nye fejl)
- Test: `electron/warehouse/sapPiDocs.test.cjs`

**Interfaces:**
- Produces: i ventesløjfen husker scriptet, om sessionen har været optaget (`Busy`) eller har forladt skærm 1000. Lukker brugeren vinduet, åbner scriptet en ny session på samme forbindelse og slår referencen op i MI22, kun med visning (som `pidoc-post.vbs` gør efter et lukket vindue). Findes dokumenter, gemmes listen, og svaret er `{"ok":true}`. Findes intet, og sessionen har været optaget, er svaret `closed-unknown`. Findes intet ellers, er svaret `cancelled` som i dag. Kan den nye session ikke åbnes, er svaret `closed-unknown`, hvis sessionen har været optaget, ellers `cancelled`.
- `closed-unknown` er ikke i `beforeF8`, så appen melder `PIDOC_UNKNOWN`.

- [x] Skriv tests: `createDocument` med svaret `closed-unknown` kaster `PIDOC_UNKNOWN`. Med `{"ok":true}` og en MI22-liste efter et lukket vindue returneres dokumenterne. Kildetekst: løkken husker `Busy`, og MI22-opslaget efter lukning bruger referencen.
- [x] Kør testene og se dem fejle.
- [x] Implementér.
- [x] Kør alle lagertests og se dem bestå.
- [x] Commit.

## Fase 4: "Tjek i SAP"

### Task 5: Script og service, der kun læser, og et forslag til afklaringen

**Files:**
- Create: `electron/warehouse/sap/pidoc-check.vbs`
- Modify: `electron/warehouse/sapBridge.cjs` (`SCRIPTS` får `'pidoc-check'`)
- Modify: `electron/warehouse/sapPiDocs.cjs` (ny `checkDocument`)
- Modify: `electron/warehouse/piDocService.cjs` (ny `check`)
- Modify: `electron/warehouse/register.cjs` (kanalen `pidocs:check`)
- Test: `electron/warehouse/sapPiDocs.test.cjs`, `electron/warehouse/piDocService.test.cjs`, `electron/warehouse/register.test.cjs`

**Interfaces:**
- Produces: `pidoc-check.vbs <outDir> <mi22File> <mi20File> <year> <reference> <docNo|->` åbner sin egen session på systemet fra `COUNTPOINT_SAP_SYSTEM` og klienten fra `COUNTPOINT_SAP_CLIENT`. Den gemmer MI22 for referencen (`IM_INVNU-LOW`, plant D301). Er `<docNo>` ikke `-`, gemmer den også MI20 for dokumentet (plant D301, året). En tom MI20 (skærm 1000) giver ingen fil og feltet `"mi20":"empty"`. Kræver engelsk logon. Svar `{"ok":true,...}`.
- Produces: `writer.checkDocument({ reference, docNo, year })` kører gennem `bridge.exclusive` med samme `status`-tjek som skrivningerne og returnerer `{ docs: [{ docNo, materials, active }], counted: [material] }`. `active` er sand, når MI22's status indeholder "active".
- Produces: `piDocs.check(user, id, docId)` med samme ret som `resolve` (manager, dokumentet er `unknown`). Returnerer `{ outcome: 'saved' | 'missing' | null, docNo, reason, summary }`:
  - Trin `create`: præcis ét dokumentnummer på referencen giver `saved` med det nummer. Intet giver `missing`. Flere giver `null`, og `summary` nævner numrene.
  - Trin `count`: alle materialer i `sapUnknown.materials` står som talt i MI20, eller dokumentet er ikke længere aktivt, giver `saved`. Ingen af dem giver `missing`. Nogle af dem giver `null`.
  - Trin `post`: dokumentet er ikke aktivt i MI22 giver `saved`, aktivt giver `missing`, og ikke fundet giver `null`.
  - `reason` begynder med `Tjek i SAP <dd.mm.yyyy hh:mm>:` og siger kort, hvad MI22 og MI20 viste. SAP ændres ikke, og intet gemmes.
- Produces: IPC-kanalen `pidocs:check` med `{ id, docId }`.

- [x] Skriv tests for `checkDocument` (fil-svar via en falsk runner), for `check` på de tre trin, flere dokumenter, rettigheder og et dokument, der ikke er ukendt, og for at kanalen er registreret.
- [x] Kør testene og se dem fejle.
- [x] Implementér.
- [x] Kør alle lagertests og electron-tests, og se dem bestå.
- [x] Commit.

### Task 6: Knappen i afklaringsdialogen

**Files:**
- Modify: `src/views/warehouse/count/DocPanel.tsx` (`ResolveDialog`)
- Modify: preload og typer for `electronWarehouse.pidocs` (find stedet med `pidocs.resolve`)
- Modify: `src/views/warehouse/count/PiDocsSection.tsx`: knapperne Print, Læg antal på, Bogfør og Slet i SAP bliver `SapActionButton` (5.3, trin 5)
- Test: den eksisterende vitest-fil for DocPanel eller PiDocsSection

**Interfaces:**
- Consumes: `pidocs:check` fra Task 5.
- Produces: `ResolveDialog` får knappen "Tjek i SAP" (`SapActionButton`). Svaret udfylder valget, dokumentnummeret og begrundelsen, og `summary` vises over valgene. Manageren trykker selv "Gem afklaringen". Ved `outcome: null` udfyldes kun begrundelsen. Fejl vises i dialogen.

- [x] Skriv tests: knappen kalder `check` og udfylder valg, nummer og begrundelse. `null` vælger intet. En fejl vises.
- [x] Kør testene og se dem fejle.
- [x] Implementér.
- [x] Kør vitest og tsc, og se dem bestå.
- [x] Commit.

## Fase 5: QS4 sammen med Jacob

Kørt 24.11.2026 kl. 12.15 til 12.40 i QS4 (klient 100, engelsk) med harnessen. Jacob trykkede i SAP. Testdokumenterne 105000923 og 105000924 er bogført, og der står intet åbent.

- [x] Opret, print, serienumre og bogfør i QS4 med harnessen. Ingen `session-not-created`, og "venter" kom først, da MI31, printvinduet og ZMS stod klar. Check fangede et serienummer, der ikke var på lager (NXC600007645), og intet blev opdateret.
- [x] Bogfør to dokumenter (105000923 og 105000924), mens udklipsholderen indeholdt "R162-0717". Begge blev meldt bogført.
- [x] Stor afstand mellem numrene er prøvet direkte i MI22 med intervallet 100000000 til 105000924. Det tog 3 sekunder med session. Der fandtes ikke to egne dokumenter med stor afstand.
- [x] Luk MI31 lige efter F8. Appen fandt 105000924 i MI22. Luk MI31 uden F8 gav først "ukendt" (fund: MI22 viser en tom liste på skærm 120, ikke skærm 1000). Rettet i a068953, og derefter gav det "intet er gemt" som det skal.
- [x] "Tjek i SAP" fra hvert trin: referencen fandt 105000923 som aktiv, MI20 viste materialet talt, efter bogføring var dokumentet `posted`, og en ukendt reference gav ingen dokumenter.
- [x] Under ZMS-ventetiden åbnede og lukkede to andre sessioner (et hjælpescript uden om appens kø). ZMS-scriptet ventede videre og talte rigtigt bagefter. At appens egen kø slipper ved overdragelsen, er dækket af enhedstests og er ikke prøvet med appen i QS4.
- [x] MI22 og MI20 uden data viser en tom liste på skærm 120 uden nogen besked. Skærm 1000 med en besked sker kun ved fejl, og så giver "Tjek i SAP" intet forslag.
- [x] Resultaterne er noteret i `plans/arbejdsvaerktoejer-gennemgang.md`, og 5.3, 5.4 og 7.1 er krydset af.
