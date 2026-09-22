// Kort, brugervendt "hvad er nyt"-liste pr. version — vises én gang pr. maskine
// efter en opdatering (se WhatsNewDialog.tsx). Hold posterne korte og konkrete.

export interface ChangelogEntry {
  version: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: '1.5.7',
    items: [
      'Hele hubben svarer nu med det samme. Knapper, dialoger og kvitteringer venter ikke længere på det delte drev — ændringen vises øjeblikkeligt, og selve gemningen sker i baggrunden. Går gemningen galt, sættes det tilbage og du får besked',
      'Sygemeld, barn syg og enkelte fridage: dialogen lukker og kvitterer nu med det samme i stedet for først at skulle skrive besked til lederen og vente på svar',
      'Ferie kan godkendes, afvises og slettes uden ventetid — også når flere ledere sidder i kalenderen samtidig. Før kunne to samtidige godkendelser overskrive hinandens besked',
      'Noter, notifikationer og e-mails åbner, markeres som læst og slettes med det samme. Hver handling brugte før tre ture frem og tilbage til drevet, nu kun én',
      'Rettet at redigering af en medarbejders navn ventede på et unødvendigt opslag, før dialogen overhovedet åbnede',
      'Færre skrivninger til drevet over hele linjen: fx sendes lederbesked og kvittering for en fridag nu samlet i stedet for i fire omgange',
      'Spillehjørnet er gennemgået fra bunden. Rettet at hele appen kunne falde ned på en rød fejlskærm når man åbnede et arkadespil: den lokale kopi af highscore-listen blev gemt i en forkert form, og så kunne spillet ikke læse den',
      'Highscores bliver nu altid registreret. Før kunne en score gå tabt uden besked — og sluttede to kolleger samtidig, kunne den ene skrive oven i den andens rekord. Nu vinder den højeste score altid, og en rekord kan aldrig sættes ned',
      'Fjernet den røde "Data er ændret af en anden bruger"-besked, der kom hver eneste gang man slog sin egen rekord, selvom scoren faktisk var gemt',
      'Kan din score mod forventning ikke gemmes, får du det nu at vide med det samme i stedet for at tro at rekorden er registreret',
      'Alle fem spil sætter nu automatisk på pause, når du skifter til et andet vindue. Før kørte spillet videre, så man var død når man kom tilbage. Du kan også selv pause med P og fortsætte med mellemrum',
      'Pausen tæller ikke med: farten stiger ikke mens du er væk, brikken falder ikke videre i Tetris, og skjold og andre powerups i Brick Break løber ikke ud',
      'Chickeninvasion tæller nu de spillede runder med i statistikken, som de øvrige spil',
      'Spil-statistikken tæller pr. spiller, så to der spiller samtidig ikke længere kan slette hinandens antal spil',
    ],
  },
  {
    version: '1.5.6',
    items: [
      'Appen gemmer igen med det samme. Gemninger kunne tage flere minutter — godkende en ferie, oprette en note eller tildele en opgave fra forsiden — fordi alle brugeres skrivninger stod i én og samme kø på det delte drev. Køen er fjernet: målt på 16 samtidige gemninger fejlede 14 før, nu ingen',
      'Rettet at appen genhentede alle guidebilleders oplysninger ved hver opstart og hvert hub-skift. Billeder ændrer sig aldrig, så det var ren spildt netværkstrafik — og den gjorde drevet så travlt at almindelige gemninger kunne tage 30-50 sekunder',
      'Appen er brugbar med det samme efter opstart. Den baggrundsopdatering der henter dine data ned, lagde tidligere beslag på drevet i op til to minutter — netop mens du gik i gang. Den venter nu til appen er indlæst og kører stille og roligt ved siden af',
      'Automatiske sikkerhedskopier belaster ikke længere alle: tidligere forsøgte hver enkelt pc at tage den samme kopi hver time samtidig. Nu tager én pc den, og timekopien springer de uforanderlige billeder over (1 MB i stedet for 40 MB)',
      'Rettet at en efterladt lås fra en pc der er lukket ned forkert kunne blokere en bestemt handling permanent — fx "tildel opgave" — indtil låsen blev fjernet manuelt',
      'Rettet at en pc med forkert indstillet ur kunne lægge en lås der aldrig blev ryddet op, og dermed blokere for alle andre',
      'Der er ikke længere nogen størrelsesgrænse på Word-dokumenter og billeder i guides. Kræver en guide et stort dokument, kan det nu lade sig gøre',
      'Tager en gemning alligevel usædvanlig lang tid, skriver appen det nu i sin log, så årsagen kan findes i stedet for at gættes',
    ],
  },
  {
    version: '1.5.5',
    items: [
      'Guide Bibliotek: næste-tjek-datoen kan nu sættes til en specifik dag i stedet for altid at blive "i dag + interval" — så guider I opretter samtidig ikke alle forfalder på samme dato',
      'Guide Bibliotek: en guide kan nu have en "ansvarlig for gennemgang" — en anden person end forfatteren, som får påmindelserne om at holde den opdateret',
      'Vagtplan: "Gentagne vagter" kan nu redigeres bagefter (ikke kun oprettes/slettes), listen over mønstre kan skjules/vises, filtreres på opgave eller medarbejder, og intervallet kan sættes helt op til hver sjette uge',
      'Vagtplan: en tildeling hvis opgave er blevet slettet/omdannet forsvinder ikke længere stille fra kalenderen — den vises nu som "Ukendt opgave" og kan med ét klik knyttes til en gyldig opgave igen',
      'Login/genoptag session er nu markant mere robust ved travlt delt drev — færre falske "Lageret er optaget af en anden klient"-fejl ved login',
      'Rettet en sjælden race i "Tildel opgave" fra forsiden, der kunne overskrive en andens samtidige ændring af vagtplanen',
      'Baggrunds-synkronisering: en enkelt forbigående fejl viser ikke længere en bekymrende fejl-besked — kun hvis noget er reelt fastlåst efter flere forsøg',
      'Hubert kan nu guide dig gennem appen: spørg fx "hvordan opretter jeg en ferieanmodning?" eller "hvordan laver jeg en gentagen vagt?" og få svar trin for trin i stedet for en liste med registreringer',
      'Hubert svarer ikke længere "jeg fandt ikke et underbygget svar" som en blindgyde — kan spørgsmålet ikke besvares ud fra hubbens data, forklarer den i stedet hvad den kan hjælpe med og hvor du skal kigge hen',
      'Hubert har fået en ny "Generelt"-tilstand til almindelige spørgsmål uden for appen (fx en Excel-formel eller en oversættelse). Svar herfra er tydeligt markeret som AI-genererede og bygger ikke på hubbens data',
      'Hubert bliver ikke længere afbrudt midt i en sætning ved længere svar som fx trinvise vejledninger',
      'Hubert bruger nu en mindre AI-model, der kræver ca. 4,5 GB ledig hukommelse i stedet for 7 GB — den kan dermed starte på langt flere arbejds-pc\'er. Modellen fylder også kun det halve (ca. 3 GB mod 6 GB), og den gamle model ryddes automatisk fra din pc. Har du allerede aktiveret AI-svar, bliver du bedt om at hente den nye model én gang',
      'Automatiske sikkerhedskopier fylder ikke længere urimeligt meget: for indeværende dag gemmes én i timen, mens afsluttede dage klappes sammen til den nyeste kopi fra hver dag (14 dage tilbage)',
      'Importér Word-guide: dokumentets egen indholdsfortegnelse bliver ikke længere importeret som almindelige trin — appen laver selv indholdsfortegnelsen, så den stod tidligere dobbelt',
      'Importér Word-guide er markant hurtigere: billeder og det vedhæftede dokument gemmes nu i én skrivning i stedet for én pr. 256 KB, hvilket fjerner op mod 85% af netværkskaldene til det delte drev',
      'Rettet "EPERM: operation not permitted"-fejlen der kunne afbryde en helt almindelig gemning: sker der et sammenfald hvor en anden pc netop har frigivet lås-filen, venter appen nu og prøver igen i stedet for at vise en fejl',
      'Guide Bibliotek: du kan nu gemme en guide som kladde og arbejde videre på den senere. Dine kladder vises øverst i biblioteket, og forlader du en guide midt i arbejdet, bliver den gemt i stedet for at gå tabt',
    ],
  },
  {
    version: '1.5.4',
    items: [
      'Appen henter indhold markant hurtigere: forsiden loader op til dobbelt så hurtigt første gang, og efterfølgende navigation er øjeblikkelig — data genhentes kun når noget faktisk er ændret på drevet',
      'Appen starter øjeblikkeligt med dine data fra sidst og opdaterer stille i baggrunden, hvis noget er ændret på drevet siden',
      'Kollegers ændringer bliver synlige hurtigere (drevet tjekkes hvert 2. sekund i stedet for hvert 5.)',
      'Gemninger fejler ikke længere med "Kunne ikke gemme ændringen — prøv igen om lidt" når mange bruger appen samtidig — appen prøver nu selv igen i baggrunden og genopretter automatisk',
      'Rettet en kritisk fejl: en enkelt nedbrudt klient kunne efterlade en laas, der blokerede login for ALLE 40 brugere permanent, indtil nogen manuelt ryddede den — laasen retter nu sig selv',
      'Notesbogen: lange noter skjulte før Opret/Gem-knapperne — dialogen kan nu altid scrolles, og knapperne er altid synlige',
      'To Do: både fælles og personlige to-do’er kan nu redigeres (titel og beskrivelse) via en ny blyant-knap',
      'Guide-editoren gemmer nu automatisk en kladde undervejs — lukker computeren eller crasher appen midt i en guide, tilbydes kladden genskabt næste gang',
      'Vagtplan: nye "Gentagne vagter" — tildel en opgave der automatisk gentages hver uge, hver anden, tredje eller fjerde uge fremover',
      'Hubert kan nu også UDFØRE ting, ikke kun svare: sig "opret en ferieanmodning fra ... til ..." eller "opret en to-do: ..." — Hubert viser altid et bekræftelseskort, og intet skrives før du selv trykker Bekræft',
      'Hubert kan nu følge op på et ufuldstændigt handlingsforslag ("hvilke datoer?" → dit næste svar med bare datoerne bliver forstået), og hvert svar kan nu bedømmes med tommel op/ned',
      'To Do: både team- og personlige to-do\'er kan nu få en forfaldsdato — du får en notifikation i klokken, når den falder i dag eller er overskredet',
      'Creator: Arcade-highscores og brugernes app-versioner kan nu ses samlet på tværs af ALLE hubs (med hub-filter), uden at skulle skifte aktivt hub først',
      'Creator: nyt version-bibliotek under App-opdateringer — læg en ældre version ind (fx som mellemtrin for fastlåste klienter) uden at gøre den til den version alle andre automatisk opdaterer til',
      'Highscores i Spilhjørnet hentes markant hurtigere paa tvaers af teams (ingen unoedvendig genindlaesning fra drevet, og laesninger koerer nu parallelt i stedet for én ad gangen)',
      'Brick Break føles meget mere responsivt: fjernet unoedvendige gen-tegninger 60 gange i sekundet, der konkurrerede med tastatur/mus-input',
    ],
  },
  {
    version: '1.5.3',
    items: [
      'Appen svarer hurtigere: gemninger blokerer ikke længere appen, og hakken/frysninger ved langsomt netværksdrev er fjernet',
      'Hubert er blevet markant klogere: spørg fx "Hvor er Anne i dag?", "Hvem er på arbejde i morgen?", "Hvornår er Bo tilbage?" eller "Hvem har flest opgaver i næste uge?"',
      'Hubert forstår opfølgninger som "og Bo?" eller "og fredag?" og finder hjemmearbejde på tværs af alle teams',
      'Ny fælles guide: "Supply Chain Hub — den komplette håndbog" med alt fra login til spil (ligger i guide-biblioteket i alle hubs)',
      'Guide-review: fastlåste anmodninger kan ikke længere opstå, og åbne anmodninger kan kasseres helt',
      'Team status i dag: kommentar-blyanten virker nu også for kolleger uden opgave',
      'Spillene reagerer øjeblikkeligt på input igen — også Cube Basher (fast tast efter fokusskift er fixet)',
    ],
  },
  {
    version: '1.5.2',
    items: [
      'Hubert AI-assistent er nu med i appen og svarer på dansk, engelsk og finsk ud fra spørgsmålets sprog',
      'AI-svar aktiveres pr. pc via "Aktivér AI-svar" i chatten — modellen hentes én gang fra det delte drev',
      'Uden AI-model svarer Hubert stadig med data (opgaver, madplan, ferie, personer, highscores) og guide-uddrag',
    ],
  },
  {
    version: '1.5.1',
    items: [
      "Nyt To Do-modul (tidligere Projekt): team-to-do's og personlige to-do's — opgaver og kommentarer kan oprettes direkte fra forsiden",
      'Ny widget "Team status i dag": se hver medarbejders opgave, kommentar, ferie og sygdom samlet ét sted',
      'Medarbejderfarver kan nu vælges i Manager Panel og slår igennem i teamoversigt, vagtplan og feriekalender',
      'Notesbogen har fået samme udseende som To Do og hedder nu blot "Notesbog"',
      'Hubert forstår og svarer nu på dansk, engelsk og finsk ud fra spørgsmålets sprog',
      'Nyt app-ikon til Supply Chain Hub',
      'Nye skrivebeskyttede fælleshubs kan samle ferie, vagtplaner, personer og guides fra flere teams',
      'Guide-workflow med kladder, review-kø, Guide Admins, før/efter-visning og godkendelse før udgivelse',
      'Guideopdateringer og sletninger kræver nu review, og arkiverede eller tidligere versioner kan gendannes via en ny godkendelse',
      'Finsk kan vælges som appsprog og bruges i guideoversættelsen via Bergamot',
      'Personlige widgets på forsiden kan vises, skjules og ændres i størrelse',
      'Genvejstaster og faste tilbageknapper virker nu også i skrivebeskyttede fælleshubs',
    ],
  },
  {
    version: '1.4.2',
    items: [
      'Notifikationscenter på forsiden samler emails, ferieanmodninger, guide-revisioner og fødselsdage ét sted',
      'Opslagstavle til firmameddelelser øverst på forsiden',
      '"Siden sidst"-oversigt når du logger ind efter en pause',
      'Email-tråde: svar samles nu i én samtale i stedet for separate beskeder',
      'Ferieanmodnings-mails har en knap der fører direkte til Manager Panelets ferieanmodninger',
      'Notesbogen understøtter tags og fastgørelse af vigtige noter',
      'Manager Panel: bulk-godkendelse af ferieanmodninger, sygefraværs-mønstre og guidet on-/offboarding',
      'Hurtigere opstart og mere jævne spil i Spilhjørnet',
    ],
  },
  {
    version: '1.4.1',
    items: [
      'Guide Bibliotek 2.0: sektioner/trin, versionshistorik og automatiske revisions-påmindelser',
      'Rettet Escape-tasten så den altid navigerer ét skridt tilbage i stedet for til forsiden',
      'Brugernavn kan nu bruges til login sammen med email',
    ],
  },
  {
    version: '1.4.0',
    items: [
      'Nyt automatisk opdateringssystem — appen opdaterer sig selv i baggrunden',
      'Manager Panel kan udrulle bestemte versioner til udvalgte medarbejdere',
    ],
  },
]

/** Alle changelog-punkter for versioner NYERE end lastSeenVersion (eller kun nyeste, hvis lastSeenVersion er ukendt). */
export function getChangelogSince(lastSeenVersion: string | null, currentVersion: string): ChangelogEntry[] {
  if (!lastSeenVersion) {
    const currentEntry = CHANGELOG.find(e => e.version === currentVersion)
    return currentEntry ? [currentEntry] : []
  }
  const compare = (a: string, b: string) => {
    const pa = a.split('.').map(Number)
    const pb = b.split('.').map(Number)
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const diff = (pa[i] || 0) - (pb[i] || 0)
      if (diff !== 0) return diff
    }
    return 0
  }
  return CHANGELOG.filter(e => compare(e.version, lastSeenVersion) > 0 && compare(e.version, currentVersion) <= 0)
}
