# Hurtigere gemning på M: – design (1.6.7)

## Hvorfor

Hver gemning på det fælles drev (M:, `\\VM-MSDK-2\org`) tager 10–90 s. Skærmen venter ikke længere (ændringer vises straks),
men en gemning, der tager lang tid, betyder: kolleger ser ændringen sent, flere gemninger af samme ting står i kø, Placeringer
(4–9 filer pr. handling) er særligt hårdt ramt, og lukning af appen må vente. Brugeren (Jacob) vil have gemningen selv hurtigere.

## Målt (07.11, `measure-m-operations.cjs`, 3 runder, median)

| Handling på M: | ms |
|---|---|
| Opret ny fil (alle typer/størrelser) | 2.200–3.400 (i formiddags 10.000–15.000) |
| Skriv i eksisterende fil, åbnet `r+` | 560–1.000 |
| Skriv i eksisterende fil med `writeFile` (`w`, afkorter) | 5.500 – lige så dyrt som at oprette |
| Omdøb / omdøb og erstat | 760–835 |
| Hardlink til eksisterende fil | 650 |
| Sæt tidsstempel (utimes) | 400 |
| Læs 100 KB / lille | 450 / 290 |
| Slet fil | 215 |
| Opret mappe | 38 |
| **Hubbens gemning i dag** (lås-fil + læs + tmp-fil + omdøb + læs ejer + slet lås) | **10.500** |
| Med forberedt tmp-fil (`r+`) | 6.400 |
| **Med forberedt tmp-fil + lås som hardlink til forberedt fil** | **3.400** |

Appens trin-log bekræfter: de to filoprettelser (låsefilen og tmp-filen) er ~90 % af tiden (`KV: langsom skrivning … laas 2–17 s | tmp 10–20 s`).

### Resultat efter implementering (07.11 aften, appens rigtige kode, 5 runder, drevet presset)

| | I dag | Med forberedte filer |
|---|---|---|
| Gemning (`updateAsync`) | median 18.648 ms (7.580–24.953) | **median 2.477 ms (2.353–2.560)** |
| Placeringer-transaktion, 6 nøgler | median 66.852 ms | **median 26.845 ms** |

Uden forberedte filer blev hver gemning langsommere, efterhånden som drevet blev presset (filoprettelse 2 → 12 s); med dem var
tiden stabil. Kontrol: alle data gemt korrekt, ingen låsefiler efterladt, midlertidig mappe slettet.

## Mål

- En gemning på M: uden at oprette nye filer: ~3× hurtigere ved samme drevbelastning; mere når drevet er presset.
- Gælder alle async-skrivninger: KV (`setAsync`, `updateAsync`, `mutateAsync`), Placeringers multi-lås-transaktioner
  (`withFileLocksAsync`), registret, Optællings journal-upload.
- Færre faste baggrundsgemninger, så drevet er mindre optaget for alle.

## Ikke-mål

- Ændre filformat, filnavne for data, eller låsefilernes navn (`<nøgle>.json.lock`) – 1.6.6 kører samtidig.
- Mappe-lås (`mkdir`, 38 ms) – kræver at ingen kører 1.6.6; senere version.
- De synkrone skrivestier (`withFileLock`, `withLockedKeys` i kontosystemet) – sjældne, uændrede.
- Backup-filer (skrives én gang, i baggrunden).

## Anti-mål (fejl, selv hvis det "virker")

- To klienter (1.6.6 eller 1.6.7) må aldrig kunne holde samme lås samtidig → mistede ændringer.
- En halvt skrevet datafil må aldrig kunne læses (atomisk omdøb bevares).
- Ingen nye filer, som 1.6.6's overvågning eller oprydning misforstår, og intet affald, der hober sig op på M:.
- Virker hardlinks ikke på et drev, må intet gå i stykker – så bruges dagens metode.

## Tilgange (valgt: A)

- **A. Forberedte filer + lås som hardlink (valgt af Jacob).** ~3,4 s. Kompatibel med 1.6.6.
- B. Kun forberedte tmp-filer. ~6,4 s. Enklere, halv gevinst.
- C. Mappe-lås. Hurtigst, men 1.6.6 ser den ikke → først når alle er tvunget over på ny version.

## Sådan virker A

### 1. Forberedte tmp-filer (pr. mappe)

- Pr. datamappe holder processen et lille lager af **tomme filer, der er oprettet i baggrunden**, fx
  `~hub-prep-<pid>-<tid>-<hex>.tmp` i samme mappe som datafilerne. De ender ikke på `.json`, så ingen overvågning (1.6.6 eller
  1.6.7) og ingen nøgleliste ser dem.
- Ved gemning: tag en forberedt fil, åbn med `r+`, skriv det krypterede indhold, luk, og **omdøb den over** `<nøgle>.json`
  (som i dag – atomisk). Filen er dermed brugt; en ny forberedes i baggrunden.
- Er lageret tomt (første gemning i en mappe, eller mange samtidige), bruges dagens metode (ny tmp-fil) – der ventes aldrig på
  en forberedelse. Første gemning i en mappe starter forberedelsen; mapper der aldrig skrives i, får ingen filer.
- Lagerstørrelse: lille som standard (2); Placeringers mappe skal kunne dække én transaktion (op til ~9 filer). Bygger vælger.
- Fejler skrivning/omdøb, slettes den forberedte fil (genbruges aldrig).

### 2. Lås som hardlink

- Pr. mappe holder processen et lille **lager af forberedte ejer-filer** (`~hub-owner-<pid>-<hex>.lock-owner`), hver med sit
  **eget, nye ejer-id** som indhold. Én ejer-fil bruges til præcis én lås ad gangen.
  (Ikke én fælles ejer-fil pr. mappe: så ville alle låse have samme ejer-id og samme tidsstempel. 1.6.6 tager en lås, når den
  har set samme ejer-id i 30 s – også med frisk tidsstempel – så den ville tage en lås, der er i brug. Og en efterladt lås
  ville aldrig se forladt ud, fordi de andre låses hjerteslag holdt den frisk.)
- At tage låsen: `utimes` på ejer-filen (frisk tidsstempel) og derefter `link(ejer-fil, <nøgle>.json.lock)`. `link` fejler
  med EEXIST hvis låsen findes – samme "eksklusive oprettelse" som dagens `open('wx')`, så 1.6.6 og 1.6.7 udelukker hinanden.
- Alt andet om låsen er uændret: ventetid/jitter, forladte låse, hjerteslag (`utimes` på låsen rammer kun denne ejer-fil),
  max-tid for hjerteslag.
- Frigivelse: som i dag – læs låsen, og slet den kun hvis indholdet er netop denne låses ejer-id (fjerner kun linket).
  Bagefter får ejer-filen i baggrunden et **nyt ejer-id skrevet ind (`r+`, ~0,5 s, ingen ny fil)** og kommer tilbage i lageret.
  Kunne frigivelsen ikke bekræfte ejerskab, fejler sletningen af låsen, eller fejler omskrivningen, kasseres ejer-filen (den må
  aldrig få nyt indhold, mens en efterladt lås stadig peger på den).
- Er lageret tomt, eller fejler `link` med andet end EEXIST/contention (fx ikke understøttet), bruges dagens metode; ikke-
  understøttet huskes for mappen.

### 3. Oprydning

- Ejer- og prep-filer slettes når appen lukker (bedst muligt).
- Efterladte filer fra crashede klienter fjernes af temp-oprydningen, når både navnets tidsstempel og mtime er ældre end 24 t
  (samme regel som i dag). Oprydningen kører i dag kun i `_shared` og `_shared\multiplayer`; den udvides til alle mapper,
  hvor appen forbereder filer (team-mapper, `placeringer`, `_registry`). En ejer-fil, der stadig har en lås linket til sig, er
  ufarlig at slette (låsen består som almindelig fil og ældes som enhver anden lås).

### Belastning af drevet

Pr. gemning oprettes stadig én ny fil (den forberedte tmp-fil, der bliver til datafilen), men i baggrunden og ikke mens der
gemmes. Ejer-filer genbruges (nyt id skrives ind), så de giver ingen nye filer.

### 4. Færre faste baggrundsgemninger

- `client-versions`: skriv kun ved ny version/platform eller når `lastSeen` er over 6 t gammel (i dag 1 t). Manager Panel kalder
  en klient offline efter 24 t, så 6 t holder status korrekt. (Mit valg.)
- Husket login (`active-sessions`, 365 dages glidende vindue): forny kun hvis den sidst blev fornyet for over 30 dage siden
  (i dag ved hver start). (Mit valg.)
- "Sidst set" til "Hvad skete der mens du var væk" (`digest-last-seen-<bruger>`): gem kun når der faktisk blev vist noget,
  eller når den gemte værdi er over 24 t gammel. Uden vist indhold ændrer et uopdateret tidsstempel ikke, hvad der vises
  næste gang. (Mit valg.)

## Begrænsninger

- 1.6.6-klienter: tager låse med `open('wx')`, regner en lås for forladt efter 30 s uden frisk mtime eller efter 30 s med
  samme ejer (gammel fejl). Hardlink-låsen har frisk mtime og samme navn → behandles som i dag.
- Data krypteres som i dag (`encryptPayload`); kun hvordan bytes kommer på disken ændres.
- Sync-fs i main-processen er forbudt (fryser appen).

## Overladt til bygger

- Præcise filnavne for prep/ejer-filer (skal ikke ende på `.json`, `.json.lock` eller matche dagens tmp-mønster forkert).
- Lagerstørrelser og hvornår der fyldes op.
- Om utimes før link og læsning af ejer ved frigivelse kan slås sammen/undværes – kun hvis det bevisligt er sikkert.
- Tests: alle eksisterende lås- og store-tests skal bestå; nye tests for: hardlink-lås udelukker en `wx`-låser og omvendt,
  frigivelse fjerner ikke en lås, en anden har taget, tilbagefald når link ikke virker, prep-fil genbruges aldrig efter fejl,
  intet efterlades efter lukning. Ny måling på M: før/efter med appens rigtige kode.
