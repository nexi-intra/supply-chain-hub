# Softwareload: design

Status: udkast til godkendelse (19.11.2026). Bygges i 1.6.8 efter godkendelse og plan.

## Hvorfor

TRR og TCD softwareloader og keyloader terminaler hver dag. I dag registreres det ikke samlet, og flytningerne i SAP gøres i hånden i cockpittet. Jacob vil have:

- et sted hvor hver opgave har start, pauser og slut, så tiden kan måles pr. medarbejder
- et svar på "hvem loadede serienummer X, med hvilken software, og hvornår"
- at appen selv flytter terminalerne til den rigtige storage location i SAP, med KIF-reglen overholdt, så SAP-historikken viser hvor terminalen har været

## Mål

1. Nyt værktøj "Softwareload" i Arbejdsværktøjer, kun for TRR og TCD.
2. En opgave tilhører altid én person. Den startes, kan pauses og genoptages, og afsluttes.
3. Ved start vælges type, KIF eller ej, mål-storage location og softwareversion.
4. Serienumre scannes ind i opgaven. Terminaler der fejler trækkes ud med en note.
5. Når opgaven afsluttes, flytter appen terminalerne i SAP og gemmer materialedokumenterne pr. serienummer.
6. Funktionen "Flyt ind i KIF (D005)" flytter terminaler til D005 før de skal loades.
7. Statistik med tider og en søgning på serienummer.

## Ikke-mål

- Ingen deling af en opgave mellem flere personer (det er bevidst forskelligt fra Stempelkort).
- Ingen softwareload-del i Stempelkort. Stempelkort-designet skal ryddes for den.
- Ingen styring af selve load-udstyret. Appen registrerer kun.
- Ingen ændring af brugerstatus (ONHA, TBDL ...) i SAP.

## Anti-mål (ting der gør det til en fiasko, selv hvis det virker)

- En terminal flyttes i SAP uden at have været på D005, når opgaven er "I KIF".
- En terminal flyttes to gange, fordi en afbrudt afslutning startes igen.
- Det er uklart hvem der har lavet hvilke terminaler.
- Scanneren venter på SAP eller på det fælles drev.
- Appen ændrer noget i PS4, før flowet er verificeret i QS4.

## Det Jacob har besluttet

| Emne | Beslutning |
|---|---|
| Hvem | Kun TRR og TCD |
| Ejerskab | Én persons opgave, ingen join |
| Typer | "Softwareload + keyload", "Softwareload", "Keyload" |
| KIF | Vælges pr. opgave: I KIF eller uden for KIF |
| KIF-regel | I KIF skal terminalen stå på D005, før den flyttes til målet. Står den et andet sted, flyttes den først til D005 og derefter til målet |
| Uden for KIF | Terminalen flyttes direkte fra hvor den står til målet |
| Flyt ind i KIF | Egen funktion til at flytte terminaler til D005 på forhånd, med serienumre eller materialedokument, ligesom i Optælling |
| Software | Fritekst softwareversion |
| Hvornår flyttes | Samlet, når opgaven afsluttes |
| Fejlede terminaler | Trækkes ud med note pr. serienummer. Nye (materiale slutter på -0) flyttes til D000 og sættes i blocked stock (MIGO 344, guiden "Blocked Stock Guide ud og ind"). Brugte (slutter på -R) flyttes til D002 |
| Blocked stock | Findes kun på D000 |
| Statistik | Tider pr. opgave og person, og søgning på serienummer: hvem, hvornår, hvilken software |
| SAP-metode | Tilgang B (se nedenfor) |
| KIF-rækkevidde | I KIF går alle terminaler via D005, også fejlede og dem der allerede står på målet |
| Søgning | På tværs af TRR og TCD |

## Tilgange (overvejet)

- **A. Én terminal ad gangen i cockpittet.** Mest robust pr. terminal, men langsom: flere sekunder pr. flytning, 10 til 15 minutter for 100 terminaler i KIF.
- **B. Grupper i cockpittet, med A som reserve. Valgt.** Terminaler med samme fra-lokation og mål flyttes i én Transfer. Fejler gruppen, deles den op, så den skyldige findes. Hurtig, og fejl kan stadig spores til ét serienummer.
- **C. Alt via MIGO.** Ét dokument, men MIGO er tungere at styre, én fejl stopper alt, og teamet bruger cockpittet til flytninger.

Jacob valgte B.

## Verificeret i QS4 (19.11.2026)

Alle test er rullet tilbage. Testterminalerne står, hvor de stod.

- **Cockpit Transfer (ZMS_PREP og ZMS_REP er ens).**
  - Serial-søgning, marker rækker, `tbar[1]/btn[36]` Transfer, popup "Target Storage Location" (SAPLSPO4 0300) med feltet `SVALD-VALUE[0,21]`, Enter.
  - Svar ved succes: Information-popup med "Transfer Movement <nr> successfully created."
- **Flere rækker i én Transfer** giver ét materialedokument for dem alle.
- **Serienumre på tværs af materialer** kan sættes ind via Multiple Selection og "upload fra udklipsholder", samme mønster som `pidoc-*.vbs`/`longserno.vbs`.
- **Alt eller intet.**
  - Fejler én række, flyttes ingen.
  - Fejl vises i et log-grid (TYPE=E). Beskeden nævner materiale, plant og location, men ikke serienummer. Eksempel: M7 021 "Deficit of SL Unrestricted-use 1 EA : <materiale> D301 D000".
- **Står allerede på målet:** SAP giver ingen fejl og laver alligevel en bevægelse. Appen skal selv springe dem over.
- **Blocked stock kan ikke flyttes med Transfer.**
  - Det giver M7 021.
  - `STOCK_TYPE_ICON` = `@06@` betyder blocked i cockpittet.
- **MIGO 344 og 343 med ét serienummer:**
  - Transfer Posting > Other, `GODEFAULT_TV-BWART`.
  - Felterne `GODYNPRO-MAKTX` (materiale), `NAME1` (plant), `LGOBE` (location) og `ERFMG` (antal).
  - Fanen Serial Numbers med `GOSERIAL-SERIALNO[0,n]`.
  - Check giver en info-popup "maximum amount of serial numbers is reached" (Continue) og derefter "Document is O.K.".
  - Post giver "Material document <nr> posted".

- Begge cockpits finder både nye (-0) og brugte (-R) terminaler i hele plant D301, på tværs af locations (testet med INT4100-7883-0 og INT4100-7922-0-R). Ét opslag og ét cockpit pr. team er nok.

Detaljerede skærm-id'er står i sessionens noter og skal over i scriptene.

## Hvordan det virker

### Opgavens livsløb

1. **Start.** Medarbejderen vælger type, I KIF eller ej, mål-storage location og softwareversion. Tiden starter. Kører der en Stempelkort-opgave, stoppes den, så tid ikke tælles dobbelt. *(Mine beslutninger:)*
   - Stempelkort-opgaven gemmes som en almindelig registrering med sluttid lig softwareload-starten.
   - Er Stempelkort-opgaven fælles (holddesignet), stoppes kun personens egen tid, aldrig holdets.
   - Startes en Stempelkort-opgave, mens en softwareload-opgave kører, sættes softwareload-opgaven på pause.
   - Det samme gælder, når en af dem genoptages efter en pause: genoptages softwareload-opgaven, stoppes Stempelkort som ved start, og genoptages Stempelkort, sættes softwareload-opgaven på pause.
   - "Ryddes for den" betyder kun Stempelkort-designdokumentet. Der findes ingen softwareload-kode i Stempelkort.
2. **Scan.** Serienumre scannes ind. Appen fanger dubletter i opgaven med det samme. Der spørges ikke SAP pr. scan.
3. **Træk ud.** Et scannet serienummer kan markeres "Fejlet" med en note om hvad der er galt. Det kan også fortrydes, indtil opgaven afsluttes.
4. **Pause og genoptag** som i Stempelkort.
5. **Afslut.**
   1. Appen slår alle opgavens serienumre op i SAP i ét opslag (cockpittet, serial-søgning med udklipsholder). Den finder materiale, nuværende location og stock type.
   2. Appen viser en oversigt i grupper:
      - til målet (med "via D005" for dem, der ikke står på D005, når opgaven er I KIF)
      - fejlede -0 til D000 og blocked stock (via D005 i KIF)
      - fejlede -R til D002 (via D005 i KIF)
      - ikke fundet i SAP
      - står i blocked stock og kan ikke flyttes
      - står allerede på målet (springes over uden for KIF og går via D005 i KIF)
   3. Medarbejderen bekræfter. Tiden stopper ved bekræftelsen.
   4. Appen udfører flytningerne (se "Flytning i SAP").
   5. Resultatet vises pr. serienummer. Det, der ikke kunne flyttes, står med SAP's besked.

### Flytning i SAP

- Grupperes efter (fra-lokation, mål). Hver gruppe er én Transfer i cockpittet.
- **I KIF går alle terminaler via D005 (Jacobs beslutning):**
  - Det gælder også fejlede terminaler og terminaler, der allerede står på målet.
  - Står terminalen ikke på D005, flyttes den først fra X til D005 og derefter fra D005 til sin destination: målet, D000 med 344, eller D002.
  - En terminal, der allerede står på målet uden at stå på D005, flyttes altså fra målet til D005 og tilbage til målet. Så viser SAP-historikken altid KIF.
- **Uden for KIF:** terminaler, der allerede står på målet, springes over.
- Fejlede -0: til D000 hvis de ikke står der, derefter MIGO 344 på D000.
- Fejlede -R: Transfer til D002.
- Fejler en gruppe, deles den i halve, indtil de skyldige serienumre er fundet. Resten flyttes.
- Efter hver lykket Transfer gemmes materialedokumentet på hvert serienummer i gruppen med det samme, før næste gruppe. Det gør afslutningen genoptagelig: en terminal med et gemt skridt flyttes ikke igen.
- Bliver afslutningen afbrudt (SAP lukket, PC slukket), står opgaven som "Mangler SAP". Appen slår op i SAP igen, før den fortsætter. *(Mine beslutninger:)*
  - Ejeren kan starte en ny opgave, selv om en gammel venter på SAP. Opgaven er allerede afsluttet tidsmæssigt, så det giver ikke dobbelt tid.
  - Opgaver, der venter på SAP, vises for ejeren og for managers. En manager kan fuldføre flytningerne i sin egen SAP. Opgaven tilhører stadig ejeren, og managerens navn gemmes ved de flytninger, han lavede.
  - En manager kan også opgive de resterende flytninger med en begrundelse. Terminalerne står så med status "ikke flyttet" i historikken.
- Cockpit pr. team: TCD bruger ZMS_REP og TRR bruger ZMS_PREP, som i Optælling. Mangler brugeren adgang, prøves det andet cockpit, og ellers vises en klar besked.
- Kun i det SAP-system, brugeren er logget ind i. Nye scripts tilføjes til `WRITE_SCRIPTS` i `sapBridge.cjs`.
- **QS4 før PS4 (Jacobs regel: "test i QS4, og så snart det virker, skal det være i PS4").** Softwareload-scriptene får deres egen liste over tilladte systemer, som i første omgang kun indeholder QS4. Hele flowet testes i QS4 fra ende til anden: KIF i to trin, opdeling af en fejlet gruppe, D000 efterfulgt af 344 og genoptagelse efter afbrydelse. Først når Jacob har godkendt den test, tilføjes PS4. *(Mekanismen er min beslutning.)*

### Flyt ind i KIF (D005)

- Input: scannede serienumre, en indsat liste eller et materialedokument (genbrug af opslaget fra Optælling, `fetchMatdoc`).
- Samme opslag, oversigt, bekræftelse og gruppeflytning som ved afslutning, med D005 som mål.
- Registreres som en hændelse med person, tidspunkt og materialedokumenter, så søgningen på serienummer også viser den.
- Er ikke en tidsmålt opgave.

### Data

- Lager under `<team>\lagerstyring\softwareload` med samme krypterede store og `mutateAsync` som Stempelkort.
- **Aktiv opgave:** én fil pr. person (`aktiv-<hash>`). Scanninger skrives lokalt først og gemmes i baggrunden, så scanneren aldrig venter på M:.
- **Afsluttede opgaver:** pr. person pr. måned (`opgaver-<hash>-<yyyy-mm>`). Hver opgave indeholder:
  - type, KIF, mål, softwareversion
  - start, pauser og slut
  - serienumre med materiale, fra-location, status (flyttet, fejlet, ikke fundet, blocked, sprunget over), note og materialedokumenter
- **Søgeindeks på tværs af teams (Jacobs beslutning: TRR og TCD søger i hinandens data):** `<platform>\_lagerstyring\softwareload\serier-<yyyy-mm>` med en linje pr. serienummer pr. hændelse og teamet på linjen. Det ligger samme sted som det fælles materialekatalog `materialtekster`. Opgaverne bliver i hvert sit team. Indekset rummer kun det, søgningen viser (hvem, hvornår, type, software, KIF, fra og til, materialedokumenter, fejlet og note). Søgningen behøver derfor ikke åbne det andet teams filer.
- **KIF-indflytninger:** `kif-<yyyy-mm>`.
- **Softwareversioner til forslag:** `versioner` (liste over brugte versioner).

### Statistik og søgning

- **Søgning på serienummer:** alle hændelser for det serienummer, nyeste først og på tværs af TRR og TCD. Hver hændelse viser team, hvem, hvornår, type, software, KIF, fra og til, materialedokumenter, samt om terminalen fejlede og noten. Alle i TRR og TCD kan søge.
- **Tider:** pr. opgave start, pauser, slut og antal. Pr. person og type beregnes terminaler i timen. Fejlede vises som et antal for sig og tæller ikke med i tempoet. Der kan filtreres på periode, person, type og softwareversion.
- **Synlighed:** medarbejderen ser sine egne opgaver. Managers ser alles tider. Det er samme regel som i Stempelkort.

### Brugerflade

- Nyt kort "Softwareload" i Arbejdsværktøjer, kun for TRR og TCD, med deep link `tab=softwareload`.
- **Faner:** "Min opgave" (start, scan, træk ud, pause, afslut), "Flyt ind i KIF", "Søg serienummer" og "Statistik".
- SAP-indikatoren vises i værktøjet (`usesSap`).
- Hubert-guiden og coverage-manifestet opdateres på fire sprog. Changelog for 1.6.8.

## Begrænsninger

- Alt SAP-arbejde sker i appens egen SAP-session og aldrig i brugerens åbne vinduer.
- Udklipsholderen bruges til lister. Brugerens indhold lægges tilbage bagefter.
- MIGO husker sidst valgte handling. Scriptet skal selv sætte Transfer Posting > Other og håndtere "Tip"-popuppen.
- Store opgaver skal tåle, at SAP er langsomt. Fremskridt vises undervejs.

## Overladt til den der bygger

- Den præcise halverings- og genforsøgsstrategi ved gruppefejl.
- Layout og tekster i fanerne inden for husets stil.
- Grænser for hvor mange serienumre der sendes til SAP pr. opslag og pr. Transfer (udklipsholder-størrelse, skærmgrænser).
