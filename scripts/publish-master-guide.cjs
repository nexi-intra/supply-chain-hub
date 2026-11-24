// Udgiver "Supply Chain Hub — den komplette haandbog" som DELT guide for alle teams.
// Sikker som standard: uden --publish skrives kun en lokal forhaandsvisning (intet paa datadrevet).
// Hvert faktum er kontrolleret mod koden i 1.5.9 (labels i src/lib/translations.ts m.fl.).
const { ALL_TEAMS, danish, sectionBuilder, publishSharedGuide } = require('./sharedGuidePublisher.cjs')

const S = sectionBuilder('haandbog')
const sections = [
  S('1. Log ind og kom i gang', [
    'Opret konto: Vaelg "Opret konto" paa loginskaermen og udfyld navn, arbejds-email, telefonnummer og adgangskode. Kontoen har status "afventer", indtil en manager har godkendt den — foerst derefter kan du logge ind.',
    'Log ind med din email eller dit brugernavn og din adgangskode. Saetter du flueben i "Husk mig", husker appen dig i op til et aar. Ellers varer en session 24 timer, og du logges ud efter 30 minutters inaktivitet.',
    'Glemt adgangskode: Kontakt din manager, som kan saette en ny adgangskode. Skift den selv under din profil, naar du er logget ind.',
    'Profil: Klik paa dit navn oeverst paa forsiden for at se og rette dine oplysninger og for at logge ud.',
    '"Kunne ikke oprette forbindelse": Appen gemmer alt paa det faelles netvaerksdrev. Kontroller forbindelsen og proev igen. Staar der, at lageret er optaget af en anden klient, saa vent et oejeblik og proev igen.',
  ]),
  S('2. Forsiden', [
    'Forsiden samler dagens overblik i widgets, bl.a. "Team opgaver i dag", "Fri i dag", "Syge i dag", "Mad i dag", "Hjemmearbejde i Supply Chain", "Fri i Supply Chain" og "Syge i Supply Chain".',
    'Klik "Tilpas dashboard" for at vise eller skjule widgets og vaelge stoerrelsen Lille, Normal eller Stor. Indstillingerne gaelder kun dig.',
    'Klokken (notifikationer) samler: ulaeste beskeder, aendringer i noter du har oprettet, nyt i Forbedringer og forslag, to-dos der forfalder, guides der skal gennemgaas, foedselsdage — og for managere/reviewere: ferie- og sygeanmodninger og guide-review-koeen.',
    'I "Team opgaver i dag" kan du med "Tilfoej opgave" tildele en vagtplan-opgave direkte og med blyanten skrive en kommentar (fx "gaar tidligt") — ogsaa for kolleger uden opgave.',
    'Modulerne "Dokumenter" og "Team Chat" er vist som "Kommer snart" og kan endnu ikke bruges. Versionsnummeret nederst til venstre viser, hvilken version du koerer.',
  ]),
  S('3. Sprog og tema', [
    'Skift sprog med sprogvaelgeren: dansk, engelsk eller finsk. Moduler og menuer foelger dit valg.',
    'Skift mellem lyst og moerkt tema med tema-knappen.',
    'Hubert svarer altid paa det sprog, du skriver dit spoergsmaal paa — uanset appens sprog.',
  ]),
  S('4. To Do', [
    'Aabn To Do fra forsiden. Der er to faner: "Team-to-do\'s" (faelles for teamet) og "Personlige to-do\'s" (kun dig).',
    'Klik "Opret ny to-do", giv den en titel og eventuelt en beskrivelse og en forfaldsdato.',
    'Flyt to-do\'en mellem Aaben, I gang og Faerdige, efterhaanden som arbejdet skrider frem.',
    'To-dos der forfalder i dag eller er overskredet, vises i klokken. Du kan ogsaa bede Hubert om at oprette en personlig to-do — han viser den foerst til godkendelse.',
  ]),
  S('5. Vagtplan', [
    'Aabn Vagtplan fra forsiden. Her ser du ugens opgaver fordelt paa personer og dage.',
    'Opgavetyper (fx Packing, Receiving) oprettes paa fanen "Opgaver" i Vagtplan — alle kan tilfoeje og slette opgaver. Managere har ogsaa "Vagtstyring" i Admin Panel.',
    'Tildel en opgave ved at klikke paa en person og en dag og vaelge opgaven. Med "Tilfoej Opgaver til Hel Uge" tildeler du samme opgave hele ugen.',
    'Gentagne vagter: En opgave kan gentages hver 1.-6. uge, saa faste vagter ikke skal oprettes hver uge.',
    'Hver tildeling kan have en kommentar, som ogsaa vises paa forsiden. Brug pilene til at bladre mellem uger.',
  ]),
  S('6. Ferie, sygdom og hjemmearbejde', [
    'Ferie: Aabn Kalender, klik "Anmod om Ferie", vaelg periode og send. Anmodningen har status "afventer", indtil en manager godkender eller afviser den. Du kan ogsaa bede Hubert om at oprette anmodningen.',
    'Sygdom: Klik "Syg" paa forsiden. Vaelg dato og om det gaelder dig selv eller "Barn syg". Du kan ogsaa registrere for en kollega. Sygemeldingen gaelder med det samme og skal ikke godkendes.',
    'Hjemmearbejde: Saet faste hjemmearbejdsdage pr. ugedag med eget uge-interval, og lav undtagelser paa enkeltdage. Forsiden viser "Hjemmearbejde i Supply Chain" paa tvaers af alle teams.',
    'Ferie og sygdom fjerner automatisk personen fra hjemmearbejds- og tilgaengelighedsvisninger de paagaeldende dage.',
  ]),
  S('7. Madplan', [
    'Aabn Madplan fra forsiden. Madplanen er faelles for alle teams og viser mandag-fredag uge for uge.',
    'Bladr mellem uger med pilene. Klik "Rediger madplan" for at skrive ugens retter.',
    'Dagens ret vises paa forsiden i "Mad i dag". Spoerg Hubert fx "hvad faar vi at spise paa torsdag?" eller "madplan uge 40".',
  ]),
  S('8. Teamoversigt og foedselsdage', [
    'Aabn Teamoversigt for at se kolleger i dit team med navn, email, telefon, rolle og farve.',
    'Foedselsdage registreres af managere i Manager Panel under "Foedselsdage" og fejres automatisk paa forsiden.',
    'Hver kollega har en farve, som gaar igen i vagtplan, kalender og team-status.',
    'Andre teams: Du kan se navne og roller via Hubert (fx "personer i BPO") — aldrig deres opgaver, fravaer eller kontaktoplysninger.',
  ]),
  S('9. Notesbog', [
    'Aabn Notesbogen fra forsiden. Der findes personlige noter (kun dig) og faelles noter (hele teamet).',
    'Opret en note med titel og indhold, og tilfoej tags, saa den er let at finde igen. Fastgoer vigtige noter, saa de ligger oeverst.',
    'Redigerer en kollega en faelles note, du har oprettet, faar du besked i klokken.',
  ]),
  S('10. Beskeder', [
    'Aabn Beskeder fra forsiden for at sende og modtage interne beskeder til og fra kolleger.',
    'Skriv en ny besked, vaelg modtager, emne og indhold, og send. Modtageren ser den som ulaest i klokken.',
    'Organisér indbakken med egne mapper.',
  ]),
  S('11. Forbedringer og forslag', [
    'Aabn "Forbedringer og forslag" fra forsiden (eller med Ctrl+K). Her samles forbedringsforslag paa tvaers af Supply Chain.',
    'Klik "Nyt forslag". Udfyld titel, problem og "Forslag til forbedring", vaelg kategori og beroerte afdelinger, og klik "Opret forslag". Passer ingen kategori, kan du oprette en ny med "+ Ny kategori…".',
    'Inviter en ansvarlig og bidragydere med "Inviter person". De svarer med "Accepter invitation" eller "Afvis invitation". Den, der har oprettet forslaget, kan ikke inviteres.',
    'Ansvarlige og bidragydere opdaterer fremdrift og frister. Naar arbejdet er faerdigt, klikker den ansvarlige "Meld faerdig (til godkendelse)", og en leder vaelger "Godkend afslutning" eller "Send tilbage" med feedback.',
    'Brug filtrene "Alle forslag", "Mine forslag", "Tildelt mig" og "Min afdeling" samt "Mine afventende invitationer". Kun ledere kan slette — andre kan "Anmod om sletning".',
  ]),
  S('12. Guide Bibliotek: find og laes', [
    'Aabn Guide Bibliotek fra forsiden. Soeg paa et emne og vaelg eventuelt en kategori. "Mit team" viser dit teams guides og guides, der er delt med jer.',
    'Aabn en guide for at laese den trin for trin. Versionsnummer, opdateringsdato og forfatter staar paa guiden. Word-guides kan vises som "Original DOCX".',
    'En guide kan laeses paa dansk, engelsk eller finsk via den indbyggede oversaettelse. "Download DOCX" giver en Word-kopi.',
    'Andre teams: Klik paa et andet teams fane for at se titler. Vaelg "Anmod om adgang" ved en privat guide. Ejer-teamets manager behandler anmodningen under "Guide-adgang" i Manager Panel, og adgangen gaelder i to doegn.',
    'Hurtigst: Spoerg Hubert. Han finder den rigtige guide og viser hele fremgangsmaaden med kilde (se afsnit 14).',
  ]),
  S('13. Guide Bibliotek: skriv, review og vedligehold', [
    'Klik "Ny guide". Udfyld titel, kategori, tags og sprog. Byg indholdet som sektioner med nummererede trin, og saet billeder ind ved det trin, de forklarer (traek filen ind eller brug Ctrl+V).',
    'Vaelg "Opdaterings-interval" for at faa "Naeste tjek" og en "Ansvarlig for gennemgang", som faar paamindelserne.',
    'Brug "Preview" til at kontrollere guiden. "Gem som kladde" gemmer til senere. "Send til review" indsender den — guiden udgives foerst, naar en reviewer godkender.',
    '"Importér Word-guide": Vaelg "Konvertér til redigerbare trin" eller "Bevar original Word-layout". Det originale layout kraever Microsoft Word paa forfatterens pc for at lave visningskopien.',
    'Reviewere aabner "Review og kladder" > "Review-koe", vaelger "Tag review" og derefter "Godkend og udgiv" eller "Send tilbage" med en kommentar. En Guide Admin kan ikke godkende sine egne guides; en manager kan godkende alt.',
    'Sletning kraever ogsaa godkendelse ("Godkend og slet"). Slettede guides ligger i Arkiv og kan gendannes. "Skal opdateres" viser guides med forfaldent tjek; kontroller indholdet foer du trykker "Gennemgaaet".',
  ]),
  S('14. Hubert — din assistent', [
    'Aabn Hubert med knappen "Spoerg Hubert" nederst til hoejre eller med Ctrl+S. Escape minimerer chatten.',
    'Hubert har to tilstande: "Hub" slaar op i hubbens data og guides. "Generelt" bruger ingen hub-data og markeres som AI-genereret.',
    'Guides: Spoerg som du ville spoerge en kollega, fx "hvordan laver jeg en kreditnota?" eller "hvordan opdaterer jeg en PUUILO-terminal?". Hubert forstaar baade dansk og engelsk, boejninger og modelnumre, finder guiden og viser hele fremgangsmaaden. Klik paa kilden for at aabne guiden ved trinnet.',
    'Word-guides soeges ogsaa i selve teksten, og nye guides kan bruges med det samme, naar de er udgivet. "Hvilke guides findes der?" viser alle guides, du har adgang til.',
    'Data: Proev "hvad sker der i dag?", "hvem er paa arbejde i morgen?", "hvornaar er [kollega] tilbage?", "hvem har vagt i dag?" eller "vis mine to-dos". Korte opfoelgninger som "og i morgen?" eller "og Bo?" virker ogsaa.',
    'Handlinger: Hubert kan oprette en ferieanmodning eller en personlig to-do, men viser altid et kort med "Bekraeft" og "Annuller" foerst. Han kan aldrig godkende, aendre eller slette data og ser kun det, du selv har adgang til.',
    'AI-svar: Med "Aktivér AI-svar" hentes AI-modellen én gang (ca. 3 GB) fra det faelles drev. Den kraever ca. 4,5 GB fri hukommelse (5,5 GB hvis Hubert ogsaa skal laese guidebilleder). Uden modellen virker alle opslag stadig.',
    'Giv tommel op eller ned paa svarene — det bruges til at goere Hubert bedre.',
  ]),
  S('15. Spil', [
    'Aabn Spilhjoernet fra forsiden. Arcade har Chicken Invaders, Prism Break, Parcel Pilot, Cargo Stack og Route Runner. Modern har Cube Basher.',
    'Styringen vises paa hvert spils startskaerm. P pauser og mellemrum fortsaetter. Escape lukker et Arcade-spil; i Cube Basher aabner Escape pausemenuen.',
    'Highscores gemmes pr. spil og svaerhedsgrad paa tvaers af alle teams. Spoerg Hubert fx "hvem foerer i Cargo Stack?".',
  ]),
  S('16. Manager Panel og Admin Panel', [
    'Manager Panel har fanerne Rettigheder, Sygemeldinger, Anmodninger, Ferie Oversigt, Foedselsdage og Guide-adgang.',
    'Under Anmodninger godkender eller afviser du ferieanmodninger — ogsaa flere paa én gang.',
    'Sygemeldinger kraever ingen godkendelse, men managere kan se og slette registreringer, og appen gør opmaerksom paa hyppigt fravaer.',
    'Admin Panel aabnes fra profilmenuen (managere) og indeholder bl.a. brugere og roller samt "Vagtstyring".',
  ]),
  S('17. App-opdateringer', [
    'Appen tjekker selv for nye versioner og viser et opdateringsvindue, naar en ny version er udgivet. Ét klik — appen opdaterer og genstarter.',
    'Nye versioner udgives af creatoren i Creator Panel under Datalagring > "App-opdateringer". Samme sted ses "Brugernes app-versioner".',
    'Se "Hvad er nyt" efter en opdatering for et kort overblik over aendringerne.',
  ]),
  S('18. Data, offline og sikkerhed', [
    'Alle data gemmes krypteret paa det faelles netvaerksdrev — intet sendes til skyen. Huberts AI koerer lokalt paa din egen pc.',
    'Mister du forbindelsen, viser appen en besked og gemmer dine aendringer i en lokal koe, som synkroniseres, naar forbindelsen er tilbage.',
    'Redigerer to personer det samme samtidig, beskytter appen mod overskrivning og beder den ene genindlaese.',
  ]),
  S('19. Genveje', [
    'Ctrl+K: Aabn kommandopaletten og hop direkte til ethvert modul, ogsaa Forbedringer og forslag.',
    'Ctrl+S: Aabn eller minimer Hubert. Escape: gaa et niveau tilbage (dialog -> modul -> forside).',
  ]),
]

const now = Date.now()
publishSharedGuide({
  id: 'guide_sch_komplet_haandbog',
  schemaVersion: 2,
  title: danish('Supply Chain Hub — den komplette haandbog'),
  category: 'General',
  tags: ['haandbog', 'manual', 'hjaelp', 'kom i gang', 'alle moduler', 'hubert', 'forbedringer'].map(danish),
  language: 'da',
  content: danish('Den komplette haandbog til Supply Chain Hub: login, forside, To Do, vagtplan, ferie og sygdom, madplan, teamoversigt, notesbog, beskeder, forbedringer, Guide Bibliotek, Hubert, spil, Manager Panel, opdateringer, datasikkerhed og genveje.'),
  sections,
  version: '1.00',
  author: 'Supply Chain Hub',
  createdBy: 'jacob.remmer.creator@nexigroup.com',
  updatedBy: 'jacob.remmer.creator@nexigroup.com',
  createdAt: now,
  updatedAt: now,
  reviewIntervalMonths: null,
  nextReviewAt: null,
  sharedWithTeamCodes: ALL_TEAMS,
}, { label: 'Haandbog' })
