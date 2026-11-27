# Status fra nShift i Finlandsforsendelser: design

Status: udkast til godkendelse (27.11.2026). Bygges på grenen `feature/finlandsforsendelser` oven på Finlandsforsendelser (se `finlandsforsendelser-design.md`).

## Hvorfor

I Opfølgning slår man i dag hvert kolli op på PostNords eller DHL's side for at aflæse, hvornår det blev leveret, hvilken finsk terminal det gik igennem, og om der skete noget undervejs. Jacobs firma booker forsendelserne gennem nShift, og nShifts Shipment Data API giver hele forløbet for både PostNord og DHL i ét format. Appen kan derfor hente forløbet selv og foreslå Received, SLA, Terminal og Comment, så man kun skal godkende.

## Afprøvet (27.11.2026)

- Login med OAuth2 client credentials mod `https://account.nshiftportal.com/idp/connect/token` virker med Jacobs klient. Token gælder 3600 sekunder.
- Opslag: `POST https://api.nshiftportal.com/track/shipmentdata/Operational/Shipments/Aggregated/ByBarcode` med `{ query: <T&T>, startDate, endDate, pageSize, pageIndex: 0, installationTags: [], actorTags: [], carrierTags: [] }`. Uden datoer kommer der intet svar. **Højst 31 dage** mellem `startDate` og `endDate`, ellers svarer API'et 400.
- 398 af 400 kolli fra arket (juni til november 2026) blev fundet med et vindue fra afhentningsdag minus 3 dage til plus 27 dage.
- Svaret har `shipment.events` (nShifts egne og DHL's hændelser) og `shipment.lines[].packages[].events` (PostNords hændelser). Hver hændelse har `date` (ISO med tidszone), `normalizedStatusId`, `normalizedStatusName`, `configurationName` (kurerens tekst) og `addresses` (sted: navn, by, land). `additionalInformation.latestStatuses` har seneste status.
- Svaret indeholder også modtagerens navn og adresse. De bruges ikke og gemmes ikke.

## Mål

1. I Opfølgning kan man hente status fra nShift for alle kolli på en dag på én gang, eller for ét kolli.
2. Forløbet vises på kolliet: hændelser med tid, sted og tekst, og tydeligt "Første forsøg" og "Afleveret".
3. Ud fra forløbet foreslår appen Received, SLA, Terminal og Comment efter reglerne nedenfor. Forslagene vises grå som Expected i dag og bliver først til ændringer, når man godkender dem.
4. Knappen "Brug forslagene for alle leverede kolli på dagen" viser først en liste over, hvad der bliver udfyldt, og gemmer derefter som ikke gemte ændringer i appen. Arket skrives først ved "Gem i arket" som i dag.
5. Expected foreslås ud fra aftalens tabel over postnumre og leveringsdage pr. kurer.
6. Hentede svar gemmes i den fælles mappe, så kollegaer ser dem uden at hente igen, med tidspunkt for hentningen.
7. nShift-klientens id og hemmelighed indtastes af en manager under Administration.

## Ikke-mål

- Ingen automatisk hentning, heller ikke om natten (mulig senere udvidelse, når hubben står på en låst server).
- Ingen direkte integration med PostNords eller DHL's egne API'er.
- DSV hentes ikke. DSV-kolli følges op i hånden som i dag.
- Ingen ændring af arkets kolonner.

## Anti-mål

- Noget fra nShift bliver skrevet i arket uden en persons godkendelse.
- Received eller SLA får en anden betydning end den, arket har haft hidtil.
- nShift-hemmeligheden kommer i vinduet, i loggen, i git eller i en fejltekst.
- Modtagerens navn eller adresse bliver gemt.

## Det Jacob har besluttet

| Emne | Beslutning |
|---|---|
| Kilde | nShift Shipment Data API (én adgang for PostNord og DHL) |
| Hentning | Begge dele: hele dagen med én knap, og ét kolli ad gangen |
| Godkendelse | Forslag som i dag, plus "Brug forslagene for alle leverede kolli på dagen" med liste først |
| Received | Den dag pakken blev **afleveret** (som kollegaen gør i dag) |
| SLA | OK når **første forsøg** var senest på Expected, også hvis afleveringen var senere. Ellers OK når Received er senest på Expected |
| Første forsøg | Står i Comment: `1st attempt within SLA (dd-mm)` når forsøget var inden for SLA og afleveringen ikke var |
| Kommentarregler | Tabellen under "Regler", som Jacob har godkendt |
| Forgotten in warehouse | SLA = OK (forsinkelsen er firmaets egen) |
| Expected | Aftalens tabel over postnumre, se "Leveringstider" |
| Klientens rettigheder | Klienten beholder sine nuværende scopes. Jacob har valgt det, fordi hubben skal ligge på en låst server, som kun han og admin har adgang til. Indtil da kører hubben på kollegaernes pc'er, og alle med adgang til den fælles mappe kan i praksis få fat i hemmeligheden. Jacob har accepteret den risiko (27.11.2026) |
| Vej | Hubbens backend henter, når man trykker; svarene deles via den fælles mappe |

## Tilgange

1. **Hubbens backend henter, når man trykker (valgt).** Nøglen bliver i backend, svarene deles, reglerne ligger i et testet modul. Man venter et par sekunder ved en hel dag.
2. Som 1, plus natlig hentning. Kræver en hub, der kører om natten, og går imod "intet hentes af sig selv". Mulig senere.
3. Direkte mod PostNord og DHL. To nøgler og to formater, og PostNords adgang findes ikke. Fravalgt.

## Regler

Analysen bag: 238 kolli med kommentar og 160 uden, sammenlignet med nShifts forløb (27.11.2026).

**Hændelser:**
- *Første forsøg* = første hændelse med `normalizedStatusId` 3000 (Delivered), 2002 (Ready for pickup / leveret til udleveringssted), 5006 (Failed delivery attempt), 6000 (fx "The recipients goods reception is closed today") eller 6003 (No property access).
- *Afleveret* = første hændelse med 3000 eller 2002.
- Datoer regnes i Finlands tidszone (`Europe/Helsinki`) for hændelser i Finland.
- *Køge-tid* = fra første hændelse med sted Køge til første senere hændelse med et andet sted.
- *Finsk terminal* = den første af Vantaa eller Turku i forløbet. *Terminal-tid* = fra første hændelse dér til første senere hændelse med et andet konkret sted.
- *Første scanning* = første hændelse med et sted, der ikke er 4004 (Booking information confirmed).

**Forslag:**

| Felt | Regel |
|---|---|
| Received | Afleveringsdagen. Uden aflevering intet forslag |
| SLA | OK hvis første forsøg ≤ Expected. Ellers OK hvis Received ≤ Expected, ellers NOK. Uden Received og uden forsøg intet forslag. `Forgotten in warehouse` giver OK |
| Terminal (PostNord) | Vantaa eller Turku ud fra forløbet. Uden en af dem intet forslag. DHL og DSV som i dag |
| Comment | De regler nedenfor, der passer, adskilt med komma i denne rækkefølge |

| Når | Comment |
|---|---|
| Første scanning er 2 arbejdsdage eller mere efter afhentningsdagen *(kun PostNord)* | `Forgotten in warehouse` |
| Køge-tid er over 66 timer, eller forløbet har Brøndby *(kun PostNord)* | `stuck in Køge` |
| Køge-tid er 45 til 66 timer *(kun PostNord)* | `1 ekstra day in Køge` |
| Terminal-tid er over 48 timer *(kun PostNord)* | `Delay Finland, Vanta term` eller `Delay Finland, Turku term` |
| Første forsøg ≤ Expected og afleveret > Expected *(PostNord og DHL)* | `1st attempt within SLA (dd-mm)` |

Reglerne for Køge, Brøndby, terminal og første scanning er kun set i PostNords data og gælder derfor kun PostNord. (Builderens beslutning)

**Flere pakker:** en række med flere T&T i cellen følger det første T&T, som Opfølgning gør i dag. Der bruges kun hændelserne for den pakke, hvis nummer er det opslåede T&T (PostNord: `lines[].packages[]` med det nummer; DHL: forsendelsens hændelser). (Builderens beslutning)

Alt er forslag. Felter, som personen allerede har udfyldt eller ændret, overskrives aldrig af et forslag.

## Leveringstider (Expected)

Antal arbejdsdage fra afhentningsdagen. Fra aftalen med PostNord og DHL; rækker markeret *forslag* udfylder huller i aftalen ud fra kollegaens praksis og skal bekræftes af den ansvarlige for aftalen.

| Postnumre | PostNord | DHL |
|---|---|---|
| 00100 til 02990, 03000 til 04990 | 2 | 1 |
| 05000 til 12999 *(forslag)* | 2 | 1 |
| 13000 til 16999 | 2 | 1 |
| 17000 til 19999 *(forslag)* | 2 | 1 |
| 20000 til 25999 | 2 | 1 |
| 22000 til 22999 (Åland) | 3 | 2 |
| 26000 til 27999 *(forslag)* | 2 | 1 |
| 28000 til 32999 | 2 | 1 |
| 33000 til 39999 | 2 | 1 |
| 40000 til 58999 | 2 | 2 |
| 59000 til 59999 *(forslag)* | 2 | 2 |
| 60000 til 69999 | 2 | 2 |
| 70000 til 79999 | 3 | 2 |
| 80000 til 92999 | 3 | 2 |
| 93000 til 94999 *(forslag)* | 3 | 2 |
| 95000 til 99999 | 4 | 3 |

- Den smalleste række vinder (Åland inden for 20000 til 25999).
- Postnumre mister ofte nuller foran i arket; de fyldes op til 5 cifre.
- Postnumre uden for tabellen eller uden for Finland giver intet forslag.
- Tabellen ligger som data, så den kan rettes uden at ændre reglerne. I arket matchede tabellen kollegaens Expected i 93 % af 1.618 kolli (den nuværende regel 90 %).

## Design

### A. nShift-klient (backend)
- Nyt modul `electron/warehouse/finland/nshift.cjs`: henter token (client credentials), genbruger det til kort før udløb, og slår et T&T op med vinduet afhentningsdag minus 3 til plus 27 dage.
- Svaret omsættes straks til et lille forløb: `{ tracking, carrier, fetchedAt, events: [{ at, statusId, status, text, place }] }`. `place` er by og land fra hændelsen, og stedets navn kun på transport- og terminalhændelser (2000, 2003, 2004, 2008); på levering, forsøg og booking kan navnet være modtagerens. Modtagerens navn og adresse bruges ikke. Giver opslaget flere forsendelser, bruges den, hvis kolli har T&T'et som nummer (ellers den første).
- Kald til nShift går ét ad gangen med en lille pause, så en hel dag (op til ca. 40 kolli) ikke rammer en grænse. Fejl for ét kolli stopper ikke resten. En dag har højst 5 minutter; det fundne gemmes, og resten tælles som fejlede.
- Fejl bliver danske tekster: forkert nøgle, nShift svarer ikke, kolliet findes ikke i nShift.

### B. Hemmeligheden
- Gemmes i den fælles mappe under nøglen `nshift` via hubbens store, der krypterer på disken. Krypteringen er kun mod utilsigtet klartekst: nøglen til den ligger i hubben, så adgangen styres af, hvem der har adgang til mappen (Jacobs låste server).
- Kun managere kan sætte den, under Administration, Finlandsforsendelser. Vinduet får aldrig hemmeligheden tilbage, kun "nShift er sat op" og de sidste fire tegn af klient-id.
- Hemmeligheden logges aldrig og kommer aldrig med i fejltekster.

### C. Fælles svar
- Forløb gemmes i den fælles mappe pr. T&T med `fetchedAt`, så kollegaer kan se dem.
- Et forløb, der er afleveret, hentes ikke igen, medmindre man trykker "Opdater status" på kolliet.

### D. Regler (rent modul)
- Nyt modul `electron/warehouse/finland/core/nshiftRules.cjs` med reglerne ovenfor og `core/leadTimes.cjs` med tabellen. Begge uden I/O og med tests, der bruger anonymiserede forløb fra analysen (kun tider, statuskoder og terminalnavne).
- `core/followUp.cjs`' `expectedSuggestion` bruger tabellen.

### E. Service og kanaler
- `fetchStatus(user, { date })` og `fetchStatus(user, { key })` henter, gemmer og returnerer snapshot med forløb og forslag pr. række.
- `applySuggestions(user, { date })` laver ikke gemte ændringer for alle leverede kolli på dagen ud fra forslagene, kun for felter der er tomme i arket og ikke ændret af personen. Det svarer til at trykke Enter på hvert kolli.
- Kanaler via `handleTool(['finland'])`: `fetch-status`, `apply-suggestions`, og under Administration `nshift-settings`, `set-nshift-settings` (managere).

### F. Skærmen
- Opfølgning: knappen "Hent status fra nShift" for dagen og "Opdater status" på kolliet. Tidspunkt for seneste hentning.
- På kolliet: forløbet som en kort liste (tid i finsk tid, sted, tekst), med "Første forsøg" og "Afleveret" fremhævet.
- Forslag vises grå i felterne som Expected i dag og bliver taget ved Enter/Næste.
- "Brug forslagene for alle leverede kolli på dagen" viser en liste pr. kolli over de felter, der udfyldes, med "Ja, brug forslagene" og "Fortryd".
- Administration: felter til klient-id og hemmelighed, "Gem" og "Test forbindelsen".

## Afprøvning
- Tests for reglerne og tabellen med anonymiserede forløb (kun tider, koder og stednavne).
- Tests for nShift-klienten med falske svar: token genbruges, vindue på højst 31 dage, fejltekster, hemmeligheden aldrig i fejl.
- Afprøvning mod rigtig nShift kun med læsning; mod arket kun på en kopi.

## Det builderen bestemmer
- Præcis filstruktur og navne på kanaler ud over de nævnte.
- Pausen mellem kald og hvor længe et token genbruges.
- Hvordan forløbet vises, inden for hubbens komponenter.
