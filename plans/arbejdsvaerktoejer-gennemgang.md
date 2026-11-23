# Arbejdsværktøjer: samlet forbedringsplan (1.6.8)

Dato: 23.11.2026

## Status efter natten 23.-24.11.2026

Alle 10 kritiske fejl i Fase 1 og 36 af de 40 vigtige fejl i Fase 2 til 5 er rettet på `develop/1.6.8`. Intet er pushet eller udgivet, og der er ikke skrevet til SAP eller M:.

Sådan blev det lavet:

- Hver rettelse blev skrevet med tests først og gennemgået af en uafhængig reviewer, og fundene blev rettet, indtil gennemgangen var ren.
- Til sidst kørte en samlet gennemgang for Fase 1 og en for Fase 2 til 5, delt i Optælling, Placeringer og det fælles. Alle fund derfra er rettet og gennemgået igen.

Sidste testkørsel er grøn:

| Testpakke | Resultat |
|---|---|
| Lagertests | 801 bestået, 1 sprunget over (kræver M:) |
| Electron-tests | 1317 bestået |
| Skærmtests (vitest) | 1788 bestået |
| tsc | ingen fejl |

### Bevidst udskudt

| Punkt | Hvorfor |
|---|---|
| 3.11 og 3.12 | De ændrer historik og `meta`, som 1.6.6 og 1.6.7 bruger til at undgå dobbelte handlinger. Bør vente, til alle PC'er kører 1.6.8. |
| 5.3 og VBS-delen af 5.4 | De ændrer seks SAP-skrivescripts og skal testes i QS4 først. JavaScript-delen af 5.4 er lavet: en ufuldstændig MI22-læsning giver nu "ukendt" og ikke "åben". |
| Trin 3 i 5.2 (kontakt i konfigurationen) | Det er en ny funktion (forslag 7.18). |
| "Tjek i SAP"-knappen fra 2.4 og 7.1 | Den kræver et nyt SAP-script og en QS4-test. Indtil da afklarer en manager et ukendt dokument med en begrundelse. |

### Skal testes i QS4 før udgivelse

Ændringerne i PI-scripts og SAP-eksport er kun læst igennem, ikke kørt mod SAP:

1. Dansk logon giver "Log på SAP på engelsk (EN), og prøv igen" i alle seks PI-trin, og engelsk logon virker hele vejen.
2. ZMS_COUNT_SERIAL med mindst 1000 serienumre. Antallet MENGE skal læses rigtigt, og en slettet række skal stoppe med "SAP har talt N-1".
3. MI04 med materialer uden serienumre. Hvis de står i ZMS_COUNT_SERIAL-listen, kan tjekket "alle materialer fundet" komme tilbage.
4. `/n` fra MI04 og fra MI20's Post Difference med ugemte data må ikke give en popup, der hænger.
5. Timeout i MI20 med flere dokumenter og et nummer kopieret imens. Resultatet skal være "Ukendt i SAP" og ikke "Ikke bogført".
6. Timeout i MI04 og serienumre: gemt og forladt giver "talt", ikke gemt giver "ikke talt".
7. Tidsforbrug: 15 minutters ventetid plus tilbagelæsning skal holde sig inden for 300 sekunder.
8. IQ09 uden resultat: hvilken besked (id) giver SAP? Appen godtager IH 047 som "ingen serienumre".
9. MB52 må ikke blive stående på startskærmen ved normal brug.
10. MI31 "Freeze book inventory": er beholdningen frosset på appens PI-dokumenter? Er den det, regnes antallet forkert.
11. MI05 på et talt dokument og derefter "Bogfør alligevel" fra Hub med begrundelse. Det rettede antal skal bogføres.
12. Lukker brugeren MI31, mens SAP arbejder efter F8, bør det give "ukendt" og ikke "intet oprettet". Det kræver en ændring i scriptet.

### Skal prøves i appen

- En rigtig scanner i Placeringer: Enter i materialevælgeren og i søgningen skal tage det, der lige er scannet.
- Finske og svenske ord i Huberts linje "Andre paller", fx "pois käytöstä" og "inaktiverad".
- At "lukket pænt" (exitedAt) når frem til M: inden for 10 sekunder ved lukning. Ellers kommer der falske "har ikke sendt"-advarsler.

### Kendte risici med blandede versioner

- Managere og admins skal opdateres til 1.6.8 først. En PC på 1.6.7 kender ikke de nye spærringer: den kan nulstille bogførte materialer, lægge antal på med gamle eller tomme SAP-tal og handle på PI-dokumenter, som 1.6.8 har markeret som ukendte.
- Fejlen i "Tjek SAP-fejl" (1.1) findes også i den udgivne 1.6.7. Det er Jacobs beslutning, om der skal laves en hotfix af 1.6.7.

Hele forløbet med commits og afgørelser står i `.superpowers/sdd/arbejdsvaerktoejer-gennemgang/progress.md`.

## Hvad er gennemgået

Fire gennemgange af modulet Arbejdsværktøjer i Supply Chain Hub 1.6.8 er samlet her:

- Optælling
- Placeringer
- Stempelkort og Softwareload
- De fælles dele: roller, SAP-forbindelsen, fejltekster, Hubert og værktøjssiden

Gennemgangene har kun læst koden. Intet er ændret i kode, SAP eller på M:.

Antal fund efter at dubletter er lagt sammen:

| Alvor | Antal |
|---|---|
| Kritisk | 10 |
| Vigtig | 40 |
| Mindre | 56 |
| Forslag til tilføjelser | 18 |

Rapporterne havde tilsammen 10 kritiske, 40 vigtige og 62 mindre fund og 19 forslag. Seks fund stod i to rapporter og er lagt sammen. Begge kilder står ved punktet. Ét forslag (shared.md S4) er det samme som et trin i punkt 5.8 og står nu der.

Controlleren har selv bekræftet tre ting i koden:

- Punkt 1.1 (shared.md C1) er rigtigt, og fejlen er allerede i den udgivne 1.6.7, fordi commit cc741f1 er en del af 1.6.7.
- Punkt 1.2 (count.md C2) og punkt 1.3 (locations.md C2) er rigtige.

Punkter mærket "(usikkert)" er markeret sådan i rapporterne. Som regel er koden bekræftet, men ikke hvor ofte situationen opstår i virkeligheden.

De fulde engelske rapporter ligger i `plans/gennemgang/`:

- [count.md](gennemgang/count.md) (Optælling)
- [locations.md](gennemgang/locations.md) (Placeringer)
- [timeclock-softwareload.md](gennemgang/timeclock-softwareload.md) (Stempelkort og Softwareload)
- [shared.md](gennemgang/shared.md) (fælles dele)

Linjenumre i "Hvor" passer til filerne, som de så ud den 23.11.2026.

---

## Fase 1: Kritiske fejl

- [x] **1.1 "Tjek SAP-fejl" gemmer ikke resultatet og kan lave dobbelte mails (shared.md C1)**
  Allerede i den udgivne 1.6.7 (commit cc741f1). Bekræftet af controlleren.
  - **Hvad sker der i dag:** En admin trykker "Tjek SAP nu". SAP kører i flere minutter, og derefter fejler gemningen med "Der skete en uventet fejl". Kontrollen kommer aldrig i oversigten, gamle kontroller slettes ikke, og der efterlades en løs fil på M: hver gang. Ved "Lav mail til SAP-teamet" åbner kladden, men brugeren får en fejl, trykker igen og får endnu en kladde og endnu en Excel-fil.
  - **Hvorfor det betyder noget:** En hel fane er i stykker i produktion, resultater går tabt, og SAP-teamet kan få dobbelte mails.
  - **Hvad skal ændres:**
    1. Tilføj `mutateAsync` til den håndskrevne `sharedStore` i `register.cjs`, og fjern `updateAsync`, som ikke bruges længere.
    2. Bedre: erstat den håndskrevne wrapper med en funktion, der returnerer den rigtige store (`openStore(...)`). Så kan en manglende metode ikke ske igen.
    3. Tilføj en test i `register.test.cjs`, der kører `sap-check:run` og `sap-check:mail` gennem IPC med en test-fetcher og en falsk mailkladde.
  - **Risiko ved ændringen:** Meget lav, for `mutateAsync` findes på alle stores, og første kørsel sammenligner bare én gang med en gammel indekspost.
  - **Hvor:** `electron/warehouse/register.cjs:106-111`; `electron/warehouse/sapCheckService.cjs:119-130` og `:168-177`

- [x] **1.2 "Nulstil" er tilladt på et materiale, der allerede er bogført i SAP (count.md C2)**
  Bekræftet af controlleren.
  - **Hvad sker der i dag:** R162-0717 er godkendt med -3 og bogført i SAP med hånden. En tæller finder 2 mere, og skærmen foreslår "Nulstil for at tage dem med". Manageren nulstiller, godkender igen (-1) og laver et nyt dokument ud fra dagens SAP-tal, som allerede indeholder de -3, så differencen bogføres en gang til.
  - **Hvorfor det betyder noget:** Lageret i PS4 bliver rettet to gange, og det er appens egen tekst, der leder brugeren derhen.
  - **Hvad skal ændres:**
    1. I `setApproval`: afvis `reset`, `returned` og `approved`, når materialet har status `posted`. Ny tekst: "{materiale} er bogført i SAP og kan ikke ændres. Lav en ny optælling, hvis der skal rettes mere."
    2. I ApprovalPanel: skjul "Nulstil" for bogførte materialer. For bogførte rækker med tal talt bagefter vises "talt efter bogføring, indgår ikke" i stedet for nulstil-hintet. Det samme i `FrozenBadge` i OverviewPanel.
    3. Ret testen i `countService.test.cjs:696-706`, så den forventer en afvisning.
  - **Risiko ved ændringen:** Lav, men en forkert manuel "Bogført"-markering kan så ikke fortrydes i appen; hvis det skal kunne lade sig gøre, så kun for managere med en begrundelse, kun når der ikke findes et SAP-dokument, og med log.
  - **Hvor:** `electron/warehouse/countService.cjs:1172-1201`; `src/views/warehouse/count/ApprovalPanel.tsx:134` og `:142`; `src/views/warehouse/count/OverviewPanel.tsx:166`; `countService.test.cjs:696-706`

- [x] **1.3 Et delvist tag fra en palle med ukendt antal sletter hele pallen (locations.md C2)**
  Bekræftet af controlleren.
  - **Hvad sker der i dag:** En palle sat på plads uden antal viser "antal ukendt". En plukker skriver 5 og trykker "Tag 5 stk.". Beskeden siger "5 stk. taget fra A2.4", men pallen slettes i Placeringer, selvom den stadig står på A2.4 med resten af varerne. Det samme sker ved "Fyld op" fra sådan en palle.
  - **Hvorfor det betyder noget:** Lager forsvinder fra systemet, pladsen ser ledig ud, næste palle sendes til en optaget plads, og FIFO springer pallen over.
  - **Hvad skal ændres:**
    1. I `takeFrom`: når pallen har ukendt antal, og der er skrevet et antal, beholdes pallen (antallet forbliver ukendt), og taget logges med det skrevne antal. Pallen slettes kun ved "Tag hele pallen".
    2. Gør det samme i `takeFromCard` på skærmen.
    3. I Tag og Fyld op: kald feltet for sådanne paller "stk. taget (pallen bliver stående)", og tilbyd "Tæl pallen" (se 7.8).
  - **Risiko ved ændringen:** Lav, fortryd virker stadig, men den der brugte "skriv et tal" til at rydde en palle med ukendt antal, skal nu bruge "Tag hele pallen".
  - **Hvor:** `electron/warehouse/locations/service.cjs:92-101`, `:142-152`, `:170-178`; `src/views/warehouse/locations/TakePallet.tsx:110-114`; `Refill.tsx:62-72`; `src/lib/warehouse/locationActions.ts:94-104`

- [x] **1.4 "Læg antal på" bruger gamle "dagens SAP-tal" uden at tjekke datoen (count.md C1)**
  - **Hvad sker der i dag:** Mandag kl. 8 henter en manager dagens SAP-tal og opretter MI31-dokumentet for R162-0717 (SAP 100, godkendt difference -3, antal 97). Om eftermiddagen udleveres 20 stk. i SAP. Onsdag trykker en admin "Læg antal på": MI04 får 97, selvom SAP nu har 80, og MI20 bogfører +17 i stedet for -3.
  - **Hvorfor det betyder noget:** Det er en forkert lagerrettelse i PS4, og den admin, der lægger antal på, er ikke den, der så den gule advarsel.
  - **Hvad skal ændres:**
    1. Gem `docFetchedAt` på PI-dokumentet, når det oprettes (`piDocService.create`, fra `counts.countDoc().fetchedAt`).
    2. I `piDocService.count()`: afvis med ny kode `PIDOC_DOC_STALE`, når dagens tal er ældre end PI-dokumentet eller ikke er fra i dag (lokal dato). Tekst: "Hent dagens SAP-tal igen, før antallet lægges på. Tallene er fra {dato}."
    3. Endnu bedre: lad `count()` selv hente MB52/IQ09 for dokumentets lagersted lige før MI04 eller ZMS_COUNT_SERIAL og regne antallet igen. Vis det nye tal i teksten, mens der ventes på SAP.
    4. Tillad `fetchDocStock`, når statussen er låst (se 2.3). Ellers kan dette ikke rettes efter låsning.
  - **Risiko ved ændringen:** Lav, for trin 2 tilføjer kun en afvisning, og trin 3 tilføjer én SAP-læsning på nogle minutter.
  - **Hvor:** `electron/warehouse/piDocService.cjs:97-141`; `electron/warehouse/core/countDoc.cjs:71-86`; `electron/warehouse/countService.cjs:1342-1351`; `src/views/warehouse/count/DocPanel.tsx:195-198`

- [x] **1.5 Antalslinjer på serienummerstyrede materialer tæller med i differencen, men falder ud af optællingsdokumentet (count.md C4)**
  - **Hvad sker der i dag:** INT4300-4921-0 har 10 i SAP. En tæller scanner 8, men to etiketter kan ikke læses, så hun tilføjer en linje "2 stk." på Reol 3. Oversigten viser difference 0 og godkendes, men dokumentet bygger kun på serienumrene, så antallet bliver 8, og ZMS_COUNT_SERIAL bogfører -2 for varer, der blev talt.
  - **Hvorfor det betyder noget:** Det godkendte tal og det bogførte tal er forskellige, og skærmen ("Serienumrene bestemmer") siger, at man skal stole på det forkerte.
  - **Hvad skal ændres:**
    1. I `validateLine`: afvis linjer for materialer med serienumre (`serialManaged`) med koden `LINE_SERIAL_MANAGED` og teksten "Materialet har serienumre. Scan eller importér dem, eller brug Fjern serienummer."
    2. I "Tilføj tællelinje" bliver hintet til en besked, der blokerer.
    3. For optællinger, der allerede har sådanne linjer: vis dem som fejl i ApprovalPanel, og bloker godkendelse af materialet, til linjerne er slettet.
  - **Risiko ved ændringen:** Lav, tællerne mister en nødløsning for ulæselige etiketter, men import fra materialedokument og indtastning af serienummeret dækker det.
  - **Hvor:** `electron/warehouse/countService.cjs:799-815`; `src/views/warehouse/count/LinesPanel.tsx:388`; `electron/warehouse/core/countState.cjs:128`, `:198-206`, `:247-258`; `electron/warehouse/core/countDoc.cjs:84-85`

- [x] **1.6 En fejlet eller tom SAP-eksport bliver brugt som rigtigt lager (count.md C3) (usikkert)**
  Kodevejen er bekræftet. Hvor ofte SAP-skærmene opstår, er usikkert.
  - **Hvad sker der i dag:** Hvis MB52 bliver stående på startskærmen (fx ved en fejl- eller adgangsbesked), eller IQ09 ikke viser en tabel, melder scriptet "ok" med 0 rækker. "Hent dagens SAP-tal" har ingen forhåndsvisning og gemmer det tomme resultat, så SAP i dag bliver 0, og en tom serienummerliste bliver til et nultal ("Zero Count") i MI04.
  - **Hvorfor det betyder noget:** Et nultal på et dokument bogfører hele beholdningen af de materialer som tab.
  - **Hvad skal ændres:**
    1. `export.vbs`: på skærm 1000 efter F8 (MB52), og når der ikke findes en tabel (IQ09), returneres `ok:false` med statuslinjens tekst, når `MessageType` er E eller A, ligesom `matdoc.vbs` gør.
    2. `sapFetch.run`: afvis med `SAP_EXPORT_EMPTY`, når MB52 ikke giver rækker for D301, og når IQ09 (unrestricted) ikke giver rækker, mens MB52 har INT-materialer med lager.
    3. `fetchDocStock`: afvis, når de nye tal mangler en linje for et materiale, der er godkendt og havde SAP-lager ved godkendelsen, medmindre brugeren bekræfter. Vis rækker med "SAP i dag 0" med rødt.
    4. `piDocService.count()`: gør aldrig en tom serienummerliste til et nultal i stilhed. Kræv, at `sapToday` er 0, eller en udtrykkelig bekræftelse.
  - **Risiko ved ændringen:** Lav til middel, fordi en liste, der virkelig er tom, skal igennem bekræftelsen.
  - **Hvor:** `electron/warehouse/sap/export.vbs:194-199` og `:218`; `sap/matdoc.vbs:133-138`; `electron/warehouse/sapFetch.cjs:56-66`; `countService.cjs:1342-1351`; `piDocService.cjs:115`

- [x] **1.7 Handlinger, der venter i vinduets kø, går tabt, når Hub lukkes (locations.md C5)**
  - **Hvad sker der i dag:** Ved vagtskifte tager Bo tre paller hurtigt efter hinanden, og skærmen siger, at alle tre er taget. Tag 1 er på vej til M:, mens tag 2 og 3 venter i vinduet. Bo lukker Hub, lukkevagten venter kun på tag 1, og tag 2 og 3 når aldrig frem; det samme sker ved genindlæsning, nedbrud, "Luk alligevel" eller hvis PC'en slukkes.
  - **Hvorfor det betyder noget:** Lager, som brugeren fik at vide var registreret, bliver aldrig registreret, og der kommer ingen fejlbesked.
  - **Hvad skal ændres:**
    1. Send hver handling til hovedprocessen med det samme, og drop køen i vinduet. Outboxen i hovedprocessen holder allerede rækkefølgen pr. PC.
    2. I `outbox.submit`: skriv handlingen i outbox-filen, før den køres (write-ahead), og fjern eller markér den efter succes. En genafspilning er sikker på grund af handlings-id'et.
    3. Indtil da: lad vinduet melde `locationActionsInFlight()` til hovedprocessen, og tag det med i `hasPendingWrites`.
  - **Risiko ved ændringen:** Middel for trin 1, fordi skærmenes visning regner med én handling ad gangen, og lav for trin 2, som kun er én ekstra skrivning på den lokale disk.
  - **Hvor:** `src/lib/warehouse/locationActions.ts:56-90`; `electron/main.cjs:825-836`; `electron/mainActivity.cjs:19-33`; `electron/warehouse/locations/outbox.cjs:113-126`

- [x] **1.8 Handlinger i køen kasseres som "fejlet" ved en kort låse-timeout (KV_LOCK_BUSY) (locations.md C4)**
  - **Hvad sker der i dag:** M: er nede i 10 minutter, og fem PC'er lægger handlinger i kø. Når M: er tilbage, sender alle på én gang, og nogle giver op med KV_LOCK_BUSY. Outboxen gemmer dem som endelige fejl, fjerner dem fra køen og skriver "Prøv igen om et øjeblik", men der er intet at prøve igen; en direkte handling en travl morgen bliver også afvist i stedet for at vente.
  - **Hvorfor det betyder noget:** Indsættelser, tag og flytninger lavet, mens M: var nede, går tabt lige efter, at M: er tilbage, og den der ser beskeden, er måske ikke den, der gjorde arbejdet.
  - **Hvad skal ændres:**
    1. Behandl `KV_LOCK_BUSY` som noget, der kan prøves igen (intet er skrevet, for låsen blev aldrig taget). I `register.cjs` føjes koden til de fejl, outboxen prøver igen: handlingen bliver forrest i køen, og `wentDown()` kaldes med en kort pause, fx 5 s plus en tilfældig forskydning.
    2. I `submit`: læg en direkte handling, der fejler med `KV_LOCK_BUSY`, i køen i stedet for at kaste fejlen.
    3. Kun forretningsfejl (`PALLET_GONE`, `LOCATION_FULL` osv.) bliver til fejl.
  - **Risiko ved ændringen:** Lav, for fejlen opstår, før noget køres, så et nyt forsøg kan ikke udføre handlingen to gange.
  - **Hvor:** `electron/warehouse/register.cjs:442`; `electron/warehouse/locations/outbox.cjs:68-77`; `electron/fileLock.cjs:277-293`; `electron/store.cjs:29`

- [x] **1.9 En handling gemmes fil for fil, og en fejl midt i plus genafspilning udfører den to gange (locations.md C3)**
  - **Hvad sker der i dag:** Ved "Sæt palle på plads" skrives først pallerne, så `meta` med handlings-id'et og til sidst historikken. Falder M: ud efter pallerne, men før `meta`, ser det ud som en fejl, outboxen genafspiller, finder intet id og opretter pallen igen, så der er to paller for én fysisk palle; ved et delvist tag trækkes antallet fra to gange. Falder M: ud mellem `meta` og historikken, er handlingen udført uden loglinje og kan hverken ses eller fortrydes.
  - **Hvorfor det betyder noget:** Dobbelte paller og dobbelte fradrag opstår netop, når M: er ustabil, og ingen ser det før en optælling.
  - **Hvad skal ændres:**
    1. Skriv først hele handlingens resultat (alle nye værdier plus handlings-id) som én journalnøgle `tx-<actionId>`.
    2. Omdøb derefter datanøglerne.
    3. Slet journalen.
    4. I starten af hver `transact` og `undo` gøres en efterladt journal færdig under de samme låse, før selve handlingen køres.
    5. Første, billige skridt: gør indsættelse sikker mod gentagelse ved at lave palle-id'et ud fra handlings-id'et (`${actionId}:${index}`) og springe oprettelsen over, hvis pallen allerede findes.
  - **Risiko ved ændringen:** Middel, fordi den fælles skrivevej ændres, og 1.6.6-klienter skriver de samme nøgler uden at gøre en journal færdig; det faste palle-id alene er lav risiko.
  - **Hvor:** `electron/warehouse/locations/repository.cjs:31-35`, `:92`, `:99-103`; `electron/store.cjs:751-768`; `electron/warehouse/locations/outbox.cjs:113-126`; `electron/warehouse/register.cjs:442`

- [x] **1.10 Ret palle sender alle felter og ruller andres tag tilbage i stilhed (locations.md C1)**
  - **Hvad sker der i dag:** En palle på A2.4 viser 100 stk. på Bos pallekort. Lis tager 30 på sin PC, så der er 70. Bo tilføjer noten "Hjørne skadet" og gemmer, men anmodningen indeholder stadig antal 100, så pallen sættes tilbage til 100, og loggen siger kun "Pallen rettet".
  - **Hvorfor det betyder noget:** Lageret bliver forkert uden spor af hvorfor, og ingen leder efter en fejl, fordi personen kun ændrede en note.
  - **Hvad skal ændres:**
    1. I `EditDialog.save()`: send kun de felter, der faktisk er ændret.
    2. I backend: tag imod et valgfrit `expected` (den værdi hvert ændret felt havde, da dialogen blev åbnet), og afvis med ny kode `PALLET_CHANGED` ("Pallen er ændret af {navn} imens. Se den igen."), når den gemte værdi er anderledes, i hvert fald for antal og materiale.
  - **Risiko ved ændringen:** Lav, for backend håndterer allerede delvise ændringer, og gamle klienter, der sender alt, virker stadig.
  - **Hvor:** `src/views/warehouse/locations/PalletCard.tsx:119-128`; `electron/warehouse/locations/service.cjs:279-303`

---

## Fase 2: Vigtige fejl i Optælling

- [x] **2.1 ZMS_COUNT_SERIAL tjekker ikke, at SAP's talte antal passer med de sendte serienumre (count.md I10)**
  - **Hvad sker der i dag:** Efter "Update Count" tjekker scriptet kun, at posten er markeret som talt. Hvis brugeren slettede rækker i tabellen, eller SAP tabte nogle, opdager ingen, at det talte antal er et andet end listen.
  - **Hvorfor det betyder noget:** Et forkert tal går videre til bogføring i MI20, uden at nogen ser det.
  - **Hvad skal ændres:**
    1. `pidoc-serials.vbs`: returnér `not-counted: <MENGE>`, når MENGE ikke er lig antallet af sendte serienumre.
    2. `piDocService.count`: sammenlign `result.counted` med antallet af serienumre, og stop med `PIDOC_NOT_COUNTED`, hvis de er forskellige.
    3. Læs MENGE med `parseSapNumber` i stedet for `Number()`, fordi fx "1.234" og "12,000" ellers bliver forkerte.
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `electron/warehouse/sap/pidoc-serials.vbs:244-245`; `electron/warehouse/sapPiDocs.cjs:72`; `electron/warehouse/piDocService.cjs:117-118`; sammenlign `sap/pidoc-count.vbs:212`

- [x] **2.2 PI-dokumentscripts læser engelske SAP-tekster, men tjekker ikke logon-sproget (count.md I8)**
  - **Hvad sker der i dag:** Med dansk logon opretter MI31 dokumentet, men vinduets titel indeholder ikke "Created", så scriptet melder "ikke oprettet", og reservationen slettes (et løst dokument i SAP, se 2.4). I MI20 og MI22 fejler læsningen med `SAP_FORMAT`, efter at brugeren har bogført.
  - **Hvorfor det betyder noget:** SAP er ændret, men CountPoint siger, at det fejlede.
  - **Hvad skal ændres:**
    1. Tilføj samme tjek som i Softwareload øverst i alle `pidoc-*.vbs`: `s.Info.Language` skal være EN eller E, ellers afsluttes med `language-not-supported`, før noget udfyldes.
    2. Oversæt det i `scriptFailure` til "Log på SAP på engelsk (EN), og prøv igen".
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `electron/warehouse/sap/pidoc-create.vbs:251`; `electron/warehouse/core/sapParsers.cjs:200-238`; `electron/warehouse/sapPiDocs.cjs:151-152`, `:169-170`; sammenlign `sap/sl-transfer.vbs:342` og `sap/sl-block.vbs:282`

- [x] **2.3 SAP-dokumentflowet kører videre efter låsning, men kan ikke markere "Bogført" eller hente dagens tal (count.md I9)**
  - **Hvad sker der i dag:** Tjeklisten godtager "Godkendt" som klar, så statussen låses som regel, før dokumenterne er bogført. Bagefter kan managere stadig oprette, udskrive, tælle og bogføre i SAP, men "Hent dagens SAP-tal" er væk (så 1.4 ikke kan undgås), og når MI20 bogfører, fejler markeringen "Bogført" i stilhed. Materialerne bliver stående som "Godkendt", mens skærmen siger "Materialerne er markeret Bogført i SAP".
  - **Hvorfor det betyder noget:** Arkiv og rapporter viser aldrig bogføringen, og beskeden på skærmen er forkert.
  - **Hvad skal ændres:** Vælg én regel, og brug den begge steder. Anbefalet:
    1. SAP-dokumenttrinene og "Hent dagens SAP-tal" er tilladt efter låsning, fordi de er opfølgningen.
    2. `markPosted` springer `assertStatusOpen` over (den flytter kun fra godkendt til bogført).
    3. `piDocService.post` returnerer, hvilke materialer der blev markeret og sprunget over, og beskeden "markeret" vises kun for dem.
    4. Teksten i LockDialog ændres til "Tal og godkendelser kan ikke ændres. SAP-dokumenterne kan stadig laves og bogføres."
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `electron/warehouse/piDocService.cjs:158-166`; `electron/warehouse/countService.cjs:1231-1234`, `:1339`, `:1345`; `src/views/warehouse/StatusChecklist.tsx:107`

- [x] **2.4 Når SAP er ændret, men resultatet ikke kan gemmes, er CountPoint ude af trit med SAP uden vej tilbage (count.md I6)**
  - **Hvad sker der i dag:** Brugeren trykker F8, MI31 opretter dokumenterne, men opslaget i MI22 fejler. CountPoint sletter sin reservation og siger "Oprettelsen i MI31 fejlede", mens SAP har aktive dokumenter med CountPoints reference, som appen ikke kan slette. Fejler den sidste skrivning til M: efter en bogføring, står dokumentet som "Antal lagt på" for altid.
  - **Hvorfor det betyder noget:** Managere ser en tilstand, der modsiger SAP, og må rydde op i SAP med hånden.
  - **Hvad skal ændres:**
    1. Hav en lokal, krypteret journal for PI-dokumenter (samme mønster som `softwareload-journal`), der skrives straks efter hvert script melder ok, og som sendes til M:, indtil det lykkes.
    2. Ved enhver fejl efter brugerens F8 ved oprettelse: behold posten med status `unknown` og dens reference i stedet for at slette den.
    3. Tilføj "Tjek i SAP" (se 7.1), som læser MI22 på reference eller dokumentnummer og sætter oprettet, talt, bogført eller slettet ud fra SAP.
  - **Risiko ved ændringen:** Middel, fordi den nye tilstand `unknown` skal håndteres af `planDocument` (som optaget) og af skærmen.
  - **Hvor:** `electron/warehouse/piDocService.cjs:43-75`, `:97-141`, `:144-180`; `electron/warehouse/sap/pidoc-create.vbs:250-268`; `electron/warehouse/sapPiDocs.cjs:124-128`

- [x] **2.5 "Intet er gemt" vises efter en timeout, selvom SAP måske har bogført (count.md I7)**
  - **Hvad sker der i dag:** I MI20 trykker brugeren "Post Difference" og Gem, men går derefter tilbage til startskærmen eller til en anden transaktion i stedet for at blive på listen. Scriptet ser aldrig listen igen og giver op efter 15 minutter med "intet er gemt. Prøv igen", selvom dokumenterne er bogført.
  - **Hvorfor det betyder noget:** Brugeren kan komme til at bogføre igen med hånden eller tro, at lageret ikke er rettet.
  - **Hvad skal ændres:**
    1. `pidoc-post.vbs`: læs også MI22 ved timeout (som ved "vindue lukket", linje 230-244), og returnér status.
    2. `sapPiDocs.postDocuments`: behandl timeout som en normal afslutning.
    3. For MI04 og ZMS_COUNT_SERIAL efter timeout: læs posten tilbage (koden findes allerede i begge scripts) i stedet for at sige "intet er gemt".
    4. Tekst, når tilstanden er ukendt: "Optælling ved ikke, om SAP har gemt. Tryk Tjek i SAP."
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `electron/warehouse/sapPiDocs.cjs:26-33`; `electron/warehouse/sap/pidoc-post.vbs:214-229`, `:230-244`

- [x] **2.6 Et serienummer fundet i en anden optælling i samme status står stadig som manglende (count.md I5)**
  - **Hvad sker der i dag:** Optælling A (D000-terminaler) scanner serienummer X, som i SAP står på D006, og registrerer det som "Anden storage location". Optælling B (D006, samme status) får det aldrig at vide: X står som "Mangler", fryses som manglende ved godkendelsen og udelades af B's optællingsdokument. Medmindre nogen flytter det i SAP først, afskriver B en vare, som A har fundet.
  - **Hvorfor det betyder noget:** Fundet lager bliver afskrevet, og den der godkender B, kan ikke se hvorfor.
  - **Hvad skal ændres:**
    1. Byg en liste for hele statussen over serienumre "fundet andetsteds" (serienummer, optælling, placering, hvem og hvornår) ud fra de andre optællingers ekstra serienumre. Cache den pr. status som `refreshOthers`.
    2. Vis den i B's "Mangler"-lister og i MaterialFocus som "Fundet i '{A}' på {placering}".
    3. Advar i `approveAllWithoutDifference` og `setApproval('approved')`, når et materiale har manglende serienumre, der er fundet andetsteds.
    4. Markér sådanne serienumre i `buildCountDoc` på samme måde som `serialMismatch`.
  - **Risiko ved ændringen:** Middel, fordi andre optællingers journaler skal læses, så det skal kun læse og være cachet.
  - **Hvor:** `electron/warehouse/core/countState.cjs:36-44`; `electron/warehouse/countService.cjs:392-406`; `electron/warehouse/core/countDoc.cjs:47-61`

- [x] **2.7 Sletning af en optælling eller status sletter det eneste spor af dens SAP-dokumenter (count.md I12)**
  - **Hvad sker der i dag:** En optælling med oprettede, talte eller bogførte SAP-dokumenter kan slettes af ejeren eller en manager, og en låst status kan slettes med alle sine optællinger. Dialogerne siger, at Excel-rapporterne bliver liggende, men de indeholder ikke SAP-dokument- eller materialedokumentnumre, og arkivet forsvinder også.
  - **Hvorfor det betyder noget:** Sporet af, hvad CountPoint har bogført i PS4, går tabt, og et aktivt dokument i SAP kan ikke længere findes fra appen.
  - **Hvad skal ændres:**
    1. Afvis sletning af en optælling, der har et PI-dokument, som er under oprettelse, oprettet, udskrevet eller talt ("Slet SAP-dokumenterne først").
    2. For bogførte dokumenter: skriv dem i indeksets slettemarkering (`deletedDocs` med dokumentnummer, år og materialedokument), eller bloker sletning af låste statusser.
    3. Tilføj et ark "SAP-dokumenter" i optællings- og statusrapporterne (dokumentnummer, status, materialedokument, differencer).
    4. Nævn SAP-dokumenterne i begge slettedialoger.
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `electron/warehouse/countService.cjs:1394-1440`; `electron/warehouse/countRepository.cjs:91-97`; `electron/warehouse/report.cjs`; `src/views/warehouse/count/DeleteCountDialog.tsx:31`; `src/views/warehouse/StatusChecklist.tsx` (slettedialogen)

- [x] **2.8 "Anden placering" på et allerede talt sted erstatter linjen i stilhed, mens "Tilføj tællelinje" lægger til (count.md I4)**
  - **Hvad sker der i dag:** Anna tæller 10 på "Reol 3". Bo finder senere en kasse mere på Reol 3, vælger "Anden placering", skriver "Reol 3" og 6. Linjen siger nu 6, Annas 10 er væk, og beskeden siger bare "Gemt: 6 × … på Reol 3".
  - **Hvorfor det betyder noget:** Talt antal forsvinder uden varsel, og samme handling betyder noget forskelligt på to skærme.
  - **Hvad skal ændres:**
    1. I `MaterialRow.save`: når "Anden placering" er valgt, og der allerede findes en linje på stedet, spørg "Der er allerede talt {n} på {placering}. Erstat med {m} eller læg {m} til?". Ved "læg til" sendes det gamle antal plus det nye.
    2. I AddLine: advar på samme måde, når der findes en linje for samme sted og materiale.
  - **Risiko ved ændringen:** Lav, kun skærmen ændres.
  - **Hvor:** `src/views/warehouse/count/LinesPanel.tsx:205-221` og `:336-361`

- [x] **2.9 "Hent SAP igen" kan erstatte nyere SAP-tal med ældre (count.md I2)**
  - **Hvad sker der i dag:** Admin A åbner dialogen kl. 10:00 og går til kaffe. Ejer B henter SAP igen kl. 10:15. Kl. 10:25 trykker A "Tag de nye tal i brug", og optællingen går tilbage til tallene fra 10:00 på alle PC'er.
  - **Hvorfor det betyder noget:** Differencer bliver regnet mod ældre lager, uden at nogen opdager det.
  - **Hvad skal ændres:**
    1. Gem `basedOn` (optællingens `fetchedAt`) i den ventende post.
    2. I `applyRefetch`: læs meta igen, og afvis med `REFETCH_OUTDATED` ("En anden har hentet SAP igen imens. Hent igen for at se forskellene."), når `fetchedAt` ikke er lig `basedOn`, eller de nye tal ikke er nyere end de gemte.
    3. Afvis med `COUNT_CLOSED`, når optællingen er lukket.
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `electron/warehouse/countService.cjs:1140-1170`

- [x] **2.10 To PC'er kan oprette overlappende optællinger i samme status (count.md I1)**
  - **Hvad sker der i dag:** Tjekket af, om området er ledigt, læser indekset, derefter skrives fire filer (15-90 s hver), og først til sidst tilføjes posten i indekset. To personer, der begge trykker "Opret optælling" for D000-terminaler inden for det vindue, får begge en optælling.
  - **Hvorfor det betyder noget:** To optællinger dækker samme lager, og statusrapporten lægger begge differencer sammen, så de tælles dobbelt.
  - **Hvad skal ændres:**
    1. Reservér området inde i indekslåsen først: `repo.createCount` kører `mutateAsync(INDEX_KEY)`, som tjekker overlap igen mod posterne i samme status (også dem med `state: 'creating'`) og skriver posten med `creating: true`.
    2. Skriv derefter filerne.
    3. Slå `creating` fra.
    4. `listCounts` skjuler poster med `creating`, der er ældre end fx 10 minutter (efter et nedbrud).
  - **Risiko ved ændringen:** Middel, fordi rækkefølgen af skrivninger ændres, men eksisterende tests plus én ny test for kapløbet dækker det.
  - **Hvor:** `electron/warehouse/countService.cjs:121-126`, `:276-289`; `electron/warehouse/countRepository.cjs:39-56`

- [x] **2.11 Afslut og godkend tjekker kun denne PC's synkronisering (count.md I11)**
  - **Hvad sker der i dag:** En hjælpers PC mister M: i en time og har 40 scanninger liggende lokalt, men "40 venter" vises kun på den PC. Ejeren lukker optællingen, og manageren godkender med -40. Når PC'en kommer tilbage, lander scanningerne i den lukkede optælling som "+40 talt efter godkendelse".
  - **Hvorfor det betyder noget:** Godkendelsen bygger på ufuldstændige tal, og ingen kunne se risikoen ved lukningen.
  - **Hvad skal ændres:**
    1. Hver journal skriver et lille livstegn i sin fil ved hver afsendelse (`uploadedAt`, `pendingAtUpload`) og `lastEventAt`.
    2. I afslutdialogen og ApprovalPanel vises deltagere, hvis seneste hændelse er nyere end deres seneste afsendelse, eller hvis PC ikke har sendt i over N minutter, mens de har haft hændelser den seneste time ("Bos PC har ikke sendt siden 10:42"). Se 7.4.
  - **Risiko ved ændringen:** Lav, det er et ekstra felt i journalfilerne, som kun læses.
  - **Hvor:** `electron/warehouse/countService.cjs:1036-1060`, `:1096-1101`, `:1118-1132`; `electron/warehouse/journal.cjs`

- [x] **2.12 Materialelåse udløber aldrig, og managere og admins kan ikke frigive dem fra skærmen (count.md I3)**
  - **Hvad sker der i dag:** Kim låser R162-0717 fredag og går på ferie. Mandag kan ingen gemme tællelinjer for materialet, ejeren er også væk, og manageren ser ingen "Frigiv"-knap, selvom backend tillader det.
  - **Hvorfor det betyder noget:** Optællingen står stille for materialet, til den rette person dukker op.
  - **Hvad skal ændres:**
    1. Lad en lås udløbe, når indehaveren ikke har lavet en linje eller scanning på materialet i fx 60 minutter (samme idé som `CLAIM_IDLE_MS`), og vis "inaktiv siden {tid}".
    2. Vis "Frigiv", og lad `answerMaterialRequest` tage imod svar fra managere og Optællings admins (`rights.byRole`), som `canDecideMembers` gør.
  - **Risiko ved ændringen:** Lav, en udløbet lås åbner kun materialet for andre.
  - **Hvor:** `electron/warehouse/countService.cjs:967-1033` (især `:1001` og `:1018`); `src/views/warehouse/count/MaterialWork.tsx:108` og `:169`

---

## Fase 3: Vigtige fejl i Placeringer

- [x] **3.1 Materialevælgeren: Enter tager et gammelt markeret forslag i stedet for det scannede nummer (locations.md I8)**
  - **Hvad sker der i dag:** Brugeren har skrevet "R162", listen er åben, og R162-0717 er markeret. Så scannes R162-0999 med Enter, men listen hører stadig til "R162", så R162-0717 vælges, og i "Læg på hylde" lægges antallet på hylden som R162-0717.
  - **Hvorfor det betyder noget:** Forkert materiale på en hylde er også forkert i Tag og på materialekortet.
  - **Hvad skal ændres:** Husk, hvilken tekst forslagene hører til. Brug kun det markerede forslag, når brugeren har flyttet med piletasterne, eller forslagene hører til den aktuelle tekst. Ellers vælges den skrevne værdi.
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `src/views/warehouse/locations/MaterialPicker.tsx:31-41` og `:52-58`

- [x] **3.2 Søgning på forsiden: Enter åbner hittet fra den forrige søgning eller intet (locations.md I7)**
  - **Hvad sker der i dag:** En scanner sender koden og Enter på få millisekunder, mens søgningen venter 200 ms og derefter på svar. Når Enter kommer, er resultatet stadig det fra den forrige tekst, og havde det ét hit, åbnes det forkerte kort.
  - **Hvorfor det betyder noget:** Brugeren kan tage eller flytte den forkerte palle fra det kort.
  - **Hvad skal ændres:**
    1. Gem søgeteksten sammen med resultatet.
    2. Ved Enter: hører resultatet til den aktuelle tekst og har ét hit, åbnes det. Ellers sættes et flag `openWhenReady`, og kortet åbnes, når det rigtige resultat kommer, men kun hvis det har præcis ét hit.
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `src/views/warehouse/locations/SearchResults.tsx:18-37`

- [x] **3.3 Samme 49/50-nummer og serienumre kan sættes på plads to gange uden advarsel (locations.md I10)**
  - **Hvad sker der i dag:** To personer modtager samme følgeseddel, eller én gemmer, får en tilbagerulning (3.7) og gemmer igen, efter at den første faktisk landede. Hver gemning får et nyt handlings-id, så intet stopper en ekstra palle med samme dokument og samme serienumre.
  - **Hvorfor det betyder noget:** Dobbelte paller giver lager, der ikke findes, og FIFO peger på en palle, der ikke er der.
  - **Hvad skal ændres:**
    1. `lookupDocument` returnerer også de paller og hyldelinjer, der allerede har dokumentet, og serienumre, der allerede ligger på en palle.
    2. I Sæt palle på plads vises "Allerede sat på plads: A2.4 (Bo, i går)", og der spørges, før der gemmes.
    3. I `putAway` afvises et serienummer, der allerede er på en anden palle, medmindre `allowDuplicate: true`.
  - **Risiko ved ændringen:** Lav, for delleverancer med samme 49/50-nummer virker stadig, fordi dokumentet kun giver en advarsel.
  - **Hvor:** `electron/warehouse/locations/service.cjs:109-140`; `src/views/warehouse/locations/PutAway.tsx:124-137`; `electron/warehouse/locations/rules.cjs:86-87`

- [x] **3.4 "Ret antal" på hylder og pallens antal overskriver blindt ud fra en gammel skærm (locations.md I2)**
  - **Hvad sker der i dag:** Mia åbner "Ret antal" på E9 H5 / R162-0717, som viser 40, og begynder at tælle. Imens tager Ole 10. Mia skriver 40, backend sætter 40, og Oles tag er slettet.
  - **Hvorfor det betyder noget:** En optælling skal gøre lageret rigtigt, men her kan den gøre det forkert igen i stilhed.
  - **Hvad skal ændres:**
    1. Send `expected` (det antal, dialogen viste) med `shelfSet`.
    2. Backend afviser med `STOCK_CHANGED` ("Antallet er ændret til 30 af Ole kl. 10:12. Tæl igen, eller gem alligevel."), når det gemte antal er anderledes.
    3. Dialogen tilbyder "Gem alligevel", som sender igen uden `expected`.
    4. Det samme for pallens antal (se 1.10).
  - **Risiko ved ændringen:** Lav, det er en ny valgfri parameter.
  - **Hvor:** `src/views/warehouse/locations/ShelfLines.tsx:73-80`; `electron/warehouse/locations/service.cjs:261-277`; `PalletCard.tsx` (EditDialog)

- [x] **3.5 Fortryd kan sætte en palle tilbage på en plads, der nu er fuld, reserveret eller deaktiveret (locations.md I1)**
  - **Hvad sker der i dag:** Kl. 9:00 flytter Bo palle P fra A2.4 til B1.1. Kl. 9:20 sætter Lis en ny palle på A2.4, som kun har plads til én. Kl. 10:00 fortryder manageren Bos flytning, og P kommer tilbage på A2.4, så der står to paller på en plads til én.
  - **Hvorfor det betyder noget:** Listen viser en overfyldt plads, næste indsættelse afvises med "A2.4 er fuld", og pallen kan stå uden for FIFO.
  - **Hvad skal ændres:**
    1. I `undoCheck`: tæl paller pr. plads efter fortrydelsen, og returnér en konflikt, når antallet overstiger pladsens grænse, eller pladsen er blevet reserveret, station eller inaktiv.
    2. `blocker()` nævner så, hvem der brugte pladsen: "Kan ikke fortrydes. Lis satte … på A2.4 kl. 09:20. Fortryd den først."
    3. Tilføj en test for "flyt tilbage til en plads, der er brugt igen".
  - **Risiko ved ændringen:** Lav, den afviser kun flere fortrydelser.
  - **Hvor:** `electron/warehouse/locations/undo.cjs:34-53`; `repository.cjs:122-150`; `service.cjs:858-865`

- [x] **3.6 Paller på deaktiverede, reserverede eller station-pladser kan ikke findes på materiale eller tages (locations.md I3)**
  - **Hvad sker der i dag:** En admin deaktiverer A3.1 for reparation, og pallerne bliver stående som tilsigtet. Derefter viser materialekortet og "Hvor henter jeg?" dem ikke, "På lager" tæller dem ikke med, og Tag og Flyt på materiale finder dem ikke, selvom admin-dialogen lover, at de "kan flyttes eller tages bagefter".
  - **Hvorfor det betyder noget:** Varer ser udsolgte ud, mens de står på gulvet.
  - **Hvad skal ændres:**
    1. `materialCard` returnerer disse paller i en særskilt liste med grund ("deaktiveret", "reserveret", "arbejdsstation").
    2. Vis listen under reservelisten i MaterialCard, FetchGuide, Tag og Flyt, men ikke først i FIFO.
    3. Lad Tag tage dem (backend tillader det allerede).
    4. I "På lager" vises "≥ N stk." eller "+ k paller uden antal", når antal er ukendt.
  - **Risiko ved ændringen:** Lav, FIFO-rækkefølgen og forslagene er uændrede.
  - **Hvor:** `electron/warehouse/locations/rules.cjs:36-42`; `service.cjs:382-400`; `src/views/warehouse/locations/TakePallet.tsx`; `MovePallet.tsx:82-85`; `PalletCard.tsx:66`; `Admin.tsx:101-102` og `:365-367`

- [x] **3.7 Sæt palle på plads tjekker først pladsen på M: 15-40 s senere og afviser hele partiet (locations.md I6)**
  - **Hvad sker der i dag:** En person registrerer 6 paller fra én levering og skriver A2.4 for én af dem, som er fuld, deaktiveret eller en lagerhylde. Formularen ryddes, og der står "6 paller er sat på plads", men 30 s senere kommer alle 6 tilbage med "A2.4 er fuld", mens personen er gået videre. Uden en udgivet tegning er der slet ingen pladsliste på skærmen.
  - **Hvorfor det betyder noget:** En person, der er gået, ser måske aldrig tilbagerulningen og efterlader 6 paller uregistreret.
  - **Hvad skal ændres:**
    1. Læs altid pladslisten i PutAway, ikke kun når der er en tegning.
    2. Vis `moveTargetCheck(...)` under hver palles pladsfelt, og tæl paller i formularen til samme plads med.
    3. Gør "Gem" utilgængelig, mens en plads er blokeret.
    4. Valgfrit: backend sætter de paller, der passer, og returnerer de afviste, så kun de kommer tilbage.
  - **Risiko ved ændringen:** Lav for tjekket på skærmen, men det delvise parti kræver omhu med fortryd-øjebliksbilledet.
  - **Hvor:** `src/views/warehouse/locations/PutAway.tsx:73-101` og `:138-166`; `electron/warehouse/locations/service.cjs:109-140`

- [x] **3.8 Fyld pluk-plads op advarer ikke, når en yngre palle bruges (locations.md I11)**
  - **Hvad sker der i dag:** I Tag spørger appen, om man vil tage alligevel, hvis man vælger en anden palle end den ældste. I Fyld op har hver palle sin egen knap, intet spørger, og den første er kun mærket "Forslag".
  - **Hvorfor det betyder noget:** FIFO brydes i det flow, der bruger flest paller, og de to skærme opfører sig forskelligt.
  - **Hvad skal ændres:** Genbrug bekræftelsen fra Tag i Refill (samme tekst og en knap "Fyld op alligevel"), når den valgte palle er modtaget senere end den ældste reservepalle.
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `src/views/warehouse/locations/Refill.tsx:62-72` og `:143-155`; `TakePallet.tsx:51-54` og `:117-124`

- [x] **3.9 "Scanninger gemmes lokalt" vises, selvom intet er gemt lokalt (locations.md I12 og shared.md M1)**
  - **Hvad sker der i dag:** M: er nede. En admin opretter en reol eller deaktiverer pladser, skærmen viser det med det samme og ruller så tilbage med "Kan ikke nå lagerstyrings-data på M:. Scanninger gemmes lokalt og sendes, når forbindelsen er tilbage.", men intet blev gemt. Ifølge shared.md M1 kommer samme tekst også i Softwareload, Stempelkort og rollekortet og ved enhver "fil ikke fundet"-fejl, fx når en SAP-eksport mangler sin fil i den lokale temp-mappe.
  - **Hvorfor det betyder noget:** Brugeren får et forkert løfte om data og bliver sendt til at tjekke M:, når problemet er SAP.
  - **Hvad skal ændres:**
    1. Gør teksten for `STORAGE_UNAVAILABLE` neutral: "Kan ikke nå data på M: lige nu. Prøv igen om lidt." Behold sætningen om lokal gemning kun i Optællings scanning og i `deferredText`. Alternativt får Placeringers admin-, reol- og tegningsskærme deres egen tekst: "M: kan ikke nås. Ændringen er ikke gemt. Prøv igen, når forbindelsen er tilbage."
    2. I `toIpcError`: tag kun imod koder, der ikke begynder med `ERR_`, så Nodes interne fejl ikke når skærmen.
    3. Oversæt kun `ENOENT` til `STORAGE_UNAVAILABLE`, når fejlens sti ligger under platformens rodmappe på M:.
  - **Risiko ved ændringen:** Lav, det er mest tekst.
  - **Hvor:** `src/lib/warehouse/errors.ts:31` og `:189`; `electron/warehouse/register.cjs:39-52`, `:451-460`, `:468-482`

- [x] **3.10 Læg på hylde: et 49/50-nummer med flere materialer giver altid kun det første (locations.md I9)**
  - **Hvad sker der i dag:** Skærmen siger, at nummeret har 3 materialer, og at det første er valgt. De to andre og deres antal fra SAP smides væk, og scanner man igen, får man det første igen, mens Sæt palle på plads håndterer samme dokument korrekt.
  - **Hvorfor det betyder noget:** Det giver ekstra tastning og tælling ved hylden med antal skrevet i hånden i stedet for SAP's.
  - **Hvad skal ændres:**
    1. Gem alle fundne materialer, og vis dem som knapper ("R162-0717 · 12 stk." osv.).
    2. Et valg udfylder materiale og antal.
    3. Efter gemning forvælges det næste, der ikke er gemt, og 49/50-nummeret beholdes, til alle er færdige.
  - **Risiko ved ændringen:** Lav.
  - **Hvor:** `src/views/warehouse/locations/ShelfPut.tsx:63-80`

- [ ] **3.11 Månedens historikfil læses og skrives helt ved hver handling (locations.md I4)**
  - **Hvad sker der i dag:** Hvert tag, hver flytning, indsættelse og hyldehandling får M: til at læse, dekryptere, kryptere og gemme hele månedsfilen under låsen, og en palle med 200 serienumre gemmes to gange (før og efter). Sidst på en travl måned er filen flere MB (skøn, ikke målt), alle andre PC'er venter på samme lås, og kort og log læser hele filen igen.
  - **Hvorfor det betyder noget:** Det er en stor del af de 15-40 s pr. handling, det vokser med brugen, og de lange låse giver også KV_LOCK_BUSY (1.8).
  - **Hvad skal ændres:**
    1. Skriv hændelser til en lille nøgle pr. dag (`history-YYYY-MM-DD`) eller til en fil pr. PC, der flettes ved læsning.
    2. Gem kun de felter, der ændrede sig, og serienumre kun hvis de ændrede sig.
    3. Lad kortene læse de sidste 30 dage, medmindre der trykkes "Vis mere".
    4. Cache loggens vurdering pr. handling, og kør `blocker()` først, når en linje faktisk peges på eller klikkes.
  - **Risiko ved ændringen:** Middel, fordi alt, der læser historik (kort, log, fortryd, Hubert), skal læse de nye nøgler, mens gamle månedsfiler stadig kan læses.
  - **Hvor:** `electron/warehouse/locations/repository.cjs:89-104` og `:161-171`; `undo.cjs:9-27`; `service.cjs:382-455` og `:841-875`

- [ ] **3.12 `meta` med 2000 handlings-id'er skrives ved hver handling og læses hvert 15. sekund af hvert vindue (locations.md I5)**
  - **Hvad sker der i dag:** `meta` rummer omkring 2000 id'er plus listen over alle pladser på tegningen. Hvert åbent Placeringer-vindue læser den uden om cachen hvert 15. sekund, og hver handling skriver hele filen, så ti PC'er giver 40 fulde læsninger i minuttet bare for at se, om et tidsstempel har flyttet sig.
  - **Hvorfor det betyder noget:** Det giver konstant belastning på det langsomme drev og en stor fil mere i hver handlings låse.
  - **Hvad skal ændres:**
    1. Flyt listen over udførte handlinger (`applied`) til sin egen nøgle, som kun læses og skrives inde i en handling.
    2. Læg `changedAt` i en lille nøgle `stamp`, som `stamp()` læser.
    3. Behold `meta` til import, go-live og tegning.
  - **Risiko ved ændringen:** Lav til middel, for listen flyttes én gang, og i overgangen skal begge steder læses.
  - **Hvor:** `electron/warehouse/locations/repository.cjs:12` og `:31-34`; `service.cjs:311-313`; `src/views/warehouse/locations/Locations.tsx:71-79`; `layoutService.cjs:142`

---

## Fase 4: Vigtige fejl i Stempelkort og Softwareload

Rapporten fandt ingen kritiske fejl her. Den fandt ingen vej, hvor en terminal flyttes to gange, eller hvor en KIF-opgave flytter uden om D005.

- [x] **4.1 "Flyt til D005" flytter i SAP med ét klik uden bekræftelse (timeclock-softwareload.md I6)**
  - **Hvad sker der i dag:** KIF-forhåndsvisningen har en stor primær knap "Flyt til D005", som starter flytningen i SAP med det samme, mens afslutning af en opgave altid spørger først. Det er allerede sket i PS4 den 23.11: Jacob trykkede ved en fejl på NXC600007637/38/39 (dokument 4900245235) og måtte selv flytte dem tilbage med en opgave.
  - **Hvorfor det betyder noget:** En forkert flytning i produktionssystemet er allerede sket, og oprydningen forurener statistikken.
  - **Hvad skal ændres:**
    1. Læg flytningen ind i samme bekræftelsesdialog som ved afslutning: "Flyt N terminaler til D005 i SAP?" med linjerne "Trin i SAP" (fra → D005 og antal). Brugeren bekræfter med "Flyt".
    2. Valgfrit: giv knappen i forhåndsvisningen en sekundær stil, så den ikke er det oplagte mål for Enter.
  - **Risiko ved ændringen:** Ingen for data, det koster ét ekstra klik.
  - **Hvor:** `src/views/warehouse/softwareload/SoftwareloadKif.tsx:126`; sammenlign `SoftwareloadFinish.tsx:167-186`

- [x] **4.2 Stempelkort sætter Softwareload-opgaven på pause uden at sige det, og scanninger lander stadig (timeclock-softwareload.md I3)**
  - **Hvad sker der i dag:** En medarbejder har en Softwareload-opgave i gang og starter Stempelkort på "Pakning" i 10 minutter, så opgaven sættes på pause uden besked. Tilbage i Softwareload virker scanning stadig, og de scanner 60 terminaler den næste time uden at opdage pausen. Fejler pausen (M: er langsom), kører begge ure, og tiden tælles to gange.
  - **Hvorfor det betyder noget:** Tempotallene bliver forkerte i netop de sammenligninger, statistikken er til for, og i fejltilfældet tælles tiden dobbelt.
  - **Hvad skal ændres:**
    1. Handleren returnerer resultatet (`pausedSoftwareload` og `softwareloadPauseFailed`), og `pauseIfRunning` melder en fejl i stedet for at sluge den, fx `{ failed: true }`.
    2. `Timeclock.tsx` viser "Din softwareload-opgave er sat på pause", eller ved fejl "Softwareload-opgaven kunne ikke sættes på pause. Sæt den på pause selv".
    3. `SoftwareloadTask.tsx`: når der scannes under pause, vises et tydeligt gult banner med knappen "Fortsæt tiden", som kalder `resume` (det stopper også Stempelkort). Alternativt spørges én gang pr. pause: "Opgaven holder pause. Fortsæt tiden?".
    4. Behold reglen om, at scanninger ikke afvises.
  - **Risiko ved ændringen:** Lav, det er kun skærm og returværdier.
  - **Hvor:** `electron/warehouse/register.cjs:375-385`; `electron/warehouse/softwareload/softwareloadService.cjs:477-489`; `src/views/warehouse/timeclock/Timeclock.tsx:112-121`; `src/views/warehouse/softwareload/SoftwareloadTask.tsx:454`

- [x] **4.3 Stempelkort og Softwareload ser kun hinanden i den aktive hub, så tid kan tælles to gange (timeclock-softwareload.md I4) (usikkert)**
  Usikkert hvor ofte, fordi det ikke er undersøgt, hvor mange der har adgang til begge hubs.
  - **Hvad sker der i dag:** En person med adgang til både TCD og TRR starter Stempelkort i TCD, skifter Hub til TRR og starter en Softwareload-opgave. Stop af Stempelkort leder i TRR, finder intet, og fejlen ignoreres, så begge ure kører.
  - **Hvorfor det betyder noget:** Tiden tælles dobbelt uden advarsel, og to ure viser begge "I gang".
  - **Hvad skal ændres:** Vælg én af to løsninger:
    1. Mulighed a: i `stopTimeclock` og `pauseIfRunning` tjekkes også de andre teams, personen hører til (gennemløb `TEAM_IDS`; `serviceUser` skal levere personens teams).
    2. Mulighed b, som er enklere: afvis start eller fortsæt, når det andet ur kører i et andet team, med en besked, der nævner hubben: "Stempelkort kører i TCD. Stop det der først".
  - **Risiko ved ændringen:** Middel, fordi en ekstra mappe på M: læses ved hver start, og der må ikke oprettes mapper for teams, personen ikke hører til.
  - **Hvor:** `electron/warehouse/register.cjs:201` og `:206`; `electron/warehouse/hubUser.cjs:13`; `softwareloadService.cjs:353-361` og `:477-489`

- [x] **4.4 En glemt Softwareload-opgave tæller hele natten eller weekenden, og ingen kan rette det (timeclock-softwareload.md I1)**
  - **Hvad sker der i dag:** En medarbejder starter en opgave fredag kl. 13, scanner 40 terminaler og går hjem uden at trykke "Afslut opgave". Mandag kl. 7 afsluttes den med omkring 66 timer, så tempoet for personen, typen og materialerne falder til under 1 terminal i timen. En manager kan kun slette hele opgaven, hvilket også fjerner terminalerne fra statistik og søgning.
  - **Hvorfor det betyder noget:** Én glemt opgave ødelægger periodens tempo, og manageren må vælge mellem et forkert tal og at slette rigtig historik.
  - **Hvad skal ændres:**
    1. `finish` tager et valgfrit `endAt` som i Stempelkort og afviser med `SOFTWARELOAD_LONG_RUN`, når der er gået mere end `LONG_RUN_MS` (genbrug konstanten fra `timeclockService.cjs`), og der ikke er givet et `endAt`. `endAt` tjekkes som i Stempelkort (efter seneste start eller pause og ikke efter nu), bruges som sluttid og markeres med `endCorrected: true`.
    2. `SoftwareloadFinish.tsx` viser samme dialog "Hvornår stoppede du?" (`LongRunDialog` fra `Timeclock.tsx` kan deles) og sender `endAt` med `taskId` og `choice`.
    3. Vis en advarsel på skærmen for den kørende opgave efter 10 timer, som `Timeclock.tsx:166` gør.
  - **Risiko ved ændringen:** Lav, for sluttiden fryses allerede i afslutningsmarkøren, så den rettede værdi følger med, hvis afslutningen genoptages.
  - **Hvor:** `electron/warehouse/softwareload/softwareloadService.cjs:850-853`; `electron/warehouse/timeclockService.cjs:85-99`; `src/views/warehouse/softwareload/SoftwareloadStats.tsx`

- [x] **4.5 Tiden kan ikke stoppes, når SAP ikke er tilgængelig (timeclock-softwareload.md I2)**
  - **Hvad sker der i dag:** "Afslut opgave" slår først alle serienumre op i SAP, og knappen "Afslut og flyt i SAP" vises først, når SAP har svaret. Kl. 15:55 har SAP logget medarbejderen ud, de vil hjem, men uret kører, til de logger ind igen. De eneste udveje er Pause eller Annullér, og Annullér smider tid og scanninger væk.
  - **Hvorfor det betyder noget:** Tiden bliver forkert, og brugeren må vælge mellem at miste scanninger og lade uret køre.
  - **Hvad skal ændres:**
    1. Tilføj en ekstra måde at afslutte på: "Stop tiden nu, flyt i SAP senere". Tjenesten overdrager opgaven til `venter-<id>` præcis som `finish`, men uden at kalde `execute`. Flyt overdragelsen ud af `finish` i en fælles `handOver(user, confirmedId, confirmedChoice)`.
    2. Bekræftelsen viser de fire valg og antallet af terminaler, men ikke SAP's plan.
    3. "Fortsæt i SAP" laver derefter opslag og flytninger, som i dag efter en afbrudt afslutning.
    4. Vis knappen på afslutningsskærmen, når forhåndsvisningen fejlede, og på skærmen for den kørende opgave.
  - **Risiko ved ændringen:** Middel, fordi brugeren flytter uden at have set SAP's plan, hvilket kan løses med en forhåndsvisning (`planMoves`) i fanen Venter før "Fortsæt i SAP".
  - **Hvor:** `src/views/warehouse/softwareload/SoftwareloadFinish.tsx:54-63` og `:159-164`; `electron/warehouse/softwareload/softwareloadService.cjs:527-533` og `:827-829`

- [x] **4.6 Opgavelisten i Statistik viser et andet "flyttet"-tal end oversigten over den (timeclock-softwareload.md I5)**
  - **Hvad sker der i dag:** En opgave uden for KIF har 10 terminaler, hvoraf 3 allerede stod på målet. "Pr. person og type" viser "Loadet 10", men samme opgave i "Opgaver" viser "7/10". En opgave med 2 fejlede -R-terminaler viser "8/10 (2 fejlet)", som om der mangler flere.
  - **Hvorfor det betyder noget:** Managere ser to tal for det samme og tror, at terminaler mangler, eller at SAP fejlede.
  - **Hvad skal ændres:**
    1. Vis "Loadet" præcis som `summarizeTasks` tæller (terminaler, der ikke er fejlet).
    2. Tilføj et rødt antal for problemudfald (`isProblem` fra `common.tsx`: SAP afviste, opgivet, afbrudt, manuel, ikke fundet, spærret lager), fx "10 (1 SAP afviste)".
    3. Fjern den lokale `movedOf` fra statistikvisningen.
  - **Risiko ved ændringen:** Meget lav, kun visningen ændres.
  - **Hvor:** `src/views/warehouse/softwareload/SoftwareloadStats.tsx:34` og `:530`; `src/lib/softwareload.ts:138-142`

---

## Fase 5: Vigtige fejl i det fælles

- [x] **5.1 Kopiér-knapper siger "kopieret", selvom Windows afviste udklipsholderen (shared.md I1)**
  - **Hvad sker der i dag:** På fanen "Til optællingsdokument" klikker en person "Antal" for R162-0717 D004 (42). Udklipsholderen er låst et øjeblik af et andet program, og beskeden siger "42 kopieret", men udklipsholderen har stadig forrige rækkes "37", som sættes ind i MI04 i PS4. Det samme gælder serienummerlisterne "Kopiér" og "Lange".
  - **Hvorfor det betyder noget:** En forkert værdi tastet i PS4 er en forkert SAP-optælling, der kan blive bogført, og beskeden siger, at det er sikkert.
  - **Hvad skal ændres:**
    1. Brug `putOnClipboard(clipboard, text)` i begge handlere (`clipboard:write` og `counts:copy-serials`). Returnerer den false, kastes ny kode `CLIPBOARD_REFUSED`.
    2. Tilføj danske og engelske tekster i `src/lib/warehouse/errors.ts`.
    3. Brug samme kode i stedet for `SAP_EXPORT_FAILED` og `PIDOC_SAP_FAILED` i `sapFetch.cjs:133,184` og `sapPiDocs.cjs:93,144`, så den engelske skærm ikke siger, at SAP-opslaget fejlede, når det er udklipsholderen. Se også 7.15.
  - **Risiko ved ændringen:** Lav, det er én ekstra læsning af udklipsholderen pr. kopi (millisekunder).
  - **Hvor:** `electron/warehouse/register.cjs:278-282` og `:347-351`; `src/views/warehouse/count/DocPanel.tsx:299-309`; `src/views/warehouse/count/OverviewPanel.tsx:129-140`; `src/components/warehouse/TableSelection.tsx:68-70`; `electron/warehouse/clipboardText.cjs:8-11`

- [x] **5.2 Skrivescripts er ikke låst til det SAP-system, installationen er sat op til (shared.md I3)**
  - **Hvad sker der i dag:** Kørslen godtager et skrivescript, hvis systemet er PS4 eller QS4, uanset hvad installationen er sat op til. Kommentaren om, at scripts "tjekker det igen", passer ikke, for ingen af dem gør det. Fordi listerne nu er ens, er spærrene for skrivning altid åbne, og der er ingen hurtig måde at slå PS4-skrivning fra uden en ny udgivelse.
  - **Hvorfor det betyder noget:** PS4 er produktion, og det eneste, der står mellem en QS4-testinstallation og PS4, er, at alle kald sender det rigtige system.
  - **Hvad skal ændres:**
    1. I `createCscriptRunner`: afvis et skrivescript, medmindre systemet i `args[0]` er lig det konfigurerede system og står på listen. Returnér `SAP_WRITE_SYSTEM_NOT_ALLOWED`.
    2. Fjern den forkerte sætning om, at scripts tjekker igen, eller tilføj tjekket i scripts: sammenlign `WScript.Arguments(0)` med miljøvariablen `COUNTPOINT_SAP_SYSTEM`, som kørslen allerede sætter.
    3. Erstat de altid åbne lister med en kontakt i konfigurationen (se 7.18).
  - **Risiko ved ændringen:** Lav, for alle nuværende kald sender allerede det konfigurerede system.
  - **Hvor:** `electron/warehouse/sapBridge.cjs:10-17` og `:32-39`; `electron/warehouse/config.cjs:9`; `electron/warehouse/register.cjs:186`; `electron/warehouse/softwareload/softwareloadSap.cjs:52`

- [ ] **5.3 Klient 100 tjekkes aldrig ved PI-dokumenter eller "Vis i SAP" (shared.md I4) (usikkert)**
  Det er usikkert, om en skrivning til en forkert klient kan ske i praksis. At tjekket af SAP-tilstand mangler, er sikkert.
  - **Hvad sker der i dag:** Kun indikatoren, hentningerne og Softwareload tjekker for klient 100. PI-dokumentskrivninger tjekker ikke SAP-tilstanden, og scripts vælger forbindelse kun på systemnavn og tager den sidste, der passer, mens indikatoren tager den første. Har en manager både PS4/100 og PS4 på en anden klient åben, kan MI31 køre på den anden klient, og står den sidste PS4-forbindelse på logon-skærmen, kommer en forvirrende fejl, selvom indikatoren var grøn.
  - **Hvorfor det betyder noget:** Indikatoren lover PS4/100, men skrivninger kan lande et andet sted eller fejle uventet.
  - **Hvad skal ændres:**
    1. Send den forventede klient som argument til alle skrivescripts og til `sap-show.vbs`.
    2. Vælg forbindelsen, hvor både systemnavn og klient passer, og stop ved den første (samme regel som `computeSapState`).
    3. Efter `CreateSession`: afslut med `wrong-system`, medmindre både system og klient passer.
    4. I `sapPiDocs.cjs`: kør samme `computeSapState`-tjek som `softwareloadSap.cjs:57` før hver skrivning.
    5. I `DocPanel.tsx`: brug `SapActionButton` til opret, udskriv, tæl, bogfør og slet.
  - **Risiko ved ændringen:** Middel, fordi seks skrivescripts ændres og skal prøves i QS4 først, men brugere med én forbindelse mærker intet.
  - **Hvor:** `electron/warehouse/sapState.cjs:22-29`; `electron/warehouse/register.cjs:79`; `electron/warehouse/sapPiDocs.cjs`; `src/views/warehouse/count/DocPanel.tsx:102`, `:119`, `:131`, `:146`, `:159`; `electron/warehouse/sap/pidoc-create.vbs:130-135` (samme løkke i de øvrige `pidoc-*.vbs`); `sap/sl-transfer.vbs:82-91`; `sap/sap-show.vbs:36-41` og `:67`

- [ ] **5.4 Bogføring af PI-dokumenter læser udklipsholderen igen efter op til 15 minutter, og PI-skrivninger kører uden om SAP-køen (shared.md I2)**
  - **Hvad sker der i dag:** Ved flere dokumenter lægges numrene på udklipsholderen, MI20 udfyldes, og scriptet venter op til 15 minutter på, at manageren bogfører. Derefter udfyldes MI22 fra udklipsholderen igen uden kontrol, så har manageren kopieret et materialenummer imens, melder Hub de 3 dokumenter som stadig åbne, selvom SAP har bogført dem. Samtidig kan en Softwareload-flytning eller et MM60-opslag køre på samme PC, fordi PI-skrivninger ikke går gennem køen.
  - **Hvorfor det betyder noget:** Optællingsdokumentet viser bogførte dokumenter som ikke bogført, og næste "Bogfør" fejler eller forvirrer.
  - **Hvad skal ændres:**
    1. `pidoc-post.vbs`: udfyld MI22 fra den listefil, JavaScript allerede skriver (eller fra argumenter), ikke fra udklipsholderen. Som minimum tilføjes `Check "wnd[0]/usr/txtIM_IBLNR-LOW", firstDoc` efter linje 254 med afslutning `status-not-verified`, hvis det fejler. `UploadClipboard` afslutter med `Finish False, "multiple-selection-failed"`, når tredje forsøg ikke passer.
    2. `postDocuments`: konkludér aldrig "åben" ud fra en MI22-læsning, der ikke indeholder alle numre. Meld dem som ukendte ("tjek i SAP").
    3. Skriv i `sapBridge.cjs`, at PI-skrivninger bevidst går uden om køen (fordi de venter på F8), eller tag køen kun under udklipsholderdelen.
  - **Risiko ved ændringen:** Middel for VBS-ændringerne, som skal køres i QS4, og lav for ændringen i JavaScript.
  - **Hvor:** `electron/warehouse/sapPiDocs.cjs:43-54`, `:58-89`, `:139-156`, `:158-197`; `electron/warehouse/sap/pidoc-post.vbs:84-99`, `:193`, `:254`; `electron/warehouse/sapBridge.cjs:1-3` og `:60-65`

- [x] **5.5 SAP-indikatoren siger, at man altid selv trykker F8, Gem eller Post, men Softwareload bogfører selv i PS4 (shared.md I10)**
  - **Hvad sker der i dag:** SAP-pillen vises i Optælling, Placeringer og Softwareload og siger altid, at man selv trykker F8, Gem eller Post. I Softwareload trykker "Afslut og flyt i SAP" og "Flyt til D005" selv på Transfer og Post (MIGO 343/344) i PS4, og alle tilstandstekster nævner Optælling, også i de andre værktøjer.
  - **Hvorfor det betyder noget:** En Softwareload-bruger tror, at intet bogføres, før de selv trykker, hvilket er det modsatte af virkeligheden i produktion.
  - **Hvad skal ændres:**
    1. Send værktøjet til `SapIndicator` og vis en tekst pr. værktøj. Optælling: den nuværende tekst. Placeringer: "Placeringer læser kun fra SAP (materialedokumenter og beskrivelser)." Softwareload: "Softwareload flytter terminalerne i SAP selv, når du klikker 'Afslut og flyt i SAP' eller 'Flyt til D005'. Der bogføres i {system}."
    2. Erstat "Optælling" i `sapStatus.ts` med "appen" eller værktøjets navn.
    3. Opdatér `sapStatus.test.ts`, og hold testen for engelske tekster grøn.
  - **Risiko ved ændringen:** Ingen, det er tekster.
  - **Hvor:** `src/components/warehouse/SapIndicator.tsx:31` og `:68`; `src/lib/warehouse/sapStatus.ts:13-21`; `src/views/warehouse/Warehouse.tsx:75`

- [x] **5.6 Rollecachen fejler åben, så en fjernet status manager eller admin beholder sine rettigheder (shared.md I5)**
  - **Hvad sker der i dag:** Hver handling bruger en rolle, der kan være 30 sekunder gammel, og derefter returneres den gamle værdi stadig, mens en ny læsning kører i baggrunden. Fejler læsningen (rollefilen er optaget eller ulæselig), beholdes den gamle værdi for altid. En manager fjerner Bob som status manager på PC A, men på PC B kan Bob stadig godkende materialer, bestemme deltagere og starte trin på PI-dokumenter.
  - **Hvorfor det betyder noget:** Rettigheder skal falde tilbage til "ingen adgang" ved fejl, ikke til den gamle adgang.
  - **Hvad skal ændres:**
    1. Giv hver post i cachen en hård maksimal alder (fx to gange de 30 sekunder). Derefter ventes på en frisk læsning, og ved fejl bruges rollen 'user'.
    2. Når en ny læsning fejler, beholdes den gamle værdi kun til den hårde grænse.
    3. Valgfrit: skriv et lille stempel "roller ændret kl." ved siden af rollefilen, og sammenlign det billigt, så andre PC'er smider cachen væk med det samme.
  - **Risiko ved ændringen:** Lav, men en status manager kan kortvarigt blive behandlet som almindelig bruger under et langt udfald på M:.
  - **Hvor:** `electron/warehouse/register.cjs:160-185` og `:240-247`; `electron/warehouse/roles.cjs:42-44`; `electron/warehouse/piDocService.cjs:23`

- [x] **5.7 Hubert skjuler "Læg antal på" for admins og status manager-opgaver for status managere (shared.md I9)**
  - **Hvad sker der i dag:** Guideopgaver, der kræver manager, vises kun for Hub-managere, og Optællings egne roller ignoreres. En admin, som er den eneste, der må lægge antal på, spørger Hubert "hvordan lægger jeg antal på SAP-dokumentet?" og får svaret "Tæl et materiale og send det til godkendelse". En status manager, der spørger, hvordan man starter en status, får "Opret en optælling".
  - **Hvorfor det betyder noget:** Hubert sender netop de personer, der udfører trinene, til de forkerte instruktioner.
  - **Hvad skal ændres:**
    1. Lad lageropgaver kræve `'count-manager'` (manager eller status manager) eller `'count-admin'`, og lad assistenten slå rollen op via samme `serviceUser` og `roles.roleOf` som modulet (assistenten har allerede `userFor: serviceUser`, `register.cjs:485`).
    2. Gør `sap-documents` synlig for managere, status managere og admins, og `start-status`, `approve-materials` og `lock-status` for managere og status managere.
    3. Ret `warehouse-roles`' svar til almindelige brugere til en opgave, de må læse, eller fjern det, så `rolesAnswer` forklarer.
  - **Risiko ved ændringen:** Lav til middel, fordi den fælles guide ændres, så de nye rolletyper skal begrænses til lagermodulet.
  - **Hvor:** `electron/assistantAppGuideWarehouse.cjs:45-49`, `:105-109`, `:119-123`, `:145-149`, `:179-183`; `electron/assistantAppGuide.cjs:1059` og `:1148-1152`; `electron/assistantContext.cjs:495`, `:500`, `:762`

- [x] **5.8 Fejlkoder når skærmen uden dansk eller engelsk tekst (shared.md I6 og locations.md M6)**
  - **Hvad sker der i dag:** Koder uden tekst ender som "Der skete en uventet fejl". En engelsktalende TRR-kollega prøver at tage området "Reol 4", som Anna tæller, og skærmen siger "Something unexpected went wrong. Try again." i stedet for, at Anna allerede tæller det. I Placeringer får engelske brugere fx "The location is full." uden at kunne se, hvilken af 6 pladser det gælder (locations.md M6).
  - **Hvorfor det betyder noget:** Helt normale situationer ligner nedbrud, så folk prøver igen eller ringer efter hjælp.
  - **Hvad skal ændres:**
    1. Tilføj danske og engelske tekster for alle koder, som shared.md I6 lister (fx `REPORT_OPEN_FAILED`, `MEMBER_NOT_FOUND`, `CLAIM_INVALID`, `APPROVAL_INVALID`, `JOURNAL_CLOSED`, `SAP_SCRIPT_NOT_ALLOWED`, `AUTH_*`, `CLAIM_TAKEN`, `IMPORT_*`, `PLACEMENT_INVALID`, `COUNT_INVALID`, `SAP_FORMAT` og de koder, der kun har engelsk tekst). `AUTH_*` kan genbruge Hubbens login-tekster.
    2. `CLAIM_TAKEN`: skriv en engelsk tekst, hvor navnet sendes som et særskilt felt.
    3. Placeringer-koder, hvis detalje nævner en plads eller en person (`LOCATION_FULL`, `LOCATION_INACTIVE`, `LOCATION_NOT_FOUND`, `LOCATION_NOT_EMPTY`, `UNDO_CONFLICT`, `STOCK_TOO_LOW`, `MATERIAL_MISMATCH`), føjes til `EN_WITH_DETAIL`, eller plads og person sendes som særskilte felter.
    4. Tilføj en test, der finder alle koder, der kastes i `electron/warehouse/**/*.cjs` (og `AUTH_*` fra `securedIpc.cjs`), og kræver både dansk og engelsk tekst (shared.md S4).
  - **Risiko ved ændringen:** Ingen, det er tekster og en test.
  - **Hvor:** `src/lib/warehouse/errors.ts:25-162`, `:173-181`, `:182-337`; kastestederne står i shared.md I6

- [x] **5.9 Synkrone filkald på M: i hovedprocessen fryser hele appen, når drevet er langsomt (shared.md I7)**
  - **Hvad sker der i dag:** Første kald pr. mappe opretter mappen på M: på en måde, der blokerer hele appen. Fejler det, huskes intet, så hvert senere kald prøver igen, for en almindelig bruger også SAP-indikatorens tjek hvert 5. sekund. Hænger M: lige efter start, fryser Hub-vinduet ved hvert tjek i Optælling, Placeringer og Softwareload, i alle åbne vinduer.
  - **Hvorfor det betyder noget:** Hele appen fryser, ikke kun lagerværktøjet.
  - **Hvad skal ændres:**
    1. Opret mappen med `await fs.promises.mkdir(dir, { recursive: true })`, før `createStore` kaldes, eller giv `createStore` en asynkron fabrik.
    2. Husk et fejlet forsøg i nogle sekunder, så et drev, der er nede, ikke prøves igen ved hvert tjek.
    3. Brug `fs.promises.access` i `reportFile` og `fs.promises.readdir`/`stat` i `findNewestPlacementSheet`, som gøres asynkron.
  - **Risiko ved ændringen:** Lav, for `openStore` bliver asynkron, og alle, der kalder den, er allerede asynkrone.
  - **Hvor:** `electron/warehouse/register.cjs:93-104`, `:133`, `:194`, `:229-234`; `electron/store.cjs:191`; `electron/warehouse/core/placements.cjs:19-25`

- [x] **5.10 Værktøjssiden læser alle optællingers filer på M: for at vise én linje (shared.md I8)**
  - **Hvad sker der i dag:** Når "Arbejdsværktøjer" åbnes, læses oversigt og deltagere for hver optælling, teamet nogensinde har lavet, kun for at skrive "Igangværende: <status> · NN %" på Optællings flise. Med 4 statusser og omkring 15 optællinger hver er det omkring 120 krypterede filer, før Stempelkorts egne læsninger kommer til.
  - **Hvorfor det betyder noget:** Den side, alle åbner hver morgen for at stemple ind, betaler for en pyntelinje, og listen vokser hvert kvartal.
  - **Hvad skal ændres:** Tilføj `statuses:active-progress`, der kun læser den aktive status (`repo.getActiveStatus(team)`) og oversigterne for dens optællinger (`statusCounts(team, id)`), eller gem fremskridtet på status-posten, når en oversigt skrives. Kald den fra `WarehouseHome`.
  - **Risiko ved ændringen:** Lav, det er et nyt kald, der kun læser.
  - **Hvor:** `src/views/warehouse/WarehouseHome.tsx:86-92`; `electron/warehouse/countService.cjs:76-91` og `:100-111`

---

## Fase 6: Mindre rettelser

Én linje pr. fund. Detaljer og "Hvor" står i rapporten.

**Optælling**

- [ ] Sletning af en tællelinje springer de lås- og godkendelsestjek over, som redigering har. (count.md M1)
- [ ] Scanninger kræver ingen placering, og sidste placering huskes til næste dag; vis stedet, spørg når det er tomt, og glem det efter fx 8 timer. (count.md M2)
- [ ] Import af serienumre på et godkendt eller låst materiale giver ingen advarsel, selvom scanning gør. (count.md M3)
- [ ] "Dine seneste importer" viser fortrudte importer og mister importer efter 20 hændelser. (count.md M4)
- [ ] En scanning i kø, der fejler, viser fejlen uden serienummeret. (count.md M5)
- [ ] "Godkend alle uden difference" har ingen bekræftelse, og antallet i beskeden er gættet på skærmen. (count.md M6)
- [ ] Forældet tekst om, at markeringen kun er en note, og at Optælling intet bogfører; Optælling bogfører nu via MI20. (count.md M7)
- [ ] Død kode koster stadig trafik på M:, især backuppen `expected-prev` ved hver "Hent SAP igen". (count.md M8)
- [ ] Hver opdatering lister hele teammappen og læser journalfilerne én ad gangen. (count.md M9)
- [ ] Åbnede optællinger bliver aldrig fjernet fra hukommelsen, og tjeklisten åbner hver optælling helt. (count.md M10)
- [ ] En halvt skrevet "Hent SAP igen" får alle PC'er til at læse hele SAP-billedet igen hvert 30. sekund for altid. (count.md M11)
- [ ] Reglen "godkendt eller bogført" og grænsen på 20 linjer findes flere steder. (count.md M12)
- [ ] Låsning af en status sker ikke samlet med de rapporter, den skriver. (count.md M13)
- [ ] "Læg antal på" afviser serienumre med `- . / _`, som optællingen selv godtager (usikkert om de findes). (count.md M14)
- [ ] Start status: forskellige årsgrænser på skærm og i backend, og samme kvartal kan startes to gange. (count.md M15)
- [ ] Serienummerlisten bruger kun serienummeret som nøgle, så to materialer med samme nummer overskriver hinanden (usikkert). (count.md M16)
- [ ] Områdekrav læses og skrives uden lås, så to PC'er begge kan "vinde" et område. (count.md M17)
- [ ] En antalslinjes lagersted vælges aldrig af brugeren i optællinger med flere lagersteder (usikkert hvor mange materialer). (count.md M18)

**Placeringer**

- [ ] Sæt palle på plads bruger "i dag" i UTC, så datoen lige efter midnat er gårsdagens. (locations.md M1)
- [ ] Backend mangler kontrol: flyt til egen plads, hyldeflyt til samme hylde, sloc-skift uden ændring, "Ret antal" på deaktiveret hylde, og faste pladser ignoreres. (locations.md M3)
- [ ] Loggens filter mangler hyldehandlingerne. (locations.md M4)
- [ ] Vildledende logtekster, fx "Fra før loggen kunne fortryde", "Flyttet A2.4 → A2.4" og klokkeslæt uden dato. (locations.md M5)
- [ ] Søgningen finder ikke materialer, der kun ligger på lagerhylder og mangler SAP-tekst. (locations.md M7)
- [ ] Hver daglig handling læser ubrugte filer fra M: uden om cachen, før der låses. (locations.md M8)
- [ ] Unødige læsninger: forsiden læser oversigten to gange, og Sæt palle på plads læser 3 måneders historik for at få en beskrivelse. (locations.md M10)
- [ ] Når en plads gøres til pluk-plads, bruges alle paller på den op, ikke kun dem admin fik vist. (locations.md M11)
- [ ] Arkimporten godtager decimaler, nul og negative antal. (locations.md M12)
- [ ] Paller uden antal på lagerhylder er usynlige på reolkortet og ved hyldescanning i Flyt. (locations.md M13)
- [ ] Et 49/50-opslag giver måske kun linjer med serienumre, så tilbehør på samme levering mangler (usikkert). (locations.md M14)

**Stempelkort og Softwareload**

- [ ] En KIF-opgave med mål D005 skriver "Flyttet til målet" for terminaler, der allerede stod på D005, uden at de blev flyttet. (timeclock-softwareload.md M1)
- [ ] "Opgiv" skriver terminaler med en uafklaret SAP-markering som ikke flyttet, og søgningen mister advarslen. (timeclock-softwareload.md M2)
- [ ] Annullér og andre kommandoer sender ikke opgavens id, så en gammel skærm kan annullere den næste opgave. (timeclock-softwareload.md M3)
- [ ] Fremskridtet fra en KIF-flytning og en afslutning blandes på skærmen. (timeclock-softwareload.md M4)
- [ ] Stempelkort "Det passer, stop nu" gemmes som "sluttid valgt", og dialogen foreslår en sluttid, som tjenesten afviser. (timeclock-softwareload.md M5)
- [ ] Et "Fejlet"-mærke sat efter forhåndsvisningen ændrer flytningen i SAP, uden at brugeren ser det. (timeclock-softwareload.md M6)
- [ ] En opgave, der venter på SAP, mangler i statistik og søgning, til den er færdig. (timeclock-softwareload.md M7)
- [ ] Forvirrende Softwareload-tekster: Fejlet-dialogen, "endnu", e-mail i stedet for navn, og en søgelinje uden mål for terminaler, der allerede stod på målet. (timeclock-softwareload.md M8)
- [ ] Knappen "Ny opgave" i Stempelkort åbner en dialog, der siger "Rolle", og fejlteksten er ikke oversat. (timeclock-softwareload.md M9)
- [ ] Sletning af en Stempelkort-registrering efterlader intet spor, modsat Softwareload. (timeclock-softwareload.md M10)
- [ ] Designdokumentet siger stadig, at medarbejdere ser deres egne Softwareload-opgaver. (timeclock-softwareload.md M12)
- [ ] Hver scanning udløser en fuld statuslæsning af alle ventende opgaver på M: (usikkert hvor meget det koster). (timeclock-softwareload.md M13)
- [ ] Et SAP-script, der løber tør for tid, efterlader sin egen SAP-session åben (usikkert). (timeclock-softwareload.md M14)

**Det fælles**

- [ ] Logningen af langsomme kald har en forkert kanalliste og en misvisende "heraf bruger"-tid. (shared.md M2)
- [ ] Listen over teamets brugere regner `isManager: true` som manager, selvom rollen siger bruger (usikkert hvor ofte). (shared.md M5)
- [ ] Status managere kan ændre admin-roller, selvom skærm og guide siger kun managere, og nye brugere må vente 30 s. (shared.md M6)
- [ ] "Vis i SAP": uventet svar bliver til "uventet fejl", og det engelske hint er forkert ved manglende adgang. (shared.md M7)
- [ ] Skærme, der kun læser (materialekort, Hubert-spørgsmål), starter MM60-kørsler i baggrunden, der optager SAP-køen. (shared.md M9)
- [ ] Hubert-guiden siger ting, programmet ikke gør: at SAP kun læses ved oprettelse, at managere har alle rettigheder, og at alle kan lave mailen. (shared.md M10)
- [ ] Hjælpefunktioner er kopieret flere steder, bl.a. SAP-klar-tjekket på seks steder. (shared.md M12)
- [ ] Kommentarer modsiger koden om sikkerhedsregler. (shared.md M13)
- [ ] Miljøvariabler for SAP-system og placeringer virker også i den installerede app, klienten er hårdkodet, og den gamle konfigurationsfil ignoreres. (shared.md M14)
- [ ] SAP-scripts afviser midlertidige mapper med æ, ø, å eller parenteser i stien (usikkert). (shared.md M15)

**Lagt sammen fra to rapporter**

- [ ] En status manager vises som "Manager" og ser admin-knapper i Placeringer, til rollerne svarer, og skærmen opdager ikke, hvis rollen fjernes. (shared.md M3, locations.md M15)
- [ ] Fire forskellige regler for "manager", og manager-reglen og andre hjælpere er kopieret mellem Stempelkort og Softwareload; saml dem ét sted. (shared.md M4, timeclock-softwareload.md M11)
- [ ] Død kode, bl.a. `singleFlight.ts`, `refillSuggestion`, ubrugte fejltekster og `sharedStore.updateAsync`. (shared.md M11, locations.md M2)
- [ ] Materialetekster kan gå tabt, når to PC'er lærer nye samtidig, og hele filen læses igen ved hvert opslag; brug låst skrivning, som kræver 1.1. (shared.md M8, locations.md M9)

---

## Fase 7: Forslag til tilføjelser

**Optælling**

- [ ] **7.1 "Tjek i SAP" på hvert SAP-dokument (count.md S1).** Én knap, der kun læser MI22 og sætter dokumentets status ud fra SAP. Managere kan rette de fastlåste tilstande fra 2.2, 2.4 og 2.5 uden at åbne SAP.
- [ ] **7.2 Vis hvor et "manglende" serienummer blev fundet i statussen (count.md S2).** "Fundet i 'D000 terminaler' på Palle 14.2 af Anna" i Mangler-listerne og ved godkendelse. Godkendere flytter varen i stedet for at afskrive den (bygger på 2.6).
- [ ] **7.3 Markér talte materialer, hvis SAP-antal ændrede sig ved "Hent SAP igen" (count.md S3).** Rækken mærkes "Allerede talt, tæl igen", og efter at de nye tal er taget i brug, kan materialet sendes tilbage til optælling. Det undgår en falsk minusdifference efter en varemodtagelse.
- [ ] **7.4 Deltagernes synkronisering i "Deltagere" (count.md S4).** "Sidst sendt 10:42" eller "Offline med ventende scanninger" pr. deltager og i bekræftelsen ved "Afslut". Ejeren kan se, om der mangler scanninger, før optællingen lukkes (hører sammen med 2.11).

**Placeringer**

- [ ] **7.5 "Gør igen" på en handling i kø, der fejlede (locations.md A1).** Beskeden får en knap, der åbner skærmen udfyldt med den oprindelige anmodning. Serienumre, datoer og noter skal ikke tastes igen.
- [ ] **7.6 Vis hvad der venter på M: (locations.md A2).** Banneret "3 handlinger venter på M:" kan åbnes som en lille liste ("Tag R162-0717 fra A2.4, 10:41"). Folk ved, hvad der ikke er registreret endnu, og gør det ikke to gange fra en anden PC.
- [ ] **7.7 "Allerede registreret" ved scanning af et 49/50-nummer (locations.md A3).** Viser paller og hyldelinjer, der allerede har nummeret ("A2.4 · 24 stk. · Bo i går"), før der gemmes. Forhindrer dobbelte paller (hører sammen med 3.3).
- [ ] **7.8 "Tæl pallen" for paller med ukendt antal (locations.md A4).** Én knap med ét felt på de rækker, der i dag viser "antal ukendt". Gør delvise tag og lagertotalen meningsfulde (hører sammen med 1.3 og 1.10).

**Stempelkort og Softwareload**

- [ ] **7.9 Managere kan rette tiderne på en Softwareload-opgave (timeclock-softwareload.md S1).** "Ret" i Statistik med samme regler som i Stempelkort, og med log over hvem der rettede. Sammen med 4.4 fjerner det den eneste grund til at slette rigtig historik.
- [ ] **7.10 Vis Softwareload i Stempelkorts manageroversigt (timeclock-softwareload.md S2).** Færdige og kørende Softwareload-opgaver vises som rækker, der ikke kan redigeres. Managere får ét samlet svar på, hvad folk har brugt dagen på.
- [ ] **7.11 Tilbyd at starte Stempelkort igen efter Softwareload (timeclock-softwareload.md S3).** Knappen "Start Stempelkort igen på X" på resultatskærmen og efter Annullér. Fjerner en almindelig kilde til tabt tid uden at ændre nogen regel.
- [ ] **7.12 "Venter på SAP": vis hvorfor og hvad der mangler (timeclock-softwareload.md S4).** Kortet viser den sidste fejl fra SAP og antal flyttede, ventende og usikre terminaler, med en liste pr. serienummer. Managere ved, om "Opgiv" er rigtigt, og ejere trykker ikke "Fortsæt" igen og igen mod samme afvisning.
- [ ] **7.13 "Mine opgaver": medarbejderens egne opgaver de sidste 7 dage (timeclock-softwareload.md S5).** En liste, der kun læser, med resultatet pr. opgave og problemterminalerne fremhævet, men uden tempo eller andres tal. Medarbejderen kan selv rette de terminaler, SAP afviste; kræver Jacobs bekræftelse, fordi det berører reglen om synlighed.

**Det fælles**

- [ ] **7.14 Ét svar om brugerens rigtige rettigheder (shared.md S1).** Appen henter den rigtige rolle (manager, status manager, admin, placeringsadmin) og opdaterer den, når vinduet får fokus. Hvert værktøj kan skjule knapper, personen ikke må bruge (løser også den sammenlagte linje om status manager i Fase 6).
- [ ] **7.15 Sig hvad der blev kopieret (shared.md S2).** Beskeden viser værdien, fx "Kopieret: 42, R162-0717 · D004", og for serienumre antal, første og sidste nummer. Brugeren kan sammenligne med SAP-skærmen, før der sættes ind (efter 5.1).
- [ ] **7.16 Vis hvilket SAP der skrives i, før en skrivning (shared.md S3).** Bekræftelsen ved "Afslut og flyt i SAP", "Flyt til D005", "Opret SAP-dokument" og "Bogfør" viser "PS4/100 som <SAP-bruger>" og afviser, når SAP ikke er klar. Brugeren ser, at det er produktion, før der trykkes (hører sammen med 5.3).
- [ ] **7.17 Let læsning af fremskridt til værktøjssiden (shared.md S5).** Samme kald som i 5.10, og Optællings flise kan også vise "Tjek SAP-fejl sidst kørt <dato>". Siden åbner hurtigere, og man bliver mindet om SAP-tjekket.
- [ ] **7.18 En kontakt, der slår SAP-skrivning fra (shared.md S6).** `warehouse.sapWrites: false` i konfigurationsfilen stopper PI-dokumenter og Softwareload i at ændre SAP. Skrivning til PS4 kan stoppes på en installation uden en ny udgivelse (hører sammen med 5.2).

---

## Anbefalet rækkefølge

Start med 1.1, fordi fejlen allerede er i den udgivne 1.6.7, en hel fane er i stykker, og rettelsen er lille med en test, så den bør ud som en hurtig rettelse. Tag derefter de punkter, der kan give forkerte ændringer i PS4: 1.2 og 1.3 er bekræftet i koden og har lav risiko, og 1.4, 1.5 og 1.6 sammen med 4.1 og 5.1 forhindrer forkerte bogføringer og flytninger. Så kommer datatab i Placeringer, hvor 1.7, 1.8 og 1.9 hænger sammen med køen og udfald på M: og bør laves samlet, med 1.8 og det faste palle-id fra 1.9 først, fordi de er billige og sikre. Fase 2 til 5 tages efter samme princip: først det, der rører SAP (2.1 til 2.5 og 5.2 til 5.4), så datatab (2.7, 2.8 og 3.1 til 3.4), og derefter resten. De mindre rettelser og forslagene kan lægges ind løbende, når der alligevel arbejdes i de samme filer.
