# Guide Bibliotek — tvaergaaende guides, klikbare links, original formatering

## Baggrund
Brugerens tre onsker (samme besked):
1. Ved oprettelse af en guide kunne vaelge at den OGSAA skal ligge i et eller flere ANDRE teams
   guide-katalog ("tvaergaaende guides") — og hvis et af de andre teams retter i den, skal rettelsen
   slaa igennem for ALLE (ikke en kopi pr. team).
2. Eksisterende guides med links (websites, mappe-stier) — links skal vaere klikbare i guide preview.
3. Ved import af en Word-guide: mulighed for at beholde det ORIGINALE Word-format til visning, men
   stadig kunne redigere guiden gennem appens normale editor.

## Forundersoegelse (bekraeftet ved kodegennemgang)
- `Guide`-typen (`guideTypes.ts`) har INGEN team-tilknytning i dag — hvert team har sin egen `guides`-KV.
- `docxImporter.ts` bruger mammoth.js, konverterer til HTML, men parseren koerer kun `.textContent` paa
  hvert element — BAADE formattering (fed/kursiv) OG hyperlink-URL'er ('<a href>') gaar tabt ved import.
  MEN: hvis en guide allerede har en URL/sti som SYNLIG TEKST (fx indsat direkte, eller Word-linket brugte
  selve URL'en som visningstekst), ligger den teksten stadig i `step.text` — bare uden at vaere klikbar i
  dag. Ren rendering-fix, ingen data mangler for EKSISTERENDE guides.
- **STOR OPDAGELSE**: `GuideEditor.tsx` gemmer ALLEREDE den originale Word-fil automatisk ved import
  (`importDraft?.originalFile` -> `wordFile`-state -> `fileStorage.uploadFile()` -> `fileUrl`/`wordFileName`
  paa guiden ved gem). "Behold original fil"-mekanismen findes altsaa allerede, bare ikke som et synligt
  VALG, og `GuideViewer.tsx` bruger den kun til en download-knap — IKKE som en alternativ VISNING med
  original formattering. Den reelle mangel er: en visnings-tilstand der renderer selve Word-filens rige
  HTML (via mammoth) i stedet for den altid-flade sektioner/trin-visning.
- `docModel.ts`/`docxGenerator.ts` paavirkes IKKE af nogen af de tre aendringer.

## Fase 1 — Klikbare links/stier i guide preview ✓
- [x] Ny `src/lib/linkify.tsx`: `linkifyText(text: string): ReactNode[]` — genkender http(s)-URLs,
      "www."-praefiks, UNC-stier (`\\server\share\...`) og drev-stier (`C:\...`, `M:\...`). Websites
      renderes som normal `<a target="_blank">` (Electrons eksisterende `setWindowOpenHandler` sender dem
      allerede til `shell.openExternal`). Sti-tekst renderes som en knap-agtig inline-link.
- [x] Ny IPC `shell:open-path` (main.cjs, `shell.openPath(path)`) + preload-bridge `window.electronShell`,
      da mappe/fil-stier ikke kan aabnes via en almindelig `<a href>` (ingen navigerbar URI-scheme).
- [x] `GuideViewer.tsx`: brug `linkifyText(step.text)` i stedet for raat `{step.text}` i trin-visningen
      (samt de to `guide.content`-visninger for v1-legacy-guides).

## Fase 2 — "Original formatering"-visning ved import ✓
- [x] `GuideEditor.tsx`: goer "behold original Word-fil ved import"-attach TYDELIGT/valgt (allerede sat
      som default via `importDraft.originalFile`, tilfoejet en synlig hint-tekst under vedhaeftningen
      der forklarer at filen bruges til "Original formatering"-visningen).
- [x] `GuideViewer.tsx`: ny fane/toggle "Original formatering" (kun vist naar `fileUrl`/Word-fil findes)
      der henter den vedhaeftede fil og koerer `mammoth.convertToHtml()` client-side, renderer resultatet
      (fed/kursiv/tabeller/lister bevaret, modsat den flade sektions-visning). HTML saniteres via ny
      `src/lib/sanitizeHtml.ts` (DOM-baseret, samme teknik som docxImporter.ts) foer
      `dangerouslySetInnerHTML`. "Rediger"-knappen aabner FORTSAT den normale `GuideEditor` (redigering
      sker altid via sektioner/trin-modellen, uaendret).

## Fase 3 — Tvaergaaende (delte) guides ✓
- [x] `Guide`-typen faar nyt felt `sharedWithTeamCodes?: string[]` — ALLE deltagende teams' koder (inkl.
      opretteren), tomt/undefined = normal lokal guide (baglaens-kompatibelt, ingen aendring for
      eksisterende guides).
- [x] `main.cjs`: tilfoej `'shared-guides'` til `SHARED_KV_KEYS` (samme platform-delte mekanisme som
      `meal-plan-weeks` fra Fase 9.1) — INGEN ny IPC noedvendig, `window.kv.get/set('shared-guides')`
      ruter automatisk til den delte store baade for laesning og skrivning (og backup).
- [x] `GuideEditor.tsx`: ny "Del med andre teams"-multi-vaelger (afkrydsningsfelter, samme visuelle
      moenster som kategori-vaelgeren), viser ALLE ANDRE registrerede teams (henter `listTeams()`+
      `getCurrentTeam()`). Ved gem: hvis nogen er valgt -> gem i `shared-guides` (med fuld
      `sharedWithTeamCodes`-liste); ellers -> gem i lokal `guides` som i dag. Haandter overgang begge veje
      (lokal->delt naar man tilfoejer teams til en eksisterende guide; delt->lokal naar man fjerner alle).
- [x] `GuideLibrary.tsx`: laes BAADE `guides` (lokal) OG `shared-guides` (ny `useKV`), flet til en liste
      for eget teams visning (`sharedGuides.filter(g => g.sharedWithTeamCodes?.includes(mitTeamCode))`).
      Slet/rediger ruter til den RIGTIGE KV-noegle baseret paa hvor guiden aktuelt ligger. Fordi alle
      deltagende teams laeser/skriver samme delte fil, slaar en redigering fra ETHVERT deltagende team
      automatisk igennem for alle andre — ingen saerskilt synk-logik noedvendig (samme elegante princip
      som den platform-delte madplan).
- [x] Vis en lille "Delt med: TCD, TRR"-badge paa delte guide-kort, saa det er tydeligt i biblioteket at
      guiden ikke kun tilhoerer eget team.
- **KENDT BEGRAENSNING (bevidst, lav prioritet)**: den EKSISTERENDE tvaergaaende "andet teams
  guider"-laeseliste (Fase 8, `readTeamKey(folderName,'guides')`) viser KUN et andet teams EGNE lokale
  guides, ikke guides der er delt MED dem via denne nye mekanisme (de ligger jo i `shared-guides`, ikke i
  teamets egen `guides.json`). Ville kraeve endnu en cross-team-laesning at rette — ikke gjort, da det
  ikke var en del af den oprindelige foresporgsel (som handlede om de DELTAGENDE teams, ikke en
  tredjeparts laese-adgang-visning af dem).

## Fase 4 — Byg, test, redeploy, commit
- [ ] `get_errors` + `npm run build` + `npm test` (47 electron + 26 vitest forventet)
- [ ] `npm run electron:build` + robocopy-redeploy til `Supply Chain Hub 1.5.0`
- [ ] Commit (begge repos hvor relevant — kun denne fils plan-dokument er unikt for denne feature, ikke
      del af `supply-chain-hub-multitenancy.md`, saa ingen dobbelt-commit af planfil noedvendig der)
