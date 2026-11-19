# Design: Hurtig og responsiv SCH på M: (1.6.7)

Status: design 06.11.2026 – builder-check gennemført, afventer godkendelse. Diagnose og målinger: [m-drev-performance.md](./m-drev-performance.md).

## Hvorfor

SCH føles langsom: appen fryser 7–20 s ad gangen (`MAIN BLOCKED` i `main.log`), og gemninger tager 7–53 s. Samtidig belaster ~40 klienter `\\VM-MSDK-2\org` med konstant polling, hvilket gør M: langsommere for alle – også for andre apps. Målet er, at appen *opleves* øjeblikkelig og aldrig hænger, og at SCH er en god nabo på M:.

## Mål

1. **Ingen frys**: main-processen må aldrig vente synkront på M: i noget, brugeren kan udløse efter opstart (IPC, timere, watcher).
2. **Langt mindre belastning af M:**: watcheren laver ét billigt opslag pr. mappe i stedet for at `stat`'e alle filer (TCD ~730, TRR ~1.480) hvert 2. s.
3. **Kollegers ændringer vises mindst lige så hurtigt som i dag** (~1–2 s, begrænset af Windows' SMB-cache).
4. **Handlinger føles øjeblikkelige** hvor det er sikkert: skærmen opdateres straks, gemning kører i baggrunden, fejl rulles tilbage med en tydelig besked.
5. **Ingen unødige skrivninger**: skriv ikke en værdi, der er uændret.

## Ikke-mål

- Intet nyt dataformat på M:. 1.6.6 og 1.6.7 kører side om side indtil alle har opdateret og skal kunne læse/skrive de samme filer.
- Ingen opsplitning af `multiplayer-index`, `client-versions` eller `active-sessions` i flere filer (fravalgt "mulighed 2" – kan tages senere).
- Ingen ændring af kryptering, låsemodel (lås-fil pr. nøgle) eller backup-politik.

## Anti-mål (fejl selv hvis det "virker")

- Data går tabt eller to klienter overskriver hinanden (fx fordi en lås springes over for at vinde tid).
- En ændring fra en kollega bliver ikke vist, fordi watcheren misser den.
- Optimistisk UI viser noget som gemt, der ikke blev gemt, uden at brugeren får besked.
- Opstart bliver langsommere.

## Begrænsninger (målt 06.11.2026)

- `fs.watch` virker **ikke** på `VM-MSDK-2` (fejl `UNKNOWN` med det samme) – ingen push-notifikationer.
- Mappens `mtime` opdateres når en fil oprettes/omdøbes/slettes i den (målt: synlig efter ~0,6 s). Alle KV-skrivninger går via lås-fil (opret/slet) + tmp-fil + rename, i både 1.6.6 og 1.6.7, så hver skrivning flytter mappens `mtime`. En overskrivning *in place* flytter den ikke.
- En lille fil-oprettelse koster ~280 ms; `stat` af en fil fra SMB-cachen ~0,5 ms; en fuld scan af TCD/TRR ~0,5–0,7 s.
- Async-varianter findes allerede for næsten alt i `store.cjs` (`getAsync`, `setAsync`, `updateAsync`, `mutateAsync`, `keysAsync`, `withFileLockAsync`) og delvist i `authService`/`accountService` (`currentAsync`, `accountAsync`, `runWriteAsync`, `statusAsync`). `registry.cjs` har kun `prefetchAsync`.
- `useKV` er allerede optimistisk. `client-versions` skrives allerede højst hver time i 1.6.7. Auto-backup er allerede async og kører kun på én klient ad gangen.

## Tilgange (overvejet)

| # | Tilgang | Afvejning |
|---|---|---|
| 1 | Billig watcher (mappe-`mtime`) + ingen sync I/O på main + spring uændrede skrivninger over | Middel indsats, intet formatskift, fjerner frys og det meste af M:-belastningen |
| 2 | Som 1 + opsplitning af delte hotspot-filer | Mindst låsekø, men nyt format kræver dobbelt læs/skriv i overgangen – for komplekst nu |
| 3 | Som 1 + optimistisk UI dér hvor det er sikkert | Lidt ekstra arbejde i UI, ingen formatændring, største *oplevede* gevinst |
| – | `fs.watch`-push | Udelukket: virker ikke på serveren |

**Valgt: 1 + 3** (brugeren 06.11.2026). Begrundelse: fjerner frys og belastning uden risiko for versionsblanding, og gør de langsomme handlinger øjeblikkelige for brugeren.

## Hvordan (besluttet)

### A. Watcher: mappe-`mtime` som billigt signal

- Hvert tick (1 s når vinduet er synligt) `stat`'es kun selve mappen. Er `mtime` uændret → intet mere.
- Er `mtime` ændret → kør den eksisterende `scanDirectoryAsync` (diff af mtime+size pr. fil), præcis som i dag.
- **Sikkerheds-scan**: fuld scan uanset `mtime` hvert 30. s (fanger in-place-overskrivninger og eventuelle cache-huller).
- **Når vinduet er skjult/minimeret**: tick hvert 10. s og sikkerheds-scan hvert 2. min. Ved genvisning: øjeblikkelig fuld scan.
- Gælder både team-store og `_shared`-store. Forbindelsesdetektion (`reachable`) skal virke som i dag – et fejlende mappe-`stat` = afbrudt.
- **Loft** *(builderens beslutning)*: ændrings-udløste fulde scans højst hvert 2. s pr. mappe – dvs. aldrig mere I/O end i dag, selv på en travl dag. Målt 06.11 kl. 11 over 90 s: TCD skiftede `mtime` 2 gange, TRR/`_shared`/BPO 0 gange, så loftet rammes sjældent.

### B. Ingen synkron M:-I/O på main efter opstart

- Alle IPC-handlere, timere og watcher-callbacks, som i dag rammer M: synkront under **almindelig brug**, skal over på async-varianter: auth `login/resume/renew/logout`, `authService.current()`-kald i handlere (warehouse/notifications/assistant/team-reader), sygefravær-timeren og registry-*læsninger*.
- *(Afgrænsning efter planlægning 06.11)* Sjældne admin-/formular-handlinger forbliver synkrone i denne omgang: registry-*skrivninger* (opret team, tildel bruger, manager-adgang), `accounts:*`-handlinger, redigering af `users` via `kv:update`, `signup` og `profile`. De bruges få gange om ugen af managers, og brugeren venter allerede ved en knap.
- `registry.cjs`-læsninger: en udløbet cache serveres straks, og den friske version hentes async i baggrunden (stale-while-revalidate). Kun den allerførste læsning (før cachen findes) er synkron.
- `fileLock.acquireFileLock` (sync, `Atomics.wait`) må kun bruges i opstart/tests. Main-thread-watchdoggen (`MAIN BLOCKED`) bevares som målepunkt.
- Opstart før vinduet vises må fortsat være synkron, men må ikke blive langsommere.

### C. Spring uændrede skrivninger over

- `store.setAsync`/`updateAsync`/`mutateAsync`: hvis resultatet er dybt lig den nuværende værdi på disken (efter læsning under lås), skrives der ikke (og ingen ændrings-broadcast).
- `digest-last-seen-*` røres ikke *(builderens beslutning)*: den skrives én gang pr. login i brugerens egen fil, og værdien er altid ny. Dens langsomhed i loggen skyldtes de synkrone frys (B), ikke selve skrivningen.

### D. Optimistisk UI (sikre steder)

*(Fundet under planlægning 06.11)* Det meste findes allerede: `useKV` er optimistisk, og skak/backgammon/ordspil viser trækket straks, skifter tur og viser "Sender…" mens det gemmes (`sendingMove`/`sendingTurn`). D reduceres derfor til at **verificere** dette efter A–C, når gemninger tager sekunder i stedet for 20–50 s.

- **Multiplayer** (skak, backgammon, ordspil): et bekræftet træk/pas/opgiv vises straks; brættet låses ikke med spinner, mens gemningen kører – i stedet en diskret "Gemmer…"-indikator. Ved fejl: toast + genindlæs spillet (eksisterende `load()`). Der kan kun være ét træk "i luften" ad gangen (eksisterende `inFlight`).
- *(Builderens beslutning)* Spillereglerne, terningerne og nye bogstavbrikker ligger i main (`electron/games/*`, `multiplayer.cjs`). Skærmen viser derfor kun sit eget ventende træk (brikken står hvor spilleren satte den) + "Gemmer…", og det autoritative resultat (nye brikker, terninger, point) dukker op, når main svarer. Main svarer **ikke** "færdig" før trækket er skrevet til M: – ellers kunne et træk vises som gemt uden at være det (anti-mål).
- *(Builderens beslutning)* Lukkes appen mens et træk/en gemning stadig kører, venter main op til 10 s på igangværende skrivninger før den afslutter (samme mønster som eksisterende `before-quit`-håndtering, hvis den findes). Forlader brugeren spillet, kører gemningen færdig i baggrunden; fejl vises stadig som toast.
- **Notifikationer/high-fives/acknowledge**: allerede fire-and-forget – verificér at UI ikke venter.
- Øvrige skærme bruger `useKV`, der allerede er optimistisk.

## Overladt til den der bygger

- Præcis struktur af watcher-koden (ny funktion vs. udvidelse af `watch()`), og hvordan synlighed sendes fra vindue til store.
- Rækkefølge og opdeling af sync→async-migreringen, så længe tests er grønne efter hvert trin.
- Hvilken dyb-lighedssammenligning der bruges (fx `JSON.stringify` af den kanoniske værdi).
- Konkret visuel udformning af "Gemmer…"-indikatoren (følg eksisterende stil).

## Succes måles ved

- `main.log`: 0 × `MAIN BLOCKED` og markant færre `LANGSOM gemning` over en arbejdsdag på 1.6.7.
- I/O-måling (samme metode som diagnosen, 30 s, vindue synligt): SCH main-proces < 10 % af nuværende ~35.500 metadata-ops.
- En ændring på én PC vises på en anden inden for ~2 s (manuel test med to klienter).
- Alle eksisterende tests grønne (`npm test`, `npm run lint`, `npm run build`).
