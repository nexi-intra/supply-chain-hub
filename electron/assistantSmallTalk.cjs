// Small talk: greetings, thanks, goodbyes, identity, rudeness and context-free
// "do it for me". These used to fall through to the generic overview and were
// logged as unanswered. Only whole short messages match, so a real question that
// merely starts with "hej" keeps its normal route.
const TEXT = {
  da: {
    greeting: 'Hej! Hvad kan jeg hjælpe med? Spørg fx «Hvem er på arbejde i dag?», «Hvad er mine opgaver i næste uge?» eller «Hvordan søger jeg ferie?».',
    thanks: 'Det var så lidt! Sig til, hvis der er mere, jeg kan hjælpe med.',
    bye: 'Hav en god dag! Jeg er her, når du har brug for mig.',
    identity: 'Jeg er Hubert, hubbens hjælper. Jeg kan slå vagter, ferie, sygdom, hjemmearbejde, opgaver, noter og guides op, forklare hvordan hubben bruges, og for dig oprette en ferieanmodning, en to-do, en fælles to-do eller en note, melde dig syg, registrere hjemmearbejde, sende en besked til en kollega eller give en high-five – altid først når du har bekræftet det.',
    rude: 'Undskyld – det svar ramte ved siden af. Skriv gerne, hvad du leder efter, med et navn, en dato eller et modul, fx «Hvor er Anne i morgen?» eller «Vis guiden om returnering». Så gør jeg mit bedste.',
    vague: 'Hvad skal jeg hjælpe med? Jeg kan fx oprette en ferieanmodning eller en to-do for dig – skriv fx «Opret en to-do: ring til fragtmanden i morgen» – eller slå vagter, ferie og guides op.',
    ack: 'Fint! Sig til, hvis du vil have mig til at slå noget op eller forklare noget.',
    unsure: 'Det er helt i orden. Skriv, hvad du leder efter – fx et navn, en dato eller et modul – så finder jeg det. Du kan også spørge «Hvad kan du hjælpe med?».',
    broken: 'Det er ærgerligt at høre. Fortæl hvilket modul og hvad der sker, så prøver jeg at hjælpe – fx «Hvordan opretter jeg en ferieanmodning?».',
    wellbeing: 'Tak, det går fint! Hvad kan jeg hjælpe dig med? Spørg fx «Hvem er på arbejde i dag?» eller «Hvad er der til frokost?».',
  },
  en: {
    greeting: 'Hi! What can I help you with? Try e.g. “Who is at work today?”, “What are my tasks next week?” or “How do I request vacation?”.',
    thanks: "You're welcome! Just ask if there is anything else.",
    bye: "Have a nice day! I'm here whenever you need me.",
    identity: "I'm Hubert, the hub's helper. I can look up shifts, vacation, sickness, home office, tasks, notes and guides, explain how the hub works, and for you create a vacation request, a to-do, a shared to-do or a note, report you sick, register home office, send a colleague a message or give a high-five – always only after you confirm it.",
    rude: 'Sorry – that answer missed. Tell me what you are looking for with a name, a date or a module, e.g. “Where is Anne tomorrow?” or “Show the returns guide”, and I will do my best.',
    vague: 'What should I help with? I can e.g. create a vacation request or a to-do for you – try “Create a to-do: call the carrier tomorrow” – or look up shifts, vacation and guides.',
    ack: 'Great! Just say if you want me to look something up or explain something.',
    unsure: 'That is fine. Tell me what you are looking for – e.g. a name, a date or a module – and I will find it. You can also ask “What can you help me with?”.',
    broken: 'Sorry to hear that. Tell me which module and what happens, and I will try to help – e.g. “How do I request vacation?”.',
    wellbeing: 'Thanks, I am doing fine! What can I help you with? Try e.g. “Who is at work today?” or “What is for lunch?”.',
  },
  fi: {
    greeting: 'Hei! Miten voin auttaa? Kysy esim. «Kuka on töissä tänään?», «Mitkä ovat tehtäväni ensi viikolla?» tai «Miten haen lomaa?».',
    thanks: 'Ole hyvä! Kysy vain, jos voin auttaa jossain muussa.',
    bye: 'Hyvää päivänjatkoa! Olen täällä, kun tarvitset minua.',
    identity: 'Olen Hubert, hubin apuri. Voin hakea vuorot, lomat, sairauspoissaolot, etätyöt, tehtävät, muistiinpanot ja oppaat, neuvoa hubin käytössä sekä puolestasi luoda lomapyynnön, to-don, yhteisen to-don tai muistiinpanon, ilmoittaa sinut sairaaksi, kirjata etätyön, lähettää viestin kollegalle tai antaa high fiven – aina vasta kun olet vahvistanut sen.',
    rude: 'Anteeksi – vastaus meni ohi. Kerro mitä etsit nimellä, päivämäärällä tai moduulilla, esim. «Missä Anne on huomenna?», niin teen parhaani.',
    vague: 'Missä voin auttaa? Voin esim. luoda lomapyynnön tai to-don puolestasi – kirjoita esim. «Luo to-do: soita kuljetusliikkeeseen huomenna» – tai hakea vuoroja, lomia ja oppaita.',
    ack: 'Hienoa! Sano vain, jos haluat, että haen tai selitän jotain.',
    unsure: 'Ei haittaa. Kerro mitä etsit – esim. nimi, päivämäärä tai moduuli – niin etsin sen. Voit myös kysyä «Mitä osaat?».',
    broken: 'Harmi kuulla. Kerro mikä moduuli ja mitä tapahtuu, niin yritän auttaa – esim. «Miten haen lomaa?».',
    wellbeing: 'Kiitos, hyvin menee! Miten voin auttaa? Kysy esim. «Kuka on töissä tänään?» tai «Mitä lounaaksi?».',
  },
  sv: {
    greeting: 'Hej! Vad kan jag hjälpa till med? Fråga t.ex. «Vem är på jobbet idag?», «Vilka är mina uppgifter nästa vecka?» eller «Hur ansöker jag om semester?».',
    thanks: 'Varsågod! Säg till om det är något mer jag kan hjälpa till med.',
    bye: 'Ha en bra dag! Jag finns här när du behöver mig.',
    identity: 'Jag är Hubert, hubbens hjälpreda. Jag kan slå upp pass, semester, sjukdom, hemarbete, uppgifter, anteckningar och guider, förklara hur hubben används och åt dig skapa en semesteransökan, en att göra-uppgift, en gemensam uppgift eller en anteckning, sjukanmäla dig, registrera hemarbete, skicka ett meddelande till en kollega eller ge en high five – alltid först när du har bekräftat det.',
    rude: 'Förlåt – det svaret missade. Skriv gärna vad du letar efter med ett namn, ett datum eller en modul, t.ex. «Var är Anne imorgon?» eller «Visa guiden om retur». Så gör jag mitt bästa.',
    vague: 'Vad ska jag hjälpa till med? Jag kan t.ex. skapa en semesteransökan eller en att göra-uppgift åt dig – skriv t.ex. «Skapa en att göra: ring speditören imorgon» – eller slå upp pass, semester och guider.',
    ack: 'Bra! Säg till om du vill att jag ska slå upp eller förklara något.',
    unsure: 'Det är helt okej. Skriv vad du letar efter – t.ex. ett namn, ett datum eller en modul – så hittar jag det. Du kan också fråga «Vad kan du hjälpa till med?».',
    broken: 'Tråkigt att höra. Berätta vilken modul och vad som händer, så försöker jag hjälpa till – t.ex. «Hur ansöker jag om semester?».',
    wellbeing: 'Tack, det går bra! Vad kan jag hjälpa dig med? Fråga t.ex. «Vem är på jobbet idag?» eller «Vad är det för lunch?».',
  },
}

const fold = value => String(value || '').toLowerCase().normalize('NFKC')
  .replace(/[æä]/g, 'ae').replace(/[øö]/g, 'oe').replace(/å/g, 'aa')
  .replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/\s+/g, ' ').trim()

// Whole-message patterns on folded text (æ->ae, ø->oe, å->aa).
const NAME = "(?:\\s+(?:hubert|hubi|bot|botten|chatbot))?"
const PATTERNS = {
  greeting: new RegExp(`^(?:hej|hejsa|hey|hi|hello|hallo|halloej|goddag|godmorgen|god morgen|godaften|good morning|good afternoon|moi|hei|terve|huomenta|hyvaeae huomenta|hyvaeae paeivaeae|hyvaeae iltaa|paeivaeae|hejsan|tjena|tja|god morgon|godmorgon|god kvaell|hallaa)(?:\\s+(?:med dig|igen|there|again|paa dig))?${NAME}$`),
  thanks: new RegExp(`^(?:(?:tusind|mange|1000)\\s+)?tak(?:\\s+(?:for\\s+(?:hjaelpen|det|svaret)|skal du have))?${NAME}$|^(?:thanks|thank you|thx|ty)(?:\\s+(?:a lot|so much|very much|for the help))?${NAME}$|^kiitos(?:\\s+(?:paljon|avusta))?${NAME}$|^(?:tusen\\s+)?tack(?:\\s+(?:saa mycket|saa hemskt mycket|foer\\s+(?:hjaelpen|det|svaret)|ska du ha))?${NAME}$|^(?:(?:mange |tusind )?tak(?: for (?:hjaelpen|det|svaret))?|thanks(?: a lot)?(?: for the help)?|thank you(?: for the help)?|kiitos(?: avusta)?|(?:tusen )?tack(?: foer hjaelpen)?)\\s+(?:(?:du er|you are|you re|you'?re|olet|du aer)\\s+(?:sej|super|fed|genial|god|great|awesome|amazing|the best|cool|mahtava|paras|bra|grym)|you rock|du rocker|du rokker)${NAME}$`),
  wellbeing: /^(?:hvordan gaar det(?: med dig)?|hvordan har du det|how are you(?: doing| today)?|how'?s it going|how is it going|how you doing|mitae kuuluu|miten menee|mitae sinulle kuuluu|hur maar du|hur gaar det(?: foer dig)?|hur har du det)$/,
  bye: new RegExp(`^(?:farvel|vi ses|vi snakkes|paa gensyn|hav en god dag|hav en fortsat god dag|god weekend|godnat|bye|bye bye|goodbye|good night|see you|see you later|see ya|cya|take care|have a nice day|naekemiin|nakemiin|naehdaeaen|heippa|heihei|hei hei|moikka|moi moi|hyvaeae yoetae|hejdaa|hej daa|hejsvejs|adjoe|ha en bra dag|ha det bra|vi hoers|trevlig helg|god natt)${NAME}$`),
  identity: /^(?:hvem er du|hvad er du|hvad hedder du|hvem er hubert|who are you|what are you|what is your name|kuka olet|kuka sinae olet|mikae olet|vem aer du|vad aer du|vad heter du|vem aer hubert)$/,
  vague: /^(?:kan du (?:goere|klare|fikse|ordne) det(?: for mig)?|goer det(?: for mig)?|kan du hjaelpe(?: mig)?|hjaelp(?: mig)?|can you do (?:it|that)(?: for me)?|do it(?: for me)?|can you help(?: me)?|help(?: me)?|voitko auttaa|auta|apua|kan du (?:goera|fixa|ordna) det(?: aat mig)?|goer det(?: aat mig)?|kan du hjaelpa(?: mig)?)$/,
  ack: new RegExp(`^(?:ok|okay|okej|okey|oki|fint|super|perfekt|godt|great|nice|cool|got it|alright|fine|hienoa|selvae|hyvae|kiva|toppen|bra|jaha|aha)${NAME}$`),
  unsure: /^(?:h+m+|oe+h+|ved ikke|jeg ved ikke|ingen ide|aner det ikke|i don't know|i dont know|dunno|no idea|not sure|en tiedae|en tieda|jag vet inte|vet inte|ingen aning)$/,
  findIt: /^(?:kan du finde (?:den|det)|can you find (?:it|that)|(?:hvor er|where is|where's|var aer) (?:den|det|that|the) (?:ting|thing|grej|grejen|dingen)(?: .*)?)$/,
  broken: /^(?:(?:det|den|appen) )?(?:virker|fungerer) ikke$|^(?:it |this |that |the app )?(?:does not|doesn't|doesnt|is not|isn't|isnt) work(?:ing)?$|^not working$|^(?:se |sovellus )?ei toimi$|^(?:det |den |appen )?(?:fungerar|funkar) inte$/,
}
const RUDE = /\b(?:dum|dumme|dumt|idiot|idiotisk|elendig|ubrugelig|ringe|klam|stupid|dumb|useless|idiotic|tyhmae|hyoedytoen|surkea|korkad|vaerdeloes|oanvaendbar|urusel)\b/
const DATA_WORDS = /ferie|vagt|opgave|syg|hjemme|guide|vejledning|note|vacation|shift|task|sick|home|loma|vuoro|tehtaev|opas|semester|pass|uppgift|sjuk|hemma|anteckning/
// Small talk has few language markers, so the matched words decide the reply language.
const LANG_HINT = {
  en: /\b(?:hey|hi|hello|good morning|good afternoon|good night|thanks|thank you|thx|ty|bye|bye bye|goodbye|see you|see you later|see ya|cya|take care|have a nice day|who are you|what are you|what is your name|can you|do it|help|stupid|dumb|useless|idiotic|i don't know|i dont know|dunno|no idea|not sure|doesn't|doesnt|does not|not working|okay|got it|great|nice|cool|alright|where is that thing|where's|how are you|how'?s it going|you rock)\b/,
  fi: /\b(?:moi|hei|terve|huomenta|paeivaeae|kiitos|naekemiin|nakemiin|naehdaeaen|heihei|hei hei|moi moi|hyvaeae yoetae|heippa|moikka|kuka|mikae|voitko|auta|apua|tyhmae|hyoedytoen|surkea|en tiedae|en tieda|ei toimi|hienoa|selvae|hyvae|kiva|mitae kuuluu|miten menee)\b/,
  sv: /\b(?:hejsan|tjena|tja|god morgon|godmorgon|god kvaell|hallaa|tack|hejdaa|hej daa|adjoe|hejsvejs|god natt|ha en bra dag|ha det bra|vi hoers|trevlig helg|vem aer du|vad aer du|vad heter du|vem aer hubert|goera|hjaelpa|korkad|vaerdeloes|oanvaendbar|urusel|jag vet inte|vet inte|ingen aning|fungerar inte|funkar inte|toppen|okej|bra|jaha|hur maar du|hur gaar det|hur har du det)\b/,
  da: /\b(?:hej|hejsa|halloej|goddag|godmorgen|god morgen|godaften|tak|farvel|vi ses|vi snakkes|paa gensyn|godnat|du er|hvem|hvad|kan du|goer|hjaelp|dum|dumme|idiot|elendig|ubrugelig|ved ikke|ingen ide|aner det ikke|virker ikke|fungerer ikke|fint|godt|perfekt|hvor er den ting|finde den|finde det|hvordan gaar det|hvordan har du det|du er sej|du rocker)\b/,
}

function smallTalkAnswer(question, language = 'da', previousQuestion) {
  const q = fold(question)
  if (!q || q.split(' ').length > 7) return null
  let kind = Object.keys(PATTERNS).find(key => PATTERNS[key].test(q))
  // "do it for me" right after a question has context - leave it to the action/follow-up routes.
  if (kind === 'vague' && previousQuestion) return null
  if (kind === 'findIt') {
    if (previousQuestion) return null
    kind = 'unsure'
  }
  if (!kind && RUDE.test(q) && !DATA_WORDS.test(q) && q.split(' ').length <= 5) kind = 'rude'
  if (!kind) return null
  // Words shared by Danish and Swedish ("hej", "kan du") follow a Swedish app language.
  const hinted = ['en', 'fi', 'sv', 'da'].filter(lang => !(lang === 'da' && language === 'sv') && LANG_HINT[lang].test(q))
  const replyLanguage = hinted.includes(language) ? language : hinted[0] || language
  const t = TEXT[replyLanguage] || TEXT.da
  return { mode: 'data', text: t[kind], sources: [], smallTalk: kind, contextQuestion: question }
}

/** A fixed small-talk reply of one kind, e.g. for a message with nothing but symbols. */
function smallTalkReply(kind, language = 'da', question = '') {
  return { mode: 'data', text: (TEXT[language] || TEXT.da)[kind], sources: [], smallTalk: kind, contextQuestion: question }
}

module.exports = { smallTalkAnswer, smallTalkReply }
