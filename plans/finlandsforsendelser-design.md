# Finlandsforsendelser og værktøjer pr. team: design

Status: udkast til godkendelse (26.11.2026). Bygges i 1.6.9 efter godkendelse og plan.

## Hvorfor

Kolli fra D301 til F300 (Finland) skal stå i et fælles Excel-ark, "Ordre sendt til Finland fra Danmark", som andre bruger til statistik over leveringstid. I dag sker det med den selvstændige Electron-app "Finland T&T" (`C:\Supply Chain Tools\Finland TT`). Den virker og er afprøvet mod det rigtige ark, men:

- Den ligger kun på Jacobs pc. BPO og TCD skal begge bruge den.
- Listen over kolli, der aldrig blev sendt, og ændringer der ikke er gemt, ligger lokalt og kan ikke ses af kollegaer.
- Den kører sine egne SAP-scripts og kan støde ind i hubbens SAP-jobs.

Samtidig er Arbejdsværktøjer i dag låst til TCD og TRR som helhed. Jacob vil have, at modulet er åbent for alle teams, og at hvert team kun ser de værktøjer, det har adgang til.

## Mål

1. Arbejdsværktøjer er åbent for alle teams. Hvert værktøj har sin egen liste over teams. Et team uden værktøjer ser teksten "Dit team har ingen værktøjer i Arbejdsværktøjer endnu."
2. De fire nuværende værktøjer (Stempelkort, Placeringer, Optælling, Softwareload) beholder præcis den adgang, de har i dag: TCD og TRR.
3. Nyt værktøj "Finlandsforsendelser" for BPO og TCD, med alt det, Finland T&T kan i dag (se "Funktioner der flyttes med").
4. Arbejdsværktøjer får sit eget manager-område. "Roller i Arbejdsværktøjer" flyttes fra Manager Panel herind og vises pr. værktøj, kun for værktøjer teamet har.
5. BPO og TCD deler logik og data i Finlandsforsendelser: én "Ikke sendt"-liste, én skrivelås, én indstilling for arket.

## Ikke-mål

- Ingen ændring af, hvad de fire nuværende værktøjer kan, eller hvem der kan bruge dem.
- Ingen Graph- eller SharePoint-API. Arket åbnes i Excel på pc'en, som i dag.
- Ingen automatisk opslag af leveringsdato hos PostNord, DHL eller DSV. Man aflæser selv siden, som i dag.
- Hubert (assistenten) lærer ikke Finlandsforsendelser i denne omgang.
- Ingen automatisk flytning af data fra den selvstændige app (se "Overgang").

## Anti-mål (ting der gør det til en fiasko, selv hvis det virker)

- Der bliver skrevet noget forkert i arket, eller en række, der ikke skulle, bliver slettet. Arket er et arbejdsredskab for andre, og det er det vigtigste i hele designet.
- Et kolli markeret "Ikke sendt" bliver alligevel skrevet, fx fordi den fælles liste ikke kunne læses.
- To personer skriver samme dag samtidig og laver dobbelte rækker.
- Et team kan bruge et værktøj, det ikke ser, ved at kalde backend direkte.
- De fire nuværende værktøjer ændrer adgang ved et uheld, fx at BPO pludselig kan se Optælling.
- En kollega sender en andens halvfærdige opfølgning til arket.

## Det Jacob har besluttet

| Emne | Beslutning |
|---|---|
| Navn | Finlandsforsendelser |
| Hvem | BPO og TCD |
| Modulet | Åbent for alle teams. Hvert team ser kun sine værktøjer. Uden værktøjer vises en tekst om, at der ingen er endnu |
| Nuværende værktøjer | Kun TCD og TRR, som i dag |
| Fælles logik | BPO og TCD arbejder i samme ark. Sammenligning, regler og "Ikke sendt"-listen er fælles |
| Ikke gemte opfølgninger | Personlige. Kun ejeren kan sende dem til arket. Kollegaer kan se, at nogen er i gang, fx "Jacob har 5 kolli, der ikke er gemt, på 19. november" |
| Samme kolli | En kollega må godt følge op på et kolli, som en anden har en ikke gemt ændring på. Kollegaen ser en advarsel med navnet. Gemmer begge, fanger konfliktkontrollen den sidste |
| Gamle kladder | En manager kan se og slette andres ikke gemte ændringer under Administration. Det sletter kun i appen, aldrig i arket |
| Skrivelås | Mens én skriver i arket, venter de andres skriveknapper med en tekst om, hvem der skriver |
| Slet række i arket | Kun managere og Finlandsforsendelser-admin |
| Roller | Hvert værktøj kan have sine egne admin-roller. De styres i et manager-område inde i Arbejdsværktøjer, ligesom Manager Panel på forsiden |
| Roller i Manager Panel | Kortet "Roller i Arbejdsværktøjer" flyttes ind i modulet |
| Vej | Bygges helt ind i hubben (backend, hubbens SAP-kø, fælles mappe, hubbens rollesystem, hubbens komponenter) |

## Tilgange

1. **Bygges helt ind i hubben (valgt).** Logik og tests flyttes til `electron/warehouse/finland/`. SAP går gennem `sapBridge`, Excel-scripts pakkes som hubbens SAP-scripts, fælles data i `_lagerstyring`, admin-rollen i `roles.cjs`, skærme i React med hubbens komponenter og modulets sprog. Mest arbejde, men værktøjet opfører sig som resten af hubben, og det fælles virker.
2. Backend ind i hubben, appens nuværende HTML-skærme vises i hubben. Hurtigere, men ser anderledes ud, kun dansk, og to måder at bygge skærme på. Fravalgt.
3. Appen forbliver selvstændig og startes fra hubben. Ingen deling, ingen roller, SAP-kald kan støde sammen. Opfylder ikke kravene. Fravalgt.

Jacob valgte 1, fordi to teams bruger det dagligt, og det skal være en rigtig del af hubben.

## Hvordan det virker i dag (det, der ændres)

- `src/lib/warehouseLabels.ts`: `WAREHOUSE_TEAMS = ['TCD', 'TRR']` og `isWarehouseTeam` låser hele modulet. `src/views/Hub.tsx` (ca. linje 816) bruger den til `available`.
- `src/views/warehouse/WarehouseHome.tsx`: `tools()` viser alle fire værktøjer uden filter.
- `electron/warehouse/hubUser.cjs`: `warehouseUser` kaster `WAREHOUSE_TEAM_NOT_ALLOWED` for andre teams end TCD og TRR. Den bruges af `serviceUser` i `register.cjs` for hvert `warehouse:*`-kald. Med andre ord afviser hele backend i dag BPO.
- `electron/warehouse/teams.cjs`: TCD og TRR med deres storage locations. `dataDirOf` i `register.cjs` afviser andre teams.
- `electron/warehouse/roles.cjs`: roller gemmes pr. team under nøglen `roller` (`admins`, `statusManagers`, `locationAdmins`, `log`). Managere er automatisk alt.
- `src/components/warehouse/WarehouseRolesCard.tsx` vises i `src/views/ManagerPanel.tsx` (ca. linje 1282) for TCD og TRR.
- `electron/warehouse/sapBridge.cjs`: allowlist af VBS-scripts, én SAP-job ad gangen (`exclusive`), `status()` med kort cache.
- Fælles mappe: `register.cjs` bruger `<platformRoot>\_lagerstyring` (`SHARED_FOLDER`) til data, der deles mellem teams (fx Softwareload-indekset).

## Design

### A. Værktøjer pr. team

Én liste over værktøjer og deres teams, som både vinduet og backend bruger:

| Værktøj | id | Teams |
|---|---|---|
| Stempelkort | `timeclock` | TCD, TRR |
| Placeringer | `locations` | TCD, TRR |
| Optælling | `counts` | TCD, TRR |
| Softwareload | `softwareload` | TCD, TRR |
| Finlandsforsendelser | `finland` | BPO, TCD |

- Vinduet: `src/lib/warehouseTools.ts` med listen og `toolsForTeam(teamId)`. `Hub.tsx` gør `warehouse` tilgængelig for alle teams. `WarehouseHome` viser kun teamets værktøjer, og ellers teksten om, at der ingen er.
- Backend: `electron/warehouse/tools.cjs` med samme liste. Der skal være en test, der sikrer, at de to lister er ens.
- `warehouseUser` må ikke længere afvise et team, bare fordi det ikke er TCD eller TRR. I stedet tjekker hver kanal sit værktøj. Alle nuværende kanaler (Optælling, Placeringer, Stempelkort, Softwareload, SAP-tjek, PI-dokumenter, roller) skal stadig afvise alt andet end TCD og TRR. Det tjekkes med test for hver kanalgruppe, så adgangen ikke ved et uheld bliver bredere.
- Nye kanaler, som hele modulet bruger (`warehouse:me`, `warehouse:tools`), virker for alle teams. `me` må ikke forudsætte storage locations for teams uden.
- `teams.cjs` og `dataDirOf` skal kunne give en datamappe til BPO, men kun for værktøjer BPO har. Optællingsdata må aldrig blive lavet i BPO's mappe.

### B. Manager-område i Arbejdsværktøjer

- En flise "Administration" på forsiden af Arbejdsværktøjer, kun synlig for managere (og creator) i teamet.
- Indhold: roller pr. værktøj, kun for værktøjer teamet har. TCD ser Optælling, Placeringer og Finlandsforsendelser. TRR ser Optælling og Placeringer. BPO ser Finlandsforsendelser.
- `WarehouseRolesCard` flyttes herind og deles op pr. værktøj. I Manager Panel står i stedet en kort tekst med link: "Roller i Arbejdsværktøjer findes nu i Arbejdsværktøjer under Administration."
- Under Finlandsforsendelser i Administration ligger også indstillingen for arket (se E) og oversigten over kollegaers ikke gemte ændringer med mulighed for at slette dem (se D).
- Pladsen er lavet, så flere indstillinger kan komme på sigt.

### C. Roller i Finlandsforsendelser

- Alle i BPO og TCD er brugere: de kan hente fra SAP, skrive ind, rette T&T, tilføje rækker i hånden, følge op og markere "Ikke sendt".
- Admin kan desuden slette en række i arket (for kolli markeret "Ikke sendt").
- Managere (og creator) er automatisk admin. Kun managere kan give og fjerne admin. Hver manager styrer sit eget teams folk.
- Gemmes i teamets eksisterende rollefil (`roller`) som `finlandAdmins`, med log som de andre roller.
- Tjekkes i backend på kanalen, der sletter. Vinduet skjuler kun knappen.

### D. Fælles data (BPO og TCD)

Alt fælles ligger i `<platformRoot>\_lagerstyring\finlandsforsendelser\` og skrives med `mutateAsync` (låst læs-ret-skriv):

| Nøgle | Indhold |
|---|---|
| `ikke-sendt` | Kolli markeret "Ikke sendt": levering, T&T, dato, order type, postnummer, hvem, hvornår og hvilket ark |
| `skrivelaas` | Hvem der skriver i arket lige nu, hvilken dag og hvad, hvornår låsen udløber, og et token for netop den låsning |
| `dagslog` | Pr. dag: hvem der sidst skrev i arket, hvornår og hvor mange kolli. Nyligt skrevne kolli med tidspunkt og ark |
| `indstillinger` | Arkets adresse, fanenavn og tabelnavn |
| `kladder\<email>` | Den enkeltes opfølgninger, der ikke er gemt i arket, hver med det ark, den hører til |
| `slettede-kladder` | De sidste 200 gange en manager har slettet andres kladder: hvem, hvis, hvor mange og hvornår |

Regler:

- **"Ikke sendt" uden liste er stop.** Kan den fælles liste ikke læses (fx M: er væk), må intet skrives i arket. "Skriv", "Tilføj kolliet", "Ret T&T" og "Gem i arket" viser en fejl i stedet. Markering og "Sæt ind igen" kræver også, at listen kan skrives. Er M: væk, afvises alle skrivende kanaler med STORAGE_UNAVAILABLE.
- **Skrivelås.** Alt, der skriver i arket (skriv dag, ret T&T, tilføj kolli, tilføj række i hånden, gem opfølgning, slet række), tager låsen først. Holder en anden den, afvises kaldet med navnet på personen og dagen. Det gælder også samme person på en anden pc ("Du skriver allerede i arket fra en anden pc"). Hver låsning har sit eget token. Før selve skrivningen forlænges låsen kun, hvis den stadig er samme låsning og ikke er udløbet; ellers stopper handlingen, før Excel skriver noget. Låsen udløber af sig selv efter den handlings timeout plus en margen, så en hub, der lukker midt i, ikke låser andre ude. Låsen frigives, når handlingen er færdig, også ved fejl.
- **Kladder er personlige.** Kun ejeren kan gemme sine kladder i arket. Andres kladder læses for at vise "Navn har N kolli, der ikke er gemt" pr. dag og en advarsel på det enkelte kolli: "Navn har en ændring på dette kolli, der ikke er gemt". Advarslen stopper ikke kollegaen. Gemmer begge, fanger den eksisterende konfliktkontrol den sidste. Lukker man hubben med kladder, spørger hubben som i dag.
- **Gamle kladder.** Under Administration kan en manager se alle kladder pr. person (antal, dage, senest ændret) og slette en persons kladder efter en bekræftelse. Det sletter kun i appen, aldrig i arket, og logges.
- **Nyligt skrevne kolli tæller som skrevet.** Når én har skrevet i arket, kan der gå lidt tid, før kollegaens Excel ser rækkerne. Derfor gemmes de kolli, der lige er skrevet (levering og T&T), i `dagslog` med tidspunkt, først når arket er gemt. Ved "Skriv" og "Tilføj kolliet" regnes de som "står i arket" i en periode (fx 30 minutter), også hvis ens egen Excel ikke har dem endnu. Så kan der ikke komme dobbelte rækker. Stopper Excel midt i en skrivning, eller kan arket ikke gemmes, gemmes de kolli, der skulle skrives, også (så godt M: tillader), fordi nogle af dem kan stå i arket. Kan `dagslog` ikke skrives efter en skrivning, der lykkedes, er handlingen stadig lykkedes og viser en advarsel. (Builderens beslutning)
- **Data hører til et ark.** Kladder, "Ikke sendt" og nyligt skrevne kolli gemmes med arkets adresse (uden adresse: testarket). Vinduet, tællingerne, "Skriv", "Ret T&T" og "Gem i arket" bruger kun det, der hører til det ark, der skrives i nu. Så følger testperiodens data ikke med over i det rigtige ark.
- Ved læsning af arket gælder arket. De fælles data ændrer aldrig, hvad der står i arket, de bestemmer kun, hvad der må skrives.

### E. Arket

- Adressen, fanen (`Sheet1`) og tabellen (`Table2`) er en fælles indstilling, som kun managere kan ændre i Administration. Indtil den er sat, bruges testarket, og vinduet viser tydeligt "Testark" ved siden af SAP-lampen. Skift til det rigtige ark kræver en bekræftelse, som også siger, hvor mange ikke gemte ændringer og kolli markeret som ikke sendt der er i det nuværende ark, og at de ikke tages med til det nye.
- Excel bruges som i dag: hver person åbner arket i sin egen Excel via PowerShell og COM. Arket åbnes selv, hvis det ikke er åbent, og filtre fjernes. Det er afprøvet, at det virker, mens arket også er åbent i browseren.
- Scripts flyttes med fra `excel/` (read-table, append-rows, fix-tracking, write-followup, delete-row, common). De pakkes med `asarUnpack` og køres med `powershell.exe -NoProfile -ExecutionPolicy Bypass -File`.
- Alle sikkerhedsregler for skrivning flyttes uændret med: rækken findes på levering og T&T, kun berørte celler skrives, forventede værdier tjekkes igen i scriptet, et kolli med konflikt skrives slet ikke, tekst skrives med apostrof, dato i dansk format, sletning kun ved præcis én match på det godkendte rækkenummer og én T&T i cellen.

### F. SAP

- ZMS_CONS_INFO (`sap/zms-cons-info.vbs` fra appen) tilføjes til `SCRIPTS` i `sapBridge.cjs` som læse-script og køres gennem `exclusive`, med en timeout på mindst 3 minutter (den tager ca. 54 s for ca. 1.560 rækker).
- Scriptet tilpasses hubbens konventioner: system og klient fra `COUNTPOINT_SAP_SYSTEM` og `COUNTPOINT_SAP_CLIENT`, sidste linje er JSON med status. Det åbner sin egen SAP-session og lukker den igen, som i dag. Data skrives til en fil i en midlertidig mappe, der må gå gennem `SAFE_ARGUMENT`.
- Scriptet kræver SAP på engelsk og siger tydeligt til, hvis det ikke er det.
- SAP-lampen er hubbens egen (`warehouse:sap:status`).
- Salgsorganisation F300 og to måneder bagud, som i dag.

### G. Sporingsvinduer

- Ét vindue pr. courier (PostNord, DHL, DSV), som genbruges, kommer frem uden at tage tastaturet, husker plads og størrelse og lukker med hubben. Som i appen i dag (`app/tracking.cjs`).
- Egen session (`persist:tracking`), så cookie-valg huskes. Ingen preload, ingen tilladelser. Links, der åbner nye vinduer, går til den almindelige browser.
- DSV: T&T kopieres til udklipsholderen via hubbens udklipsholder-funktion.

### H. Skærmene

Bygges i React i `src/views/warehouse/finland/` med hubbens komponenter (Card, Button, Badge, Tabs osv.). Teksterne følger Arbejdsværktøjer: dansk og engelsk via `t(dansk, engelsk)` i `src/lib/warehouse/text.ts`, hvor finsk og svensk får engelsk, ligesom i de andre værktøjer. (Builderens beslutning) Indholdet er det samme som i appen i dag:

- **Skriv ind:** kalender med farve pr. dag, dagens kolli i grupperne Mangler, Skal tjekkes, Ikke sendt og Står i arket, knappen "Skriv N kolli i arket", rettelser fra listen til tjek, "Ikke sendt" og "Sæt ind igen", sletning af række med bekræftelse (kun admin).
- **Tilføj række i hånden** (fx DSV) med tjek og forhåndsvisning.
- **Opfølgning:** kalender, kolli for kolli med Expected, Received, SLA, Comment og Terminal, forslag, tastaturgenveje, knappen til sporingssiden, kolonneoverskrifter og forklaring, Expected i listen, "Gem i arket" pr. dag og "Gem alle", konflikter med "Brug arkets" og "Brug min".
- **Nyt:** ved hver dag vises kollegaers ikke gemte kolli og hvem der sidst skrev dagen. Mens nogen skriver, står det, hvem og hvilken dag, og skriveknapperne venter.
- Intet hentes af sig selv. "Hent fra SAP" og "Læs arket" er knapper.
- Den orange markering "N kolli er ikke gemt i arket" vises i værktøjets titellinje.

## Funktioner der flyttes med (skal virke som i appen)

Kildekoden i `C:\Supply Chain Tools\Finland TT` er facit. Den har 131 tests (`npm.cmd test`), der flyttes med:

- `src/courier`, `sapList`, `sheetIndex`, `compare`, `newRows`, `dayOverview`, `placement`, `reviewAction`, `followUp`, `followUpSync`, `drafts`, `manualRow`, `dateRange`.
- Regler: courier ud fra T&T (JD + 18 cifre er DHL, 00073215 er PostNord, 00157145 er DSV), Expected (PostNord 2 arbejdsdage, 3 ved postnummer 7, 8 og 9; DHL 1, 2 når postnummeret ikke starter med 0 til 3), SLA OK når Received ikke er efter Expected, Terminal Turku eller Vantaa for PostNord, DHL og DSV automatisk.
- `app/service.cjs` viser, hvordan det hele hænger sammen (genlæsning før skrivning, konflikthåndtering, sletning).

## Overgang

- Den selvstændige app bliver brugt, indtil Finlandsforsendelser er i hubben og afprøvet. Kun Jacob bruger den. Skiftet er hårdt: når hubben bliver sat til det rigtige ark, lukkes den selvstændige app og bliver ikke brugt mod det rigtige ark igen, fordi den ikke kender den fælles liste og låsen. (Builderens beslutning)
- Kladder i appen gemmes i arket før skiftet. Appens "Ikke sendt"-liste (`%APPDATA%\finland-tt\not-sent.json`) er lille, og den føres over ved at markere kolliene igen i hubben. Der bygges ingen import. (Builderens beslutning)

## Afprøvning

- Alle tests fra appen flyttes med og kører i hubbens `node --test`.
- Nye tests: værktøjslister ens i vindue og backend, adgang pr. kanalgruppe (BPO afvises af de fire nuværende værktøjer, TRR afvises af Finlandsforsendelser), admin-tjek ved sletning, skrivelås (tages, afvises, udløber, frigives ved fejl), "Ikke sendt" kan ikke læses betyder ingen skrivning, kladder kan ikke gemmes af andre, kun managere kan slette andres kladder, nyligt skrevne kolli bliver ikke skrevet igen.
- Afprøvning mod Excel sker kun på en lokal kopi af arket. Det rigtige ark bliver ikke rørt uden Jacobs udtrykkelige ja.
- SAP afprøves kun med læsning (ZMS_CONS_INFO).

## Det builderen bestemmer

- Præcis filstruktur under `electron/warehouse/finland/` og `src/views/warehouse/finland/`.
- Hvordan kanalerne deles op (`warehouse:finland:*`), og hvordan værktøjstjekket bygges ind i `handle` i `register.cjs`, så længe de nuværende kanalers adgang er uændret.
- Låsens præcise udløbstider.
- Hvordan kalender og lister ser ud, inden for hubbens komponenter og stil.
- Om status manager fra Optælling også giver admin i Finlandsforsendelser. Udgangspunktet er nej: rollerne er pr. værktøj. (Builderens beslutning)
