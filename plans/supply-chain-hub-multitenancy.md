# Supply Chain Hub 1.0.0 — multi-tenant evolution af TCD Hub

## Baggrund
TCD Hub bliver til **Supply Chain Hub**: samme kodebase/repo, rullet ud som en almindelig opdatering til
eksisterende klienter. TCD bliver det første "team" i et system hvor flere Supply Chain-teams kan køre hver
deres isolerede kopi af hele appen (egne guides/ferie/mails/alt) under ét fælles login-brand.

**Rollemodel (afklaret):**
- **Creator** (kun ÉN bruger: `jacob.remmer.creator@nexigroup.com`) — kan redigere alt, overalt, i alle
  teams. ENESTE med adgang til Arcade-highscores og Datalagring (inkl. opdaterings-udrulning).
- **Manager** (pr. team) — alt det nuværende Manager Panel + Admin Panel kan i dag, MINUS Arcade og
  Datalagring (flyttes til Creator). `jacob.remmer@nexigroup.com` bliver manager for TCD.
- **User** (pr. team) — uændret.
- Den nuværende globale `'admin'`-rolle udgår som koncept — erstattes af Creator (platform) + Manager (team).

**Branding:** Login-skærm = "Supply Chain Hub". Efter login = teamets eget navn i main Hub-headeren.

**Data:** Ny lagerrod `M:\372000 - SC All Employees\ai Tools\Supply Chain Hub Storage\`. Eksisterende
TCD-data (fra `M:\375750...\TCD HUB STORAGE`) KOPIERES (ikke flyttes — gammel sti bevares urørt som
sikkerhedsnet) ind som TCD-teamets data under den nye rod.


## Teknisk grundfakta (bekræftet ved kodegennemgang)
- `resolveDataDir()` (main.cjs) har allerede en lagdelt kilde-prioritet (env-var → `tcd-hub.config.json`
  ved exe → brugervalgt sti gemt i userData → lokal default). Denne mekanisme er PERFEKT til at pege på ét
  teams isolerede mappe — men den kender i dag kun ÉN sti, ikke "find teamet for denne bruger først".
- `package.json`: internt navn `"name": "tcd-hub"` (bruges af Electron til at udlede `userData`-stien,
  fx `%APPDATA%\tcd-hub`) er ADSKILT fra `productName`/vinduestitel. Vi ændrer KUN `productName` til
  "Supply Chain Hub" og BEHOLDER `"name": "tcd-hub"` uændret — ellers ville eksisterende klienters
  `userData`-mappe (og dermed `storage-config.json`, lokal offline-cache) blive forældreløs ved opdatering.
- `AdminPanel.tsx` (bruger/vagt/sygefravær-administration) og `ManagerPanel.tsx` (permissions, ferie,
  fødselsdage, **games**-fane m. `GameLeaderboardAdmin` = Arcade-highscores, **data-storage**-fane m.
  `DataStorageManager`) er de to eksisterende paneler. De to navngivne faner (`games`, `data-storage`)
  fjernes fra det almindelige Manager Panel og flyttes til et nyt Creator-only panel.
- `UserRole = 'admin' | 'manager' | 'user'` i `userRoles.ts` — udvides/omlægges til at inkludere `'creator'`.
- Selvopdateringssystemet (`electron/updater.cjs`) findes allerede og kan bruges til selve udrulningen af
  Supply Chain Hub-versionen til eksisterende TCD Hub-klienter.

## Åbne tekniske beslutninger jeg foreslår (bekræft/ret gerne)
- **Centralt team-register**: en lille JSON-fil UDEN FOR de enkelte teams' lukkede mapper, direkte under
  den nye lagerrod (fx `Supply Chain Hub Storage\_registry\teams.json` + `user-directory.json`), der
  mapper `email → teamId` og `teamId → { navn, mappenavn, oprettet }`. Login bliver to trin: (1) slå email
  op i det centrale register for at finde teamet, (2) peg appens datalag på DET teams undermappe og log
  ind der som i dag. Uden dette kan appen ikke vide hvilken mappe den skal lede efter brugeren i.
- Migreringen opretter automatisk `TCD`-teamet i registret og udfylder det med alle nuværende TCD-brugere,
  så INGEN eksisterende bruger låses ude når opdateringen lander.

## Seneste afklaringer (denne runde)
1. Den gamle hardcodede admin-email-specialcasing (autogodkendelse ved signup m.m.) skal findes og
   omlægges til Creator-modellen — konkret migreringsopgave, ikke kun "tilføj en rolle".
2. Creators email gemmes som DATA i det centrale register (`creatorEmail`), IKKE hardcodet i kildekoden —
   så rollen kan overdrages uden ny build.
3. Hvert team får en KORT, filsystem-venlig kode som mappenavn (TCD = `TCD`), adskilt fra det fulde
   visningsnavn ("Terminal Configuration & Dispatch") som gemmes separat i registret.
4. Udrulning testes FØRST på én enkelt klient, IKKE bred auto-udrulning med det samme — omfanget
   (login+data+roller ændres på én gang) kræver forsigtighed.
5. Creator-adgangskoden (delt i klartekst i planlægningssamtalen) bør skiftes efter kontoen er oprettet.
6. Bekræftet: 1 bruger = 1 "hjemmeteam" (egen ferie/sygemelding/fødselsdag ligger ét sted). MEN en manager
   kan være ansvarlig for FLERE teams samtidig — se "Flerteams-manager" under Fase 8.

## Fase 1 — Centralt register + to-trins data-opløsning
- [x] Design registerformat (`teams.json`, `user-directory.json`) under den nye lagerrod — `electron/registry.cjs`
- [x] `main.cjs`: ny opslags-funktion der finder team ud fra email FØR `resolveDataDir()` peges på den
      rigtige undermappe — `resolveDataDir()` giver nu platformroden, `switchToTeamDir()` peger storen om
- [x] Login-flow (`Auth.tsx`/App.tsx bootstrap) udvides til at bruge to-trins-opslaget — sker nu øverst i
      `handleSubmit()` for både login og signup (enkelt-team auto-tildeling ved signup, se begrænsning)
- [x] Unit-tests for `registry.cjs` (`electron/registry.test.cjs`, 6 tests) — alle 47 electron-tests + 26
      vitest-tests grønne
- **Kendt begrænsning (bevidst, Fase 1-scope)**: hvis der findes >1 team og en helt ny email prøver at
      oprette sig via signup, vises en fejl i stedet for et team-valg — der er endnu ingen UI til at vælge
      team ved signup. Håndteres når Fase 3 (Creator-modul) gør bruger-oprettelse til noget Creator/manager
      styrer eksplicit, i stedet for åben selvbetjent signup på tværs af flere teams.
- **Bevidst IKKE ændret i denne fase**: den gamle hardcodede admin-email-specialcasing (`ADMIN_EMAIL`/
      `MASTER_ADMIN_PASSWORD_HASH` i `userRoles.ts`) virker stadig UÆNDRET, nu bare efter at teamet er
      løst op og storen peger rigtigt — selve rollemodel-omlægningen til Creator sker i Fase 2.

## Fase 2 — Rollemodel: Creator/Manager/User
- [x] `userRoles.ts`: `UserRole` er nu `'creator' | 'manager' | 'user'`; `getCreatorEmail()` (cachet,
      registerbaseret); ældre lagrede `'admin'`-roller normaliseres til `'manager'`
- [x] Find og omlæg den gamle hardcodede admin-email-specialcasing til den nye Creator-model — `Auth.tsx`s
      master-password-genopretning og signup-autogodkendelse bruger nu `getCreatorEmail()` fra registret
- [x] `AdminPanel.tsx`: adgangstjek rettet fra `hasAdminAccess` til `hasManagerAccess` (enhver manager kan
      nu åbne den — matcher planens "Manager får Admin Panels evner med"); `ManagerPanel.tsx`,
      `OnboardingWizard.tsx`, `ShiftSchedule.tsx`, `TeamOverview.tsx`, `VirtualNotebook.tsx` migreret
- [x] "Creator" fjernet som tildelelig rolle i de almindelige rolle-dropdowns (kun styret via registret)
- [x] Fjern `games`- og `data-storage`-fanerne fra `ManagerPanel.tsx` — gjort i Fase 3 sammen med at
      Creator-panelet blev oprettet, så fanerne aldrig var utilgængelige for nogen undervejs
- [ ] Understøt flerteams-managere (`managedTeams` i registret, kun Creator kan tildele — se Fase 8)
- Verificeret: `npm run build` ren, 47 electron + 26 vitest-tests grønne (commit `13b6542`)

## Fase 3 — Nyt Creator-modul
- [x] Nyt panel ved siden af Manager Panel i main Hub, kun synligt for Creator — `src/views/CreatorPanel.tsx`,
      `'creator'` view-id i `App.tsx`/`appNavigation.ts`, nyt punkt i kommandopaletten (`creatorOnly`)
- [x] Team-oprettelse (navn → opretter mappe + registrerer i teams.json) — manglende
      `registry:create-team` IPC/bridge tilføjet
- [x] Bruger-oprettelse + team-tildeling (genbruger AdminPanels bruger-UI-mønster) — skifter midlertidigt
      til måltets team, skriver brugeren der, skifter altid tilbage til Creators eget team bagefter
- [x] Flytter de udtagne Arcade- og Datalagring-faner herind (flyttet ordret fra `ManagerPanel.tsx`)
- Verificeret: `npm run build` ren, 47 electron + 26 vitest-tests grønne (commit `a378d74`)

## Fase 4 — Branding
- [x] `package.json`/electron-builder: `productName` → "Supply Chain Hub" (INTERNT `name` uændret)
- [x] Login-skærm: "Supply Chain Hub" (`Auth.tsx`, vist før noget team er løst op)
- [x] Main Hub-header: teamets navn (ny `registry:get-current-team` IPC, `Hub.tsx` henter det ved mount)
- [x] Øvrig bruger-vendt "TCD Hub"-tekst omdøbt (kommandopalet, velkomst-mail, What's New, email-skabeloner,
      oversættelser) — konsol-logs/updater-fejlbeskeder bevidst IKKE rørt (interne, ikke bruger-vendte;
      `updater.cjs` udleder allerede exe-navnet dynamisk via `app.getPath('exe')`, så omdøbningen påvirker
      IKKE selvopdaterings-kompatibiliteten)
- Verificeret: `npm run build` ren, 47 electron + 26 vitest-tests grønne (commit `2423999`)

## Fase 5 — Datamigrering
- [x] Kopiér (ikke flyt) `TCD HUB STORAGE` → `Supply Chain Hub Storage\TCD\` (kort mappekode `TCD`, fuldt
      visningsnavn "Terminal Configuration & Dispatch" gemmes separat i registret) — 331 filer/163MB kopieret
- [x] Registrér TCD som team #1, migrér alle eksisterende TCD-brugere ind i user-directory.json — alle 11
      brugere (10 eksisterende + Creator) registreret
- [x] `jacob.remmer@nexigroup.com` → manager (TCD); ny bruger `jacob.remmer.creator@nexigroup.com` → creator
      (email gemmes i registret som `creatorEmail`, ikke hardcodet) — **husk at skifte adgangskoden**
- [x] **Løbende ét-vejs synk under hele testperioden** — `sync-legacy-to-sc-hub.cjs` (ligger i
      `C:\TCD Tools\Supply Chain Hub\scripts\`, IKKE i git-repoet, samme mønster som `kv-scan.cjs` m.fl. i
      den gamle mappe) — testet, virker korrekt (0 filer synkroniseret ved 2. kørsel, da intet var ændret)
- **NY opdagelse under migreringen**: den rigtige `TCD HUB STORAGE` var 510MB, hvoraf `updates/` (304MB) og
  `translation-models/` (42MB) IKKE er team-specifikke — alle teams kører samme app-build, så der skal
  kun være ÉN delt opdateringskanal og ÉT delt sæt sprogmodeller. `main.cjs` retter til at bruge
  `platformRoot` for disse (separat commit `bd32922`, FØR selve datamigreringen) — de to mapper ligger nu
  ved siden af `TCD\` i `Supply Chain Hub Storage\`, ikke inden i den.
- **Kendt begrænsning**: synk-scriptet dækker kun TCD-teamets almindelige KV-nøgler (topniveau .json), IKKE
  `updates/`/`translation-models/`/`Backup/`/`Guides/` — acceptabel begrænsning for den korte testperiode,
  en manuel engangskopi ved endelig udrulning fanger evt. efterslæb her.
- Verificeret: teams.json/platform-config.json/user-directory.json alle korrekte, jacob.remmer's rolle er
  `manager`, Creator-kontoen findes med rolle `creator` og brugernavn `creator`

### Løbende synk under test (nyt, foreslået design)
Problem: mens Jacob tester på den NYE sti, bliver den GAMLE sti (`TCD HUB STORAGE`) stadig brugt af alle
andre hver dag — al rigtig ny ferie/sygemelding/mail/guide osv. lander KUN der. En engangskopi ved starten
af testperioden bliver hurtigt forældet.

**Forslag**: et lille, separat script (samme mønster som de eksisterende `scripts/kv-scan.cjs` m.fl.), IKKE
en del af selve Electron-appen, som Jacob kører/lader køre i baggrunden hele testperioden:
- **Retning: kun GAMMEL → NY, aldrig omvendt.** Den gamle sti må ALDRIG modtage noget fra den nye, så den
  forbliver 100 % uændret og sikker som produktionsdata for resten af organisationen.
- **Pr. nøgle, baseret på filens ændringstidspunkt** (samme teknik som `store.cjs`s eksisterende
  `scanDirectoryAsync`): findes nøglen slet ikke endnu i den nye sti → kopiér den. Findes den i begge, og
  den GAMLE fil er nyere → kopiér (en rigtig bruger har lavet noget nyt). Er den NYE fil nyere → rør IKKE
  ved den (det er Jacobs eget testarbejde, eller en helt ny SC Hub-specifik nøgle som slet ikke findes i
  den gamle sti, fx selve registret) — så Jacobs test-ændringer bliver ALDRIG overskrevet.
- **Kører hvert par minutter** (samme lave frekvens som de andre tværgående ting i Fase 8), ikke konstant —
  det er en baggrundssikkerhed, ikke en realtidsting.
- **Slettede nøgler synkroniseres bevidst IKKE** (sjældent i praksis, og for at undgå ved et uheld at
  slette nye SC Hub-specifikke filer som registret) — tjekkes manuelt lige før endelig udrulning i stedet.
- **Ved endelig udrulning** (Fase 6): kør scriptet én sidste gang, stop det derefter permanent, og FØRST
  DEREFTER sendes opdateringen bredt ud — herefter er den gamle sti frosset/historisk og bruges ikke mere.

## Fase 6 — Sikker udrulning
- [x] Verificér at eksisterende klienters `userData`/lokale config overlever opdateringen uændret —
      `app.setName()` kaldes ALDRIG i `main.cjs`, så `userData`-stien forbliver baseret på `package.json`s
      `name` (uændret "tcd-hub"), helt upåvirket af `productName`-omdøbningen
- [x] Peger den medfølgende `tcd-hub.config.json` (bundlet ved siden af exe'en via electron-builders
      `extraFiles`, højere prioritet end klienternes egen `storage-config.json`) på den NYE
      `Supply Chain Hub Storage`-rod — løser BÅDE "hvordan finder Jacobs testbuild de nye data" OG
      "hvordan bliver alle eksisterende klienter automatisk omdirigeret ved den brede udrulning" medét
      ét greb, uden manuel per-klient-genkonfigurering
- [x] Version bumpet 1.4.3 → **1.5.0** (IKKE 1.0.0 som titlen ellers antyder) — selvopdateringens
      `isNewerVersion()`-tjek kræver semver-orden ABOVE den nuværende produktionsversion, ellers ville
      eksisterende klienter aldrig se denne som en opdatering. "Supply Chain Hub 1.0.0" forbliver
      produkt-/marketingnavnet (`productName`), adskilt fra selve versionsnummeret
- [x] Pakket + deployet til `C:\TCD Tools\Supply Chain Hub\Supply Chain Hub 1.5.0\` (Jacobs egen maskine,
      den ene test-klient) — build ren, 47 electron + 26 vitest-tests grønne, `Supply Chain Hub.exe` +
      korrekt `tcd-hub.config.json` bekræftet til stede
- [ ] **Afventer manuel test af Jacob**: log ind med eksisterende manager-konto OG den nye Creator-konto,
      bekræft login-skærm/Hub-header/Creator Panel/fjernede Arcade-Datalagring-faner ser rigtige ud
- [x] **Rettelser fra 1. testrunde**: "g" i "Manager Panel"-overskriften klippede ud af sin boks (manglende
      `leading-normal`/`pb-1`-fix, rettet i 10 paneler i alt der aldrig fik den etablerede rettelse); Creator
      fjernet fra alle almindelige brugerlister (Manager/Admin Panel, Team Oversigt, ferie-tildeling,
      vagtplan-medarbejderliste) via ny `excludeCreator()`-helper; Creator Panel havde INTET synligt
      indgangspunkt (kun den skjulte Ctrl+K-palet) — ny "Creator Panel"-menupunkt tilføjet i
      brugerprofil-dropdownen. Ombygget og genudrullet til testmappen
- [x] **Rettelser fra 2. testrunde** (efter Jacob oprettede et RIGTIGT andet team "Terminal Return &
      Repair" via Creator Panel og testede videre): Creator Panel-knappen i brugerprofil-dropdownen gjorde
      INTET ved klik (App.tsx's `handleNavigate()` er en eksplicit if/else-kæde uden en `'creator'`-gren —
      rettet); Creators email havde en tastefejl i den migrerede rigtige data (`creater`→`creator`, rettet
      via et midlertidigt script); Fase 8's tre dokumenterede men ALDRIG kodede huller lukket: Ctrl+K
      team-skift for Creator, Team Oversigt på tværs, og Guide Bibliotek-eksistens på tværs (se de
      respektive Fase 8-punkter nedenfor, nu markeret done) — adgangsanmodnings-workflowet for guider er
      BEVIDST stadig ikke bygget (separat, større opgave, ikke eksplicit efterspurgt i denne runde)
- [ ] Kør synk-scriptet én sidste gang og stop det derefter permanent, FØR bred udrulning påbegyndes
- [ ] Udrul bredt via eksisterende selvopdateringssystem, først når enkelt-klient-testen er godkendt

## Fase 7 — Verifikation & udrulning
- [ ] `npm run build` + `npm test`
- [ ] Manuel test: login som Creator, som TCD-manager, som almindelig TCD-bruger
- [ ] `npm run electron:build` + smoke-test + deploy + asar-verifikation
- [ ] git commit

## Fase 8 — Tværgående data på tværs af teams (under diskussion, ikke i gang endnu)
Kræver en NY læse-sti ud over den normale "kun mit eget teams mappe": klienten kender allerede alle teams'
mappenavne via det centrale register (Fase 1), så den kan læse (read-only) specifikke, afgrænsede
KV-nøgler fra ANDRE teams' mapper — ikke hele deres data, kun de udvalgte nøgler nævnt herunder. Da det er
et helt nyt mønster (læs fra flere mapper i stedet for kun sin egen), bør polling-frekvensen for disse
tværgående kort være LAV (et par minutter, ikke sekunder) for ikke at gange netværksbelastning med antal
teams — samme lærdom som med den fejlrettede KV-watcher tidligere.

- [x] **Creator kan skifte team når som helst via kommandopaletten (Ctrl/Cmd+K)** — ikke kun ved login.
      Se "Creator team-skift via Ctrl+K" nedenfor for det fulde design
- [ ] **"Ferie i Supply Chain"-kort i main Hub** (ved siden af "Fri i dag") — viser alle på ferie I DAG på
      tværs af ALLE teams. Selve Feriekalender-VISNINGEN forbliver isoleret pr. team (kun kortet er
      tværgående)
- [ ] **Hjemmearbejde-status** — ny feature, se separat diskussion nedenfor
- [x] **Highscores på tværs** — de 5 spils leaderboards sammenlægges/omrangeres på tværs af alle teams'
      mapper i stedet for at være isoleret pr. team
- [x] **Guide-eksistens på tværs** — man ser at en guide findes i et andet team (titel/kategori, IKKE
      indhold) via en simpel team-vælger i Guide Bibliotek
- [x] **Guide-adgangsanmodning** — kan anmode om adgang til en andet teams guide, en manager i det ejende
      team godkender/afviser (2 dages adgang)
- [x] **Team Oversigt på tværs af Supply Chain** — viser ALLE teams grupperet, med deres brugere, i stedet
      for kun eget team. Se separat diskussion nedenfor

### Hjemmearbejde — designspørgsmål (afklaret)
- Fast mønster (fx "hjemme om mandage og fredage") + mulighed for at melde en enkelt dag anderledes end
  mønstret — INGEN godkendelse krævet (modsat ferie), rent selv-rapporteret.
- Vises TVÆRGÅENDE på tværs af alle Supply Chain-teams (samme princip som ferie-kortet).
- **Ny beslutning**: "Feriekalender" omdøbes til **"Kalender"** og bliver den fælles skærm til BÅDE
  ferie/fravær (uændret godkendelses-flow) OG hjemme/kontor-status (intet godkendelses-flow) — samme
  kalender-gitter viser begge dele farvekodet pr. dag, men anmodnings-/mønster-dialogerne forbliver to
  adskilte indgange, så det er tydeligt for brugeren at ferie skal godkendes og hjemme/kontor ikke skal.
  Omdøbningen rammer Hub-modulkort, view-header, navigation, command palette, oversættelser — mange
  små steder, men velkendt/overskueligt arbejde (samme type som Hønseinvasionen→Chickeninvasion tidligere).

### Guide-adgangsanmodning — afklaret
- Godkendelse giver adgang i **2 dage** (starter med det, kan justeres senere)
- Guide Library får en **team-vælger**: vælg et andet team, se KUN dét teams guide-titler/kategorier
  (ikke indhold) — bekræftet design

### Madplan — anden slags tværgående data (afklaret)
I modsætning til ferie/hjemmearbejde/highscores/guider (som er "ejet af ét team, men synligt på tværs")
skal Madplanen være ÉN ENKELT delt madplan for hele Supply Chain (alle spiser i samme kantine) — ikke
ejet af noget bestemt team. Skal derfor ligge i selve det centrale/delte område (samme sted som
team-registret), ikke inde i en enkelt teams lukkede mappe, så alle teams' klienter læser/skriver samme fil.
- **Redigering**: ALLE brugere kan redigere den, uanset rolle/team (matcher nuværende adfærd i TCD Hub,
  bare nu delt af flere teams i stedet for ét).

### Flerteams-manager, fx chefer for to afdelinger (afklaret)
Nogle managere (fx Johnny: TCD + Terminal Returns & Repair) er reelt chef for FLERE teams samtidig — ikke
kun ét. Adskiller to begreber der før var ét:
- **Hjemmeteam**: hvor personens EGEN medarbejderdata ligger (egen ferie/sygemelding/fødselsdag) — stadig
  præcis ét team pr. person, uændret for alle.
- **`managedTeams`**: listen af teams personen er MANAGER for. For de fleste = kun deres eget hjemmeteam
  (ingen synlig ændring). For en flerteams-manager = flere team-koder, fx `['TCD', 'TRR']`. Kun Creator kan
  tildele ekstra teams til en manager (sikkerhedsgrænse — ellers kunne en manager selv give sig adgang til
  andre teams' data).
- **Manager Panel bliver flerteams-bevidst**: når `managedTeams.length > 1`, sammenflettes fanerne
  (permissions/sygefravær/ferie-anmodninger/ferie-overblik/fødselsdage) på tværs af ALLE personens teams i
  ét samlet view, hver linje tagget med et lille team-badge. Godkend/afvis-handlinger skriver tilbage til
  den KORREKTE ejer-teammappe (samme mønster som cross-team-læsning i Fase 8, blot med skrive-adgang
  begrænset til de teams personen faktisk administrerer).
- **Forskel fra Creators team-vælger**: Creator SKIFTER kontekst (fejlsøger ét team ad gangen), mens en
  flerteams-manager får et PERMANENT sammenflettet view af sine teams samtidigt — det er en fast del af
  jobbet, ikke fejlsøgning.
- **Upåvirket**: Hub-niveau tværgående kort ("Ferie i Supply Chain", hjemmearbejde-kort, highscores) er
  stadig "alle teams, for alle brugere" uanset hvem der er manager for hvad — kun Manager Panelets EGNE
  faner er scopet til `managedTeams`.

### Team Oversigt på tværs af Supply Chain (afklaret)
`TeamOverview.tsx` viser i dag en flad liste af `users`-nøglen fra EGET team (intet teams-koncept endnu,
giver mening når der kun findes ét team). Udvides til at læse `users` fra ALLE teams' mapper (samme
cross-team-læse-mønster som resten af Fase 8, via det centrale register) og gruppere resultatet PR. TEAM
i stedet for én flad liste:
- Eget team vist udfoldet/øverst som i dag; andre teams vist som sammenklappelige sektioner (accordion) —
  så man hurtigt kan folde dem ud og få et overblik over hele Supply Chain uden at klikke sig ind ét team
  ad gangen.
- Ingen særlig adgangsbegrænsning — matcher nuværende adfærd (åben for alle, ikke kun managere).
- Lav opdateringsfrekvens er fin (en medarbejderliste ændrer sig sjældent) — kan nøjes med at hente frisk
  data når man ÅBNER siden, ingen løbende polling nødvendig her.

### Creator team-skift via Ctrl+K (afklaret)
I stedet for KUN at vælge team ved login, skal Creator også kunne skifte team når som helst midt i en
kørende session — via den eksisterende kommandopalet (`CommandPalette.tsx`, åbnes med Ctrl/Cmd+K), så
Creator nemt kan bevæge sig mellem hubs uden at skulle logge ud og ind igen.
- Kun synligt/tilføjet for Creator (samme rolle-tjek som resten af Creator-funktionerne) — almindelige
  managere/brugere ser paletten uændret.
- Palettens liste udvides med ét punkt pr. registreret team (hentet via `electronRegistry.listTeams()`),
  fx "Skift til team: Terminal Returns & Repair". Vælges et team, kaldes samme
  `electronRegistry.switchToTeam(folderName)`-mekanisme som allerede bruges ved login (Fase 1) — genbrug,
  ikke en ny separat mekanisme.
- Efter et team-skift skal den viste side naturligt vende tilbage til Hub (samme team-kontekst er nu en
  anden), da alle allerede-indlæste komponenter ellers ville vise data fra det GAMLE team indtil de selv
  genindlæser.

## Fase 9 — Reelt tværgående data + Kalender-omdøbning + Hjemmearbejde (runde 3)
Brugerens feedback efter runde 2-test: Madplan er IKKE reelt platform-delt (stadig team-scoped), "Fri i dag"/
"Syge i dag" mangler deres tværgående søsterkort ("Fri i Supply Chain"/"Syge i Supply Chain"), "Feriekalender"
er ikke omdøbt til "Kalender" som aftalt, og hjemmearbejde-mønster-featuren (se "Hjemmearbejde —
designspørgsmål" og "Madplan — anden slags tværgående data" ovenfor) er slet ikke bygget endnu.

- [x] **Fase 9.1 — Madplan bliver RIGTIGT platform-delt** (ikke kun team-scoped som i dag): ny `sharedStore`
      i main.cjs pegende på `<platformRoot>/_shared/`, `kv:get/set/update/delete`-handlers ruter nøglen
      `meal-plan-weeks` dertil i stedet for det aktive teams store, egen watcher/broadcast. Selv-helbredende
      étgangs-migrering ved opstart (kopierer en evt. eksisterende team-scoped madplan over, hvis den delte
      endnu ikke findes — dækker den RIGTIGE TCD-data der allerede findes). INGEN frontend-ændring
      nødvendig (MealPlan.tsx/Hub.tsx bruger fortsat bare `window.kv.get/set` uændret).
- [x] **Fase 9.2 — Cross-team Hub-kort**: "Fri i Supply Chain" (under "Fri i dag") + "Syge i Supply Chain"
      (under "Syge i dag") — samme cross-team-read-mønster som Team Oversigt/Guide Bibliotek (Fase 8),
      anvendt på `vacation-entries`/`sick-leave-entries`. Kun vist når der findes >1 team, opdateres hvert
      5. minut (samme lave frekvens som resten af Fase 8's tværgående kort).
- [x] **Fase 9.3 — "Feriekalender" omdøbes til "Kalender"**: modul-id er allerede `'calendar'` internt
      (ingen navigations-/routing-ændring nødvendig) — kun VISNINGSTEKSTER ændres: `t.hub.modules.calendar`,
      `t.hub.descriptions.calendar` (da+en), og VacationCalendar.tsx's hardcodede `<h1>Feriekalender</h1>`.
- [x] **Fase 9.4 — Hjemmearbejde-funktion**: nyt KV `home-office-patterns` (Record<email, ugedage[]>, 1=
      mandag..5=fredag) + `home-office-exceptions` (enkelt-dags-undtagelser, INGEN godkendelse krævet,
      rent selv-rapporteret). Ny `HomeOfficeDialog.tsx` (samme mønster som `SingleDayOffDialog.tsx`) tilføjet
      i Kalender-modulets knap-række. Kalendergitteret viser hjemmearbejde-status pr. dag (kompakt
      hus-ikon-badge med antal, ikke fulde navne som ferie — for at spare plads i den lille dag-celle).
- [x] **Fase 9.5 — Cross-team "Hjemmearbejde i Supply Chain"-kort** (under "Mad i dag") — afhænger af 9.4's
      datamodel, samme cross-team-read-mønster.
- [x] **Fase 9.6 — Byg, test, redeploy, opdatér plan (begge kopier), commit** — `npm run build`+`npm test`
      grønne (47 electron + 26 vitest), pakket + redeployet til `Supply Chain Hub 1.5.0`-testmappen.

### Fase 9 runde 2 (efter brugertest af runde 1's kort)
- [x] Krydsteam-kortenes tomme-tilstand omformuleret fra "Ingen andre teams har fri/er syge/arbejder
      hjemme" (læste som om hele TEAMET var væk) til "Ingen PERSONER fra andre teams har fri/..." (da).
      EN-teksterne sagde allerede korrekt "No one in other teams...", kun DA skulle rettes.
- [x] Team-tag i parentes ved cross-team-kort-rækker (Hub.tsx) ændret fra teamets FULDE navn (fx
      "Terminal Configuration & Dispatch") til den korte `folderName`-kode (fx "TCD") — feltet omdøbt
      `teamName`→`teamCode` for klarhed.
- [x] **Highscores på tværs implementeret**: ny delt `src/hooks/useCrossTeamLeaderboard.ts`
      (`useCrossTeamLeaderboard(key)` henter alle andre teams' rå leaderboard+users én gang ved mount;
      `mergeFlatLeaderboard`/`mergeNestedLeaderboard` fletter dem med eget teams data, sorteret ét samlet
      efter score, hver entry beriget med `displayName` + valgfri `teamCode`). Anvendt i alle 5 spil
      (Tetris = flad, Brick Break/Neon Snake/Nexi Flyer/Endless Dodger = pr. sværhedsgrad): erstatter kun
      selve `getSortedBoard()`/tilsvarende + rendering (navn+teamkode-tag, ny React-key
      `${teamCode||'own'}-${id}` i stedet for email da to teams i teorien kunne kollidere) — SKRIVNING af
      nye scores røres IKKE, forbliver 100% team-scoped som før (kun læsning/visning er tværgående).
      `GameLeaderboardAdmin.tsx` (Creator Panel-administration) er BEVIDST IKKE ændret — den redigerer/
      sletter kun eget teams rå KV-data, hvilket stadig er korrekt afgrænset adfærd.

### Fase 9 runde 3 (kritisk bug + guide-adgangsanmodning)
- [x] **KRITISK BUG rettet: nyoprettede brugere blev ALDRIG tilføjet til det centrale register.**
      `ManagerPanel.tsx`s `handleCreateUser()` + `handleSaveUserName()` (e-mail-skift) og
      `AdminPanel.tsx`s `handleSaveEmployee()` (nyoprettelse + e-mail-skift) skrev alle direkte til
      `users`-KV UDEN at kalde `window.electronRegistry.assignUser(email, currentTeam.teamId)` først —
      kun `CreatorPanel.tsx`s tvær-team bruger-oprettelse og `Auth.tsx`s signup gjorde det korrekt allerede.
      Konsekvens: enhver bruger oprettet af en manager/admin (ikke via selv-signup) kunne ALDRIG logge ind
      ("Denne email er ikke tilknyttet noget team"). Rettet alle 3 steder — kalder nu `getCurrentTeam()` +
      `assignUser()` FØR selve KV-skrivningen, samme rækkefølge som de allerede-korrekte steder.
      Ramte reelt Christian Frederiksen (oprettet i Terminal Return & Repair) — rettet direkte i den
      RIGTIGE M:-registreringsdata via et midlertidigt script (`registry.assignUserToTeam()`, kørt og
      slettet igen, samme engangs-script-mønster som Fase 5/Creator-email-fixet).
- [x] **Guide-adgangsanmodning bygget** (den sidste udestående Fase 8-brik): ny KV `guide-access-requests`
      (array), gemt i den EJENDE teams egen store (så deres manager ser den som en helt normal del af eget
      team). Ny snæver tværgående IPC `registry:submit-guide-access-request` (ikke en generel "skriv
      hvad-som-helst"-mekanisme som `read-team-key` er for læsning — kun ét formål: anmod om
      guide-adgang). `GuideLibrary.tsx`s andet-team-visning har nu en "Anmod om adgang"-knap pr. guide;
      status (afventer/godkendt/afvist) beregnes fra nyeste anmodning, en godkendt der er UDLØBET
      (>2 dage) tæller som "ingen anmodning" (kan anmodes igen). Godkendt+gyldig adgang åbner den RIGTIGE
      `GuideViewer` med fuldt guide-indhold (ikke kun titel/kategori) — genbruger komponenten uændret, men
      med `onEdit` betinget fjernet for fremmede guides (ellers kunne man ved et uheld "redigere" og gemme
      en anden teams guide ind i sit eget bibliotek). `ManagerPanel.tsx` fik en ny fane "Guide-adgang" til
      godkend/afvis af afventende anmodninger fra andre teams. KENDT BEGRÆNSNING (ikke løst denne runde):
      billeder i en godkendt fremmed guide indlæses IKKE (fileStorage.ts's billed-opslag er team-scoped via
      `window.kv`, ikke tvær-team) — kun tekstindhold virker garanteret.

### Fase 9 runde 4 (guide-adgangsanmodning: to bugs fra rigtig brugertest)
- [x] **BUG: eget team optrådte som en "andet team"-fane i Guide Bibliotek.** `renderTeamTabs()` viste ALLE
      registrerede teams uden at filtrere det AKTIVE team fra — så en TCD-bruger kunne trykke på
      "Terminal Configuration & Dispatch" (sit eget team, vist som "andet team") og "anmode om adgang" til
      sine egne guides, hvilket er meningsløst (adgang findes jo allerede). Bekræftet reelt sket: Jacobs
      egen bruger (`jacob.remmer@nexigroup.com`) havde et rigtigt selv-anmodnings-spor i de rigtige data.
      Rettet: `listTeams()`+`getCurrentTeam()` hentes sammen, `teams`-state filtreres til KUN andre teams,
      før den bruges i fanerne (samme mønster som Hub.tsx/TeamOverview.tsx allerede gjorde korrekt).
- [x] **Undersøgt: "TCD-manageren fik ingen anmodning at godkende" — data var FAKTISK intakt** (bekræftet
      ved direkte opslag i den rigtige M:-data: Christian Frederiksens anmodning om "Userguide N950" LÅ
      der korrekt, status "pending", sammen med to andre — inkl. Jacobs eget selv-anmodnings-spor fra
      bug'en ovenfor). Selvom roden til brugerens oplevelse ikke kunne bekræftes 100 % (mest sandsynligt:
      Manager Panel blev tjekket før pollingen nåede at opdatere, eller på den forrige build), blev en
      reel, latent risiko fjernet defensivt: `ManagerPanel.tsx`s `guideAccessRequests` brugte `useKV`, hvis
      "skriv default-værdi hvis nøglen er undefined"-adfærd i teorien kan overskrive en ANDEN klients
      lige-indsendte tværgående anmodning med et tomt array, hvis lokal cache/timing rammer uheldigt.
      Ændret til samme manuelle load-ved-mount-mønster (`loadGuideAccessRequests()`) som resten af filens
      øvrige lister (brugere/sygemeldinger/ferie/fødselsdage) allerede bruger — ingen auto-skriv-tilbage,
      genindlæses eksplicit efter godkend/afvis. Ingen data gik tabt eller blev rettet manuelt denne gang.

