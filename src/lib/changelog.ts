// Kort, brugervendt "hvad er nyt"-liste pr. version — vises én gang pr. maskine
// efter en opdatering (se WhatsNewDialog.tsx). Hold posterne korte og konkrete.

export interface ChangelogEntry {
  version: string
  items: string[]
}

export const CHANGELOG: ChangelogEntry[] = [
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
