# Lokal Hub-assistent — udviklingstest, 15. september 2026

Ingen release eller release-zip er bygget til denne prototype. AI-IPC og knappen
er kun aktiveret i udviklerappen. Det eksisterende GuideChat er bevaret.

## Kørsel

- `npm run ai:download`: hent de versionslåste, SHA-256-verificerede Windows
  llama.cpp CPU-binærfiler (b10964) og officielle Qwen3-VL-2B Q4_K_M + FP16
  vision-filer. Download kræver internet, men indeholder ingen hubdata.
- Assets: `%LOCALAPPDATA%\SupplyChainHub\ai`, separat fra repo, data og releases.
- `npm run ai:benchmark`: syntetisk teksttest. Tilføj `-- --vision` for en
  syntetisk farve-/placeringstest. Ingen rigtige teamdata læses af benchmarken.
- `npm run dev`, derefter `npm run electron:dev`. Brug **Ctrl+S** eller AI-knappen.
- Browser-preview alene har ikke native AI-IPC; testen kræver udvikler-Electron,
  men ikke et pakket Electron-build.

## Lokal behandling og adgang

Motoren er en skjult, app-styret hjælpeproces; ingen Ollama-installation, ingen
IT-server. Al inferens-HTTP er fastlåst til `127.0.0.1`, med tilfældig API-nøgle
og afvisning af redirects. Agentværktøjer og web-UI er deaktiveret. Der findes
ingen cloud-fallback eller ekstern inferensadresse. Runtime arver ikke API-nøgler,
HF-tokens, proxy- eller modelindstillinger fra miljøet.

Assistenten må ikke dumpes med hele KV-lageret. Assistentens baggrundsproces validerer den
aktive sessions token, udløb, konto og team/tilknyttet samlehub før læsning og
igen efter AI-svaret. Ingen adgang baseret alene på email fra renderer.

## Guideindeks og responsivitet

Ved login forberedes brugerens tilgængelige, publicerede guides i en skjult,
lavprioriteret Node-hjælpeproces. Der startes ikke en LLM for at indeksere tekst.
Chatpanelet viser forberedelse, klar-status eller fejl med mulighed for at prøve igen.
Et genbrugt afsnits-/søgeordsindeks følger de cachede guideobjekter og kan frigives,
når objekterne ikke længere bruges. Der er
ingen ekstra guide- eller svarfiler på disken og ingen modeltræning.

Guide-filcache er LRU-begrænset (32 MiB cachebudget, filstørrelse gange 2 for afkodning,
maks. 128 filer). Filmetadata kontrolleres før genbrug; ændrede/slettede filer
og watcher-hændelser invaliderer cachen. Sessions, kontostatus, teamtildeling,
guide-adgangsanmodninger og reviewerroller genlæses mellem operationer. En
guide, som ændres under AI-generering, giver en fejl i stedet for et gammelt svar,
også hvis versionsnummeret ikke ændres. Store filer over cachebudgettet genlæses
ved behov; grænsen er ikke et løfte om, at alle virksomhedens guides holdes i RAM.

Alle assistant-dataopslag, adgangskontrol, kildeopslag og guidebillede-læsninger
foregår uden for Electron-main-processen. Et hængende opslag afbrydes efter
20 sekunder med en fejl frem for at blokere vinduet. Stop kan afslutte en
hængende hjælpeproces; almindelig lukning af panelet bevarer en ledig cache.
Logud/hubskift/app-lukning rydder hjælpeprocessen og dens hukommelse. Ved fejl
eller utilgængeligt lager bruges ikke gamle guides/adgangstilladelser som fallback.
Assistenten kræver således verificerbar lageradgang; hubbens øvrige offlinefunktioner
er uændrede. Øvrige modulernes eksisterende synkrone KV-kald er ikke omskrevet.

Kontrollér privat efter genstart: vent på klar-status, spørg to gange efter en kendt
guide, luk/åbn panelet, ret/publicér guiden, tilbagekald adgang, og skift hub under
et svar. Automatisk visuel indeksering/OCR af alle guidebilleder er ikke en del af dette.

- Opgaver for en selv, en navngiven kollega eller hele teamet læses fra
  `shift-assignments` og `shift-roles` i de aktivt tilladte teams. Navn,
  brugernavn og email matches mod godkendte teammedlemmer, ikke hardcodede personer.
  Flere personer med samme navn giver et personvalg; valget og teamadgangen
  valideres igen ved næste forespørgsel. Ukendte navne falder aldrig tilbage til
  ens egen plan. Opgavesvar formateres direkte uden LLM; kommentarer, passwords
  og mails sendes ikke til modellen.
- Hjemmearbejde bruger mønster + datoundtagelse. Godkendt ferie udelades.
  "Supply Chain" kan læse den allerede offentligt synlige tværgående
  hjemmearbejdsoversigt (navn/team/dato), ikke beskyttede data fra andre teams.
  I en samlehub afgrænses oversigten til de teams, personen er tildelt.
- Ferie viser kun godkendte perioder i det tilladte team, uden noter.
- Highscores læses direkte fra de offentligt synlige spil-scoreboards. Nexi Flyer,
  Neon Snake, Brick Break og Endless Dodger har separate vindere pr. sværhedsgrad;
  Tetris har én samlet liste. Sortering, delte førstepladser og manglende scores
  håndteres uden LLM. I normal hub bruges samme tværgående offentlige scoreboard
  som i spillene; i en samlehub kun tildelte teams. Creator-begrænsningen gælder
  administration af scores, ikke spillenes offentlige ranglister.
  "Giv mig en oversigt over highscores" viser de fem understøttede spil.
  Et kort spilnavn, fx "Neon Snake", virker også alene. Korte opfølgninger
  kan skifte spil, sværhedsgrad eller team, mens resten af det seneste score-opslag
  bevares. Kun seneste score-spørgsmål sendes til det direkte lokale opslag,
  ikke svarindhold eller hele samtalen. Nyt emne/ryd chat/hubskift nulstiller
  konteksten, og session/teamadgang valideres på ny ved hver forespørgsel.
- Guideforklaringer: lille leksikalsk retrieval fra udgivne lokale guides samt
  delte guides, som er delt med de tilladte teams. Ingen pending revisions eller
  utilgængelige guides. Midlertidige adgangsbevillinger og cross-team discovery
  er endnu ikke tilsluttet denne pilot.
- Guide- og billedkilder reautoriseres selvstændigt. Kun billeder, der tilhører
  en tilgængelig guide, kan læses. Modellen får højst ét billede på 1024 pixels
  langs længste side og højst 512 billedtokens. Originalen i guiden ændres ikke.
- Frivilligt vedhæftet testbillede behandles lokalt, gemmes ikke i teamlageret.
- Samtaler gemmes kun i komponentens hukommelse; ingen prompt-/svarlog på disk.
  Stop/luk/logud/hubskift stopper hjælpeprocessen. Idle-unload efter to minutter.
- Codex er en separat, hosted assistent: rigtige hubdata må ikke udskrives i
  værktøjsoutput eller UI-snapshots til Codex. Brug syntetiske fixtures til tests;
  brugeren afprøver selv virkelige data i udviklerappen.

## Datoer og RAM

"Næste uge" = næste kalenderuges mandag–søndag i pc'ens lokale tidszone.
"Næste torsdag" = førstkommende torsdag, strengt efter i dag hvis i dag er
torsdag. Alle svar viser konkrete datoer. Ukendte datoer giver et afklaringsspørgsmål,
ikke AI-gæt. Disse planlægningssvar formateres deterministisk uden modelkørsel.
Ingen opgaver registreret betyder ikke, at brugeren har fri.

AI-modellen starter kun ved guideforklaring eller billedanalyse. Billeddelen
indlæses kun ved billedinput. Startgrænse: 2,75 GiB ledig RAM for tekst, 3,5 GiB
for billeder; begge er foreløbige pilotgrænser, ikke en garanti for flydende kørsel.
Efter svar stoppes motoren ved under 0,75 GiB ledigt. 3 CPU-tråde, ét spørgsmål
ad gangen, 4096 konteksttokens og højst 256 svargenereringstokens i appen.

## Målinger på i7-1165G7 / 16 GB / Iris Xe

- Første tekstprøve med vision indlæst: 20,0 s inkl. 6,5 s load, 10,8 tokens/s.
  Modellen lavede en forkert ugefortolkning uden autoritativ periode i prompten.
  Derfor må modellen ikke beregne planlægningsdatoer eller selv forme datasvar.
- Tekst uden vision: 15,8 s inkl. 2,8 s load, 125 tokens, 11,8 tokens/s.
  Datoer blev korrekt gentaget i denne syntetiske prøve. Fri RAM: 4,73 → 2,61 GiB.
- Syntetisk billede: 10,7 s inkl. 5,6 s load, 24 tokens, 10,3 tokens/s.
  Korrekt rød/venstre og blå/højre. Fri RAM: 4,49 → 2,10 GiB.

Det er smoke tests, ikke dokumentation for kvalitet på danske/finske guides,
skærmbilleder med lille tekst eller brugerens normale samtidige arbejdsbelastning.

## Manuel afprøvning

1. Sammenlign "Hvilke opgaver skal jeg lave næste uge?" med din egen vagtplan.
   Prøv også "Hvad skal [kollegas navn] arbejde med i næste uge?" og
   "Vis hele teamets opgaver næste uge". Kontrollér navne, datoer og roller.
   Test dublerede fornavne, fuldt navn, ukendt navn og adgang i en samlehub.
2. Sammenlign "Hvem arbejder hjemme i Supply Chain næste torsdag?" med mønstre,
   undtagelser og godkendt ferie. Svaret betyder **registreret**, ikke sikkert faktisk.
3. Spørg om godkendt ferie, også hen over måned-/årsskifte.
4. Spørg til en kendt guide; klik en kilde og kontrollér version og markeret trin.
5. Aktivér guidebillede, eller vedhæft et testbillede. Små tekster kan være ulæselige;
   modellen skal sige det i stedet for at gætte. Test dansk, engelsk og finsk.
6. Test ESC, Ctrl+S, panelbredde, stop, lukning, logud og hubskift under AI-svar.
7. Hold normale arbejdsprogrammer åbne og vurder reaktionstid/RAM. Der loves ikke
   samme kvalitet eller hastighed som en stor cloudmodel.

## Bevidste begrænsninger før næste fase

Ingen ændring/godkendelse af data, ingen andre brugeres private beskeder eller
personlige noter, ingen passwords/tokens/backups i modelkonteksten. Se
`local-ai-coverage.md` for det udvidede modulkatalog og de konkrete adgangsregler.
Den lokale model kan klassificere ukendte formuleringer til validerede opslag;
den får aldrig adgang til vilkårlige KV-nøgler eller skrivefunktioner. Kalenderuger,
måneder, år, korte datoopfølgninger, tælling og pagination beregnes i applikationen.
Manglende RAM kan forhindre semantisk fortolkning, men direkte opslag virker stadig.
Streaming, automatisk OCR/visuel indeksering af alle guidebilleder, guide-discovery
uden eksisterende adgang, større samtalehukommelse og produktionsdistribution
kræver efterfølgende arbejde. Der loves ikke perfekt forståelse af enhver formulering.

Der må ikke erklæres fuldstændig netværksisolation for hele appen alene ud fra
disse kontroller: appens eksisterende funktioner og maskinens øvrige processer
kan bruge netværk. Før produktion kræves egress-verifikation med syntetiske data
og politik-/licensgennemgang. Ingen firewall-/IT-politikker er ændret.

## Flydende chatvindue

Chatten er en ikke-modal region uden Sheet-overlay, fokuslås eller blokering af
resten af hubben. Standardbredden er 360 px; tandhjulsmenuen tilbyder 360/440/560 px
(Smal/Normal/Bred), billedtilvalg og rydning af samtalen. Højden begrænses til
620 px eller vinduets højde minus 40 px. Headeren har minimér/luk og en lille
guide-statusindikator frem for model-/RAM-/hjælpetekst. Kilder og modeladvarsler
kan foldes ud på det relevante svar. Minimér/Ctrl+S skjuler panelet uden at
afbryde svaret; Esc inde i chatten minimerer og griber ikke hubbens øvrige Esc-kald.

`http://127.0.0.1:5000/assistant-preview.html` viser det faktiske chatkomponent
med en kunstig samtale og et in-memory KV/API-stub. Det importerer ikke App,
bruger ikke desktop-IPC og læser hverken localStorage eller rigtige hubdata.
Preview-bootstrap er DEV-only og er ikke produktionsappen.

Friske, ikke-cachebare data-/rettighedsfiler læses nu én gang pr. operation uden
unødige metadata/read/metadata-rundture. Registeropslag genbruges kun inden for
samme operation og nulstilles derefter; der caches ikke adgang mellem spørgsmål.
Det reducerer I/O, men timeoutfejlen skal fortsat afprøves privat mod den faktiske
netværksdatakilde. Der er ikke læst rigtige guides for at verificere cloud-IP-svaret.

## Kortfattede svar

Almindelige fritekstopslag inkluderer ikke guide-review/historik eller
notifikationskøer; disse kan stadig forespørges eksplicit med samme adgangskontrol.
Entydige, mærkede IPv4-fakta i aktuelle, tilgængelige guides besvares direkte i én
sætning med kildehenvisning uden modelstart. Ny/aktuel og test holdes adskilt;
modstridende værdier kræver præcisering, og ufuldstændige resultatsider bruges ikke
til denne genvej. Ingen adresser eller bestemte guides er hardcodet.
Modelprompten beder normalt om 1–3 korte sætninger uden søgeresultatmetadata.
Hvis modellen fejler, vises korte, tydeligt mærkede guideuddrag frem for hele
søgelisten. Eksplicitte ønsker om fulde lister/detaljer og øvrige moduldata bevares.
Kilder er fortsat tilgængelige og rettigheder/revisioner genkontrolleres før svar.

## Samtalekontekst

Chatten medsender højst de seneste seks afsluttede spørgsmåls emner (maks. 1000
tegn hver), aldrig tidligere svar som autoritative fakta. Konteksten lever kun i
den åbne app og ryddes med samtalen samt ved login-/hubskift. Enkle dato-/spilvalg
og IP-opfølgninger som ”den gamle så?”, ”og test?” og ”hvilken guide?” opløses
uden model. Andre korte opfølgninger kan omskrives til et selvstændigt spørgsmål
af den lokale søgeplanlægger, hvis hukommelsesbeskyttelsen tillader modelstart.
Dette er ikke permanent hukommelse eller garanti for alle samtaleformuleringer.

Alle oplysninger genfindes under aktuelle rettigheder. Gamle IP-værdier kræver
eksplicit mærkning eller en tilgængelig tidligere publiceret guideversion med en
anden værdi end den aktuelle. Test-adressen bruges aldrig som gammel adresse.
Uændrede snapshots giver ikke bevis for en gammel adresse; forskellige gamle
værdier kræver præcisering. Historikopslag bevarer eksisterende revieweradgang,
og ændrede snapshots eller tilbagekaldte roller afviser et igangværende svar.
