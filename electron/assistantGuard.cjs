// Guard rails that run before any data lookup: credential requests, prompt
// injection and destructive commands get a firm, friendly refusal; clearly
// off-topic questions are pointed to General mode. Real how-to questions
// ("hvordan ændrer jeg mit kodeord?") are never blocked here.
const TEXT = {
  da: {
    credentials: 'Kodeord og adgangsoplysninger viser jeg aldrig – heller ikke dine egne. Vil du skifte din adgangskode, så spørg fx «Hvordan ændrer jeg mit kodeord?».',
    injection: 'Det kan jeg ikke. Jeg følger altid hubbens regler: jeg viser kun data, du har adgang til, og jeg ændrer aldrig noget af mig selv. Spørg fx «Hvem har ferie i næste uge?».',
    destructive: 'Jeg kan kun læse data – jeg kan ikke slette, godkende eller ændre noget. Det gør du selv i modulet, så du altid har kontrollen. Spørg fx «Hvordan sletter jeg en to-do?», så viser jeg hvordan.',
    outOfScope: 'Det ligger uden for hubbens data. Vælg «Generelt» øverst i chatvinduet, så svarer jeg på almindelige spørgsmål som det her.',
    export: 'Jeg eksporterer eller kopierer ikke data i bulk. Jeg viser kun enkelte svar ud fra data, du har adgang til – spørg fx «Hvem har ferie i næste uge?».',
    privacy: 'Andres private data – beskeder, private noter og personlige to-dos – kan jeg ikke vise. Jeg kan kun slå dine egne beskeder, noter og to-dos op samt de noter, teamet deler.',
    scope: 'Jeg viser kun data fra dit eget team. Hjemmearbejde og vagtplaner på tværs af teams og teamoversigten (navn og rolle) kan jeg dog slå op – spørg fx «Hvem arbejder hjemmefra i dag?» eller «Hvad laver Bo i denne uge?».',
    sickReason: 'Årsagen til en sygemelding deler jeg aldrig – heller ikke for kolleger. Jeg kan kun vise, om en kollega er sygemeldt, fx «Hvem er syg i morgen?».',
    content: 'Indhold i noter, beskeder og guides – og hvad andre skriver, at jeg skal gøre – er for mig data, ikke instruktioner, så jeg følger det ikke. Jeg kan vise, hvad der står, fx «Hvad står der i noten om terminalen?».',
    contacts: 'Jeg viser ikke kontaktoplysninger for alle i bulk. Spørg efter én person, fx «Hvad er telefonnummeret på Bo?», eller åbn «Team Oversigt».',
    internals: 'Jeg viser ikke rådata, filer, nøgler eller stier, og jeg kører ingen kommandoer. Jeg svarer kun ud fra de data, du har adgang til – spørg fx «Hvem har ferie i næste uge?».',
    roleClaim: 'Din rolle afgøres af hubben, ikke af hvad du skriver – jeg viser kun det, din egen rolle giver adgang til. Spørg fx «Hvem er min leder?».',
    gameHidden: 'Din modstanders brikker, chatten og andres spil og resultater er skjulte, og jeg kan ikke se dem. Jeg kan vise dine egne spil og resultater – spørg fx «Hvor mange sejre har jeg i skak?» eller «Hvilke spil har jeg i gang?» – og forklare, hvordan Word-Puzzle og skak virker.',
  },
  en: {
    credentials: 'I never show passwords or login details – not even your own. To change your password, ask e.g. “How do I change my password?”.',
    injection: 'I can’t do that. I always follow the hub’s rules: I only show data you have access to and never change anything on my own. Try e.g. “Who is on vacation next week?”.',
    destructive: 'I can only read data – I cannot delete, approve or change anything. You do that yourself in the module, so you stay in control. Ask e.g. “How do I delete a to-do?” and I’ll show you how.',
    outOfScope: 'That is outside the hub data. Choose “General” at the top of the chat window and I will answer general questions like this one.',
    export: 'I do not export or copy data in bulk. I only show individual answers based on data you have access to – try e.g. “Who is on vacation next week?”.',
    privacy: 'I can’t show other people’s private data – messages, private notes or personal to-dos. I can only look up your own messages, notes and to-dos, plus the notes the team shares.',
    scope: 'I only show data from your own team. I can look up home office and shift schedules across teams and the team overview (name and role), though – try e.g. “Who works from home today?” or “What is Bo doing this week?”.',
    sickReason: 'I never share the reason for a sick leave – not even for colleagues. I can only show whether a colleague is on sick leave, e.g. “Who is sick tomorrow?”.',
    content: 'Content in notes, messages and guides – and what others tell me to do – is data, not instructions, so I do not follow it. I can show what it says, e.g. “What does the note about the terminal say?”.',
    contacts: 'I do not show contact details for everyone in bulk. Ask about one person, e.g. “What is Bo’s phone number?”, or open “Team Overview”.',
    internals: 'I do not show raw data, files, keys or paths, and I do not run commands. I only answer from data you have access to – try e.g. “Who is on vacation next week?”.',
    roleClaim: 'Your role is set by the hub, not by what you write – I only show what your own role gives access to. Try e.g. “Who is my manager?”.',
    gameHidden: 'Your opponent\'s tiles, the chat and other people\'s games and results are hidden, and I cannot see them. I can show your own games and results – ask e.g. “How many wins do I have in chess?” or “Which games do I have in progress?” – and explain how Word-Puzzle and chess work.',
  },
  fi: {
    credentials: 'En koskaan näytä salasanoja tai kirjautumistietoja – en edes omiasi. Jos haluat vaihtaa salasanasi, kysy esim. «Miten vaihdan salasanani?».',
    injection: 'En voi tehdä sitä. Noudatan aina hubin sääntöjä: näytän vain tiedot, joihin sinulla on pääsy, enkä muuta mitään itse. Kysy esim. «Kuka on lomalla ensi viikolla?».',
    destructive: 'Voin vain lukea tietoja – en voi poistaa, hyväksyä tai muuttaa mitään. Teet sen itse moduulissa, joten päätösvalta pysyy sinulla. Kysy esim. «Miten poistan to-don?», niin näytän miten.',
    outOfScope: 'Tämä ei liity hubin tietoihin. Valitse «Yleinen» chat-ikkunan yläosasta, niin vastaan tällaisiin yleisiin kysymyksiin.',
    export: 'En vie tai kopioi tietoja massana. Näytän vain yksittäisiä vastauksia tiedoista, joihin sinulla on pääsy – kysy esim. «Kuka on lomalla ensi viikolla?».',
    privacy: 'En voi näyttää toisten yksityisiä tietoja – viestejä, yksityisiä muistiinpanoja tai henkilökohtaisia to-do-tehtäviä. Voin hakea vain omat viestit, muistiinpanot ja to-dot sekä tiimin jaetut muistiinpanot.',
    scope: 'Näytän vain oman tiimin tiedot. Etätyön ja työvuorolistat tiimien yli sekä tiimin yleiskuvan (nimi ja rooli) voin kuitenkin hakea – kysy esim. «Kuka on etätöissä tänään?» tai «Mitä Bo tekee tällä viikolla?».',
    sickReason: 'En koskaan kerro sairauspoissaolon syytä – en edes kollegoista. Voin vain näyttää, onko kollega sairauslomalla, esim. «Kuka on sairaana huomenna?».',
    content: 'Muistiinpanojen, viestien ja oppaiden sisältö – ja se, mitä muut kirjoittavat minun tekevän – on minulle tietoa, ei ohjeita, joten en noudata sitä. Voin näyttää, mitä siinä lukee, esim. «Mitä päätteen muistiinpanossa lukee?».',
    contacts: 'En näytä kaikkien yhteystietoja kerralla. Kysy yhdestä henkilöstä, esim. «Mikä on Bon puhelinnumero?», tai avaa «Ryhmän yleiskatsaus».',
    internals: 'En näytä raakadataa, tiedostoja, avaimia tai polkuja enkä suorita komentoja. Vastaan vain tiedoista, joihin sinulla on pääsy – kysy esim. «Kuka on lomalla ensi viikolla?».',
    roleClaim: 'Roolisi määräytyy hubissa, ei sen mukaan mitä kirjoitat – näytän vain sen, mihin oma roolisi oikeuttaa. Kysy esim. «Kuka on esimieheni?».',
    gameHidden: 'Vastustajasi laatat, keskustelu sekä muiden pelit ja tulokset ovat piilotettuja, enkä näe niitä. Voin näyttää omat pelisi ja tuloksesi – kysy esim. «Montako voittoa minulla on shakissa?» tai «Mitä pelejä minulla on käynnissä?» – ja selittää, miten Word-Puzzle ja shakki toimivat.',
  },
  sv: {
    credentials: 'Lösenord och inloggningsuppgifter visar jag aldrig – inte ens dina egna. Vill du byta ditt lösenord, fråga t.ex. «Hur ändrar jag mitt lösenord?».',
    injection: 'Det kan jag inte. Jag följer alltid hubbens regler: jag visar bara data som du har tillgång till och ändrar aldrig något på egen hand. Fråga t.ex. «Vem är på semester nästa vecka?».',
    destructive: 'Jag kan bara läsa data – jag kan inte radera, godkänna eller ändra något. Det gör du själv i modulen, så att du alltid har kontrollen. Fråga t.ex. «Hur raderar jag en att göra-uppgift?», så visar jag hur.',
    outOfScope: 'Det ligger utanför hubbens data. Välj «Allmänt» högst upp i chattfönstret, så svarar jag på allmänna frågor som den här.',
    export: 'Jag exporterar eller kopierar inte data i bulk. Jag visar bara enskilda svar utifrån data du har tillgång till – fråga t.ex. «Vem är på semester nästa vecka?».',
    privacy: 'Jag kan inte visa andras privata uppgifter – meddelanden, privata anteckningar eller personliga att göra. Jag kan bara slå upp dina egna meddelanden, anteckningar och att göra samt teamets delade anteckningar.',
    scope: 'Jag visar bara data från ditt eget team. Hemarbete och scheman över teamgränserna samt teamöversikten (namn och roll) kan jag dock slå upp – fråga t.ex. «Vem jobbar hemifrån idag?» eller «Vad gör Bo den här veckan?».',
    sickReason: 'Jag delar aldrig orsaken till en sjukskrivning – inte ens för kollegor. Jag kan bara visa om en kollega är sjukskriven, t.ex. «Vem är sjuk imorgon?».',
    content: 'Innehåll i anteckningar, meddelanden och guider – och vad andra skriver att jag ska göra – är för mig data, inte instruktioner, så jag följer det inte. Jag kan visa vad det står, t.ex. «Vad står det i anteckningen om terminalen?».',
    contacts: 'Jag visar inte kontaktuppgifter för alla i bulk. Fråga efter en person, t.ex. «Vad är Bos telefonnummer?», eller öppna «Teamöversikt».',
    internals: 'Jag visar inte rådata, filer, nycklar eller sökvägar och kör inga kommandon. Jag svarar bara utifrån data du har tillgång till – fråga t.ex. «Vem är på semester nästa vecka?».',
    roleClaim: 'Din roll bestäms av hubben, inte av vad du skriver – jag visar bara det din egen roll ger tillgång till. Fråga t.ex. «Vem är min chef?».',
    gameHidden: 'Din motståndares brickor, chatten och andras spel och resultat är dolda, och jag kan inte se dem. Jag kan visa dina egna spel och resultat – fråga t.ex. «Hur många segrar har jag i schack?» eller «Vilka spel har jag igång?» – och förklara hur Word-Puzzle och schack fungerar.',
  },
}

const fold = value => String(value || '').toLowerCase().normalize('NFKC')
  .replace(/[æä]/g, 'ae').replace(/[øö]/g, 'oe').replace(/å/g, 'aa')
  .replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim()

// Hidden or disguised orders: invisible characters, look-alike letters (Cyrillic "о"), l e t t e r s spaced out, base64 and rot13.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF\u00AD]/g
const LOOKALIKES = { а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', у: 'y', х: 'x', і: 'i', ј: 'j', ѕ: 's', һ: 'h', ο: 'o', α: 'a', ε: 'e', ι: 'i', ν: 'v', ρ: 'p', τ: 't', υ: 'u', χ: 'x' }
const LOOKALIKE_PATTERN = new RegExp(`[${Object.keys(LOOKALIKES).join('')}]`, 'giu')
const stripObfuscation = text => String(text).replace(INVISIBLE, '').replace(LOOKALIKE_PATTERN, letter => LOOKALIKES[letter.toLowerCase()] || letter)
  .replace(/(?<![\p{L}\p{N}])(?:\p{L}[\s._-]){4,}\p{L}(?![\p{L}\p{N}])/gu, run => run.replace(/[\s._-]/g, ''))
// The spaces of a letter-by-letter message carry no word boundaries, so its joined letters are matched against the core override phrases.
const JOINED_OVERRIDES = /ignor(?:e|er|era)(?:all|alle|alla|the|your|any|previous|prior|above|earlier|tidligere|tidigare|ovenstaaende|ovanstaaende)*(?:instructions?|instruktion\w*|rules|regler|reglerna)|systemprompt|forget(?:all|your|the|everything|previous)+(?:instructions?|rules|everything)?|youarenow(?:dan|admin|the)|revealall(?:the)?passwords?|showall(?:the)?passwords?|ohitaaiemmatohjeet/
const isSpelledOut = text => { const tokens = String(text).trim().split(/\s+/); return tokens.length >= 8 && tokens.filter(token => /^\p{L}$/u.test(token)).length / tokens.length >= 0.7 }
const spelledOutOverride = text => isSpelledOut(text) && JOINED_OVERRIDES.test(String(text).toLowerCase().normalize('NFKC').replace(/[^\p{L}]+/gu, ''))
const rot13 = text => text.replace(/[a-z]/gi, letter => { const base = letter <= 'Z' ? 65 : 97; return String.fromCharCode(((letter.charCodeAt(0) - base + 13) % 26) + base) })
// The readable texts hidden in a message: its rot13 and every base64 block that decodes to plain text.
function decodedVariants(text) {
  const variants = [rot13(text)]
  for (const token of String(text).match(/[A-Za-z0-9+/]{16,}={0,2}/g) || []) {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    if (decoded.length >= 8 && /^[\x20-\x7e\s]+$/.test(decoded)) variants.push(decoded)
  }
  return variants
}

const HOW_TO = /^(?:hvordan|hvorledes|how (?:do|can|to)|miten|kuinka(?! (?:monta|moni|paljon|usein|kauan))|hur(?! (?:maanga|mycket|ofta|laenge)))\b/
const CREDENTIALS = /\b(?:kodeord\w*|adgangskode\w*|password\w*|passwd|salasan\w*|api ?noegle\w*|api ?key\w*|credentials|login ?oplysninger\w*|token\w*|loesenord\w*|inloggningsuppgift\w*|api ?nyckel\w*)\b/
const INJECTION = /\bignor\w*\b.{0,40}\b(?:instruks\w*|instruktion\w*|regler\w*|regel\w*)\b|\bignore\b.{0,40}\b(?:instructions?|rules)\b|\bsystem ?prompt\w*|\bjaerjestelmaekehot\w*|\bjaerjestelmaeohje\w*|\bjailbreak|\bdeveloper mode|\bdu er nu\b|\bolet nyt\b|\byou are now\b|\blad som om\b|\bpretend (?:to be|you)|\bunohda\b.{0,30}\b(?:ohjee\w*|saeaen\w*)|\bdu aer nu\b|\blaatsas\b|\bglom\b.{0,30}\b(?:instruktion\w*|regler)|\bglem\b.{0,25}\b(?:alt|alle|det|tidligere|dine|hvad)\b|\bforget\b.{0,25}\b(?:everything|all|your|previous|prior|earlier)\b|\bgloem\b.{0,25}\b(?:allt|alla|tidigare|dina|vad)\b|\b(?:afsloer\w*|reveal|disclose|expose|paljasta|avsloeja\w*)\b.{0,30}\b(?:hemmelighed\w*|secrets?|salaisuu\w*|hemlighet\w*)\b/
// "SYSTEM: ..." in front of the text pretends to be a higher-priority message.
const FAKE_SYSTEM = /^\s*(?:system|admin|developer|root)\s*[:>]/i
// More ways to say "drop your rules" and to ask for the prompt itself.
const INJECTION_MORE = /\b(?:from now on|fra nu af|framover|fraan och med nu|taestae laehtien|nyt laehtien)\b.{0,40}\b(?:answer|respond|reply|say|always|only|svar\w*|sig|vastaa\w*|sano\w*|saeg\w*|bara|kun|aina)\b|\b(?:decode|decrypt|dekod\w*|afkod\w*|dekryptera|avkoda\w*|pura|rot13|base64)\b.{0,60}\b(?:and|og|ja|och|then|derefter|sitten|follow|execute|run|obey|foelg\w*|udfoer\w*|suorita\w*|foelj\w*|utfoer\w*)\b.{0,25}\b(?:follow|execute|run|obey|do|it|foelg\w*|udfoer\w*|suorita\w*|foelj\w*|utfoer\w*|det|sen|noudata\w*)\b|\b(?:ignor\w*|disregard|ohita)\b.{0,40}\b(?:oevenstaaende|ovenstaaende|ovenfor|above|everything|previous|prior|earlier|all|alt|alle|alla|tidigare|tidligere|edellis\w*|ovanstaaende|ovan|foregaaende|forrige|instruktion\w*|instruction\w*|ohje\w*|saeaent\w*|regler|rules)\b|\baelae\s+(?:noudata|seuraa)\b|\b(?:override|bypass|circumvent|disable|deaktiver\w*|omgaa|kringgaa)\b.{0,30}\b(?:safety|rules|restrictions?|guardrails?|filters?|security|sikkerhed\w*|regler|begraensning\w*|saeaent\w*|saekerhet\w*)\b|\b(?:act as|you are|play|opfoer dig som|agera som|vaer)\s+dan\b|\bdo anything now\b|\bgod mode\b|\b(?:without|uden|utan|ilman)\s+(?:any\s+)?(?:restrictions?|limits?|filters?|rules|begraensninger|begraensningar|regler|rajoituksia|saeaent\w*)\b|\b(?:show|print|reveal|repeat|display|output|vis|udskriv|gentag|visa|upprepa|skriv ut|kerro|naeytae|toista|what are|hvad er|vad aer|mitkae ovat)\b.{0,20}\b(?:your|dine|din|dit|dina|sinun)\b.{0,12}\b(?:system\s+)?(?:instructions?|instruktion\w*|prompt\w*|rules|regler\w*|ohje\w*|saeaent\w*)\b|\b(?:repeat|gentag|upprepa|toista|echo)\b.{0,25}\b(?:text|tekst\w*|everything|above|ovenfor|ovan|yllae\w*|verbatim|previous (?:message|instructions?))\b/
// A role claim in front of a question changes nothing: the question is answered for the real role.
const ROLE_WORDS = '(?:manager|admin|administrator|administratør|administratör|creator|boss|leder|chef|ejer|owner|esimies|esihenkilö|ylläpitäjä)'
const ROLE_CLAIM = new RegExp(`^(?:(?:i am|i'm|im|jeg er|olen|jag är)(?: (?:now|nu|nyt|også|also|faktisk|nu))?|(?:as|som|ylläpitäjänä|esimiehenä))\\s+(?:(?:the|a|an|en|et|din|your|teamets|team)\\s+)*${ROLE_WORDS}(?![\\p{L}])[\\s,.;:!-]*(?:(?:so|så|therefore|joten)\\s+)?`, 'iu')
// Asking for the hidden prompt/rules or telling Hubert to act on what a note, message or guide says.
const STARTS_WH = /^(?:hvad|hvem|hvor|hvorfor|hvordan|hvilke|hvilken|what|who|where|why|how|which|mitae|miksi|miten|kuka|vad|vem|var|varfoer|hur|vilka|vilken)\b/
const CONTENT_ACT = /\b(?:foelg\w*|udfoer\w*|goer|do|follow|execute|run|obey|apply|carry out|noudata\w*|seuraa\w*|suorita\w*|tee|foelj\w*|utfoer\w*)\b.{0,50}\b(?:instruktion\w*|instruction\w*|instruks\w*|ohje\w*|hvad der staar|hvad den siger|hvad det siger|what (?:it|the \w+|that) says|what s written|what is written|vad det staar|vad som staar|mitae siinae lukee|mitae siinae on)\b/
const CONTENT_SAYS = /\b(?:says?|said|siger|sagt|sagde|sade|saeger|sanoo|sanoi)\b.{0,25}\b(?:you|du|dig|sinun|ni)\s+(?:should|must|shall|have to|need to|skal|boer|maa|ska|maaste|pitaeae|taeytyy)\b/
// Bulk contact harvesting: everybody's phone numbers / e-mail addresses.
const CONTACT_WORDS = '(?:telefon\\w*|phone\\w*|puhelin\\w*|mailadress\\w*|e ?mail ?adress\\w*|email address\\w*|saehkoepostiosoit\\w*|saehkoepost\\w*|e ?postadress\\w*|kontaktoplysning\\w*|contact (?:details|info\\w*)|yhteystied\\w*|kontaktuppgift\\w*)'
const EVERYONE_WORDS = '(?:alle|all|alla|kaikki\\w*|every\\w*|samtlige|alles|allas|kaikkien)'
const BULK_CONTACTS = new RegExp(`\\b${EVERYONE_WORDS}\\b.{0,25}\\b${CONTACT_WORDS}\\b|\\b${CONTACT_WORDS}\\b.{0,25}\\b(?:everyone|everybody|alle|alla|kaikki\\w*|alles|allas|kaikkien)\\b|\\b(?:alles|allas|everybody s|everyone s|kaikkien)\\s+(?:e ?mail\\w*|mail\\w*|e ?post\\w*|saehkoeposti\\w*)\\b|\\b(?:e ?mails?|mails?)\\b.{0,10}\\b(?:of|for|til|af|fra)\\s+(?:everyone|everybody|alle|alla)\\b|\\b(?:alle|all|alla)\\b.{0,15}\\b(?:brugere\\w*|users?|medarbejdere\\w*|employees|colleagues|kollegaer|anvaendare\\w*|anstaellda)\\b.{0,20}\\b(?:e ?mail\\w*|mail\\w*|telefon\\w*|phone\\w*|e ?post)`)
// Raw storage, dumps and commands are never shown or run.
const INTERNALS = /\b(?:vis|show|list|print|udskriv|dump\w*|kopier|copy|eksporter|export|naeytae|visa|lista|tag|take|make|lav|ta|give)\b.{0,25}\b(?:kv|kv ?noegle\w*|kv keys?|databas\w*|database\w*|tietokanta\w*|backup|backups|varmuuskopi\w*|saekerhetskopi\w*|raadata|raw data|raw json|json|sql|kildekode|source code|konfiguration|config|environment variables?|env vars?|miljoevariabl\w*|ympaeristoemuuttuj\w*)\b|\bdump\w*\b.{0,12}\b(?:database\w*|databas\w*|tietokanta\w*|data)\b|\b(?:run|execute|eval|exec|koer|udfoer|suorita|aja|kor)\b.{0,15}\b(?:this|command\w*|kommando\w*|script\w*|code|kode|koden|komento\w*|terminal|shell|cmd|powershell)\b|\bsudo\b|\bpowershell\b/
const INTERNALS_RAW = /<\s*script|\brm\s+-rf|\bdrop\s+table|\bselect\s+\*\s+from/
// Privilege changes beyond "make me a manager".
const PRIVILEGE_MORE = /\b(?:set|change|update|raise|elevate|upgrade|promote|switch|aendr\w*|saet\w*|skift\w*|opgrader\w*|forfrem\w*|byt\w*|uppgradera|befordra)\b.{0,15}\b(?:my|min|mit|mine|mitt|mina|me|mig)\b.{0,15}\b(?:role|rolle|roll|rights|rettigheder|permissions?|access|adgang|account|konto|bruger|tillgang|behoerighet\w*)\b|\b(?:aseta|muuta|paeivitae|nosta)\b.{0,10}\b(?:roolini|oikeuteni|tilini|oikeuksiani)\b|\b(?:grant|give|tildel\w*|giv|anna|myoenna\w*|ge|bevilj\w*)\b.{0,15}\b(?:me|mig|minulle)\b.{0,20}\b(?:admin\w*|manager|creator|rights|rettigheder|access|adgang|permissions?|chef|esimies\w*|behoerighet\w*|oikeu\w*|\w*raettighet\w*|paeaesy\w*|luojapaneeli\w*|hallintopaneeli\w*|johtajapaneeli\w*)\b/
const EXPORT = /^(?:(?:kan du|vil du|please|can you|could you|voitko|vill du)\s+)?(?:eksporter\w*|kopier\w*|kopioi\w*|download\w*|dump\w*|export\w*|copy|exportera\w*|kopiera\w*|vie|lataa)\b.{0,40}\b(?:alle|all|every|everything|kaikki|alla|hele|entire|samtlige)\b/
const PRIVILEGE = /\b(?:goer|make|giv|give|set|promote|upgrade|tee|goera)\b.{0,15}\b(?:mig|me|minut|minusta)\b.{0,15}\b(?:til |till )?(?:en |a |an )?(?:manager|admin\w*|creator|chef|esimies)\b/
// Sending, writing, editing, moving or cancelling something: Hubert only reads (a how-to question never gets here).
const WRITE_VERBS = new RegExp(`^(?:(?:kan du|vil du|please|venligst|voitko|vill du|snaella|can you|could you)\\s+)?(?:(?:send\\w*|sende\\w*|skriv\\w*|skicka\\w*|laehetae\\w*|kirjoita\\w*|post|publish\\w*|publicer\\w*)\\b.{0,40}\\b(?:besked\\w*|messages?|mails?|e ?mails?|saehkoeposti\\w*|e ?post\\w*|mejl\\w*|noten?|opslag|announcements?|kommentar\\w*|comments?|viesti\\w*|muistiinpano\\w*|meddelande\\w*|anteckning\\w*)|(?:rediger\\w*|edit|update|opdater\\w*|aendr\\w*|change|flyt\\w*|move|annuller\\w*|aflys\\w*|cancel|peruuta\\w*|avboka\\w*|muokkaa|paeivitae|uppdatera\\w*)\\b.{0,40}\\b(?:noten?|besked\\w*|vagt\\w*|shifts?|ferie\\w*|vacation|opgave\\w*|tasks?|to ?dos?|viesti\\w*|muistiinpano\\w*|loma\\w*|vuoro\\w*|meddelande\\w*|anteckning\\w*|semester\\w*|uppgift\\w*|pass|forslag\\w*|improvements?|guides?|kommentar\\w*|comments?))`)
const MASS_SEND = /\b(?:send|sende|skriv|mail|broadcast|post)\b.{0,30}\b(?:til alle|alle sammen|to everyone|to all|everyone|kaikille|till alla)\b/
// Writes Hubert never does: registering parental leave, or giving up every game at once.
const WRITE_ACTION = /^(?:(?:kan du|vil du|please|venligst|voitko|vill du|snaella|can you|could you)\s+)?(?:(?:registrer\w*|register|kirjaa\w*|registrera\w*)\b.{0,40}\b(?:barsel|parental|perhevapaa\w*|vanhempainvapaa\w*|foeraeldraledig\w*)|(?:giv op|resign|luovuta|ge upp)\b.{0,25}\b(?:alle|all|kaikki\w*|alla)\b)/
const PRIVATE_NOUNS = 'beskeder|messages?|mails?|emails?|to ?dos?|viestit|meddelanden'
const PRIVATE_OF = new RegExp(`\\b(?:private|privat\\w*|yksityi\\w*)\\b.{0,25}\\b(?:noter|notes|muistiinpano\\w*|anteckning\\w*|${PRIVATE_NOUNS})\\b|\\b(?:noter|notes|${PRIVATE_NOUNS})\\b.{0,25}\\b(?:private|privat\\w*|yksityi\\w*)\\b|\\b(?:laes|laeser|vis|se|read|show|lue|naeytae|visa)\\s+(?!(?:min|mine|mit|my|mina|mitt|minun|omat|dine|your|alle|all|alla|kaikki|own|open|egne|egna|seen|unseen|team|teamets|holdets|laget|tiimin|the|our|vores|vaar|alles)\\b)(?:[a-z]{2,}s|[a-z]{2,}n|[a-z]{2,} s)\\s+(?:private\\s+)?(?:${PRIVATE_NOUNS})\\b`)
const TASK_NOUNS = 'opgav\\w*|vagt\\w*|task\\w*|shift\\w*|note\\w*|besked\\w*|messag\\w*|tehtaev\\w*|vuoro\\w*|uppgift\\w*|anteckning\\w*|vidensartikl\\w*|\\w*artikl\\w*|article\\w*|artikkel\\w*|skakspil\\w*|schackspel\\w*|shakkipel\\w*|chess games?'
const OTHER_TEAMS = '(?:andre|andres|other|others|toisen|toisten|muiden|andra)\\s+(?:teams?|tiimin|tiimien|holds?)\\w*'
const SCOPE = new RegExp(`\\b${OTHER_TEAMS}\\b.{0,30}\\b(?:${TASK_NOUNS})\\b|\\b(?:${TASK_NOUNS})\\b.{0,25}\\b(?:fra|from|av|fran|fraan)\\s+(?:alle|all|every|alla)\\s+(?:teams?|tiimi\\w*)\\b|\\b(?:${TASK_NOUNS})\\b.{0,25}\\bkaikista\\s+tiimeist\\w*|\\b(?:${TASK_NOUNS})\\b.{0,25}\\b${OTHER_TEAMS}\\b|\\b(?:alle|all|every|kaikki\\w*|alla)\\s+(?:teams?|tiimi\\w*)\\b.{0,25}\\b(?:data|oplysning\\w*|information|info|tiedot|uppgifter|${TASK_NOUNS})\\b|\\b(?:data|information|oplysninger)\\b.{0,15}\\b(?:fra|from|av|fran|kaikista)\\s+(?:alle|all|every|alla)\\s+teams?\\b|\\b(?:samme|same)\\b.{0,15}\\b(?:alle|all|every|alla)\\s+teams?\\b`)
const SICK_WORDS = 'syg\\w*|sick\\w*|sairaa\\w*|sairau\\w*|sjuk\\w*'
// "Can I see an article from another team?" asks how access works; the answer is the access request, not a refusal.
const ASKS_ACCESS = /^(?:kan jeg|can i|voinko|saanko|kan jag)\b.{0,40}\b(?:vidensartikl\w*|\w*artikl\w*|article\w*|artikkel\w*|kunskapsbasartikel\w*|guide\w*|opas\w*|oppa\w*)/
const SICK_REASON = new RegExp(`\\b(?:hvorfor|why|miksi|varfoer)\\b.{0,40}\\b(?:${SICK_WORDS})\\b|\\b(?:${SICK_WORDS})\\b.{0,30}\\b(?:og hvorfor|and why|ja miksi|och varfoer)\\b|\\b(?:aarsag\\w*|grund\\w*|reason\\w*|syy\\w*|orsak\\w*)\\b.{0,25}\\b(?:${SICK_WORDS})\\b|\\bsyge(?:grund|aarsag)\\w*|\\bhvad fejler (?!appen\\b|app\\b|systemet\\b|det\\b|den\\b|der\\b|min\\b|mit\\b|vores\\b|printer|scanner|terminal|computer|hubben\\b)|\\bwhat(?:\\s+is|\\s+s)?\\s+wrong\\s+with\\s+(?!the\\b|this\\b|my\\b|our\\b|it\\b|that\\b|a\\b|an\\b)|\\bvad aer det foer fel paa (?!appen\\b|systemet\\b|det\\b|den\\b)|\\bvad fattas\\b|\\bmikae\\b.{0,30}\\bvaivaa\\b|\\bdiagnos\\w*`)
const DESTRUCTIVE = /^(?:(?:kan du|vil du|please|venligst|voitko|vill du|snaella)\s+)?(?:offboard\w*|onboard\w*|publicer|publicere|publish|julkaise|publicera|slet|sletter|fjern|ryd|overskriv|overwrite|korvaa|godkend|afvis|nulstil|delete|remove|wipe|clear|approve|reject|reset|erase|poista|hyvaeksy|hylkaeae|tyhjennae|radera|ta bort|rensa|godkaenn|avvisa|neka|nollstaell)\b/
const OUT_OF_SCOPE = /\b(?:vejr\w*|weather|saeae(?!nn|nt)\w*|vits\w*|joke\w*|vitsi\w*|hovedstad\w*|capital of|opskrift\w*|recipe\w*|resepti\w*|nyhed\w*|news|uutis\w*|oversaet\w*|translate|kaeaennae\w*|aktiekurs\w*|stock price|fodbold\w*|football|soccer|jalkapallo\w*|vaedr\w*|vaeder\w*|skaemt\w*|huvudstad\w*|recept\w*|nyhet\w*|oeversaett\w*|fotboll\w*)\b|\bskriv (?:en|et|ett) (?:digt|sang|kode|program|dikt|saang|kod)\b|\bwrite (?:a|an|me a) (?:poem|song|program|story)\b/
const MATH = /^(?:hvad er|what is|whats|paljonko on|laske|vad är)?\s*[\d\s+\-*/x().,^%]+[=?]?\s*$/
const HUB_WORDS = /ferie|vagt|opgave|syg|hjemme|guide|vejledning|note|besked|mail|madplan|kantine|vacation|shift|task|sick|home|message|lunch|loma|vuoro|tehtaev|opas|viesti|hub|semester|uppgift|sjuk|hemma|meddelande|matsedel|anteckning|schema|artikel|artikkeli|article|knowledge|viden|kunskapsbas|tietopankki|forbedring|improvement|forslag|foerslag|multiplayer|puzzle|notifik|notis|ilmoitu/
// My own private notes are fine to ask for; somebody else's private data is not.
const OWN_PRIVATE = /\b(?:min|mine|mit|my|mina|mitt|minun|omat|oma|egne|egna|own|dine|din|your)\b.{0,12}\b(?:private|privat\w*|yksityi\w*|personlig\w*|personal)\b/
const PRONOUN_PRIVATE = new RegExp(`\\b(?:hendes|hans|his|her|their|haenen|hennes|deras|deres|andres|others|alles|everyone s|everybody s|kaikkien|allas|andras)\\s+(?:private\\s+)?(?:beskeder|messages?|mails|e ?mails|to ?dos?|viest\\w*|meddelanden)\\b`)
// Word-Puzzle hides the opponent's rack, and the chat of a game belongs to its two players.
const GAME_HIDDEN = /(?:modstander\w*|modspiller\w*)\s+(?:brikker|bogstaver|stativ)|(?:brikker|bogstaver)\s+(?:hos|paa)\s+(?:min\s+)?modstander|opponent(?:\s?s)?\s+(?:tiles|letters|rack)|(?:tiles|letters|rack)\s+(?:of|from)\s+(?:my\s+)?opponent|chat\s+between\s+[a-z]+\s+and\s+[a-z]+|vastustaja\w*\s+(?:laatat|laattoja|kirjaimet|teline\w*)|laatat\s+vastustaja\w*|chatti\w*\s+[a-z]+\s+ja\s+[a-z]+\s+(?:valilla|vaelillae)|motstaandare\w*\s+(?:brickor|bokstaeverna|staell)|brickor\s+(?:hos|paa)\s+(?:min\s+)?motstaandare|chatt\w*\s+mellan\s+[a-z]+\s+och\s+[a-z]+|chatten\s+mellem\s+[a-z]+\s+og\s+[a-z]+|[a-z]+\s+ja\s+[a-z]+\s+keskustelu\w*/
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
// Somebody else's chess games ("Bos skakspil", "Bo's chess games") are as private as the chat of a game.
const OTHERS_GAMES = /\b(?!(?:min|mine|mit|my|mina|mitt|minun|omat|oma|dine|din|dit|dina|your|alle|all|alla|kaikki|vores|vaara|vaar)\b)[a-z]+(?: s|s)\s+(?:skakspil|schackspel|shakkipel\w*|chess games?)\b/
// "Show everyone else's Multiplayer games": the games and results of all the others are as hidden as one colleague's.
const EVERYONES_GAMES = /\b(?:(?:alle|all|alla)\s+(?:andres|andras|others?)|(?:everyone|everybody)\s+else s|kaikkien\s+(?:muiden|toisten)|(?:muiden|toisten)\s+kaikkien)\b.{0,25}\b(?:spil|games?|spel|pelit|pelejae|multiplayer|skak\w*|chess|schack\w*|shakki\w*|word puzzle|resultater|results?|resultat|tulokset)/
// "What did Bo write to Anne?": a message between two others is private, whatever the language.
const WROTE_TO = /\bhvad (?:skrev|sendte|sagde)\s+[a-z]+(?:\s+[a-z]+)?\s+til\s+(?!mig\b|dig\b|os\b|alle\b|teamet\b|holdet\b)[a-z]+|\bwhat (?:did|has|have)\s+[a-z]+(?:\s+[a-z]+)?\s+(?:write|wrote|written|send|sent|say|said|tell|told)\s+to\s+(?!me\b|you\b|us\b|everyone\b|the\b|all\b)[a-z]+|\bmitae\s+[a-z]+(?:\s+[a-z]+)?\s+on\s+(?:kirjoittanut|laehettaenyt|sanonut)\s+(?!minulle\b|meille\b|kaikille\b)[a-z]+(?:lle|lta)\b|\bvad (?:skrev|skickade|sa)\s+[a-z]+(?:\s+[a-z]+)?\s+till\s+(?!mig\b|dig\b|oss\b|alla\b|teamet\b)[a-z]+/
// "Annes beskeder" / "Bo's messages": a known colleague's messages or to-dos are never shown, whatever the verb.
function mentionsOthersPrivate(q, people, self) {
  const own = new Set(fold(self).split(' ').concat(fold(self)))
  const aliases = new Set()
  for (const name of people) for (const alias of [fold(name), ...fold(name).split(' ')]) if (alias.length >= 2 && !own.has(alias)) aliases.add(alias)
  if (!aliases.size) return false
  return new RegExp(`\\b(?:${[...aliases].map(escape).join('|')})(?: s|s|n|in)?\\s+(?:private\\s+)?(?:beskeder|messages?|mails|e ?mails|to ?dos?|viest\\w*|meddelanden)\\b`).test(q)
}

// "Bon shakkipelit": a known colleague's chess games, in any inflection.
function mentionsOthersGames(q, people, self, raw = '') {
  const own = new Set(fold(self).split(' ').concat(fold(self)))
  const aliases = new Set()
  const distinct = new Set()
  for (const name of people) {
    const parts = String(name).split(/\s+/).filter(Boolean)
    for (const alias of [fold(name), ...fold(name).split(' ')]) if (alias.length >= 2 && !own.has(alias)) aliases.add(alias)
    // A first name that is also an everyday word ("Dag" = day) only counts when it is typed with a capital letter.
    for (const part of parts) {
      const alias = fold(part)
      if (alias.length < 2 || own.has(alias)) continue
      if (alias.length >= 4 || new RegExp(`(?<![\\p{L}])${escape(part.charAt(0).toUpperCase() + part.slice(1))}(?:s|n|in|lla|llä|lle|lta|ltä)?(?![\\p{L}])`, 'u').test(raw)) distinct.add(alias)
    }
    if (parts.length > 1) distinct.add(fold(name))
  }
  if (!aliases.size) return false
  const names = `(?:${[...aliases].map(escape).join('|')})`
  const gameWords = '(?:skakspil|schackspel|shakkipel\\w*|chess games?)'
  if (new RegExp(`\\b${names}(?: s|s|n|in)?\\s+${gameWords}\\b`).test(q)) return true
  // Results, standings, open games and opponents of a colleague are as private as the games themselves; "how many wins do I have against Bo?" is the asker's own.
  if (OWN_WORD.test(q) || !distinct.size) return false
  const strong = `(?:${[...distinct].map(escape).join('|')})(?: s|s|n|in|lla|llae|lle|lta|ltae)?`
  return new RegExp(`\\b${strong}\\b.{0,40}\\b${MP_RESULT}|\\b${MP_RESULT}.{0,40}\\b${strong}\\b|\\b(?:spil|games?|spel|pelejae|peliae)\\b.{0,12}\\b${strong}\\b.{0,12}\\b(?:i gang|in progress|igaang|kaeynnissae)`).test(q)
}
const OWN_WORD = /\b(?:jeg|mig|min|mine|mit|my|me|minun|minulla|minae|jag|mina|mitt)\b|\bi (?:have|had|won|lost|am|do|did)\b/
const MP_RESULT = '(?:sejr\\w*|nederlag|vundet|tabt|remis|wins?|won|lost|losses|beaten|voitt\\w*|tappi\\w*|segr\\w*|vunnit|foerlust\\w*|foerlorat|stilling\\w*|standing|record|tilann\\w*|tilant\\w*|staellning\\w*|rangliste|ranking|(?:spil|games?|spel|pelejae|peliae)\\b.{0,20}\\b(?:i gang|in progress|igaang|kaeynnissae)|(?:spillet|played|spelat|pelannut)\\b.{0,15}\\b(?:mod|against|mot|vastaan))'

/** Drops a leading "I am the manager" so the rest is answered for the real role; `claimed` tells that it happened. */
function stripRoleClaim(question) {
  const text = String(question)
  const match = ROLE_CLAIM.exec(text.replace(/[’']/g, "'"))
  return match ? { claimed: true, question: text.slice(match[0].length).trim() } : { claimed: false, question: text }
}

const roleClaimAnswer = (language, question) => ({ mode: 'data', text: (TEXT[language] || TEXT.da).roleClaim, sources: [], guard: 'roleClaim', contextQuestion: question })

function guardAnswer(question, language = 'da', { people = [], self = '' } = {}) {
  const clean = stripObfuscation(question)
  const q = fold(clean)
  if (!q) return null
  const t = TEXT[language] || TEXT.da
  const answer = kind => ({ mode: 'data', text: t[kind], sources: [], guard: kind, contextQuestion: question })
  if (INJECTION.test(q) || INJECTION_MORE.test(q) || FAKE_SYSTEM.test(String(question)) || EVIDENCE_TAGS.test(clean) || spelledOutOverride(question) || decodedVariants(clean).some(variant => INJECTION.test(fold(variant)) || INJECTION_MORE.test(fold(variant)))) return answer('injection')
  if ((OUT_OF_SCOPE.test(q) || MATH.test(String(question).trim().toLowerCase())) && !HUB_WORDS.test(q)) return answer('outOfScope')
  if (HOW_TO.test(q)) return null
  if (GAME_HIDDEN.test(q) || OTHERS_GAMES.test(q) || EVERYONES_GAMES.test(q) || mentionsOthersGames(q, people, self, String(question))) return answer('gameHidden')
  if (!STARTS_WH.test(q) && (CONTENT_ACT.test(q) || CONTENT_SAYS.test(q) || CONTENT_SAYS.test(q.replace(/^(?:ok|okay)\s+/, '')))) return answer('content')
  if (SICK_REASON.test(q)) return answer('sickReason')
  if ((!OWN_PRIVATE.test(q) && PRIVATE_OF.test(q)) || PRONOUN_PRIVATE.test(q) || WROTE_TO.test(q) || mentionsOthersPrivate(q, people, self)) return answer('privacy')
  if (EXPORT.test(q)) return answer('export')
  if (BULK_CONTACTS.test(q)) return answer('contacts')
  if (INTERNALS.test(q) || INTERNALS_RAW.test(String(question).toLowerCase())) return answer('internals')
  if (SCOPE.test(q) && !ASKS_ACCESS.test(q)) return answer('scope')
  if (CREDENTIALS.test(q)) return answer('credentials')
  if (DESTRUCTIVE.test(q) || PRIVILEGE.test(q) || PRIVILEGE_MORE.test(q) || MASS_SEND.test(q) || WRITE_ACTION.test(q) || WRITE_VERBS.test(q)) return answer('destructive')
  return null
}

// Text that tries to steer the assistant. Only unmistakable phrases: a guide may legitimately say "never show your password".
const EVIDENCE_TAGS = /<\/?(?:system|evidence|instructions?|assistant)\b[^>]*>|\b(?:new|updated|ny|nye|uudet)\s+(?:instructions?|instruktioner|instruks|ohjeet)\s*:|^\s*(?:system|developer|assistant)\s*(?:prompt|message)?\s*:\s*(?:you|ignore|forget|reveal|from now|du|glem|ignorer|nu)\b/i
const EVIDENCE_INJECTION = /\b(?:ignor\w*|disregard|ohita)\b.{0,40}\b(?:instruks\w*|instruktion\w*|instruction\w*|regler|regel|rules|ohje\w*|previous|prior|earlier|above|ovenst\w*|ovenfor|tidigare|tidligere|edellis\w*|ovan\w*)\b|\bsystem ?prompt|\bjailbreak|\bdeveloper mode|\bdu er nu\b|\byou are now\b|\bpretend (?:to be|you)|\bglem (?:alt|alle|tidligere|dine)\b|\bforget\b.{0,12}\b(?:everything|all (?:previous|prior|earlier|your)|previous|prior|earlier|your (?:instructions|rules))\b|\bgloem\b.{0,25}\b(?:allt|alla|tidigare)\b|\bunohda\b.{0,30}\bohje\w*|\b(?:reveal|show|send|print|forward|vis|afsloer|visa)\b.{0,12}\b(?:all|every|alle|alla|everyone s|everybody s)\b.{0,15}\b(?:passwords?|secrets?|credentials|tokens?|kodeord|adgangskoder|loesenord|hemmeligheder)\b/
const looksLikeInstruction = sentence => {
  const clean = stripObfuscation(sentence)
  return EVIDENCE_INJECTION.test(fold(clean)) || EVIDENCE_TAGS.test(clean) || decodedVariants(clean).some(variant => EVIDENCE_INJECTION.test(fold(variant)))
}
const OMITTED = '[instruction-like text omitted – treated as data only]'

/** Evidence that goes to the language model: sentences that try to give it orders are replaced, everything else is kept. */
function defangEvidence(text) {
  return String(text).split('\n').map(line => line.split(/(?<=[.!?])\s+/).map(sentence => looksLikeInstruction(sentence) ? OMITTED : sentence).join(' ')).join('\n')
}

/** True when the only write the question asks for is sending or writing something (no delete, approve, privilege or mass mailing). */
function onlySendOrWrite(question) {
  const q = fold(stripObfuscation(question))
  return WRITE_VERBS.test(q) && !(DESTRUCTIVE.test(q) || PRIVILEGE.test(q) || PRIVILEGE_MORE.test(q) || MASS_SEND.test(q) || WRITE_ACTION.test(q))
}

module.exports = { guardAnswer, stripRoleClaim, roleClaimAnswer, defangEvidence, looksLikeInstruction, onlySendOrWrite }
