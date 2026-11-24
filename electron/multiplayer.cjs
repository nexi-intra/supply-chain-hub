const crypto = require('node:crypto')
const rules = require('./games/wordPuzzle/rules.cjs')
const chessRules = require('./games/chess/rules.cjs')
const bgRules = require('./games/backgammon/rules.cjs')
const { LANGUAGES, createBag } = require('./games/wordPuzzle/tileSets.cjs')
const { topWordsFromMoves, mergeTopWords, readTopWords } = require('./games/wordPuzzle/topWords.cjs')

const INDEX_KEY = 'multiplayer-index'
const GAME_TYPE = 'word-puzzle'
const CHESS_TYPE = 'chess'
const BACKGAMMON_TYPE = 'backgammon'
const GAME_TYPES = [GAME_TYPE, CHESS_TYPE, BACKGAMMON_TYPE]
// games where the challenger may pick a colour (white moves first in chess; in backgammon the opening roll decides)
const COLOR_TYPES = [CHESS_TYPE, BACKGAMMON_TYPE]
const CHESS_COLORS = ['white', 'black', 'random']
const CHESS_COMMANDS = ['chess-move', 'offer-draw', 'respond-draw']
const BACKGAMMON_COMMANDS = ['bg-move']
const CHESS_MOVE_ERRORS = { 'illegal-move': 'ILLEGAL_MOVE', 'promotion-required': 'PROMOTION_REQUIRED', 'invalid-promotion': 'INVALID_PROMOTION' }
const SQUARE = /^[a-h][1-8]$/
const ROLES = ['user', 'manager', 'creator']
const STATUSES = ['invited', 'active', 'awaiting-approval', 'finished', 'declined', 'cancelled']
const OPEN_STATUSES = ['invited', 'active', 'awaiting-approval']
const ENDED_STATUSES = ['finished', 'declined', 'cancelled']
const PLAYING_STATUSES = ['active', 'awaiting-approval']
const RACK_SIZE = 7
const MAX_OPEN_GAMES = 20
const CHAT_TEXT_LIMIT = 500
const CHAT_LIMIT = 200
const HISTORY_LIMIT = 512
const OPERATION_LIMIT = 300
const NOTIFICATION_TTL_MS = 30 * 24 * 3600 * 1000
/** Read notifications only serve as recent history; keeping them 30 days grew the shared index to ~900 KB. */
const READ_NOTIFICATION_TTL_MS = 7 * 24 * 3600 * 1000
const NOTIFICATIONS_PER_RECIPIENT = 200
const SNAPSHOT_NOTIFICATIONS = 100
const ENDED_GAME_LIMIT = 500
const REMIND_INTERVAL_MS = 12 * 3600 * 1000
const RETRIES = 3
/** Treats and meat bones each player may give Hubert in one game. */
const HUBERT_LIMIT = Object.freeze({ treat: 10, bone: 2 })
/** The fixed emoji a player can send the opponent in a game (mirrored in src/lib/multiplayer.ts). */
const REACTION_EMOJIS = Object.freeze(['👏', '🔥', '😂', '😮', '🎉', '😅', '🤔', '🐶'])
const REACTION_COOLDOWN_MS = 3000
const REACTION_LIMIT = 20
const GAME_COMMANDS = ['move', 'approve-word', 'pass', 'exchange', ...CHESS_COMMANDS, ...BACKGAMMON_COMMANDS, 'resign', 'chat']
const FIELDS = {
  challenge: ['opponentEmail', 'language', 'gameType', 'color'],
  respond: ['gameId', 'accept'],
  cancel: ['gameId'],
  remind: ['gameId'],
  acknowledge: ['notificationIds'],
  move: ['gameId', 'expectedRevision', 'placements'],
  'approve-word': ['gameId', 'expectedRevision', 'accept'],
  pass: ['gameId', 'expectedRevision'],
  exchange: ['gameId', 'expectedRevision', 'letters'],
  'chess-move': ['gameId', 'expectedRevision', 'from', 'to', 'promotion'],
  'offer-draw': ['gameId', 'expectedRevision'],
  'respond-draw': ['gameId', 'expectedRevision', 'accept'],
  'bg-move': ['gameId', 'expectedRevision', 'steps'],
  resign: ['gameId', 'expectedRevision'],
  chat: ['gameId', 'text'],
  hubert: ['gameId', 'kind'],
  react: ['gameId', 'emoji'],
}

function fail(code, message) {
  const error = new Error(`${code}: ${message}`)
  error.code = code
  throw error
}

function invalidMove(detail) {
  const error = new Error(`MULTIPLAYER_INVALID_MOVE: ${detail}`)
  error.code = 'MULTIPLAYER_INVALID_MOVE'
  error.detail = detail
  throw error
}

function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value))
}

function text(value, label, max, code = 'MULTIPLAYER_INVALID') {
  if (typeof value !== 'string' || value.length > max || /[\x00-\x1f\x7f]/.test(value) || !value.trim()) fail(code, `Invalid ${label}`)
  return value.trim()
}

function identifier(value, label) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) fail('MULTIPLAYER_INVALID', `Invalid ${label}`)
  return value
}

function email(value, code = 'MULTIPLAYER_INVALID') {
  const result = text(value, 'email', 254, code).toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) fail(code, 'Invalid email')
  return result
}

function tileLetter(value) {
  if (typeof value !== 'string' || !value || value.length > 2) fail('MULTIPLAYER_INVALID', 'Invalid letter')
  return value
}

function normalizePlacements(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > RACK_SIZE) fail('MULTIPLAYER_INVALID', 'Invalid placements')
  return value.map(item => {
    if (!plain(item) || Reflect.ownKeys(item).some(key => !['row', 'col', 'letter', 'blank'].includes(key)) ||
      !Number.isSafeInteger(item.row) || !Number.isSafeInteger(item.col) ||
      (Object.hasOwn(item, 'blank') && typeof item.blank !== 'boolean')) fail('MULTIPLAYER_INVALID', 'Invalid placement')
    return { row: item.row, col: item.col, letter: tileLetter(item.letter), blank: item.blank === true }
  })
}

function revision(value) {
  if (!Number.isSafeInteger(value) || value < 1) fail('MULTIPLAYER_INVALID', 'Invalid expectedRevision')
  return value
}

/** A backgammon turn: up to four checker moves, from 'bar' or a point 1..24, to a point or 'off', with the die used. */
function normalizeSteps(value) {
  if (!Array.isArray(value) || value.length > 4) fail('MULTIPLAYER_INVALID', 'Invalid steps')
  const point = item => Number.isSafeInteger(item) && item >= 1 && item <= 24
  return value.map(item => {
    if (!plain(item) || Reflect.ownKeys(item).some(key => !['from', 'to', 'die'].includes(key)) ||
      !(item.from === 'bar' || point(item.from)) || !(item.to === 'off' || point(item.to)) ||
      !Number.isSafeInteger(item.die) || item.die < 1 || item.die > 6) fail('MULTIPLAYER_INVALID', 'Invalid step')
    return { from: item.from, to: item.to, die: item.die }
  })
}

function normalizeCommand(input) {
  if (!plain(input) || typeof input.type !== 'string' || !Object.hasOwn(FIELDS, input.type)) fail('MULTIPLAYER_INVALID', 'Invalid command')
  if (Reflect.ownKeys(input).some(key => !['operationId', 'type', ...FIELDS[input.type]].includes(key))) fail('MULTIPLAYER_INVALID', 'Unknown command field')
  const command = { operationId: identifier(input.operationId, 'operationId'), type: input.type }
  if (FIELDS[input.type].includes('gameId')) command.gameId = identifier(input.gameId, 'gameId')
  if (FIELDS[input.type].includes('expectedRevision')) command.expectedRevision = revision(input.expectedRevision)
  switch (input.type) {
    case 'challenge': {
      command.opponentEmail = email(input.opponentEmail)
      const gameType = input.gameType === undefined ? GAME_TYPE : input.gameType
      if (!GAME_TYPES.includes(gameType)) fail('MULTIPLAYER_INVALID', 'Invalid gameType')
      if (COLOR_TYPES.includes(gameType)) {
        const color = input.color === undefined ? 'random' : input.color
        if (!CHESS_COLORS.includes(color)) fail('MULTIPLAYER_INVALID', 'Invalid color')
        Object.assign(command, { gameType, color })
      } else {
        if (input.color !== undefined) fail('MULTIPLAYER_INVALID', 'Colour applies to chess and backgammon only')
        if (!LANGUAGES.includes(input.language)) fail('MULTIPLAYER_INVALID', 'Invalid language')
        command.language = input.language
      }
      break
    }
    case 'respond': case 'approve-word': case 'respond-draw':
      if (typeof input.accept !== 'boolean') fail('MULTIPLAYER_INVALID', 'Invalid accept')
      command.accept = input.accept
      break
    case 'chess-move':
      if (typeof input.from !== 'string' || !SQUARE.test(input.from) || typeof input.to !== 'string' || !SQUARE.test(input.to)) fail('MULTIPLAYER_INVALID', 'Invalid square')
      Object.assign(command, { from: input.from, to: input.to })
      if (input.promotion !== undefined) {
        if (!chessRules.PROMOTIONS.includes(input.promotion)) fail('MULTIPLAYER_INVALID', 'Invalid promotion')
        command.promotion = input.promotion
      }
      break
    case 'move':
      command.placements = normalizePlacements(input.placements)
      break
    case 'bg-move':
      command.steps = normalizeSteps(input.steps)
      break
    case 'exchange':
      if (!Array.isArray(input.letters) || input.letters.length < 1 || input.letters.length > RACK_SIZE) fail('MULTIPLAYER_INVALID', 'Invalid letters')
      command.letters = input.letters.map(tileLetter)
      break
    case 'chat':
      command.text = text(input.text, 'text', CHAT_TEXT_LIMIT)
      break
    case 'hubert':
      if (!Object.hasOwn(HUBERT_LIMIT, input.kind)) fail('MULTIPLAYER_INVALID', 'Invalid kind')
      command.kind = input.kind
      break
    case 'react':
      if (!REACTION_EMOJIS.includes(input.emoji)) fail('MULTIPLAYER_INVALID', 'Invalid emoji')
      command.emoji = input.emoji
      break
    case 'acknowledge':
      if (!Array.isArray(input.notificationIds) || input.notificationIds.length < 1 || input.notificationIds.length > 100) fail('MULTIPLAYER_INVALID', 'Invalid notificationIds')
      command.notificationIds = input.notificationIds.map(id => identifier(id, 'notificationId'))
      if (new Set(command.notificationIds).size !== command.notificationIds.length) fail('MULTIPLAYER_INVALID', 'Duplicate notificationIds')
      break
  }
  return command
}

function normalizePreview(input) {
  if (!plain(input) || Reflect.ownKeys(input).some(key => !['gameId', 'placements'].includes(key))) fail('MULTIPLAYER_INVALID', 'Invalid preview')
  return { gameId: identifier(input.gameId, 'gameId'), placements: normalizePlacements(input.placements) }
}

function readDirectory(input) {
  if (!plain(input) || !Array.isArray(input.people) || !Array.isArray(input.teams)) fail('MULTIPLAYER_DIRECTORY', 'Approved directory is unavailable')
  return {
    teams: input.teams,
    people: input.people.map(person => ({ email: email(person.email, 'MULTIPLAYER_DIRECTORY'), fullName: person.fullName, teamCode: person.teamCode, role: person.role })),
  }
}

function readIndex(value) {
  if (value === undefined) return { games: [], notifications: [], operations: [] }
  if (!plain(value) || !Array.isArray(value.games) || !Array.isArray(value.notifications) || !Array.isArray(value.operations) ||
    value.games.some(entry => !plain(entry) || typeof entry.id !== 'string' || !Array.isArray(entry.players) || entry.players.length !== 2 || !STATUSES.includes(entry.status)) ||
    (value.records !== undefined && (!Array.isArray(value.records) || value.records.some(record => !plain(record) || !Array.isArray(record.players) ||
      record.players.length !== 2 || !Array.isArray(record.wins) || record.wins.length !== 2 || !Number.isSafeInteger(record.draws))))) {
    fail('MULTIPLAYER_INVALID_DATA', 'Invalid shared multiplayer index')
  }
  return value
}

const pairKey = (type, first, second) => `${type}|${[first, second].sort().join('|')}`

/** Final result of a finished game as a record row: players sorted, so each pair has one row per game type. */
function resultRecord(entry) {
  if (entry.status !== 'finished' || !entry.winner) return null
  const players = entry.players.map(player => player.email).sort()
  const wins = players.map(player => (entry.winner === player ? 1 : 0))
  return { type: entry.type || GAME_TYPE, players, wins, draws: entry.winner === 'draw' ? 1 : 0, lastAt: entry.updatedAt }
}

function addRecord(map, record) {
  record = { ...record, type: record.type || GAME_TYPE }
  const key = pairKey(record.type, ...record.players)
  const current = map.get(key)
  if (!current) { map.set(key, structuredClone(record)); return }
  current.wins = [current.wins[0] + record.wins[0], current.wins[1] + record.wins[1]]
  current.draws += record.draws
  if (!current.lastAt || (record.lastAt && record.lastAt > current.lastAt)) current.lastAt = record.lastAt
}

/** All results: games pruned from the index live on in `records`, the rest are still listed as games. */
function tallyResults(index) {
  const map = new Map()
  for (const record of index.records || []) addRecord(map, record)
  for (const entry of index.games) {
    const record = resultRecord(entry)
    if (record) addRecord(map, record)
  }
  return [...map.values()]
}

const typeOf = game => (game.type === CHESS_TYPE ? CHESS_TYPE : game.type === BACKGAMMON_TYPE ? BACKGAMMON_TYPE : GAME_TYPE)

function readGame(value) {
  const shared = plain(value) && Number.isSafeInteger(value.revision) && STATUSES.includes(value.status) && Array.isArray(value.chat) && Array.isArray(value.history)
  const typed = shared && (value.type === CHESS_TYPE
    ? chessRules.isState(value.chess) && value.chess.whiteIndex === value.whiteIndex && (value.drawOffer === null || plain(value.drawOffer))
    : value.type === BACKGAMMON_TYPE
      ? bgRules.isState(value.bg) && value.bg.whiteIndex === value.whiteIndex
      : Array.isArray(value.board) && Array.isArray(value.racks) && value.racks.length === 2 && Array.isArray(value.bag) &&
        Array.isArray(value.scores) && Array.isArray(value.moves))
  if (!typed) fail('MULTIPLAYER_INVALID_DATA', 'Invalid shared game')
  return value
}

function sha256(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

/** Hubert's feeding record; games saved before feeding existed have none, which means nothing given yet. */
function readHubert(value) {
  const pair = items => (Array.isArray(items) && items.length === 2 && items.every(item => Number.isSafeInteger(item) && item >= 0) ? [items[0], items[1]] : [0, 0])
  if (!plain(value)) return { treats: [0, 0], bones: [0, 0], last: null }
  const last = plain(value.last) && typeof value.last.id === 'string' && [0, 1].includes(value.last.by) &&
    Object.hasOwn(HUBERT_LIMIT, value.last.kind) && typeof value.last.at === 'string'
    ? { id: value.last.id, by: value.last.by, kind: value.last.kind, at: value.last.at }
    : null
  return { treats: pair(value.treats), bones: pair(value.bones), last }
}

/** Reactions saved with a game; games from before reactions existed have none, and damaged items are dropped. */
function readReactions(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter(item => plain(item) && typeof item.id === 'string' && [0, 1].includes(item.by) && REACTION_EMOJIS.includes(item.emoji) && typeof item.at === 'string')
    .map(item => ({ id: item.id, by: item.by, emoji: item.emoji, at: item.at }))
    .slice(-REACTION_LIMIT)
}

const chessSeat = (game, color) => (color === 'white' ? game.whiteIndex : 1 - game.whiteIndex)

/** Index of the player who must act next: the mover while active, the approver while a word awaits approval. */
function actingIndex(game) {
  if (typeOf(game) === CHESS_TYPE) return game.status === 'active' ? chessSeat(game, game.chess.fen.split(' ')[1] === 'w' ? 'white' : 'black') : null
  if (typeOf(game) === BACKGAMMON_TYPE) return game.status === 'active' && game.bg.turn ? chessSeat(game, game.bg.turn) : null
  if (game.status === 'active') return game.turn
  if (game.status === 'awaiting-approval' && game.pending) return 1 - game.pending.by
  return null
}

function winnerEmail(game, entry) {
  if (game.winner === null || game.winner === undefined) return null
  return game.winner === 'draw' ? 'draw' : entry.players[game.winner].email
}

// Player identity always comes from the index entry, so renamed accounts keep working with older game files.
function entryFromGame(game, previous) {
  const acting = actingIndex(game)
  const chess = typeOf(game) === CHESS_TYPE
  const backgammon = typeOf(game) === BACKGAMMON_TYPE
  return {
    id: game.id, type: typeOf(game), language: chess || backgammon ? null : game.language, players: previous.players, status: game.status,
    turn: acting === null ? null : previous.players[acting].email, gameRevision: game.revision,
    createdAt: previous.createdAt, updatedAt: game.updatedAt, scores: chess ? chessScores(game) : backgammon ? backgammonScores(game) : [...game.scores],
    winner: winnerEmail(game, previous), finishedReason: game.finishedReason ?? null, reminders: previous.reminders ?? [null, null],
    ...(chess || backgammon ? { challengerColor: previous.challengerColor ?? 'random', whiteIndex: game.whiteIndex } : {}),
    ...(backgammon && game.winPoints ? { winPoints: game.winPoints } : {}),
  }
}

/** Backgammon shows how many checkers each seat has borne off. */
function backgammonScores(game) {
  const seatColor = seat => (seat === game.whiteIndex ? 'white' : 'black')
  return [game.bg.off[seatColor(0)], game.bg.off[seatColor(1)]]
}

/** Chess has no points; the entry carries 1 / 0 / 0.5 once the game is over. */
function chessScores(game) {
  if (game.status !== 'finished') return [0, 0]
  return game.winner === 'draw' ? [0.5, 0.5] : game.winner === 0 ? [1, 0] : game.winner === 1 ? [0, 1] : [0, 0]
}

function projectChess(game, entry, me) {
  const acting = actingIndex(game)
  return {
    id: game.id, type: CHESS_TYPE, revision: game.revision, status: game.status,
    players: structuredClone(entry.players), me, turn: acting === null ? null : entry.players[acting].email, whiteIndex: game.whiteIndex,
    chess: chessRules.projection(game.chess, me === game.whiteIndex ? 'white' : 'black'),
    drawOffer: game.status === 'active' && game.drawOffer ? { by: game.drawOffer.by, at: game.drawOffer.at } : null,
    chat: structuredClone(game.chat), hubert: readHubert(game.hubert), reactions: readReactions(game.reactions),
    winner: winnerEmail(game, entry), finishedReason: game.finishedReason ?? null, createdAt: game.createdAt, updatedAt: game.updatedAt,
  }
}

function projectBackgammon(game, entry, me) {
  const acting = actingIndex(game)
  return {
    id: game.id, type: BACKGAMMON_TYPE, revision: game.revision, status: game.status,
    players: structuredClone(entry.players), me, turn: acting === null ? null : entry.players[acting].email, whiteIndex: game.whiteIndex,
    bg: bgRules.projection(game.bg, me === game.whiteIndex ? 'white' : 'black'),
    chat: structuredClone(game.chat), hubert: readHubert(game.hubert), reactions: readReactions(game.reactions),
    winner: winnerEmail(game, entry), finishedReason: game.finishedReason ?? null, winPoints: game.winPoints ?? null,
    createdAt: game.createdAt, updatedAt: game.updatedAt,
  }
}

function projectGame(game, entry, me) {
  if (typeOf(game) === CHESS_TYPE) return projectChess(game, entry, me)
  if (typeOf(game) === BACKGAMMON_TYPE) return projectBackgammon(game, entry, me)
  const acting = actingIndex(game)
  return {
    id: game.id, type: GAME_TYPE, revision: game.revision, language: game.language, status: game.status,
    players: structuredClone(entry.players), me, turn: acting === null ? null : entry.players[acting].email,
    board: structuredClone(game.board), rack: [...game.racks[me]], opponentRackCount: game.racks[1 - me].length, bagCount: game.bag.length,
    scores: [...game.scores],
    pending: game.pending ? structuredClone(game.pending) : null,
    moves: structuredClone(game.moves), chat: structuredClone(game.chat),
    hubert: readHubert(game.hubert), reactions: readReactions(game.reactions),
    winner: winnerEmail(game, entry), finishedReason: game.finishedReason ?? null, createdAt: game.createdAt, updatedAt: game.updatedAt,
  }
}

function newestFirst(items, field) {
  return [...items].reverse().sort((a, b) => (a[field] < b[field] ? 1 : a[field] > b[field] ? -1 : 0))
}

function prune(index, nowMs) {
  index.notifications = index.notifications.filter(note => nowMs - Date.parse(note.createdAt) <= NOTIFICATION_TTL_MS &&
    !(note.readAt !== null && nowMs - Date.parse(note.readAt) > READ_NOTIFICATION_TTL_MS))
  const groups = new Map()
  for (const note of index.notifications) groups.set(note.recipientEmail, [...(groups.get(note.recipientEmail) || []), note])
  const dropped = new Set()
  for (const notes of groups.values()) {
    if (notes.length <= NOTIFICATIONS_PER_RECIPIENT) continue
    const order = [...notes].sort((a, b) => (a.readAt === null) - (b.readAt === null) || (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0))
    for (const note of order.slice(0, notes.length - NOTIFICATIONS_PER_RECIPIENT)) dropped.add(note)
  }
  index.notifications = index.notifications.filter(note => !dropped.has(note))
  const keepEnded = new Set(newestFirst(index.games.filter(entry => ENDED_STATUSES.includes(entry.status)), 'updatedAt').slice(0, ENDED_GAME_LIMIT))
  const archived = index.games.filter(entry => ENDED_STATUSES.includes(entry.status) && !keepEnded.has(entry)).map(resultRecord).filter(Boolean)
  if (archived.length) {
    const map = new Map()
    for (const record of [...(index.records || []), ...archived]) addRecord(map, record)
    index.records = [...map.values()]
  }
  index.games = index.games.filter(entry => !ENDED_STATUSES.includes(entry.status) || keepEnded.has(entry))
  index.operations = index.operations.slice(-OPERATION_LIMIT)
}

function createMultiplayerService({
  getIndexStore, getGameStore, getDirectory, wordChecker, now = Date.now, makeId = crypto.randomUUID, randomInt = crypto.randomInt, onChanged,
  directoryTtlMs = 0, indexShareMs = 0, cacheNow = Date.now, deferIndexWrites = false,
  // How long game() shows a game file ahead of its index entry before repairing the entry itself.
  healGraceMs = deferIndexWrites ? 15000 : 0,
} = {}) {
  if (typeof getIndexStore !== 'function' || typeof getGameStore !== 'function' || typeof getDirectory !== 'function' || typeof wordChecker?.check !== 'function' ||
    typeof now !== 'function' || typeof makeId !== 'function' || typeof randomInt !== 'function' || (onChanged !== undefined && typeof onChanged !== 'function') ||
    !Number.isFinite(directoryTtlMs) || !Number.isFinite(indexShareMs) || typeof cacheNow !== 'function' || typeof deferIndexWrites !== 'boolean' || !Number.isFinite(healGraceMs) || healGraceMs < 0) {
    throw new TypeError('Invalid multiplayer service dependencies')
  }

  const gameKey = id => `game-${id}`
  const slim = actor => actor && { email: actor.email, role: actor.role, home: actor.home && { folderName: actor.home.folderName } }

  // The people directory reads every team's users; it changes rarely, so calls within the TTL share one read.
  let directoryEntry = null
  function directoryFor(fresh) {
    const at = cacheNow()
    if (!fresh && directoryTtlMs > 0 && directoryEntry && at - directoryEntry.at < directoryTtlMs) return directoryEntry.promise
    const promise = (async () => readDirectory(await getDirectory()))()
    if (directoryTtlMs > 0) {
      const entry = { at, promise }
      directoryEntry = entry
      promise.catch(() => { if (directoryEntry === entry) directoryEntry = null })
    }
    return promise
  }
  const invalidateDirectory = () => { directoryEntry = null }

  // Read-only calls (snapshot, game, preview) within a few hundred ms share one read of the index. Commands never use it.
  let indexShare = null
  function readIndexShared(store, fresh = false) {
    if (indexShareMs <= 0) return readIndexFrom(store)
    const at = cacheNow()
    if (!fresh && indexShare && indexShare.store === store && at - indexShare.at < indexShareMs) return indexShare.promise
    const entry = { store, at, promise: readIndexFrom(store) }
    indexShare = entry
    entry.promise.catch(() => { if (indexShare === entry) indexShare = null })
    return entry.promise
  }
  const invalidateIndex = () => { indexShare = null }

  // Fingerprint of the index content that change notices have already announced to the windows.
  let announcedPrint = null
  const printOf = index => crypto.createHash('sha256').update(JSON.stringify(index)).digest('hex')

  async function context(actor, write = false, fresh = false) {
    actor = slim(actor)
    if (!plain(actor) || !ROLES.includes(actor.role) || !plain(actor.home)) fail('AUTH_REQUIRED', 'An authenticated employee is required')
    const actorEmail = email(actor.email, 'AUTH_REQUIRED')
    const matches = (people, candidate) => {
      const found = people.find(item => item.email === candidate)
      return found && actor.home.folderName === found.teamCode && (found.role === undefined || found.role === actor.role) ? found : null
    }
    let directory = await directoryFor(fresh)
    let person = matches(directory.people, actorEmail)
    // A cached directory may predate this person; check the shared drive once before refusing.
    if (!person && directoryTtlMs > 0 && !fresh) {
      directory = await directoryFor(true)
      person = matches(directory.people, actorEmail)
    }
    if (!person) fail('AUTH_REQUIRED', 'An approved current employee is required')
    if (write && actor.role === 'creator') fail('MULTIPLAYER_FORBIDDEN', 'The creator account cannot play')
    return { directory, actor: { email: actorEmail, fullName: person.fullName, teamCode: person.teamCode, role: actor.role } }
  }

  function stamp() {
    const value = now()
    if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) fail('MULTIPLAYER_INVALID', 'Invalid service clock')
    return new Date(value).toISOString()
  }

  const newId = () => identifier(makeId(), 'generated id')

  async function changed() {
    if (onChanged) {
      try { await onChanged([INDEX_KEY]) } catch {}
    }
  }

  async function readIndexFrom(store) {
    return readIndex(await store.getAsync(INDEX_KEY, { skipCache: true }))
  }

  async function readGameFrom(store, id) {
    const raw = await store.getAsync(gameKey(id), { skipCache: true })
    return raw === undefined ? undefined : { raw, game: readGame(raw) }
  }

  /**
   * Read-modify-write of the small shared index. mutate() works on a clone and may return { skip: true } to avoid a write.
   * Stores with mutateAsync do it under one lock (one SMB round trip less, no conflict retries); others compare-and-set.
   */
  async function updateIndex(store, mutate) {
    if (typeof store.mutateAsync === 'function') {
      let outcome
      const written = await store.mutateAsync(INDEX_KEY, actual => {
        const next = structuredClone(readIndex(actual))
        outcome = mutate(next)
        if (outcome?.skip) return undefined
        prune(next, Date.parse(stamp()))
        return next
      })
      if (outcome?.skip) return outcome.result
      invalidateIndex()
      announcedPrint = printOf(written)
      await changed()
      return outcome?.result
    }
    for (let attempt = 0; ; attempt++) {
      const actual = await store.getAsync(INDEX_KEY, { skipCache: true })
      const next = structuredClone(readIndex(actual))
      const outcome = mutate(next)
      if (outcome?.skip) return outcome.result
      prune(next, Date.parse(stamp()))
      try {
        await store.updateAsync(INDEX_KEY, { op: 'compareAndSet', expected: actual, value: next })
      } catch (error) {
        if (error.code === 'KV_CONFLICT' && attempt < RETRIES - 1) continue
        throw error
      }
      invalidateIndex()
      announcedPrint = printOf(next)
      await changed()
      return outcome?.result
    }
  }

  /**
   * With deferIndexWrites a move answers the player as soon as the game file is saved (~2 s sooner on the shared
   * drive); the index entry and notifications follow here. heal() already repairs an index that fell behind its game
   * file, so a write that keeps failing costs the opponent's bell item, never the move. Reads and commands in this
   * process wait for pending writes, so they never see their own index lagging.
   */
  const pendingIndexWrites = new Set()
  // This PC's index writes still on their way, per game, with the entry the newest of them will write. Reads show
  // that entry and heal() leaves these games alone (a write to M: takes 20+ s: waiting for it froze moves, chat and
  // the lobby, and healing it meanwhile was a second write of the same entry).
  const pendingIndexGames = new Map()
  function deferIndexWrite(store, mutate, gameId, projected) {
    const own = pendingIndexGames.get(gameId) || { count: 0, entry: null }
    own.count++
    own.entry = projected
    pendingIndexGames.set(gameId, own)
    const run = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await updateIndex(store, mutate)
        } catch (error) {
          if (attempt >= RETRIES - 1) {
            console.warn(`MULTIPLAYER: deferred index write failed: ${error?.code || error?.message}`)
            return
          }
          await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)))
        }
      }
    })()
    pendingIndexWrites.add(run)
    run.finally(() => {
      pendingIndexWrites.delete(run)
      if (--own.count === 0 && pendingIndexGames.get(gameId) === own) pendingIndexGames.delete(gameId)
    })
  }
  /** The index entries as this PC will have written them: its pending entries replace older stored ones. */
  function withOwnPending(games) {
    if (!pendingIndexGames.size) return games
    return games.map(entry => {
      const own = pendingIndexGames.get(entry.id)?.entry
      return own && own.gameRevision > entry.gameRevision ? own : entry
    })
  }
  async function settled() {
    while (pendingIndexWrites.size) await Promise.allSettled([...pendingIndexWrites])
  }

  function findPlayerEntry(index, gameId, actorEmail) {
    const entry = index.games.find(item => item.id === gameId)
    const me = entry ? entry.players.findIndex(player => player.email === actorEmail) : -1
    if (me < 0) fail('MULTIPLAYER_NOT_FOUND', 'Game not found')
    return { entry, me }
  }

  function notify(index, entry, to, type, actorEmail, at) {
    const recipientEmail = entry.players[to].email
    if (type === 'chat') {
      const unread = index.notifications.find(note => note.gameId === entry.id && note.type === 'chat' && note.recipientEmail === recipientEmail && note.readAt === null)
      if (unread) { unread.createdAt = at; unread.actorEmail = actorEmail; return }
    }
    index.notifications.push({ id: newId(), gameId: entry.id, gameType: entry.type || GAME_TYPE, recipientEmail, actorEmail, type, createdAt: at, readAt: null })
  }

  /** An answered or withdrawn invitation is no longer news for the invitee. */
  function settleInvite(index, entry, at) {
    for (const note of index.notifications) {
      if (note.gameId === entry.id && note.type === 'invite' && note.readAt === null) note.readAt = at
    }
  }

  function locateOperation(index, command, actorEmail, fingerprint) {
    const operation = index.operations.find(item => item.operationId === command.operationId)
    if (!operation) return null
    if (operation.actorEmail !== actorEmail || operation.fingerprint !== fingerprint) fail('MULTIPLAYER_OPERATION_CONFLICT', 'Operation ID is already bound to another actor or payload')
    return operation
  }

  async function withGame(entry, me, known) {
    if (!['active', 'awaiting-approval', 'finished'].includes(entry.status)) return {}
    const found = known ? { game: known } : await readGameFrom(await getGameStore(), entry.id)
    return found ? { game: projectGame(found.game, entry, me) } : {}
  }

  async function checkWords(language, words) {
    let result = null
    try { result = await wordChecker.check(language, words) } catch {}
    return words.map(word => (plain(result) && typeof result[word] === 'boolean' ? result[word] : null))
  }

  function checkMove(game, by, placements) {
    const placed = rules.validatePlacement(game.board, placements, game.language)
    if (!placed.ok) invalidMove(placed.error)
    const removed = rules.removeFromRack(game.racks[by], placements)
    if (!removed.ok) invalidMove(removed.error)
    return { rack: removed.rack, scored: rules.scoreMove(game.board, placements, game.language) }
  }

  async function evaluate(game, by, placements) {
    const { scored } = checkMove(game, by, placements)
    const known = await checkWords(game.language, scored.words.map(item => item.word))
    return { words: scored.words.map(({ word, score }, i) => ({ word, score, known: known[i] })), total: scored.total, bingo: scored.bingo }
  }

  function settle(game) {
    const racks = { 0: game.racks[0], 1: game.racks[1] }
    if (!rules.isGameOver({ bagSize: game.bag.length, racks, consecutiveScoreless: game.consecutiveScoreless })) return false
    const final = rules.finalScores({ 0: game.scores[0], 1: game.scores[1] }, racks, game.language)
    game.scores = [final.scores[0], final.scores[1]]
    game.winner = final.winner === 'draw' ? 'draw' : Number(final.winner)
    game.status = 'finished'
    game.pending = null
    game.finishedReason = game.bag.length === 0 && (game.racks[0].length === 0 || game.racks[1].length === 0) ? 'out-of-tiles' : 'scoreless'
    return true
  }

  function playMove(game, by, placements, at) {
    const { rack, scored } = checkMove(game, by, placements)
    const drawn = rules.drawTiles(game.bag, placements.length, randomInt)
    game.board = rules.applyPlacements(game.board, placements)
    game.racks[by] = [...rack, ...drawn.drawn]
    game.bag = drawn.bag
    game.scores[by] += scored.total
    game.moves.push({ by, kind: 'play', words: scored.words.map(({ word, score }) => ({ word, score })), score: scored.total, at })
    game.consecutiveScoreless = scored.total > 0 ? 0 : game.consecutiveScoreless + 1
    game.turn = 1 - by
    game.pending = null
    game.status = 'active'
  }

  function requireTurn(game, me) {
    if (game.status !== 'active') fail('MULTIPLAYER_STATE', 'The game is not waiting for a move')
    if (game.turn !== me) fail('MULTIPLAYER_NOT_YOUR_TURN', 'It is not your turn')
  }

  function endTurn(game, me, notes) {
    if (settle(game)) notes.push({ to: 0, type: 'finished' }, { to: 1, type: 'finished' })
    else notes.push({ to: 1 - me, type: 'turn' })
  }

  function endChess(game, outcome) {
    game.status = 'finished'
    game.drawOffer = null
    game.winner = outcome.result === 'draw' ? 'draw' : chessSeat(game, outcome.result)
    game.finishedReason = outcome.reason
  }

  function applyChessCommand(command, game, me, at) {
    const next = structuredClone(game)
    const notes = []
    const open = game.status === 'active'
    switch (command.type) {
      case 'chess-move': {
        if (!open) fail('MULTIPLAYER_STATE', 'The game is not waiting for a move')
        if (actingIndex(game) !== me) fail('MULTIPLAYER_NOT_YOUR_TURN', 'It is not your turn')
        let played
        try {
          played = chessRules.applyMove(game.chess, me === game.whiteIndex ? 'white' : 'black', { from: command.from, to: command.to, promotion: command.promotion }, at)
        } catch (error) {
          if (CHESS_MOVE_ERRORS[error.reason]) invalidMove(CHESS_MOVE_ERRORS[error.reason])
          throw error
        }
        next.chess = played.state
        if (game.drawOffer && game.drawOffer.by !== me) next.drawOffer = null
        if (played.outcome.over) {
          endChess(next, played.outcome)
          notes.push({ to: 0, type: 'finished' }, { to: 1, type: 'finished' })
        } else {
          notes.push({ to: 1 - me, type: 'turn' })
        }
        break
      }
      case 'offer-draw':
        if (!open) fail('MULTIPLAYER_STATE', 'The game is not in progress')
        if (game.drawOffer) fail('MULTIPLAYER_STATE', 'A draw offer is already open')
        next.drawOffer = { by: me, at }
        notes.push({ to: 1 - me, type: 'draw-offer' })
        break
      case 'respond-draw': {
        if (!open || !game.drawOffer) fail('MULTIPLAYER_STATE', 'No draw offer is waiting')
        if (game.drawOffer.by === me) fail('MULTIPLAYER_FORBIDDEN', 'Only the opponent answers a draw offer')
        if (command.accept) {
          endChess(next, { result: 'draw', reason: 'draw-agreed' })
          notes.push({ to: game.drawOffer.by, type: 'finished' })
        } else {
          next.drawOffer = null
          notes.push({ to: game.drawOffer.by, type: 'draw-declined' })
        }
        break
      }
      case 'resign':
        if (!open) fail('MULTIPLAYER_STATE', 'The game is not in progress')
        endChess(next, { result: me === game.whiteIndex ? 'black' : 'white', reason: 'resigned' })
        notes.push({ to: 1 - me, type: 'finished' })
        break
      case 'chat':
        next.chat = [...next.chat, { id: newId(), by: me, text: command.text, at }].slice(-CHAT_LIMIT)
        notes.push({ to: 1 - me, type: 'chat' })
        break
      default:
        fail('MULTIPLAYER_INVALID', 'This command applies to Word-Puzzle only')
    }
    return { next, notes, settle: game.drawOffer && !next.drawOffer ? ['draw-offer'] : [] }
  }

  const rollDie = () => randomInt(6) + 1

  function endBackgammon(game, winner, reason, points) {
    game.status = 'finished'
    game.winner = winner
    game.finishedReason = reason
    game.winPoints = points
  }

  function applyBackgammonCommand(command, game, me, at) {
    const next = structuredClone(game)
    const notes = []
    const myColor = me === game.whiteIndex ? 'white' : 'black'
    switch (command.type) {
      case 'bg-move': {
        if (game.status !== 'active') fail('MULTIPLAYER_STATE', 'The game is not waiting for a move')
        if (actingIndex(game) !== me) fail('MULTIPLAYER_NOT_YOUR_TURN', 'It is not your turn')
        let played
        try {
          played = bgRules.applyTurn(game.bg, myColor, command.steps, () => [rollDie(), rollDie()], at)
        } catch (error) {
          if (error.reason === 'illegal-move') invalidMove('ILLEGAL_MOVE')
          if (error.reason === 'incomplete-turn') invalidMove('INCOMPLETE_TURN')
          throw error
        }
        next.bg = played.state
        if (played.outcome.over) {
          endBackgammon(next, me, 'bore-off', played.outcome.points)
          notes.push({ to: 0, type: 'finished' }, { to: 1, type: 'finished' })
        } else {
          notes.push({ to: 1 - me, type: 'turn' })
        }
        break
      }
      case 'resign':
        if (game.status !== 'active') fail('MULTIPLAYER_STATE', 'The game is not in progress')
        endBackgammon(next, 1 - me, 'resigned', 1)
        next.bg = { ...next.bg, turn: null, dice: [] }
        notes.push({ to: 1 - me, type: 'finished' })
        break
      case 'chat':
        next.chat = [...next.chat, { id: newId(), by: me, text: command.text, at }].slice(-CHAT_LIMIT)
        notes.push({ to: 1 - me, type: 'chat' })
        break
      default:
        fail('MULTIPLAYER_INVALID', 'This command does not apply to backgammon')
    }
    return { next, notes }
  }

  async function applyGameCommand(command, game, me, at) {
    if (typeOf(game) === CHESS_TYPE) return applyChessCommand(command, game, me, at)
    if (typeOf(game) === BACKGAMMON_TYPE) return applyBackgammonCommand(command, game, me, at)
    if (CHESS_COMMANDS.includes(command.type)) fail('MULTIPLAYER_INVALID', 'This command applies to chess only')
    if (BACKGAMMON_COMMANDS.includes(command.type)) fail('MULTIPLAYER_INVALID', 'This command applies to backgammon only')
    const next = structuredClone(game)
    const notes = []
    switch (command.type) {
      case 'move': {
        requireTurn(game, me)
        const evaluated = await evaluate(game, me, command.placements)
        if (evaluated.words.every(word => word.known === true)) {
          playMove(next, me, command.placements, at)
          endTurn(next, me, notes)
        } else {
          next.pending = { by: me, placements: command.placements, words: evaluated.words, total: evaluated.total, bingo: evaluated.bingo, at }
          next.status = 'awaiting-approval'
          notes.push({ to: 1 - me, type: 'approve-word' })
        }
        break
      }
      case 'approve-word': {
        if (game.status !== 'awaiting-approval' || !game.pending) fail('MULTIPLAYER_STATE', 'No word is waiting for approval')
        const mover = game.pending.by
        if (me === mover) fail('MULTIPLAYER_FORBIDDEN', 'Only the opponent approves a word')
        if (command.accept) {
          playMove(next, mover, game.pending.placements, at)
          notes.push({ to: mover, type: 'word-approved' })
          if (settle(next)) notes.push({ to: 0, type: 'finished' }, { to: 1, type: 'finished' })
        } else {
          next.pending = null
          next.status = 'active'
          notes.push({ to: mover, type: 'word-rejected' })
        }
        break
      }
      case 'pass':
        requireTurn(game, me)
        next.moves.push({ by: me, kind: 'pass', score: 0, at })
        next.consecutiveScoreless++
        next.turn = 1 - me
        endTurn(next, me, notes)
        break
      case 'exchange': {
        requireTurn(game, me)
        const exchanged = rules.exchangeTiles(game.racks[me], game.bag, command.letters, randomInt)
        if (!exchanged.ok) invalidMove(exchanged.error)
        next.racks[me] = exchanged.rack
        next.bag = exchanged.bag
        next.moves.push({ by: me, kind: 'exchange', score: 0, count: command.letters.length, at })
        next.consecutiveScoreless++
        next.turn = 1 - me
        endTurn(next, me, notes)
        break
      }
      case 'resign':
        if (!PLAYING_STATUSES.includes(game.status)) fail('MULTIPLAYER_STATE', 'The game is not in progress')
        next.moves.push({ by: me, kind: 'resign', score: 0, at })
        next.status = 'finished'
        next.pending = null
        next.winner = 1 - me
        next.finishedReason = 'resigned'
        notes.push({ to: 1 - me, type: 'finished' })
        break
      case 'chat':
        next.chat = [...next.chat, { id: newId(), by: me, text: command.text, at }].slice(-CHAT_LIMIT)
        notes.push({ to: 1 - me, type: 'chat' })
        break
    }
    return { next, notes }
  }

  /** Rewrites an index entry that fell behind its game file (crash between the two writes). Best effort. */
  async function heal(store, game, entry) {
    if (entry.gameRevision >= game.revision) return entry
    if (pendingIndexGames.has(game.id)) return entryFromGame(game, entry)
    try {
      return await updateIndex(store, index => {
        const current = index.games.find(item => item.id === game.id) || entry
        if (current.gameRevision >= game.revision) return { skip: true, result: current }
        const healed = entryFromGame(game, current)
        index.games = index.games.some(item => item.id === game.id) ? index.games.map(item => (item.id === game.id ? healed : item)) : [...index.games, healed]
        // The lost write may have held a Top 10 word; entries are keyed by game and move, so merging every move is idempotent.
        const played = topWordsFromMoves(game, healed.players)
        if (played.length) index.topWords = mergeTopWords(index.topWords, played)
        return { result: healed }
      })
    } catch {
      return entryFromGame(game, entry)
    }
  }

  async function gameCommand(ctx, command) {
    const indexStore = await getIndexStore()
    const gameStore = await getGameStore()
    // The game file does not depend on the index, so the first two round trips to the share overlap.
    const prefetched = readGameFrom(gameStore, command.gameId)
    prefetched.catch(() => {})
    const first = findPlayerEntry(await readIndexFrom(indexStore), command.gameId, ctx.actor.email)
    const { me } = first
    let entry = first.entry
    const fingerprint = sha256({ player: me, command })
    for (let attempt = 0; ; attempt++) {
      const found = attempt === 0 ? await prefetched : await readGameFrom(gameStore, command.gameId)
      if (!found) fail(['invited', 'declined', 'cancelled'].includes(entry.status) ? 'MULTIPLAYER_STATE' : 'MULTIPLAYER_NOT_FOUND', 'The game has not started')
      const { raw, game } = found
      entry = await heal(indexStore, game, entry)
      const replayed = game.history.find(item => item.operationId === command.operationId)
      if (replayed) {
        if (replayed.fingerprint !== fingerprint) fail('MULTIPLAYER_OPERATION_CONFLICT', 'Operation ID is already bound to another actor or payload')
        return { entry: structuredClone(entry), game: projectGame(game, entry, me) }
      }
      if (command.expectedRevision !== undefined && command.expectedRevision !== game.revision) fail('MULTIPLAYER_CONFLICT', 'The game revision has changed')
      const at = stamp()
      const { next, notes, settle = [] } = await applyGameCommand(command, game, me, at)
      next.history = [...next.history, { operationId: command.operationId, fingerprint, actorEmail: ctx.actor.email, type: command.type, at }].slice(-HISTORY_LIMIT)
      next.revision = game.revision + 1
      next.updatedAt = at
      try {
        await gameStore.updateAsync(gameKey(game.id), { op: 'compareAndSet', expected: raw, value: next })
      } catch (error) {
        if (error.code !== 'KV_CONFLICT') throw error
        if (attempt < RETRIES - 1) continue
        fail('MULTIPLAYER_CONFLICT', 'The game changed while saving')
      }
      const writeIndex = index => {
        const previous = index.games.find(item => item.id === game.id) || entry
        const projected = entryFromGame(next, previous)
        index.games = index.games.some(item => item.id === game.id) ? index.games.map(item => (item.id === game.id ? projected : item)) : [...index.games, projected]
        for (const note of notes) notify(index, projected, note.to, note.type, ctx.actor.email, at)
        for (const note of index.notifications) {
          if (note.gameId === game.id && note.readAt === null && settle.includes(note.type)) note.readAt = at
        }
        const played = topWordsFromMoves(next, projected.players, game.moves?.length ?? 0)
        if (played.length) index.topWords = mergeTopWords(index.topWords, played)
        return { result: projected }
      }
      if (deferIndexWrites) {
        const projected = entryFromGame(next, entry)
        deferIndexWrite(indexStore, writeIndex, game.id, projected)
        return { entry: structuredClone(projected), game: projectGame(next, projected, me) }
      }
      const updated = await updateIndex(indexStore, writeIndex)
      return { entry: structuredClone(updated), game: projectGame(next, updated, me) }
    }
  }

  /**
   * Feeding Hubert is shared but is not a game move: it never bumps the revision, so it can never turn
   * a move made at the same moment into a MULTIPLAYER_CONFLICT. The game file is still compare-and-set
   * with retries, replays are idempotent through the game history, and the index entry gets a small
   * marker so the opponent's watcher sees the change.
   */
  async function hubertCommand(ctx, command) {
    const indexStore = await getIndexStore()
    const first = findPlayerEntry(await readIndexFrom(indexStore), command.gameId, ctx.actor.email)
    const { me } = first
    let entry = first.entry
    if (['invited', 'declined', 'cancelled'].includes(entry.status)) fail('MULTIPLAYER_STATE', 'The game has not started')
    const gameStore = await getGameStore()
    const fingerprint = sha256({ player: me, command })
    for (let attempt = 0; ; attempt++) {
      const found = await readGameFrom(gameStore, command.gameId)
      if (!found) fail('MULTIPLAYER_NOT_FOUND', 'The game has not started')
      const { raw, game } = found
      entry = await heal(indexStore, game, entry)
      const replayed = game.history.find(item => item.operationId === command.operationId)
      if (replayed) {
        if (replayed.fingerprint !== fingerprint) fail('MULTIPLAYER_OPERATION_CONFLICT', 'Operation ID is already bound to another actor or payload')
        return { entry: structuredClone(entry), game: projectGame(game, entry, me) }
      }
      const hubert = readHubert(game.hubert)
      const given = command.kind === 'treat' ? hubert.treats : hubert.bones
      if (given[me] >= HUBERT_LIMIT[command.kind]) fail('MULTIPLAYER_HUBERT_LIMIT', `No ${command.kind}s left for Hubert in this game`)
      const at = stamp()
      given[me]++
      hubert.last = { id: newId(), by: me, kind: command.kind, at }
      const next = { ...structuredClone(game), hubert }
      next.history = [...next.history, { operationId: command.operationId, fingerprint, actorEmail: ctx.actor.email, type: 'hubert', at }].slice(-HISTORY_LIMIT)
      try {
        await gameStore.updateAsync(gameKey(game.id), { op: 'compareAndSet', expected: raw, value: next })
      } catch (error) {
        if (error.code !== 'KV_CONFLICT') throw error
        if (attempt < RETRIES - 1) continue
        fail('MULTIPLAYER_CONFLICT', 'The game changed while saving')
      }
      try {
        entry = await updateIndex(indexStore, index => {
          const current = index.games.find(item => item.id === game.id)
          if (!current) return { skip: true, result: entry }
          current.hubertAt = at
          return { result: current }
        })
      } catch {
        // Hubert already got his treat; the opponent sees it with the next change instead.
        await changed()
      }
      return { entry: structuredClone(entry), game: projectGame(next, entry, me) }
    }
  }

  /**
   * An emoji for the opponent is shared like feeding Hubert: not a move, so it never bumps the revision or
   * conflicts with a move made at the same moment. Compare-and-set with retries, idempotent through the
   * game history, and `reactAt` on the index entry wakes the opponent's watcher. A player's reactions are
   * spaced REACTION_COOLDOWN_MS apart and only the last REACTION_LIMIT are kept.
   */
  async function reactCommand(ctx, command) {
    const indexStore = await getIndexStore()
    const first = findPlayerEntry(await readIndexFrom(indexStore), command.gameId, ctx.actor.email)
    const { me } = first
    let entry = first.entry
    if (['invited', 'declined', 'cancelled'].includes(entry.status)) fail('MULTIPLAYER_STATE', 'The game has not started')
    const gameStore = await getGameStore()
    const fingerprint = sha256({ player: me, command })
    for (let attempt = 0; ; attempt++) {
      const found = await readGameFrom(gameStore, command.gameId)
      if (!found) fail('MULTIPLAYER_NOT_FOUND', 'The game has not started')
      const { raw, game } = found
      entry = await heal(indexStore, game, entry)
      const replayed = game.history.find(item => item.operationId === command.operationId)
      if (replayed) {
        if (replayed.fingerprint !== fingerprint) fail('MULTIPLAYER_OPERATION_CONFLICT', 'Operation ID is already bound to another actor or payload')
        return { entry: structuredClone(entry), game: projectGame(game, entry, me) }
      }
      const at = stamp()
      const reactions = readReactions(game.reactions)
      const mine = reactions.findLast(item => item.by === me)
      if (mine && Date.parse(at) - Date.parse(mine.at) < REACTION_COOLDOWN_MS) fail('MULTIPLAYER_TOO_SOON', 'A reaction was sent a moment ago')
      const next = { ...structuredClone(game), reactions: [...reactions, { id: newId(), by: me, emoji: command.emoji, at }].slice(-REACTION_LIMIT) }
      next.history = [...next.history, { operationId: command.operationId, fingerprint, actorEmail: ctx.actor.email, type: 'react', at }].slice(-HISTORY_LIMIT)
      try {
        await gameStore.updateAsync(gameKey(game.id), { op: 'compareAndSet', expected: raw, value: next })
      } catch (error) {
        if (error.code !== 'KV_CONFLICT') throw error
        if (attempt < RETRIES - 1) continue
        fail('MULTIPLAYER_CONFLICT', 'The game changed while saving')
      }
      try {
        entry = await updateIndex(indexStore, index => {
          const current = index.games.find(item => item.id === game.id)
          if (!current) return { skip: true, result: entry }
          current.reactAt = at
          return { result: current }
        })
      } catch {
        // The reaction is saved; the opponent sees it with the next change instead.
        await changed()
      }
      return { entry: structuredClone(entry), game: projectGame(next, entry, me) }
    }
  }

  async function newGame(entry, at) {
    if (entry.type === BACKGAMMON_TYPE) {
      const whiteIndex = entry.whiteIndex ?? (randomInt(2) === 1 ? 1 : 0)
      return {
        id: entry.id, type: BACKGAMMON_TYPE, revision: 1, status: 'active', players: structuredClone(entry.players), whiteIndex,
        bg: bgRules.createBackgammonState({ whiteIndex, rollDie }), chat: [], history: [], hubert: readHubert(undefined),
        winner: null, finishedReason: null, winPoints: null, createdAt: at, updatedAt: at,
      }
    }
    if (entry.type === CHESS_TYPE) {
      const whiteIndex = entry.whiteIndex ?? (randomInt(2) === 1 ? 1 : 0)
      return {
        id: entry.id, type: CHESS_TYPE, revision: 1, status: 'active', players: structuredClone(entry.players), whiteIndex,
        chess: chessRules.createChessState({ whiteIndex }), drawOffer: null, chat: [], history: [], hubert: readHubert(undefined),
        winner: null, finishedReason: null, createdAt: at, updatedAt: at,
      }
    }
    const bag = createBag(entry.language)
    const shuffled = rules.drawTiles(bag, bag.length, randomInt).drawn
    const first = rules.drawTiles(shuffled, RACK_SIZE, randomInt)
    const second = rules.drawTiles(first.bag, RACK_SIZE, randomInt)
    return {
      id: entry.id, revision: 1, language: entry.language, players: structuredClone(entry.players), board: rules.emptyBoard(),
      racks: [first.drawn, second.drawn], bag: second.bag, scores: [0, 0], turn: randomInt(2) === 1 ? 1 : 0, status: 'active',
      consecutiveScoreless: 0, pending: null, moves: [], chat: [], history: [], winner: null, finishedReason: null, createdAt: at, updatedAt: at,
    }
  }

  async function ensureGame(entry, at) {
    const store = await getGameStore()
    const existing = await readGameFrom(store, entry.id)
    if (existing) return existing.game
    const created = await newGame(entry, at)
    try {
      await store.updateAsync(gameKey(entry.id), { op: 'compareAndSet', expected: undefined, value: created })
      return created
    } catch (error) {
      if (error.code !== 'KV_CONFLICT') throw error
      const winner = await readGameFrom(store, entry.id)
      if (!winner) throw error
      return winner.game
    }
  }

  /** Index-only commands: idempotent through index.operations; handler mutates the index clone and returns the game id (or null). */
  async function indexCommand(ctx, command, handler, known) {
    const store = await getIndexStore()
    const fingerprint = sha256({ actorEmail: ctx.actor.email, command })
    const entry = await updateIndex(store, index => {
      const operation = locateOperation(index, command, ctx.actor.email, fingerprint)
      const at = stamp()
      const gameId = operation ? operation.gameId : handler(index, at)
      const result = gameId === null ? null : structuredClone(index.games.find(item => item.id === gameId) || null)
      if (operation) return { skip: true, result }
      index.operations.push({ operationId: command.operationId, fingerprint, actorEmail: ctx.actor.email, gameId })
      return { result }
    })
    if (!entry) return { entry: null }
    return { entry, ...(await withGame(entry, entry.players.findIndex(player => player.email === ctx.actor.email), known)) }
  }

  function requireInvitation(entry, me, wantMe) {
    if (me !== wantMe) fail('MULTIPLAYER_FORBIDDEN', wantMe === 1 ? 'Only the invited player can respond' : 'Only the challenger can withdraw the invitation')
    if (entry.status !== 'invited') fail('MULTIPLAYER_STATE', 'The invitation is no longer pending')
  }

  async function command(actor, input) {
    let captured
    try { captured = structuredClone(input) } catch { fail('MULTIPLAYER_INVALID', 'Invalid command payload') }
    const ctx = await context(actor, true, captured?.type === 'challenge')
    const cmd = normalizeCommand(captured)
    if (GAME_COMMANDS.includes(cmd.type)) return gameCommand(ctx, cmd)
    if (cmd.type === 'hubert') return hubertCommand(ctx, cmd)
    if (cmd.type === 'react') return reactCommand(ctx, cmd)
    const actorEmail = ctx.actor.email
    switch (cmd.type) {
      case 'challenge':
        return indexCommand(ctx, cmd, (index, at) => {
          const opponent = ctx.directory.people.find(person => person.email === cmd.opponentEmail)
          if (!opponent || opponent.email === actorEmail || opponent.role === 'creator') fail('MULTIPLAYER_INVALID', 'The opponent must be another approved player')
          const open = index.games.filter(entry => OPEN_STATUSES.includes(entry.status) && entry.players.some(player => player.email === actorEmail))
          if (open.length >= MAX_OPEN_GAMES) fail('MULTIPLAYER_LIMIT', 'Too many open games')
          const type = cmd.gameType ?? GAME_TYPE
          const entry = {
            id: newId(), type, language: type === GAME_TYPE ? cmd.language : null,
            players: [{ email: actorEmail, name: ctx.actor.fullName, teamCode: ctx.actor.teamCode }, { email: opponent.email, name: opponent.fullName, teamCode: opponent.teamCode }],
            status: 'invited', turn: null, gameRevision: 0, createdAt: at, updatedAt: at, scores: [0, 0], winner: null, finishedReason: null, reminders: [null, null],
            ...(COLOR_TYPES.includes(type) ? { challengerColor: cmd.color, whiteIndex: cmd.color === 'white' ? 0 : cmd.color === 'black' ? 1 : null } : {}),
          }
          if (index.games.some(item => item.id === entry.id)) fail('MULTIPLAYER_CONFLICT', 'Generated game id already exists')
          index.games.push(entry)
          notify(index, entry, 1, 'invite', actorEmail, at)
          return entry.id
        })
      case 'respond': {
        let game
        if (cmd.accept) {
          const index = await readIndexFrom(await getIndexStore())
          const fingerprint = sha256({ actorEmail, command: cmd })
          if (!locateOperation(index, cmd, actorEmail, fingerprint)) {
            const { entry, me } = findPlayerEntry(index, cmd.gameId, actorEmail)
            requireInvitation(entry, me, 1)
            game = await ensureGame(entry, stamp())
          }
        }
        return indexCommand(ctx, cmd, (index, at) => {
          const { entry, me } = findPlayerEntry(index, cmd.gameId, actorEmail)
          requireInvitation(entry, me, 1)
          settleInvite(index, entry, at)
          if (!cmd.accept) {
            Object.assign(entry, { status: 'declined', updatedAt: at })
            notify(index, entry, 0, 'declined', actorEmail, at)
            return entry.id
          }
          if (!game) fail('MULTIPLAYER_CONFLICT', 'The game could not be started')
          const started = entryFromGame(game, entry)
          index.games = index.games.map(item => (item.id === entry.id ? started : item))
          notify(index, started, 0, 'accepted', actorEmail, at)
          if (actingIndex(game) === 0) notify(index, started, 0, 'turn', actorEmail, at)
          return entry.id
        }, game)
      }
      case 'cancel':
        return indexCommand(ctx, cmd, (index, at) => {
          const { entry, me } = findPlayerEntry(index, cmd.gameId, actorEmail)
          requireInvitation(entry, me, 0)
          settleInvite(index, entry, at)
          Object.assign(entry, { status: 'cancelled', updatedAt: at })
          notify(index, entry, 1, 'cancelled', actorEmail, at)
          return entry.id
        })
      case 'remind':
        return indexCommand(ctx, cmd, (index, at) => {
          const { entry, me } = findPlayerEntry(index, cmd.gameId, actorEmail)
          if (!PLAYING_STATUSES.includes(entry.status)) fail('MULTIPLAYER_STATE', 'The game is not in progress')
          if (entry.turn === actorEmail) fail('MULTIPLAYER_FORBIDDEN', 'Only the waiting player can send a reminder')
          const last = entry.reminders?.[me]
          if (last && Date.parse(at) - Date.parse(last) < REMIND_INTERVAL_MS) fail('MULTIPLAYER_TOO_SOON', 'A reminder was sent recently')
          entry.reminders = [...(entry.reminders || [null, null])]
          entry.reminders[me] = at
          notify(index, entry, 1 - me, 'reminder', actorEmail, at)
          return entry.id
        })
      case 'acknowledge':
        return indexCommand(ctx, cmd, (index, at) => {
          const targets = cmd.notificationIds.map(id => index.notifications.find(note => note.id === id)).filter(Boolean)
          if (targets.some(note => note.recipientEmail !== actorEmail)) fail('MULTIPLAYER_FORBIDDEN', 'Only the recipient can acknowledge a notification')
          for (const note of targets) note.readAt = note.readAt || at
          return null
        })
    }
  }

  function computeStats(results, directory, known) {
    const stats = new Map()
    for (const record of results) {
      record.players.forEach((playerEmail, seat) => {
        const person = directory.people.find(item => item.email === playerEmail)
        const stat = stats.get(playerEmail) || { email: playerEmail, fullName: person?.fullName ?? known.get(playerEmail)?.name ?? playerEmail, teamCode: person?.teamCode ?? known.get(playerEmail)?.teamCode ?? '', wins: 0, losses: 0, draws: 0, played: 0 }
        stat.wins += record.wins[seat]
        stat.losses += record.wins[1 - seat]
        stat.draws += record.draws
        stat.played += record.wins[0] + record.wins[1] + record.draws
        stats.set(playerEmail, stat)
      })
    }
    return [...stats.values()].sort((a, b) => b.wins - a.wins || a.losses - b.losses || String(a.fullName).localeCompare(String(b.fullName)))
  }

  /** My record against each colleague I have finished a game with, most recent opponent first. */
  function computeRivals(results, directory, me, known) {
    return results.filter(record => record.players.includes(me)).map(record => {
      const seat = record.players.indexOf(me)
      const opponent = record.players[1 - seat]
      const person = directory.people.find(item => item.email === opponent)
      const wins = record.wins[seat], losses = record.wins[1 - seat]
      return {
        email: opponent, fullName: person?.fullName ?? known.get(opponent)?.name ?? opponent, teamCode: person?.teamCode ?? known.get(opponent)?.teamCode ?? '', type: record.type,
        wins, losses, draws: record.draws, played: wins + losses + record.draws, lastPlayedAt: record.lastAt ?? null,
      }
    }).sort((a, b) => String(b.lastPlayedAt ?? '').localeCompare(String(a.lastPlayedAt ?? '')))
  }

  async function snapshot(actor) {
    const ctx = await context(actor)
    const stored = await readIndexShared(await getIndexStore())
    const index = { ...stored, games: withOwnPending(stored.games) }
    const me = ctx.actor.email
    const results = tallyResults(index)
    const known = new Map(index.games.flatMap(entry => entry.players.map(player => [player.email, player])))
    const statsByType = Object.fromEntries(GAME_TYPES.map(type => [type, computeStats(results.filter(record => record.type === type), ctx.directory, known)]))
    const noStats = { email: me, fullName: ctx.actor.fullName, teamCode: ctx.actor.teamCode, wins: 0, losses: 0, draws: 0, played: 0 }
    const myStatsByType = Object.fromEntries(GAME_TYPES.map(type => [type, statsByType[type].find(stat => stat.email === me) || noStats]))
    return {
      actor: { email: me, fullName: ctx.actor.fullName, teamCode: ctx.actor.teamCode },
      games: newestFirst(index.games.filter(entry => entry.players.some(player => player.email === me)), 'updatedAt').map(entry => structuredClone(entry)),
      notifications: newestFirst(index.notifications.filter(note => note.recipientEmail === me), 'createdAt').slice(0, SNAPSHOT_NOTIFICATIONS).map(note => structuredClone(note)),
      people: ctx.directory.people.filter(person => person.email !== me && person.role !== 'creator').map(({ email, fullName, teamCode }) => ({ email, fullName, teamCode })),
      teams: structuredClone(ctx.directory.teams),
      stats: statsByType[GAME_TYPE],
      myStats: myStatsByType[GAME_TYPE],
      statsByType,
      myStatsByType,
      rivals: computeRivals(results, ctx.directory, me, known),
      topWords: readTopWords(index.topWords).map(entry => {
        const person = ctx.directory.people.find(item => item.email === entry.email)
        return {
          word: entry.word, score: entry.score, language: entry.language, at: entry.at, mine: entry.email === me,
          fullName: person?.fullName ?? known.get(entry.email)?.name ?? entry.email.split('@')[0], teamCode: person?.teamCode ?? known.get(entry.email)?.teamCode ?? '',
        }
      }),
    }
  }

  async function game(actor, gameId) {
    const ctx = await context(actor)
    const id = identifier(gameId, 'gameId')
    const indexStore = await getIndexStore()
    const { entry, me } = findPlayerEntry(await readIndexShared(indexStore), id, ctx.actor.email)
    if (['declined', 'cancelled'].includes(entry.status)) fail('MULTIPLAYER_NOT_FOUND', 'The game has not started')
    const found = await readGameFrom(await getGameStore(), id)
    if (!found) fail('MULTIPLAYER_NOT_FOUND', 'The game has not started')
    if (entry.gameRevision >= found.game.revision) return projectGame(found.game, entry, me)
    // An index behind its game file is normally the mover's deferred index write still on its way. Healing it
    // here would queue the opponent behind that write (measured: the move showed only once the index was
    // written) and add a second index write, so the game file is shown at once and healing waits a while.
    if (healGraceMs > 0) {
      scheduleHeal(indexStore, id)
      return projectGame(found.game, entryFromGame(found.game, entry), me)
    }
    return projectGame(found.game, await heal(indexStore, found.game, entry), me)
  }

  const healTimers = new Map()
  function scheduleHeal(store, gameId) {
    if (healTimers.has(gameId)) return
    const timer = setTimeout(async () => {
      healTimers.delete(gameId)
      if (pendingIndexGames.has(gameId)) { scheduleHeal(store, gameId); return }
      try {
        const [found, index] = await Promise.all([readGameFrom(await getGameStore(), gameId), readIndexFrom(store)])
        const entry = index.games.find(item => item.id === gameId)
        if (found && entry && entry.gameRevision < found.game.revision) await heal(store, found.game, entry)
      } catch {
        // Best effort: the next read or command heals it.
      }
    }, healGraceMs)
    timer.unref?.()
    healTimers.set(gameId, timer)
  }

  async function preview(actor, input) {
    const ctx = await context(actor, true)
    const request = normalizePreview(structuredClone(input))
    const { entry, me } = findPlayerEntry(await readIndexShared(await getIndexStore()), request.gameId, ctx.actor.email)
    if (entry.type === CHESS_TYPE || entry.type === BACKGAMMON_TYPE) fail('MULTIPLAYER_INVALID', 'Previews apply to Word-Puzzle only')
    const found = await readGameFrom(await getGameStore(), entry.id)
    if (!found) fail(['invited', 'declined', 'cancelled'].includes(entry.status) ? 'MULTIPLAYER_STATE' : 'MULTIPLAYER_NOT_FOUND', 'The game has not started')
    requireTurn(found.game, me)
    try {
      return { ok: true, ...(await evaluate(found.game, me, request.placements)) }
    } catch (error) {
      if (error.code === 'MULTIPLAYER_INVALID_MOVE') return { ok: false, error: error.detail }
      throw error
    }
  }

  /**
   * For the shared-drive watcher: true when the index holds content no change notice has announced yet (a colleague's
   * write), false when it only shows what this client wrote and already announced. Fails open.
   */
  async function hasUnannouncedChange() {
    await settled()
    invalidateIndex()
    try {
      const print = printOf(await readIndexShared(await getIndexStore(), true))
      if (print === announcedPrint) return false
      announcedPrint = print
      return true
    } catch {
      return true
    }
  }

  /**
   * A cheap change marker for one open game: the game file's mtime and size, no read and no decryption.
   * The opponent's window polls it while waiting, so a move shows as soon as its game file is saved
   * instead of after the deferred index write and the 2 s shared-folder watcher. Membership is checked
   * once per person and game (players never change) and fails closed like game().
   */
  const stampMembers = new Set()
  async function gameStamp(actor, gameId) {
    const ctx = await context(actor)
    const id = identifier(gameId, 'gameId')
    const member = `${ctx.actor.email}\n${id}`
    if (!stampMembers.has(member)) {
      findPlayerEntry(await readIndexShared(await getIndexStore()), id, ctx.actor.email)
      stampMembers.add(member)
    }
    const store = await getGameStore()
    if (typeof store.statAsync !== 'function') return null
    const stats = await store.statAsync(gameKey(id))
    return stats ? `${stats.mtimeMs}:${stats.size}` : null
  }

  return { snapshot, game, gameStamp, preview, command, hasUnannouncedChange, invalidateDirectory, settled }
}

module.exports = { createMultiplayerService, HUBERT_LIMIT, REACTION_EMOJIS, REACTION_COOLDOWN_MS, REACTION_LIMIT }
