# Optælling: blocked for TRR, eksport, fælles import af materialedokument og 24-cifrede serienumre (design)

Dato: 2026-11-27. Version: 1.6.9. Ønsket af TRR (møde 27.11) og gælder også for TCD.

## Hvorfor

TRR har mange blocked terminaler og vil tælle dem i Optælling, ligesom TCD kan. De vil kunne trække serienumre ud til Excel og slå op i SAP selv. De vil kunne scanne et materialedokument ind ét sted og få serienumrene i den rigtige optælling. Og deres scannere læser 24-cifrede serienumre, som SAP ikke kender (SAP bruger de sidste 18), og som de ikke kan programmere om.

## Mål

1. **Blocked for TRR.** TRR kan oprette en optælling på blocked lager.
2. **Eksport.** Et nyt menupunkt "Eksport" i en optælling, ved siden af "Import". Man vælger ét materiale og får et nyt Excel-ark med to faner: "Fundet" og "Mangler".
3. **Fælles import af materialedokument.** En knap "Importér materialedokument" i optællingsoversigten. Serienumrene på dokumentet lægges i den ene åbne optælling, der tæller dem. Ligger de på forskellige storage locations, eller er nogle blocked og andre unblocked, kommer der en fejl, og intet importeres. Fejlen kan eksporteres til Excel med serienummer og storage location.
4. **24 cifre.** Et serienummer på præcis 24 cifre, der kommer ind fra en scanner eller indsat tekst, kortes til de sidste 18 cifre.

Alt gælder for både TCD og TRR.

## Ikke mål

- Importen inde i den enkelte optælling (fanen "Import") ændres ikke, bortset fra 24-cifre-reglen.
- Et materialedokument fordeles aldrig over flere optællinger.
- Ingen nye SAP-kørsler ud over den, der henter materialedokumentet i dag.
- Ingen eksport af flere materialer ad gangen.
- TCD's lange serienumre til optællingsdokumentet i SAP (serienummerregler, `ZMS_LONG_SERNO`) ændres ikke.

## Anti mål

- En 24-cifret værdi må aldrig blive kortet, når appen selv har brug for det lange nummer (TCD's lange serienumre til SAP-dokumentet).
- Et materialedokument må aldrig importeres halvt. Det er alt eller intet.
- Eksporten må ikke ændre noget i optællingen.

## Begrænsninger

- Optællingens data ligger på M: og læses af 1.6.8 og 1.6.9 side om side. Intet nyt dataformat. Eksport og fejlark er nye filer i den eksisterende rapportmappe (`reportsDir(team)`), og importen skriver den eksisterende `import`-hændelse.
- SAP: materialedokumentet hentes med `fetcher.fetchMatdoc` som i dag (ZMS_REP for TCD, ZMS_PREP for TRR). Kun QS4 ved test.
- Tekster på dansk og engelsk med `t(da, en)` som resten af Optælling.

## Approaches

**Fælles import: hvor ved appen, hvilken storage location et serienummer ligger på?**

- **A. Ud fra de åbne optællingers egne SAP-tal (valgt).** Hver åben optælling har hele D301's serienumre fra SAP med storage location og blocked/unblocked (`state.index.serials`). Det er hurtigt og kræver ingen ekstra SAP-kørsel. Det svarer også præcis til det, optællingen selv sammenligner med. Prisen er, at en palle, der er flyttet i SAP efter optællingen blev startet, ses på den gamle placering. Det gør optællingen dog også.
- B. Frisk opslag i SAP af hvert serienummer. Fravalgt: endnu en SAP-kørsel pr. import, og svaret kan være uenigt med optællingens egne tal.

**24 cifre: hvor skal reglen ligge?** Der er kun én fornuftig vej. Den skal ligge der, hvor serienumre kommer ind fra en person (scanning og indsat tekst), ikke i den fælles `normalizeSerial`. Ellers kortes TCD's lange numre til SAP-dokumentet også.

## Det, der er besluttet

### 1. Blocked for TRR

- I dag tillader `newCountScope` (`electron/warehouse/countService.cjs`) kun blocked, når scopet er præcis D000, og `NewCount.tsx` viser kun valget "Blocked", hvis teamet har D000. TRR har D001, D002 og D003 og ingen D000.
- Ny regel: for TCD gælder D000-reglen som i dag. For TRR kan blocked tælles på alle tre storage locations, enkeltvis eller sammen.
- "Tilbehør kun i D000" ændres ikke (TRR tæller kun brugte terminaler).
- Alt andet, der allerede virker for blocked (optagne storage locations, "tælles i en anden optælling", rapport, SAP-dokument med lagertype blocked), bruges som det er.

### 2. Eksport

- Nyt menupunkt "Eksport" i optællingens faner, lige efter "Import". Det kan ses af alle, der kan se optællingen (det ændrer ingenting). Mit valg.
- Man vælger ét materiale med serienumre fra en liste over optællingens materialer (materiale og beskrivelse). Materialer uden serienumre er ikke med.
- Knappen "Eksportér til Excel" laver en ny .xlsx-fil i teamets rapportmappe og åbner den, på samme måde som "Excel-rapport" (`counts:report` og `counts:open-report` i `register.cjs`).
- Faner og kolonner. Serienummeret står altid i kolonne A, så kolonnen kan kopieres direkte ind i SAP.
  - **Fundet:** serienummer, materiale, storage location (SAP), lagertype (unblocked/blocked), fundet sted, fundet af, tidspunkt, kilde (scan, import, matdok). Kun serienumre fra optællingens eget scope.
  - **Mangler:** serienummer, materiale, storage location (SAP), lagertype. SAP's serienumre på materialet inden for optællingens scope, som ingen har fundet (samme opgørelse som "mangler" i Oversigt).
- Filnavn: `<optællingens navn> <materiale> serienumre <dato>.xlsx`, med de tegn, Windows ikke tillader, fjernet.

### 3. Fælles import af materialedokument

- Knappen "Importér materialedokument" står i optællingsoversigten (`Counts.tsx`) ved siden af "Ny optælling". Den vises for alle i teamet.
- Dialogen spørger efter dokumentnummer og sted (fx pallens navn). Stedet er påkrævet ligesom ved import i dag, og hele dokumentet lægges på det sted.
- "Slå op" henter dokumentet i SAP (`fetcher.fetchMatdoc`, samme ventetid og fejl som i dag). Derefter slår appen hvert serienummer op i hver åben optælling i teamet:
  - Hvilke optællinger: alle åbne optællinger i teamet, både i den aktive status og ældre uden status. Mit valg.
  - Et serienummer hører til en optælling, når optællingen selv ville kalde det "fundet" ved en scanning, altså inden for hele dens scope: storage location, lagertype, terminaler eller tilbehør, materialer og udelukkede materialer (`matchSerial` giver `found` eller `duplicate`). Mit valg.
  - Storage location og lagertype, der vises, tages fra den optælling, serienummeret hører til. Hører det ikke til nogen, tages de fra den nyeste af optællingernes SAP-tal (approach A).
  - Et serienummer, som ingen åben optælling kender i sine SAP-tal, tæller ikke med i afgørelsen og vises som "ukendt i SAP-tallene". Mit valg.
- Udfald:
  - **Ok:** alle kendte serienumre har samme storage location og samme lagertype, og alle hører til den samme ene åbne optælling. Dialogen viser optællingens navn, storage location, lagertype og samme tal som import i dag (kendte, allerede talt, ukendte). Er dokumentet allerede importeret i den optælling, vises det som i dag. Er det importeret i en anden optælling, vises det som en advarsel med navn, hvem og hvornår, men importen er tilladt (den gamle import var så i den forkerte optælling). Mit valg. Knappen "Importér" skriver én `import`-hændelse med `document` i den optælling. Det er den samme hændelse som i dag, så den kan fortrydes derinde.
  - **Fejl, blandet:** serienumrene har mere end én storage location, eller både blocked og unblocked. Dialogen viser fordelingen (fx "D001 unblocked: 40, D002 unblocked: 3, D001 blocked: 2"), og intet kan importeres. Knappen "Eksportér til Excel" laver et ark med serienummer, materiale, storage location og lagertype, sorteret efter storage location og lagertype, og åbner det.
  - **Fejl, flere optællinger:** samme storage location og lagertype, men serienumrene hører til mere end én optælling, fx terminaler og tilbehør på samme palle i D000, hvor TCD tæller dem i hver sin optælling. Fejlen viser fordelingen pr. optælling og har samme eksportknap. Mit valg, fordi et dokument aldrig må fordeles.
  - **Fejl, uden for optællingerne:** nogle kendte serienumre hører ikke til nogen åben optælling (fx et udelukket materiale), mens resten gør. Fejlen viser dem og har samme eksportknap. Mit valg, fordi importen er alt eller intet.
  - **Fejl, ingen optælling:** ingen åben optælling tæller nogen af serienumrene. Fejlen siger storage location og lagertype.
  - **Fejl, ikke med:** brugeren er ikke med i den optælling, der tæller den. Fejlen siger hvilken og henviser til "anmod om at være med". Managere og optællingsadmins er med i alle.
  - **Fejl, alle ukendte:** ingen af serienumrene findes i de åbne optællingers SAP-tal.
- Afgørelsen laves igen, når man trykker "Importér", så et skifte mellem opslag og import ikke giver en forkert import.

### 4. 24-cifrede serienumre

- En ny lille funktion kortes kun en værdi, der efter at mellemrum er fjernet er præcis 24 cifre (`^\d{24}$`), til de sidste 18 cifre. Alt andet går uændret videre til den normale kontrol.
- Bruges, hvor serienumre kommer ind fra en person:
  - Optælling: scanning (`scan`) og indsatte serienumre under Import (`importSerials` med tekst).
  - Softwareload: scanning af terminaler og indtastede serienumre, også i "Flyt ind i KIF" og "Søg serienummer".
- Bruges ikke på serienumre fra SAP, og ikke på TCD's lange serienumre (`ZMS_LONG_SERNO`, `copySerials`).
- Scanningen viser det korte nummer, så man kan se, hvad der blev gemt.

### "Hvad er nyt"

- Én linje pr. punkt i 1.6.9-posten i `src/lib/changelog.ts`.

## Overladt til den, der bygger

- Om fælles import får en egen IPC-kanal eller udvider de eksisterende `counts:*`-kanaler.
- Hvordan de åbne optællinger indlæses til opslaget, så længe det ikke indlæser hver optælling fra M: flere gange pr. opslag.
- Layout af dialogen og eksportfanen, så længe det ligner resten af Optælling.
- Præcis tekst i fejlbeskederne, så længe de siger, hvad der er galt, og hvad man kan gøre.
