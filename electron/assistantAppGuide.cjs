// Indbygget viden om SELVE appen: hvad hvert modul er, hvor det ligger, og
// hvordan man udfoerer de almindeligste opgaver. Uden det her kan Hubert kun
// slaa registreringer op - den kan ikke hjaelpe nogen igennem appen.
//
// Grundteksten er dansk (ASCII-translittereret) og styrer matchningen. Svar paa
// en/fi/sv bruger assistantAppGuideI18n.cjs (samme id'er, knapnavne som den
// lokaliserede UI viser); mangler en oversaettelse, vises dansk bag en kort note.
//
// Indholdet skal afspejle den FAKTISKE UI. Gaetter man her, hallucinerer Hubert
// med fuld troovaerdighed. Tilfoej hellere mindre end noget der ikke er tjekket.

const MANAGER = 'manager'
const CREATOR = 'creator'
// The chess tasks all count these words (Finnish with its case forms), so a chess question is never decided by one task having an extra form.
const CHESS_WORDS = ['skak', 'chess', 'shakki', 'shakissa', 'shakin', 'schack']
const CASTLING_WORDS = ['roker', 'rokade', 'castle', 'castling', 'rockera', 'rockerar', 'rockad', 'linnoit']
const { LOCALIZED } = require('./assistantAppGuideI18n.cjs')

const DANISH_UI = { where: 'Hvor', note: 'Bemaerk', overview: 'Moduler i Supply Chain Hub:', notBuilt: 'Endnu ikke bygget:' }
const uiFor = language => LOCALIZED[language]?.ui || DANISH_UI
// Translated texts for the entry, or null (then the Danish entry is used behind a short notice).
const localModule = (module, language) => LOCALIZED[language]?.modules[module.id] || null
const localTask = (module, task, language) => localModule(module, language)?.tasks?.[task.id] || null
const localTopic = (topic, language) => LOCALIZED[language]?.topics[topic.id] || null
const withNotice = (text, translated, language) => translated ? text : LOCALIZED[language] ? `${LOCALIZED[language].ui.onlyDanish}\n${humanizeDanish(text)}` : humanizeDanish(text)

// The Danish base text is ASCII-transliterated (it feeds the matching). Shown to a user it must read as real Danish.
const DANISH_WORDS = Object.fromEntries(`aendr:ændr aendre:ændre aendres:ændres aendringer:ændringer aendringerne:ændringerne afgoerelsen:afgørelsen ansoeg:ansøg ansoegeren:ansøgeren behoever:behøver bekraefter:bekræfter bemaerk:bemærk bemaerkning:bemærkning beroerte:berørte faelles:fælles faerdig:færdig foedselsdag:fødselsdag foelg:følg foerer:fører foreslaa:foreslå fravaer:fravær fravaerende:fraværende fremgangsmaaden:fremgangsmåden faa:få faar:får gaelder:gælder gennemgaa:gennemgå gennemgaar:gennemgår gennemgaas:gennemgås gaa:gå gaar:går hjaelpe:hjælpe hjoernet:hjørnet koerer:kører kraever:kræver laengere:længere laes:læs laese:læse loebe:løbe loest:løst laast:låst moenster:mønster moensteret:mønsteret naermer:nærmer naeste:næste naar:når oejeblik:øjeblik oenskede:ønskede oeverst:øverst ogsaa:også proever:prøver paa:på paamindelse:påmindelse raekke:række saet:sæt slaa:slå spaerret:spærret spoerg:spørg spoerge:spørge saa:så saadan:sådan tilfoej:tilføj tilgaengeligt:tilgængeligt tvaers:tværs vaelg:vælg vaelge:vælge vaelges:vælges vaere:være aabent:åbent aabn:åbn aabne:åbne aabnes:åbnes spilhjoernet:spilhjørnet koedben:kødben braettet:brættet foelger:følger soeg:søg traek:træk laeg:læg staar:står daekke:dække foerste:første`.split(' ').map(pair => pair.split(':')))
function humanizeDanish(text) {
  return String(text).replace(/[A-Za-z]+/g, word => {
    const real = DANISH_WORDS[word.toLowerCase()]
    return real ? (word[0] === word[0].toUpperCase() ? real[0].toUpperCase() + real.slice(1) : real) : word
  })
}

// `keywords` bruges til scoring. De skal vaere ord brugeren selv ville skrive,
// ikke interne feltnavne.
const APP_GUIDE = [
  {
    id: 'shifts',
    view: 'shifts',
    title: 'Vagtplan',
    summary: 'Ugeplan hvor hver medarbejder kan tildeles opgaver paa bestemte datoer. Weekender, helligdage, ferie og sygdom er automatisk spaerret.',
    where: 'Aabn feltet "Vagtplan" paa forsiden.',
    keywords: ['vagt', 'vagtplan', 'skema', 'opgave', 'rolle', 'uge', 'tildel', 'planlaegning', 'shift', 'shifts', 'schedule', 'vuoro', 'vuorot', 'schema', 'schemat', 'arbetspass', 'mina pass', 'passen'],
    tasks: [
      {
        id: 'assign-task',
        title: 'Tildel en opgave til en medarbejder',
        keywords: ['tildel', 'tilfoej', 'opgave', 'vagt', 'paa en dato', 'saet', 'assign', 'add task', 'tilldela', 'lisaeae tehtaevae'],
        steps: [
          'Find cellen hvor medarbejderens raekke krydser den oenskede dato.',
          'Klik "Tilfoej" i cellen.',
          'Vaelg opgaven i listen. Den gemmes med det samme.',
        ],
        notes: 'Er personen paa ferie eller sygemeldt den dag, er cellen laast, og du faar en besked om hvorfor.',
      },
      {
        id: 'recurring',
        title: 'Opret en gentaget vagt',
        keywords: ['gentag', 'gentagen', 'gentagne', 'hver uge', 'hver anden uge', 'fast', 'tilbagevendende', 'moenster', 'interval', 'recurring', 'repeat', 'toistuva', 'aaterkommande'],
        steps: [
          'Klik "Gentagne vagter" oeverst i vagtplanen.',
          'Vaelg medarbejder, opgave og de ugedage den skal gentages paa.',
          'Vaelg interval: hver uge og op til hver sjette uge.',
          'Vaelg startdato, og eventuelt en slutdato hvis den ikke skal loebe for evigt.',
          'Klik "Opret gentaget vagt".',
        ],
        notes: 'Gentagne vagter udfoldes automatisk i kalenderen. Der oprettes ikke enkeltrækker for hver uge.',
      },
      {
        id: 'edit-recurring',
        title: 'Ret eller slet en gentaget vagt',
        keywords: ['ret', 'rediger', 'aendre', 'slet', 'gentagen', 'moenster'],
        steps: [
          'Aabn "Gentagne vagter".',
          'Find moensteret paa listen under formularen. Du kan skjule/vise listen og filtrere den paa opgave eller medarbejder.',
          'Klik blyanten for at rette moensteret, eller papirkurven for at slette det.',
          'Retter du, udfyldes formularen med moensteret, og knappen skifter til "Gem aendringer".',
        ],
        notes: 'En vagt der kommer fra et gentaget moenster kan ikke slettes enkeltvis i kalenderen. Ret eller slet moensteret i stedet.',
      },
      {
        id: 'roles',
        title: 'Opret eller ret en opgavetype',
        keywords: ['opgavetype', 'rolle', 'ny opgave', 'farve', 'opret opgave'],
        steps: [
          'Klik "Tilfoej Opgave" i vagtplanen.',
          'Skriv navnet og vaelg en farve.',
          'Gem. Opgaven kan nu vaelges i alle celler.',
        ],
        notes: 'Sletter du en opgavetype, mister eksisterende tildelinger deres opgave. De vises derefter som "Ukendt opgave" og kan knyttes til en anden opgave med ét klik.',
      },
      {
        id: 'comment',
        title: 'Skriv en kommentar paa en vagt',
        keywords: ['kommentar', 'note paa vagt', 'bemaerkning'],
        steps: ['Klik kommentar-ikonet i cellen.', 'Skriv teksten og gem.'],
      },
    ],
  },
  {
    id: 'calendar',
    view: 'calendar',
    title: 'Kalender',
    summary: 'Samlet overblik over ferie, sygdom og hjemmearbejde for hele teamet.',
    where: 'Aabn feltet "Kalender" paa forsiden.',
    keywords: ['kalender', 'ferie', 'fri', 'sygdom', 'syg', 'hjemmearbejde', 'hjemme', 'fravaer', 'calendar', 'kalenteri', 'loma', 'semester', 'sjuk', 'hemarbete', 'franvaro'],
    tasks: [
      {
        id: 'request-vacation',
        title: 'Ansoeg om ferie',
        keywords: ['ferie', 'ansoeg', 'anmod', 'fri', 'orlov', 'feriedage', 'vacation', 'holiday', 'time off', 'day off', 'loma', 'hae lomaa', 'semester', 'ansoeka', 'ansoeker', 'ledighet', 'ledig dag'],
        steps: [
          'Aabn Kalender og klik "Anmod om Ferie".',
          'Vaelg start- og slutdato, og skriv eventuelt en bemaerkning.',
          'Send anmodningen.',
        ],
        notes: 'Anmodningen sendes til teamets managere og har status "afventer", indtil den er godkendt eller afvist. Du faar besked om afgoerelsen.',
      },
      {
        id: 'approve-vacation',
        title: 'Godkend eller afvis en ferieanmodning',
        keywords: ['godkend', 'afvis', 'anmodning', 'ferie', 'behandle', 'godkaenn', 'avvisa', 'semesteransoekan', 'godkaenner semester', 'godkaenna semester', 'approve', 'reject', 'vacation', 'hyvaeksy', 'hylkaeae', 'lomahakemus', 'loma', 'hakemus'],
        requires: MANAGER,
        steps: [
          'Aabn Kalender. Afventende anmodninger vises samlet.',
          'Vaelg anmodningen og klik godkend eller afvis.',
        ],
        notes: 'Ansoegeren faar automatisk besked. Kun managere ser disse knapper.',
      },
      {
        id: 'sick-leave',
        title: 'Meld dig syg',
        keywords: ['syg', 'sygemeld', 'sygemelding', 'barn syg', 'sygdom', 'sick', 'ill', 'sairas', 'sairaa', 'sairausloma', 'sjuk', 'sjukanmael', 'sjukskriv', 'sjukdom', 'vabb'],
        steps: [
          'Klik "Syg" paa forsiden.',
          'Vælg dato, og angiv om det er dig selv eller et sygt barn. Vil du melde en kollega syg, så vælg kollegaen i feltet "Medarbejder".',
          'Skriv eventuelt en bemaerkning og indsend.',
        ],
        notes: 'En sygemelding kraever ingen godkendelse. Den registreres med det samme. Sygemeldingen gemmes kun, til den sidste sygedag er slut. Derefter slettes den automatisk, og hubben gemmer ingen sygdomshistorik.',
      },
      {
        id: 'home-office',
        title: 'Registrer hjemmearbejde',
        keywords: ['hjemme', 'hjemmearbejde', 'hjemmekontor', 'arbejde hjemmefra', 'work from home', 'home office', 'etaetyoe', 'hemarbete', 'jobba hemifraan', 'arbeta hemifraan', 'distansarbete'],
        steps: [
          'Aabn Kalender og gaa til hjemmearbejde.',
          'Vaelg de faste ugedage du normalt arbejder hjemme.',
          'Har du en enkelt dag der afviger fra din faste plan, registreres den som en undtagelse paa den dato.',
        ],
        notes: 'Hjemmearbejde er ikke fravaer. Man arbejder stadig, og det vises derfor adskilt fra ferie og sygdom.',
      },
      {
        id: 'parental-leave',
        title: 'Barsel',
        where: 'Barsel registreres i "Manager Panel" (kun for ledere) og vises i "Kalender".',
        keywords: ['barselsorlov', 'parental', 'parental leave', 'maternity', 'paternity', 'perhevapaa', 'perhevapaata', 'vanhempainvapaa', 'föräldraledig', 'föräldraledighet', 'ansøge om barsel', 'ansøg om barsel', 'kan jeg registrere barsel', 'can i register parental', 'voinko kirjata perhevapaan', 'kan jag registrera föräldraledighet'],
        steps: [
          'Barsel registreres af en leder direkte, uden ansøgning. Lederen bruger knappen "Registrer barsel" i Manager Panel.',
          'Som medarbejder ansøger du ikke selv om barsel og kan ikke selv oprette, ændre eller slette den. Kontakt din leder, hvis datoerne skal rettes.',
          'I hubben vises personen med "(barsel)", og for alle, der har fri, står der, hvornår de er tilbage.',
        ],
        notes: 'Barsel blokerer vagter og opgaver ligesom ferie. Hubert kan sige, hvem der er på barsel, og hvornår de er tilbage.',
      },
    ],
  },
  {
    id: 'projects',
    view: 'projects',
    title: 'To Do',
    summary: 'Faelles to-do\'s for teamet og dine egne personlige to-do\'s, med mulighed for forfaldsdato.',
    where: 'Aabn feltet "To Do" paa forsiden.',
    keywords: ['to do', 'todo', 'goeremaal', 'liste', 'huskeliste', 'projekt', 'deadline', 'forfald', 'att goera', 'uppgiftslista', 'tehtaevaelista'],
    tasks: [
      {
        id: 'create-todo',
        title: 'Opret en to-do',
        keywords: ['opret', 'tilfoej', 'ny', 'to do', 'todo', 'opgave til mig selv', 'lav', 'lave', 'att goera', 'laegg till', 'lisaeae', 'add'],
        steps: [
          'Aabn To Do og vaelg om den skal vaere faelles for teamet eller personlig.',
          'Skriv titel og eventuelt en beskrivelse.',
          'Saet en forfaldsdato hvis den skal have en - og eventuelt et klokkeslaet.',
          'Gem.',
        ],
        notes: 'Personlige to-do\'s kan kun ses af dig. Faelles to-do\'s kan ses af hele teamet. Under personlige kan du vaelge "Aftale" for noget uden flueben, fx et moede. Du kan ogsaa tilfoeje direkte fra "Min uge" paa forsiden med plus-knappen ved dagen og skrive tiden i teksten, fx "Moede med Anna kl. 13-14".',
      },
      {
        id: 'edit-todo',
        title: 'Ret eller afslut en to-do',
        keywords: ['ret', 'rediger', 'aendre', 'faerdig', 'afslut', 'luk', 'slet'],
        steps: [
          'Klik blyanten ud for to-do\'en for at rette titel eller beskrivelse.',
          'Marker den som faerdig naar den er loest.',
        ],
      },
    ],
  },
  {
    id: 'guides',
    view: 'guides',
    title: 'Guide Bibliotek',
    summary: 'Afdelingens guider og procedurer, med versionsstyring, godkendelse og fast interval for naeste gennemgang.',
    where: 'Aabn feltet "Guide Bibliotek" paa forsiden.',
    keywords: ['guide', 'guides', 'vejledning', 'procedure', 'instruktion', 'manual', 'dokumentation', 'opas', 'oppaa', 'ohje', 'guider', 'rutin', 'vaegledning'],
    tasks: [
      {
        id: 'create-guide',
        title: 'Opret en guide',
        keywords: ['opret', 'skriv', 'ny guide', 'lav en guide', 'upload', 'importer', 'create', 'luo', 'luon', 'lisaeae', 'skapa', 'ladda upp'],
        steps: [
          'Aabn Guide Bibliotek og klik "Ny guide".',
          'Skriv titel og indhold, opdelt i afsnit og trin.',
          'Vaelg hvor ofte guiden skal gennemgaas, og hvilken dato naeste gennemgang skal ske.',
          'Vaelg eventuelt en ansvarlig for gennemgangen, hvis det ikke skal vaere dig selv.',
          'Gem som kladde, eller send den til godkendelse.',
        ],
        notes: 'Editoren gemmer automatisk en kladde undervejs, saa arbejdet ikke gaar tabt hvis appen lukkes.',
      },
      {
        id: 'review-guide',
        title: 'Faa en guide godkendt og udgivet',
        keywords: ['godkend', 'review', 'udgiv', 'publicer', 'kladde', 'anmodning'],
        steps: [
          'Send guiden til godkendelse fra editoren med knappen "Send til review".',
          'En guide-administrator gennemgaar den og godkender eller afviser.',
          'Naar den er godkendt, udgives den som en ny version og bliver synlig for dem der har adgang.',
        ],
        notes: 'En kladde er kun synlig for dig, indtil den er udgivet. Tidligere versioner gemmes, saa man kan se historikken.',
      },
      {
        id: 'guide-access',
        title: 'Faa adgang til en guide du ikke kan se',
        keywords: ['adgang', 'kan ikke se', 'laast', 'rettighed', 'anmod om adgang'],
        steps: [
          'Find guiden i biblioteket og anmod om adgang.',
          'En guide-administrator behandler anmodningen.',
        ],
      },
      {
        id: 'guide-review-due',
        title: 'Hold guider opdaterede',
        keywords: ['gennemgang', 'naeste tjek', 'forfalden', 'opdatere guide', 'ansvarlig'],
        steps: [
          'Guider har en dato for naeste gennemgang.',
          'Den ansvarlige faar en paamindelse, naar datoen naermer sig.',
          'Gennemgaa indholdet, ret det der ikke passer laengere, og saet en ny dato.',
        ],
        notes: 'Den ansvarlige behoever ikke vaere den der skrev guiden.',
      },
      {
        id: 'import-word-guide',
        title: 'Importér en Word-guide',
        keywords: ['word guide', 'word-guide', 'word guider', 'word dokument', 'docx', 'importer word', 'importér word', 'importere word', 'importerer jeg en word', 'import word', 'tuo word', 'tuon word', 'word opas', 'word oppaan', 'importera word', 'importerar jag en word', 'ladda upp word'],
        steps: [
          'Åbn Guide Bibliotek og klik "Importér Word-guide".',
          'Vælg Word-format: "Konvertér til redigerbare trin", hvis trinene skal kunne redigeres i hubben, eller "Bevar original Word-layout", hvis tabeller og sidelayout skal være præcise som i Word.',
          'Vælg .docx-filen, gennemgå guiden i editoren, og gem den som kladde eller klik "Send til review", hvis den skal godkendes før udgivelse.',
        ],
        notes: 'Med "Bevar original Word-layout" vises guiden som en PDF-visning lavet med Microsoft Word, så Word skal være installeret på din pc.',
      },
      {
        id: 'word-layout',
        title: '"Bevar original Word-layout"',
        direct: true,
        keywords: ['bevar original', 'original word-layout', 'original word layout', 'word-layout', 'word layout', 'to keep the layout', 'keep the layout', 'keep layout', 'bevare layoutet', 'bevare layout', 'bevare layoutet', 'keep original word', 'säilytä alkuperäinen', 'alkuperäinen word-asettelu', 'asettelun säilyttämiseksi', 'behåll ursprunglig', 'ursprunglig word-layout', 'behålla layouten', 'microsoft word'],
        steps: [
          'Guiden vises som en PDF-visning lavet med Microsoft Word, så tabeller og sidelayout er præcis som i Word.',
          'Trinene kan ikke redigeres i hubben. Vil du redigere trinene, så vælg "Konvertér til redigerbare trin" ved importen.',
          'Microsoft Word skal være installeret på din pc, for at PDF-visningen kan laves.',
        ],
      },
      {
        id: 'word-pdf-error',
        title: 'Fejlen "Word kunne ikke danne PDF-visningen"',
        direct: true,
        keywords: ['danne pdf', 'danne pdf-visningen', 'pdf visningen', 'pdf-visningen', 'kunne ikke danne', 'create the pdf preview', 'create pdf preview', 'pdf preview', 'pdf-esikatselu', 'pdf-esikatselua', 'luoda pdf', 'skapa pdf', 'pdf-förhandsvisningen', 'pdf förhandsvisningen', 'microsoft word er ikke tilgængelig', 'microsoft word is unavailable'],
        steps: [
          'Originalfilen er ikke ændret.',
          'Luk Word, hvis det er åbent, og prøv igen – eller åbn originalen i Word.',
          'Fik du beskeden i version 1.5.8 til 1.6.0, er fejlen rettet i 1.6.1: opdater appen til nyeste version.',
          'Siger beskeden, at Microsoft Word ikke er tilgængelig, kræver PDF-visningen Word på din pc. Vælg i stedet "Konvertér til redigerbare trin" ved importen.',
        ],
      },
      {
        id: 'shared-guide-images',
        title: 'Se billederne i en delt guide',
        direct: true,
        keywords: ['billederne i en', 'billeder i en', 'mangler billederne', 'billeder mangler', 'images in a', 'images are missing', 'missing images', 'images missing', 'oppaan kuvat', 'oppaiden kuvat', 'kuvat puuttuvat', 'bilderna i en', 'bilder i en', 'saknas bilderna', 'bilderna saknas'],
        steps: [
          'Delte guides viser deres billeder, også når guiden er lavet af et andet team.',
          'Mangler du adgang til guiden, så find den i biblioteket og klik "Anmod om adgang".',
          'Mangler billederne stadig, så opdater appen til nyeste version (billeder i delte guides blev rettet i 1.6.0) og åbn guiden igen.',
        ],
      },
    ],
  },
  {
    id: 'knowledge',
    view: 'knowledge',
    title: 'Knowledge Base',
    summary: 'Vidensartikler med fejlkoder, specifikationer og referenceviden. Opret manuelt eller importer Word og PDF; artikler har versioner, godkendelse og adgang pr. team.',
    where: 'Aabn feltet "Knowledge Base" paa forsiden ved siden af Guide Bibliotek.',
    keywords: ['knowledge base', 'vidensartikel', 'vidensbase', 'artikkeli', 'tietopankki', 'artikel', 'kunskapsbas'],
    tasks: [
      {
        id: 'create-article', title: 'Opret en vidensartikel',
        keywords: ['opret', 'skriv', 'ny vidensartikel', 'create', 'write', 'new article', 'luo', 'luon', 'skapa', 'skapar'],
        steps: ['Aabn Knowledge Base og klik "Ny vidensartikel".', 'Skriv titel og indhold i afsnit og trin, og vaelg kategori og sprog.', 'Vaelg gennemgangsdato og ansvarlig; gem som kladde eller send til godkendelse.'],
        notes: 'Kladder gemmes automatisk. Udgivelse bruger samme godkendelsesflow som Guide Bibliotek.',
      },
      {
        id: 'import-article', title: 'Importer Word eller PDF',
        keywords: ['import', 'importer', 'importerer', 'upload', 'pdf', 'word', 'docx', 'tuo', 'tuon', 'importera', 'importerar', 'ladda upp'],
        steps: ['Aabn Knowledge Base og klik "Importér dokument".', 'For Word: vaelg "Konvertér til redigerbare trin" eller "Bevar original Word-layout", og vaelg en .docx-fil. For PDF: vaelg PDF-import og en .pdf-fil.', 'Gennemgaa indholdet i editoren og gem som kladde eller send til godkendelse.'],
        notes: 'PDF-tekst bliver soegbar og kan oversaettes; originalen vises under "Original PDF". Scannede PDF-filer uden tekst understottes ikke.',
      },
      {
        id: 'article-access', title: 'Anmod om adgang til en vidensartikel',
        keywords: ['adgang', 'rettighed', 'anmod', 'access', 'permission', 'request access', 'paeaesy', 'paeaesyae', 'pyydaen', 'aatkomst', 'begaer', 'vidensartikel fra et andet', 'artikel fra et andet', 'artikel fra andet', 'article from another', 'access to a knowledge', 'access to an article', 'access to articles', 'article from a different', 'articles from other', 'toisen tiimin tietopankin', 'toisen tiimin artikkeli', 'artikeln från ett annat', 'artikel från ett annat'],
        steps: ['Aabn Knowledge Base og find artiklen fra det andet team.', 'Klik "Anmod om adgang". Det ejende teams manager behandler anmodningen i Manager Panel.', 'Naar den godkendes, kan du laese artiklen og dens filer i 2 dage.'],
        notes: 'Uden godkendelse vises kun metadata. En adgang til en guide giver ikke adgang til en vidensartikel.',
      },
      {
        id: 'guide-or-article',
        title: 'Guide eller vidensartikel?',
        direct: true,
        keywords: ['en guide og en vidensartikel', 'guide og vidensartikel', 'guide eller vidensartikel', 'a guide and a knowledge', 'guide or knowledge', 'guide and knowledge article', 'oppaalla ja tietopankin', 'oppaan ja tietopankin', 'guide och en kunskapsbas', 'guide och kunskapsbas'],
        steps: [
          'Guide Bibliotek er til fremgangsmåder trin for trin: sådan gør du noget.',
          'Knowledge Base er til opslagsviden som fejlkoder, specifikationer og referencer.',
          'Begge har versioner, godkendelse og adgang pr. team.',
        ],
      },
      {
        id: 'translate-article', title: 'Oversæt en vidensartikel',
        keywords: ['oversaet', 'translate', 'translation', 'kaeaenna', 'kaeaennaen', 'oever saett', 'oeversaett'],
        steps: ['Aabn artiklen i Knowledge Base og vaelg tekstvisningen, hvis den har en original PDF.', 'Vaelg Dansk, Engelsk, Finsk eller Svensk i artikelvisningen.', 'Vaelg originalsproget for at vende tilbage til den originale tekst.'],
        notes: 'Oversættelsen ændrer ikke den gemte artikel eller den originale Word- eller PDF-fil.',
      },
    ],
  },
  {
    id: 'notebook',
    view: 'notebook',
    title: 'Notesbog',
    summary: 'Delte og personlige noter for teamet, med tags og forfatter.',
    where: 'Aabn feltet "Notesbog" paa forsiden.',
    keywords: ['note', 'noter', 'notesbog', 'notebook', 'skriv ned', 'referat', 'muistiinpano', 'anteckning', 'anteckningsbok'],
    tasks: [
      {
        id: 'create-note',
        title: 'Opret en note',
        keywords: ['opret', 'tilfoej', 'skriv', 'ny note', 'skriv note', 'tilfoej note', 'lav', 'lave', 'new note', 'write', 'add', 'create', 'kirjoita', 'kirjoitan', 'luo', 'lisaeae', 'skapa'],
        steps: [
          'Aabn Notesbog og opret en ny note.',
          'Vaelg om den skal vaere delt med teamet eller personlig.',
          'Skriv titel og indhold, og tilfoej eventuelt tags.',
          'Gem.',
        ],
        notes: 'Personlige noter kan kun ses af dig.',
      },
    ],
  },
  {
    id: 'email',
    view: 'email',
    title: 'Email System',
    summary: 'Interne beskeder mellem kolleger i hubben. Ikke almindelig e-mail ud af huset.',
    where: 'Aabn feltet "Email System" paa forsiden.',
    keywords: ['besked', 'beskeder', 'mail', 'email', 'indbakke', 'skriv til', 'message', 'viesti', 'meddelande', 'inkorg', 'e post'],
    tasks: [
      {
        id: 'send-message',
        title: 'Send en besked',
        keywords: ['send', 'skriv', 'ny besked', 'kontakt kollega', 'write', 'compose', 'laehetae', 'kirjoita', 'skicka', 'skriva'],
        steps: [
          'Aabn Email System og klik "Ny Email".',
          'Vaelg modtager, skriv emne og tekst.',
          'Send.',
        ],
      },
      {
        id: 'read-message',
        title: 'Laes dine beskeder',
        keywords: ['laes', 'laeser', 'read', 'reply', 'svar', 'lue', 'lukea', 'laesa', 'laeser', 'indbakke', 'inbox', 'inkorg'],
        steps: [
          'Aabn Email System.',
          'Vaelg "Indbakke" for modtagne beskeder eller "Sendt" for dem du selv har sendt.',
          'Klik paa en besked for at aabne den.',
        ],
      },
    ],
  },
  {
    id: 'team',
    view: 'team',
    title: 'Team Oversigt',
    summary: 'Kontaktoplysninger paa teamets medlemmer: navn, rolle, arbejdstelefon og foedselsdag.',
    where: 'Aabn feltet "Team Oversigt" paa forsiden.',
    keywords: ['team', 'kollega', 'kolleger', 'telefon', 'kontakt', 'hvem er', 'foedselsdag', 'medarbejder', 'kollegor', 'medarbetare', 'foedelsedag', 'teamoeversikt', 'colleague', 'coworker', 'phone', 'contact', 'birthday', 'tyoekaveri', 'puhelin', 'yhteystiedot', 'syntymaepaeivae'],
    tasks: [
      {
        id: 'find-contact',
        title: 'Find en kollegas kontaktoplysninger',
        keywords: ['telefon', 'telefonnummer', 'nummer', 'kontakt', 'phone', 'number', 'contact', 'puhelin', 'puhelinnumero', 'yhteystiedot', 'foedselsdag', 'birthday', 'syntymaepaeivae', 'foedelsedag'],
        steps: [
          'Aabn Team Oversigt.',
          'Skriv navn eller e-mail i soegefeltet, eller find kollegaen paa listen. Navn, rolle, arbejdstelefon og foedselsdag vises.',
        ],
      },
    ],
  },
  {
    id: 'meals',
    view: 'meals',
    title: 'Madplan',
    summary: 'Ugens madplan for kantinen paa Energivej.',
    where: 'Aabn feltet "Madplan" paa forsiden.',
    keywords: ['mad', 'madplan', 'frokost', 'kantine', 'menu', 'spise', 'lunch', 'canteen', 'meal plan', 'meal', 'ruoka', 'ruokalista', 'lounas', 'matsedel', 'matsedeln', 'mat', 'kantin'],
    tasks: [],
  },
  {
    id: 'improvements',
    view: 'improvements',
    title: 'Forbedringer og forslag',
    summary: 'Faelles forbedringsforslag paa tvaers af Supply Chain: opret et forslag, inviter en ansvarlig og deltagere, foelg fremdrift og faa afslutningen godkendt. Listen viser de igangværende forslag, mens gennemførte og afviste ligger under hver sin knap.',
    where: 'Aabn feltet "Forbedringer og forslag" paa forsiden.',
    keywords: ['forbedring', 'forbedringer', 'forslag', 'ide', 'ideer', 'improvement', 'suggestion', 'parannus', 'ehdotus', 'foerbaettring', 'foerslag'],
    tasks: [
      {
        id: 'create-suggestion',
        title: 'Opret et forbedringsforslag',
        keywords: ['nyt forslag', 'opret forslag', 'foreslaa', 'ny ide', 'new suggestion', 'forbedringsforslag', 'create a suggestion', 'suggest an improvement', 'uusi ehdotus', 'nytt foerslag', 'skapa foerslag', 'foerbaettringsfoerslag', 'giv et forslag', 'forslag', 'suggest', 'ehdota', 'foereslaa', 'foerslag', 'ehdotu'],
        steps: [
          'Aabn Forbedringer og forslag og klik "Nyt forslag".',
          'Beskriv problemet og dit forslag, og vaelg kategori og de beroerte afdelinger.',
          'Vælg en ansvarlig. Et nyt forslag skal have en ansvarlig fra start. Vælger du en anden end dig selv, får personen en invitation til at være ansvarlig.',
          'Klik "Opret forslag".',
        ],
      },
      {
        id: 'list-views',
        title: 'Se igangværende, gennemførte og afviste forslag',
        keywords: ['igangvaerende', 'gennemfoerte', 'gennemfoert', 'afviste', 'afvist', 'ongoing', 'completed', 'declined', 'kaeynnissae olevat', 'valmiit', 'hylaetyt', 'pagaaende', 'genomfoerda', 'avvisade'],
        steps: [
          'Åbn Forbedringer og forslag. Listen viser som standard de igangværende forslag.',
          'Klik "Gennemførte" for at se de afsluttede forslag, eller "Afviste" for de forslag, der er afvist.',
          'Klik "Igangværende" for at gå tilbage til de aktive forslag.',
        ],
      },
      {
        id: 'answer-invitation',
        title: 'Svar paa en invitation til et forslag',
        keywords: ['invitation', 'inviteret', 'accepter', 'afvis', 'ansvarlig'],
        steps: [
          'Aabn forslaget under "Forbedringer og forslag".',
          'Klik "Accepter invitation" eller "Afvis invitation".',
        ],
      },
      {
        id: 'finish-improvement',
        title: 'Meld en forbedring faerdig',
        keywords: ['faerdig', 'afslut', 'godkendelse', 'meld faerdig'],
        steps: [
          'Aabn forslaget som den ansvarlige.',
          'Klik "Meld faerdig (til godkendelse)". En leder godkender derefter afslutningen.',
        ],
      },
      {
        id: 'unseen-changes',
        title: 'Den blå prik ved et forslag',
        direct: true,
        keywords: ['blaa prik', 'bla prik', 'blaa pricken', 'bla pricken', 'blaa prick', 'bla prick', 'blue dot', 'sininen piste', 'sinisen pisteen', 'nye ændringer', 'new changes', 'uusia muutoksia', 'nya ändringar', 'ikke har set'],
        steps: [
          'Et forslag, der har med dig at gøre og har ændringer, du ikke har set, har en blå prik i listen. Peger du på prikken, står der "Nye ændringer, du ikke har set".',
          'Åbn forslaget. Så regnes ændringerne for set, og prikken forsvinder.',
        ],
      },
    ],
  },
  {
    id: 'links',
    view: 'links',
    title: 'Link Library',
    summary: 'Fælles links til de hjemmesider, afdelingen bruger i arbejdet. Alle kan tilføje et link, og en manager i afdelingen godkender det, før kollegerne kan se det. Links kan deles med andre afdelinger og åbnes i din standardbrowser.',
    where: 'Åbn feltet "Link Library" på forsiden.',
    keywords: ['link library', 'linkbibliotek', 'linkbiblioteket', 'links', 'linket', 'linkene', 'hjemmeside', 'hjemmesider', 'bogmaerke', 'bogmaerker', 'website', 'websites', 'bookmark', 'bookmarks', 'linkki', 'linkit', 'linkkejae', 'linkkikirjasto', 'verkkosivu', 'kirjanmerkki', 'laenk', 'laenkar', 'laenken', 'laenkbibliotek', 'webbplats', 'bokmaerke'],
    tasks: [
      {
        id: 'open-link',
        title: 'Find og åbn et link',
        keywords: ['aabn et link', 'aabne et link', 'aabner et link', 'find et link', 'finde et link', 'soeg efter et link', 'favoritlinks', 'mine favoritter', 'open a link', 'find a link', 'search for a link', 'my favourites', 'avaa linkki', 'avaan linkin', 'avata linkin', 'etsi linkki', 'loeydaen linkin', 'omat suosikit', 'oeppna en laenk', 'oeppnar en laenk', 'hitta en laenk', 'mina favoriter'],
        steps: [
          'Åbn "Link Library" på forsiden.',
          'Søg i titel, beskrivelse eller domæne, eller vælg en kategori. "Mine favoritter" viser de links, du har markeret med stjernen.',
          'Klik linket for at åbne det i din standardbrowser.',
        ],
        notes: 'Du kan også spørge Hubert, fx «hvor er linket til SAP?». Hubert finder linket ud fra beskrivelsen og viser knappen "Åbn link". Ctrl+K finder også links.',
      },
      {
        id: 'add-link',
        title: 'Tilføj et link',
        keywords: ['tilfoej et link', 'tilfoeje et link', 'tilfoej link', 'nyt link', 'opret et link', 'oprette et link', 'gem et link', 'del et link', 'dele et link', 'add a link', 'add link', 'new link', 'create a link', 'save a link', 'share a link', 'lisaeae linkki', 'lisaeaen linkin', 'lisaetae linkki', 'uusi linkki', 'jaa linkki', 'laegg till en laenk', 'laegga till en laenk', 'laegger jag till en laenk', 'till en laenk', 'laegg till laenk', 'ny laenk', 'skapa en laenk', 'dela en laenk'],
        steps: [
          'Åbn "Link Library" og klik "Tilføj link".',
          'Skriv webadressen (den skal starte med https:// eller http://), en titel og en beskrivelse af, hvad I bruger siden til. Hubert bruger beskrivelsen til at finde linket.',
          'Vælg eventuelt en kategori, og sæt flueben ved de andre afdelinger, linket skal deles med.',
          'Klik "Gem". En manager i din afdeling skal godkende linket, før kollegerne kan se det. Du får besked i klokken, når det er godkendt eller afvist.',
        ],
        notes: 'Managere godkender ikke deres egne links: de bliver synlige med det samme. Et delt link ligger kun ét sted, så ændringer slår igennem for alle de valgte afdelinger.',
      },
      {
        id: 'suggest-change',
        title: 'Foreslå en ændring til et link',
        keywords: ['foreslaa en aendring til et link', 'aendring til et link', 'ret et link', 'rette et link', 'forkert beskrivelse', 'link er flyttet', 'suggest a change to a link', 'change a link', 'edit a link', 'wrong description', 'ehdota muutosta linkkiin', 'muuta linkkiae', 'korjaa linkki', 'foereslaa en aendring av en laenk', 'aendra en laenk', 'redigera en laenk'],
        steps: [
          'Klik menuen med de tre prikker ved linket og vælg "Foreslå ændring".',
          'Udfyld kun det, der skal ændres, og skriv gerne hvorfor.',
          'Klik "Send forslag". En manager i den afdeling, der ejer linket, godkender eller afviser forslaget.',
        ],
        notes: 'Managere i ejer-afdelingen kan rette linket direkte med "Rediger". Det kan du også selv, så længe dit eget link venter på godkendelse.',
      },
      {
        id: 'report-link',
        title: 'Rapportér et link, der ikke virker',
        keywords: ['rapporter et link', 'rapportere et link', 'doedt link', 'doed link', 'link virker ikke', 'linket virker ikke', 'link ikke virker', 'linket ikke virker', 'mistaenkeligt link', 'farligt link', 'report a link', 'broken link', 'dead link', 'link does not work', 'suspicious link', 'ilmoita linkistae', 'rikkinaeinen linkki', 'linkki ei toimi', 'epaeilyttaevae linkki', 'rapportera en laenk', 'trasig laenk', 'laenken fungerar inte', 'laenken inte fungerar', 'laenk inte fungerar', 'misstaenkt laenk'],
        steps: [
          'Klik menuen med de tre prikker ved linket og vælg "Rapportér".',
          'Vælg hvorfor: "Linket virker ikke", "Forkert indhold eller beskrivelse" eller "Mistænkeligt / farligt", og uddyb gerne.',
          'Klik "Rapportér". Managerne i den afdeling, der ejer linket, får besked i klokken.',
        ],
        notes: 'Et link, der er rapporteret som mistænkeligt, skjules med det samme for alle undtagen managerne, indtil det er undersøgt.',
      },
      {
        id: 'approve-link',
        title: 'Godkend links, forslag og rapporter',
        requires: MANAGER,
        preferred: true,
        userTask: 'add-link',
        keywords: ['godkend et link', 'godkende et link', 'godkend links', 'godkende links', 'afvis et link', 'afvise et link', 'links til godkendelse', 'approve a link', 'approve links', 'reject a link', 'links to approve', 'hyvaeksy linkki', 'hyvaeksyae linkki', 'hyvaeksyn linkin', 'hyvaeksyae linkin', 'hylkaeae linkki', 'hyvaeksyttaevaet linkit', 'godkaenn en laenk', 'godkaenna en laenk', 'godkaenner jag en laenk', 'godkaenner en laenk', 'avvisa en laenk', 'laenkar att godkaenna'],
        steps: [
          'Åbn "Link Library" og vælg fanen "Til godkendelse". Klokken viser også, når noget venter.',
          'Ved nye links: klik "Åbn og test", læs advarslerne og klik "Godkend" eller "Afvis". Skriv gerne en begrundelse, når du afviser.',
          'Ved forslag: sammenlign "Nu" og "Forslag", og klik "Brug forslaget" eller "Afvis forslaget".',
          'Ved rapporter: klik "Linket er i orden" eller "Slet linket".',
        ],
        notes: 'Kun managere i den afdeling, der ejer linket, ser det. Advarslerne viser fx kort-links, IP-adresser og adresser uden https.',
      },
    ],
  },
  {
    id: 'games',
    view: 'games',
    title: 'Spil Hjoernet',
    summary: 'Spil til pauserne i tre sektioner: Arcade, Modern og Multiplayer. Arcade har fx Chicken Invaders, Prism Break, Parcel Pilot, Cargo Stack og Route Runner med highscores på tværs af teams, Modern har større 3D-spil som Cube Basher, og Multiplayer har Word-Puzzle og skak mod kolleger i alle teams.',
    where: 'Aabn feltet "Spil Hjoernet" paa forsiden og vaelg Arcade.',
    keywords: ['spil', 'spille', 'pause', 'highscore', 'point', 'arcade', 'modern', 'cube basher', 'chicken invaders', 'route runner', 'neon snake', 'cargo stack', 'tetris', 'parcel pilot', 'nexi flyer', 'prism break', 'brick break', 'spel', 'spela', 'spelhoernan', 'game', 'games', 'peli', 'pelit', 'pelaa'],
    tasks: [
      {
        id: 'game-sections',
        title: 'Find rundt i Spilhjørnet',
        direct: true,
        where: 'Åbn feltet "Spilhjørnet" på forsiden.',
        keywords: ['sektioner', 'hvad er modern', 'what is modern', 'mikä on modern', 'vad är modern', 'forskellen på arcade', 'arcade og modern', 'arcade and modern', 'arcade ja modern', 'arcade och modern', 'arcadella ja modernilla', 'arcade and multiplayer', 'modern and multiplayer', 'which sections'],
        steps: [
          'Åbn "Spilhjørnet" på forsiden. Her er tre sektioner: "Arcade", "Modern" og "Multiplayer".',
          '"Arcade": Chicken Invaders, Prism Break, Parcel Pilot, Cargo Stack og Route Runner, med highscores på tværs af teams.',
          '"Modern": større 3D-spil – Cube Basher.',
          '"Multiplayer": Word-Puzzle og skak mod kolleger i alle teams.',
        ],
      },
      {
        id: 'play-game',
        title: 'Spil et spil og se highscores',
        excludes: ['skak', 'chess', 'shakki', 'schack', 'word puzzle', 'multiplayer', 'udfordr', 'challenge', 'haast', 'utman', 'modstander', 'opponent'],
        keywords: ['start', 'spil', 'spille', 'play', 'game', 'pelaa', 'pelin', 'aloita', 'aloitan', 'spela', 'spel', 'highscore', 'highscores', 'huipputulo', 'huipputulokset', 'topplist'],
        steps: [
          'Aabn "Spil Hjoernet" paa forsiden og vaelg Arcade.',
          'Vaelg det spil du vil spille, og start det.',
        ],
        notes: 'Highscores vises paa tvaers af teams. Du kan ogsaa spoerge Hubert, fx "hvem foerer i Route Runner?".',
      },
    ],
  },
  {
    id: 'multiplayer',
    view: 'games',
    title: 'Multiplayer',
    summary: 'Word-Puzzle, skak og backgammon mod en kollega i et hvilket som helst team, ét træk ad gangen og i dit eget tempo. Spillene foregår i en hyggelig stue, hvor hunden Hubert bor, og du får besked, når det er din tur. Under "Dine opgør" kan du følge stillingen mod hver kollega.',
    where: 'Aabn feltet "Spilhjoernet" paa forsiden og vaelg "Multiplayer".',
    keywords: ['multiplayer', 'word puzzle', 'wordpuzzle', 'puzzle', 'ordspil', 'skak', 'chess', 'shakki', 'shakin', 'schack', 'backgammon', 'modstander', 'opponent', 'vastustaja', 'motstandare'],
    tasks: [
      {
        id: 'challenge-colleague',
        title: 'Udfordr en kollega i Word-Puzzle',
        excludes: ['skak', 'chess', 'shakki', 'schack', 'backgammon'],
        keywords: ['udfordr', 'udfordring', 'challenge', 'haasta', 'haaste', 'utman', 'inviter en kollega til spil'],
        steps: [
          'Aabn "Spilhjoernet" paa forsiden og vaelg "Multiplayer".',
          'Klik "Udfordr en kollega".',
          'Soeg efter en kollega (alle teams kan vaelges) og vaelg vedkommende.',
          'Vaelg sprog: Dansk, English, Svenska eller Suomi. Braettet, brikkerne og ordlisten foelger sproget.',
          'Klik "Send udfordring". Spillet starter, naar din kollega klikker "Acceptér" i Multiplayer.',
        ],
        notes: 'Din kollega faar besked i klokken. Mens udfordringen afventer, kan du klikke "Traek tilbage".',
      },
      {
        id: 'play-turn',
        title: 'Spil din tur i Word-Puzzle',
        keywords: ['laeg ord', 'laegge ord', 'laegg ord', 'byt brikker', 'giv op', 'min tur', 'din tur', 'tur', 'brikker', 'brickor', 'ordliste', 'ordlistan', 'play a word', 'play word', 'my turn', 'swap tiles', 'resign', 'word list', 'pelaa sana', 'vuoro', 'oma vuoro', 'laatat', 'luovuta', 'sanalista'],
        steps: [
          'Aabn spillet under "Din tur" i Multiplayer, eller klik notifikationen i klokken.',
          'Traek brikker fra dit stativ til braettet, eller klik et felt og skriv bogstaverne. Det foerste ord skal daekke stjernen i midten.',
          'Klik "Laeg ord". Du kan ogsaa vaelge "Pas", "Byt brikker" eller "Giv op".',
        ],
        notes: 'Staar ordet ikke i ordlisten, skal din modstander godkende eller afvise det ("Godkend ord" / "Afvis ord"). Afvises det, faar du brikkerne tilbage og proever igen.',
      },
      {
        id: 'approve-word',
        title: 'Godkend eller afvis et ukendt ord i Word-Puzzle',
        keywords: ['godkend ord', 'godkende ord', 'godkend et ord', 'afvis ord', 'afvise ord', 'ukendt ord', 'ukendte ord', 'ikke i ordlisten', 'staar ikke i ordlisten', 'ikke staar i ordlisten', 'inte finns i ordlistan', 'approve word', 'approve words', 'approve a word', 'approve an unknown word', 'reject words', 'reject a word', 'unknown word', 'unknown words', 'not in the word list', 'hyvaeksy sana', 'hyvaeksy sanat', 'hyvaeksyn sanan', 'tuntemattoman sanan', 'tuntemattomia sanoja', 'hylkaeae sana', 'tuntematon sana', 'ei ole sanalistalla', 'godkaenn ord', 'underkaenn ord', 'okaent ord', 'finns inte i ordlistan'],
        steps: [
          'Når din modstander lægger ord, der ikke står i ordlisten, får du besked i klokken.',
          'Åbn spillet i Multiplayer.',
          'Klik "Godkend ord", hvis ordene er rigtige, eller "Afvis ord", hvis de ikke er.',
        ],
        notes: 'Afviser du ordene, får din modstander sine brikker tilbage og må prøve igen. Trækket tæller først, når du har godkendt ordene.',
      },
      {
        id: 'match-chat',
        title: 'Skriv til din modstander under spillet',
        keywords: ['chat', 'keskustel', 'skriv', 'skriva', 'write', 'message', 'kirjoita', 'chat med modstander', 'chat med min modstander', 'chat i spillet', 'chat i word puzzle', 'skriv til modstander', 'skriv til min modstander', 'chat with my opponent', 'chat with opponent', 'chat in the game', 'chat in the match', 'write to my opponent', 'write to opponent', 'chatta med motstandare', 'skriv till motstandaren', 'keskustele vastustajan', 'kirjoita vastustajalle', 'chatta med motstaandare', 'chatta med min motstaandare', 'skriv till motstaandaren', 'skriv till min motstaandare', 'kirjoittaa vastustajalle', 'keskustella vastustajan kanssa', 'skrive til min modstander'],
        steps: [
          'Aabn spillet i Multiplayer.',
          'Skriv i feltet i notesbogen ("Chat") ved siden af braettet, og klik "Send".',
        ],
        notes: 'Din modstander faar besked i klokken, naar du har skrevet.',
      },
      {
        id: 'feed-hubert',
        title: 'Giv Hubert en godbid eller et koedben',
        keywords: ['godbid', 'koedben', 'giv hubert', 'feed hubert', 'give hubert', 'ge hubert', 'treat', 'meat bone', 'herku', 'herkku', 'lihaluu', 'godbit', 'koettben'],
        steps: [
          'Aabn et spil i Multiplayer.',
          'Klik "Kald paa Hubert".',
          'Vaelg "Giv en godbid" eller "Giv et koedben".',
        ],
        notes: 'Hver spiller kan give Hubert op til 10 godbidder og 2 koedben i hvert spil. Naar de er brugt, kan valget ikke vaelges mere.',
      },
      {
        id: 'send-emoji',
        title: 'Send en emoji til din modstander',
        keywords: ['emoji', 'emojis', 'emojien', 'emojin', 'smiley', 'smileys', 'reaktion', 'reaktioner', 'reaction', 'reactions', 'reagere', 'reagera', 'reaktio', 'reaktion i spillet', 'send en emoji', 'send emoji', 'send an emoji', 'send emojis', 'skicka en emoji', 'skickar jag en emoji', 'lähetä emoji', 'lähetän emojin', 'laehetae emoji', 'laehetaen emojin', 'emoji modstander', 'emoji opponent', 'emoji vastustajalle', 'emoji motståndare', 'emoji motstaandare'],
        steps: [
          'Åbn et spil i Multiplayer (Word-Puzzle eller skak).',
          'Klik "Emoji" ved siden af "Kald på Hubert".',
          'Vælg en af de otte emojis. Den dukker op på din modstanders skærm.',
        ],
        notes: 'Din modstander ser emojien flyve op over bordet, mens spillet er åbent, eller næste gang vedkommende åbner spillet (højst de tre nyeste, og hver kun én gang). En emoji er ikke et træk og giver ingen notifikation. Du kan sende en emoji hver tredje sekund.',
      },
      {
        id: 'chess-challenge',
        title: 'Udfordr en kollega i skak',
        direct: true,
        needsAny: ['skak', 'chess', 'shakki', 'shakissa', 'shakin', 'schack'],
        keywords: ['skak', 'chess', 'shakki', 'schack', 'udfordr', 'challenge', 'haasta', 'haaste', 'utman', 'shakkia', 'shakkiin', 'shakissa', 'til skak', 'to chess', 'spil skak', 'spiller skak', 'spiller jeg skak', 'spille skak', 'kollega i skak', 'colleague in chess', 'colleague to chess', 'kollega i schack', 'työkaverin shakkiin', 'työkaveri shakkiin', 'play chess', 'pelaa shakkia', 'pelaan shakkia', 'spela schack', 'spelar schack', 'spelar jag schack', 'vælge farve', 'vælg farve', 'valg af farve', 'choose my colour', 'choose my color', 'my colour', 'valita värin', 'välja färg'],
        steps: [
          'Åbn "Spilhjørnet" på forsiden og vælg "Multiplayer".',
          'Vælg skak og klik "Åbn spil". Klik derefter "Udfordr en kollega".',
          'Søg efter en kollega (alle teams kan vælges) og vælg vedkommende.',
          'Vælg din farve: hvid, sort eller tilfældig. Hvid trækker først. Vælger du tilfældig, trækkes der lod om farverne, når udfordringen accepteres.',
          'Klik "Send udfordring". Spillet starter, når din kollega klikker "Acceptér" i Multiplayer.',
        ],
        notes: 'Skak spilles uden ur: ét træk ad gangen i dit eget tempo. Din kollega får besked i klokken. Du spiller mod en kollega – Hubert er hunden i stuen og kigger med.',
      },
      {
        id: 'chess-move',
        title: 'Flyt en brik i skak',
        direct: true,
        needsAny: [...CHESS_WORDS, ...CASTLING_WORDS, 'en passant'],
        keywords: [...CHESS_WORDS, ...CASTLING_WORDS, 'flyt', 'flytter jeg', 'move a piece', 'move the piece', 'piece', 'siirr', 'siirtaa', 'nappula', 'flytta', 'pjäs', 'træk tilbage', 'tage et træk', 'fortryd', 'ur', 'take back', 'undo', 'clock', 'timer', 'siirto', 'siirron', 'perua', 'kello', 'kelloa', 'ta tillbaka', 'klocka', 'klockan', 'forvandl', 'promotion', 'en passant'],
        steps: [
          'Åbn spillet under "Din tur" i Multiplayer, eller klik notifikationen i klokken.',
          'Klik en brik, så vises de felter, den kan gå til, og klik et markeret felt – eller træk brikken derhen. Du kan også bruge piletasterne og Enter.',
          'Når en bonde når sidste række, vælger du, hvad den skal forvandles til.',
        ],
        notes: 'Skakreglerne tjekkes automatisk, så kun lovlige træk kan spilles (også rokade og en passant). Et spillet træk kan ikke tages tilbage. Skak spilles uden ur, så din modstander kan tage sig god tid.',
      },
      {
        id: 'chess-draw',
        title: 'Tilbyd remis eller giv op i skak',
        direct: true,
        keywords: [...CHESS_WORDS, 'remis', 'remi', 'draw', 'tasapeli', 'tasapelia', 'giv op', 'giver jeg op', 'giver op', 'opgiv', 'resign', 'give up', 'concede', 'luovuta', 'luovutan', 'ge upp', 'ger upp', 'ger jag upp'],
        steps: [
          'Åbn spillet i Multiplayer.',
          'Klik "Tilbyd remis" og bekræft. Din modstander kan klikke "Acceptér remis" eller "Afvis", og spillet fortsætter imens.',
          'Vil du opgive, så klik "Giv op" og bekræft. Din modstander vinder, og det kan ikke fortrydes.',
        ],
        notes: 'Trækker din modstander i stedet for at svare, er remistilbuddet afvist.',
      },
      {
        id: 'chess-result',
        title: 'Hvordan et skakparti slutter',
        direct: true,
        keywords: ['skakmat', 'sætter skakmat', 'giver skakmat', 'skak mat', 'pat i skak', 'patt i schack', 'patti shakissa', 'checkmate', 'checkmates', 'stalemate', 'shakkimat', 'tekee shakkimatin', 'schackmatt', 'ger schackmatt', 'schack matt', 'trefoldig', 'hvem vinder'],
        steps: [
          'Partiet slutter ved skakmat, pat, trefoldig stillingsgentagelse, 50-træksreglen, utilstrækkeligt materiale, aftalt remis eller hvis en spiller giver op.',
          'Resultatet kommer med i "Dine opgør" og "Rangliste".',
          'Klik "Revanche" i spillet for at spille igen mod samme kollega.',
        ],
      },
      {
        id: 'backgammon-challenge',
        title: 'Udfordr en kollega i backgammon',
        direct: true,
        needsAny: ['backgammon', 'backgammonia', 'backgammoniin'],
        keywords: ['backgammon', 'backgammonia', 'backgammoniin', 'udfordr', 'challenge', 'haasta', 'utman', 'spil backgammon', 'spille backgammon', 'play backgammon', 'pelaa backgammonia', 'spela backgammon', 'vælg farve', 'choose my colour', 'välja färg', 'valita värin'],
        steps: [
          'Åbn "Spilhjørnet" på forsiden og vælg "Multiplayer".',
          'Vælg backgammon og klik "Åbn spil". Klik derefter "Udfordr en kollega".',
          'Søg efter en kollega (alle teams kan vælges), og vælg din farve: hvid, sort eller tilfældig.',
          'Klik "Send udfordring". Spillet starter, når din kollega klikker "Acceptér", og åbningsslaget afgør, hvem der begynder.',
        ],
        notes: 'Terningerne slås automatisk af hubben, så ingen kan snyde. Spillet har ingen doblingsterning: en sejr giver 1 point, gammon 2 og backgammon 3.',
      },
      {
        id: 'backgammon-move',
        title: 'Flyt dine brikker i backgammon',
        direct: true,
        needsAny: ['backgammon', 'backgammonia', 'backgammonissa'],
        keywords: ['backgammon', 'backgammonissa', 'terning', 'terninger', 'dice', 'noppa', 'nopat', 'tärning', 'tärningar', 'flyt', 'move', 'siirrä', 'flytta', 'bar', 'baren', 'tage ud', 'bear off', 'ta ut', 'poista', 'afslut tur', 'end turn', 'avsluta tur', 'lopeta vuoro', 'videre', 'ingen træk', 'no moves', 'fortryd', 'undo'],
        steps: [
          'Åbn spillet under "Din tur" i Multiplayer, eller klik notifikationen i klokken. Dine terninger er allerede slået.',
          'Klik en af dine brikker, så vises de felter, den kan flytte til. Klik et markeret felt. Gentag for hver terning.',
          'Klik "Afslut tur", når alle terninger er brugt. "Fortryd" starter turen forfra, så længe du ikke har afsluttet.',
          'Kan du ikke flytte med slaget, står der "Du kan ikke flytte med dette slag". Klik "Videre".',
        ],
        notes: 'Hubben kender reglerne: en brik på baren skal ind først, et felt med to modstanderbrikker er lukket, og du skal bruge så mange terninger som muligt (kan kun én bruges, skal det være den højeste). Når alle dine brikker er hjemme, kan du tage dem ud. Vil du opgive, klik "Giv op".',
      },
      {
        id: 'rematch',
        title: 'Tag revanche',
        direct: true,
        keywords: ['revanche', 'rematch', 'revansch', 'uusinta', 'uusintaottelu', 'udfordr igen', 'challenge again', 'haasta uudelleen', 'haastan uudelleen', 'utmana igen'],
        steps: [
          'Når et spil er slut, klik "Revanche" i spillet.',
          'Eller åbn "Dine opgør" i lobbyen og klik "Udfordr igen" ved kollegaen.',
        ],
      },
      {
        id: 'rivals',
        title: 'Se din stilling mod en kollega ("Dine opgør")',
        direct: true,
        keywords: ['dine opgør', 'dine opgor', 'hvor mange sejre', 'mine sejre', 'sejre og nederlag', 'hvem fører i skak', 'how many wins', 'my wins', 'wins and losses', 'who leads in chess', 'montako voittoa', 'voittoa minulla', 'voitot ja tappiot', 'kuka johtaa shakissa', 'hur många segrar', 'mina segrar', 'vem leder i schack', 'stilling mod', 'stillingen mod', 'min stilling mod', 'min ställning mot', 'my score against', 'my record against', 'ser jeg stillingen', 'se stillingen', 'see the score', 'follow the score', 'score against', 'score versus', 'ser jag ställningen', 'se ställningen', 'head-to-head', 'head to head', 'head-to-heads', 'sinun ottelusi', 'ottelusi', 'tilanteen työkavereita vastaan', 'tilanne työkavereita vastaan', 'dina möten', 'ställningen mot', 'ställning mot', 'rangliste', 'leaderboard', 'ranking', 'fører ranglisten', 'ranglisten i skak', 'bedst i skak', 'bedste skakspiller', 'leads the leaderboard', 'leaderboard in chess', 'best at chess', 'best chess player', 'johtaa tulostaulukkoa', 'tulostaulukossa shakissa', 'paras shakissa', 'leder rankingen', 'bäst i schack'],
        steps: [
          'Åbn "Spilhjørnet" på forsiden og vælg "Multiplayer".',
          'Åbn spillet i lobbyen og find "Dine opgør". Her står stillingen mod hver kollega, du har spillet mod, fx 2–1.',
          'Klik "Udfordr igen" ved en kollega for en revanche.',
        ],
        notes: 'Stillingen kommer, når I har spillet et spil færdigt. Under "Rangliste" ses spillere fra alle teams. Du kan også spørge Hubert om dine egne resultater, fx "Hvor mange sejre har jeg i skak?".',
      },
      {
        id: 'top-words',
        title: 'Se de bedste ord i Word-Puzzle ("Top 10 ord")',
        direct: true,
        keywords: ['top 10 ord', 'bedste ord', 'de bedste ord', 'bedste lagte ord', 'højeste ord', 'flest point for et ord', 'top 10 words', 'best words', 'the best words', 'best word', 'highest scoring word', 'top 10 sanat', 'parhaat sanat', 'word-puzzlen parhaat sanat', 'paras sana', 'topp 10 ord', 'bästa orden', 'de bästa orden', 'bästa ordet'],
        steps: [
          'Åbn "Spilhjørnet" på forsiden, vælg "Multiplayer" og åbn Word-Puzzle.',
          'Find "Top 10 ord" under "Rangliste". Her står de 10 bedste ord, der er lagt i alle spil, med navn og point.',
        ],
        notes: 'Pointene er hele trækkets point, så krydsord og bonus for alle 7 brikker tæller med. Ord på alle sprog står på samme liste med et lille flag.',
      },
      {
        id: 'accept-challenge',
        title: 'Acceptér eller afvis en udfordring',
        direct: true,
        keywords: ['accepter', 'acceptér', 'accepterer jeg en udfordring', 'accepter en udfordring', 'acceptér en udfordring', 'accept a challenge', 'accept the challenge', 'acceptera', 'hyväksyn haasteen', 'hyväksy haasteen', 'haasteen', 'accepterar jag en utmaning', 'utmaning', 'invitationer', 'invitations', 'kutsut', 'inbjudningar'],
        steps: [
          'Du får besked i klokken, når en kollega udfordrer dig.',
          'Åbn Multiplayer. Udfordringen står under "Invitationer".',
          'Klik "Acceptér" for at starte spillet eller "Afvis" for at sige nej.',
        ],
      },
      {
        id: 'find-games',
        title: 'Find dine spil og invitationer',
        direct: true,
        keywords: ['mine skakspil', 'mine spil', 'my chess games', 'my games', 'chess games', 'skakspil', 'schackspel', 'mina schackspel', 'mina spel', 'shakkipeli', 'shakkipelini', 'omat pelit', 'pelini'],
        steps: [
          'Åbn "Spilhjørnet" på forsiden, vælg "Multiplayer", og åbn spillet (Word-Puzzle eller skak) med "Åbn spil".',
          'I lobbyen ligger dine spil i grupper: "Din tur", "Invitationer", "Venter på modstander" og "Afsluttede".',
          'Klik "Åbn" ved et spil for at spille videre, eller "Acceptér" / "Afvis" ved en invitation.',
        ],
        notes: 'Det er din tur, når du får besked i klokken.',
      },
      {
        id: 'word-check',
        title: 'Sprog og ordtjek i Word-Puzzle',
        direct: true,
        needsModule: true,
        keywords: ['tjekkes', 'tjekker', 'ordtjek', 'sprog kan jeg spille', 'spille word puzzle på finsk', 'på finsk', 'finsk', 'på svensk', 'på engelsk', 'suomi', 'languages can i play', 'in finnish', 'finnish', 'in swedish', 'words checked', 'word check', 'kielillä voin pelata', 'suomeksi', 'sanat tarkistetaan', 'tarkistetaan', 'språk kan jag spela', 'på finska', 'kontrolleras', 'kontrollerar'],
        steps: [
          'Når du klikker "Læg ord", tjekkes ordene automatisk mod ordlisten for spillets sprog – også bøjede ord.',
          'Står et ord ikke på listen, skal din modstander klikke "Godkend ord" eller "Afvis ord", før trækket tæller.',
          'Sproget vælges, når du udfordrer: Dansk, English, Svenska eller Suomi. Brættet, brikkerne og ordlisten følger sproget.',
        ],
      },
    ],
  },
  {
    id: 'manager',
    view: 'manager',
    title: 'Manager Panel',
    summary: 'Administration af teamet: godkend nye brugere, styr rettigheder, opgavetyper og guide-administratorer.',
    where: 'Aabn feltet "Manager Panel" paa forsiden. Feltet er kun aabent for managere.',
    requires: MANAGER,
    keywords: ['manager', 'managerpanel', 'administration', 'rettigheder', 'godkend bruger', 'ny bruger', 'new user', 'approve user', 'permissions'],
    tasks: [
      {
        id: 'approve-user',
        title: 'Godkend en ny bruger',
        keywords: ['godkend bruger', 'ny kollega', 'adgang', 'afventer godkendelse', 'approve user', 'approve a new user', 'new user', 'hyvaeksy kaeyttaejae', 'uusi kaeyttaejae', 'godkaenn anvaendare', 'ny anvaendare'],
        requires: MANAGER,
        steps: [
          'Aabn Manager Panel.',
          'Nye brugere der venter paa godkendelse vises samlet.',
          'Godkend personen, hvorefter vedkommende kan logge ind.',
        ],
      },
      {
        id: 'permissions',
        title: 'Aendr en brugers rolle og rettigheder',
        keywords: ['rettighed', 'rettigheder', 'managerrettigheder', 'giv manager', 'goer til manager', 'permissions', 'make manager', 'oikeudet'],
        requires: MANAGER,
        steps: [
          'Aabn Manager Panel og gaa til "Brugeroversigt & Rettigheder".',
          'Find brugeren paa listen.',
          'Vaelg rollen: bruger, manager eller administrator.',
        ],
        notes: 'Creator-brugerens rettigheder kan ikke aendres.',
      },
      {
        id: 'register-parental',
        title: 'Registrer barsel',
        requires: MANAGER,
        preferred: true,
        userTask: 'parental-leave',
        keywords: ['registrere barsel', 'registrer barsel', 'registrerer jeg barsel', 'registreres barsel', 'barsel registreres', 'opret barsel', 'opretter jeg barsel', 'oprette barsel', 'register parental', 'registering parental', 'parental leave registered', 'parental leave is registered', 'kirjaa perhevapaa', 'kirjaan perhevapaan', 'kirjata perhevapaan', 'kirjataan perhevapaa', 'perhevapaa kirjataan', 'registrera föräldraledighet', 'registrerar jag föräldraledighet', 'föräldraledighet registreras', 'registreras föräldraledighet'],
        steps: [
          'Åbn Manager Panel og klik "Registrer barsel" ved siden af "Giv Ferie/Fridag".',
          'Vælg medarbejder, startdato og slutdato (sidste barselsdag), og skriv eventuelt en bemærkning.',
          'Klik "Registrer barsel". Barsel er med det samme godkendt og kræver ingen ansøgning.',
        ],
        notes: 'Slutdatoen kan rettes senere via "Rediger" i ferieoversigten, hvor typen kan skiftes mellem ferie og barsel. Medarbejderen får en besked om, at barslen er registreret.',
      },
      {
        id: 'grant-vacation',
        title: 'Tildel ferie eller en fridag',
        requires: MANAGER,
        preferred: true,
        userTask: 'request-vacation',
        keywords: ['giv ferie', 'giv fridag', 'giv en fridag', 'giv en medarbejder ferie', 'giv en medarbejder fri', 'giv en medarbejder en fridag', 'giv medarbejderen en fridag', 'fridag til en medarbejder', 'fridag til medarbejder', 'giver jeg ferie', 'giver jeg en fridag', 'tildel ferie', 'tildele ferie', 'tildele en fridag', 'tildel en fridag', 'grant vacation', 'grant a day off', 'grant day off', 'give a day off', 'give an employee vacation', 'give an employee a day off', 'myönnä loma', 'myönnä lomaa', 'myönnän lomaa', 'myönnä vapaapäivä', 'myönnän vapaapäivän', 'anna vapaapäivä', 'myönnetään vapaapäivä', 'vapaapäivä myönnetään', 'myönnetään loma', 'loma myönnetään', 'bevilja semester', 'beviljar jag semester', 'bevilja ledig dag', 'bevilja en ledig dag', 'ge en ledig dag', 'ge semester'],
        steps: [
          'Åbn Manager Panel og klik "Giv Ferie/Fridag".',
          'Vælg bruger og type: "Enkelt fridag" eller "Ferie (flere dage)". Vælg dato (ved ferie start- og slutdato), og skriv eventuelt en bemærkning.',
          'Klik "Giv Fridag" eller "Giv Ferie". Det er med det samme godkendt.',
        ],
        notes: 'Medarbejderen får en besked om fridagen eller ferien.',
      },
    ],
  },
  {
    id: 'documents',
    view: null,
    title: 'Dokumenter',
    summary: 'Modulet er endnu ikke bygget. Feltet vises paa forsiden, men kan ikke aabnes.',
    where: 'Ikke tilgaengeligt endnu.',
    available: false,
    keywords: ['dokument', 'dokumenter', 'filer', 'dokumentbibliotek'],
    tasks: [],
  },
  {
    id: 'chat',
    view: null,
    title: 'Team Chat',
    summary: 'Modulet er endnu ikke bygget. Brug Email System til interne beskeder indtil videre.',
    where: 'Ikke tilgaengeligt endnu.',
    available: false,
    keywords: ['chat', 'team chat', 'chatte'],
    tasks: [],
  },
]

// Round 13: the front page, Admin/Creator Panel and extra tasks for existing modules live in their own files.
const { MORE_MODULES, MORE_TASKS } = require('./assistantAppGuideMore.cjs')
for (const [id, tasks] of Object.entries(MORE_TASKS)) APP_GUIDE.find(module => module.id === id).tasks.push(...tasks)
APP_GUIDE.splice(APP_GUIDE.findIndex(module => module.id === 'documents'), 0, ...MORE_MODULES)
// Work Tools (Optælling), TCD and TRR only.
const { WAREHOUSE_MODULE } = require('./assistantAppGuideWarehouse.cjs')
APP_GUIDE.splice(APP_GUIDE.findIndex(module => module.id === 'documents'), 0, WAREHOUSE_MODULE)

// Emner der ikke hoerer til ét modul, men som folk alligevel spoerger om.
const APP_TOPICS = [
  {
    id: 'about',
    title: 'Om Supply Chain Hub',
    keywords: ['om appen', 'about the app', 'tietoa appista'],
    summary: 'Supply Chain Hub er teamets fælles app. Forsiden har et felt for hvert modul: Vagtplan, Kalender (ferie, sygdom og hjemmearbejde), To Do, Guide Bibliotek, Notesbog, Email System, Team Oversigt, Madplan, Forbedringer og forslag og Spil Hjørnet. Jeg, Hubert, kan slå op i dataene, forklare hvordan tingene gøres og forberede en ferieanmodning eller en to-do, som du selv bekræfter. Prøv fx «Hvem har ferie næste uge?» eller «Hvordan søger jeg ferie?».',
  },
  {
    id: 'getting-started',
    title: 'Kom godt i gang',
    keywords: ['kom i gang', 'komme i gang', 'getting started', 'get started', 'komma igang'],
    summary: 'Sådan kommer du i gang:\n1. Åbn forsiden – hvert felt er et modul. Start med Kalender (ferie, sygdom og hjemmearbejde) og Vagtplan (dine opgaver).\n2. Vælg sprog og tema øverst i appen.\n3. Se kollegerne i Team Oversigt, og spørg mig «Hvem er min leder?» for at finde din leder.\n4. Er du i tvivl, så spørg mig – fx «Hvordan søger jeg ferie?».',
  },
  {
    id: 'navigation',
    title: 'Saadan finder du rundt',
    keywords: ['forside', 'hub', 'tilbage', 'navigation', 'hvor finder jeg', 'menu', 'modul'],
    summary: 'Forsiden viser et felt for hvert modul. Klik et felt for at aabne modulet, og brug tilbage-knappen eller Escape for at komme tilbage til forsiden. Felter du ikke har adgang til, er tonet ned.',
  },
  {
    id: 'dashboard',
    title: 'Tilpas forsiden',
    keywords: ['widget', 'dashboard', 'forside', 'tilpas', 'skjul', 'vis'],
    summary: 'Klik "Tilpas dashboard" på forsiden for selv at vælge, hvilke kort der vises (fx teamopgaver, hvem der har fri og dagens mad), og hvor store de er. Valget gælder kun dig.',
  },
  {
    id: 'roles',
    title: 'Roller og hvem der kan hvad',
    keywords: ['rolle', 'rettighed', 'adgang', 'manager', 'managerpanel', 'kan ikke se', 'maa jeg', 'hvem kan', 'creator', 'administrator', 'laast'],
    summary: 'Der er tre roller. En almindelig bruger kan se og redigere teamets daglige data. En manager kan derudover godkende nye brugere og ferieanmodninger og styre opgavetyper, og har adgang til Manager Panel og Admin Panel, som åbnes fra profilmenuen øverst til højre. En creator administrerer alle teams, har desuden Creator Panel og kan skifte team. Kan du ikke se et felt paa forsiden, er det enten fordi det kraever manager-adgang, eller fordi modulet endnu ikke er bygget. Har du brug for mere adgang, skal du spoerge din manager.',
  },
  {
    id: 'appearance',
    title: 'Tema og sprog',
    keywords: ['tema', 'moerk', 'lys', 'farve', 'sprog', 'dansk', 'engelsk', 'finsk', 'udseende', 'theme', 'language', 'dark mode', 'teema', 'kieli', 'kiel', 'svensk', 'svenska', 'spraak', 'moerkt laege'],
    summary: 'Tema og sprog skiftes oeverst i appen. Appen findes paa dansk, engelsk, finsk og svensk, og valget gaelder kun din egen bruger.',
  },
  {
    id: 'profile',
    title: 'Din profil og adgangskode',
    keywords: ['profil', 'adgangskode', 'kodeord', 'password', 'telefonnummer', 'mine oplysninger', 'salasana', 'loesenord', 'mina uppgifter', 'log ud', 'logger ud', 'logge ud', 'log out', 'logout', 'kirjaudu ulos', 'kirjaudun ulos', 'logga ut', 'loggar ut'],
    summary: 'Åbn profilmenuen øverst til højre ("Min konto"). Under "Indstillinger" kan du rette dit telefonnummer og skifte adgangskode ("Skift adgangskode"), og her slår du Windows-notifikationer til eller fra. Menuen har også "Admin Panel" (for managere), "Creator Panel" (for en creator) og "Log ud". Navn og e-mail styres af din manager.',
  },
  {
    id: 'windows-notifications',
    title: 'Windows-notifikationer',
    priority: true,
    keywords: ['windows notifikation', 'windows notifikationer', 'windows besked', 'windows beskeder', 'windows message', 'windows messages', 'windows notification', 'windows notifications', 'desktop notification', 'desktop notifications', 'windows ilmoituk', 'windows notis', 'windows notiser'],
    summary: 'Nye notifikationer fra klokken kan også vises som Windows-besked, når Supply Chain Hub ikke er i fokus. Åbn profilmenuen, vælg "Indstillinger", og slå "Windows-notifikationer" til eller fra. Valget gemmes på din computer og er som standard slået til. Kommer der mange på én gang, samles de i én besked. Klik på en Windows-besked for at åbne appen det rigtige sted.',
  },
  {
    id: 'storage',
    title: 'Faelles drev, offline og synkronisering',
    keywords: ['offline', 'forbindelse', 'synkronisering', 'drev', 'gemt', 'lager', 'optaget', 'gemmer'],
    summary: 'Alle data ligger paa et faelles drev, saa hele teamet ser det samme. Mister du forbindelsen, kan du arbejde videre, og aendringerne sendes automatisk naar forbindelsen er tilbage. Beskeden om at lageret er optaget betyder blot at en kollega skrev i samme oejeblik. Appen proever selv igen. En aendring vises med det samme og gemmes paa drevet i baggrunden, saa du kan arbejde videre imens.',
  },
  {
    id: 'updates',
    title: 'Opdateringer af appen',
    keywords: ['opdatering', 'ny version', 'opdater', 'version', 'update', 'upgrade', 'paeivitae', 'paeivitys', 'uppdatera', 'uppdatering'],
    summary: 'Appen tjekker selv efter nye versioner og giver besked, naar der er en. Opdateringen hentes fra det faelles drev, og appen genstarter naar den er lagt paa plads.',
  },
  {
    id: 'assistant',
    title: 'Hvad Hubert kan hjaelpe med',
    keywords: ['hubert', 'chatbot', 'assistent', 'hvad kan du', 'hjaelp', 'hjaelpe mig', 'help', 'what can you', 'osaa', 'auttaa', 'apua', 'hjaelpa'],
    summary: 'Hubert kan slå op i hubbens data, fx hvem der har ferie eller er syg eller på barsel, hvad der er på madplanen, hvilke opgaver du har, dine noter og beskeder, forbedringsforslag og highscores. Hubert kan også svare på dine egne Multiplayer-spil og resultater, fx "hvor mange sejre har jeg i skak?". Hubert finder svar i guiderne og i Knowledge Base og viser hele fremgangsmåden med kilde - spørg fx "hvordan laver jeg en kreditnota?". Hubert kan forklare hvordan modulerne bruges, og foreslå handlinger, som du selv bekræfter til sidst: en ferieanmodning, en personlig eller fælles to-do, en note i Notesbog, en sygemelding (også barn syg), en hjemmearbejdsdag, en intern besked til en kollega i dit team eller en high-five til en kollega. Skriv fx «meld mig syg i morgen», «send en besked til Anne: mødet er flyttet» eller «send en high-five til Bo for hjælpen». Hubert skriver aldrig noget uden din bekræftelse, viser aldrig andres private oplysninger og sletter, ændrer eller godkender aldrig noget.',
  },
  {
    id: 'assistant-ai',
    title: 'AI-svar i Hubert',
    keywords: ['ai-svar', 'ai svar', 'aktiver ai', 'aktivere ai', 'ai model', 'ai-model', 'sprogmodel', 'hukommelse', 'ram', 'generelt', 'generel tilstand'],
    summary: 'Klik "Aktivér AI-svar" i Hubert-chatten. AI-modellen hentes én gang (ca. 3 GB) fra det faelles drev til din pc og koerer kun lokalt. Den kraever ca. 4,5 GB fri hukommelse - 5,5 GB hvis Hubert ogsaa skal laese guidebilleder. Uden modellen virker alle opslag stadig. Tilstanden "Generelt" bruger AI-modellen uden hubbens data og markeres som AI-genereret.',
  },
]

const normalize = value => String(value || '').normalize('NFKC').toLowerCase()
// Danske/finske tegn foldes, saa "hjælp" og "hjaelp" scorer ens uanset hvad
// brugeren skriver, og uanset hvordan teksten er stavet i denne fil.
const fold = value => normalize(value)
  .replace(/[æä]/g, 'ae').replace(/[øö]/g, 'oe').replace(/å/g, 'aa')
  .replace(/[^a-z0-9 ]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()

// "Hvordan registrerer man barsel" and "hvordan registrerer jeg barsel" are the same question: subject pronouns never decide which task matches.
const SUBJECTS = /(?<=^| )(?:jeg|man|du|vi|we|you|one|jag)(?= |$)/g
// Imperative, infinitive and present of the action verbs share one stem: "giv", "give", "giver" are the same word for a keyword.
const VERB_STEMS = /(?<=^| )(registrer|opret|godkend|afvis|tildel|giv|meld|send|skriv|tilfoej|slet|importer|eksporter|administrer|udfordr|accepter|aendr|flyt|spil|find|hent|luk|aabn|ansoeg|anmod|skift|skjul|rediger|ret|publicer|filtrer)(?:t?e|t?er|t?es|t?et)?(?= |$)/g
const matchFold = value => fold(value).replace(SUBJECTS, ' ').replace(VERB_STEMS, '$1').replace(/\s+/g, ' ').trim()

// "skal jeg" er bevidst IKKE med: "hvilke opgaver skal jeg lave naeste uge" er
// et dataspoergsmaal, ikke en anmodning om en vejledning.
const HOW_TO = /\b(hvordan|hvorledes|hvor (?:finder|ser|aendrer|opretter|skriver|godkender|melder|registrerer|tilfoejer|retter|sletter|redigerer|administrerer|skifter|publicerer|importerer|eksporterer)|kan jeg|can i|could i|is it possible to|voinko|saanko|hvorfor (?:faar|kan) jeg ikke|why (?:don t i|do i not|can t i|cannot i|am i not)|miksi en|varfoer (?:faar|kan) jag (?:inte|inga)|how (?:do|can|to)|how (?:is|are) .{1,40}? (?:registered|created|added|done|made|set up|approved|granted)|where (?:do|can|is)|miten|kuinka|mista|mistae|missae|hur|var (?:hittar|ser|aendrar|skapar|skriver|godkaenner|anmaeler|registrerar|hanterar|byter|tar|laegger|importerar|exporterar|publicerar)|kan jag)\b|^(?:hvad (?:boer|burde|skal) jeg goere (?:hvis|naar)|hvad goer jeg (?:hvis|naar)|what (?:should|do) i do (?:if|when)|mitae teen (?:jos|kun)|vad (?:boer|ska) jag goera (?:om|naer)|vad goer jag (?:om|naer))\b/
// Spoergsmaal der starter med disse, beder om DATA uanset resten af saetningen.
const DATA_QUESTION = /^(hvilke|hvilken|hvilket|hvem|hvornaar|hvor mange|hvad er der|which|who|when|how many|kuka|ketka|mitkae|kuinka moni|kuinka monta|montako|vilka|vilken|vilket|vem|naer|hur maanga)\b|^hvordan ser .+ ud\b|^how does .+ look\b|^hur ser .+ ut\b/
// "Hvem kan godkende min ferie?" er et spoergsmaal om hvordan det foregaar, ikke om data.
const WHO_CAN = /^(?:hvem|who|kuka|vem)\s+(?:kan\s+|can\s+|voi\s+)?(?:godkende|godkender|afvise|afviser|approve|approves|reject|rejects|hyvaeksyae|hyvaeksyy|hylkaeae|godkaenna|godkaenner|avvisa|avvisar)\b/
// "Skal et forslag have en ansvarlig?": a question about what a suggestion requires is answered from the module's tasks.
const NEEDS = /^(?:skal|maa|does|do|must|tarvitseeko|tarvitaanko|maaste|behoever)\b.{0,30}\b(?:forslag|suggestion|ehdotu\w*|foerslag)\b/
// "Kan du importere Word-guiden for mig?": Hubert cannot do it for the user, so the question is answered with how it is done.
const DELEGATE = /^(?:kan du|vil du|can you|could you|will you|voitko|vill du)\b.{0,70}\b(?:for mig|for me|puolestani|aat mig)$/
// "Hvem kan oprette et opslag?" / "can everyone edit the meal plan?": who may do something is answered from the module's tasks and notes.
const WHO_CAN_DO = /^(?:hvem|who|kuka|vem)\s+(?:kan|can|voi)\s+(?:oprette|skrive|slette|rette|redigere|aendre|post|write|create|delete|edit|change|kirjoittaa|julkaista|luoda|poistaa|muokata|nahdae|naehdae|skriva|skapa|ta bort|redigera|aendra|publicera)\b|^(?:hvem|who|kuka|vem)\s+naekee\b/
const CAN_EVERYONE = /^(?:kan|can|voiko|kan)\s+(?:alle|enhver|everyone|anyone|kuka tahansa|kaikki|alla|vem som helst)\b/
const WHO_SEES = /^(?:hvem|who|kuka|vem)\s+(?:kan\s+se|can\s+see|naekee|voi\s+naehdae|kan\s+se)\b/

/** True hvis spoergsmaalet handler om at GOERE noget, ikke om at slaa data op. */
function isHowToQuestion(question) {
  const folded = fold(question)
  if (WHO_CAN.test(folded) || NEEDS.test(folded) || DELEGATE.test(folded) || WHO_CAN_DO.test(folded) || CAN_EVERYONE.test(folded)) return true
  if (DATA_QUESTION.test(folded)) return false
  return HOW_TO.test(folded)
}

// Compiled once per keyword: matching runs several times per question and the keyword list is long.
// Dansk boejer og sammensaetter ("ferieanmodning", "vagtplanen", "notesbogen"), derfor matches laengere noegleord som ordPRAEFIKS,
// mens korte ord (fx "fri", "syg") kraever et helt ord for ikke at ramme alt.
const KEYWORD_PATTERNS = new Map()
function keywordPattern(keyword) {
  let entry = KEYWORD_PATTERNS.get(keyword)
  if (!entry) {
    const folded = matchFold(keyword)
    entry = folded
      ? { folded, raw: fold(keyword), multi: folded.includes(' '), regex: new RegExp(folded.includes(' ') ? folded : folded.length >= 4 ? `\\b${folded}` : `\\b${folded}\\b`) }
      : { folded: '' }
    KEYWORD_PATTERNS.set(keyword, entry)
  }
  return entry
}
const wordStartPattern = word => keywordPattern(`#${word}`)

function scoreKeywords(haystack, keywords, hits) {
  let score = 0
  // Inflected variants of one keyword ("giv", "giver") fold to the same stem and count once; the same keyword listed twice still counts twice.
  const stems = new Map()
  for (const keyword of keywords) {
    const { folded, raw, multi, regex } = keywordPattern(keyword)
    if (!folded) continue
    if (stems.has(folded) && stems.get(folded) !== raw) continue
    stems.set(folded, raw)
    if (regex.test(haystack)) {
      score += multi ? 3 : 2
      hits?.push(folded)
    }
  }
  return score
}

// Verber der findes i mange opgaver. Alene kan de ikke afgoere HVILKEN opgave
// brugeren mener ("hvordan aendrer jeg mit kodeord" er ikke "Ret en gentaget vagt").
const GENERIC = new Set(['ret', 'rediger', 'aendre', 'slet', 'opret', 'tilfoej', 'skriv', 'send', 'ny', 'saet', 'luk', 'afslut', 'faerdig', 'vis', 'skjul', 'lav', 'lave', 'add', 'create', 'write', 'compose', 'start', 'upload', 'luo', 'luon', 'lisaeae', 'kirjoita', 'kirjoitan', 'skapa', 'skicka', 'skriva', 'laegg till', 'play', 'read', 'chat', 'tur'].map(matchFold))
// "Hvor finder jeg ...?" spoerger efter et sted i appen, ikke efter trin.
const WHERE = /\b(?:hvor (?:finder|ser|kan) jeg|hvordan (?:finder|ser) jeg|where (?:do|can) i (?:find|see)|where (?:is|are)|mistae (?:loeydaen|naeen)|missae naeen|missae (?:[a-z0-9]+ ){0,3}on|var (?:hittar|ser|kan) jag|hur (?:hittar|ser) jag)\b/

const allowed = (entry, role) => !entry.requires || entry.requires === role || (entry.requires === MANAGER && role === CREATOR)

/**
 * Finder den app-viden der bedst matcher spoergsmaalet.
 * `keepRestricted` beholder traef brugeren ikke har adgang til, saa kalderen kan
 * forklare HVORFOR i stedet for at tilbyde en tilfaeldig anden opgave.
 */
function matchAppGuide(question, { role = 'user', limit = 3, keepRestricted = false } = {}) {
  const haystack = matchFold(question)
  if (!haystack) return []
  const matches = []
  for (const module of APP_GUIDE) {
    const moduleScore = scoreKeywords(haystack, [...module.keywords, module.title])
    for (const task of module.tasks) {
      // Opgaven skal ramme paa SINE EGNE ord. Ellers ville et loest modulord
      // (fx "uge") goere et rent dataspoergsmaal til en vejledning.
      const hits = []
      const taskScore = scoreKeywords(haystack, [...task.keywords, task.title], hits)
      if (!taskScore) continue
      if (!moduleScore && hits.every(hit => GENERIC.has(hit))) continue
      // `needsModule`: only when the question also names the module; `excludes`: a more specific feature owns the question.
      if (task.needsModule && !moduleScore) continue
      if (task.needsAny && !task.needsAny.some(word => wordStartPattern(word).regex.test(haystack))) continue
      if (task.excludes?.some(word => wordStartPattern(word).regex.test(haystack))) continue
      const isAllowed = allowed(task, role) && allowed(module, role)
      // A `preferred` role task beats the general explanation of the same topic when the asker holds the role.
      matches.push({ kind: 'task', module, task, score: moduleScore + taskScore * 2 + (task.preferred && isAllowed ? 6 : 0), taskScore, allowed: isAllowed })
    }
    if (moduleScore > 0) matches.push({ kind: 'module', module, score: moduleScore, allowed: allowed(module, role) })
  }
  for (const topic of APP_TOPICS) {
    const hits = []
    const score = scoreKeywords(haystack, [...topic.keywords, topic.title], hits)
    // A `priority` topic (a named UI feature such as Windows notifications) wins over loose task matches when a phrase of its own is hit.
    if (score > 0) matches.push({ kind: 'topic', topic, score: topic.priority && hits.some(hit => hit.includes(' ')) ? score + 100 : score, allowed: true })
  }
  matches.sort((a, b) => b.score - a.score)
  return (keepRestricted ? matches : matches.filter(match => match.allowed)).slice(0, limit)
}

const appGuideTopic = id => APP_TOPICS.find(topic => topic.id === id)

// Title of a match in the answer language (falls back to Danish).
function titleOf(match, language) {
  if (match.kind === 'topic') { const local = localTopic(match.topic, language); return local ? local.title : humanizeDanish(match.topic.title) }
  const localMod = localModule(match.module, language)
  const title = localMod ? localMod.title : humanizeDanish(match.module.title)
  if (match.kind === 'module') return title
  const local = localTask(match.module, match.task, language)
  return `${title} · ${local ? local.title : humanizeDanish(match.task.title)}`
}
const rolesAnswer = language => { const topic = appGuideTopic('roles'); return { text: formatAppGuide([{ kind: 'topic', topic }], language), title: titleOf({ kind: 'topic', topic }, language) } }

// Et enkelt loest modulord (fx "uge") er IKKE nok til at kalde et spoergsmaal
// besvaret. Uden denne graense ville "hvad serverede koekkenet uge 36?" blive
// til en app-forklaring i stedet for at naa dataopslag og planlaegger.
const CONFIDENT_SCORE = 4
// A direct task needs a phrase hit or two word hits of its own.
const DIRECT_SCORE = 3

/**
 * Samlet indgang til app-viden.
 * `requireTask` (how-to-vejen): giver kun svar ved et konkret opgave-traef, saa
 * rene dataspoergsmaal ikke kapres. Uden den (blindgyde-vejen): giver ALTID et
 * brugbart svar - i vaerste fald et overblik over hvad Hubert kan.
 * `unmatched` markerer at intet kendt emne blev ramt, saa det stadig kan
 * logges, maales og sendes videre til den semantiske planlaegger.
 */
function appGuidance(question, { role = 'user', requireTask = false, language = 'da', directOnly = false } = {}) {
  const matches = matchAppGuide(question, { role, limit: 12, keepRestricted: true })
  // Tasks flagged `direct` describe things only this app has (chess, "Dine opgør", the blue dot ...): a plain question about them is answered without "how do I".
  if (directOnly) {
    const direct = matches.find(match => match.kind === 'task' && match.task.direct && match.allowed && match.taskScore >= DIRECT_SCORE)
    return direct ? { text: formatAppGuide([direct], language), title: titleOf(direct, language), moduleId: direct.module.id } : null
  }
  if (WHERE.test(fold(question))) {
    const place = matches.find(match => match.kind === 'task' && match.task.direct && match.allowed && match.taskScore >= DIRECT_SCORE + 1) || matches.find(match => match.kind === 'module' && match.allowed)
    if (place) return { text: formatAppGuide([place], language), title: titleOf(place, language), moduleId: place.module.id }
  }
  // A where- or who-can-see-question about a module the asker may not open (Admin Panel, Creator Panel ...) gets the role explanation.
  if ((WHERE.test(fold(question)) || WHO_SEES.test(fold(question))) && matches.some(match => match.kind === 'module' && !match.allowed) && !matches.some(match => match.allowed)) return rolesAnswer(language)
  // Paa how-to-vejen godtages ogsaa et SIKKERT emne-traef (fx "hvordan skifter
  // jeg tema?"), selvom emnet ikke har trin. Emner er app-viden, ikke data, saa
  // de kan ikke kapre et dataopslag - modul-traef kan, og godtages derfor ikke.
  // Et emne der er det bedste traef overhovedet, er ogsaa sikkert nok.
  const confident = match => match.kind === 'task' || (match.kind === 'topic' && (match.score >= CONFIDENT_SCORE || match === matches[0]))
  const top = requireTask ? matches.find(confident) : matches.find(match => match.kind === 'task' || match.score >= CONFIDENT_SCORE)
  if (requireTask && !top) return null
  // Kraever traeffet en rolle brugeren ikke har, saa forklar DET i stedet for
  // at tilbyde en tilfaeldig anden opgave fra samme modul.
  if (top && !top.allowed) {
    // A manager-only task can point to the explanation an employee may read instead.
    const open = top.task?.userTask && APP_GUIDE.flatMap(module => module.tasks.map(task => ({ kind: 'task', module, task }))).find(match => match.task.id === top.task.userTask)
    if (open) return { text: formatAppGuide([open], language), title: titleOf(open, language), moduleId: open.module.id }
    return rolesAnswer(language)
  }
  if (top) return { text: formatAppGuide([top], language), title: titleOf(top, language), moduleId: top.module?.id }
  return { text: unmatchedText(language), title: titleOf({ kind: 'topic', topic: appGuideTopic('assistant') }, language), unmatched: true }
}

// Nothing matched: a short pointer with examples, not the whole module catalogue.
const UNMATCHED = {
  da: 'Det kunne jeg ikke finde et svar på. Jeg kan slå op i vagtplan, ferie, sygdom, hjemmearbejde, noter, beskeder, madplan og guides, og forklare hvordan appen bruges. Prøv fx «Hvem har ferie næste uge?», «Hvad er der til frokost i morgen?» eller «Hvordan søger jeg ferie?».',
  en: 'I could not find an answer to that. I can look up shifts, vacation, sick leave, home office, notes, messages, the meal plan and guides, and explain how the app is used. Try e.g. “Who is on vacation next week?”, “What is for lunch tomorrow?” or “How do I request vacation?”.',
  fi: 'Tähän en löytänyt vastausta. Voin hakea vuoroja, lomia, sairauspoissaoloja, etätyötä, muistiinpanoja, viestejä, ruokalistan ja oppaita sekä selittää sovelluksen käyttöä. Kokeile esim. «Kuka on lomalla ensi viikolla?», «Mitä lounaaksi huomenna?» tai «Miten pyydän lomaa?».',
  sv: 'Det kunde jag inte hitta något svar på. Jag kan slå upp pass, semester, sjukfrånvaro, hemarbete, anteckningar, meddelanden, matsedeln och guider, och förklara hur appen används. Prova t.ex. «Vem har semester nästa vecka?», «Vad är det för lunch imorgon?» eller «Hur ansöker jag om semester?».',
}
const unmatchedText = language => UNMATCHED[language] || UNMATCHED.da

// "Hvad er team chat?" / "what is the notebook?": hele spoergsmaalet er blot et modulnavn.
// Ord som ogsaa er hverdagsord ("version", "liste") udloeser aldrig en forklaring.
const WHAT_IS = /^(?:hvad er|hvad betyder|what is|what are|what s|mikae on|mitae ovat|vad aer)\s+(?:et |en |det |den |de |the |a |an )?([a-z0-9 ]+?)\s*$/
const NOT_A_NAME = new Set(['version', 'liste', 'point', 'pause', 'tilbage', 'hub', 'modul', 'vis', 'skjul', 'lys', 'farve', 'menu', 'adgang', 'forside', 'tilpas', 'manager'])
// Whole-question patterns on folded text (æ/ä -> ae, ø/ö -> oe, å -> aa): "what is this app?", "where do I start?", "what can you do?".
const ABOUT_APP = /^(?:hvad er (?:det|den|denne|dette) (?:her )?(?:for )?(?:en |et )?(?:app|appen|program|programmet|hub|hubben)|hvad er (?:appen|app|hubben|supply chain hub|denne app|den her app|dette program)|hvad bruges (?:appen|hubben) til|what is (?:this|the) (?:app|application|hub|program|tool)(?: for)?|what is supply chain hub|what s (?:this|the) (?:app|hub)(?: for)?|mikae (?:taemae )?(?:sovellus|appi|ohjelma|hubi) on|mikae on (?:taemae sovellus|supply chain hub|hubi|sovellus)|vad aer (?:den haer |denna )?(?:appen|app|hubben|supply chain hub|programmet)|vad aer det haer foer (?:en )?(?:app|program))$/
const GETTING_STARTED = /^(?:jeg er ny(?: her)? )?(?:(?:hvor|hvordan) (?:skal jeg (?:starte|begynde)|kommer jeg i gang)|hvor (?:starter|begynder) jeg)$|^(?:(?:i m|i am) new(?: here)? )?(?:where|how) (?:do|should|can) i (?:start|begin|get started)$|^(?:olen uusi(?: taeaellae)? )?(?:mistae|mihin) (?:aloitan|alkaisin|aloittaisin)$|^miten paeaesen alkuun$|^(?:jag aer ny(?: haer)? )?(?:var|hur) (?:ska jag boerja|boerjar jag|kommer jag igaang|startar jag)$/
const CAPABILITY = /^(?:hvad|what|vad) (?:kan|can) (?:du|you|hubert)(?: (?:goere|goera|do|hjaelpe med|hjaelpa till med|help with|help me with))?(?: for mig| for me| aat mig)?$|^mitae (?:hubert osaa|osaat|sinae osaat)(?: tehdae)?$/
// "Which modules are there?" is answered with the readable overview, not with the technical module catalogue.
const WHICH_MODULES = /^(?:hvilke (?:moduler|funktioner|dele) (?:findes der|har appen|har hubben|er der)|(?:what|which) (?:modules|features|parts) (?:are there|exist|does (?:the )?(?:app|hub) have)|(?:mitae moduuleja|mitae toimintoja) (?:on|loeytyy|sovelluksessa on)|mitkae moduulit (?:ovat olemassa|on olemassa|loeytyy)|vilka (?:moduler|funktioner) (?:finns det|finns|har appen|har hubben))$/
// "Which games are there?" / "what is Modern?": the Game Corner's three sections, not the user's own play counts.
const GAME_SECTIONS = /^(?:hvilke spil (?:findes der|er der|er) i spilhjoernet|which games (?:are there|exist|are available|are) in the game corner|mitae pelejae pelikulmassa (?:on|loeytyy)|vilka spel finns i spelhoernan|(?:hvad er|what is|mikae on|vad aer) (?:arcade|modern|multiplayer)(?: i spilhjoernet| in the game corner| pelikulmassa| i spelhoernan)?)$/

/** Forklaring af et modul eller emne ud fra spoergsmaal af typen "hvad er X?". */
function describeAppTerm(question, { role = 'user', language = 'da' } = {}) {
  const folded = fold(question)
  if (WHICH_MODULES.test(folded)) return { text: appGuideOverview(role, language), title: 'Supply Chain Hub' }
  if (GAME_SECTIONS.test(folded)) {
    const module = APP_GUIDE.find(entry => entry.id === 'games')
    const match = { kind: 'task', module, task: module.tasks.find(task => task.id === 'game-sections') }
    return { text: formatAppGuide([match], language), title: titleOf(match, language) }
  }
  const special = ABOUT_APP.test(folded) ? 'about' : GETTING_STARTED.test(folded) ? 'getting-started' : CAPABILITY.test(folded) ? 'assistant' : null
  if (special) {
    const match = { kind: 'topic', topic: appGuideTopic(special) }
    return { text: formatAppGuide([match], language), title: titleOf(match, language) }
  }
  const object = WHAT_IS.exec(folded)?.[1]
  if (!object || object.split(' ').length > 3) return null
  const named = entry => [entry.title, localModule(entry, language)?.title, ...entry.keywords].filter(Boolean).map(fold).some(name => (name.length >= 4 || name.includes(' ')) && !NOT_A_NAME.has(name) && (object === name || (name.length >= 4 && object.startsWith(name) && object.length - name.length <= 4)))
  const module = APP_GUIDE.find(named)
  if (module) {
    if (!allowed(module, role)) return rolesAnswer(language)
    const match = { kind: 'module', module }
    return { text: formatAppGuide([match], language), title: titleOf(match, language) }
  }
  const topic = APP_TOPICS.find(entry => entry.id !== 'updates' && named(entry))
  return topic ? { text: formatAppGuide([{ kind: 'topic', topic }], language), title: titleOf({ kind: 'topic', topic }, language) } : null
}

/** Kort overblik over hele appen - svaret paa "hvad kan du hjaelpe mig med?". */
function appGuideOverview(role = 'user', language = 'da') {
  const ui = uiFor(language)
  const text = module => localModule(module, language) || module
  const shown = (module, line) => localModule(module, language) ? line : humanizeDanish(line)
  // One line per module: the first sentence of its summary keeps the overview short enough to scan.
  const brief = summary => {
    const sentence = summary.split(/(?<=[.!?])\s+/)[0]
    return sentence.length <= 120 ? sentence : `${sentence.slice(0, 117).replace(/\s+\S*$/, '')}…`
  }
  const modules = APP_GUIDE
    .filter(module => module.available !== false && module.inOverview !== false && allowed(module, role))
    .map(module => shown(module, `- ${text(module).title}: ${brief(text(module).summary)}`))
  const unavailable = APP_GUIDE.filter(module => module.available === false).map(module => shown(module, text(module).title))
  const assistant = localTopic(appGuideTopic('assistant'), language)
  // The full capability text lives in the "what can you do?" answer; the overview keeps its first and last sentence.
  const capabilities = summary => { const sentences = summary.split(/(?<=[.!?])\s+/); return sentences.length > 3 ? `${sentences[0]} ${sentences.at(-1)}` : summary }
  return [
    ui.overview,
    ...modules,
    unavailable.length ? `${ui.notBuilt} ${unavailable.join(', ')}.` : '',
    capabilities(assistant ? assistant.summary : humanizeDanish(appGuideTopic('assistant').summary)),
  ].filter(Boolean).join('\n')
}

/** Formaterer fundne match som evidens modellen kan svare ud fra. */
function formatAppGuide(matches, language = 'da') {
  const ui = uiFor(language)
  return matches.map(match => {
    if (match.kind === 'topic') {
      const local = localTopic(match.topic, language)
      const topic = local || match.topic
      return withNotice(`${topic.title}\n${topic.summary}`, local, language)
    }
    const localMod = localModule(match.module, language)
    const module = localMod || match.module
    if (match.kind === 'module') return withNotice(`${module.title}\n${module.summary}\n${ui.where}: ${module.where}`, localMod, language)
    const localT = localMod && localTask(match.module, match.task, language)
    const task = localT || match.task
    const shown = localT ? module : match.module
    const labels = localT ? ui : DANISH_UI
    return withNotice([
      `${shown.title} - ${task.title}`,
      `${labels.where}: ${task.where || shown.where}`,
      ...task.steps.map((step, index) => `${index + 1}. ${step}`),
      task.notes ? `${labels.note}: ${task.notes}` : '',
    ].filter(Boolean).join('\n'), localT, language)
  }).join('\n\n')
}

// Words that describe the app itself; a guide only beats app guidance on a non-app title word.
// External systems the app talks to are never "the app": a team guide about SAP must still win "password i SAP".
const EXTERNAL_SYSTEMS = new Set(['sap'])
let appWords
function isAppWord(word) {
  appWords ||= new Set([...APP_GUIDE.flatMap(module => [module.title, ...module.keywords, ...module.tasks.flatMap(task => [task.title, ...task.keywords])]), ...APP_TOPICS.flatMap(topic => [topic.title, ...topic.keywords])]
    .flatMap(text => fold(text).split(' ')).filter(value => value.length >= 3 && !EXTERNAL_SYSTEMS.has(value)))
  const folded = fold(word)
  return appWords.has(folded) || [...appWords].some(value => value.length >= 5 && (folded.startsWith(value) || value.startsWith(folded) && folded.length >= 5))
}

/** Module name in the answer language, as the localized UI shows it. */
const moduleTitle = (id, language = 'da') => {
  const module = APP_GUIDE.find(entry => entry.id === id)
  if (!module) return ''
  const local = localModule(module, language)
  return local ? local.title : humanizeDanish(module.title)
}

module.exports = { APP_GUIDE, APP_TOPICS, matchAppGuide, appGuideTopic, appGuidance, appGuideOverview, describeAppTerm, formatAppGuide, isHowToQuestion, isAppWord, moduleTitle }
