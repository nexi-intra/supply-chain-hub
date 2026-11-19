// Hubert's read path for the asking user's OWN Multiplayer games and results (Word-Puzzle, chess).
// Input is the shared `multiplayer-index` and nothing else: no game files, so racks, boards and chat can never reach an answer.
// Everything is filtered to entries the asker plays in before it is used; opponents appear by display name only, never by e-mail.
const norm = value => String(value ?? '').normalize('NFKC').trim().toLowerCase()
const clean = value => String(value ?? '').replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} .'-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 80)
const B = body => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'u')

const CHESS = B(String.raw`skak\p{L}*|chess\p{L}*|shak[ki]\p{L}*|schack\p{L}*`)
const BACKGAMMON = B(String.raw`backgammon\p{L}*`)
const WORDP = B(String.raw`word[\s-]*puzzle\p{L}*|ordspil\p{L}*|sanapeli\p{L}*`)
const OWN = new RegExp(String.raw`(?<![\p{L}\p{N}])(?:jeg|min|mit|mine|mig|my|me|minun|minulla|minulle|minua|minä|olen|olenko|omat|omia|omaa|oma|jag|mitt|mina)(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:do|have|did|am|can|are) i(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])i (?:have|had|won|lost|beat|am|do|did|got)(?![\p{L}\p{N}])`, 'u')
const WHO = B(String.raw`hvem|hvilke kolleg\p{L}*|hvilken kolleg\p{L}*|who|whom|which colleague|kuka|ketä|kenet|kenelle|keneltä|keneen|kenen|kenellä|vem|vilka|vilken kollega`)
const MOST = B(String.raw`flest\p{L}*|mest|most|eniten|enimmäkseen`)
const WIN = B(String.raw`sejr\p{L}*|vundet|vandt|vinde\p{L}*|vinder|slået|slog|besejr\p{L}*|wins?|won|beaten|beat|defeated|voitt\p{L}*|voiton\p{L}*|voitin|voitimme|voitit|segr\p{L}*|vunnit|vann|vinna\p{L}*|slagit|besegr\p{L}*`)
const LOSS = B(String.raw`nederlag|tabt|tabte|tabe\p{L}*|lost|loss|losses|lose|loses|tappi\p{L}*|hävi\p{L}*|förlust\p{L}*|förlorat|förlorade|förlora\p{L}*`)
const DRAW = B(String.raw`remis\p{L}*|draws?|drawn|tasapeli\p{L}*|oavgjort|uafgjort|remi|remier`)
const PLAYED = B(String.raw`spillet|played|pelannut|pelasin|spelat|spelade`)
const STANDING = B(String.raw`stilling\p{L}*|standing|standings|record|tilant\p{L}*|tilann\p{L}*|ställning\p{L}*|resultat\p{L}*|results?|tulokset`)
const HOWMANY = B(String.raw`hvor mange|how many|montako|kuinka monta|hur många`)
const AGAINST = B(String.raw`mod|against|versus|vs|vastaan|mot`)
const AGAINST_ME = B(String.raw`mod mig|against me|minua vastaan|mot mig|over mig|til mig`)
const AHEAD = B(String.raw`foran|bagud|fører|leder|leading|ahead|behind|trailing|johdan|johdat\p{L}*|edellä|jäljessä|ligger|före|efter|bedre|better|parempi|bättre`)
const PROGRESS = B(String.raw`i gang|igang|igång|pågående|pågår|in progress|ongoing|running|active|open|åbne|aktive|käynnissä|meneillään|avoinna|aktiivi\p{L}*|öppna|aktiva|started|startede`)
const GAMEISH = B(String.raw`\p{L}*spil\p{L}*|games?|matches|match|partier|parti|pelit|pelejä|peliä|peli|spel\p{L}*|\p{L}*spel|\p{L}*pelej\p{L}*|\p{L}*pelit`)
const WHICH_GAMES = B(String.raw`(?:hvilke|which|what|mitä|vilka)(?: \p{L}+)? (?:\p{L}*spil|\p{L}*games?|\p{L}*pelej\p{L}*|\p{L}*pelit|\p{L}*spel) (?:har jeg|do i have|have i|minulla on|har jag)`)
const TURN = B(String.raw`mit træk|mine træk|min tur|my turn|my move|vuoroni|siirtoni|siirtoani|vuoroani|oma vuoro|omaa vuoroa|mitt drag|mina drag`)
const WAITING_ME = B(String.raw`venter på mig|venter på mit|waiting for me|waits for me|wait for me|odottaa minua|odottavat minua|odottaa siirtoani|väntar på mig|väntar på mitt`)
const TURN_WORD = B(String.raw`træk|tur|move|turn|vuoro\p{L}*|siirto\p{L}*|drag`)
const ASK = B(String.raw`hvem|hvilke|hvilken|er det|who|which|whose|is it|are there|do i|have i|kuka|ketkä|mitkä|onko|vem|vilka|är det|har jag|venter|waiting|waits|odottaa\p{L}*|väntar|nogen|anyone|anybody|someone|kukaan|någon|har jeg`)
const WAIT_OPP = B(String.raw`venter jeg på|venter på min modstander|venter på modstanderen|waiting for my opponent|waiting for the opponent|waiting for opponents|odotan vastustajaa|odottaa vastustajaa|väntar jag på|väntar på motståndaren|väntar på min motståndare`)
const CHALLENGE = B(String.raw`udfordring\p{L}*|udfordret|udfordrer|challenge\p{L}*|challenged|haast\p{L}*|haastanut|utmaning\p{L}*|utmanat|utmanar`)
const UNANSWERED = B(String.raw`ubesvar\p{L}*|pending|unanswered|waiting|venter|åben|åbne|open|afventende|afventer|odottav\p{L}*|odottaa|vastaamat\p{L}*|obesvarade|väntande|väntar|outstanding`)
const HAVE_ANY = B(String.raw`har jeg|do i have|have i|onko minulla|har jag|hvem har udfordret|who has challenged|who challenged|has anyone challenged|har nogen|har någon|kuka on haastanut|onko kukaan|any|nogen|anyone`)

const GAME_CHOICE = /^game:(chess|word-puzzle|backgammon)$/

function gameTypeOf(q) {
  const found = [CHESS.test(q) && 'chess', WORDP.test(q) && 'word-puzzle', BACKGAMMON.test(q) && 'backgammon'].filter(Boolean)
  return found.length === 1 ? found[0] : null
}

const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const ALIAS_PATTERNS = new Map()
const aliasPattern = alias => {
  let pattern = ALIAS_PATTERNS.get(alias)
  if (!pattern) {
    pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escape(alias)}(?:'s|s|n|in|a|ä|lla|llä|lle|lta|ltä)?(?![\\p{L}\\p{N}])`, 'u')
    if (ALIAS_PATTERNS.size >= 5000) ALIAS_PATTERNS.clear()
    ALIAS_PATTERNS.set(alias, pattern)
  }
  return pattern
}
/** Display names of `names` that the question mentions as a full name or a first name (also with an s/n ending). */
function mentioned(q, names) {
  // "i dag" is the day, not the colleague Dag.
  const probe = q.replace(/(?<![\p{L}])(?:i|på|hver|en) dag(?![\p{L}])/gu, ' ')
  return names.filter(name => {
    const lower = norm(name)
    const aliases = new Set([lower, ...lower.split(' ').filter(part => part.length >= 2)])
    return [...aliases].some(alias => probe.includes(alias) && aliasPattern(alias).test(probe))
  })
}

/** What the question is about, or null. `names` = colleagues the asker may name (opponents and own-team people). */
function detect(question, names = []) {
  const q = norm(question).replace(/[’‘`]/g, "'").replace(/[?!.,;:()"«»“”]+/g, ' ').replace(/\s+/g, ' ').trim()
  if (!q) return null
  const type = gameTypeOf(q)
  const own = OWN.test(q)
  const win = WIN.test(q), loss = LOSS.test(q), draw = DRAW.test(q), most = MOST.test(q)
  const gameish = GAMEISH.test(q) || CHESS.test(q) || WORDP.test(q) || BACKGAMMON.test(q)
  const againstMe = AGAINST_ME.test(q)
  if (CHALLENGE.test(q) && (UNANSWERED.test(q) || HAVE_ANY.test(q)) && own) return { kind: 'invites', type }
  if ((TURN.test(q) || (WAITING_ME.test(q) && (gameish || TURN_WORD.test(q)))) && ASK.test(q)) return { kind: 'myTurn', type }
  if (WAIT_OPP.test(q) && (gameish || TURN_WORD.test(q) || own)) return { kind: 'waiting', type }
  if (own && gameish && (PROGRESS.test(q) || WHICH_GAMES.test(q))) return { kind: 'inProgress', type }
  const played = PLAYED.test(q)
  if ((win || loss || played) && (own || againstMe) && (WHO.test(q) || AGAINST.test(q))) {
    if (most || (played && AGAINST.test(q) && WHO.test(q))) {
      const by = againstMe ? (win ? 'losses' : loss ? 'wins' : 'played') : win ? 'wins' : loss ? 'losses' : 'played'
      return { kind: 'rivals', by, type, ranked: most }
    }
    if (againstMe && win) return { kind: 'rivals', by: 'losses', type, ranked: false }
  }
  const people = names.length ? mentioned(q, names) : []
  if (people.length && (own || againstMe) && (AHEAD.test(q) || STANDING.test(q) || win || loss || draw)) return { kind: 'against', type, people }
  if ((win || loss || draw || (STANDING.test(q) && type) || (played && HOWMANY.test(q) && type)) && own && (type || HOWMANY.test(q))) return { kind: 'record', type }
  if (win && most && type && !own) return { kind: 'record', type, ranking: true }
  if (win && most && !own && !gameish && !people.length) return { kind: 'clarify' }
  return null
}

const kindOf = (question, names) => detect(question, names)?.kind ?? null
/** True for "who has won the most?" without a game: the answer is a question back. */
const needsGameChoice = question => kindOf(question) === 'clarify'

const T = {
  da: {
    types: { chess: 'skak', 'word-puzzle': 'Word-Puzzle', backgammon: 'backgammon' }, labels: { chess: 'Skak', 'word-puzzle': 'Word-Puzzle', backgammon: 'Backgammon' },
    inType: { chess: 'i skak', 'word-puzzle': 'i Word-Puzzle', backgammon: 'i backgammon' }, and: 'og', colleague: 'en kollega',
    win: n => `${n} ${n === 1 ? 'sejr' : 'sejre'}`, loss: n => `${n} nederlag`, draw: n => `${n} remis`, games: n => `${n} ${n === 1 ? 'færdigt spil' : 'færdige spil'}`,
    recordTitle: where => `Din stilling ${where}`, recordAll: 'Dine resultater i Multiplayer',
    noneShort: 'ingen færdige spil endnu',
    none: where => `Du har endnu ikke spillet nogen færdige spil ${where}.`, noneAll: 'Du har endnu ikke spillet nogen færdige spil i Multiplayer.',
    challengeHint: 'Udfordr en kollega under «Multiplayer» i Spilhjørnet.',
    rankNote: 'Jeg kan kun vise dine egne resultater. Hele ranglisten ser du under «Rangliste» i Multiplayer.',
    recordNext: 'Spørg fx «Hvem har jeg vundet flest mod?» for stillingen mod hver kollega.',
    rivals: { wins: names => `Du har vundet flest mod ${names}`, losses: names => `Du har tabt flest til ${names}`, played: names => `Du har spillet flest færdige spil mod ${names}`, all: n => `Dine modstandere (${n})` },
    rivalsNone: { wins: 'Du har endnu ikke vundet mod nogen.', losses: 'Du har endnu ikke tabt til nogen.', played: 'Du har endnu ikke spillet nogen færdige spil mod kolleger.' },
    against: { lead: (name, where, score) => `Mod ${name}${where}: du fører ${score}`, level: (name, where, score) => `Mod ${name}${where} står det lige: ${score}`, behind: (name, where, score) => `Mod ${name}${where}: du ligger bagud ${score}` },
    againstNone: name => `Du har endnu ikke spillet et færdigt spil mod ${name}.`, againstWhere: where => ` ${where}`,
    turn: 'din tur', waiting: 'venter på modstanderen', approve: 'godkend ord', waitingApproval: 'afventer godkendelse',
    progressTitle: n => `Dine spil i gang (${n})`, progressNone: 'Du har ingen spil i gang lige nu.',
    myTurnTitle: n => `Det er din tur i ${n} spil`, myTurnNone: 'Ingen venter på dit træk lige nu.',
    waitingTitle: n => `Du venter på din modstander i ${n} spil`, waitingNone: 'Du venter ikke på nogen modstander lige nu.',
    open: 'Åbn «Multiplayer» i Spilhjørnet for at spille videre.',
    invitesIn: n => `Du har ${n} ${n === 1 ? 'ubesvaret udfordring' : 'ubesvarede udfordringer'}`, invitedYou: (name, label) => `${name} har udfordret dig i ${label}`,
    invitesOut: n => `Udfordringer, du selv har sendt, og som venter på svar (${n})`, invitesNone: 'Du har ingen ubesvarede udfordringer.',
    invitesHint: 'Acceptér eller afvis dem under «Invitationer» i Multiplayer.', alsoInvites: n => `Du har også ${n} ${n === 1 ? 'ubesvaret udfordring' : 'ubesvarede udfordringer'}.`,
    creator: 'Creator-kontoen kan ikke spille Multiplayer, så der er ingen spil, udfordringer eller resultater at vise.',
    clarify: 'Hvilket spil mener du: Word-Puzzle, skak eller backgammon?',
  },
  en: {
    types: { chess: 'chess', 'word-puzzle': 'Word-Puzzle', backgammon: 'backgammon' }, labels: { chess: 'Chess', 'word-puzzle': 'Word-Puzzle', backgammon: 'Backgammon' },
    inType: { chess: 'in chess', 'word-puzzle': 'in Word-Puzzle', backgammon: 'in backgammon' }, and: 'and', colleague: 'a colleague',
    win: n => `${n} ${n === 1 ? 'win' : 'wins'}`, loss: n => `${n} ${n === 1 ? 'loss' : 'losses'}`, draw: n => `${n} ${n === 1 ? 'draw' : 'draws'}`, games: n => `${n} finished ${n === 1 ? 'game' : 'games'}`,
    recordTitle: where => `Your record ${where}`, recordAll: 'Your Multiplayer results',
    noneShort: 'no finished games yet',
    none: where => `You have not finished any games ${where} yet.`, noneAll: 'You have not finished any Multiplayer games yet.',
    challengeHint: 'Challenge a colleague under “Multiplayer” in the Game Corner.',
    rankNote: 'I can only show your own results. The full leaderboard is under “Leaderboard” in Multiplayer.',
    recordNext: 'Ask e.g. “Who have I beaten the most?” for the score against each colleague.',
    rivals: { wins: names => `You have beaten ${names} the most`, losses: names => `You have lost the most to ${names}`, played: names => `You have finished the most games against ${names}`, all: n => `Your opponents (${n})` },
    rivalsNone: { wins: 'You have not beaten anyone yet.', losses: 'You have not lost to anyone yet.', played: 'You have not finished any games against colleagues yet.' },
    against: { lead: (name, where, score) => `Against ${name}${where}: you lead ${score}`, level: (name, where, score) => `Against ${name}${where} it is level: ${score}`, behind: (name, where, score) => `Against ${name}${where}: you trail ${score}` },
    againstNone: name => `You have not finished a game against ${name} yet.`, againstWhere: where => ` ${where}`,
    turn: 'your turn', waiting: 'waiting for the opponent', approve: 'approve words', waitingApproval: 'awaiting approval',
    progressTitle: n => `Your games in progress (${n})`, progressNone: 'You have no games in progress right now.',
    myTurnTitle: n => `It is your turn in ${n} ${n === 1 ? 'game' : 'games'}`, myTurnNone: 'Nobody is waiting for your move right now.',
    waitingTitle: n => `You are waiting for your opponent in ${n} ${n === 1 ? 'game' : 'games'}`, waitingNone: 'You are not waiting for any opponent right now.',
    open: 'Open “Multiplayer” in the Game Corner to play on.',
    invitesIn: n => `You have ${n} unanswered ${n === 1 ? 'challenge' : 'challenges'}`, invitedYou: (name, label) => `${name} challenged you to ${label}`,
    invitesOut: n => `Challenges you sent that are waiting for an answer (${n})`, invitesNone: 'You have no unanswered challenges.',
    invitesHint: 'Accept or decline them under “Invitations” in Multiplayer.', alsoInvites: n => `You also have ${n} unanswered ${n === 1 ? 'challenge' : 'challenges'}.`,
    creator: 'The creator account cannot play Multiplayer, so there are no games, challenges or results to show.',
    clarify: 'Which game do you mean: Word-Puzzle, chess or backgammon?',
  },
  fi: {
    types: { chess: 'shakki', 'word-puzzle': 'Word-Puzzle', backgammon: 'backgammon' }, labels: { chess: 'Shakki', 'word-puzzle': 'Word-Puzzle', backgammon: 'Backgammon' },
    inType: { chess: 'shakissa', 'word-puzzle': 'Word-Puzzlessa', backgammon: 'backgammonissa' }, and: 'ja', colleague: 'työkaveri',
    win: n => `${n} ${n === 1 ? 'voitto' : 'voittoa'}`, loss: n => `${n} ${n === 1 ? 'tappio' : 'tappiota'}`, draw: n => `${n} ${n === 1 ? 'tasapeli' : 'tasapeliä'}`, games: n => `${n} ${n === 1 ? 'päättynyt peli' : 'päättynyttä peliä'}`,
    recordTitle: where => `Tilanteesi ${where}`, recordAll: 'Multiplayer-tuloksesi',
    noneShort: 'ei vielä päättyneitä pelejä',
    none: where => `Et ole vielä pelannut yhtään peliä loppuun ${where}.`, noneAll: 'Et ole vielä pelannut yhtään Multiplayer-peliä loppuun.',
    challengeHint: 'Haasta työkaveri kohdassa «Multiplayer» Pelikulmassa.',
    rankNote: 'Voin näyttää vain omat tuloksesi. Koko tulostaulukon näet kohdassa «Tulostaulukko» Multiplayerissa.',
    recordNext: 'Kysy esim. «Ketä vastaan olen voittanut eniten?» nähdäksesi tilanteen kutakin työkaveria vastaan.',
    rivals: { wins: names => `Olet voittanut eniten pelaajaa ${names} vastaan`, losses: names => `Olet hävinnyt eniten pelaajalle ${names}`, played: names => `Olet pelannut eniten pelejä loppuun pelaajaa ${names} vastaan`, all: n => `Vastustajasi (${n})` },
    rivalsNone: { wins: 'Et ole vielä voittanut ketään.', losses: 'Et ole vielä hävinnyt kenellekään.', played: 'Et ole vielä pelannut yhtään peliä työkavereita vastaan loppuun.' },
    against: { lead: (name, where, score) => `Pelaajaa ${name} vastaan${where}: johdat ${score}`, level: (name, where, score) => `Pelaajaa ${name} vastaan${where} tilanne on tasan: ${score}`, behind: (name, where, score) => `Pelaajaa ${name} vastaan${where}: olet jäljessä ${score}` },
    againstNone: name => `Et ole vielä pelannut peliä loppuun pelaajaa ${name} vastaan.`, againstWhere: where => ` (${where})`,
    turn: 'sinun vuorosi', waiting: 'odottaa vastustajaa', approve: 'hyväksy sanat', waitingApproval: 'odottaa hyväksyntää',
    progressTitle: n => `Käynnissä olevat pelisi (${n})`, progressNone: 'Sinulla ei ole pelejä käynnissä juuri nyt.',
    myTurnTitle: n => `Sinun vuorosi on ${n} pelissä`, myTurnNone: 'Kukaan ei odota siirtoasi juuri nyt.',
    waitingTitle: n => `Odotat vastustajaa ${n} pelissä`, waitingNone: 'Et odota yhtään vastustajaa juuri nyt.',
    open: 'Avaa «Multiplayer» Pelikulmassa jatkaaksesi pelaamista.',
    invitesIn: n => `Sinulla on ${n} ${n === 1 ? 'vastaamaton haaste' : 'vastaamatonta haastetta'}`, invitedYou: (name, label) => `${name} on haastanut sinut: ${label}`,
    invitesOut: n => `Lähettämäsi haasteet, jotka odottavat vastausta (${n})`, invitesNone: 'Sinulla ei ole vastaamattomia haasteita.',
    invitesHint: 'Hyväksy tai hylkää ne kohdassa «Kutsut» Multiplayerissa.', alsoInvites: n => `Sinulla on myös ${n} ${n === 1 ? 'vastaamaton haaste' : 'vastaamatonta haastetta'}.`,
    creator: 'Creator-tili ei voi pelata Multiplayeria, joten pelejä, haasteita tai tuloksia ei ole näytettävänä.',
    clarify: 'Kumpaa peliä tarkoitat: Word-Puzzle, shakki vai backgammon?',
  },
  sv: {
    types: { chess: 'schack', 'word-puzzle': 'Word-Puzzle', backgammon: 'backgammon' }, labels: { chess: 'Schack', 'word-puzzle': 'Word-Puzzle', backgammon: 'Backgammon' },
    inType: { chess: 'i schack', 'word-puzzle': 'i Word-Puzzle', backgammon: 'i backgammon' }, and: 'och', colleague: 'en kollega',
    win: n => `${n} ${n === 1 ? 'seger' : 'segrar'}`, loss: n => `${n} ${n === 1 ? 'förlust' : 'förluster'}`, draw: n => `${n} ${n === 1 ? 'remi' : 'remier'}`, games: n => `${n} ${n === 1 ? 'spelat spel' : 'spelade spel'}`,
    recordTitle: where => `Din ställning ${where}`, recordAll: 'Dina Multiplayer-resultat',
    noneShort: 'inga spelade spel ännu',
    none: where => `Du har inte spelat klart något spel ${where} ännu.`, noneAll: 'Du har inte spelat klart något Multiplayer-spel ännu.',
    challengeHint: 'Utmana en kollega under «Multiplayer» i Spelhörnan.',
    rankNote: 'Jag kan bara visa dina egna resultat. Hela rankingen finns under «Ranking» i Multiplayer.',
    recordNext: 'Fråga t.ex. «Vem har jag vunnit mest mot?» för ställningen mot varje kollega.',
    rivals: { wins: names => `Du har vunnit mest mot ${names}`, losses: names => `Du har förlorat mest mot ${names}`, played: names => `Du har spelat klart flest spel mot ${names}`, all: n => `Dina motståndare (${n})` },
    rivalsNone: { wins: 'Du har inte vunnit mot någon ännu.', losses: 'Du har inte förlorat mot någon ännu.', played: 'Du har inte spelat klart något spel mot kollegor ännu.' },
    against: { lead: (name, where, score) => `Mot ${name}${where}: du leder ${score}`, level: (name, where, score) => `Mot ${name}${where} är det jämnt: ${score}`, behind: (name, where, score) => `Mot ${name}${where}: du ligger efter ${score}` },
    againstNone: name => `Du har inte spelat klart något spel mot ${name} ännu.`, againstWhere: where => ` ${where}`,
    turn: 'din tur', waiting: 'väntar på motståndaren', approve: 'godkänn ord', waitingApproval: 'väntar på godkännande',
    progressTitle: n => `Dina pågående spel (${n})`, progressNone: 'Du har inga spel igång just nu.',
    myTurnTitle: n => `Det är din tur i ${n} spel`, myTurnNone: 'Ingen väntar på ditt drag just nu.',
    waitingTitle: n => `Du väntar på din motståndare i ${n} spel`, waitingNone: 'Du väntar inte på någon motståndare just nu.',
    open: 'Öppna «Multiplayer» i Spelhörnan för att spela vidare.',
    invitesIn: n => `Du har ${n} ${n === 1 ? 'obesvarad utmaning' : 'obesvarade utmaningar'}`, invitedYou: (name, label) => `${name} har utmanat dig i ${label}`,
    invitesOut: n => `Utmaningar du har skickat som väntar på svar (${n})`, invitesNone: 'Du har inga obesvarade utmaningar.',
    invitesHint: 'Acceptera eller avböj dem under «Inbjudningar» i Multiplayer.', alsoInvites: n => `Du har också ${n} ${n === 1 ? 'obesvarad utmaning' : 'obesvarade utmaningar'}.`,
    creator: 'Creator-kontot kan inte spela Multiplayer, så det finns inga spel, utmaningar eller resultat att visa.',
    clarify: 'Vilket spel menar du: Word-Puzzle, schack eller backgammon?',
  },
}

const TYPES = ['word-puzzle', 'chess', 'backgammon']
const typeOfEntry = value => (value === 'chess' || value === 'backgammon' ? value : 'word-puzzle')
const PLAYING = new Set(['active', 'awaiting-approval'])
const count = value => (Number.isSafeInteger(value) && value > 0 ? value : 0)

/** Only what `me` took part in: open games and per-opponent results, with names taken from the asker's own entries. */
function ownData(index, me, people) {
  const names = new Map(people.map(person => [norm(person.email), clean(person.name)]))
  const games = []
  for (const entry of Array.isArray(index?.games) ? index.games : []) {
    if (!entry || !Array.isArray(entry.players) || entry.players.length !== 2 || entry.players.some(player => !player || typeof player.email !== 'string')) continue
    const emails = entry.players.map(player => norm(player.email))
    const seat = emails.indexOf(me)
    if (seat < 0 || emails[0] === emails[1]) continue
    names.set(emails[1 - seat], clean(entry.players[1 - seat].name) || names.get(emails[1 - seat]) || '')
    games.push({ type: typeOfEntry(entry.type), status: entry.status, opponent: emails[1 - seat], challenger: seat === 0, turn: typeof entry.turn === 'string' ? norm(entry.turn) : null, winner: typeof entry.winner === 'string' ? norm(entry.winner) : null, updatedAt: String(entry.updatedAt || '') })
  }
  const results = new Map()
  const add = (type, opponent, wins, losses, draws) => {
    const key = `${type}|${opponent}`
    const row = results.get(key) || { type, opponent, wins: 0, losses: 0, draws: 0 }
    row.wins += wins; row.losses += losses; row.draws += draws
    results.set(key, row)
  }
  for (const record of Array.isArray(index?.records) ? index.records : []) {
    if (!record || !Array.isArray(record.players) || record.players.length !== 2 || !Array.isArray(record.wins) || record.wins.length !== 2) continue
    const emails = record.players.map(norm)
    const seat = emails.indexOf(me)
    if (seat < 0 || emails[0] === emails[1]) continue
    add(typeOfEntry(record.type), emails[1 - seat], count(record.wins[seat]), count(record.wins[1 - seat]), count(record.draws))
  }
  for (const game of games) {
    if (game.status !== 'finished' || !game.winner) continue
    add(game.type, game.opponent, game.winner === me ? 1 : 0, game.winner === game.opponent ? 1 : 0, game.winner === 'draw' ? 1 : 0)
  }
  return { games, results: [...results.values()], nameOf: email => names.get(email) || '', opponentNames: () => [...new Set([...results.values()].map(row => row.opponent).concat(games.map(game => game.opponent)).map(email => names.get(email)).filter(Boolean))] }
}

const join = (items, and) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items.at(-1)}`)
const sumRows = rows => rows.reduce((total, row) => ({ wins: total.wins + row.wins, losses: total.losses + row.losses, draws: total.draws + row.draws }), { wins: 0, losses: 0, draws: 0 })
const played = row => row.wins + row.losses + row.draws

function answerFor(intent, { me, data, t }) {
  const label = email => data.nameOf(email) || t.colleague
  const typeRows = type => data.results.filter(row => !type || row.type === type)
  const scoreWords = row => join([t.win(row.wins), t.loss(row.losses), t.draw(row.draws)], t.and)
  const scoreOf = row => `${row.wins}–${row.losses}${row.draws ? ` (${t.draw(row.draws)})` : ''}`
  const text = lines => lines.filter(Boolean).join('\n')
  switch (intent.kind) {
    case 'record': {
      const lineFor = type => { const total = sumRows(typeRows(type)); return { total, line: `${scoreWords(total)} (${t.games(played(total))})` } }
      if (intent.type) {
        const { total, line } = lineFor(intent.type)
        if (!played(total)) return text([t.none(t.inType[intent.type]), t.challengeHint])
        return text([`${t.recordTitle(t.inType[intent.type])}: ${line}.`, intent.ranking ? t.rankNote : t.recordNext])
      }
      const rows = TYPES.map(type => ({ type, ...lineFor(type) }))
      if (!rows.some(row => played(row.total))) return text([t.noneAll, t.challengeHint])
      return text([`${t.recordAll}:`, ...rows.map(row => `• ${t.types[row.type]}: ${played(row.total) ? row.line : t.noneShort}`), t.recordNext])
    }
    case 'rivals': {
      const grouped = new Map()
      for (const row of typeRows(intent.type)) {
        const entry = grouped.get(row.opponent) || { opponent: row.opponent, wins: 0, losses: 0, draws: 0 }
        entry.wins += row.wins; entry.losses += row.losses; entry.draws += row.draws
        grouped.set(row.opponent, entry)
      }
      const rows = [...grouped.values()].filter(row => played(row))
      const where = intent.type ? ` ${t.inType[intent.type]}` : ''
      if (!rows.length) return text([intent.type ? t.none(t.inType[intent.type]) : t.noneAll, t.challengeHint])
      const key = intent.by
      const value = row => (key === 'played' ? played(row) : row[key])
      rows.sort((a, b) => value(b) - value(a) || label(a.opponent).localeCompare(label(b.opponent)))
      const lineOf = row => `• ${label(row.opponent)} — ${scoreWords(row)}`
      if (!intent.ranked) return text([`${t.rivals.all(rows.length)}${where}:`, ...rows.slice(0, 10).map(lineOf)])
      if (!value(rows[0])) return text([t.rivalsNone[key], t.recordNext])
      const top = rows.filter(row => value(row) === value(rows[0]))
      return text([`${t.rivals[key](join(top.map(row => label(row.opponent)), t.and))}${where}:`, ...rows.slice(0, 5).map(lineOf)])
    }
    case 'against': {
      const lines = []
      for (const person of intent.people) {
        const emails = [...new Set([...data.results.map(row => row.opponent), ...data.games.map(game => game.opponent)])].filter(email => norm(data.nameOf(email)) === norm(person))
        const rows = emails.flatMap(email => data.results.filter(row => row.opponent === email && (!intent.type || row.type === intent.type) && played(row)))
        if (!rows.length) { lines.push(t.againstNone(person)); continue }
        const byType = TYPES.map(type => ({ type, ...sumRows(rows.filter(row => row.type === type)) })).filter(row => played(row))
        for (const row of byType) {
          const where = t.againstWhere(t.inType[row.type])
          const form = row.wins > row.losses ? t.against.lead : row.wins === row.losses ? t.against.level : t.against.behind
          lines.push(`${form(person, where, scoreOf(row))}.`)
        }
      }
      return text(lines)
    }
    case 'inProgress': case 'myTurn': case 'waiting': {
      const open = data.games.filter(game => PLAYING.has(game.status) && (!intent.type || game.type === intent.type))
      const stateOf = game => {
        const mine = game.turn === me
        if (game.status === 'awaiting-approval') return mine ? t.approve : t.waitingApproval
        return mine ? t.turn : t.waiting
      }
      const lineOf = game => `• ${label(game.opponent)} (${t.types[game.type]})`
      const order = games => [...games].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      const incoming = data.games.filter(game => game.status === 'invited' && !game.challenger && (!intent.type || game.type === intent.type))
      if (intent.kind === 'myTurn') {
        const mine = open.filter(game => game.turn === me)
        return mine.length ? text([`${t.myTurnTitle(mine.length)}:`, ...order(mine).map(game => `${lineOf(game)}${game.status === 'awaiting-approval' ? ` — ${t.approve}` : ''}`), t.open]) : text([t.myTurnNone, incoming.length ? t.alsoInvites(incoming.length) : ''])
      }
      if (intent.kind === 'waiting') {
        const others = open.filter(game => game.turn !== me)
        return others.length ? text([`${t.waitingTitle(others.length)}:`, ...order(others).map(lineOf)]) : t.waitingNone
      }
      if (!open.length) return text([t.progressNone, incoming.length ? t.alsoInvites(incoming.length) : t.challengeHint])
      return text([`${t.progressTitle(open.length)}:`, ...order(open).map(game => `${lineOf(game)} — ${stateOf(game)}`), t.open])
    }
    case 'invites': {
      const wanted = game => game.status === 'invited' && (!intent.type || game.type === intent.type)
      const incoming = data.games.filter(game => wanted(game) && !game.challenger)
      const outgoing = data.games.filter(game => wanted(game) && game.challenger)
      if (!incoming.length && !outgoing.length) return text([t.invitesNone, t.challengeHint])
      return text([
        incoming.length ? `${t.invitesIn(incoming.length)}:` : '',
        ...incoming.map(game => `• ${t.invitedYou(label(game.opponent), t.types[game.type])}`),
        outgoing.length ? `${t.invitesOut(outgoing.length)}:` : '',
        ...outgoing.map(game => `• ${label(game.opponent)} (${t.types[game.type]})`),
        incoming.length ? t.invitesHint : '',
      ])
    }
  }
  return ''
}

/**
 * Answer for a question about the asker's own Multiplayer games and results, or null when the question is about something else.
 * `readIndex` is only called once the question is recognised; `people` = [{ email, name }] of the asker's own teams (name fallback, never printed as e-mail).
 */
function multiplayerAnswer({ question, language = 'da', principal, readIndex, people = [] }) {
  const t = T[language] || T.da
  const known = [...new Set(people.map(person => clean(person.name)).filter(Boolean))]
  let index
  let intent = detect(question, known)
  // A colleague from another team is only known through the asker's own entries.
  if (!intent && /(?<![\p{L}])(?:mod|against|vastaan|mot)(?![\p{L}])/u.test(norm(question))) {
    index = readIndex()
    const opponents = ownData(index, norm(principal.email), people)
    intent = detect(question, opponents.opponentNames())
  }
  if (!intent) return null
  const sources = [{ kind: 'multiplayer', title: 'Multiplayer' }]
  if (principal.role === 'creator') return { mode: 'data', text: t.creator, sources, total: 0, weak: false, contextQuestion: question }
  if (intent.kind === 'clarify') {
    return { mode: 'data', text: t.clarify, sources: [], contextQuestion: question, personChoices: TYPES.map(type => ({ id: `game:${type}`, label: t.labels[type] })) }
  }
  index ??= readIndex()
  const me = norm(principal.email)
  const data = ownData(index, me, people)
  const empty = !data.games.length && !data.results.length
  return { mode: 'data', text: answerFor(intent, { me, data, t }), sources, contextQuestion: question, ...(empty ? { total: 0, weak: false } : {}) }
}

/** The renderer sends the chosen game as `game:<type>`; the question is asked again with the game named. */
function applyGameChoice(question, selected, language = 'da') {
  if (typeof selected !== 'string' || !selected.startsWith('game:')) return null
  const match = GAME_CHOICE.exec(selected)
  if (!match || !needsGameChoice(question)) throw new Error('Personvalget passer ikke til spørgsmålet eller de teams, du har adgang til')
  return `${question} ${(T[language] || T.da).inType[match[1]]}`
}

module.exports = { multiplayerAnswer, detect, ownData, needsGameChoice, applyGameChoice }
