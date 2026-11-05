import type { Language } from './translations'
import type { Premium } from '@/games/wordPuzzle/display'
import { BACKGAMMON_LABELS, type BackgammonLabels } from './backgammonLabels'
import type {
  MultiplayerErrorCode,
  MultiplayerFinishedReason,
  MultiplayerGameStatus,
  MultiplayerGameType,
  MultiplayerLanguage,
  MultiplayerMoveError,
  MultiplayerNotificationType,
} from './multiplayer'

export interface MultiplayerLabels {
  gameName: string
  /** Display name per game, for notifications and headings that name the game. */
  gameNames: Record<MultiplayerGameType, string>
  sectionName: string
  sectionTagline: string
  backToGameCorner: string
  backToLobby: string
  hub: {
    tagline: string
    backToMultiplayer: string
    openGame: string
    wordPuzzle: string
    chess: string
    backgammon: string
    moreSoon: string
    moreSoonBody: string
    yourTurn: (count: number) => string
    invitations: (count: number) => string
  }
  loading: string
  retry: string
  close: string
  cancel: string
  you: string
  languageNames: Record<MultiplayerLanguage, string>
  /** Only the invitation depends on the game; `gameType` defaults to word-puzzle. */
  notifications: Record<MultiplayerNotificationType, (name: string, gameType?: MultiplayerGameType) => string>
  errors: Record<MultiplayerErrorCode, string> & { generic: string }
  moveErrors: Record<MultiplayerMoveError, string>
  lobby: {
    tagline: string
    challenge: string
    challengeHint: string
    unavailableTitle: string
    unavailableBody: string
    loadError: string
    noGames: string
    record: string
    wins: string
    losses: string
    draws: string
    played: string
    sections: { yourTurn: string; invitations: string; waiting: string; finished: string }
    invitationsIn: string
    invitationsOut: string
    showMore: string
    showLess: string
    open: string
    accept: string
    decline: string
    withdraw: string
    remind: string
    remindedRecently: string
    updated: (when: string) => string
    news: string
    markRead: string
    leaderboard: { title: string; hint: string; legend: string; empty: string }
    topWords: { title: string; hint: string; empty: string; points: (score: number) => string }
    rivals: {
      title: string
      hint: string
      empty: string
      ahead: string
      behind: string
      level: string
      record: (wins: number, losses: number, draws: number) => string
      last: (when: string) => string
      rematch: string
    }
    status: Record<MultiplayerGameStatus, string>
    badge: { yourTurn: string; waiting: string; approve: string; waitingApproval: string }
    outcome: { won: string; lost: string; draw: string }
    reason: Record<MultiplayerFinishedReason, string>
    score: (mine: number, theirs: number) => string
  }
  challenge: {
    title: string
    description: string
    search: string
    searchPlaceholder: string
    noPeople: string
    language: string
    languageHint: string
    send: string
    sending: string
    pickPerson: string
  }
  toast: {
    challengeSent: (name: string) => string
    accepted: string
    declined: string
    withdrawn: string
    reminded: (name: string) => string
    rematchSent: (name: string) => string
  }
  match: {
    boardLabel: string
    rackLabel: string
    square: (row: number, col: number) => string
    premium: Record<Premium, string>
    centre: string
    blankTile: string
    tileLabel: (letter: string, points: number) => string
    yourTurn: string
    theirTurn: (name: string) => string
    waitHint: string
    placeHint: string
    shuffle: string
    recall: string
    play: string
    playing: string
    pass: string
    exchange: string
    resign: string
    exchangeTitle: string
    exchangeHint: string
    exchangeConfirm: (count: number) => string
    exchangeNeedsBag: string
    confirmPass: { title: string; body: string; confirm: string }
    confirmResign: { title: string; body: string; confirm: string }
    keepPlaying: string
    blank: { title: string; hint: string }
    preview: { title: string; hint: string; checking: string; total: string; bingo: string; unknownWord: string; unknownHint: string; failed: string }
    approval: {
      approverTitle: (name: string) => string
      approverBody: (name: string) => string
      approve: string
      reject: string
      moverTitle: (name: string) => string
      moverBody: string
      score: (points: number) => string
    }
    players: string
    points: string
    bag: string
    theirTiles: (count: number) => string
    onTurn: string
    history: {
      title: string
      empty: string
      play: (name: string, words: string) => string
      pass: (name: string) => string
      exchange: (name: string, count: number) => string
      resign: (name: string) => string
    }
    chat: { title: string; placeholder: (name: string) => string; send: string; empty: string }
    /** Hubert, the room's dog. His name tag always reads "Hubert". */
    hubert: {
      /** What he says when he is petted. */
      woofs: string[]
      call: string
      callHint: string
      treat: (left: number) => string
      bone: (left: number) => string
      treatsGone: string
      bonesGone: string
      /** Announced to both players; name is null for the viewer's own feeding. */
      fed: (kind: 'treat' | 'bone', name: string | null) => string
    }
    /** Emoji sent to the opponent; `names` follows the order of MULTIPLAYER_REACTION_EMOJIS. */
    react: {
      button: string
      hint: string
      tray: string
      names: readonly string[]
      received: (name: string, emojiName: string) => string
      tooSoon: string
    }
    finished: { won: string; lost: (name: string) => string; draw: string; final: string; rematch: string }
    keyboard: { title: string; items: Array<{ keys: string; text: string }> }
    direction: { across: string; down: string }
    loadError: string
    reloaded: string
  }
  chess: ChessLabels
  backgammon: BackgammonLabels
}

/** Chess texts. Functions only take ready-made strings and numbers, never codes to look up. */
export interface ChessLabels {
  tagline: string
  /** Lower case, for running text: "you play white". */
  colors: { white: string; black: string; random: string }
  /** Capitalised, as the first word of a piece name. */
  sides: { white: string; black: string }
  pieces: { p: string; n: string; b: string; r: string; q: string; k: string }
  /** "White knight" from a side and a piece name. */
  pieceName: (side: string, piece: string) => string
  /** "White knight on f3". */
  onSquare: (piece: string, square: string) => string
  emptySquare: (square: string) => string
  playsAs: (color: string) => string
  boardLabel: string
  yourTurn: string
  theirTurn: (name: string) => string
  check: string
  inCheck: string
  selectHint: string
  targetHint: (piece: string) => string
  waitHint: string
  moved: (name: string, move: string) => string
  lastMove: string
  challenge: { description: string; color: string; colorHint: string }
  promotion: { title: string; hint: string }
  draw: {
    offer: string
    offered: string
    incoming: (name: string) => string
    incomingBody: string
    accept: string
    decline: string
    confirmTitle: string
    confirmBody: string
    confirm: string
  }
  sheet: { title: string; empty: string; white: string; black: string }
  captured: { title: string; empty: string; advantage: (points: number) => string; mine: string; theirs: string }
  sound: { on: string; off: string }
  finished: { checkmate: string }
  keyboard: { title: string; items: Array<{ keys: string; text: string }> }
}

const CHESS_LABELS: Record<Language, ChessLabels> = {
  da: {
    tagline: 'Klassisk skak mod en kollega ved stuebordet, ét træk ad gangen og i dit eget tempo.',
    colors: { white: 'hvid', black: 'sort', random: 'tilfældig' },
    sides: { white: 'Hvid', black: 'Sort' },
    pieces: { p: 'bonde', n: 'springer', b: 'løber', r: 'tårn', q: 'dronning', k: 'konge' },
    pieceName: (side, piece) => `${piece === 'tårn' && side === 'Hvid' ? 'Hvidt' : side} ${piece}`,
    onSquare: (piece, square) => `${piece} på ${square}`,
    emptySquare: square => `${square}, tomt felt`,
    playsAs: color => `Du spiller ${color}`,
    boardLabel: 'Skakbræt',
    yourTurn: 'Dit træk',
    theirTurn: name => `${name} tænker`,
    check: 'Skak!',
    inCheck: 'Din konge står i skak.',
    selectHint: 'Vælg en brik, eller træk den til et markeret felt.',
    targetHint: piece => `${piece} er løftet. Vælg et markeret felt.`,
    waitHint: 'Vent på dit træk. Du kan imens skrive i chatten eller kalde på Hubert.',
    moved: (name, move) => `${name} spillede ${move}`,
    lastMove: 'Sidste træk',
    challenge: {
      description: 'Vælg en kollega og din farve. Spillet starter, når din kollega accepterer.',
      color: 'Din farve',
      colorHint: 'Hvid trækker først. Vælger du tilfældig, trækkes der lod, når udfordringen accepteres.',
    },
    promotion: { title: 'Forvandl bonden', hint: 'Vælg den brik, bonden skal blive til.' },
    draw: {
      offer: 'Tilbyd remis',
      offered: 'Remistilbud sendt',
      incoming: name => `${name} tilbyder remis`,
      incomingBody: 'Accepterer du, ender spillet uafgjort. Trækker du i stedet, er tilbuddet afvist.',
      accept: 'Acceptér remis',
      decline: 'Afvis',
      confirmTitle: 'Tilbyd remis?',
      confirmBody: 'Din modstander kan acceptere eller afvise. Spillet fortsætter imens.',
      confirm: 'Tilbyd remis',
    },
    sheet: { title: 'Trækliste', empty: 'Ingen træk endnu. Hvid begynder.', white: 'Hvid', black: 'Sort' },
    captured: { title: 'Slåede brikker', empty: 'Ingen endnu', advantage: points => `+${points}`, mine: 'Du har slået', theirs: 'Modstanderen har slået' },
    sound: { on: 'Lyd til', off: 'Lyd fra' },
    finished: { checkmate: 'Skakmat!' },
    keyboard: {
      title: 'Tastatur',
      items: [
        { keys: 'Piletaster', text: 'Flyt markøren på brættet' },
        { keys: 'Enter / Mellemrum', text: 'Løft brikken, og sæt den på det valgte felt' },
        { keys: 'Mus', text: 'Klik eller træk en brik til et markeret felt' },
        { keys: 'Esc', text: 'Sæt brikken ned igen, og gå derefter tilbage til lobbyen' },
      ],
    },
  },
  en: {
    tagline: 'Classic chess against a colleague at the living-room table, one move at a time and at your own pace.',
    colors: { white: 'white', black: 'black', random: 'random' },
    sides: { white: 'White', black: 'Black' },
    pieces: { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' },
    pieceName: (side, piece) => `${side} ${piece}`,
    onSquare: (piece, square) => `${piece} on ${square}`,
    emptySquare: square => `${square}, empty square`,
    playsAs: color => `You play ${color}`,
    boardLabel: 'Chessboard',
    yourTurn: 'Your move',
    theirTurn: name => `${name} is thinking`,
    check: 'Check!',
    inCheck: 'Your king is in check.',
    selectHint: 'Pick a piece, or drag it to a highlighted square.',
    targetHint: piece => `${piece} is lifted. Pick a highlighted square.`,
    waitHint: 'Wait for your move. Meanwhile you can chat or call Hubert.',
    moved: (name, move) => `${name} played ${move}`,
    lastMove: 'Last move',
    challenge: {
      description: 'Pick a colleague and your colour. The game starts when your colleague accepts.',
      color: 'Your colour',
      colorHint: 'White moves first. With random, the colours are drawn when the challenge is accepted.',
    },
    promotion: { title: 'Promote the pawn', hint: 'Choose the piece the pawn becomes.' },
    draw: {
      offer: 'Offer a draw',
      offered: 'Draw offered',
      incoming: name => `${name} offers a draw`,
      incomingBody: 'If you accept, the game ends in a draw. If you move instead, the offer is declined.',
      accept: 'Accept draw',
      decline: 'Decline',
      confirmTitle: 'Offer a draw?',
      confirmBody: 'Your opponent can accept or decline. The game goes on meanwhile.',
      confirm: 'Offer draw',
    },
    sheet: { title: 'Score sheet', empty: 'No moves yet. White begins.', white: 'White', black: 'Black' },
    captured: { title: 'Captured pieces', empty: 'None yet', advantage: points => `+${points}`, mine: 'You captured', theirs: 'Your opponent captured' },
    sound: { on: 'Sound on', off: 'Sound off' },
    finished: { checkmate: 'Checkmate!' },
    keyboard: {
      title: 'Keyboard',
      items: [
        { keys: 'Arrow keys', text: 'Move the cursor on the board' },
        { keys: 'Enter / Space', text: 'Lift the piece, then put it on the chosen square' },
        { keys: 'Mouse', text: 'Click or drag a piece to a highlighted square' },
        { keys: 'Esc', text: 'Put the piece down, then go back to the lobby' },
      ],
    },
  },
  sv: {
    tagline: 'Klassiskt schack mot en kollega vid vardagsrumsbordet, ett drag i taget och i din egen takt.',
    colors: { white: 'vit', black: 'svart', random: 'slumpvis' },
    sides: { white: 'Vit', black: 'Svart' },
    pieces: { p: 'bonde', n: 'springare', b: 'löpare', r: 'torn', q: 'dam', k: 'kung' },
    pieceName: (side, piece) => `${piece === 'torn' && side === 'Vit' ? 'Vitt' : side} ${piece}`,
    onSquare: (piece, square) => `${piece} på ${square}`,
    emptySquare: square => `${square}, tom ruta`,
    playsAs: color => `Du spelar ${color}`,
    boardLabel: 'Schackbräde',
    yourTurn: 'Ditt drag',
    theirTurn: name => `${name} funderar`,
    check: 'Schack!',
    inCheck: 'Din kung står i schack.',
    selectHint: 'Välj en pjäs, eller dra den till en markerad ruta.',
    targetHint: piece => `${piece} är upplyft. Välj en markerad ruta.`,
    waitHint: 'Vänta på ditt drag. Under tiden kan du chatta eller kalla på Hubert.',
    moved: (name, move) => `${name} spelade ${move}`,
    lastMove: 'Senaste draget',
    challenge: {
      description: 'Välj en kollega och din färg. Spelet börjar när din kollega tackar ja.',
      color: 'Din färg',
      colorHint: 'Vit drar först. Väljer du slumpvis lottas färgerna när utmaningen antas.',
    },
    promotion: { title: 'Förvandla bonden', hint: 'Välj den pjäs som bonden ska bli.' },
    draw: {
      offer: 'Erbjud remi',
      offered: 'Remi erbjuden',
      incoming: name => `${name} erbjuder remi`,
      incomingBody: 'Tackar du ja slutar partiet oavgjort. Gör du ett drag i stället är erbjudandet avböjt.',
      accept: 'Godta remi',
      decline: 'Avböj',
      confirmTitle: 'Erbjuda remi?',
      confirmBody: 'Din motståndare kan tacka ja eller nej. Partiet fortsätter under tiden.',
      confirm: 'Erbjud remi',
    },
    sheet: { title: 'Protokoll', empty: 'Inga drag ännu. Vit börjar.', white: 'Vit', black: 'Svart' },
    captured: { title: 'Slagna pjäser', empty: 'Inga ännu', advantage: points => `+${points}`, mine: 'Du har slagit', theirs: 'Motståndaren har slagit' },
    sound: { on: 'Ljud på', off: 'Ljud av' },
    finished: { checkmate: 'Schack matt!' },
    keyboard: {
      title: 'Tangentbord',
      items: [
        { keys: 'Piltangenter', text: 'Flytta markören på brädet' },
        { keys: 'Enter / Blanksteg', text: 'Lyft pjäsen och ställ den på den valda rutan' },
        { keys: 'Mus', text: 'Klicka eller dra en pjäs till en markerad ruta' },
        { keys: 'Esc', text: 'Ställ ned pjäsen och gå sedan tillbaka till lobbyn' },
      ],
    },
  },
  fi: {
    tagline: 'Klassista shakkia kollegaa vastaan olohuoneen pöydän ääressä, siirto kerrallaan omaan tahtiin.',
    colors: { white: 'valkoinen', black: 'musta', random: 'satunnainen' },
    sides: { white: 'Valkoinen', black: 'Musta' },
    pieces: { p: 'sotilas', n: 'ratsu', b: 'lähetti', r: 'torni', q: 'kuningatar', k: 'kuningas' },
    pieceName: (side, piece) => `${side} ${piece}`,
    onSquare: (piece, square) => `${piece}, ${square}`,
    emptySquare: square => `${square}, tyhjä ruutu`,
    playsAs: color => `Värisi: ${color}`,
    boardLabel: 'Shakkilauta',
    yourTurn: 'Sinun siirtosi',
    theirTurn: name => `${name} miettii`,
    check: 'Shakki!',
    inCheck: 'Kuninkaasi on shakissa.',
    selectHint: 'Valitse nappula tai vedä se merkittyyn ruutuun.',
    targetHint: piece => `${piece} on nostettu. Valitse merkitty ruutu.`,
    waitHint: 'Odota siirtovuoroasi. Sillä välin voit keskustella tai kutsua Hubertin.',
    moved: (name, move) => `${name} pelasi ${move}`,
    lastMove: 'Viimeisin siirto',
    challenge: {
      description: 'Valitse kollega ja värisi. Peli alkaa, kun kollegasi hyväksyy.',
      color: 'Värisi',
      colorHint: 'Valkoinen siirtää ensin. Satunnainen väri arvotaan, kun haaste hyväksytään.',
    },
    promotion: { title: 'Korota sotilas', hint: 'Valitse nappula, joksi sotilas korotetaan.' },
    draw: {
      offer: 'Tarjoa tasapeliä',
      offered: 'Tasapeliä tarjottu',
      incoming: name => `${name} tarjoaa tasapeliä`,
      incomingBody: 'Jos hyväksyt, peli päättyy tasapeliin. Jos siirrät sen sijaan, tarjous hylätään.',
      accept: 'Hyväksy tasapeli',
      decline: 'Hylkää',
      confirmTitle: 'Tarjotaanko tasapeliä?',
      confirmBody: 'Vastustajasi voi hyväksyä tai hylätä. Peli jatkuu sillä välin.',
      confirm: 'Tarjoa tasapeliä',
    },
    sheet: { title: 'Siirtolista', empty: 'Ei siirtoja vielä. Valkoinen aloittaa.', white: 'Valkoinen', black: 'Musta' },
    captured: { title: 'Lyödyt nappulat', empty: 'Ei vielä', advantage: points => `+${points}`, mine: 'Sinä olet lyönyt', theirs: 'Vastustaja on lyönyt' },
    sound: { on: 'Ääni päällä', off: 'Ääni pois' },
    finished: { checkmate: 'Shakkimatti!' },
    keyboard: {
      title: 'Näppäimistö',
      items: [
        { keys: 'Nuolinäppäimet', text: 'Siirrä kohdistinta laudalla' },
        { keys: 'Enter / Välilyönti', text: 'Nosta nappula ja aseta se valittuun ruutuun' },
        { keys: 'Hiiri', text: 'Napsauta tai vedä nappula merkittyyn ruutuun' },
        { keys: 'Esc', text: 'Laske nappula ja palaa sitten aulaan' },
      ],
    },
  },
}

const LANGUAGE_NAMES: Record<MultiplayerLanguage, string> = { da: 'Dansk', en: 'English', sv: 'Svenska', fi: 'Suomi' }

export const MULTIPLAYER_LABELS: Record<Language, MultiplayerLabels> = {
  da: {
    gameName: 'Word-Puzzle',
    gameNames: { 'word-puzzle': 'Word-Puzzle', chess: 'Skak', backgammon: 'Backgammon' },
    chess: CHESS_LABELS.da,
    backgammon: BACKGAMMON_LABELS.da,
    sectionName: 'Multiplayer',
    sectionTagline: 'Spil mod kollegaer, en tur ad gangen',
    backToGameCorner: 'Tilbage til Spilhjørnet',
    backToLobby: 'Tilbage til lobbyen',
    hub: {
      tagline: 'Find et spil og udfordr en kollega. Spillet venter, når I har travlt.',
      backToMultiplayer: 'Tilbage til Multiplayer',
      openGame: 'Åbn spil',
      wordPuzzle: 'Læg ord på brættet og saml point mod en kollega på dansk, engelsk, svensk eller finsk. Hubert holder jer med selskab.',
      chess: 'Klassisk skak med håndlavede brikker i buksbom og ibenholt. Træk, når det passer dig, mens Hubert ligger og døser.',
      backgammon: 'Slå terningerne og få dine 15 brikker hjem før din kollega. Serveren slår for jer, så ingen kan snyde.',
      moreSoon: 'Flere spil på vej',
      moreSoonBody: 'Bordet er dækket til flere brætspil.',
      yourTurn: count => count === 1 ? 'Din tur i 1 spil' : `Din tur i ${count} spil`,
      invitations: count => count === 1 ? '1 invitation' : `${count} invitationer`,
    },
    loading: 'Henter',
    retry: 'Prøv igen',
    close: 'Luk',
    cancel: 'Fortryd',
    you: 'Dig',
    languageNames: LANGUAGE_NAMES,
    notifications: {
      invite: (name, gameType) => `${name} har udfordret dig til ${gameType === 'chess' ? 'skak' : gameType === 'backgammon' ? 'backgammon' : 'Word-Puzzle'}`,
      accepted: name => `${name} har accepteret din udfordring`,
      declined: name => `${name} har afvist din udfordring`,
      cancelled: name => `${name} har trukket sin udfordring tilbage`,
      turn: name => `Det er din tur mod ${name}`,
      'approve-word': name => `${name} har lagt ord, som du skal godkende`,
      'word-approved': name => `${name} har godkendt dine ord`,
      'word-rejected': name => `${name} har afvist dine ord`,
      reminder: name => `${name} minder dig om din tur`,
      chat: name => `${name} har skrevet til dig`,
      finished: name => `Spillet mod ${name} er slut`,
      'draw-offer': name => `${name} tilbyder remis`,
      'draw-declined': name => `${name} har afvist dit remistilbud`,
    },
    errors: {
      AUTH_REQUIRED: 'Du skal være logget ind for at spille.',
      MULTIPLAYER_INVALID: 'Handlingen kunne ikke gennemføres. Tjek dine valg og prøv igen.',
      MULTIPLAYER_FORBIDDEN: 'Det har du ikke adgang til.',
      MULTIPLAYER_NOT_FOUND: 'Spillet findes ikke længere.',
      MULTIPLAYER_STATE: 'Spillet er ikke i den tilstand, handlingen kræver. Det er hentet igen.',
      MULTIPLAYER_NOT_YOUR_TURN: 'Det er ikke din tur.',
      MULTIPLAYER_CONFLICT: 'Spillet er ændret, siden du åbnede det. Den nyeste stilling er hentet.',
      MULTIPLAYER_INVALID_MOVE: 'Trækket er ikke gyldigt.',
      MULTIPLAYER_LIMIT: 'Du har for mange åbne spil. Afslut eller træk et tilbage først.',
      MULTIPLAYER_TOO_SOON: 'Du har mindet for nylig. Vent lidt, før du minder igen.',
      MULTIPLAYER_HUBERT_LIMIT: 'Hubert har fået alt, du må give ham i dette spil.',
      MULTIPLAYER_OPERATION_CONFLICT: 'Handlingen er allerede brugt. Prøv igen.',
      MULTIPLAYER_INVALID_DATA: 'De delte spildata er ugyldige. Kontakt en administrator.',
      MULTIPLAYER_UNAVAILABLE: 'Multiplayer er ikke tilgængelig lige nu. Tjek forbindelsen og prøv igen.',
      generic: 'Noget gik galt. Prøv igen.',
    },
    moveErrors: {
      EMPTY: 'Læg mindst én brik på brættet.',
      OUT_OF_BOUNDS: 'En brik ligger uden for brættet.',
      INVALID_LETTER: 'Et bogstav passer ikke til spillets sprog.',
      OCCUPIED: 'Feltet er optaget.',
      DUPLICATE_SQUARE: 'To brikker ligger på samme felt.',
      NOT_IN_LINE: 'Brikkerne skal ligge på én række eller i én kolonne.',
      GAP: 'Der må ikke være huller mellem brikkerne.',
      MUST_COVER_CENTER: 'Det første ord skal dække stjernen i midten.',
      FIRST_MOVE_TOO_SHORT: 'Det første ord skal være mindst to bogstaver langt.',
      NOT_CONNECTED: 'Ordet skal røre ved brikker, der allerede ligger på brættet.',
      TILES_NOT_IN_RACK: 'Brikkerne findes ikke længere på dit stativ.',
      BAG_TOO_SMALL: 'Der er for få brikker i posen til at bytte.',
      ILLEGAL_MOVE: 'Det træk er ikke tilladt.',
      PROMOTION_REQUIRED: 'Vælg, hvad bonden skal forvandles til.',
      INVALID_PROMOTION: 'Bonden kan ikke forvandles til den brik.',
      INCOMPLETE_TURN: 'Du skal bruge alle de terninger, du kan.',
    },
    lobby: {
      tagline: 'Læg ord på brættet mod en kollega, ét træk ad gangen og i dit eget tempo.',
      challenge: 'Udfordr en kollega',
      challengeHint: 'Spillet starter, når din kollega accepterer.',
      unavailableTitle: 'Multiplayer er ikke tilgængelig',
      unavailableBody: 'Forbindelsen til det fælles lager mangler. Tjek, at lageret er tilgængeligt, og prøv igen.',
      loadError: 'Spillene kunne ikke hentes.',
      noGames: 'Ingen spil endnu. Udfordr en kollega for at komme i gang.',
      record: 'Din stilling',
      wins: 'Sejre',
      losses: 'Nederlag',
      draws: 'Uafgjort',
      played: 'Spillet',
      sections: { yourTurn: 'Din tur', invitations: 'Invitationer', waiting: 'Venter på modstander', finished: 'Afsluttede' },
      invitationsIn: 'Til dig',
      invitationsOut: 'Sendt af dig',
      showMore: 'Vis flere',
      showLess: 'Vis færre',
      open: 'Åbn',
      accept: 'Acceptér',
      decline: 'Afvis',
      withdraw: 'Træk tilbage',
      remind: 'Mind om tur',
      remindedRecently: 'Du har mindet for nylig',
      updated: when => `Opdateret ${when}`,
      news: 'Nyt',
      markRead: 'Markér som læst',
      leaderboard: { title: 'Rangliste', hint: 'Spillere fra alle teams', legend: 'Sejre, nederlag, uafgjort', empty: 'Ingen afsluttede spil endnu.' },
      topWords: { title: 'Top 10 ord', hint: 'De bedste lagte ord', empty: 'Ingen ord lagt endnu.', points: score => `${score} point` },
      rivals: {
        title: 'Dine opgør', hint: 'Stillingen mod hver kollega', empty: 'Når du har spillet et spil færdigt, kan du følge stillingen her.',
        ahead: 'Du fører', behind: 'Du er bagud', level: 'Lige',
        record: (wins, losses, draws) => `${wins} ${wins === 1 ? 'sejr' : 'sejre'}, ${losses} ${losses === 1 ? 'nederlag' : 'nederlag'}${draws ? `, ${draws} uafgjort` : ''}`,
        last: when => `Sidst ${when}`, rematch: 'Udfordr igen',
      },
      status: { invited: 'Inviteret', active: 'I gang', 'awaiting-approval': 'Ordtjek', finished: 'Afsluttet', declined: 'Afvist', cancelled: 'Trukket tilbage' },
      badge: { yourTurn: 'Din tur', waiting: 'Venter', approve: 'Godkend ord', waitingApproval: 'Afventer godkendelse' },
      outcome: { won: 'Du vandt', lost: 'Du tabte', draw: 'Uafgjort' },
      reason: {
        'out-of-tiles': 'Brikkerne er brugt', scoreless: 'Ingen point i flere træk', resigned: 'Opgivet',
        checkmate: 'Skakmat', stalemate: 'Pat', threefold: 'Trefoldig stillingsgentagelse', 'fifty-move': '50-træksreglen',
        insufficient: 'Utilstrækkeligt materiale', 'draw-agreed': 'Remis aftalt', 'bore-off': 'Alle brikker ude',
      },
      score: (mine, theirs) => `${mine} mod ${theirs}`,
    },
    challenge: {
      title: 'Udfordr en kollega',
      description: 'Vælg en kollega og et sprog. Spillet starter, når din kollega accepterer.',
      search: 'Søg efter kollega',
      searchPlaceholder: 'Navn eller team',
      noPeople: 'Ingen kollegaer matcher søgningen.',
      language: 'Sprog',
      languageHint: 'Brikkerne og ordlisten følger sproget.',
      send: 'Send udfordring',
      sending: 'Sender',
      pickPerson: 'Vælg en kollega først',
    },
    toast: {
      challengeSent: name => `Udfordring sendt til ${name}`,
      accepted: 'Udfordring accepteret',
      declined: 'Udfordring afvist',
      withdrawn: 'Udfordring trukket tilbage',
      reminded: name => `${name} er mindet om sin tur`,
      rematchSent: name => `Revanche sendt til ${name}`,
    },
    match: {
      boardLabel: 'Spilbræt',
      rackLabel: 'Dine brikker',
      square: (row, col) => `Række ${row}, kolonne ${col}`,
      premium: { TW: 'Tredobbelt ord', DW: 'Dobbelt ord', TL: 'Tredobbelt bogstav', DL: 'Dobbelt bogstav' },
      centre: 'Midterfeltet',
      blankTile: 'Blank brik',
      tileLabel: (letter, points) => `${letter}, ${points} point`,
      yourTurn: 'Din tur',
      theirTurn: name => `${name} er ved at lægge`,
      waitHint: 'Vent på din tur. Du kan imens blande dit stativ og skrive i chatten.',
      placeHint: 'Vælg et felt på brættet for at lægge brikken.',
      shuffle: 'Bland',
      recall: 'Tag tilbage',
      play: 'Læg ord',
      playing: 'Lægger',
      pass: 'Pas',
      exchange: 'Byt brikker',
      resign: 'Giv op',
      exchangeTitle: 'Byt brikker',
      exchangeHint: 'Vælg de brikker, du vil bytte. Du springer din tur over.',
      exchangeConfirm: count => `Byt ${count} ${count === 1 ? 'brik' : 'brikker'}`,
      exchangeNeedsBag: 'Du kan kun bytte, når der er mindst 7 brikker i posen.',
      confirmPass: { title: 'Pas denne tur?', body: 'Du lægger ingen ord, og turen går til din modstander.', confirm: 'Pas' },
      confirmResign: { title: 'Giv op?', body: 'Din modstander vinder spillet. Det kan ikke fortrydes.', confirm: 'Giv op' },
      keepPlaying: 'Fortsæt spillet',
      blank: { title: 'Vælg bogstav til den blanke brik', hint: 'En blank brik giver 0 point, uanset hvilket bogstav den står for.' },
      preview: {
        title: 'Dit træk',
        hint: 'Læg brikker på brættet for at se ord og point.',
        checking: 'Tæller point',
        total: 'I alt',
        bingo: 'Bingo: alle 7 brikker brugt',
        unknownWord: 'Ikke i ordlisten',
        unknownHint: 'Din modstander skal godkende ordet, før trækket tæller.',
        failed: 'Point kunne ikke beregnes lige nu.',
      },
      approval: {
        approverTitle: name => `${name} har lagt ord, der ikke er i ordlisten`,
        approverBody: name => `Godkend, hvis ordene er rigtige. Afviser du dem, får ${name} sine brikker tilbage og må prøve igen.`,
        approve: 'Godkend ord',
        reject: 'Afvis ord',
        moverTitle: name => `Venter på at ${name} godkender dine ord`,
        moverBody: 'Ordene er ikke i ordlisten, så din modstander afgør, om de tæller.',
        score: points => `${points} point`,
      },
      players: 'Spillere',
      points: 'point',
      bag: 'Brikker i posen',
      theirTiles: count => `${count} brikker på stativet`,
      onTurn: 'Har turen',
      history: {
        title: 'Trækhistorik',
        empty: 'Ingen træk endnu.',
        play: (name, words) => `${name} lagde ${words}`,
        pass: name => `${name} passede`,
        exchange: (name, count) => `${name} byttede ${count} ${count === 1 ? 'brik' : 'brikker'}`,
        resign: name => `${name} gav op`,
      },
      chat: { title: 'Chat', placeholder: name => `Skriv til ${name}`, send: 'Send', empty: 'Ingen beskeder endnu. Sig hej!' },
      hubert: {
        woofs: ['Vuf!', 'Vuf vuf!', 'Er det min tur?', 'Har du en godbid?'],
        call: 'Kald på Hubert',
        callHint: 'Hubert kommer hen til din side af bordet',
        treat: left => `Giv en godbid (${left} tilbage)`,
        bone: left => `Giv et kødben (${left} tilbage)`,
        treatsGone: 'Ikke flere godbidder i dette spil',
        bonesGone: 'Ikke flere kødben i dette spil',
        fed: (kind, name) => `${name ?? 'Du'} gav Hubert ${kind === 'treat' ? 'en godbid' : 'et kødben'}`,
      },
      react: {
        button: 'Emoji',
        hint: 'Send din modstander en emoji',
        tray: 'Vælg en emoji',
        names: ['Klapsalver', 'Ild', 'Grin', 'Overrasket', 'Fest', 'Pyha', 'Tænker', 'Hund'],
        received: (name, emojiName) => `${name} sendte en emoji: ${emojiName}`,
        tooSoon: 'Vent et øjeblik, før du sender en ny emoji.',
      },
      finished: { won: 'Du vandt!', lost: name => `${name} vandt`, draw: 'Uafgjort', final: 'Slutstilling', rematch: 'Revanche' },
      keyboard: {
        title: 'Tastatur',
        items: [
          { keys: 'Piletaster', text: 'Flyt markøren på brættet' },
          { keys: 'Bogstav', text: 'Læg brik fra stativet; en blank bruges, hvis du ikke har bogstavet' },
          { keys: 'Mellemrum', text: 'Skift mellem vandret og lodret' },
          { keys: 'Backspace', text: 'Tag den sidste brik tilbage' },
          { keys: 'Enter', text: 'Læg ordet, når det er gyldigt' },
          { keys: 'Esc', text: 'Fravælg, og gå derefter tilbage til lobbyen' },
        ],
      },
      direction: { across: 'Vandret', down: 'Lodret' },
      loadError: 'Spillet kunne ikke hentes.',
      reloaded: 'Spillet er opdateret.',
    },
  },
  en: {
    gameName: 'Word-Puzzle',
    gameNames: { 'word-puzzle': 'Word-Puzzle', chess: 'Chess', backgammon: 'Backgammon' },
    chess: CHESS_LABELS.en,
    backgammon: BACKGAMMON_LABELS.en,
    sectionName: 'Multiplayer',
    sectionTagline: 'Play colleagues, one turn at a time',
    backToGameCorner: 'Back to Game Corner',
    backToLobby: 'Back to lobby',
    hub: {
      tagline: 'Pick a game and challenge a colleague. The game waits while you are busy.',
      backToMultiplayer: 'Back to Multiplayer',
      openGame: 'Open game',
      wordPuzzle: 'Lay words on the board and score points against a colleague in Danish, English, Swedish or Finnish. Hubert keeps you company.',
      chess: 'Classic chess with hand-turned boxwood and ebony pieces. Move when it suits you while Hubert dozes by the table.',
      backgammon: 'Roll the dice and bring your 15 checkers home before your colleague does. The server rolls for you both, so nobody can cheat.',
      moreSoon: 'More games on the way',
      moreSoonBody: 'The table is set for more board games.',
      yourTurn: count => count === 1 ? 'Your turn in 1 game' : `Your turn in ${count} games`,
      invitations: count => count === 1 ? '1 invitation' : `${count} invitations`,
    },
    loading: 'Loading',
    retry: 'Try again',
    close: 'Close',
    cancel: 'Cancel',
    you: 'You',
    languageNames: LANGUAGE_NAMES,
    notifications: {
      invite: (name, gameType) => `${name} challenged you to ${gameType === 'chess' ? 'chess' : gameType === 'backgammon' ? 'backgammon' : 'Word-Puzzle'}`,
      accepted: name => `${name} accepted your challenge`,
      declined: name => `${name} declined your challenge`,
      cancelled: name => `${name} withdrew their challenge`,
      turn: name => `It's your turn against ${name}`,
      'approve-word': name => `${name} played words you need to approve`,
      'word-approved': name => `${name} approved your words`,
      'word-rejected': name => `${name} rejected your words`,
      reminder: name => `${name} reminded you about your turn`,
      chat: name => `${name} sent you a message`,
      finished: name => `Your game against ${name} is over`,
      'draw-offer': name => `${name} offers you a draw`,
      'draw-declined': name => `${name} declined your draw offer`,
    },
    errors: {
      AUTH_REQUIRED: 'You need to be signed in to play.',
      MULTIPLAYER_INVALID: 'That could not be done. Check your choices and try again.',
      MULTIPLAYER_FORBIDDEN: 'You do not have access to that.',
      MULTIPLAYER_NOT_FOUND: 'This game no longer exists.',
      MULTIPLAYER_STATE: 'The game is not in the state this needs. It has been reloaded.',
      MULTIPLAYER_NOT_YOUR_TURN: 'It is not your turn.',
      MULTIPLAYER_CONFLICT: 'The game changed since you opened it. The latest position has been loaded.',
      MULTIPLAYER_INVALID_MOVE: 'That move is not valid.',
      MULTIPLAYER_LIMIT: 'You have too many open games. Finish or withdraw one first.',
      MULTIPLAYER_TOO_SOON: 'You sent a reminder recently. Wait a while before sending another.',
      MULTIPLAYER_HUBERT_LIMIT: 'Hubert has had everything you can give him in this game.',
      MULTIPLAYER_OPERATION_CONFLICT: 'That action was already used. Try again.',
      MULTIPLAYER_INVALID_DATA: 'The shared game data is invalid. Contact an administrator.',
      MULTIPLAYER_UNAVAILABLE: 'Multiplayer is not available right now. Check the connection and try again.',
      generic: 'Something went wrong. Try again.',
    },
    moveErrors: {
      EMPTY: 'Place at least one tile on the board.',
      OUT_OF_BOUNDS: 'A tile is outside the board.',
      INVALID_LETTER: 'A letter does not belong to the game language.',
      OCCUPIED: 'That square is taken.',
      DUPLICATE_SQUARE: 'Two tiles are on the same square.',
      NOT_IN_LINE: 'Tiles must be in one row or one column.',
      GAP: 'There can be no gaps between the tiles.',
      MUST_COVER_CENTER: 'The first word must cover the centre star.',
      FIRST_MOVE_TOO_SHORT: 'The first word must be at least two letters long.',
      NOT_CONNECTED: 'The word must touch tiles already on the board.',
      TILES_NOT_IN_RACK: 'Those tiles are no longer on your rack.',
      BAG_TOO_SMALL: 'There are too few tiles in the bag to exchange.',
      ILLEGAL_MOVE: 'That move is not allowed.',
      PROMOTION_REQUIRED: 'Choose what the pawn becomes.',
      INVALID_PROMOTION: 'The pawn cannot become that piece.',
      INCOMPLETE_TURN: 'You must use every die you can.',
    },
    lobby: {
      tagline: 'Lay words on the board against a colleague, one move at a time and at your own pace.',
      challenge: 'Challenge a colleague',
      challengeHint: 'The game starts when your colleague accepts.',
      unavailableTitle: 'Multiplayer is not available',
      unavailableBody: 'The connection to the shared storage is missing. Check that the storage is reachable and try again.',
      loadError: 'The games could not be loaded.',
      noGames: 'No games yet. Challenge a colleague to get started.',
      record: 'Your record',
      wins: 'Wins',
      losses: 'Losses',
      draws: 'Draws',
      played: 'Played',
      sections: { yourTurn: 'Your turn', invitations: 'Invitations', waiting: 'Waiting for opponent', finished: 'Finished' },
      invitationsIn: 'For you',
      invitationsOut: 'Sent by you',
      showMore: 'Show more',
      showLess: 'Show less',
      open: 'Open',
      accept: 'Accept',
      decline: 'Decline',
      withdraw: 'Withdraw',
      remind: 'Remind',
      remindedRecently: 'You reminded them recently',
      updated: when => `Updated ${when}`,
      news: 'News',
      markRead: 'Mark as read',
      leaderboard: { title: 'Leaderboard', hint: 'Players from every team', legend: 'Wins, losses, draws', empty: 'No finished games yet.' },
      topWords: { title: 'Top 10 words', hint: 'The best words played', empty: 'No words played yet.', points: score => `${score} points` },
      rivals: {
        title: 'Your head-to-heads', hint: 'Your score against each colleague', empty: 'Once you finish a game, you can follow the score here.',
        ahead: 'You lead', behind: 'You trail', level: 'Level',
        record: (wins, losses, draws) => `${wins} ${wins === 1 ? 'win' : 'wins'}, ${losses} ${losses === 1 ? 'loss' : 'losses'}${draws ? `, ${draws} ${draws === 1 ? 'draw' : 'draws'}` : ''}`,
        last: when => `Last ${when}`, rematch: 'Rematch',
      },
      status: { invited: 'Invited', active: 'In progress', 'awaiting-approval': 'Word check', finished: 'Finished', declined: 'Declined', cancelled: 'Withdrawn' },
      badge: { yourTurn: 'Your turn', waiting: 'Waiting', approve: 'Approve words', waitingApproval: 'Awaiting approval' },
      outcome: { won: 'You won', lost: 'You lost', draw: 'Draw' },
      reason: {
        'out-of-tiles': 'Tiles ran out', scoreless: 'No points for several moves', resigned: 'Resigned',
        checkmate: 'Checkmate', stalemate: 'Stalemate', threefold: 'Threefold repetition', 'fifty-move': 'Fifty-move rule',
        insufficient: 'Insufficient material', 'draw-agreed': 'Draw agreed', 'bore-off': 'All checkers borne off',
      },
      score: (mine, theirs) => `${mine} to ${theirs}`,
    },
    challenge: {
      title: 'Challenge a colleague',
      description: 'Pick a colleague and a language. The game starts when your colleague accepts.',
      search: 'Search for a colleague',
      searchPlaceholder: 'Name or team',
      noPeople: 'No colleagues match your search.',
      language: 'Language',
      languageHint: 'The tiles and word list follow the language.',
      send: 'Send challenge',
      sending: 'Sending',
      pickPerson: 'Pick a colleague first',
    },
    toast: {
      challengeSent: name => `Challenge sent to ${name}`,
      accepted: 'Challenge accepted',
      declined: 'Challenge declined',
      withdrawn: 'Challenge withdrawn',
      reminded: name => `${name} has been reminded about their turn`,
      rematchSent: name => `Rematch sent to ${name}`,
    },
    match: {
      boardLabel: 'Game board',
      rackLabel: 'Your tiles',
      square: (row, col) => `Row ${row}, column ${col}`,
      premium: { TW: 'Triple word', DW: 'Double word', TL: 'Triple letter', DL: 'Double letter' },
      centre: 'Centre square',
      blankTile: 'Blank tile',
      tileLabel: (letter, points) => `${letter}, ${points} ${points === 1 ? 'point' : 'points'}`,
      yourTurn: 'Your turn',
      theirTurn: name => `${name} is playing`,
      waitHint: 'Wait for your turn. Meanwhile you can shuffle your rack and chat.',
      placeHint: 'Pick a square on the board to place the tile.',
      shuffle: 'Shuffle',
      recall: 'Take back',
      play: 'Play word',
      playing: 'Playing',
      pass: 'Pass',
      exchange: 'Swap tiles',
      resign: 'Resign',
      exchangeTitle: 'Swap tiles',
      exchangeHint: 'Pick the tiles you want to swap. You skip your turn.',
      exchangeConfirm: count => `Swap ${count} ${count === 1 ? 'tile' : 'tiles'}`,
      exchangeNeedsBag: 'You can only swap when the bag holds at least 7 tiles.',
      confirmPass: { title: 'Pass this turn?', body: 'You play no word and the turn goes to your opponent.', confirm: 'Pass' },
      confirmResign: { title: 'Resign?', body: 'Your opponent wins the game. This cannot be undone.', confirm: 'Resign' },
      keepPlaying: 'Keep playing',
      blank: { title: 'Choose a letter for the blank tile', hint: 'A blank tile is worth 0 points whichever letter it stands for.' },
      preview: {
        title: 'Your move',
        hint: 'Place tiles on the board to see words and points.',
        checking: 'Counting points',
        total: 'Total',
        bingo: 'Bingo: all 7 tiles used',
        unknownWord: 'Not in the word list',
        unknownHint: 'Your opponent must approve the word before the move counts.',
        failed: 'The score could not be calculated right now.',
      },
      approval: {
        approverTitle: name => `${name} played words that are not in the word list`,
        approverBody: name => `Approve them if the words are real. If you reject them, ${name} gets the tiles back and tries again.`,
        approve: 'Approve words',
        reject: 'Reject words',
        moverTitle: name => `Waiting for ${name} to approve your words`,
        moverBody: 'The words are not in the word list, so your opponent decides whether they count.',
        score: points => `${points} ${points === 1 ? 'point' : 'points'}`,
      },
      players: 'Players',
      points: 'points',
      bag: 'Tiles in the bag',
      theirTiles: count => `${count} ${count === 1 ? 'tile' : 'tiles'} on the rack`,
      onTurn: 'To play',
      history: {
        title: 'Move history',
        empty: 'No moves yet.',
        play: (name, words) => `${name} played ${words}`,
        pass: name => `${name} passed`,
        exchange: (name, count) => `${name} swapped ${count} ${count === 1 ? 'tile' : 'tiles'}`,
        resign: name => `${name} resigned`,
      },
      chat: { title: 'Chat', placeholder: name => `Write to ${name}`, send: 'Send', empty: 'No messages yet. Say hello!' },
      hubert: {
        woofs: ['Woof!', 'Woof woof!', 'Is it my turn?', 'Got a treat?'],
        call: 'Call Hubert',
        callHint: 'Hubert comes to your side of the table',
        treat: left => `Give a treat (${left} left)`,
        bone: left => `Give a meat bone (${left} left)`,
        treatsGone: 'No treats left in this game',
        bonesGone: 'No meat bones left in this game',
        fed: (kind, name) => `${name ?? 'You'} gave Hubert ${kind === 'treat' ? 'a treat' : 'a meat bone'}`,
      },
      react: {
        button: 'Emoji',
        hint: 'Send your opponent an emoji',
        tray: 'Choose an emoji',
        names: ['Applause', 'Fire', 'Laughing', 'Surprised', 'Celebration', 'Phew', 'Thinking', 'Dog'],
        received: (name, emojiName) => `${name} sent an emoji: ${emojiName}`,
        tooSoon: 'Wait a moment before you send another emoji.',
      },
      finished: { won: 'You won!', lost: name => `${name} won`, draw: 'A draw', final: 'Final score', rematch: 'Rematch' },
      keyboard: {
        title: 'Keyboard',
        items: [
          { keys: 'Arrow keys', text: 'Move the cursor on the board' },
          { keys: 'Letter', text: 'Place a tile from your rack; a blank is used if you lack the letter' },
          { keys: 'Space', text: 'Switch between across and down' },
          { keys: 'Backspace', text: 'Take the last tile back' },
          { keys: 'Enter', text: 'Play the word when it is valid' },
          { keys: 'Esc', text: 'Deselect, then go back to the lobby' },
        ],
      },
      direction: { across: 'Across', down: 'Down' },
      loadError: 'The game could not be loaded.',
      reloaded: 'The game was updated.',
    },
  },
  sv: {
    gameName: 'Word-Puzzle',
    gameNames: { 'word-puzzle': 'Word-Puzzle', chess: 'Schack', backgammon: 'Backgammon' },
    chess: CHESS_LABELS.sv,
    backgammon: BACKGAMMON_LABELS.sv,
    sectionName: 'Multiplayer',
    sectionTagline: 'Spela mot kollegor, ett drag i taget',
    backToGameCorner: 'Tillbaka till Spelhörnan',
    backToLobby: 'Tillbaka till lobbyn',
    hub: {
      tagline: 'Välj ett spel och utmana en kollega. Spelet väntar när ni har mycket att göra.',
      backToMultiplayer: 'Tillbaka till Multiplayer',
      openGame: 'Öppna spel',
      wordPuzzle: 'Lägg ord på brädet och samla poäng mot en kollega på danska, engelska, svenska eller finska. Hubert håller er sällskap.',
      chess: 'Klassiskt schack med handsvarvade pjäser i buxbom och ebenholts. Gör ditt drag när det passar dig medan Hubert slumrar vid bordet.',
      backgammon: 'Slå tärningarna och få hem dina 15 brickor före din kollega. Servern slår åt er båda, så ingen kan fuska.',
      moreSoon: 'Fler spel på väg',
      moreSoonBody: 'Bordet är dukat för fler brädspel.',
      yourTurn: count => count === 1 ? 'Din tur i 1 spel' : `Din tur i ${count} spel`,
      invitations: count => count === 1 ? '1 inbjudan' : `${count} inbjudningar`,
    },
    loading: 'Hämtar',
    retry: 'Försök igen',
    close: 'Stäng',
    cancel: 'Ångra',
    you: 'Du',
    languageNames: LANGUAGE_NAMES,
    notifications: {
      invite: (name, gameType) => `${name} har utmanat dig i ${gameType === 'chess' ? 'schack' : gameType === 'backgammon' ? 'backgammon' : 'Word-Puzzle'}`,
      accepted: name => `${name} har tackat ja till din utmaning`,
      declined: name => `${name} har tackat nej till din utmaning`,
      cancelled: name => `${name} har dragit tillbaka sin utmaning`,
      turn: name => `Det är din tur mot ${name}`,
      'approve-word': name => `${name} har lagt ord som du ska godkänna`,
      'word-approved': name => `${name} har godkänt dina ord`,
      'word-rejected': name => `${name} har underkänt dina ord`,
      reminder: name => `${name} påminner dig om din tur`,
      chat: name => `${name} har skrivit till dig`,
      finished: name => `Spelet mot ${name} är slut`,
      'draw-offer': name => `${name} erbjuder remi`,
      'draw-declined': name => `${name} har tackat nej till ditt remierbjudande`,
    },
    errors: {
      AUTH_REQUIRED: 'Du måste vara inloggad för att spela.',
      MULTIPLAYER_INVALID: 'Det gick inte att genomföra. Kontrollera dina val och försök igen.',
      MULTIPLAYER_FORBIDDEN: 'Du har inte behörighet till det.',
      MULTIPLAYER_NOT_FOUND: 'Spelet finns inte längre.',
      MULTIPLAYER_STATE: 'Spelet är inte i det läge som krävs. Det har hämtats på nytt.',
      MULTIPLAYER_NOT_YOUR_TURN: 'Det är inte din tur.',
      MULTIPLAYER_CONFLICT: 'Spelet har ändrats sedan du öppnade det. Den senaste ställningen har hämtats.',
      MULTIPLAYER_INVALID_MOVE: 'Draget är inte giltigt.',
      MULTIPLAYER_LIMIT: 'Du har för många öppna spel. Avsluta eller dra tillbaka ett först.',
      MULTIPLAYER_TOO_SOON: 'Du har påmint nyligen. Vänta en stund innan du påminner igen.',
      MULTIPLAYER_HUBERT_LIMIT: 'Hubert har fått allt du får ge honom i det här spelet.',
      MULTIPLAYER_OPERATION_CONFLICT: 'Åtgärden har redan använts. Försök igen.',
      MULTIPLAYER_INVALID_DATA: 'Den delade speldatan är ogiltig. Kontakta en administratör.',
      MULTIPLAYER_UNAVAILABLE: 'Multiplayer är inte tillgängligt just nu. Kontrollera anslutningen och försök igen.',
      generic: 'Något gick fel. Försök igen.',
    },
    moveErrors: {
      EMPTY: 'Lägg minst en bricka på brädet.',
      OUT_OF_BOUNDS: 'En bricka ligger utanför brädet.',
      INVALID_LETTER: 'En bokstav hör inte till spelets språk.',
      OCCUPIED: 'Rutan är upptagen.',
      DUPLICATE_SQUARE: 'Två brickor ligger på samma ruta.',
      NOT_IN_LINE: 'Brickorna måste ligga på en rad eller i en kolumn.',
      GAP: 'Det får inte finnas luckor mellan brickorna.',
      MUST_COVER_CENTER: 'Det första ordet måste täcka stjärnan i mitten.',
      FIRST_MOVE_TOO_SHORT: 'Det första ordet måste vara minst två bokstäver långt.',
      NOT_CONNECTED: 'Ordet måste röra vid brickor som redan ligger på brädet.',
      TILES_NOT_IN_RACK: 'Brickorna finns inte längre på ditt ställ.',
      BAG_TOO_SMALL: 'Det finns för få brickor i påsen för att byta.',
      ILLEGAL_MOVE: 'Det draget är inte tillåtet.',
      PROMOTION_REQUIRED: 'Välj vad bonden ska bli.',
      INVALID_PROMOTION: 'Bonden kan inte bli den pjäsen.',
      INCOMPLETE_TURN: 'Du måste använda alla tärningar du kan.',
    },
    lobby: {
      tagline: 'Lägg ord på brädet mot en kollega, ett drag i taget och i din egen takt.',
      challenge: 'Utmana en kollega',
      challengeHint: 'Spelet startar när din kollega tackar ja.',
      unavailableTitle: 'Multiplayer är inte tillgängligt',
      unavailableBody: 'Anslutningen till den delade lagringen saknas. Kontrollera att lagringen är nåbar och försök igen.',
      loadError: 'Spelen kunde inte hämtas.',
      noGames: 'Inga spel ännu. Utmana en kollega för att komma igång.',
      record: 'Din ställning',
      wins: 'Segrar',
      losses: 'Förluster',
      draws: 'Oavgjort',
      played: 'Spelade',
      sections: { yourTurn: 'Din tur', invitations: 'Inbjudningar', waiting: 'Väntar på motståndaren', finished: 'Avslutade' },
      invitationsIn: 'Till dig',
      invitationsOut: 'Skickade av dig',
      showMore: 'Visa fler',
      showLess: 'Visa färre',
      open: 'Öppna',
      accept: 'Acceptera',
      decline: 'Avböj',
      withdraw: 'Dra tillbaka',
      remind: 'Påminn',
      remindedRecently: 'Du har påmint nyligen',
      updated: when => `Uppdaterad ${when}`,
      news: 'Nytt',
      markRead: 'Markera som läst',
      leaderboard: { title: 'Ranking', hint: 'Spelare från alla team', legend: 'Segrar, förluster, oavgjort', empty: 'Inga avslutade spel ännu.' },
      topWords: { title: 'Topp 10 ord', hint: 'De bästa lagda orden', empty: 'Inga ord lagda ännu.', points: score => `${score} poäng` },
      rivals: {
        title: 'Dina möten', hint: 'Ställningen mot varje kollega', empty: 'När du har spelat klart ett spel kan du följa ställningen här.',
        ahead: 'Du leder', behind: 'Du ligger under', level: 'Lika',
        record: (wins, losses, draws) => `${wins} ${wins === 1 ? 'seger' : 'segrar'}, ${losses} ${losses === 1 ? 'förlust' : 'förluster'}${draws ? `, ${draws} oavgjort` : ''}`,
        last: when => `Senast ${when}`, rematch: 'Utmana igen',
      },
      status: { invited: 'Inbjuden', active: 'Pågår', 'awaiting-approval': 'Ordkontroll', finished: 'Avslutat', declined: 'Avböjt', cancelled: 'Tillbakadraget' },
      badge: { yourTurn: 'Din tur', waiting: 'Väntar', approve: 'Godkänn ord', waitingApproval: 'Väntar på godkännande' },
      outcome: { won: 'Du vann', lost: 'Du förlorade', draw: 'Oavgjort' },
      reason: {
        'out-of-tiles': 'Brickorna tog slut', scoreless: 'Inga poäng på flera drag', resigned: 'Gav upp',
        checkmate: 'Schackmatt', stalemate: 'Patt', threefold: 'Trefaldig upprepning', 'fifty-move': 'Femtiodragsregeln',
        insufficient: 'Otillräckligt material', 'draw-agreed': 'Remi överenskommen', 'bore-off': 'Alla brickor ute',
      },
      score: (mine, theirs) => `${mine} mot ${theirs}`,
    },
    challenge: {
      title: 'Utmana en kollega',
      description: 'Välj en kollega och ett språk. Spelet startar när din kollega tackar ja.',
      search: 'Sök efter kollega',
      searchPlaceholder: 'Namn eller team',
      noPeople: 'Inga kollegor matchar sökningen.',
      language: 'Språk',
      languageHint: 'Brickorna och ordlistan följer språket.',
      send: 'Skicka utmaning',
      sending: 'Skickar',
      pickPerson: 'Välj en kollega först',
    },
    toast: {
      challengeSent: name => `Utmaning skickad till ${name}`,
      accepted: 'Utmaning accepterad',
      declined: 'Utmaning avböjd',
      withdrawn: 'Utmaning tillbakadragen',
      reminded: name => `${name} har påmints om sin tur`,
      rematchSent: name => `Revansch skickad till ${name}`,
    },
    match: {
      boardLabel: 'Spelbräde',
      rackLabel: 'Dina brickor',
      square: (row, col) => `Rad ${row}, kolumn ${col}`,
      premium: { TW: 'Trippelt ord', DW: 'Dubbelt ord', TL: 'Trippel bokstav', DL: 'Dubbel bokstav' },
      centre: 'Mittenrutan',
      blankTile: 'Blank bricka',
      tileLabel: (letter, points) => `${letter}, ${points} poäng`,
      yourTurn: 'Din tur',
      theirTurn: name => `${name} lägger`,
      waitHint: 'Vänta på din tur. Under tiden kan du blanda ditt ställ och chatta.',
      placeHint: 'Välj en ruta på brädet för att lägga brickan.',
      shuffle: 'Blanda',
      recall: 'Ta tillbaka',
      play: 'Lägg ord',
      playing: 'Lägger',
      pass: 'Passa',
      exchange: 'Byt brickor',
      resign: 'Ge upp',
      exchangeTitle: 'Byt brickor',
      exchangeHint: 'Välj de brickor du vill byta. Du hoppar över din tur.',
      exchangeConfirm: count => `Byt ${count} ${count === 1 ? 'bricka' : 'brickor'}`,
      exchangeNeedsBag: 'Du kan bara byta när det finns minst 7 brickor i påsen.',
      confirmPass: { title: 'Passa den här turen?', body: 'Du lägger inget ord och turen går till din motståndare.', confirm: 'Passa' },
      confirmResign: { title: 'Ge upp?', body: 'Din motståndare vinner spelet. Det går inte att ångra.', confirm: 'Ge upp' },
      keepPlaying: 'Fortsätt spela',
      blank: { title: 'Välj bokstav för den blanka brickan', hint: 'En blank bricka ger 0 poäng oavsett vilken bokstav den står för.' },
      preview: {
        title: 'Ditt drag',
        hint: 'Lägg brickor på brädet för att se ord och poäng.',
        checking: 'Räknar poäng',
        total: 'Totalt',
        bingo: 'Bingo: alla 7 brickor använda',
        unknownWord: 'Finns inte i ordlistan',
        unknownHint: 'Din motståndare måste godkänna ordet innan draget räknas.',
        failed: 'Poängen kunde inte beräknas just nu.',
      },
      approval: {
        approverTitle: name => `${name} har lagt ord som inte finns i ordlistan`,
        approverBody: name => `Godkänn dem om orden är riktiga. Om du underkänner dem får ${name} tillbaka sina brickor och får försöka igen.`,
        approve: 'Godkänn ord',
        reject: 'Underkänn ord',
        moverTitle: name => `Väntar på att ${name} ska godkänna dina ord`,
        moverBody: 'Orden finns inte i ordlistan, så din motståndare avgör om de räknas.',
        score: points => `${points} poäng`,
      },
      players: 'Spelare',
      points: 'poäng',
      bag: 'Brickor i påsen',
      theirTiles: count => `${count} ${count === 1 ? 'bricka' : 'brickor'} på stället`,
      onTurn: 'Har turen',
      history: {
        title: 'Draghistorik',
        empty: 'Inga drag ännu.',
        play: (name, words) => `${name} la ${words}`,
        pass: name => `${name} passade`,
        exchange: (name, count) => `${name} bytte ${count} ${count === 1 ? 'bricka' : 'brickor'}`,
        resign: name => `${name} gav upp`,
      },
      chat: { title: 'Chatt', placeholder: name => `Skriv till ${name}`, send: 'Skicka', empty: 'Inga meddelanden ännu. Säg hej!' },
      hubert: {
        woofs: ['Voff!', 'Voff voff!', 'Är det min tur?', 'Har du en godbit?'],
        call: 'Ropa på Hubert',
        callHint: 'Hubert kommer till din sida av bordet',
        treat: left => `Ge en godbit (${left} kvar)`,
        bone: left => `Ge ett köttben (${left} kvar)`,
        treatsGone: 'Inga godbitar kvar i det här spelet',
        bonesGone: 'Inga köttben kvar i det här spelet',
        fed: (kind, name) => `${name ?? 'Du'} gav Hubert ${kind === 'treat' ? 'en godbit' : 'ett köttben'}`,
      },
      react: {
        button: 'Emoji',
        hint: 'Skicka en emoji till din motståndare',
        tray: 'Välj en emoji',
        names: ['Applåder', 'Eld', 'Skratt', 'Förvånad', 'Fest', 'Puh', 'Funderar', 'Hund'],
        received: (name, emojiName) => `${name} skickade en emoji: ${emojiName}`,
        tooSoon: 'Vänta en stund innan du skickar en ny emoji.',
      },
      finished: { won: 'Du vann!', lost: name => `${name} vann`, draw: 'Oavgjort', final: 'Slutställning', rematch: 'Revansch' },
      keyboard: {
        title: 'Tangentbord',
        items: [
          { keys: 'Piltangenter', text: 'Flytta markören på brädet' },
          { keys: 'Bokstav', text: 'Lägg en bricka från ditt ställ; en blank används om du saknar bokstaven' },
          { keys: 'Mellanslag', text: 'Växla mellan vågrätt och lodrätt' },
          { keys: 'Backspace', text: 'Ta tillbaka den sista brickan' },
          { keys: 'Enter', text: 'Lägg ordet när det är giltigt' },
          { keys: 'Esc', text: 'Avmarkera och gå sedan tillbaka till lobbyn' },
        ],
      },
      direction: { across: 'Vågrätt', down: 'Lodrätt' },
      loadError: 'Spelet kunde inte hämtas.',
      reloaded: 'Spelet har uppdaterats.',
    },
  },
  fi: {
    gameName: 'Word-Puzzle',
    gameNames: { 'word-puzzle': 'Word-Puzzle', chess: 'Shakki', backgammon: 'Backgammon' },
    chess: CHESS_LABELS.fi,
    backgammon: BACKGAMMON_LABELS.fi,
    sectionName: 'Multiplayer',
    sectionTagline: 'Pelaa työkavereita vastaan vuoro kerrallaan',
    backToGameCorner: 'Takaisin pelinurkkaan',
    backToLobby: 'Takaisin aulaan',
    hub: {
      tagline: 'Valitse peli ja haasta työkaveri. Peli odottaa, kun teillä on kiire.',
      backToMultiplayer: 'Takaisin moninpeliin',
      openGame: 'Avaa peli',
      wordPuzzle: 'Aseta sanoja laudalle ja kerää pisteitä työkaveria vastaan tanskaksi, englanniksi, ruotsiksi tai suomeksi. Hubert pitää teille seuraa.',
      chess: 'Klassista shakkia käsin sorvatuilla puksipuu- ja eebenpuunappuloilla. Siirrä silloin kun sinulle sopii, kun Hubert torkkuu pöydän vieressä.',
      backgammon: 'Heitä noppia ja tuo 15 nappulaasi kotiin ennen kollegaasi. Palvelin heittää molempien puolesta, joten kukaan ei voi huijata.',
      moreSoon: 'Lisää pelejä tulossa',
      moreSoonBody: 'Pöytä on katettu uusille lautapeleille.',
      yourTurn: count => count === 1 ? 'Sinun vuorosi 1 pelissä' : `Sinun vuorosi ${count} pelissä`,
      invitations: count => count === 1 ? '1 kutsu' : `${count} kutsua`,
    },
    loading: 'Ladataan',
    retry: 'Yritä uudelleen',
    close: 'Sulje',
    cancel: 'Peruuta',
    you: 'Sinä',
    languageNames: LANGUAGE_NAMES,
    notifications: {
      invite: (name, gameType) => `${name} haastoi sinut ${gameType === 'chess' ? 'shakkiin' : gameType === 'backgammon' ? 'backgammoniin' : 'Word-Puzzle-peliin'}`,
      accepted: name => `${name} hyväksyi haasteesi`,
      declined: name => `${name} hylkäsi haasteesi`,
      cancelled: name => `${name} peruutti haasteensa`,
      turn: name => `On sinun vuorosi pelissä ${name} vastaan`,
      'approve-word': name => `${name} pelasi sanoja, jotka sinun pitää hyväksyä`,
      'word-approved': name => `${name} hyväksyi sanasi`,
      'word-rejected': name => `${name} hylkäsi sanasi`,
      reminder: name => `${name} muistuttaa sinua vuorostasi`,
      chat: name => `${name} kirjoitti sinulle`,
      finished: name => `Peli pelaajaa ${name} vastaan on päättynyt`,
      'draw-offer': name => `${name} tarjoaa tasapeliä`,
      'draw-declined': name => `${name} hylkäsi tasapelitarjouksesi`,
    },
    errors: {
      AUTH_REQUIRED: 'Sinun täytyy olla kirjautunut sisään pelataksesi.',
      MULTIPLAYER_INVALID: 'Toimintoa ei voitu suorittaa. Tarkista valintasi ja yritä uudelleen.',
      MULTIPLAYER_FORBIDDEN: 'Sinulla ei ole siihen oikeutta.',
      MULTIPLAYER_NOT_FOUND: 'Peliä ei ole enää olemassa.',
      MULTIPLAYER_STATE: 'Peli ei ole tilassa, jota toiminto vaatii. Se ladattiin uudelleen.',
      MULTIPLAYER_NOT_YOUR_TURN: 'Ei ole sinun vuorosi.',
      MULTIPLAYER_CONFLICT: 'Peli on muuttunut sen jälkeen, kun avasit sen. Uusin tilanne ladattiin.',
      MULTIPLAYER_INVALID_MOVE: 'Siirto ei ole kelvollinen.',
      MULTIPLAYER_LIMIT: 'Sinulla on liian monta avointa peliä. Päätä tai peruuta ensin yksi.',
      MULTIPLAYER_TOO_SOON: 'Lähetit muistutuksen äskettäin. Odota hetki ennen seuraavaa.',
      MULTIPLAYER_HUBERT_LIMIT: 'Hubert on saanut kaiken, mitä voit antaa hänelle tässä pelissä.',
      MULTIPLAYER_OPERATION_CONFLICT: 'Toiminto on jo käytetty. Yritä uudelleen.',
      MULTIPLAYER_INVALID_DATA: 'Jaettu pelidata on virheellistä. Ota yhteyttä ylläpitäjään.',
      MULTIPLAYER_UNAVAILABLE: 'Multiplayer ei ole nyt käytettävissä. Tarkista yhteys ja yritä uudelleen.',
      generic: 'Jokin meni pieleen. Yritä uudelleen.',
    },
    moveErrors: {
      EMPTY: 'Aseta vähintään yksi laatta laudalle.',
      OUT_OF_BOUNDS: 'Laatta on laudan ulkopuolella.',
      INVALID_LETTER: 'Kirjain ei kuulu pelin kieleen.',
      OCCUPIED: 'Ruutu on varattu.',
      DUPLICATE_SQUARE: 'Kaksi laattaa on samassa ruudussa.',
      NOT_IN_LINE: 'Laattojen täytyy olla samalla rivillä tai samassa sarakkeessa.',
      GAP: 'Laattojen välissä ei saa olla aukkoja.',
      MUST_COVER_CENTER: 'Ensimmäisen sanan täytyy peittää keskellä oleva tähti.',
      FIRST_MOVE_TOO_SHORT: 'Ensimmäisen sanan täytyy olla vähintään kaksi kirjainta pitkä.',
      NOT_CONNECTED: 'Sanan täytyy koskettaa laudalla jo olevia laattoja.',
      TILES_NOT_IN_RACK: 'Laatat eivät ole enää telineessäsi.',
      BAG_TOO_SMALL: 'Pussissa on liian vähän laattoja vaihtoon.',
      ILLEGAL_MOVE: 'Siirto ei ole sallittu.',
      PROMOTION_REQUIRED: 'Valitse, miksi sotilas ylennetään.',
      INVALID_PROMOTION: 'Sotilasta ei voi ylentää siihen nappulaan.',
      INCOMPLETE_TURN: 'Sinun on käytettävä kaikki nopat, jotka voit.',
    },
    lobby: {
      tagline: 'Muodosta sanoja laudalle työkaveria vastaan, yksi siirto kerrallaan ja omaan tahtiisi.',
      challenge: 'Haasta työkaveri',
      challengeHint: 'Peli alkaa, kun työkaverisi hyväksyy haasteen.',
      unavailableTitle: 'Multiplayer ei ole käytettävissä',
      unavailableBody: 'Yhteys jaettuun tallennustilaan puuttuu. Tarkista, että tallennustila on tavoitettavissa, ja yritä uudelleen.',
      loadError: 'Pelejä ei voitu ladata.',
      noGames: 'Ei pelejä vielä. Haasta työkaveri aloittaaksesi.',
      record: 'Tilanteesi',
      wins: 'Voitot',
      losses: 'Tappiot',
      draws: 'Tasapelit',
      played: 'Pelatut',
      sections: { yourTurn: 'Sinun vuorosi', invitations: 'Kutsut', waiting: 'Odottaa vastustajaa', finished: 'Päättyneet' },
      invitationsIn: 'Sinulle',
      invitationsOut: 'Lähettämäsi',
      showMore: 'Näytä lisää',
      showLess: 'Näytä vähemmän',
      open: 'Avaa',
      accept: 'Hyväksy',
      decline: 'Hylkää',
      withdraw: 'Peruuta kutsu',
      remind: 'Muistuta',
      remindedRecently: 'Muistutit äskettäin',
      updated: when => `Päivitetty ${when}`,
      news: 'Uutta',
      markRead: 'Merkitse luetuksi',
      leaderboard: { title: 'Tulostaulukko', hint: 'Pelaajat kaikista tiimeistä', legend: 'Voitot, tappiot, tasapelit', empty: 'Ei päättyneitä pelejä vielä.' },
      topWords: { title: 'Top 10 sanat', hint: 'Parhaat pelatut sanat', empty: 'Sanoja ei ole vielä pelattu.', points: score => `${score} pistettä` },
      rivals: {
        title: 'Sinun ottelusi', hint: 'Tilanne kutakin työkaveria vastaan', empty: 'Kun olet pelannut pelin loppuun, voit seurata tilannetta täällä.',
        ahead: 'Johdat', behind: 'Olet tappiolla', level: 'Tasan',
        record: (wins, losses, draws) => `${wins} ${wins === 1 ? 'voitto' : 'voittoa'}, ${losses} ${losses === 1 ? 'tappio' : 'tappiota'}${draws ? `, ${draws} ${draws === 1 ? 'tasapeli' : 'tasapeliä'}` : ''}`,
        last: when => `Viimeksi ${when}`, rematch: 'Haasta uudelleen',
      },
      status: { invited: 'Kutsuttu', active: 'Käynnissä', 'awaiting-approval': 'Sanatarkistus', finished: 'Päättynyt', declined: 'Hylätty', cancelled: 'Peruttu' },
      badge: { yourTurn: 'Sinun vuorosi', waiting: 'Odottaa', approve: 'Hyväksy sanat', waitingApproval: 'Odottaa hyväksyntää' },
      outcome: { won: 'Voitit', lost: 'Hävisit', draw: 'Tasapeli' },
      reason: {
        'out-of-tiles': 'Laatat loppuivat', scoreless: 'Ei pisteitä useaan siirtoon', resigned: 'Luovutus',
        checkmate: 'Matti', stalemate: 'Patti', threefold: 'Kolminkertainen toisto', 'fifty-move': '50 siirron sääntö',
        insufficient: 'Riittämätön materiaali', 'draw-agreed': 'Tasapeli sovittu', 'bore-off': 'Kaikki nappulat pois',
      },
      score: (mine, theirs) => `${mine} vastaan ${theirs}`,
    },
    challenge: {
      title: 'Haasta työkaveri',
      description: 'Valitse työkaveri ja kieli. Peli alkaa, kun työkaverisi hyväksyy haasteen.',
      search: 'Hae työkaveria',
      searchPlaceholder: 'Nimi tai tiimi',
      noPeople: 'Haulla ei löytynyt työkavereita.',
      language: 'Kieli',
      languageHint: 'Laatat ja sanalista noudattavat kieltä.',
      send: 'Lähetä haaste',
      sending: 'Lähetetään',
      pickPerson: 'Valitse ensin työkaveri',
    },
    toast: {
      challengeSent: name => `Haaste lähetetty henkilölle ${name}`,
      accepted: 'Haaste hyväksytty',
      declined: 'Haaste hylätty',
      withdrawn: 'Haaste peruttu',
      reminded: name => `${name} sai muistutuksen vuorostaan`,
      rematchSent: name => `Uusintaottelu lähetetty henkilölle ${name}`,
    },
    match: {
      boardLabel: 'Pelilauta',
      rackLabel: 'Laattasi',
      square: (row, col) => `Rivi ${row}, sarake ${col}`,
      premium: { TW: 'Kolminkertainen sana', DW: 'Kaksinkertainen sana', TL: 'Kolminkertainen kirjain', DL: 'Kaksinkertainen kirjain' },
      centre: 'Keskiruutu',
      blankTile: 'Tyhjä laatta',
      tileLabel: (letter, points) => `${letter}, ${points} ${points === 1 ? 'piste' : 'pistettä'}`,
      yourTurn: 'Sinun vuorosi',
      theirTurn: name => `${name} pelaa`,
      waitHint: 'Odota vuoroasi. Sillä välin voit sekoittaa telineesi ja jutella.',
      placeHint: 'Valitse ruutu laudalta asettaaksesi laatan.',
      shuffle: 'Sekoita',
      recall: 'Ota takaisin',
      play: 'Pelaa sana',
      playing: 'Pelataan',
      pass: 'Ohita',
      exchange: 'Vaihda laattoja',
      resign: 'Luovuta',
      exchangeTitle: 'Vaihda laattoja',
      exchangeHint: 'Valitse laatat, jotka haluat vaihtaa. Ohitat vuorosi.',
      exchangeConfirm: count => `Vaihda ${count} ${count === 1 ? 'laatta' : 'laattaa'}`,
      exchangeNeedsBag: 'Voit vaihtaa vain, kun pussissa on vähintään 7 laattaa.',
      confirmPass: { title: 'Ohitetaanko vuoro?', body: 'Et pelaa sanaa ja vuoro siirtyy vastustajalle.', confirm: 'Ohita' },
      confirmResign: { title: 'Luovutetaanko?', body: 'Vastustajasi voittaa pelin. Tätä ei voi perua.', confirm: 'Luovuta' },
      keepPlaying: 'Jatka pelaamista',
      blank: { title: 'Valitse kirjain tyhjälle laatalle', hint: 'Tyhjä laatta on 0 pisteen arvoinen riippumatta siitä, mitä kirjainta se esittää.' },
      preview: {
        title: 'Siirtosi',
        hint: 'Aseta laattoja laudalle nähdäksesi sanat ja pisteet.',
        checking: 'Lasketaan pisteitä',
        total: 'Yhteensä',
        bingo: 'Bingo: kaikki 7 laattaa käytetty',
        unknownWord: 'Ei sanalistalla',
        unknownHint: 'Vastustajasi täytyy hyväksyä sana, ennen kuin siirto lasketaan.',
        failed: 'Pisteitä ei voitu laskea juuri nyt.',
      },
      approval: {
        approverTitle: name => `${name} pelasi sanoja, jotka eivät ole sanalistalla`,
        approverBody: name => `Hyväksy ne, jos sanat ovat oikeita. Jos hylkäät ne, ${name} saa laatat takaisin ja yrittää uudelleen.`,
        approve: 'Hyväksy sanat',
        reject: 'Hylkää sanat',
        moverTitle: name => `Odotetaan, että ${name} hyväksyy sanasi`,
        moverBody: 'Sanat eivät ole sanalistalla, joten vastustajasi päättää, lasketaanko ne.',
        score: points => `${points} ${points === 1 ? 'piste' : 'pistettä'}`,
      },
      players: 'Pelaajat',
      points: 'pistettä',
      bag: 'Laattoja pussissa',
      theirTiles: count => `${count} ${count === 1 ? 'laatta' : 'laattaa'} telineessä`,
      onTurn: 'Vuorossa',
      history: {
        title: 'Siirtohistoria',
        empty: 'Ei siirtoja vielä.',
        play: (name, words) => `${name} pelasi ${words}`,
        pass: name => `${name} ohitti`,
        exchange: (name, count) => `${name} vaihtoi ${count} ${count === 1 ? 'laatan' : 'laattaa'}`,
        resign: name => `${name} luovutti`,
      },
      chat: { title: 'Keskustelu', placeholder: name => `Kirjoita henkilölle ${name}`, send: 'Lähetä', empty: 'Ei viestejä vielä. Sano hei!' },
      hubert: {
        woofs: ['Hau!', 'Hau hau!', 'Onko minun vuoroni?', 'Saisinko herkun?'],
        call: 'Kutsu Hubert',
        callHint: 'Hubert tulee sinun puolellesi pöytää',
        treat: left => `Anna herkku (${left} jäljellä)`,
        bone: left => `Anna lihaluu (${left} jäljellä)`,
        treatsGone: 'Herkut on käytetty tässä pelissä',
        bonesGone: 'Lihaluut on käytetty tässä pelissä',
        fed: (kind, name) => `${name === null ? 'Annoit' : `${name} antoi`} Hubertille ${kind === 'treat' ? 'herkun' : 'lihaluun'}`,
      },
      react: {
        button: 'Emoji',
        hint: 'Lähetä vastustajalle emoji',
        tray: 'Valitse emoji',
        names: ['Aplodit', 'Tuli', 'Nauru', 'Yllättynyt', 'Juhla', 'Huh', 'Miettii', 'Koira'],
        received: (name, emojiName) => `${name} lähetti emojin: ${emojiName}`,
        tooSoon: 'Odota hetki, ennen kuin lähetät uuden emojin.',
      },
      finished: { won: 'Voitit!', lost: name => `${name} voitti`, draw: 'Tasapeli', final: 'Lopputulos', rematch: 'Uusintaottelu' },
      keyboard: {
        title: 'Näppäimistö',
        items: [
          { keys: 'Nuolinäppäimet', text: 'Siirrä kohdistinta laudalla' },
          { keys: 'Kirjain', text: 'Aseta laatta telineestä; tyhjä laatta käytetään, jos kirjainta ei ole' },
          { keys: 'Välilyönti', text: 'Vaihda vaaka- ja pystysuunnan välillä' },
          { keys: 'Backspace', text: 'Ota viimeisin laatta takaisin' },
          { keys: 'Enter', text: 'Pelaa sana, kun se on kelvollinen' },
          { keys: 'Esc', text: 'Poista valinta ja palaa sitten aulaan' },
        ],
      },
      direction: { across: 'Vaaka', down: 'Pysty' },
      loadError: 'Peliä ei voitu ladata.',
      reloaded: 'Peli päivitettiin.',
    },
  },
}

export function getMultiplayerLabels(language: string): MultiplayerLabels {
  return language === 'da' || language === 'fi' || language === 'sv' ? MULTIPLAYER_LABELS[language] : MULTIPLAYER_LABELS.en
}
