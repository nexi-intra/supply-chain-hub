// Udgiver "Guidebiblioteket i Supply Chain Hub — trin for trin" som DELT guide for alle teams.
// Sikker som standard: uden --publish skrives kun en lokal forhaandsvisning (intet paa datadrevet).
// Bevarer de to eksisterende procesdiagrammer (imageIds) fra den udgivne version.
const { ALL_TEAMS, SHARED_DIR, readKey, danish, sectionBuilder, publishSharedGuide } = require('./sharedGuidePublisher.cjs')

const GUIDE_ID = 'guide_sch_guidebibliotek_157'
const previous = (readKey(SHARED_DIR, 'shared-guides') || []).find(item => item.id === GUIDE_ID)
// Diagrammerne ligger paa de trin, der begynder med disse ord i den nuvaerende version.
const imagesFrom = prefix => previous?.sections?.flatMap(section => section.steps || []).find(step => String(step.text || '').startsWith(prefix))?.imageIds || []
const libraryDiagram = imagesFrom('Åbn Guide Bibliotek > Mit team')
const reviewDiagram = imagesFrom('Åbn Review og kladder > Mine indsendelser')

const S = sectionBuilder('guidebib')
const sections = [
  S('Formaal', [
    'Find, laes, opret og vedligehold guides — og faa Hubert til at svare ud fra dem. Vejledningen gaelder den aktuelle version af Supply Chain Hub.',
  ]),
  S('Forudsaetninger', [
    'Log ind med en godkendt konto og aabn Guide Bibliotek fra forsiden. Din manager skal godkende kontoen, foer du kan logge ind.',
    'En manager eller en udpeget Guide Admin kan godkende guides. En Guide Admin kan ikke godkende sine egne indsendelser; en manager kan godkende alt.',
    'Til Word-import kraeves en .docx-fil. Bevaring af det originale Word-layout kraever Microsoft Word paa forfatterens pc; visningskopien gemmes, saa laeserne ikke behoever Word.',
  ]),
  S('Find og laes en guide', [
    { text: 'Aabn Guide Bibliotek > Mit team. Her finder du dit teams udgivne guides og guides, der er delt med jer. Diagrammet viser forskellen paa dit eget bibliotek og andre teams oversigt.', imageIds: libraryDiagram },
    'Soeg paa et emne og vaelg eventuelt en kategori. Aabn guiden og laes titel, versionsnummer, opdateringsdato og alle trin, foer du handler. Er listen tom, saa ryd soegning, kategori og "Skal opdateres".',
    'Guiden kan vises som "Redigerbar visning", "Forenklet preview" eller — for Word-guides — "Original DOCX". Vaelg dansk, engelsk eller finsk for at laese en oversaettelse; sammenlign kritiske fagudtryk med originalen.',
    '"Download DOCX" giver en Word-kopi, "Vedhaeftet Word" henter den originale fil, og "Eksportér til bibliotek" gemmer en kopi i en valgt mappe. Eksport udgiver ikke en guide.',
  ]),
  S('Spoerg Hubert om guides', [
    'Aabn Hubert ("Spoerg Hubert" nederst til hoejre eller Ctrl+S) i tilstanden "Hub", og spoerg som du ville spoerge en kollega, fx "hvordan laver jeg en kreditnota?" eller "hvad goer jeg, hvis jeg faar kemikalier i oejnene?".',
    'Hubert finder den rigtige guide ogsaa naar du skriver paa dansk og guiden er paa engelsk, naar ordene er boejet ("batterierne", "terminalen") eller naar modelnumre skrives forskelligt ("move 3500" / "Move3500").',
    'Svaret viser hele fremgangsmaaden i den rigtige raekkefoelge med kilde. Klik paa kilden for at aabne guiden ved det trin, svaret bygger paa. Trin der kun bestaar af et billede, markeres "(se billedet i guiden)".',
    'Word-guides soeges i selve dokumentteksten. Nye og opdaterede guides kan bruges af Hubert med det samme, naar de er udgivet. "Hvilke guides findes der?" viser alle guides, du har adgang til.',
    'Findes der ingen guide om emnet, siger Hubert det aerligt og viser de naermeste guides. Spoergsmaalet registreres, saa guide-ejerne kan se, hvilke guides der mangler.',
  ]),
  S('Skriv en guide', [
    'Klik "Ny guide". Udfyld titel, kategori, tags og sprog. Vaelg "Opdaterings-interval" for at faa felterne "Naeste tjek" og "Ansvarlig for gennemgang"; den ansvarlige faar paamindelserne og behoever ikke vaere forfatter.',
    'Tilfoej sektionsoverskrifter og nummererede trin. Saet kun billeder uden foelsomme data ind ved det trin, de forklarer: klik i billedfeltet, traek filen ind eller brug Ctrl+V. Du kan ogsaa linke til andre guides, sektioner og trin.',
    'Brug "Preview" til at kontrollere tekst, raekkefoelge og billeder. "Gem som kladde" gemmer arbejdet til senere — lokale kladder vises under "Dine kladder". "Send til review" indsender guiden; en indsendelse er ikke udgivet.',
    'Klik "Importér Word-guide" og vaelg "Konvertér til redigerbare trin" eller "Bevar original Word-layout". Vaelg .docx-filen, gennemgaa udkastet og send til review.',
  ]),
  S('Skriv guides, som Hubert kan finde', [
    'Giv guiden en titel med de ord, kollegerne vil soege paa: produkt, system og handling, fx "PUUILO Software update" eller "Create a credit note".',
    'Skriv handlingen i teksten ved hvert trin — ikke kun i billedet. Hubert kan kun soege i tekst; et trin med kun et billede kan han ikke forklare uden AI-billedlaesning.',
    'Brug tags til synonymer og interne udtryk (fx "kreditnota, credit note, VA01"), og del guiden med de teams, der skal bruge den.',
  ]),
  S('Review og udgivelse', [
    { text: 'Aabn Review og kladder > Mine indsendelser for at foelge status. "Afventer review" betyder, at guiden ikke er udgivet endnu. Diagrammet viser, at en guide foerst bliver synlig ved godkendelse. "Traek tilbage" goer en ventende indsendelse til kladde, og "Ret og indsend" bruges efter reviewerens kommentar.', imageIds: reviewDiagram },
    'Brug blyanten paa en udgivet guide for at indsende en ny version. Den gamle version er synlig, indtil den nye er godkendt. Historik viser tidligere versioner; en gendannelse skal ogsaa godkendes.',
    'Reviewer: Aabn "Review-koe", vaelg "Se aendringer" og "Tag review", og derefter "Godkend og udgiv" eller "Send tilbage" med en konkret kommentar.',
    'Sletning: Vaelg papirkurven paa guiden og send anmodningen til review. Reviewer godkender med "Godkend og slet"; derefter ligger guiden i Arkiv, hvor den kan gendannes med "Anmod om gendannelse".',
  ]),
  S('Vedligehold, kategorier og deling', [
    '"Skal opdateres" viser guides med forfaldent eller naert forestaaende tjek. Knappen "Gennemgaaet" vises paa kort, der er overskredet eller forfalder inden for 14 dage; kontroller indholdet, foer du trykker, for den flytter kun naeste tjekdato.',
    '"Administrer kategorier" opretter og omdoeber kategorier. General kan ikke aendres, og en kategori i brug kan ikke slettes.',
    'Vaelg "Del med andre teams" i editoren, naar en guide skal vaere faelles. Den gemmes ét sted, og godkendte aendringer vises hos alle valgte teams.',
    'Klik paa et andet teams fane for at se titler og kategorier, og vaelg "Anmod om adgang" ved en privat guide. Ejer-teamets manager behandler anmodningen under "Guide-adgang" i Manager Panel; ved godkendelse kan du aabne guiden i to doegn.',
    '"Eksport-bibliotek" eksporterer alle tilgaengelige guides som DOCX i kategori-mapper. Det er en filkopi, ikke en backup af hubbens data.',
  ]),
  S('Fejlfinding', [
    'Guiden mangler efter indsendelse: Aabn "Mine indsendelser". "Afventer review" betyder, at den ikke er udgivet endnu.',
    'Ingen soegeresultater: Ryd soegning, kategori og "Skal opdateres", og skift tilbage til "Mit team". Eller spoerg Hubert.',
    'Hubert finder ikke guiden: Kontroller at den er udgivet (ikke kun indsendt), og at titel eller trin indeholder de ord, du spoerger med.',
    'Andet teams guide kan ikke aabnes: Anmod om adgang og afvent ejer-teamets manager. Adgangen udloeber efter to doegn.',
    'Word-layout kan ikke vises: Kontroller at .docx-filen stadig er vedhaeftet. Aabn originalen i Word for praecist sidelayout.',
    'En aaben indsendelse blokerer redigering: Faerdiggoer eller kassér den eksisterende indsendelse under "Mine indsendelser".',
  ]),
  S('Opsummering', [
    'Find den udgivne guide under "Mit team" eller spoerg Hubert. Opret eller importér nye guides, send dem til review, og kontroller under "Mine indsendelser", at de er godkendt. Skriv titler og trin med de ord, kollegerne bruger — saa kan Hubert hjaelpe alle med dem.',
  ]),
]

const now = Date.now()
publishSharedGuide({
  id: GUIDE_ID,
  schemaVersion: 2,
  title: danish('Guidebiblioteket i Supply Chain Hub — trin for trin'),
  category: 'General',
  tags: ['guidebibliotek', 'review', 'kladder', 'Word', 'billeder', 'deling', 'hubert', 'soegning'].map(danish),
  language: 'da',
  content: danish('Vejledning til at finde, laese, skrive, importere, gennemgaa og dele guides i Supply Chain Hub — og til at faa Hubert til at svare ud fra dem. Billederne er procesdiagrammer, ikke skaermbilleder fra appen.'),
  sections,
  version: previous?.version || '1.00',
  author: previous?.author || 'Supply Chain Hub',
  createdBy: previous?.createdBy || 'jacob.remmer.creator@nexigroup.com',
  updatedBy: 'jacob.remmer.creator@nexigroup.com',
  createdAt: previous?.createdAt || now,
  updatedAt: now,
  reviewIntervalMonths: previous?.reviewIntervalMonths ?? null,
  nextReviewAt: previous?.nextReviewAt ?? null,
  sharedWithTeamCodes: ALL_TEAMS,
}, { label: 'Guidebiblioteket' })
console.log(`Procesdiagrammer bevaret: ${libraryDiagram.length + reviewDiagram.length} af 2`)
