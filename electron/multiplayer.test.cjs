const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const crypto = require('node:crypto')
const { createStore } = require('./store.cjs')
const rules = require('./games/wordPuzzle/rules.cjs')
const chessRules = require('./games/chess/rules.cjs')

const INDEX_KEY = 'multiplayer-index'
const NOW = Date.UTC(2026, 9, 1, 12)
const HOUR = 3600 * 1000
const DAY = 24 * HOUR
const people = [
  { email: 'anna@example.test', fullName: 'Anna Andersen', teamCode: 'SC', role: 'user' },
  { email: 'bo@example.test', fullName: 'Bo Bertelsen', teamCode: 'OPS', role: 'user' },
  { email: 'cara@example.test', fullName: 'Cara Christensen', teamCode: 'OPS', role: 'user' },
  { email: 'lead@example.test', fullName: 'Lena Leader', teamCode: 'SC', role: 'manager' },
  { email: 'creator@example.test', fullName: 'Test Creator', teamCode: 'OPS', role: 'creator' },
]
const teams = [{ folderName: 'SC', name: 'Supply Chain' }, { folderName: 'OPS', name: 'Operations' }]
const actors = Object.fromEntries(people.map(person => [person.email.split('@')[0], {
  email: person.email, role: person.role, home: { folderName: person.teamCode },
}]))
const { anna, bo, cara, lead, creator } = actors
const REVISION_COMMANDS = ['move', 'approve-word', 'pass', 'exchange', 'resign', 'chess-move', 'offer-draw', 'respond-draw', 'bg-move']
const code = value => ({ code: value })
const request = (type, fields = {}) => ({ operationId: crypto.randomUUID(), type, ...fields })
const tiles = (row, col, letters, horizontal = true) => [...letters].map((letter, index) => ({
  row: horizontal ? row : row + index, col: horizontal ? col + index : col, letter, blank: false,
}))

async function fixture(t, options = {}) {
  let implementation
  try { implementation = require('./multiplayer.cjs') } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND' || !error.message.includes("'./multiplayer.cjs'")) throw error
  }
  assert.equal(typeof implementation?.createMultiplayerService, 'function', 'multiplayer service is not implemented')
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-multiplayer-test-'))
  t.after(() => fs.rm(directory, { recursive: true, force: true }))
  const indexStore = createStore(directory)
  const gameStore = createStore(path.join(directory, 'multiplayer'))
  const state = { now: NOW, failIndexWrites: false }
  const checker = {
    known: new Set(['AA']), calls: [], mode: 'ok',
    async check(language, words) {
      this.calls.push({ language, words })
      if (this.mode === 'throw') throw new Error('WORD_CHECK_TIMEOUT')
      return Object.fromEntries(words.map(word => [word, this.mode === 'none' ? null : this.known.has(word)]))
    },
  }
  let counter = 0
  const events = []
  const guardedIndex = {
    getAsync: (...args) => indexStore.getAsync(...args),
    updateAsync: (...args) => {
      if (state.failIndexWrites) throw new Error('INDEX_WRITE_FAILED')
      return indexStore.updateAsync(...args)
    },
    mutateAsync: async (...args) => {
      if (state.failIndexWrites) throw new Error('INDEX_WRITE_FAILED')
      return indexStore.mutateAsync(...args)
    },
  }
  const settings = {
    getIndexStore: () => guardedIndex, getGameStore: () => gameStore, getDirectory: () => structuredClone({ people, teams }),
    wordChecker: checker, now: () => state.now, makeId: () => `id-${++counter}`, randomInt: () => 0,
    onChanged: keys => { events.push(keys) }, ...options,
  }
  const service = implementation.createMultiplayerService(settings)
  const otherIndex = createStore(directory)
  const otherGames = createStore(path.join(directory, 'multiplayer'))
  const other = implementation.createMultiplayerService({ ...settings, getIndexStore: () => otherIndex, getGameStore: () => otherGames, makeId: () => `other-${++counter}` })
  const index = () => indexStore.getAsync(INDEX_KEY, { skipCache: true })
  const game = id => gameStore.getAsync(`game-${id}`, { skipCache: true })
  const patch = async (id, fields) => gameStore.setAsync(`game-${id}`, { ...(await game(id)), ...fields })
  const entry = async id => (await index()).games.find(item => item.id === id)
  const notes = async (email, type) => (await index()).notifications.filter(note => note.recipientEmail === email && (!type || note.type === type))
  const act = async (actor, type, gameId, fields = {}) => service.command(actor, request(type, {
    gameId,
    ...(REVISION_COMMANDS.includes(type) && !Object.hasOwn(fields, 'expectedRevision') ? { expectedRevision: (await game(gameId)).revision } : {}),
    ...fields,
  }))
  const start = async (challenger = anna, opponent = bo, language = 'da') => {
    const challenged = await service.command(challenger, request('challenge', { opponentEmail: opponent.email, language }))
    const accepted = await service.command(opponent, request('respond', { gameId: challenged.entry.id, accept: true }))
    return accepted.entry.id
  }
  return { service, other, indexStore, gameStore, checker, state, events, directory, settings, index, game, patch, entry, notes, act, start }
}

const tick = (f, ms = 1000) => { f.state.now += ms }

test('challenge validates opponent, language, shape and creates an invitation without a game file', async t => {
  const f = await fixture(t)
  const result = await f.service.command(anna, request('challenge', { opponentEmail: ' BO@example.test ', language: 'da' }))
  assert.equal(result.entry.status, 'invited')
  assert.equal(result.entry.type, 'word-puzzle')
  assert.equal(result.entry.gameRevision, 0)
  assert.deepEqual(result.entry.players, [
    { email: anna.email, name: 'Anna Andersen', teamCode: 'SC' }, { email: bo.email, name: 'Bo Bertelsen', teamCode: 'OPS' },
  ])
  assert.equal(result.game, undefined)
  assert.equal(await f.game(result.entry.id), undefined)
  const [invite] = await f.notes(bo.email, 'invite')
  assert.equal(invite.gameId, result.entry.id)
  assert.equal(invite.actorEmail, anna.email)
  assert.equal(invite.readAt, null)
  for (const fields of [
    { opponentEmail: anna.email, language: 'da' }, { opponentEmail: 'nobody@example.test', language: 'da' },
    { opponentEmail: creator.email, language: 'da' }, { opponentEmail: bo.email, language: 'xx' },
    { opponentEmail: bo.email, language: 'da', extra: 1 }, { opponentEmail: 42, language: 'da' }, { language: 'da' },
  ]) await assert.rejects(f.service.command(anna, request('challenge', fields)), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.service.command(anna, { type: 'challenge', opponentEmail: bo.email, language: 'da' }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.service.command(anna, request('unknown', {})), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.service.command(anna, null), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.service.command(creator, request('challenge', { opponentEmail: bo.email, language: 'da' })), code('MULTIPLAYER_FORBIDDEN'))
  await assert.rejects(f.service.command({ ...anna, home: { folderName: 'OPS' } }, request('challenge', { opponentEmail: bo.email, language: 'da' })), code('AUTH_REQUIRED'))
  await assert.rejects(f.service.command({ email: 'ghost@example.test', role: 'user', home: { folderName: 'SC' } }, request('challenge', { opponentEmail: bo.email, language: 'da' })), code('AUTH_REQUIRED'))
  assert.ok(f.events.length > 0)
})

test('at most 20 open games per actor; a declined invitation frees a slot', async t => {
  const f = await fixture(t)
  let first
  for (let i = 0; i < 20; i++) {
    const result = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
    first ||= result.entry.id
  }
  await assert.rejects(f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' })), code('MULTIPLAYER_LIMIT'))
  await f.service.command(bo, request('respond', { gameId: first, accept: false }))
  await f.service.command(anna, request('challenge', { opponentEmail: cara.email, language: 'en' }))
})

test('only the invitee responds; accepting deals 7 + 7 tiles from a full bag and notifies', async t => {
  const f = await fixture(t)
  const { entry } = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  await assert.rejects(f.service.command(anna, request('respond', { gameId: entry.id, accept: true })), code('MULTIPLAYER_FORBIDDEN'))
  await assert.rejects(f.service.command(cara, request('respond', { gameId: entry.id, accept: true })), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.command(bo, request('respond', { gameId: 'missing', accept: true })), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.command(bo, request('respond', { gameId: entry.id, accept: 'yes' })), code('MULTIPLAYER_INVALID'))
  const accepted = await f.service.command(bo, request('respond', { gameId: entry.id, accept: true }))
  const stored = await f.game(entry.id)
  assert.equal(stored.racks[0].length, 7)
  assert.equal(stored.racks[1].length, 7)
  assert.equal(stored.bag.length, 100 - 14)
  assert.equal(stored.board.length, 15)
  assert.ok(stored.board.every(line => line.length === 15 && line.every(cell => cell === null)))
  assert.equal(stored.status, 'active')
  assert.equal(stored.revision, 1)
  assert.equal(accepted.entry.status, 'active')
  assert.equal(accepted.entry.turn, anna.email)
  assert.equal(accepted.entry.gameRevision, 1)
  assert.equal(accepted.game.me, 1)
  assert.equal(accepted.game.rack.length, 7)
  assert.equal((await f.notes(anna.email, 'accepted')).length, 1)
  assert.equal((await f.notes(anna.email, 'turn')).length, 1)
  await assert.rejects(f.service.command(bo, request('respond', { gameId: entry.id, accept: true })), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.service.command(anna, request('cancel', { gameId: entry.id })), code('MULTIPLAYER_STATE'))
})

test('when the invitee starts only the accepted notification is sent and the turn is theirs', async t => {
  const f = await fixture(t, { randomInt: max => (max === 2 ? 1 : 0) })
  const id = await f.start()
  assert.equal((await f.entry(id)).turn, bo.email)
  assert.equal((await f.game(id)).turn, 1)
  assert.equal((await f.notes(anna.email, 'turn')).length, 0)
  assert.equal((await f.notes(anna.email, 'accepted')).length, 1)
})

test('decline and cancel end an invitation and notify the other player', async t => {
  const f = await fixture(t)
  const declined = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  const result = await f.service.command(bo, request('respond', { gameId: declined, accept: false }))
  assert.equal(result.entry.status, 'declined')
  assert.equal((await f.notes(anna.email, 'declined')).length, 1)
  assert.equal(await f.game(declined), undefined)
  await assert.rejects(f.service.command(bo, request('respond', { gameId: declined, accept: true })), code('MULTIPLAYER_STATE'))
  const withdrawn = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  await assert.rejects(f.service.command(bo, request('cancel', { gameId: withdrawn })), code('MULTIPLAYER_FORBIDDEN'))
  const cancelled = await f.service.command(anna, request('cancel', { gameId: withdrawn }))
  assert.equal(cancelled.entry.status, 'cancelled')
  assert.equal((await f.notes(bo.email, 'cancelled')).length, 1)
  await assert.rejects(f.service.command(bo, request('respond', { gameId: withdrawn, accept: true })), code('MULTIPLAYER_STATE'))
})

test('answering or withdrawing an invitation marks the invite notification read so the bell clears it', async t => {
  const f = await fixture(t)
  const ids = []
  for (let i = 0; i < 3; i++) ids.push((await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id)
  assert.ok((await f.notes(bo.email, 'invite')).every(note => note.readAt === null))
  await f.service.command(bo, request('respond', { gameId: ids[0], accept: true }))
  await f.service.command(bo, request('respond', { gameId: ids[1], accept: false }))
  const invites = await f.notes(bo.email, 'invite')
  const byGame = id => invites.find(note => note.gameId === id)
  assert.notEqual(byGame(ids[0]).readAt, null, 'accepted')
  assert.notEqual(byGame(ids[1]).readAt, null, 'declined')
  assert.equal(byGame(ids[2]).readAt, null, 'still pending')
  await f.service.command(anna, request('cancel', { gameId: ids[2] }))
  assert.notEqual((await f.notes(bo.email, 'invite')).find(note => note.gameId === ids[2]).readAt, null, 'withdrawn')
})

test('only the player on turn moves and a stale revision is a conflict', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const revision = (await f.game(id)).revision
  await assert.rejects(f.act(bo, 'move', id, { placements: tiles(7, 7, 'AA') }), code('MULTIPLAYER_NOT_YOUR_TURN'))
  await assert.rejects(f.act(cara, 'move', id, { placements: tiles(7, 7, 'AA') }), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.act(anna, 'move', id, { placements: tiles(7, 7, 'AA'), expectedRevision: revision + 5 }), code('MULTIPLAYER_CONFLICT'))
  await assert.rejects(f.act(anna, 'pass', id, { expectedRevision: 0 }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(bo, 'pass', id), code('MULTIPLAYER_NOT_YOUR_TURN'))
  assert.equal((await f.game(id)).revision, revision)
})

test('invalid placements report the rules error code and malformed input is rejected', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const detail = async placements => {
    try { await f.act(anna, 'move', id, { placements }) } catch (error) { assert.equal(error.code, 'MULTIPLAYER_INVALID_MOVE'); return error.detail }
    assert.fail('Expected the move to be rejected')
  }
  assert.equal(await detail(tiles(3, 3, 'AA')), 'MUST_COVER_CENTER')
  assert.equal(await detail([{ row: 7, col: 7, letter: 'A', blank: false }, { row: 8, col: 8, letter: 'A', blank: false }]), 'NOT_IN_LINE')
  assert.equal(await detail(tiles(7, 7, 'A')), 'FIRST_MOVE_TOO_SHORT')
  assert.equal(await detail([{ row: 7, col: 7, letter: 'A', blank: false }, { row: 7, col: 9, letter: 'A', blank: false }]), 'GAP')
  assert.equal(await detail(tiles(7, 7, 'ZZ')), 'TILES_NOT_IN_RACK')
  assert.equal(await detail([{ row: 7, col: 7, letter: 'a', blank: false }, { row: 7, col: 8, letter: 'A', blank: false }]), 'INVALID_LETTER')
  assert.equal(await detail([{ row: 7, col: 7, letter: 'A', blank: false }, { row: 7, col: 20, letter: 'A', blank: false }]), 'OUT_OF_BOUNDS')
  assert.equal(await detail([{ row: 7, col: 7, letter: 'A', blank: false }, { row: 7, col: 7, letter: 'A', blank: false }]), 'DUPLICATE_SQUARE')
  for (const placements of [[], tiles(7, 7, 'AAAAAAAA'), 'AA', [null], [{ row: 7, col: 7 }], [{ row: '7', col: 7, letter: 'A' }], [{ row: 7, col: 7, letter: 'A', blank: 'no' }], [{ row: 7, col: 7, letter: 'A', blank: false, extra: 1 }], [{ row: 7.5, col: 7, letter: 'A' }]]) {
    await assert.rejects(f.act(anna, 'move', id, { placements }), code('MULTIPLAYER_INVALID'))
  }
  await assert.rejects(f.act(anna, 'move', id, { placements: tiles(7, 7, 'AA'), extra: true }), code('MULTIPLAYER_INVALID'))
  assert.equal((await f.game(id)).revision, 1)
})

test('a move with only known words is applied, scored, refilled and handed over', async t => {
  const f = await fixture(t)
  const id = await f.start()
  tick(f)
  const placements = tiles(7, 7, 'AA')
  const result = await f.act(anna, 'move', id, { placements })
  const expected = rules.scoreMove(rules.emptyBoard(), placements, 'da')
  const stored = await f.game(id)
  assert.deepEqual(f.checker.calls.at(-1), { language: 'da', words: ['AA'] })
  assert.deepEqual(stored.board[7].slice(7, 9), [{ letter: 'A', blank: false }, { letter: 'A', blank: false }])
  assert.equal(stored.scores[0], expected.total)
  assert.ok(expected.total > 0)
  assert.equal(stored.racks[0].length, 7)
  assert.equal(stored.bag.length, 100 - 14 - 2)
  assert.equal(stored.turn, 1)
  assert.equal(stored.revision, 2)
  assert.equal(stored.consecutiveScoreless, 0)
  assert.equal(stored.moves.length, 1)
  assert.equal(stored.moves[0].by, 0)
  assert.equal(stored.moves[0].kind, 'play')
  assert.equal(stored.moves[0].score, expected.total)
  assert.deepEqual(stored.moves[0].words, [{ word: 'AA', score: expected.total }])
  assert.equal(stored.history.at(-1).type, 'move')
  assert.equal(stored.history.at(-1).actorEmail, anna.email)
  assert.equal(result.entry.turn, bo.email)
  assert.deepEqual(result.entry.scores, [expected.total, 0])
  assert.equal(result.entry.gameRevision, 2)
  assert.equal(result.game.revision, 2)
  assert.equal((await f.notes(bo.email, 'turn')).length, 1)
  await assert.rejects(f.act(anna, 'move', id, { placements: tiles(8, 7, 'AA') }), code('MULTIPLAYER_NOT_YOUR_TURN'))
})

test('every played word goes into the shared Top 10; replays add nothing and the snapshot hides game ids', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.patch(id, { racks: [['A', 'A', 'A', 'B', 'C', 'D', 'E'], ['A', 'A', 'F', 'G', 'H', 'I', 'J']] })
  tick(f)
  const first = request('move', { gameId: id, expectedRevision: (await f.game(id)).revision, placements: tiles(7, 7, 'AA') })
  await f.service.command(anna, first)
  await f.service.command(anna, first)
  tick(f)
  await f.act(bo, 'move', id, { placements: tiles(8, 7, 'AA') })
  const stored = await f.game(id)
  const { topWords } = await f.index()
  assert.deepEqual(topWords.map(({ word, score, email, language }) => ({ word, score, email, language })), [
    { word: stored.moves[1].words[0].word, score: stored.moves[1].score, email: bo.email, language: 'da' },
    { word: 'AA', score: stored.moves[0].score, email: anna.email, language: 'da' },
  ])
  assert.ok(stored.moves[1].score > stored.moves[0].score)
  const seen = await f.service.snapshot(cara)
  assert.deepEqual(seen.topWords.map(({ fullName, teamCode, mine }) => ({ fullName, teamCode, mine })), [
    { fullName: 'Bo Bertelsen', teamCode: 'OPS', mine: false }, { fullName: 'Anna Andersen', teamCode: 'SC', mine: false },
  ])
  assert.ok(seen.topWords.every(entry => !('id' in entry) && !('email' in entry)))
  assert.equal((await f.service.snapshot(anna)).topWords[1].mine, true)
})

test('an unknown word enters the Top 10 only once the opponent approves it', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.patch(id, { racks: [['A', 'A', 'A', 'B', 'C', 'D', 'E'], ['A', 'A', 'F', 'G', 'H', 'I', 'J']] })
  await f.act(anna, 'move', id, { placements: tiles(7, 7, 'AAA') })
  assert.equal((await f.index()).topWords, undefined)
  await f.act(bo, 'approve-word', id, { accept: true })
  assert.deepEqual((await f.index()).topWords.map(entry => [entry.word, entry.email]), [['AAA', anna.email]])
})

test('a word whose index write failed still reaches the Top 10 when the game heals (retry or the opponent opening the game)', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.patch(id, { racks: [['A', 'A', 'A', 'B', 'C', 'D', 'E'], ['A', 'A', 'F', 'G', 'H', 'I', 'J']] })
  const move = request('move', { gameId: id, expectedRevision: (await f.game(id)).revision, placements: tiles(7, 7, 'AA') })
  f.state.failIndexWrites = true
  await assert.rejects(f.service.command(anna, move), /INDEX_WRITE_FAILED/)
  f.state.failIndexWrites = false
  assert.equal((await f.index()).topWords, undefined)
  await f.service.command(anna, move)
  assert.deepEqual((await f.index()).topWords.map(entry => [entry.word, entry.email]), [['AA', anna.email]])

  tick(f)
  f.state.failIndexWrites = true
  await assert.rejects(f.act(bo, 'move', id, { placements: tiles(8, 7, 'AA') }), /INDEX_WRITE_FAILED/)
  f.state.failIndexWrites = false
  await f.service.game(anna, id)
  assert.equal((await f.index()).topWords.length, 2)
  assert.equal((await f.service.snapshot(cara)).topWords.length, 2)
})

test('an unknown word waits for the opponent: approve applies the move, reject returns it', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const placements = tiles(7, 7, 'AAA')
  const before = await f.game(id)
  const result = await f.act(anna, 'move', id, { placements })
  const waiting = await f.game(id)
  assert.equal(waiting.status, 'awaiting-approval')
  assert.deepEqual(waiting.board, before.board)
  assert.deepEqual(waiting.racks, before.racks)
  assert.equal(waiting.pending.by, 0)
  assert.deepEqual(waiting.pending.words.map(({ word, known }) => [word, known]), [['AAA', false]])
  assert.equal(waiting.pending.total, rules.scoreMove(rules.emptyBoard(), placements, 'da').total)
  assert.equal(result.entry.status, 'awaiting-approval')
  assert.equal(result.entry.turn, bo.email)
  assert.equal(result.game.pending.total, waiting.pending.total)
  assert.equal((await f.notes(bo.email, 'approve-word')).length, 1)
  await assert.rejects(f.act(anna, 'approve-word', id, { accept: true }), code('MULTIPLAYER_FORBIDDEN'))
  await assert.rejects(f.act(bo, 'move', id, { placements: tiles(8, 7, 'AA') }), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.act(bo, 'approve-word', id, { accept: true, expectedRevision: 1 }), code('MULTIPLAYER_CONFLICT'))
  assert.equal((await f.service.game(bo, id)).pending.placements.length, 3)

  const rejected = await f.act(bo, 'approve-word', id, { accept: false })
  const afterReject = await f.game(id)
  assert.equal(afterReject.status, 'active')
  assert.equal(afterReject.pending, null)
  assert.equal(afterReject.turn, 0)
  assert.deepEqual(afterReject.racks, before.racks)
  assert.equal(rejected.entry.turn, anna.email)
  assert.equal((await f.notes(anna.email, 'word-rejected')).length, 1)
  await assert.rejects(f.act(bo, 'approve-word', id, { accept: true }), code('MULTIPLAYER_STATE'))

  await f.act(anna, 'move', id, { placements })
  const approved = await f.act(bo, 'approve-word', id, { accept: true })
  const afterApprove = await f.game(id)
  assert.equal(afterApprove.status, 'active')
  assert.equal(afterApprove.pending, null)
  assert.deepEqual(afterApprove.board[7].slice(7, 10).map(cell => cell.letter), ['A', 'A', 'A'])
  assert.equal(afterApprove.scores[0], waiting.pending.total)
  assert.equal(afterApprove.racks[0].length, 7)
  assert.equal(afterApprove.turn, 1)
  assert.equal(approved.entry.turn, bo.email)
  assert.equal((await f.notes(anna.email, 'word-approved')).length, 1)
  assert.equal((await f.notes(bo.email, 'turn')).length, 0)
})

test('a word checker that throws or has no list is treated as unknown', async t => {
  for (const mode of ['throw', 'none']) {
    const f = await fixture(t)
    f.checker.mode = mode
    const id = await f.start()
    await f.act(anna, 'move', id, { placements: tiles(7, 7, 'AA') })
    const stored = await f.game(id)
    assert.equal(stored.status, 'awaiting-approval')
    assert.deepEqual(stored.pending.words.map(word => word.known), [null])
  }
})

test('pass, exchange and resign', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const passed = await f.act(anna, 'pass', id)
  let stored = await f.game(id)
  assert.equal(stored.consecutiveScoreless, 1)
  assert.equal(stored.turn, 1)
  assert.equal(stored.moves[0].kind, 'pass')
  assert.equal(passed.entry.turn, bo.email)
  assert.equal((await f.notes(bo.email, 'turn')).length, 1)

  await assert.rejects(f.act(bo, 'exchange', id, { letters: ['Z'] }), error => error.code === 'MULTIPLAYER_INVALID_MOVE' && error.detail === 'TILES_NOT_IN_RACK')
  await assert.rejects(f.act(bo, 'exchange', id, { letters: [] }), code('MULTIPLAYER_INVALID'))
  const letters = stored.racks[1].slice(0, 2)
  const bagBefore = [...stored.bag].sort()
  await f.act(bo, 'exchange', id, { letters })
  stored = await f.game(id)
  assert.equal(stored.racks[1].length, 7)
  assert.equal(stored.bag.length, bagBefore.length)
  assert.equal(stored.consecutiveScoreless, 2)
  assert.deepEqual(stored.moves.at(-1), { by: 1, kind: 'exchange', score: 0, count: 2, at: stored.moves.at(-1).at })
  assert.equal(stored.turn, 0)

  await f.patch(id, { bag: ['A', 'B', 'C'] })
  await assert.rejects(f.act(anna, 'exchange', id, { letters: [(await f.game(id)).racks[0][0]] }), error => error.detail === 'BAG_TOO_SMALL')

  const resigned = await f.act(anna, 'resign', id)
  stored = await f.game(id)
  assert.equal(stored.status, 'finished')
  assert.equal(stored.winner, 1)
  assert.equal(stored.finishedReason, 'resigned')
  assert.equal(resigned.entry.winner, bo.email)
  assert.equal(resigned.entry.finishedReason, 'resigned')
  assert.equal(resigned.entry.turn, null)
  assert.equal((await f.notes(bo.email, 'finished')).length, 1)
  await assert.rejects(f.act(bo, 'pass', id), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.act(anna, 'resign', id), code('MULTIPLAYER_STATE'))
})

test('a player may resign while a word waits for approval', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.act(anna, 'move', id, { placements: tiles(7, 7, 'AAA') })
  await f.act(bo, 'resign', id)
  const stored = await f.game(id)
  assert.equal(stored.status, 'finished')
  assert.equal(stored.winner, 0)
})

test('six scoreless turns end the game with rack penalties', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const racks = (await f.game(id)).racks
  const players = [anna, bo]
  for (let i = 0; i < 6; i++) await f.act(players[i % 2], 'pass', id)
  const stored = await f.game(id)
  const expected = rules.finalScores({ 0: 0, 1: 0 }, { 0: racks[0], 1: racks[1] }, 'da')
  assert.equal(stored.status, 'finished')
  assert.equal(stored.finishedReason, 'scoreless')
  assert.deepEqual(stored.scores, [expected.scores[0], expected.scores[1]])
  assert.equal(stored.winner, expected.winner === 'draw' ? 'draw' : Number(expected.winner))
  const projected = await f.service.game(anna, id)
  assert.equal(projected.winner, expected.winner === 'draw' ? 'draw' : [anna.email, bo.email][Number(expected.winner)])
  assert.equal((await f.notes(anna.email, 'finished')).length, 1)
  assert.equal((await f.notes(bo.email, 'finished')).length, 1)
})

test('emptying the rack with an empty bag ends the game with final scores', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.patch(id, { bag: [], racks: [['A', 'A'], ['B', 'C']] })
  const result = await f.act(anna, 'move', id, { placements: tiles(7, 7, 'AA') })
  const total = rules.scoreMove(rules.emptyBoard(), tiles(7, 7, 'AA'), 'da').total
  const expected = rules.finalScores({ 0: total, 1: 0 }, { 0: [], 1: ['B', 'C'] }, 'da')
  const stored = await f.game(id)
  assert.equal(stored.status, 'finished')
  assert.equal(stored.finishedReason, 'out-of-tiles')
  assert.deepEqual(stored.scores, [expected.scores[0], expected.scores[1]])
  assert.equal(result.entry.winner, anna.email)
  assert.deepEqual(result.entry.scores, stored.scores)
  assert.equal((await f.notes(anna.email, 'finished')).length, 1)
  assert.equal((await f.notes(bo.email, 'finished')).length, 1)
})

test('rack and bag stay secret in every projection', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.patch(id, { racks: [['Æ', 'Ø', 'Å', 'X', 'Y', 'V', 'Q'], ['A', 'A', 'B', 'C', 'D', 'E', 'F']], bag: ['J', 'K', 'L', 'Ö'] })
  const mine = await f.service.game(anna, id)
  const theirs = await f.service.game(bo, id)
  assert.deepEqual(mine.rack, ['Æ', 'Ø', 'Å', 'X', 'Y', 'V', 'Q'])
  assert.deepEqual(theirs.rack, ['A', 'A', 'B', 'C', 'D', 'E', 'F'])
  assert.equal(mine.me, 0)
  assert.equal(theirs.me, 1)
  assert.equal(mine.opponentRackCount, 7)
  assert.equal(mine.bagCount, 4)
  const json = JSON.stringify(theirs)
  for (const letter of ['Æ', 'Ø', 'Å', 'X', 'Y', 'V', 'Q', 'J', 'K', 'L', 'Ö']) assert.ok(!json.includes(letter), letter)
  for (const projection of [mine, theirs]) assert.ok(!/"bag"|"racks"/.test(JSON.stringify(projection)))
  const snapshot = JSON.stringify(await f.service.snapshot(bo))
  assert.ok(!snapshot.includes('Æ') && !/"bag"|"racks"|"rack"/.test(snapshot))
  await assert.rejects(f.service.game(cara, id), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.game(anna, 'missing'), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.game(anna, ''), code('MULTIPLAYER_INVALID'))
})

test('preview scores without writing and only for the player on turn', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const indexBefore = JSON.stringify(await f.index())
  const gameBefore = JSON.stringify(await f.game(id))
  const placements = tiles(7, 7, 'AA')
  const total = rules.scoreMove(rules.emptyBoard(), placements, 'da').total
  assert.deepEqual(await f.service.preview(anna, { gameId: id, placements }), { ok: true, words: [{ word: 'AA', score: total, known: true }], total, bingo: false })
  assert.deepEqual((await f.service.preview(anna, { gameId: id, placements: tiles(7, 7, 'AAA') })).words.map(word => word.known), [false])
  assert.deepEqual(await f.service.preview(anna, { gameId: id, placements: tiles(3, 3, 'AA') }), { ok: false, error: 'MUST_COVER_CENTER' })
  assert.deepEqual(await f.service.preview(anna, { gameId: id, placements: tiles(7, 7, 'ZZ') }), { ok: false, error: 'TILES_NOT_IN_RACK' })
  f.checker.mode = 'throw'
  assert.deepEqual((await f.service.preview(anna, { gameId: id, placements })).words.map(word => word.known), [null])
  await assert.rejects(f.service.preview(bo, { gameId: id, placements }), code('MULTIPLAYER_NOT_YOUR_TURN'))
  await assert.rejects(f.service.preview(cara, { gameId: id, placements }), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.preview(anna, { gameId: id, placements, extra: 1 }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.service.preview(anna, { gameId: id, placements: [] }), code('MULTIPLAYER_INVALID'))
  assert.equal(JSON.stringify(await f.index()), indexBefore)
  assert.equal(JSON.stringify(await f.game(id)), gameBefore)
})

test('snapshot lists own games newest first, people without the creator and stats over all games', async t => {
  const f = await fixture(t)
  const first = await f.start(anna, bo)
  tick(f)
  const second = await f.start(anna, cara)
  tick(f)
  const third = await f.start(bo, cara)
  await f.act(bo, 'resign', first)
  tick(f)
  await f.act(anna, 'resign', second)
  tick(f)
  await f.patch(third, { racks: [['A'], ['A']] })
  const players = [bo, cara]
  for (let i = 0; i < 6; i++) await f.act(players[i % 2], 'pass', third)
  assert.equal((await f.game(third)).winner, 'draw')

  const snapshot = await f.service.snapshot(anna)
  assert.deepEqual(snapshot.actor, { email: anna.email, fullName: 'Anna Andersen', teamCode: 'SC' })
  assert.deepEqual(snapshot.games.map(game => game.id), [second, first])
  assert.deepEqual(snapshot.people.map(person => person.email).sort(), [bo.email, cara.email, lead.email])
  assert.deepEqual(snapshot.people.find(person => person.email === bo.email), { email: bo.email, fullName: 'Bo Bertelsen', teamCode: 'OPS' })
  assert.deepEqual(snapshot.teams, teams)
  assert.deepEqual(snapshot.stats.map(({ email, wins, losses, draws, played }) => [email, wins, losses, draws, played]), [
    [cara.email, 1, 0, 1, 2], [anna.email, 1, 1, 0, 2], [bo.email, 0, 1, 1, 2],
  ])
  assert.deepEqual(snapshot.myStats, { email: anna.email, fullName: 'Anna Andersen', teamCode: 'SC', wins: 1, losses: 1, draws: 0, played: 2 })
  assert.deepEqual(snapshot.rivals.map(({ email, wins, losses, draws, played, type }) => [email, wins, losses, draws, played, type]), [
    [cara.email, 0, 1, 0, 1, 'word-puzzle'], [bo.email, 1, 0, 0, 1, 'word-puzzle'],
  ])
  assert.equal(snapshot.rivals[0].fullName, 'Cara Christensen')
  assert.deepEqual((await f.service.snapshot(cara)).rivals.map(({ email, wins, losses, draws }) => [email, wins, losses, draws]).sort(), [
    [anna.email, 1, 0, 0], [bo.email, 0, 0, 1],
  ].sort())
  const nobody = await f.service.snapshot(lead)
  assert.deepEqual(nobody.games, [])
  assert.deepEqual(nobody.myStats, { email: lead.email, fullName: 'Lena Leader', teamCode: 'SC', wins: 0, losses: 0, draws: 0, played: 0 })
  assert.ok(!(await f.service.snapshot(anna)).people.some(person => person.email === creator.email))
  const notifications = (await f.service.snapshot(bo)).notifications
  assert.ok(notifications.length > 0)
  assert.ok(notifications.every(note => note.recipientEmail === bo.email))
  assert.deepEqual(notifications.map(note => note.createdAt), [...notifications.map(note => note.createdAt)].sort().reverse())
})

test('remind is limited to the waiting player once per 12 hours', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await assert.rejects(f.service.command(anna, request('remind', { gameId: id })), code('MULTIPLAYER_FORBIDDEN'))
  await assert.rejects(f.service.command(cara, request('remind', { gameId: id })), code('MULTIPLAYER_NOT_FOUND'))
  const reminded = await f.service.command(bo, request('remind', { gameId: id }))
  assert.equal(reminded.entry.reminders[1], new Date(NOW).toISOString())
  assert.equal(reminded.entry.reminders[0], null)
  assert.equal((await f.notes(anna.email, 'reminder')).length, 1)
  tick(f, 12 * HOUR - 1)
  await assert.rejects(f.service.command(bo, request('remind', { gameId: id })), code('MULTIPLAYER_TOO_SOON'))
  tick(f, 1)
  await f.service.command(bo, request('remind', { gameId: id }))
  assert.equal((await f.notes(anna.email, 'reminder')).length, 2)
  await f.act(anna, 'resign', id)
  await assert.rejects(f.service.command(bo, request('remind', { gameId: id })), code('MULTIPLAYER_STATE'))
  const invited = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  await assert.rejects(f.service.command(bo, request('remind', { gameId: invited })), code('MULTIPLAYER_STATE'))
})

test('the waiting player can remind while a word awaits approval', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.act(anna, 'move', id, { placements: tiles(7, 7, 'AAA') })
  await assert.rejects(f.service.command(bo, request('remind', { gameId: id })), code('MULTIPLAYER_FORBIDDEN'))
  await f.service.command(anna, request('remind', { gameId: id }))
  assert.equal((await f.notes(bo.email, 'reminder')).length, 1)
})

test('chat validates text, bumps the revision, coalesces unread notifications and keeps the newest 200', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const invited = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  await assert.rejects(f.service.command(anna, request('chat', { gameId: invited, text: 'hello' })), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.service.command(cara, request('chat', { gameId: id, text: 'hello' })), code('MULTIPLAYER_NOT_FOUND'))
  for (const text of ['', '   ', 'x'.repeat(501), 'bell\u0007', 'null\u0000', 'two\nlines', 5]) {
    await assert.rejects(f.service.command(anna, request('chat', { gameId: id, text })), code('MULTIPLAYER_INVALID'))
  }
  await f.service.command(anna, request('chat', { gameId: id, text: 'x'.repeat(500) }))
  tick(f)
  const first = await f.service.command(anna, request('chat', { gameId: id, text: '  Godt spil  ' }))
  assert.equal(first.game.chat.at(-1).text, 'Godt spil')
  assert.equal(first.game.chat.at(-1).by, 0)
  assert.equal(first.game.revision, 3)
  const unread = await f.notes(bo.email, 'chat')
  assert.equal(unread.length, 1)
  assert.equal(unread[0].createdAt, new Date(f.state.now).toISOString())
  await f.service.command(bo, request('acknowledge', { notificationIds: [unread[0].id] }))
  await f.service.command(anna, request('chat', { gameId: id, text: 'Igen' }))
  assert.equal((await f.notes(bo.email, 'chat')).length, 2)
  await assert.rejects(f.act(anna, 'pass', id, { expectedRevision: 3 }), code('MULTIPLAYER_CONFLICT'))

  await f.patch(id, { chat: Array.from({ length: 199 }, (_, i) => ({ id: `c${i}`, by: 0, text: `m${i}`, at: new Date(NOW).toISOString() })) })
  for (const text of ['a', 'b', 'c']) await f.service.command(bo, request('chat', { gameId: id, text }))
  const chat = (await f.game(id)).chat
  assert.equal(chat.length, 200)
  assert.equal(chat[0].id, 'c2')
  assert.equal(chat.at(-1).text, 'c')
  await f.act(anna, 'resign', id)
  await f.service.command(anna, request('chat', { gameId: id, text: 'Tak for kampen' }))
})

test('feeding Hubert: 10 treats and 2 bones per player, shared with the opponent, no revision bump', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const { HUBERT_LIMIT } = require('./multiplayer.cjs')
  assert.deepEqual({ ...HUBERT_LIMIT }, { treat: 10, bone: 2 })
  assert.deepEqual((await f.service.game(anna, id)).hubert, { treats: [0, 0], bones: [0, 0], last: null })
  const revision = (await f.game(id)).revision
  const updatedAt = (await f.game(id)).updatedAt
  const before = f.events.length

  tick(f)
  const fed = await f.service.command(anna, request('hubert', { gameId: id, kind: 'treat' }))
  assert.deepEqual(fed.game.hubert.treats, [1, 0])
  assert.deepEqual(fed.game.hubert.last, { id: fed.game.hubert.last.id, by: 0, kind: 'treat', at: new Date(f.state.now).toISOString() })
  assert.equal(fed.game.revision, revision)
  const stored = await f.game(id)
  assert.equal(stored.revision, revision)
  assert.equal(stored.updatedAt, updatedAt)
  assert.equal(stored.history.at(-1).type, 'hubert')
  assert.ok(f.events.length > before, 'the change is broadcast')
  assert.equal((await f.entry(id)).hubertAt, new Date(f.state.now).toISOString())
  assert.equal((await f.entry(id)).gameRevision, revision)
  assert.equal((await f.index()).notifications.filter(note => !['invite', 'accepted', 'turn'].includes(note.type)).length, 0)
  // the opponent sees it in their own projection
  assert.deepEqual((await f.service.game(bo, id)).hubert.last.by, 0)

  // a move made with the revision read before the treat still goes through
  await f.act(anna, 'pass', id, { expectedRevision: revision })
  assert.equal((await f.game(id)).revision, revision + 1)

  for (let i = 1; i < 10; i++) await f.service.command(anna, request('hubert', { gameId: id, kind: 'treat' }))
  await assert.rejects(f.service.command(anna, request('hubert', { gameId: id, kind: 'treat' })), code('MULTIPLAYER_HUBERT_LIMIT'))
  await f.service.command(anna, request('hubert', { gameId: id, kind: 'bone' }))
  await f.service.command(anna, request('hubert', { gameId: id, kind: 'bone' }))
  await assert.rejects(f.service.command(anna, request('hubert', { gameId: id, kind: 'bone' })), code('MULTIPLAYER_HUBERT_LIMIT'))

  // the other player's allowance is their own
  const theirs = await f.service.command(bo, request('hubert', { gameId: id, kind: 'bone' }))
  assert.deepEqual(theirs.game.hubert, { treats: [10, 0], bones: [2, 1], last: theirs.game.hubert.last })
  assert.equal(theirs.game.hubert.last.by, 1)
  assert.equal(theirs.game.hubert.last.kind, 'bone')
  assert.equal((await f.game(id)).revision, revision + 1)

  // Hubert can still have a treat after the last move
  await f.act(bo, 'resign', id)
  await f.service.command(bo, request('hubert', { gameId: id, kind: 'treat' }))
})

test('feeding Hubert is idempotent, players only and validated', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const payload = request('hubert', { gameId: id, kind: 'bone' })
  const first = await f.service.command(anna, payload)
  const replay = await f.service.command(anna, payload)
  assert.deepEqual(replay.game.hubert, first.game.hubert)
  assert.deepEqual((await f.game(id)).hubert.bones, [1, 0])
  await assert.rejects(f.service.command(anna, { ...payload, kind: 'treat' }), code('MULTIPLAYER_OPERATION_CONFLICT'))
  await assert.rejects(f.service.command(bo, payload), code('MULTIPLAYER_OPERATION_CONFLICT'))

  await assert.rejects(f.service.command(cara, request('hubert', { gameId: id, kind: 'treat' })), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.command(creator, request('hubert', { gameId: id, kind: 'treat' })), code('MULTIPLAYER_FORBIDDEN'))
  for (const fields of [{ gameId: id, kind: 'steak' }, { gameId: id }, { gameId: id, kind: 'treat', expectedRevision: 1 }]) {
    await assert.rejects(f.service.command(anna, request('hubert', fields)), code('MULTIPLAYER_INVALID'))
  }
  const invited = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  await assert.rejects(f.service.command(anna, request('hubert', { gameId: invited, kind: 'treat' })), code('MULTIPLAYER_STATE'))
  await f.service.command(bo, request('respond', { gameId: invited, accept: false }))
  await assert.rejects(f.service.command(anna, request('hubert', { gameId: invited, kind: 'treat' })), code('MULTIPLAYER_STATE'))
  const withdrawn = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  await f.service.command(anna, request('cancel', { gameId: withdrawn }))
  await assert.rejects(f.service.command(bo, request('hubert', { gameId: withdrawn, kind: 'bone' })), code('MULTIPLAYER_STATE'))
})

test('a game saved before feeding existed counts as nothing given and gains the field on the first treat', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const old = await f.game(id)
  delete old.hubert
  await f.gameStore.setAsync(`game-${id}`, old)
  assert.deepEqual((await f.service.game(bo, id)).hubert, { treats: [0, 0], bones: [0, 0], last: null })
  await f.patch(id, { hubert: { treats: 'x', bones: [1], last: { id: 5 } } })
  assert.deepEqual((await f.service.game(bo, id)).hubert, { treats: [0, 0], bones: [0, 0], last: null })
  const fed = await f.service.command(bo, request('hubert', { gameId: id, kind: 'treat' }))
  assert.deepEqual(fed.game.hubert.treats, [0, 1])
  assert.deepEqual((await f.game(id)).hubert.treats, [0, 1])
})

test('feeding Hubert while the opponent moves: both succeed through compare-and-set retries', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const revision = (await f.game(id)).revision
  await Promise.all([
    f.service.command(anna, request('pass', { gameId: id, expectedRevision: revision })),
    f.other.command(bo, request('hubert', { gameId: id, kind: 'treat' })),
  ])
  const stored = await f.game(id)
  assert.equal(stored.revision, revision + 1)
  assert.equal(stored.moves.at(-1).kind, 'pass')
  assert.deepEqual(stored.hubert.treats, [0, 1])
})

const EMOJIS = ['👏', '🔥', '😂', '😮', '🎉', '😅', '🤔', '🐶']

test('the fixed emoji set is exported and a reaction is validated against it', async t => {
  const { REACTION_EMOJIS } = require('./multiplayer.cjs')
  assert.deepEqual([...REACTION_EMOJIS], EMOJIS)
  const f = await fixture(t)
  const id = await f.start()
  for (const fields of [
    { gameId: id, emoji: '👍' }, { gameId: id, emoji: '' }, { gameId: id, emoji: '👏👏' }, { gameId: id, emoji: ' 👏' }, { gameId: id, emoji: 5 },
    { gameId: id }, { gameId: id, emoji: '👏', expectedRevision: 1 }, { gameId: id, emoji: '👏', text: 'hej' },
  ]) {
    await assert.rejects(f.service.command(anna, request('react', fields)), code('MULTIPLAYER_INVALID'))
  }
  assert.equal((await f.game(id)).reactions, undefined, 'nothing is written for an invalid reaction')
  await assert.rejects(f.service.command(anna, request('react', { emoji: '👏' })), code('MULTIPLAYER_INVALID'))
})

test('reacting is for the two players of a started game and never for the creator', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await assert.rejects(f.service.command(cara, request('react', { gameId: id, emoji: '👏' })), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.command(creator, request('react', { gameId: id, emoji: '👏' })), code('MULTIPLAYER_FORBIDDEN'))
  await assert.rejects(f.service.command(anna, request('react', { gameId: 'missing', emoji: '👏' })), code('MULTIPLAYER_NOT_FOUND'))

  const invited = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  await assert.rejects(f.service.command(anna, request('react', { gameId: invited, emoji: '👏' })), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.service.command(bo, request('react', { gameId: invited, emoji: '👏' })), code('MULTIPLAYER_STATE'))
  await f.service.command(bo, request('respond', { gameId: invited, accept: false }))
  await assert.rejects(f.service.command(anna, request('react', { gameId: invited, emoji: '👏' })), code('MULTIPLAYER_STATE'))
  const withdrawn = (await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))).entry.id
  await f.service.command(anna, request('cancel', { gameId: withdrawn }))
  await assert.rejects(f.service.command(bo, request('react', { gameId: withdrawn, emoji: '👏' })), code('MULTIPLAYER_STATE'))
})

test('a reaction is shared with the opponent but is no move: no revision bump, no notification, a marker on the index entry', async t => {
  const f = await fixture(t)
  const id = await f.start()
  assert.deepEqual((await f.service.game(anna, id)).reactions, [])
  const before = await f.game(id)
  const notes = (await f.index()).notifications.length
  const events = f.events.length

  tick(f)
  const sent = await f.service.command(anna, request('react', { gameId: id, emoji: '🔥' }))
  const at = new Date(f.state.now).toISOString()
  assert.deepEqual(sent.game.reactions, [{ id: sent.game.reactions[0].id, by: 0, emoji: '🔥', at }])
  assert.equal(sent.game.revision, before.revision)
  const stored = await f.game(id)
  assert.equal(stored.revision, before.revision)
  assert.equal(stored.updatedAt, before.updatedAt)
  assert.equal(stored.history.at(-1).type, 'react')
  assert.deepEqual(stored.reactions, sent.game.reactions)
  assert.ok(f.events.length > events, 'the change is broadcast')
  const entry = await f.entry(id)
  assert.equal(entry.reactAt, at)
  assert.equal(entry.gameRevision, before.revision)
  assert.equal(entry.updatedAt, before.updatedAt)
  assert.equal((await f.index()).notifications.length, notes, 'no bell item')
  assert.deepEqual((await f.service.game(bo, id)).reactions, sent.game.reactions)

  tick(f)
  const back = await f.service.command(bo, request('react', { gameId: id, emoji: '🐶' }))
  assert.deepEqual(back.game.reactions.map(item => [item.by, item.emoji]), [[0, '🔥'], [1, '🐶']])
  assert.equal((await f.game(id)).revision, before.revision)
  // a reaction in the middle of a game does not stop the game from being played on
  await f.act(anna, 'pass', id)
  assert.equal((await f.service.game(bo, id)).reactions.length, 2, 'a move keeps the reactions')
})

test('a reaction made at the same moment as a move never turns the move into a conflict', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const revision = (await f.game(id)).revision
  await Promise.all([
    f.service.command(anna, request('pass', { gameId: id, expectedRevision: revision })),
    f.other.command(bo, request('react', { gameId: id, emoji: '😮' })),
  ])
  const stored = await f.game(id)
  assert.equal(stored.revision, revision + 1)
  assert.equal(stored.moves.at(-1).kind, 'pass')
  assert.deepEqual(stored.reactions.map(item => item.emoji), ['😮'])

  // a move made with the revision read before the reaction still goes through
  tick(f, 3000)
  const next = (await f.game(id)).revision
  await f.service.command(bo, request('react', { gameId: id, emoji: '😅' }))
  await f.act(bo, 'pass', id, { expectedRevision: next })

  // both players reacting at once keep both reactions
  tick(f, 4000)
  await Promise.all([
    f.service.command(anna, request('react', { gameId: id, emoji: '👏' })),
    f.other.command(bo, request('react', { gameId: id, emoji: '🎉' })),
  ])
  assert.deepEqual((await f.game(id)).reactions.slice(-2).map(item => item.emoji).sort(), ['🎉', '👏'])
})

test('replaying a reaction is idempotent; the operation id cannot be reused for another reaction or player', async t => {
  const f = await fixture(t)
  const id = await f.start()
  tick(f)
  const payload = request('react', { gameId: id, emoji: '🤔' })
  const first = await f.service.command(anna, payload)
  const events = f.events.length
  tick(f, 10_000)
  const replay = await f.service.command(anna, payload)
  assert.deepEqual(replay.game.reactions, first.game.reactions)
  assert.equal((await f.game(id)).reactions.length, 1)
  assert.equal(f.events.length, events, 'a replay writes nothing')
  await assert.rejects(f.service.command(anna, { ...payload, emoji: '🎉' }), code('MULTIPLAYER_OPERATION_CONFLICT'))
  await assert.rejects(f.service.command(bo, payload), code('MULTIPLAYER_OPERATION_CONFLICT'))
})

test('each player may react once every 3 seconds; the cooldown is per player', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const { REACTION_COOLDOWN_MS } = require('./multiplayer.cjs')
  assert.equal(REACTION_COOLDOWN_MS, 3000)
  tick(f)
  await f.service.command(anna, request('react', { gameId: id, emoji: '👏' }))
  tick(f, 2999)
  await assert.rejects(f.service.command(anna, request('react', { gameId: id, emoji: '👏' })), code('MULTIPLAYER_TOO_SOON'))
  // the opponent has a cooldown of their own
  await f.service.command(bo, request('react', { gameId: id, emoji: '😂' }))
  tick(f, 1)
  await f.service.command(anna, request('react', { gameId: id, emoji: '🔥' }))
  assert.deepEqual((await f.game(id)).reactions.map(item => item.emoji), ['👏', '😂', '🔥'])
  await assert.rejects(f.service.command(bo, request('react', { gameId: id, emoji: '😂' })), code('MULTIPLAYER_TOO_SOON'))
  tick(f, 3000)
  await f.service.command(bo, request('react', { gameId: id, emoji: '😂' }))
  assert.equal((await f.game(id)).reactions.length, 4)
})

test('only the last 20 reactions are kept in the game file', async t => {
  const f = await fixture(t)
  const id = await f.start()
  for (let i = 0; i < 25; i++) {
    tick(f, 3000)
    await f.service.command(i % 2 ? bo : anna, request('react', { gameId: id, emoji: EMOJIS[i % EMOJIS.length] }))
  }
  const stored = (await f.game(id)).reactions
  assert.equal(stored.length, 20)
  assert.deepEqual(stored.map(item => item.emoji), Array.from({ length: 20 }, (_, i) => EMOJIS[(i + 5) % EMOJIS.length]))
  assert.equal(new Set(stored.map(item => item.id)).size, 20)
  assert.equal((await f.service.game(anna, id)).reactions.length, 20)
})

test('reactions work in finished games, in chess, and are in the projection of both game types', async t => {
  const f = await fixture(t)
  const word = await f.start()
  tick(f, 3000)
  await f.service.command(anna, request('react', { gameId: word, emoji: '😅' }))
  const wordGame = await f.service.game(bo, word)
  assert.equal(wordGame.type, 'word-puzzle')
  assert.deepEqual(wordGame.reactions.map(item => [item.by, item.emoji]), [[0, '😅']])
  await f.act(bo, 'resign', word)
  tick(f, 3000)
  const gg = await f.service.command(bo, request('react', { gameId: word, emoji: '🎉' }))
  assert.equal(gg.game.status, 'finished')
  assert.deepEqual(gg.game.reactions.map(item => item.emoji), ['😅', '🎉'])

  const chess = await startChess(f)
  assert.deepEqual((await f.service.game(anna, chess)).reactions, [])
  tick(f, 3000)
  const sent = await f.service.command(bo, request('react', { gameId: chess, emoji: '🤔' }))
  assert.equal(sent.game.type, 'chess')
  assert.deepEqual((await f.service.game(anna, chess)).reactions.map(item => [item.by, item.emoji]), [[1, '🤔']])
  assert.equal((await f.game(chess)).revision, 1)
  await f.act(anna, 'resign', chess)
  tick(f, 3000)
  await f.service.command(anna, request('react', { gameId: chess, emoji: '🐶' }))
  assert.equal((await f.service.game(bo, chess)).reactions.length, 2)
})

test('a game saved before reactions existed has none, and damaged reactions are ignored', async t => {
  const f = await fixture(t)
  const id = await f.start()
  assert.equal((await f.game(id)).reactions, undefined)
  assert.deepEqual((await f.service.game(bo, id)).reactions, [])
  await f.patch(id, { reactions: [{ id: 'x', by: 0, emoji: '👏', at: 'a' }, { id: 5 }, null, { id: 'y', by: 7, emoji: '👏', at: 'a' }, { id: 'z', by: 1, emoji: '💩', at: 'a' }] })
  assert.deepEqual((await f.service.game(bo, id)).reactions, [{ id: 'x', by: 0, emoji: '👏', at: 'a' }])
  await f.patch(id, { reactions: 'x' })
  assert.deepEqual((await f.service.game(bo, id)).reactions, [])
  tick(f)
  assert.equal((await f.service.command(bo, request('react', { gameId: id, emoji: '🔥' }))).game.reactions.length, 1)
})

test('acknowledge only marks the actor\'s own notifications', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await f.act(anna, 'pass', id)
  const [mine] = await f.notes(bo.email, 'turn')
  const [theirs] = await f.notes(anna.email, 'accepted')
  tick(f)
  await assert.rejects(f.service.command(bo, request('acknowledge', { notificationIds: [mine.id, theirs.id] })), code('MULTIPLAYER_FORBIDDEN'))
  assert.equal((await f.notes(bo.email, 'turn'))[0].readAt, null)
  const result = await f.service.command(bo, request('acknowledge', { notificationIds: [mine.id, 'already-pruned'] }))
  assert.equal(result.entry, null)
  assert.equal((await f.notes(bo.email, 'turn'))[0].readAt, new Date(f.state.now).toISOString())
  assert.equal((await f.notes(anna.email, 'accepted'))[0].readAt, null)
  for (const notificationIds of [[], 'id', [1], Array.from({ length: 101 }, (_, i) => `n${i}`), [mine.id, mine.id]]) {
    await assert.rejects(f.service.command(bo, request('acknowledge', { notificationIds })), code('MULTIPLAYER_INVALID'))
  }
})

test('replaying an operation returns the current state without writing; reuse with another payload or actor conflicts', async t => {
  const f = await fixture(t)
  const challenge = request('challenge', { opponentEmail: bo.email, language: 'da' })
  const first = await f.service.command(anna, challenge)
  const replay = await f.service.command(anna, challenge)
  assert.equal(replay.entry.id, first.entry.id)
  assert.equal((await f.index()).games.length, 1)
  assert.equal((await f.notes(bo.email, 'invite')).length, 1)
  await assert.rejects(f.service.command(anna, { ...challenge, language: 'en' }), code('MULTIPLAYER_OPERATION_CONFLICT'))
  await assert.rejects(f.service.command(bo, challenge), code('MULTIPLAYER_OPERATION_CONFLICT'))
  const operations = (await f.index()).operations
  assert.deepEqual(Object.keys(operations[0]).sort(), ['actorEmail', 'fingerprint', 'gameId', 'operationId'])
  assert.match(operations[0].fingerprint, /^[a-f0-9]{64}$/)

  const respond = request('respond', { gameId: first.entry.id, accept: true })
  const accepted = await f.service.command(bo, respond)
  const again = await f.service.command(bo, respond)
  assert.equal(again.game.revision, accepted.game.revision)
  assert.equal((await f.notes(anna.email, 'accepted')).length, 1)

  const id = first.entry.id
  const payload = request('move', { gameId: id, expectedRevision: 1, placements: tiles(7, 7, 'AA') })
  const moved = await f.service.command(anna, payload)
  const moveReplay = await f.service.command(anna, payload)
  assert.equal(moveReplay.game.revision, moved.game.revision)
  assert.equal((await f.game(id)).revision, 2)
  assert.equal((await f.game(id)).moves.length, 1)
  assert.equal((await f.notes(bo.email, 'turn')).length, 1)
  await assert.rejects(f.service.command(anna, { ...payload, placements: tiles(7, 7, 'AAA') }), code('MULTIPLAYER_OPERATION_CONFLICT'))
  await assert.rejects(f.service.command(bo, payload), code('MULTIPLAYER_OPERATION_CONFLICT'))
  const chat = request('chat', { gameId: id, text: 'hej' })
  await f.service.command(anna, chat)
  await f.service.command(anna, chat)
  assert.equal((await f.game(id)).chat.length, 1)
})

test('a crash between the game write and the index write heals on the next read or command', async t => {
  const f = await fixture(t)
  const id = await f.start()
  f.state.failIndexWrites = true
  await assert.rejects(f.act(anna, 'pass', id), /INDEX_WRITE_FAILED/)
  f.state.failIndexWrites = false
  assert.equal((await f.game(id)).revision, 2)
  assert.equal((await f.entry(id)).gameRevision, 1)
  assert.equal((await f.entry(id)).turn, anna.email)
  const projected = await f.service.game(bo, id)
  assert.equal(projected.revision, 2)
  assert.equal((await f.entry(id)).gameRevision, 2)
  assert.equal((await f.entry(id)).turn, bo.email)
  assert.equal((await f.service.snapshot(anna)).games[0].turn, bo.email)

  f.state.failIndexWrites = true
  await assert.rejects(f.act(bo, 'pass', id), /INDEX_WRITE_FAILED/)
  f.state.failIndexWrites = false
  await f.act(anna, 'pass', id)
  assert.equal((await f.game(id)).revision, 4)
  assert.equal((await f.entry(id)).gameRevision, 4)
})

test('deferIndexWrites answers a move once the game file is saved; the index entry and notification follow', async t => {
  const f = await fixture(t)
  const id = await f.start()
  let release
  const gate = new Promise(resolve => { release = resolve })
  const gated = {
    getAsync: (...args) => f.indexStore.getAsync(...args),
    updateAsync: (...args) => f.indexStore.updateAsync(...args),
    mutateAsync: async (...args) => { await gate; return f.indexStore.mutateAsync(...args) },
  }
  const { createMultiplayerService } = require('./multiplayer.cjs')
  const service = createMultiplayerService({ ...f.settings, getIndexStore: () => gated, deferIndexWrites: true })
  const turnsBefore = (await f.notes(bo.email, 'turn')).length

  const result = await service.command(anna, request('pass', { gameId: id, expectedRevision: 1 }))
  assert.equal(result.game.revision, 2)
  assert.equal(result.entry.gameRevision, 2)
  assert.equal(result.entry.turn, bo.email)
  assert.equal((await f.game(id)).revision, 2, 'the game file is saved before the answer')
  assert.equal((await f.entry(id)).gameRevision, 1, 'the index write is still waiting')

  // Reads in the same process wait for the pending write instead of seeing (and healing) a lagging index.
  const snapshot = service.snapshot(anna)
  release()
  assert.equal((await snapshot).games[0].turn, bo.email)
  await service.settled()
  assert.equal((await f.entry(id)).gameRevision, 2)
  assert.equal((await f.notes(bo.email, 'turn')).length, turnsBefore + 1, 'the opponent still gets the bell item')
})

test('deferIndexWrites keeps a move whose index write keeps failing; the index heals after the grace period', async t => {
  const f = await fixture(t, { deferIndexWrites: true, healGraceMs: 50 })
  const id = await f.start()
  f.state.failIndexWrites = true
  const result = await f.act(anna, 'pass', id)
  assert.equal(result.entry.turn, bo.email)
  await f.service.settled()
  f.state.failIndexWrites = false
  assert.equal((await f.game(id)).revision, 2)
  assert.equal((await f.entry(id)).gameRevision, 1)
  assert.equal((await f.service.game(bo, id)).revision, 2, 'the opponent sees the move straight from the game file')
  assert.equal((await f.entry(id)).gameRevision, 1, 'without queueing behind an index write')
  await new Promise(resolve => setTimeout(resolve, 400))
  assert.equal((await f.entry(id)).gameRevision, 2)
  assert.equal((await f.entry(id)).turn, bo.email)
})

test('an opponent reading a game whose index write is still on its way neither waits for it nor writes the index', async t => {
  const f = await fixture(t)
  const id = await f.start()
  let indexWrites = 0
  const counting = {
    getAsync: (...args) => f.indexStore.getAsync(...args),
    updateAsync: (...args) => { indexWrites++; return f.indexStore.updateAsync(...args) },
    mutateAsync: (...args) => { indexWrites++; return f.indexStore.mutateAsync(...args) },
  }
  const { createMultiplayerService } = require('./multiplayer.cjs')
  const opponent = createMultiplayerService({ ...f.settings, getIndexStore: () => counting, deferIndexWrites: true })
  await f.patch(id, { revision: 2, turn: 1 })
  const seen = await opponent.game(bo, id)
  assert.equal(seen.revision, 2)
  assert.equal(indexWrites, 0)
})

test('deferIndexWrites rejects a non-boolean value', () => {
  const { createMultiplayerService } = require('./multiplayer.cjs')
  assert.throws(() => createMultiplayerService({
    getIndexStore: () => null, getGameStore: () => null, getDirectory: () => null, wordChecker: { check: async () => ({}) }, deferIndexWrites: 'yes',
  }), TypeError)
})

test('an accepted game whose index entry is still invited is repaired from the game file', async t => {
  const f = await fixture(t)
  const challenged = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  f.state.failIndexWrites = true
  await assert.rejects(f.service.command(bo, request('respond', { gameId: challenged.entry.id, accept: true })), /INDEX_WRITE_FAILED/)
  f.state.failIndexWrites = false
  assert.equal((await f.entry(challenged.entry.id)).status, 'invited')
  const projected = await f.service.game(anna, challenged.entry.id)
  assert.equal(projected.status, 'active')
  assert.equal((await f.entry(challenged.entry.id)).status, 'active')
  const retried = await f.service.command(bo, request('respond', { gameId: challenged.entry.id, accept: true })).catch(error => error)
  assert.equal(retried.code, 'MULTIPLAYER_STATE')
})

test('concurrent commands from two clients both succeed through compare-and-set retries', async t => {
  const f = await fixture(t)
  const id = await f.start()
  await Promise.all([
    f.service.command(anna, request('chat', { gameId: id, text: 'one' })),
    f.other.command(bo, request('chat', { gameId: id, text: 'two' })),
  ])
  const stored = await f.game(id)
  assert.equal(stored.chat.length, 2)
  assert.equal(stored.revision, 3)
  const entry = await f.entry(id)
  assert.equal(entry.gameRevision, 3)
  assert.equal((await f.index()).notifications.filter(note => note.type === 'chat').length, 2)
})

test('pruning removes old notifications and enforces per-recipient, finished-game and operation caps', async t => {
  const f = await fixture(t)
  const seedEntry = (id, status, updatedAt) => ({
    id, type: 'word-puzzle', language: 'da',
    players: [{ email: lead.email, name: 'Lena Leader', teamCode: 'SC' }, { email: cara.email, name: 'Cara Christensen', teamCode: 'OPS' }],
    status, turn: null, gameRevision: 5, createdAt: updatedAt, updatedAt, scores: [1, 0], winner: lead.email, finishedReason: 'resigned', reminders: [null, null],
  })
  const note = (id, recipientEmail, createdAt, readAt = null) => ({ id, gameId: 'old', recipientEmail, actorEmail: lead.email, type: 'turn', createdAt: new Date(createdAt).toISOString(), readAt })
  const games = Array.from({ length: 505 }, (_, i) => seedEntry(`old-${i}`, ['finished', 'declined', 'cancelled'][i % 3], new Date(NOW - (1000 - i) * 60000).toISOString()))
  games.push(seedEntry('still-open', 'active', new Date(NOW - 9999 * 60000).toISOString()))
  const notifications = [
    note('ancient', bo.email, NOW - 31 * DAY), note('recent', bo.email, NOW - 29 * DAY),
    note('read-long-ago', bo.email, NOW - 9 * DAY, new Date(NOW - 8 * DAY).toISOString()),
    note('read-this-week', bo.email, NOW - 9 * DAY, new Date(NOW - 6 * DAY).toISOString()),
    ...Array.from({ length: 100 }, (_, i) => note(`read-${i}`, cara.email, NOW - (400 - i) * 60000, new Date(NOW).toISOString())),
    ...Array.from({ length: 105 }, (_, i) => note(`unread-${i}`, cara.email, NOW - (200 - i) * 60000)),
  ]
  const operations = Array.from({ length: 1005 }, (_, i) => ({ operationId: `op-${i}`, fingerprint: 'f'.repeat(64), actorEmail: lead.email, gameId: null }))
  await f.indexStore.setAsync(INDEX_KEY, { games, notifications, operations })

  await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  const index = await f.index()
  assert.ok(!index.notifications.some(item => item.id === 'ancient'))
  assert.ok(index.notifications.some(item => item.id === 'recent'))
  // Read notifications are only recent history: dropped a week after they were read, unread ones stay 30 days.
  assert.ok(!index.notifications.some(item => item.id === 'read-long-ago'))
  assert.ok(index.notifications.some(item => item.id === 'read-this-week'))
  const caras = index.notifications.filter(item => item.recipientEmail === cara.email)
  assert.equal(caras.length, 200)
  assert.equal(caras.filter(item => item.readAt === null).length, 105)
  assert.ok(!caras.some(item => item.id === 'read-0') && caras.some(item => item.id === 'read-99'))
  const finished = index.games.filter(game => game.id.startsWith('old-'))
  assert.equal(finished.length, 500)
  assert.ok(!finished.some(game => game.id === 'old-0') && finished.some(game => game.id === 'old-504'))
  assert.ok(index.games.some(game => game.id === 'still-open'))
  // Pruned finished games live on as records, so the scores never shrink.
  const pair = [lead.email, cara.email].sort()
  assert.deepEqual(index.records.map(({ players, wins, draws }) => ({ players, wins, draws })), [{ players: pair, wins: pair.map(email => (email === lead.email ? 2 : 0)), draws: 0 }])
  const leadView = await f.service.snapshot(lead)
  assert.deepEqual(leadView.myStats.wins, 169)
  assert.deepEqual(leadView.rivals.map(({ email, wins, losses }) => [email, wins, losses]), [[cara.email, 169, 0]])
  assert.equal(index.operations.length, 300)
  assert.ok(!index.operations.some(item => item.operationId === 'op-704'))
  assert.ok(index.operations.some(item => item.operationId === 'op-1004'))
  assert.equal(index.operations.at(-1).actorEmail, anna.email)
})

test('storage that is offline surfaces MULTIPLAYER_UNAVAILABLE', async t => {
  const offline = () => { throw new Error('MULTIPLAYER_UNAVAILABLE') }
  const f = await fixture(t, { getIndexStore: offline })
  await assert.rejects(f.service.snapshot(anna), /MULTIPLAYER_UNAVAILABLE/)
  await assert.rejects(f.service.game(anna, 'x'), /MULTIPLAYER_UNAVAILABLE/)
  await assert.rejects(f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' })), /MULTIPLAYER_UNAVAILABLE/)
  await assert.rejects(f.service.preview(anna, { gameId: 'x', placements: tiles(7, 7, 'AA') }), /MULTIPLAYER_UNAVAILABLE/)
  const g = await fixture(t, { getGameStore: offline })
  const challenged = await g.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  await assert.rejects(g.service.command(bo, request('respond', { gameId: challenged.entry.id, accept: true })), /MULTIPLAYER_UNAVAILABLE/)
  await assert.rejects(g.service.game(anna, challenged.entry.id), /MULTIPLAYER_UNAVAILABLE/)
})

test('a failing change notification never fails a command, and the service validates its dependencies', async t => {
  const f = await fixture(t, { onChanged: () => { throw new Error('broadcast failed') } })
  await f.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  const { createMultiplayerService } = require('./multiplayer.cjs')
  assert.throws(() => createMultiplayerService({}), TypeError)
  assert.throws(() => createMultiplayerService({ ...f.settings, wordChecker: {} }), TypeError)
})

// ---------------------------------------------------------------- chess

const startChess = async (f, color = 'white', challenger = anna, opponent = bo) => {
  const challenged = await f.service.command(challenger, request('challenge', { opponentEmail: opponent.email, gameType: 'chess', color }))
  return (await f.service.command(opponent, request('respond', { gameId: challenged.entry.id, accept: true }))).entry.id
}
const chessMove = (f, actor, id, text, fields = {}) => f.act(actor, 'chess-move', id, {
  from: text.slice(0, 2), to: text.slice(2, 4), ...(text[4] ? { promotion: text[4] } : {}), ...fields,
})
const FOOLS_MATE = [['anna', 'f2f3'], ['bo', 'e7e5'], ['anna', 'g2g4'], ['bo', 'd8h4']]
const byName = { anna, bo, cara }
const playAll = async (f, id, moves) => {
  let result
  for (const [who, text] of moves) result = await chessMove(f, byName[who], id, text)
  return result
}

test('a chess challenge carries the game type and the challenger\'s colour; language is ignored', async t => {
  const f = await fixture(t)
  const white = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, gameType: 'chess', color: 'white' }))
  assert.equal(white.entry.type, 'chess')
  assert.equal(white.entry.language, null)
  assert.equal(white.entry.challengerColor, 'white')
  assert.equal(white.entry.whiteIndex, 0)
  assert.deepEqual(white.entry.scores, [0, 0])
  assert.equal(white.game, undefined)
  const black = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, gameType: 'chess', color: 'black' }))
  assert.equal(black.entry.whiteIndex, 1)
  const random = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, gameType: 'chess', language: 'da' }))
  assert.equal(random.entry.challengerColor, 'random')
  assert.equal(random.entry.whiteIndex, null)
  assert.equal(random.entry.language, null)
  const [invite] = await f.notes(bo.email, 'invite')
  assert.equal(invite.gameType, 'chess')
  const wordInvite = await f.service.command(anna, request('challenge', { opponentEmail: cara.email, language: 'da' }))
  assert.equal((await f.notes(cara.email, 'invite')).find(note => note.gameId === wordInvite.entry.id).gameType, 'word-puzzle')
  assert.equal(wordInvite.entry.type, 'word-puzzle')
  for (const fields of [
    { gameType: 'chess', color: 'green' }, { gameType: 'checkers', language: 'da' }, { gameType: 'word-puzzle', language: 'da', color: 'white' },
    { gameType: 'word-puzzle' }, { color: 'white', language: 'da' },
  ]) await assert.rejects(f.service.command(anna, request('challenge', { opponentEmail: bo.email, ...fields })), code('MULTIPLAYER_INVALID'))
  const open = (await f.index()).games.filter(entry => entry.status === 'invited')
  assert.equal(open.length, 4, 'the open-game limit counts every type')
})

test('accepting a chess challenge creates the chess game file with the chosen colours', async t => {
  const f = await fixture(t)
  const id = await startChess(f, 'white')
  const stored = await f.game(id)
  assert.equal(stored.type, 'chess')
  assert.equal(stored.revision, 1)
  assert.equal(stored.status, 'active')
  assert.equal(stored.whiteIndex, 0)
  assert.equal(stored.chess.fen, chessRules.START_FEN)
  assert.equal(stored.drawOffer, null)
  assert.deepEqual([stored.chat, stored.history, stored.winner, stored.finishedReason], [[], [], null, null])
  assert.equal(stored.board, undefined)
  const started = await f.entry(id)
  assert.equal(started.status, 'active')
  assert.equal(started.turn, anna.email)
  assert.equal(started.whiteIndex, 0)
  assert.equal(started.gameRevision, 1)
  assert.equal((await f.notes(anna.email, 'accepted')).length, 1)
  assert.equal((await f.notes(anna.email, 'turn')).length, 1)
  const mine = await f.service.game(anna, id)
  assert.equal(mine.type, 'chess')
  assert.equal(mine.me, 0)
  assert.equal(mine.turn, anna.email)
  assert.equal(mine.chess.myColor, 'white')
  assert.equal(mine.chess.turn, 'w')
  assert.equal(mine.chess.legalMoves.length, 20)
  const theirs = await f.service.game(bo, id)
  assert.equal(theirs.me, 1)
  assert.equal(theirs.chess.myColor, 'black')
  assert.deepEqual(theirs.chess.legalMoves, [])
  assert.deepEqual(Object.keys(mine).sort(), [
    'chat', 'chess', 'createdAt', 'drawOffer', 'finishedReason', 'hubert', 'id', 'me', 'players', 'reactions', 'revision', 'status', 'turn', 'type', 'updatedAt', 'whiteIndex', 'winner',
  ])

  const black = await startChess(f, 'black')
  assert.equal((await f.game(black)).whiteIndex, 1)
  assert.equal((await f.entry(black)).turn, bo.email)
  assert.equal((await f.service.game(bo, black)).chess.legalMoves.length, 20)
  assert.equal((await f.notes(anna.email, 'turn')).length, 1, 'only white is told it is their turn')

  const flipped = await fixture(t, { randomInt: () => 1 })
  assert.equal((await flipped.game(await startChess(flipped, 'random'))).whiteIndex, 1)
  assert.equal((await f.game(await startChess(f, 'random'))).whiteIndex, 0)
})

test('chess moves belong to the player on turn, check revisions and replay idempotently', async t => {
  const f = await fixture(t)
  const id = await startChess(f)
  await assert.rejects(chessMove(f, bo, id, 'e7e5'), code('MULTIPLAYER_NOT_YOUR_TURN'))
  await assert.rejects(chessMove(f, cara, id, 'e2e4'), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(chessMove(f, creator, id, 'e2e4'), code('MULTIPLAYER_FORBIDDEN'))
  await assert.rejects(chessMove(f, anna, id, 'e2e4', { expectedRevision: 9 }), code('MULTIPLAYER_CONFLICT'))
  await assert.rejects(chessMove(f, anna, id, 'e2e5'), { code: 'MULTIPLAYER_INVALID_MOVE', detail: 'ILLEGAL_MOVE' })
  for (const fields of [{ from: 'z9', to: 'e4' }, { from: 'e2', to: 'e4', promotion: 'k' }, { from: 'e2' }, { from: 'e2', to: 'e4', extra: 1 }, { from: 2, to: 'e4' }]) {
    await assert.rejects(f.act(anna, 'chess-move', id, fields), code('MULTIPLAYER_INVALID'))
  }
  await assert.rejects(chessMove(f, anna, id, 'e2e4', { promotion: 'q' }), { code: 'MULTIPLAYER_INVALID_MOVE', detail: 'INVALID_PROMOTION' })
  assert.equal((await f.game(id)).revision, 1, 'rejected moves write nothing')

  const first = request('chess-move', { gameId: id, expectedRevision: 1, from: 'e2', to: 'e4' })
  const played = await f.service.command(anna, first)
  assert.equal(played.game.revision, 2)
  assert.equal(played.game.turn, bo.email)
  assert.equal(played.game.chess.moves[0].san, 'e4')
  assert.equal(played.entry.turn, bo.email)
  assert.equal(played.entry.gameRevision, 2)
  assert.equal((await f.notes(bo.email, 'turn')).length, 1)
  const replay = await f.service.command(anna, first)
  assert.equal(replay.game.revision, 2)
  assert.equal((await f.game(id)).chess.moves.length, 1)
  await assert.rejects(f.service.command(bo, first), code('MULTIPLAYER_OPERATION_CONFLICT'))
  await assert.rejects(f.service.command(anna, { ...first, to: 'e3' }), code('MULTIPLAYER_OPERATION_CONFLICT'))
  await assert.rejects(chessMove(f, anna, id, 'd2d4'), code('MULTIPLAYER_NOT_YOUR_TURN'))
  await assert.rejects(chessMove(f, bo, id, 'e7e5', { expectedRevision: 1 }), code('MULTIPLAYER_CONFLICT'))
  const answer = await chessMove(f, bo, id, 'd7d5')
  assert.equal(answer.game.me, 1)
  assert.equal(answer.game.chess.legalMoves.length, 0)
  assert.equal((await f.notes(anna.email, 'turn')).length, 2)
})

test('a capture is recorded and shown in the projection; promotion needs a piece', async t => {
  const f = await fixture(t)
  const id = await startChess(f)
  await playAll(f, id, [['anna', 'e2e4'], ['bo', 'd7d5']])
  const taken = await chessMove(f, anna, id, 'e4d5')
  assert.equal(taken.game.chess.moves[2].captured, 'p')
  assert.deepEqual(taken.game.chess.captured, { white: ['p'], black: [] })
  assert.deepEqual(taken.game.chess.lastMove, { from: 'e4', to: 'd5' })
  assert.equal((await f.service.game(bo, id)).chess.captured.white[0], 'p')

  const promo = await startChess(f)
  await f.patch(promo, { chess: chessRules.createChessState({ whiteIndex: 0, startFen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' }) })
  await assert.rejects(chessMove(f, anna, promo, 'a7a8'), { code: 'MULTIPLAYER_INVALID_MOVE', detail: 'PROMOTION_REQUIRED' })
  const promoted = await chessMove(f, anna, promo, 'a7a8n')
  assert.equal(promoted.game.chess.moves[0].promotion, 'n')
  assert.match(promoted.game.chess.fen, /^N7\/7k/)
})

test('checkmate finishes the game, names the winner and counts under chess only', async t => {
  const f = await fixture(t)
  const wordGame = await f.start(bo, anna)
  await f.act(bo, 'resign', wordGame)
  const id = await startChess(f)
  await playAll(f, id, FOOLS_MATE.slice(0, 3))
  const mate = await chessMove(f, bo, id, 'd8h4')
  assert.equal(mate.game.status, 'finished')
  assert.equal(mate.game.winner, bo.email)
  assert.equal(mate.game.finishedReason, 'checkmate')
  assert.equal(mate.game.turn, null)
  assert.deepEqual(mate.game.chess.outcome, { over: true, result: 'black', reason: 'checkmate' })
  assert.deepEqual(mate.game.chess.legalMoves, [])
  assert.equal(mate.entry.status, 'finished')
  assert.equal(mate.entry.winner, bo.email)
  assert.deepEqual(mate.entry.scores, [0, 1])
  assert.equal((await f.service.game(anna, id)).chess.checkSquare, 'e1')
  assert.equal((await f.notes(anna.email, 'finished')).length, 1 + 1, 'the resigned word game also notified anna')
  assert.equal((await f.notes(bo.email, 'finished')).length, 1)
  await assert.rejects(chessMove(f, anna, id, 'a2a3'), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.act(anna, 'resign', id), code('MULTIPLAYER_STATE'))

  const view = await f.service.snapshot(bo)
  assert.deepEqual(view.statsByType.chess.map(({ email, wins, losses, draws, played }) => [email, wins, losses, draws, played]), [
    [bo.email, 1, 0, 0, 1], [anna.email, 0, 1, 0, 1],
  ])
  assert.deepEqual(view.statsByType['word-puzzle'].map(({ email, wins, losses }) => [email, wins, losses]), [[anna.email, 1, 0], [bo.email, 0, 1]])
  assert.deepEqual(view.stats, view.statsByType['word-puzzle'])
  assert.deepEqual(view.myStats, view.myStatsByType['word-puzzle'])
  assert.deepEqual([view.myStatsByType.chess.wins, view.myStatsByType.chess.played], [1, 1])
  assert.deepEqual([view.myStatsByType['word-puzzle'].wins, view.myStatsByType['word-puzzle'].losses], [0, 1])
  assert.deepEqual(view.rivals.map(({ email, type, wins, losses }) => [email, type, wins, losses]).sort(), [
    [anna.email, 'chess', 1, 0], [anna.email, 'word-puzzle', 0, 1],
  ])
  const nobody = await f.service.snapshot(cara)
  assert.deepEqual(nobody.myStatsByType.chess, { email: cara.email, fullName: 'Cara Christensen', teamCode: 'OPS', wins: 0, losses: 0, draws: 0, played: 0 })
  assert.deepEqual(view.games.map(entry => entry.type).sort(), ['chess', 'word-puzzle'])
})

test('a drawn chess game counts as a draw for both players', async t => {
  const f = await fixture(t)
  const id = await startChess(f)
  await f.patch(id, { chess: chessRules.createChessState({ whiteIndex: 0, startFen: '7k/8/6K1/5Q2/8/8/8/8 w - - 0 1' }) })
  const stalemate = await chessMove(f, anna, id, 'f5f7')
  assert.equal(stalemate.game.winner, 'draw')
  assert.equal(stalemate.game.finishedReason, 'stalemate')
  assert.deepEqual(stalemate.entry.scores, [0.5, 0.5])
  const view = await f.service.snapshot(anna)
  assert.deepEqual([view.myStatsByType.chess.draws, view.myStatsByType.chess.played, view.myStatsByType.chess.wins], [1, 1, 0])
})

test('draw offers: offer, decline, accept and the implicit decline when the opponent moves', async t => {
  const f = await fixture(t)
  const id = await startChess(f)
  await assert.rejects(f.act(anna, 'respond-draw', id, { accept: true }), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.act(anna, 'respond-draw', id, { accept: 'yes' }), code('MULTIPLAYER_INVALID'))
  const offered = await f.act(anna, 'offer-draw', id)
  assert.deepEqual(Object.keys(offered.game.drawOffer), ['by', 'at'])
  assert.equal(offered.game.drawOffer.by, 0)
  assert.equal(offered.game.revision, 2)
  assert.equal((await f.notes(bo.email, 'draw-offer')).length, 1)
  assert.equal((await f.service.game(bo, id)).drawOffer.by, 0)
  await assert.rejects(f.act(anna, 'offer-draw', id), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.act(bo, 'offer-draw', id), code('MULTIPLAYER_STATE'))
  await assert.rejects(f.act(anna, 'respond-draw', id, { accept: true }), code('MULTIPLAYER_FORBIDDEN'))
  await assert.rejects(f.act(bo, 'respond-draw', id, { accept: true, expectedRevision: 1 }), code('MULTIPLAYER_CONFLICT'))

  const declined = await f.act(bo, 'respond-draw', id, { accept: false })
  assert.equal(declined.game.drawOffer, null)
  assert.equal(declined.game.status, 'active')
  assert.equal((await f.notes(anna.email, 'draw-declined')).length, 1)
  assert.notEqual((await f.notes(bo.email, 'draw-offer'))[0].readAt, null, 'the answered offer clears from the bell')

  await f.act(anna, 'offer-draw', id)
  await chessMove(f, anna, id, 'e2e4')
  assert.notEqual((await f.service.game(bo, id)).drawOffer, null, 'the offerer\'s own move keeps the offer open')
  const moved = await chessMove(f, bo, id, 'e7e5')
  assert.equal(moved.game.drawOffer, null, 'a move by the opponent declines the offer')
  assert.equal((await f.notes(bo.email, 'draw-offer')).every(note => note.readAt !== null), true)

  await f.act(bo, 'offer-draw', id)
  const agreed = await f.act(anna, 'respond-draw', id, { accept: true })
  assert.equal(agreed.game.status, 'finished')
  assert.equal(agreed.game.winner, 'draw')
  assert.equal(agreed.game.finishedReason, 'draw-agreed')
  assert.equal(agreed.game.drawOffer, null)
  assert.deepEqual(agreed.entry.scores, [0.5, 0.5])
  assert.equal((await f.notes(bo.email, 'finished')).length, 1)
  assert.equal((await f.service.snapshot(anna)).myStatsByType.chess.draws, 1)
  await assert.rejects(f.act(anna, 'offer-draw', id), code('MULTIPLAYER_STATE'))
})

test('resigning a chess game gives the opponent the win', async t => {
  const f = await fixture(t)
  const id = await startChess(f, 'black')
  const resigned = await f.act(anna, 'resign', id)
  assert.equal(resigned.game.status, 'finished')
  assert.equal(resigned.game.winner, bo.email)
  assert.equal(resigned.game.finishedReason, 'resigned')
  assert.deepEqual(resigned.entry.scores, [0, 1])
  assert.equal((await f.notes(bo.email, 'finished')).length, 1)
  assert.equal((await f.service.snapshot(bo)).myStatsByType.chess.wins, 1)
  const again = await startChess(f, 'black')
  await f.act(anna, 'offer-draw', again)
  const second = await f.act(bo, 'resign', again)
  assert.equal(second.game.winner, anna.email)
  assert.equal(second.game.drawOffer, null)
})

test('chat, Hubert, reminders and acknowledge work on chess games', async t => {
  const f = await fixture(t)
  const id = await startChess(f)
  const chat = await f.service.command(bo, request('chat', { gameId: id, text: 'Held og lykke' }))
  assert.equal(chat.game.chat[0].text, 'Held og lykke')
  assert.equal(chat.game.revision, 2)
  assert.equal((await f.notes(anna.email, 'chat')).length, 1)
  const fed = await f.service.command(anna, request('hubert', { gameId: id, kind: 'treat' }))
  assert.equal(fed.game.hubert.treats[0], 1)
  assert.equal(fed.game.type, 'chess')
  assert.equal((await f.game(id)).revision, 2, 'feeding Hubert never bumps the revision')
  const reminded = await f.service.command(bo, request('remind', { gameId: id }))
  assert.equal(reminded.entry.reminders[1] !== null, true)
  assert.equal((await f.notes(anna.email, 'reminder')).length, 1)
  await assert.rejects(f.service.command(anna, request('remind', { gameId: id })), code('MULTIPLAYER_FORBIDDEN'))
  const ids = (await f.notes(anna.email)).map(note => note.id)
  await f.service.command(anna, request('acknowledge', { notificationIds: ids }))
  assert.ok((await f.notes(anna.email)).every(note => note.readAt !== null))
})

test('Word-Puzzle and chess commands and previews stay on their own game type', async t => {
  const f = await fixture(t)
  const chess = await startChess(f)
  const word = await f.start(anna, cara)
  await assert.rejects(f.service.preview(anna, { gameId: chess, placements: tiles(7, 7, 'AA') }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(anna, 'pass', chess), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(anna, 'exchange', chess, { letters: ['A'] }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(anna, 'move', chess, { placements: tiles(7, 7, 'AA') }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(anna, 'approve-word', chess, { accept: true }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(chessMove(f, anna, word, 'e2e4'), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(anna, 'offer-draw', word), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(cara, 'respond-draw', word, { accept: true }), code('MULTIPLAYER_INVALID'))
  const projected = await f.service.game(anna, word)
  assert.equal(projected.type, 'word-puzzle')
  assert.equal(projected.rack.length, 7)
  assert.equal((await f.entry(word)).type, 'word-puzzle')
  assert.equal((await f.service.snapshot(anna)).games.length, 2)
})

test('a chess game file saved with an invalid shape is rejected as invalid data', async t => {
  const f = await fixture(t)
  const id = await startChess(f)
  await f.patch(id, { chess: { fen: 'x' } })
  await assert.rejects(f.service.game(anna, id), code('MULTIPLAYER_INVALID_DATA'))
})

// ---------------------------------------------------------------- caches and change announcements

const { createMultiplayerService } = require('./multiplayer.cjs')

function cachedService(f, { people: list = people, ...options } = {}) {
  const clock = { now: 1_000_000 }
  const reads = { directory: 0, index: 0 }
  const store = {
    getAsync: (key, ...rest) => { if (key === INDEX_KEY) reads.index++; return f.indexStore.getAsync(key, ...rest) },
    updateAsync: (...args) => f.indexStore.updateAsync(...args),
  }
  const service = createMultiplayerService({
    ...f.settings, getIndexStore: () => store, cacheNow: () => clock.now,
    getDirectory: () => { reads.directory++; return structuredClone({ people: list, teams }) },
    ...options,
  })
  return { service, clock, reads, people: list }
}

test('the people directory is read once per TTL window, again after it, after invalidation and when a person is missing from it', async t => {
  const f = await fixture(t)
  const c = cachedService(f, { directoryTtlMs: 30000 })
  await c.service.snapshot(anna)
  await c.service.snapshot(bo)
  await c.service.game(anna, 'missing').catch(() => {})
  assert.equal(c.reads.directory, 1)
  c.clock.now += 29999
  await c.service.snapshot(anna)
  assert.equal(c.reads.directory, 1)
  c.clock.now += 1
  await c.service.snapshot(anna)
  assert.equal(c.reads.directory, 2)
  c.service.invalidateDirectory()
  await c.service.snapshot(anna)
  assert.equal(c.reads.directory, 3)

  // A person who joined after the directory was cached is found by one extra read, not refused.
  const list = people.slice(0, 2)
  const late = cachedService(f, { directoryTtlMs: 30000, people: list })
  await late.service.snapshot(anna)
  list.push(people[2])
  assert.equal((await late.service.snapshot(cara)).actor.email, cara.email)
  assert.equal(late.reads.directory, 2)
  // Somebody who really is not there is still refused.
  await assert.rejects(late.service.snapshot({ email: 'ghost@example.test', role: 'user', home: { folderName: 'SC' } }), code('AUTH_REQUIRED'))

  // A challenge always sees the current directory, so a new colleague can be invited at once.
  const before = late.reads.directory
  list.push(people[3])
  const challenged = await late.service.command(anna, request('challenge', { opponentEmail: lead.email, language: 'da' }))
  assert.equal(challenged.entry.players[1].email, lead.email)
  assert.equal(late.reads.directory, before + 1)
})

test('without a TTL the directory is read on every call, as before', async t => {
  const f = await fixture(t)
  const c = cachedService(f)
  await c.service.snapshot(anna)
  await c.service.snapshot(anna)
  assert.equal(c.reads.directory, 2)
})

test('read-only calls within the share window use one read of the index; a write clears it', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const c = cachedService(f, { indexShareMs: 300 })
  await Promise.all([c.service.snapshot(anna), c.service.game(anna, id), c.service.snapshot(bo)])
  assert.equal(c.reads.index, 1, 'a burst shares one read, in flight and after')
  await c.service.snapshot(anna)
  assert.equal(c.reads.index, 1)
  c.clock.now += 300
  await c.service.snapshot(anna)
  assert.equal(c.reads.index, 2)

  const readsBefore = c.reads.index
  await c.service.command(anna, request('challenge', { opponentEmail: cara.email, language: 'da' }))
  const afterCommand = c.reads.index
  assert.ok(afterCommand > readsBefore, 'commands read the index themselves')
  const games = (await c.service.snapshot(anna)).games
  assert.equal(games.length, 2, 'the snapshot right after our own write shows it')
  assert.ok(c.reads.index > afterCommand)

  // Commands never use the shared read: two commands, two index reads at least.
  const beforeCommands = c.reads.index
  await c.service.command(anna, request('challenge', { opponentEmail: lead.email, language: 'da' }))
  await c.service.command(anna, request('challenge', { opponentEmail: lead.email, language: 'en' }))
  assert.ok(c.reads.index - beforeCommands >= 2)
})

test('a failed shared read is not cached', async t => {
  const f = await fixture(t)
  const c = cachedService(f, { indexShareMs: 300 })
  let fail = true
  const flaky = {
    getAsync: (...args) => { if (fail) { fail = false; return Promise.reject(new Error('MULTIPLAYER_UNAVAILABLE')) } return f.indexStore.getAsync(...args) },
    updateAsync: (...args) => f.indexStore.updateAsync(...args),
  }
  const service = createMultiplayerService({ ...f.settings, getIndexStore: () => flaky, indexShareMs: 300, cacheNow: () => c.clock.now })
  await assert.rejects(service.snapshot(anna), /MULTIPLAYER_UNAVAILABLE/)
  assert.deepEqual((await service.snapshot(anna)).games, [])
})

test('the watcher check announces a colleague\'s write once and stays quiet about what this client wrote', async t => {
  const f = await fixture(t)
  const c = cachedService(f, { indexShareMs: 300 })
  assert.equal(await c.service.hasUnannouncedChange(), true, 'nothing has been announced yet')
  assert.equal(await c.service.hasUnannouncedChange(), false)

  await c.service.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  assert.equal(await c.service.hasUnannouncedChange(), false, 'our own write was announced when it was made')
  assert.ok(f.events.length > 0)

  await f.other.command(bo, request('challenge', { opponentEmail: cara.email, language: 'da' }))
  assert.equal(await c.service.hasUnannouncedChange(), true, 'a colleague\'s write is new')
  assert.equal(await c.service.hasUnannouncedChange(), false, 'and announced only once')

  // Our write on top of a colleague's: only the final content matters.
  await f.other.command(bo, request('challenge', { opponentEmail: lead.email, language: 'da' }))
  await c.service.command(anna, request('challenge', { opponentEmail: cara.email, language: 'en' }))
  assert.equal(await c.service.hasUnannouncedChange(), false)
  await f.other.command(cara, request('challenge', { opponentEmail: bo.email, language: 'en' }))
  assert.equal(await c.service.hasUnannouncedChange(), true)
})

test('the watcher check clears the shared index read so the next snapshot sees the colleague\'s write', async t => {
  const f = await fixture(t)
  const c = cachedService(f, { indexShareMs: 300 })
  assert.equal((await c.service.snapshot(bo)).games.length, 0)
  await f.other.command(anna, request('challenge', { opponentEmail: bo.email, language: 'da' }))
  assert.equal((await c.service.snapshot(bo)).games.length, 0, 'inside the window the cached read is served')
  assert.equal(await c.service.hasUnannouncedChange(), true)
  assert.equal((await c.service.snapshot(bo)).games.length, 1)
})

test('the watcher check fails open when the index cannot be read', async t => {
  const f = await fixture(t)
  const service = createMultiplayerService({ ...f.settings, getIndexStore: () => { throw new Error('MULTIPLAYER_UNAVAILABLE') } })
  assert.equal(await service.hasUnannouncedChange(), true)
  assert.throws(() => createMultiplayerService({ ...f.settings, directoryTtlMs: 'soon' }), TypeError)
  assert.throws(() => createMultiplayerService({ ...f.settings, indexShareMs: NaN }), TypeError)
  assert.throws(() => createMultiplayerService({ ...f.settings, cacheNow: 5 }), TypeError)
})

// ---------------------------------------------------------------- backgammon

const bgRules = require('./games/backgammon/rules.cjs')
/** randomInt answering from a queue of die faces (1..6) and coin flips, then 0. */
const dice = (...faces) => {
  const queue = [...faces]
  return max => (queue.length ? (max === 6 ? queue.shift() - 1 : queue.shift()) : 0)
}
const startBackgammon = async (f, color = 'white') => {
  const challenged = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, gameType: 'backgammon', color }))
  return (await f.service.command(bo, request('respond', { gameId: challenged.entry.id, accept: true }))).entry.id
}
const bgMove = (f, actor, id, steps, fields = {}) => f.act(actor, 'bg-move', id, { steps, ...fields })

test('a backgammon challenge starts a game with the opening roll; the higher die moves first', async t => {
  const f = await fixture(t, { randomInt: dice(3, 1) })
  const challenged = await f.service.command(anna, request('challenge', { opponentEmail: bo.email, gameType: 'backgammon', color: 'white' }))
  assert.equal(challenged.entry.type, 'backgammon')
  assert.equal(challenged.entry.language, null)
  assert.equal(challenged.entry.whiteIndex, 0)
  const accepted = await f.service.command(bo, request('respond', { gameId: challenged.entry.id, accept: true }))
  const id = accepted.entry.id
  const stored = await f.game(id)
  assert.equal(stored.type, 'backgammon')
  assert.ok(bgRules.isState(stored.bg))
  assert.deepEqual(stored.bg.opening, { white: 3, black: 1 })
  assert.equal(accepted.entry.turn, anna.email)
  assert.deepEqual(accepted.entry.scores, [0, 0])
  const mine = await f.service.game(anna, id)
  assert.equal(mine.type, 'backgammon')
  assert.equal(mine.bg.myColor, 'white')
  assert.deepEqual(mine.bg.dice, [3, 1])
  assert.equal(mine.bg.required, 2)
  const theirs = await f.service.game(bo, id)
  assert.equal(theirs.bg.myColor, 'black')
  assert.equal(theirs.bg.required, 0)
  assert.equal((await f.notes(anna.email, 'turn')).length, 1)
  await assert.rejects(f.service.command(anna, request('challenge', { opponentEmail: bo.email, gameType: 'backgammon', color: 'green' })), code('MULTIPLAYER_INVALID'))
})

test('backgammon turns: only the player on turn, legal and complete, replay-safe; the server rolls for the opponent', async t => {
  const f = await fixture(t, { randomInt: dice(3, 1, 6, 2) })
  const id = await startBackgammon(f)
  const steps = [{ from: 8, to: 5, die: 3 }, { from: 6, to: 5, die: 1 }]
  await assert.rejects(bgMove(f, bo, id, steps), code('MULTIPLAYER_NOT_YOUR_TURN'))
  await assert.rejects(bgMove(f, anna, id, [{ from: 8, to: 4, die: 4 }]), { code: 'MULTIPLAYER_INVALID_MOVE', detail: 'ILLEGAL_MOVE' })
  await assert.rejects(bgMove(f, anna, id, steps.slice(0, 1)), { code: 'MULTIPLAYER_INVALID_MOVE', detail: 'INCOMPLETE_TURN' })
  for (const bad of [[{ from: 0, to: 5, die: 3 }], [{ from: 8, to: 5, die: 3, extra: 1 }], [{ from: 8, to: 'home', die: 3 }], 'x', [1, 2, 3, 4, 5]]) {
    await assert.rejects(f.act(anna, 'bg-move', id, { steps: bad }), code('MULTIPLAYER_INVALID'))
  }
  await assert.rejects(bgMove(f, anna, id, steps, { expectedRevision: 9 }), code('MULTIPLAYER_CONFLICT'))
  const move = request('bg-move', { gameId: id, expectedRevision: 1, steps })
  const played = await f.service.command(anna, move)
  assert.equal(played.game.revision, 2)
  assert.equal(played.entry.turn, bo.email)
  assert.deepEqual(played.game.bg.dice, [6, 2])
  assert.equal(played.game.bg.points[4], 2)
  assert.deepEqual(played.game.bg.lastTurn, { by: 'white', dice: [3, 1], steps })
  await f.service.command(anna, move)
  assert.equal((await f.game(id)).revision, 2)
  assert.equal((await f.notes(bo.email, 'turn')).length, 1)
  assert.equal((await f.service.game(bo, id)).bg.required, 2)
  await assert.rejects(f.act(anna, 'chess-move', id, { from: 'e2', to: 'e4' }), code('MULTIPLAYER_INVALID'))
  await assert.rejects(f.act(anna, 'pass', id), code('MULTIPLAYER_INVALID'))
})

test('bearing off the last checker wins the backgammon game, counts a gammon and shows up in the backgammon stats', async t => {
  const f = await fixture(t, { randomInt: dice(3, 1) })
  const id = await startBackgammon(f)
  const points = new Array(24).fill(0)
  points[0] = 1
  points[18] = -15
  await f.patch(id, { bg: { ...(await f.game(id)).bg, points, off: { white: 14, black: 0 }, dice: [2, 1], turn: 'white' } })
  const won = await bgMove(f, anna, id, [{ from: 1, to: 'off', die: 2 }])
  assert.equal(won.game.status, 'finished')
  assert.equal(won.game.winner, anna.email)
  assert.equal(won.game.finishedReason, 'bore-off')
  assert.equal(won.game.winPoints, 2)
  assert.deepEqual(won.entry.scores, [15, 0])
  assert.equal(won.entry.winPoints, 2)
  assert.equal(won.entry.turn, null)
  assert.equal((await f.notes(bo.email, 'finished')).length, 1)
  const view = await f.service.snapshot(anna)
  assert.deepEqual([view.myStatsByType.backgammon.wins, view.myStatsByType.backgammon.played], [1, 1])
  assert.equal(view.myStatsByType.chess.played, 0)
  await assert.rejects(bgMove(f, bo, id, []), code('MULTIPLAYER_STATE'))
})

test('resigning a backgammon game gives the opponent a single win; chat and reactions work', async t => {
  const f = await fixture(t, { randomInt: dice(3, 1) })
  const id = await startBackgammon(f, 'black')
  assert.equal((await f.game(id)).whiteIndex, 1)
  await f.act(bo, 'chat', id, { text: 'Held og lykke' })
  await f.service.command(anna, request('react', { gameId: id, emoji: '🎉' }))
  const resigned = await f.act(anna, 'resign', id)
  assert.equal(resigned.game.winner, bo.email)
  assert.equal(resigned.game.winPoints, 1)
  assert.equal(resigned.game.finishedReason, 'resigned')
  const seen = await f.service.game(bo, id)
  assert.deepEqual(seen.chat.map(item => item.text), ['Held og lykke'])
  assert.deepEqual(seen.reactions.map(item => item.emoji), ['🎉'])
  assert.equal((await f.service.snapshot(bo)).myStatsByType.backgammon.wins, 1)
})

test('gameStamp is a cheap change marker of the game file, for the players only', async t => {
  const f = await fixture(t)
  const id = await f.start()
  const first = await f.service.gameStamp(anna, id)
  assert.match(first, /^\d+(\.\d+)?:\d+$/)
  assert.equal(await f.service.gameStamp(bo, id), first, 'both players see the same marker')
  await new Promise(resolve => setTimeout(resolve, 20))
  await f.act(anna, 'pass', id)
  const after = await f.service.gameStamp(bo, id)
  assert.notEqual(after, first, 'the opponent sees the move as soon as the game file changes')
  await assert.rejects(f.service.gameStamp(cara, id), code('MULTIPLAYER_NOT_FOUND'))
  await assert.rejects(f.service.gameStamp(anna, '../escape'), code('MULTIPLAYER_INVALID'))
  const invited = (await f.service.command(anna, request('challenge', { opponentEmail: cara.email, language: 'da' }))).entry.id
  assert.equal(await f.service.gameStamp(cara, invited), null, 'no game file before the invitation is accepted')
})
