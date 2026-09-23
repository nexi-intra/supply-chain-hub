# Supply Chain Hub

En fælles platform for Supply Chain-organisationens teams med guides, feriekalender, vagtplanlægning, projekter, intern kommunikation og mange andre teamværktøjer. Hvert team har sit eget dataområde, mens udvalgte funktioner som madplan og delte guides kan deles på tværs af teams.

Appen understøtter tre roller (**Admin**, **Manager**, **Bruger**), to sprog (**Dansk**/**Engelsk**) og både **lyst** og **mørkt** tema.

> **Kompatibilitet:** Det interne pakkenavn (`tcd-hub`), app-id'et (`com.nexigroup.tcdhub`) og miljøvariablen `TCD_HUB_DATA_DIR` er bevaret for at gøre den eksisterende TCD Hub 1.4.3 → Supply Chain Hub-opdatering og lokale brugerdata kompatible. Fra version 1.5.1 hedder den medfølgende konfigurationsfil `supply-chan-hub.config`; ældre `tcd-hub.config.json` læses fortsat som fallback.

## 📑 Indhold

- [Installation og kørsel](#-installation-og-kørsel)
- [Datalagring, opdatering og backup](#-datalagring-opdatering-og-backup)
- [Login og adgang](#-login-og-adgang)
- [Gennemgående funktioner](#-gennemgående-funktioner)
- [Moduler](#-moduler)
  - [Hub (Dashboard)](#hub-dashboard)
  - [Feriekalender](#feriekalender)
  - [Vagtplan](#vagtplan)
  - [Team Oversigt](#team-oversigt)
  - [Projekter](#projekter)
  - [Email System](#email-system)
  - [Guide Bibliotek](#guide-bibliotek)
  - [Virtuel Notesbog](#virtuel-notesbog)
  - [Madplan](#madplan)
  - [Theme Builder](#theme-builder)
  - [Manager Panel](#manager-panel)
  - [Admin Panel](#admin-panel)
- [Email notifikationer](#-email-notifikationer)
- [Roller og adgang](#-roller-og-adgang)
- [Administrator](#-administrator)
- [License](#-license)

## � Installation og kørsel

Appen er en selvstændig React-app uden eksterne backend-afhængigheder. I browseren gemmes data lokalt (localStorage); i desktop-appen gemmes data som filer i en **datamappe, der kan deles på et netværksdrev**, så flere computere arbejder på de samme data.

**Krav (kun til at bygge):** [Node.js](https://nodejs.org/) 20 eller nyere.

### Kør i browseren (udvikling)

```bash
npm install
npm run dev
```

Åbn derefter http://localhost:5000 i din browser.

### Kør som desktop-app (udvikling)

```bash
npm install
npm run electron:dev
```

### Byg desktop-appen til Windows

```bash
npm install
npm run electron:build
```

Resultatet er `release/Supply Chain Hub-<version>-win.zip`. Pak den ud, og kør **Supply Chain Hub.exe** fra mappen — appen starter på få sekunder.

> **Undgå portable .exe'en** (`npm run electron:build:portable`): den udpakker hele appen ved *hvert* opstart og er derfor meget langsom at åbne.

### Udrulning til flere computere med fælles data

Sådan sættes appen op på maskiner, der deler samme platform via et netværksdrev:

1. **Opret en platformrod på det fælles drev**, fx `\\SERVER\Faelles\supply-chain-hub`, og giv brugerne de nødvendige rettigheder. Appen opretter `_registry`, `_shared` og teammapper under denne rod.
2. **Kopiér den udpakkede app-mappe** (fra ZIP'en) til hver enkelt computer — kør **ikke** .exe'en direkte fra netværksdrevet, det gør opstarten langsom.
3. **Læg en fil ved navn `supply-chan-hub.config` ved siden af `Supply Chain Hub.exe`** på hver computer med indholdet:

```json
{
  "dataDir": "\\\\SERVER\\Faelles\\supply-chain-hub"
}
```

4. Start appen. Alle klienter læser og skriver nu i samme mappe, og ændringer fra én klient vises automatisk hos de andre inden for få sekunder.

> **Tip:** Datamappen kan også vælges direkte i appen — se [Datalagring, opdatering og backup](#-datalagring-opdatering-og-backup). Config-filen er mest til IT-styrede opsætninger.

**Noter:**
- Uden config-fil eller mappevalg gemmer appen data lokalt i brugerens profil (fungerer stadig, bare ikke delt).
- Datamappens sti kan også sættes med miljøvariablen `TCD_HUB_DATA_DIR` (har forrang over config-filen).
- Tag backup af datamappen som enhver anden mappe på drevet — det er hele appens database.

## 💾 Datalagring, opdatering og backup

Teamdata (vagtplan, ferie, brugere, projekter, noter osv.) gemmes i teamets egen mappe. Platformregistret ligger i `_registry`, og data som deles mellem teams ligger i `_shared`.

- **Desktop-appen gemmer data som krypterede filer under platformroden.** Peger du appen på den samme platformrod, finder den brugerens team og de korrekte data automatisk — **du mister intet ved at opdatere appen**.
- **Vælg mappen direkte i appen:** Manager Panel → fanen **Datalagring** → “Vælg datamappe…”. Eksisterende data kopieres automatisk med over, og valget huskes på tværs af app-versioner.
- **Opdatering til en ny version:** Pak den nye ZIP ud og start appen — den læser samme datamappe som før. Al historik følger med, helt uden manuelle skridt.
- **Backup:** Under Datalagring kan alt eksporteres som **én fil** (“Eksportér backup”) og genskabes igen (“Importér backup”). Backup-filen bruges også til at flytte data fra browser-udgaven til desktop-appen.
- **Netværksstabilitet (fra 1.2.1):** Midlertidige SMB-læsefejl genprøves og må aldrig fortolkes som manglende data. Skriveoperationer genprøves ved kortvarige fillåse, så klienter ikke nulstiller hele datasæt eller efterlader aktive `.tmp`-filer.

### Automatiske app-opdateringer (fra version 1.2.0)

Appen kan opdatere sig selv via den fælles datamappe — **helt uden installation eller admin-rettigheder**:

1. **Publicering:** En manager bygger den nye version (`npm run electron:build`) og publicerer zip-filen fra appen: Manager Panel → **Datalagring** → **App-opdateringer** → “Vælg ny app-pakke (.zip)…” → udfyld version og release-noter → “Publicér opdatering”. Zip'en kopieres til `updates/` under platformroden sammen med et manifest (version, sha256-checksum, noter).
2. **Klienterne opdager det selv:** Alle åbne apps tjekker manifestet ved opstart og derefter hvert 15. minut. Er der en nyere version, får brugeren et vindue op med release-noterne og knappen **“Opdater nu”**.
3. **Installation:** Zip'en kopieres til lokal disk, checksummen verificeres, filerne pakkes ud, og et lille script venter på at appen lukker, kopierer de nye filer over den lokale appmappe (fx `C:\TCD TOOLS\...`) og genstarter appen automatisk. Data røres ikke — den ligger i datamappen.

> Opdateringen kræver kun skriveadgang til brugerens egen appmappe — ingen administrator-rettigheder.

### Hurtige delta-opdateringer (fra version 1.3.0)

Opdateringer overfører kun det, der reelt har ændret sig:

- Ved publicering udpakkes pakken til `updates/<version>/` i den fælles datamappe, og der skrives et **filindeks med SHA256 for hver fil**.
- Klienten sammenligner indekset med sin egen installation og henter **udelukkende de filer, der afviger**. Electron-runtime (dll'er, `.pak`-filer m.m.) er identisk mellem versioner og springes derfor helt over.
- Filer, som den nye version ikke længere indeholder, ryddes op ved genstart.
- Selve app-koden er samlet i `app.asar` på ca. **1,6 MB**, fordi renderer-koden bundles af Vite, og main-processen kun bruger Node's indbyggede moduler. En typisk opdatering flytter derfor få megabyte i stedet for hele pakken.

Zip-filen bevares i `updates/`, så klienter fra før 1.3.0 stadig kan opdatere.

**Sikkerhed:**
- Alle datafiler på disken er **krypterede** (AES-256-GCM), så indholdet ikke kan læses direkte af alle med adgang til mappen.
- Adgangskoder gemmes **aldrig i klartekst** — de gemmes som PBKDF2-hash med salt. Eksisterende konti opgraderes automatisk ved næste login.

## �🔐 Login og adgang

- **Log ind** med email og adgangskode.
- **Opret konto** med fulde navn, email, telefonnummer og adgangskode (min. 6 tegn).
- **Godkendelsesflow** — nye konti skal godkendes af en manager/admin, før der kan logges ind. Managere får automatisk en notifikation ved nye anmodninger.
- **Husk mig** (fra 1.2.0) — markeres “Husk mig på denne computer” ved login, logges man automatisk ind, når appen åbnes. Tokenet gemmes kun lokalt på den enkelte computer (aldrig i den fælles datamappe), så hver maskine husker sin egen bruger. Ved manuelt log ud glemmes maskinen igen, og slettede/afviste brugere afvises altid ved opstart.
- Nye brugere får som udgangspunkt rollen **Bruger**; roller kan efterfølgende tildeles af en admin.
- Adgang til funktioner styres af rollebaserede rettigheder (admin / manager / bruger).

## 🎨 Gennemgående funktioner

Følgende funktioner er tilgængelige på tværs af hele appen (typisk øverst til højre i alle moduler):

- **Sprogskift** — Skift mellem dansk og engelsk. Al tekst, labels, datoer og beskeder opdateres med det samme. Valget huskes.
- **Temaskift** — Skift mellem lyst og mørkt tema. Valget huskes på tværs af sessioner.
- **Brugerprofil** — Dropdown-menu med:
  - Visning af kontooplysninger.
  - Redigering af telefonnummer.
  - Ændring af adgangskode (kræver bekræftelse af nuværende kode).
  - Genvej til Admin Panel (kun for admins).
  - Log ud.
- **Tastaturgenveje** — ESC lukker moduler/dialoger, piletaster navigerer i kalendere.
- **Konsistente medarbejderfarver** — Hver medarbejder har en fast farve, der bruges ens i kalender, vagtplan og oversigter.

## 🧩 Moduler

### Hub (Dashboard)

Central startside med overblik over dagen og genveje til alle moduler.

- Navigationskort til alle moduler med ikon og beskrivelse.
- **Dagens vagter** — Se hvem der er på vagt i dag med rolle (farvekodet) og eventuelle kommentarer. Medarbejdere på ferie eller sygemeldt filtreres automatisk fra.
- **Fri i dag** — Liste over medarbejdere på godkendt ferie eller enkelt fridag.
- **Syge i dag** — Liste over medarbejdere med godkendt sygemelding i dag.
- **Dagens måltid** — Viser dagens ret fra madplanen.
- **Managere/admins:** genvej til email notifikationer med badge for ulæste, tæller for afventende godkendelser (opdateres løbende), samt hurtig tildeling og kommentarer til dagens vagter.

### Feriekalender

Planlæg og administrer ferie med godkendelsesworkflow.

- Månedskalender med navigation via dropdowns eller piletaster.
- Visuelle markeringer for **godkendt ferie**, **afventende anmodninger**, weekender, danske helligdage (beregnes automatisk for alle år) og fødselsdage.
- **Anmod om ferie** — Vælg start- og slutdato samt valgfrie noter. Sender automatisk en notifikation til managere.
- **Anmod om en enkelt fridag** — Vælg en enkelt dag (weekender tillades ikke).
- **Annuller egne anmodninger** — Fjern afventende/godkendte anmodninger; managere notificeres.
- **Managere/admins:** se, rediger, godkend eller afvis hele teamets anmodninger.

### Vagtplan

Administrer daglige vagttildelinger og koordinér dækning.

- Kalenderbaseret overblik pr. måned.
- **Åbner automatisk på nuværende uge** — skemaet scroller selv ned til ugen i dag, og "Gå til i dag"-knappen hopper tilbage når som helst.
- Se tildelinger pr. dag med medarbejder og opgave — **opgaverne vises i den farve, de fik ved oprettelsen**, så skemaet er nemt at aflæse.
- **Managere/admins:** opret, rediger og slet vagttildelinger (medarbejder, opgave, dato, kommentar), tildel opgaver for hele uger, samt opret og slet **opgaver** med egen farve.
- Integreret visning af sygemeldinger, ferie, fødselsdage og danske helligdage direkte i kalenderen for nem planlægning af dækning.

### Team Oversigt

Medarbejderkatalog med kontaktoplysninger.

- Liste over alle registrerede teammedlemmer.
- Kort med navn, email (klikbar), telefon (klikbar på mobil), rolle-badge og avatar med initialer.
- Farvekodning pr. medarbejder på tværs af appen.

### Projekter

Samarbejde og opgavesporing på tværs af teamet.

- **Opret projekt** med titel og beskrivelse; status sættes automatisk til "Åben".
- **Overblik** over alle projekter med status-badge (Åben / I gang / Fuldført), opretter og oprettelsesdato.
- **Filtrér** (alle / mine / uden deltagere) og **sortér** (nyeste/ældste).
- **Søg** i projekttitler og beskrivelser.
- **Deltag i** eller **forlad** et projekt.
- **Opretter kan:** ændre status, administrere deltagere og slette projektet.

### Email System

Intern beskedplatform med indbakke, mapper og filtre.

- **Indbakke** med ulæste markeret; åbn beskeder i fuld visning.
- **Skriv ny email** — vælg modtager, emne og besked.
- **Sendt** — overblik over egne sendte beskeder.
- **Mapper** — opret, omdøb, farvelæg og slet egne mapper; flyt emails mellem mapper.
- **Søg og filtrér** — fritekstsøgning samt filtre for dato og afsender.
- **Marker som læst** og **slet** emails.
- **Managere:** særlig fane med afventende ferieanmodninger og hurtig godkendelse.

### Guide Bibliotek

Videnbase med kategoriserede procedurer og dokumentation.

- **Gennemse guides** i kort med titel, kategori (farvekodet), tags, opdateringsdato og indholds-preview.
- **Søg** i titel, indhold og tags samt **filtrér** på kategori (Procedurer, Teknisk, HR, Sikkerhed, Generel + egne).
- **Vis fuld guide** i appen. For Word-guides med originalt layout vises en sideopdelt PDF af den uploadede DOCX direkte i guiden; DOCX kan stadig hentes og redigeres i Word.
- **Import af originalt Word-layout** bruger lokal LibreOffice til at danne PDF ved indsendelse til review. Installer LibreOffice på forfatterens Windows-pc (fx `winget install --id TheDocumentFoundation.LibreOffice --exact`) eller anbring den portable installation i `%LOCALAPPDATA%\TCD Hub\libreoffice`. Læsere behøver ikke LibreOffice, når PDF'en er gemt. Ældre guides uden PDF kan vises via lokal konvertering ved første åbning på en pc med LibreOffice.
- **AI-chatassistent** — stil spørgsmål og få svar baseret på de gemte guides, med henvisning til relevante guides.
- **Managere/admins:** opret, rediger og slet guides (titel, kategori, indhold, tags, Word-upload) samt administrere kategorier.

### Virtuel Notesbog

Delte og personlige noter til samarbejde og dokumentation.

- **Delte noter** synlige for hele teamet og **personlige noter** kun for dig selv.
- **Opret note** med titel, indhold og valg af synlighed (delt/personlig).
- **Søg** i noter i den aktive fane.
- **Rediger og slet** egne noter (admins kan administrere alle).
- **Redigeringsattribuering** — se "Senest redigeret af" med tidspunkt.
- **Notifikationer** når en delt note, du har oprettet, redigeres af andre.

### Madplan

Ugentlig madplanlægning til pauser.

- **Ugenavigation** frem og tilbage med visning af ugenummer og år.
- Indtast ret/menu for hver hverdag (mandag–fredag).
- **Gem ugemenu** og se tidligere/kommende ugers menuer.

### Theme Builder

Opret og tilpas visuelle temaer.

- **Opret eget tema** med navn og op til 19 farveegenskaber (baggrund, tekst, kort, primær/sekundær, accent, destruktiv, kant, input, fokusring m.fl.) samt kantradius.
- **Færdige temaer** (Nexi Blue — appens standard — samt fx Ocean Breeze, Sunset Glow, Forest Green, Royal Purple).
- **Anvend** et tema med det samme, med live-preview af komponenter.
- **Rediger, slet, eksportér og importér** egne temaer (færdige temaer kan ikke slettes).

### Manager Panel

Administrativt dashboard for managere og admins.

- **Teammedlemmer** — opret, rediger og slet medarbejdere (navn, email, telefon, adgangskode).
- **Rettigheder** — godkend eller afvis nye kontoanmodninger og tildel roller.
- **Ferieanmodninger** — se, filtrér (alle/afventende/godkendt), godkend, afvis, rediger og slet anmodninger. Kalender-preview af de ønskede datoer. **Manuel ferietildeling** (enkelt dag eller periode) uden forudgående anmodning.
- **Sygemeldinger** — se, godkend, afvis, rediger og slet sygemeldinger (egen sygdom eller barns sygedag).
- **Fødselsdage** — tilføj, rediger og slet medarbejderes fødselsdage med aldersvisning.
- **Feriekalender-preview** — farvekodet månedsvisning af teamets ferie.
- **Datalagring** — se hvor appens data ligger, vælg datamappe (desktop) og eksportér/importér backup. Se [Datalagring, opdatering og backup](#-datalagring-opdatering-og-backup).
- Alle godkendelser/afvisninger genererer automatisk email notifikationer.

### Admin Panel

Systemadministration – kun for admins.

- **Brugeradministration** — opret, rediger og slet alle brugere samt tildel roller (admin/manager/bruger).
- **Vagtroller** — opret og slet vagtroller med egen farve.
- **Sygemeldingsoverblik** — se alle sygemeldinger på tværs af teamet med status.

## 📧 Email notifikationer

> **Appen kan ikke sende rigtige emails.** I stedet bruges et internt notifikationssystem.

- Når der indberettes sygemelding, anmodes om ferie/fridag, eller en anmodning godkendes/afvises, gemmes en "email notifikation" i systemet.
- Admins og managere kan åbne **Email Notifikationer** fra Hub'en og se alle notifikationer (ulæste markeres).
- Notifikationer indeholder al information, der ville være i en email (modtager, emne, besked).
- Indholdet kan **kopieres til udklipsholder** og sendes manuelt via din egen email-klient (Outlook, Gmail m.fl.).

**Automatiske notifikationer udløses ved:** ny ferieanmodning, godkendt/afvist ferie, sygemelding, godkendt/afvist sygemelding, anmodning om enkelt fridag, annullering af anmodning samt redigering af en delt note.

## 👥 Roller og adgang

| Funktion | Bruger | Manager | Admin |
|----------|:------:|:-------:|:-----:|
| Feriekalender (egne anmodninger) | ✅ | ✅ | ✅ |
| Sygemelding (egen) | ✅ | ✅ | ✅ |
| Vagtplan (visning) | ✅ | ✅ | ✅ |
| Team Oversigt | ✅ | ✅ | ✅ |
| Projekter | ✅ | ✅ | ✅ |
| Email System | ✅ | ✅ | ✅ |
| Guide Bibliotek (visning/søgning) | ✅ | ✅ | ✅ |
| Virtuel Notesbog | ✅ | ✅ | ✅ |
| Madplan | ✅ | ✅ | ✅ |
| Theme Builder | ✅ | ✅ | ✅ |
| Rediger guides | – | ✅ | ✅ |
| Opret/rediger vagttildelinger og -roller | – | ✅ | ✅ |
| Godkend/afvis ferie og sygemelding | – | ✅ | ✅ |
| Manuel ferietildeling | – | ✅ | ✅ |
| Administrer fødselsdage | – | ✅ | ✅ |
| Email notifikationer | – | ✅ | ✅ |
| Opret/rediger/slet medarbejdere | – | ✅ | ✅ |
| Brugeradministration og rolletildeling | – | – | ✅ |

## 👤 Administrator

Jacob Remmer (Jacob.remmer@nexigroup.com) er systemets administrator.
