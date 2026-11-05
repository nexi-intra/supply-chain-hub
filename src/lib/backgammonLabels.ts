import type { Language } from './translations'

/** Backgammon texts. Functions only take ready-made strings and numbers, never codes to look up. */
export interface BackgammonLabels {
  tagline: string
  /** Lower case, for running text: "you play white". */
  colors: { white: string; black: string; random: string }
  playsAs: (color: string) => string
  boardLabel: string
  yourTurn: string
  theirTurn: (name: string) => string
  /** "3 og 1" / "dobbelt 4" */
  dice: (a: number, b: number) => string
  rolled: (dice: string) => string
  theirRoll: (name: string, dice: string) => string
  opening: (white: number, black: number) => string
  selectHint: string
  targetHint: string
  mustEnter: string
  bearOff: string
  doneHint: string
  noMoves: string
  pass: string
  confirm: string
  undo: string
  left: (count: number) => string
  bar: string
  off: string
  pips: string
  /** Screen-reader name of a point: number, how many checkers and whose. */
  point: (point: number, count: number, owner: string | null) => string
  takeOff: string
  lastTurn: (name: string, dice: string, moves: string) => string
  lastTurnBlocked: (name: string, dice: string) => string
  finished: { won: (kind: string) => string; lost: (name: string, kind: string) => string; kinds: [string, string, string] }
  challenge: { description: string; color: string; colorHint: string }
  rules: { title: string; items: string[] }
  keyboard: { title: string; items: Array<{ keys: string; text: string }> }
}

const BACKGAMMON_LABELS: Record<Language, BackgammonLabels> = {
  da: {
    tagline: 'Backgammon mod en kollega: slå terningerne, byg mure og få alle 15 brikker hjem først.',
    colors: { white: 'hvid', black: 'sort', random: 'tilfældig' },
    playsAs: color => `Du spiller ${color}`,
    boardLabel: 'Backgammonbræt',
    yourTurn: 'Din tur',
    theirTurn: name => `${name} tænker`,
    dice: (a, b) => (a === b ? `dobbelt ${a}` : `${a} og ${b}`),
    rolled: dice => `Du slog ${dice}.`,
    theirRoll: (name, dice) => `${name} slog ${dice}.`,
    opening: (white, black) => `Åbningsslag: hvid ${white}, sort ${black}.`,
    selectHint: 'Klik på en af dine brikker for at se, hvor den kan flytte hen.',
    targetHint: 'Klik på et markeret felt for at flytte brikken. Klik på brikken igen for at fortryde valget.',
    mustEnter: 'Du har en brik på baren. Den skal ind på brættet først.',
    bearOff: 'Alle dine brikker er hjemme. Nu kan du tage dem ud.',
    doneHint: 'Turen er klar. Tryk "Afslut tur", eller fortryd og flyt anderledes.',
    noMoves: 'Du kan ikke flytte med dette slag.',
    pass: 'Videre',
    confirm: 'Afslut tur',
    undo: 'Fortryd',
    left: count => (count === 1 ? '1 terning tilbage' : `${count} terninger tilbage`),
    bar: 'Bar',
    off: 'Ude',
    pips: 'Pips',
    point: (point, count, owner) => (owner ? `Felt ${point}: ${count} ${owner} ${count === 1 ? 'brik' : 'brikker'}` : `Felt ${point}: tomt`),
    takeOff: 'Tag brikken ud',
    lastTurn: (name, dice, moves) => `${name} slog ${dice}: ${moves}`,
    lastTurnBlocked: (name, dice) => `${name} slog ${dice} og kunne ikke flytte.`,
    finished: {
      won: kind => `Du vandt - ${kind}!`,
      lost: (name, kind) => `${name} vandt - ${kind}`,
      kinds: ['enkelt sejr (1 point)', 'gammon (2 point)', 'backgammon (3 point)'],
    },
    challenge: {
      description: 'Vælg en kollega og din farve. Spillet starter, når din kollega accepterer, og åbningsslaget afgør, hvem der begynder.',
      color: 'Din farve',
      colorHint: 'Hvid flytter mod højre hjørne nederst, sort spejlvendt. Tilfældig trækker lod.',
    },
    rules: {
      title: 'Kort om reglerne',
      items: [
        'Flyt dine 15 brikker rundt og hjem, og tag dem ud. Den, der først har alle ude, vinder.',
        'Hver terning er et træk. Slår du dobbelt, flytter du fire gange.',
        'Et felt med to eller flere modstanderbrikker er lukket. En enlig brik kan slås og må starte forfra fra baren.',
        'Du skal bruge så mange terninger som muligt. Kan du kun bruge én, skal det være den højeste.',
        'Gammon (2 point): modstanderen har ingen brikker ude. Backgammon (3 point): og har stadig en brik på baren eller i dit hjem.',
      ],
    },
    keyboard: {
      title: 'Tastatur',
      items: [
        { keys: 'Tab', text: 'Gå mellem felterne' },
        { keys: 'Enter / Mellemrum', text: 'Vælg en brik, og flyt den til et markeret felt' },
        { keys: 'Esc', text: 'Slip brikken, og gå derefter tilbage til lobbyen' },
      ],
    },
  },
  en: {
    tagline: 'Backgammon against a colleague: roll the dice, build blocks and bring all 15 checkers home first.',
    colors: { white: 'white', black: 'black', random: 'random' },
    playsAs: color => `You play ${color}`,
    boardLabel: 'Backgammon board',
    yourTurn: 'Your turn',
    theirTurn: name => `${name} is thinking`,
    dice: (a, b) => (a === b ? `double ${a}` : `${a} and ${b}`),
    rolled: dice => `You rolled ${dice}.`,
    theirRoll: (name, dice) => `${name} rolled ${dice}.`,
    opening: (white, black) => `Opening roll: white ${white}, black ${black}.`,
    selectHint: 'Click one of your checkers to see where it can move.',
    targetHint: 'Click a marked point to move the checker. Click the checker again to cancel.',
    mustEnter: 'You have a checker on the bar. It must enter the board first.',
    bearOff: 'All your checkers are home. You can bear them off now.',
    doneHint: 'Your turn is ready. Press "End turn", or undo and move differently.',
    noMoves: 'You cannot move with this roll.',
    pass: 'Continue',
    confirm: 'End turn',
    undo: 'Undo',
    left: count => (count === 1 ? '1 die left' : `${count} dice left`),
    bar: 'Bar',
    off: 'Off',
    pips: 'Pips',
    point: (point, count, owner) => (owner ? `Point ${point}: ${count} ${owner} ${count === 1 ? 'checker' : 'checkers'}` : `Point ${point}: empty`),
    takeOff: 'Bear the checker off',
    lastTurn: (name, dice, moves) => `${name} rolled ${dice}: ${moves}`,
    lastTurnBlocked: (name, dice) => `${name} rolled ${dice} and could not move.`,
    finished: {
      won: kind => `You won - ${kind}!`,
      lost: (name, kind) => `${name} won - ${kind}`,
      kinds: ['single game (1 point)', 'gammon (2 points)', 'backgammon (3 points)'],
    },
    challenge: {
      description: 'Pick a colleague and your colour. The game starts when your colleague accepts, and the opening roll decides who begins.',
      color: 'Your colour',
      colorHint: 'White heads for the bottom right corner, black the mirror image. Random draws lots.',
    },
    rules: {
      title: 'The rules in short',
      items: [
        'Move your 15 checkers round and home, then bear them off. The first to bear off all of them wins.',
        'Each die is one move. A double is played four times.',
        'A point with two or more opposing checkers is blocked. A single checker can be hit and starts again from the bar.',
        'Use as many dice as you can. If only one can be used, it must be the higher one.',
        'Gammon (2 points): the loser has borne off none. Backgammon (3 points): and still has a checker on the bar or in your home board.',
      ],
    },
    keyboard: {
      title: 'Keyboard',
      items: [
        { keys: 'Tab', text: 'Move between the points' },
        { keys: 'Enter / Space', text: 'Pick a checker and move it to a marked point' },
        { keys: 'Esc', text: 'Put the checker down, then back to the lobby' },
      ],
    },
  },
  sv: {
    tagline: 'Backgammon mot en kollega: slå tärningarna, bygg block och få hem alla 15 brickor först.',
    colors: { white: 'vit', black: 'svart', random: 'slumpad' },
    playsAs: color => `Du spelar ${color}`,
    boardLabel: 'Backgammonbräde',
    yourTurn: 'Din tur',
    theirTurn: name => `${name} tänker`,
    dice: (a, b) => (a === b ? `dubbel ${a}` : `${a} och ${b}`),
    rolled: dice => `Du slog ${dice}.`,
    theirRoll: (name, dice) => `${name} slog ${dice}.`,
    opening: (white, black) => `Öppningsslag: vit ${white}, svart ${black}.`,
    selectHint: 'Klicka på en av dina brickor för att se vart den kan flyttas.',
    targetHint: 'Klicka på en markerad spets för att flytta brickan. Klicka på brickan igen för att ångra valet.',
    mustEnter: 'Du har en bricka på baren. Den måste in på brädet först.',
    bearOff: 'Alla dina brickor är hemma. Nu kan du ta ut dem.',
    doneHint: 'Turen är klar. Tryck på "Avsluta tur", eller ångra och flytta annorlunda.',
    noMoves: 'Du kan inte flytta med det här slaget.',
    pass: 'Vidare',
    confirm: 'Avsluta tur',
    undo: 'Ångra',
    left: count => (count === 1 ? '1 tärning kvar' : `${count} tärningar kvar`),
    bar: 'Bar',
    off: 'Ute',
    pips: 'Pips',
    point: (point, count, owner) => (owner ? `Spets ${point}: ${count} ${owner} ${count === 1 ? 'bricka' : 'brickor'}` : `Spets ${point}: tom`),
    takeOff: 'Ta ut brickan',
    lastTurn: (name, dice, moves) => `${name} slog ${dice}: ${moves}`,
    lastTurnBlocked: (name, dice) => `${name} slog ${dice} och kunde inte flytta.`,
    finished: {
      won: kind => `Du vann - ${kind}!`,
      lost: (name, kind) => `${name} vann - ${kind}`,
      kinds: ['enkel seger (1 poäng)', 'gammon (2 poäng)', 'backgammon (3 poäng)'],
    },
    challenge: {
      description: 'Välj en kollega och din färg. Spelet börjar när kollegan accepterar, och öppningsslaget avgör vem som börjar.',
      color: 'Din färg',
      colorHint: 'Vit går mot nedre högra hörnet, svart spegelvänt. Slumpad lottar.',
    },
    rules: {
      title: 'Reglerna i korthet',
      items: [
        'Flytta dina 15 brickor runt och hem, och ta ut dem. Den som först har alla ute vinner.',
        'Varje tärning är ett drag. Slår du dubbel flyttar du fyra gånger.',
        'En spets med två eller fler motståndarbrickor är stängd. En ensam bricka kan slås ut och får börja om från baren.',
        'Använd så många tärningar som möjligt. Kan bara en användas måste det vara den högsta.',
        'Gammon (2 poäng): förloraren har inga brickor ute. Backgammon (3 poäng): och har dessutom en bricka på baren eller i ditt hemfält.',
      ],
    },
    keyboard: {
      title: 'Tangentbord',
      items: [
        { keys: 'Tab', text: 'Gå mellan spetsarna' },
        { keys: 'Enter / Mellanslag', text: 'Välj en bricka och flytta den till en markerad spets' },
        { keys: 'Esc', text: 'Släpp brickan, och gå sedan tillbaka till lobbyn' },
      ],
    },
  },
  fi: {
    tagline: 'Backgammonia kollegaa vastaan: heitä nopat, rakenna muureja ja tuo kaikki 15 nappulaa kotiin ensin.',
    colors: { white: 'valkoinen', black: 'musta', random: 'satunnainen' },
    playsAs: color => `Pelaat: ${color}`,
    boardLabel: 'Backgammonlauta',
    yourTurn: 'Sinun vuorosi',
    theirTurn: name => `${name} miettii`,
    dice: (a, b) => (a === b ? `tupla ${a}` : `${a} ja ${b}`),
    rolled: dice => `Heitit ${dice}.`,
    theirRoll: (name, dice) => `${name} heitti ${dice}.`,
    opening: (white, black) => `Aloitusheitto: valkoinen ${white}, musta ${black}.`,
    selectHint: 'Napsauta omaa nappulaasi nähdäksesi, minne se voi siirtyä.',
    targetHint: 'Napsauta merkittyä pistettä siirtääksesi nappulan. Napsauta nappulaa uudelleen peruaksesi valinnan.',
    mustEnter: 'Sinulla on nappula palkilla. Sen täytyy palata laudalle ensin.',
    bearOff: 'Kaikki nappulasi ovat kotona. Voit nyt poistaa niitä laudalta.',
    doneHint: 'Vuoro on valmis. Paina "Lopeta vuoro" tai peru ja siirrä toisin.',
    noMoves: 'Et voi siirtää tällä heitolla.',
    pass: 'Jatka',
    confirm: 'Lopeta vuoro',
    undo: 'Peru',
    left: count => (count === 1 ? '1 noppa jäljellä' : `${count} noppaa jäljellä`),
    bar: 'Palkki',
    off: 'Pois',
    pips: 'Pipit',
    point: (point, count, owner) => (owner ? `Piste ${point}: ${count} × ${owner}` : `Piste ${point}: tyhjä`),
    takeOff: 'Poista nappula laudalta',
    lastTurn: (name, dice, moves) => `${name} heitti ${dice}: ${moves}`,
    lastTurnBlocked: (name, dice) => `${name} heitti ${dice} eikä voinut siirtää.`,
    finished: {
      won: kind => `Voitit - ${kind}!`,
      lost: (name, kind) => `${name} voitti - ${kind}`,
      kinds: ['tavallinen voitto (1 piste)', 'gammon (2 pistettä)', 'backgammon (3 pistettä)'],
    },
    challenge: {
      description: 'Valitse kollega ja värisi. Peli alkaa, kun kollega hyväksyy, ja aloitusheitto ratkaisee, kuka aloittaa.',
      color: 'Värisi',
      colorHint: 'Valkoinen kulkee kohti oikeaa alakulmaa, musta peilikuvana. Satunnainen arpoo.',
    },
    rules: {
      title: 'Säännöt lyhyesti',
      items: [
        'Siirrä 15 nappulaasi ympäri kotiin ja poista ne laudalta. Ensimmäisenä kaikki poistanut voittaa.',
        'Jokainen noppa on yksi siirto. Tuplalla siirrät neljä kertaa.',
        'Piste, jossa on kaksi tai useampia vastustajan nappuloita, on suljettu. Yksinäinen nappula voidaan lyödä palkille.',
        'Käytä niin monta noppaa kuin mahdollista. Jos vain yhtä voi käyttää, sen on oltava suurempi.',
        'Gammon (2 pistettä): häviäjä ei ole poistanut yhtään. Backgammon (3 pistettä): ja hänellä on vielä nappula palkilla tai kotialueellasi.',
      ],
    },
    keyboard: {
      title: 'Näppäimistö',
      items: [
        { keys: 'Tab', text: 'Siirry pisteiden välillä' },
        { keys: 'Enter / Välilyönti', text: 'Valitse nappula ja siirrä se merkittyyn pisteeseen' },
        { keys: 'Esc', text: 'Laske nappula ja palaa sitten aulaan' },
      ],
    },
  },
}

export function getBackgammonLabels(language: Language): BackgammonLabels {
  return BACKGAMMON_LABELS[language] ?? BACKGAMMON_LABELS.da
}

export { BACKGAMMON_LABELS }
