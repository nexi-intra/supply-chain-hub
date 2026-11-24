# Nisselegen – design

Status: brainstorm 08.11.2026 med Jacob (Hub 1.6.7); læst af uafhængig bygherre-tjek 08.11.2026 (to spørgsmål – tidszone og hvem må vinde – afgjort af Jacob nedenfor). Bygger oven på juletemaet (`plans/juletema-plan.md`).
Markeringen **(mit valg)** = besluttet af AI'en, ikke aftalt med Jacob – kan rettes.

## Hvorfor

Juletemaet giver stemning; nisselegen giver noget at *gøre*. Hver hverdag i december gemmer en lille nisse sig et nyt
sted i hver hub. Den første, der finder den, får en chokolade af Jacob. Det skal være sjovt, retfærdigt og en del af
overraskelsen: ingen må vide det, før det starter.

**Succes:**
- Hver hverdag kl. 10 får alle en julehilsen: "Nu begynder dagens nisseleg".
- Nissen er hverken for let eller for svær at finde, og den står et andet sted i hver hub.
- Den første, der klikker på nissen, får at vide, at de vandt. Jacob får besked med navn og hub, så han ved, hvem der
  skal have chokolade. Alle andre kan se, at dagens nisse er fundet, og af hvem.

## Mål, ikke-mål og anti-mål

**Mål**
1. Én nisse pr. hub pr. hverdag (mandag–fredag) i december til og med 24.12. I 2026 = 18 dage.
2. 24 gemmesteder i tre sværhedsgrader; det bliver sværere hen mod jul.
3. Samme dag står nissen aldrig samme sted i to hubs (ingen kan "spoile" på tværs af teams).
4. Kun den første finder vinder. Afgørelsen er retfærdig, også hvis to klikker samtidig.
5. Nissejagten starter kl. 10:00 – også kontrolleret mod M:'s ur, så man ikke kan snyde med pc'ens ur.
6. Jacob (skaberen) får besked i klokken og som Windows-notifikation – også fra hubs han ikke selv er med i.
7. Julehilsen hver hverdag kl. 10 på alles skærm. Har man slået juletemaet fra, kan man slå det til fra hilsenen.
8. Dagens låge viser i stedet 24 fakta om (dansk) jul – tjekkede og korrekte.

**Ikke-mål**
- Ingen stikord/tips til hvor nissen er (Jacob: "nej ingen tips").
- Ingen nisse i weekenden.
- Ingen nisse i spil, Lager, Admin eller Manager (findes ikke for alle).
- Andre små lege i appen resten af året: eget projekt bagefter.
- Ingen pointtavle over året (ikke bedt om).

**Anti-mål (ville være en fiasko, selv hvis det virker)**
- Hilsenen eller nissen afbryder en der scanner/tæller/sætter paller på plads.
- Den der møder tidligt har en fordel (derfor kl. 10).
- To får at vide, at de vandt samme nisse.
- Overraskelsen lækker i november: ingen tekst i ændringsloggen/"Nyheder"/app-guide, ingen filer på M: før første fund.
- Nissen gør appen langsommere på det i forvejen langsomme M:.

## Rammer

- Kun med når juletemaet er tændt for brugeren (`useChristmas().active`), og kun i sæsonen. Spil = ingen.
- M: er langsomt (oprettelse af fil 2–15 s, låse via prepared files). Klik på nissen må gerne tage 1–2 s at afgøre.
- 1.6.6-klienter kører samtidig på samme filer. De har ikke legen og ser ingen nisse – det er i orden.
- Hubs = teams; hver har sin mappe. `_shared` (sharedStore, `SHARED_KV_KEYS`) er fælles på tværs af hubs.
- Skaberen identificeres som i dag (`registry.getCreatorEmail(platformRoot)` / rolle `creator`).

## Tilgange (Jacob valgte B)

- **A. Appen skriver fundet direkte** via `kv.compareAndSet` på en fælles nøgle, tid fra pc'ens ur. Mindst kode, men
  kl. 10-reglen kan snydes ved at stille uret frem.
- **B. En lille "dommer" i appens baggrundsdel (valgt).** Ny IPC-kanal i main. Main afgør under lås på det fælles
  lager, hvem der var først, tjekker kl. 10 mod M:'s tid og skriver fundet. Retfærdigt ved samtidige klik, kan ikke
  snydes med uret, og bruger samme sikre lås-/gemme-vej som resten af appen.
- **C. Intern Email til Jacob.** Fravalgt: Email virker kun inden for én hub, og der er ingen sikker "først".

## Sådan virker det (besluttet)

### Hvornår
- **Dansk tid for alle (Jacob, 08.11):** "i dag", hverdag og kl. 10:00 regnes i dansk tid (Europe/Copenhagen) for alle –
  også kolleger i Finland, der starter kl. 11 deres tid. Alle starter på samme øjeblik.
- Hverdage mandag–fredag fra 1.12 til og med 24.12. Appen regner dagene ud hvert år. Dag-nummer `i` = hvilken hverdag
  i december det er (0, 1, 2 …).
- Nissen vises fra kl. 10:00 dansk tid. Før kl. 10 er der ingen nisse. Efter fundet er nissen væk for alle i hubben.
- Nissen bliver til og med dagens slutning, hvis ingen finder den (mit valg).

### Hvem må vinde (Jacob, 08.11)
- Alle i hubben, også Jacob selv.
- Ingen grænse: den samme person kan vinde flere dage.

### Hvor (24 steder) og hvem får hvilket
Steder findes på skærme, alle hubs har, og skal kunne vises i en tom hub (uden data). Listen er et forslag; bygherren
tjekker hvert sted i en tom hub og bytter et sted ud, hvis det ikke altid findes (mit valg):

| Bånd | Steder |
|------|--------|
| Lette (forsiden) | bag Kæde-H-logoet i toppen · i sneen på dagens tavle · i sneen på et modulkort · i hjørnet af "Min uge" · ved "Tilpas dashboard" · i snedriven nederst · hængende på lyskæden mellem pyntet · i "Team status i dag" |
| Mellem (moduler man bruger tit) | Kalender · Vagtplan · Madplan · Email · Team Oversigt · To Do · Guide Bibliotek · Notesbog |
| Svære (lidt længere inde) | Knowledge Base · Link Library · Forbedringer · profilmenuen · hurtig-navigationen (Ctrl+K) · Kalenderens fane "Godkendt" · Vagtplanens fane "Opgaver" · helt nederst på forsiden (skal rulles) |

- Hverdagene deles i tre lige store bånd efter dag-nummer (første tredjedel lette, så mellem, så svære). I 2026: 6+6+6.
- **Fordeling uden spoilers (mit valg):** hubs sorteres efter teamId og får nummer `k`. Inden for et bånd vælges stedet
  som `bånd[(perm[i] + k) mod 8]`, hvor `perm` er en fast blanding pr. år. Så står nissen aldrig samme sted i to hubs
  samme dag (op til 8 hubs), og ingen hub bruger det samme sted to gange.
- Stedet regnes ud på hver pc ud fra år, hub og dag – intet gemmes til det, intet på M:.

### Nissen
- Ca. 22 px, kigger frem bag noget (over en kant, ud af sne, bag et ikon). Står helt stille, ingen glimt. Samme stil og
  farver som juletemaets nisse.
- Det er en rigtig knap (kan nås med tastatur) med navnet "Nisse" (mit valg).
- Klik → "Leder…" mens dommeren afgør (1–2 s).

### Dommeren (main, ny IPC-kanal)
- Renderer sender: år, dato, sted. Main tjekker:
  1. brugeren er logget ind og medlem af den aktive hub;
  2. datoen er en nisse-hverdag, og stedet er netop dagens sted for den hub;
  3. klokken er mindst 10:00 dansk tid – målt på M: (fx tidsstemplet på den fil, der skrives, eller en lille prøvefil), ikke pc'ens ur;
  4. under lås på den fælles nøgle: findes der allerede et fund for (hub, dato)? Ja → svar "allerede fundet af X kl. Y".
     Nej → gem `{ hub, hubName, date, finderEmail, finderName, foundAt }` og svar "du vandt".
- Fundene gemmes i det fælles lager (`_shared`), én nøgle pr. år (mit valg: `nisse-finds-<år>`). Filen oprettes først
  ved årets første fund – dvs. tidligst 1. december kl. 10, så intet lækker i november.

### Det ser folk
- **Vinderen:** dialog "Du fandt dagens nisse! 🍫 Jacob kommer med en chokolade."
- **Næste der klikker (samtidigt):** "Nissen er allerede fundet i dag af Lasse kl. 10:42."
- **Alle andre i hubben (Jacob, 08.11):** pop-up "Nissen er fundet af Lasse kl. 10:42 – du kan stoppe med at lede", så man
  ikke leder videre. Vises som en besked i toppen (ikke en dialog), alle steder undtagen i spil, én gang pr. dag pr. pc –
  også hvis man åbner appen efter fundet. Kun for dem der er med (juletema tændt). Vinderen selv får dialogen i stedet.
  Nissen forsvinder, og forsiden viser linjen "Dagens nisse blev fundet af Lasse kl. 10:42" (mit valg).
- **Jacob:** ny slags notifikation i klokken ("🎅 Lasse fandt nissen i Terminal Configuration & Dispatch kl. 10:42")
  + Windows-notifikation via den eksisterende bro. Han får dem fra alle hubs. Andre får dem ikke.

### Julehilsenen kl. 10
- Hver hverdag i perioden, én gang pr. dag pr. pc (huskes lokalt).
- Kommer kl. 10:00, eller når man åbner appen efter kl. 10.
- Venter, mens man er i et spil eller på en arbejdsskærm (alt andet end forsiden); vises, når man er tilbage på forsiden
  (mit valg – så den aldrig afbryder scanning).
- Tekst: julehilsen + "Nu begynder dagens nisseleg i <hub>. Den første, der finder nissen, får en chokolade."
- Har man slået juletemaet fra: knap "Slå juletema til og vær med". Ellers: "God jagt!"
- Hilsenen vises også for dem med juletemaet slået fra (det er hele pointen), men kun i sæsonen.

### Dagens låge: fakta om jul
- 24 korte fakta, mest om dansk jul (nisser, risalamande og mandelgave, julehjerter – H.C. Andersen, Lucia 13.12,
  kravlenisser, julemærket 1904, Dannebrogs-flagranke, juletræ og dans om træet, pebernødder, gløgg, klippe-klistre,
  m.m.). Dansk + engelsk (finsk/svensk får engelsk som i dag).
- Hver fakta tjekkes mod en pålidelig kilde, før den kommer i appen. Ingen stikord om nissen.

## Overraskelsen
- Ingen linje i ændringsloggen, "Nyheder" eller app-guiden (som juletemaet; `assistantCoverageManifest` markerer
  komponenterne `internal`).
- Ingen filer på M: før første fund. Hilsen, nisse og klokke-notifikation findes kun i sæsonen.

## Tilbage til bygherren
- Præcis placering og "kigger frem"-tegning for hvert af de 24 steder; bytte steder ud der ikke findes i en tom hub.
- Hvordan andre klienter opdager et fund hurtigt (genbrug eksisterende overvågning af lageret; ingen ny tung polling).
- Hvordan M:'s tid måles billigst og robust (kontor-pc'er kan gå lidt forkert).
- Skjult forhåndsvisning for Jacob ligesom juletemaet (forhåndsdato + mulighed for at sætte klokken over 10), uden at
  det kan bruges til at vinde rigtige fund.
- Tests: hverdags-beregning, fordeling (ingen dubletter i en hub, aldrig samme sted to hubs samme dag), dommerens regler
  (før kl. 10, forkert sted, forkert hub, samtidige klik), at intet skrives i november.
