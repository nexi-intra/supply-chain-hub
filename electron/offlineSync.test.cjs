const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { createStore } = require('./store.cjs')
const { createResilientStore } = require('./offlineSync.cjs')

test('replay guard preserves a blocked queue without touching network data and can retry safely', t => {
  const local = temporaryLocalStore(t), real = temporaryNetworkStore(t), network = withControllableConnection(real)
  let blocked = true
  const resilient = createResilientStore(network, local, { guardReplay: (_, callback) => {
    if (blocked) throw Object.assign(new Error('ACCOUNT_MIGRATION_PENDING'), { code: 'ACCOUNT_MIGRATION_PENDING' })
    return callback()
  } })
  network.__setConnected(false); resilient.set('synthetic', 'queued'); network.__setConnected(true)
  assert.deepEqual(resilient.retrySyncNow(), { succeeded: 0, failed: 1, remaining: 1 })
  assert.equal(real.get('synthetic'), undefined)
  blocked = false
  assert.deepEqual(resilient.retrySyncNow(), { succeeded: 1, failed: 0, remaining: 0 })
  assert.equal(real.get('synthetic'), 'queued')
})
test('invalidation cancels delayed mirrors of reads as well as writes', async t => {
  const local = temporaryLocalStore(t), real = temporaryNetworkStore(t), resilient = createResilientStore(real, local)
  real.set('synthetic', 'old'); resilient.get('synthetic')
  resilient.invalidate(); local.set('synthetic', 'new')
  await flushMicrotasks()
  assert.equal(local.get('synthetic'), 'new')
})

test('an append that reached the share before an error is not duplicated by retry', (t) => {
  const local = temporaryLocalStore(t)
  const real = temporaryNetworkStore(t)
  let failOnce = true
  const network = fakeNetworkStore({ get: (...args) => real.get(...args), update: (key, operation) => {
    const result = real.update(key, operation)
    if (failOnce) { failOnce = false; throw new Error('ENOTCONN after successful write') }
    return result
  } })
  const resilient = createResilientStore(network, local)
  const item = { id: 'same', text: 'Synthetic message' }
  resilient.update('emails', { op: 'append', items: [item] })
  assert.equal(resilient.getPendingSyncCount(), 1)
  assert.deepEqual(resilient.retrySyncNow(), { succeeded: 1, failed: 0, remaining: 0 })
  assert.deepEqual(real.get('emails', { skipCache: true }), [item])
})

test('a delayed delete mirror cannot delete a newer cached write', async (t) => {
  const local = temporaryLocalStore(t)
  const network = withControllableConnection(temporaryNetworkStore(t))
  local.set('same', 'old')
  const resilient = createResilientStore(network, local)
  resilient.delete('same')
  network.__setConnected(false)
  resilient.set('same', 'new')
  await flushMicrotasks()
  assert.equal(local.get('same'), 'new')
})

test('replayed deletion clears stale local data before going offline again', async (t) => {
  const local = temporaryLocalStore(t)
  const network = withControllableConnection(temporaryNetworkStore(t))
  const resilient = createResilientStore(network, local)
  network.__setConnected(false)
  resilient.set('same', 'temporary')
  resilient.delete('same')
  network.__setConnected(true)
  resilient.retrySyncNow()
  await flushMicrotasks()
  network.__setConnected(false)
  assert.equal(resilient.get('same'), undefined)
})

test('a failed queued operation blocks later operations on the same key, not other keys', (t) => {
  const local = temporaryLocalStore(t)
  let connected = false
  let failing = true
  const applied = []
  const network = fakeNetworkStore({ isConnected: () => connected, set: (key, value) => {
    if (key === 'same' && failing) throw new Error('EACCES')
    applied.push([key, value])
  } })
  const resilient = createResilientStore(network, local)
  resilient.set('same', 'old')
  resilient.set('same', 'new')
  resilient.set('independent', 'okay')
  connected = true
  assert.deepEqual(resilient.retrySyncNow(), { succeeded: 1, failed: 1, remaining: 2 })
  assert.deepEqual(applied, [['independent', 'okay']])
  assert.equal(resilient.get('same'), 'new')
  failing = false
  assert.deepEqual(resilient.retrySyncNow(), { succeeded: 2, failed: 0, remaining: 0 })
  assert.deepEqual(applied.slice(1), [['same', 'old'], ['same', 'new']])
})

test('an online write cannot overtake an older pending write', (t) => {
  const local = temporaryLocalStore(t)
  const network = withControllableConnection(temporaryNetworkStore(t))
  const resilient = createResilientStore(network, local)
  network.__setConnected(false)
  resilient.set('same', 'old')
  network.__setConnected(true)
  resilient.set('same', 'new')
  assert.equal(network.get('same'), undefined)
  assert.equal(resilient.get('same'), 'new')
  assert.equal(resilient.getPendingSyncCount(), 2)
  resilient.retrySyncNow()
  assert.equal(network.get('same', { skipCache: true }), 'new')
})

test('a delayed network mirror cannot replace a newer offline change', async (t) => {
  const local = temporaryLocalStore(t)
  const network = withControllableConnection(temporaryNetworkStore(t))
  network.set('same', 'old')
  const resilient = createResilientStore(network, local)
  resilient.get('same')
  network.__setConnected(false)
  resilient.set('same', 'new')
  await flushMicrotasks()
  assert.equal(local.get('same'), 'new')
})

test('a compare-and-set conflict is never converted into an offline write', (t) => {
  const local = temporaryLocalStore(t)
  const network = temporaryNetworkStore(t)
  network.set('same', 'new')
  local.set('same', 'old')
  const resilient = createResilientStore(network, local)
  assert.throws(() => resilient.update('same', { op: 'compareAndSet', expected: 'old', value: 'mine' }), { code: 'KV_CONFLICT' })
  assert.equal(resilient.getPendingSyncCount(), 0)
  assert.equal(network.get('same', { skipCache: true }), 'new')
})

function temporaryLocalStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tcd-hub-offline-test-'))
  t.after(async () => { await flushMicrotasks(); fs.rmSync(directory, { recursive: true, force: true }) })
  return createStore(directory)
}

function temporaryNetworkStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'tcd-hub-network-test-'))
  t.after(async () => { await flushMicrotasks(); fs.rmSync(directory, { recursive: true, force: true }) })
  return createStore(directory)
}

/** Minimal stub af en netværks-store — lader tests styre isConnected()/fejl helt præcist uden rigtig fil-I/O. */
function fakeNetworkStore(overrides = {}) {
  return {
    get: () => undefined,
    set: () => {},
    delete: () => {},
    keys: () => [],
    update: (key, op) => op.items ?? [],
    watch: () => () => {},
    isConnected: () => true,
    dumpAll: () => ({}),
    dataDir: '/fake/network/dir',
    ...overrides,
  }
}

/**
 * Pakker en RIGTIG store ind, så tests kan styre isConnected() manuelt (via
 * __setConnected), mens get/set/update/delete/keys stadig bruger den rigtige
 * fil-baserede logik — nødvendigt for at teste ægte flettesemantik (fx to
 * klienter der opdaterer samme array samtidigt) uden at vente på watch()'s
 * rigtige 5-sekunders timer.
 */
function withControllableConnection(realStore) {
  let connected = true
  return {
    get: (...args) => realStore.get(...args),
    set: (...args) => realStore.set(...args),
    delete: (...args) => realStore.delete(...args),
    keys: (...args) => realStore.keys(...args),
    update: (...args) => realStore.update(...args),
    watch: (...args) => realStore.watch(...args),
    dumpAll: (...args) => realStore.dumpAll(...args),
    dataDir: realStore.dataDir,
    isConnected: () => connected,
    __setConnected(value) {
      connected = value
    },
  }
}

function flushMicrotasks() {
  return new Promise((resolve) => setImmediate(resolve))
}

test('get() mirrors a successful network read to the local cache', async (t) => {
  const local = temporaryLocalStore(t)
  const network = fakeNetworkStore({ get: () => [{ id: '1' }] })
  const resilient = createResilientStore(network, local)

  assert.deepEqual(resilient.get('projects'), [{ id: '1' }])
  await flushMicrotasks()
  assert.deepEqual(local.get('projects'), [{ id: '1' }])
})

test('get() falls back to local cache when the network read throws', async (t) => {
  const local = temporaryLocalStore(t)
  local.set('users', { a: 1 })
  const network = fakeNetworkStore({
    get: () => { throw new Error('ENOTCONN') },
  })
  const resilient = createResilientStore(network, local)

  assert.deepEqual(resilient.get('users'), { a: 1 })
})

test('get() ignores a misleading "undefined" from the network once isConnected() is false', async (t) => {
  // Simulerer det farligste tilfælde: et fuldt drev-udfald rapporteres som
  // ENOENT (samme kode som "nøglen findes ikke"), så networkStore.get()
  // returnerer undefined UDEN at kaste. isConnected() (sat af watcheren) er
  // den eneste pålidelige kilde til at vide at dette ikke er en reel
  // "findes ikke"-situation.
  const local = temporaryLocalStore(t)
  local.set('guides', [{ id: 'g1' }])
  const network = fakeNetworkStore({
    isConnected: () => false,
    get: () => { throw new Error('should not be called while disconnected') },
  })
  const resilient = createResilientStore(network, local)

  assert.deepEqual(resilient.get('guides'), [{ id: 'g1' }])
})

test('set() mirrors the written value to the local cache when online', async (t) => {
  const local = temporaryLocalStore(t)
  let written
  const network = fakeNetworkStore({ set: (key, value) => { written = value } })
  const resilient = createResilientStore(network, local)

  resilient.set('vacation-entries', [{ id: 'v1' }])
  assert.deepEqual(written, [{ id: 'v1' }])

  await flushMicrotasks()
  assert.deepEqual(local.get('vacation-entries'), [{ id: 'v1' }])
})

test('update() mirrors the resulting array to the local cache when online', async (t) => {
  const local = temporaryLocalStore(t)
  const network = fakeNetworkStore({ update: (_key, op) => op.items })
  const resilient = createResilientStore(network, local)

  const result = resilient.update('notes', { op: 'append', items: [{ id: 'n1' }] })
  assert.deepEqual(result, [{ id: 'n1' }])

  await flushMicrotasks()
  assert.deepEqual(local.get('notes'), [{ id: 'n1' }])
})

test('keys() falls back to local cache when disconnected, hiding the internal queue key', (t) => {
  const local = temporaryLocalStore(t)
  local.set('shift-roles', [{ id: 'r1' }])
  const network = fakeNetworkStore({ isConnected: () => false, keys: () => { throw new Error('should not be called') } })
  const resilient = createResilientStore(network, local)

  resilient.set('emails', [{ id: 'e1' }]) // queues internally — must not leak into keys()
  assert.deepEqual(resilient.keys().sort(), ['emails', 'shift-roles'])
})

test('dataDir and dumpAll delegate to the network store', (t) => {
  const local = temporaryLocalStore(t)
  const network = fakeNetworkStore({ dataDir: '/shared/tcd-hub', dumpAll: () => ({ users: {} }) })
  const resilient = createResilientStore(network, local)

  assert.equal(resilient.dataDir, '/shared/tcd-hub')
  assert.deepEqual(resilient.dumpAll(), { users: {} })
})

// ---------------------------------------------------------------------------
// Fase 3: offline skrive-kø + gensynkronisering
// ---------------------------------------------------------------------------

test('set() applies locally and queues the write when disconnected, without throwing', (t) => {
  const local = temporaryLocalStore(t)
  const network = fakeNetworkStore({ isConnected: () => false, set: () => { throw new Error('should not be called') } })
  const resilient = createResilientStore(network, local)

  resilient.set('projects', [{ id: 'p1' }])

  assert.deepEqual(local.get('projects'), [{ id: 'p1' }])
  assert.equal(resilient.getPendingSyncCount(), 1)
})

test("update() applies locally (via the local store's own merge logic) and queues when disconnected", (t) => {
  const local = temporaryLocalStore(t)
  local.set('vacation-entries', [{ id: 'v1', status: 'pending' }])
  const network = fakeNetworkStore({ isConnected: () => false, update: () => { throw new Error('should not be called') } })
  const resilient = createResilientStore(network, local)

  const result = resilient.update('vacation-entries', { op: 'upsert', items: [{ id: 'v1', status: 'approved' }] })

  assert.equal(result.find((v) => v.id === 'v1').status, 'approved')
  assert.equal(local.get('vacation-entries').find((v) => v.id === 'v1').status, 'approved')
  assert.equal(resilient.getPendingSyncCount(), 1)
})

test('delete() applies locally and queues when disconnected', (t) => {
  const local = temporaryLocalStore(t)
  local.set('notes', [{ id: 'n1' }])
  const network = fakeNetworkStore({ isConnected: () => false, delete: () => { throw new Error('should not be called') } })
  const resilient = createResilientStore(network, local)

  resilient.delete('notes')

  assert.equal(local.get('notes'), undefined)
  assert.equal(resilient.getPendingSyncCount(), 1)
})

test('a network write that throws even though we thought we were connected still queues instead of losing the change', (t) => {
  const local = temporaryLocalStore(t)
  const network = fakeNetworkStore({ isConnected: () => true, set: () => { throw new Error('network gone') } })
  const resilient = createResilientStore(network, local)

  resilient.set('emails', [{ id: 'e1' }])

  assert.deepEqual(local.get('emails'), [{ id: 'e1' }])
  assert.equal(resilient.getPendingSyncCount(), 1)
})

test('retrySyncNow() replays queued operations against the network and clears them on success', (t) => {
  const local = temporaryLocalStore(t)
  let connected = false
  const written = {}
  const network = fakeNetworkStore({
    isConnected: () => connected,
    set: (key, value) => { written[key] = value },
  })
  const resilient = createResilientStore(network, local)

  resilient.set('meal-plan-weeks', [{ week: 1 }])
  assert.equal(resilient.getPendingSyncCount(), 1)

  connected = true
  const result = resilient.retrySyncNow()

  assert.deepEqual(result, { succeeded: 1, failed: 0, remaining: 0 })
  assert.deepEqual(written['meal-plan-weeks'], [{ week: 1 }])
  assert.equal(resilient.getPendingSyncCount(), 0)
})

test('a replay entry that fails for a reason unrelated to connectivity is kept with an incremented attempt count', (t) => {
  const local = temporaryLocalStore(t)
  let connected = false
  const network = fakeNetworkStore({
    isConnected: () => connected,
    update: () => { throw new Error('lås optaget af en anden klient') },
  })
  const resilient = createResilientStore(network, local)
  local.set('emails', [])

  resilient.update('emails', { op: 'append', items: [{ id: 'e1' }] })
  connected = true
  const result = resilient.retrySyncNow()

  assert.deepEqual(result, { succeeded: 0, failed: 1, remaining: 1 })
  assert.equal(resilient.getPendingSyncCount(), 1)
})

test('replay stops without marking remaining items as failed if the connection drops again mid-replay', (t) => {
  const local = temporaryLocalStore(t)
  const network = fakeNetworkStore({ isConnected: () => false })
  const resilient = createResilientStore(network, local)

  resilient.set('a', 1)
  resilient.set('b', 2)
  resilient.set('c', 3)
  assert.equal(resilient.getPendingSyncCount(), 3)

  // Forbindelsen er tilbage lige nok til at nå én post, så forsvinder den igen.
  let processed = 0
  network.isConnected = () => processed === 0
  network.set = () => { processed++ }

  const result = resilient.retrySyncNow()

  assert.equal(result.succeeded, 1)
  assert.equal(result.failed, 0)
  assert.equal(resilient.getPendingSyncCount(), 2)
  const remainingQueue = local.get('__offline-queue__')
  assert.equal(remainingQueue[0].attempts, 0)
})

test('onSyncResult fires with a summary after a successful automatic replay triggered by reconnecting', (t) => {
  const local = temporaryLocalStore(t)
  const results = []
  let connected = false
  const written = {}
  const network = fakeNetworkStore({
    isConnected: () => connected,
    set: (k, v) => { written[k] = v },
  })
  let connectionCallback
  network.watch = (_onChange, onConnectionChange) => { connectionCallback = onConnectionChange; return () => {} }

  const resilient = createResilientStore(network, local, { onSyncResult: (r) => results.push(r) })
  resilient.watch(() => {}, () => {}) // starter frakoblet — ingen ikraft-sætnings-replay endnu (køen er tom)

  resilient.set('categories', ['A']) // køes mens offline
  assert.equal(resilient.getPendingSyncCount(), 1)

  connected = true
  connectionCallback(true) // simulerer at watcheren opdager genoprettet forbindelse

  assert.deepEqual(written.categories, ['A'])
  assert.equal(results.length, 1)
  assert.deepEqual(results[0], { succeeded: 1, failed: 0, remaining: 0 })
})

test('watch() replays a leftover queue from a previous session if already connected at startup', (t) => {
  const local = temporaryLocalStore(t)
  const written = {}
  const network = fakeNetworkStore({ isConnected: () => true, set: (k, v) => { written[k] = v } })
  const resilient = createResilientStore(network, local, { onSyncResult: () => {} })

  // Simulerer en kø der overlevede en app-genstart (skrevet direkte i den lokale store, som queue-nøglen ville være).
  local.set('__offline-queue__', [{ id: 'q1', kind: 'set', key: 'employee-birthdays', value: [{ email: 'a@b.com' }], queuedAt: Date.now(), attempts: 0 }])

  network.watch = () => () => {}
  resilient.watch(() => {}, () => {})

  assert.deepEqual(written['employee-birthdays'], [{ email: 'a@b.com' }])
  assert.equal(resilient.getPendingSyncCount(), 0)
})

test('a concurrent change from another online client on the same array key survives replay (no data loss)', (t) => {
  const local = temporaryLocalStore(t)
  const realNetwork = temporaryNetworkStore(t)
  const controllable = withControllableConnection(realNetwork)
  const resilient = createResilientStore(controllable, local)

  realNetwork.set('vacation-entries', [{ id: 'v1', status: 'pending' }])

  // Vi går "offline" og godkender vores egen anmodning lokalt.
  controllable.__setConnected(false)
  resilient.update('vacation-entries', { op: 'upsert', items: [{ id: 'v1', status: 'approved' }] })
  assert.equal(resilient.getPendingSyncCount(), 1)

  // En ANDEN (online) klient tilføjer samtidig en ny anmodning til det samme array.
  const otherClient = createStore(realNetwork.dataDir)
  otherClient.update('vacation-entries', { op: 'upsert', items: [{ id: 'v2', status: 'pending' }] })

  // Forbindelsen kommer tilbage — afspil køen.
  controllable.__setConnected(true)
  const result = resilient.retrySyncNow()

  assert.deepEqual(result, { succeeded: 1, failed: 0, remaining: 0 })
  const finalState = realNetwork.get('vacation-entries')
  assert.equal(finalState.find((v) => v.id === 'v1').status, 'approved', 'vores offline-godkendelse overlevede')
  assert.equal(finalState.find((v) => v.id === 'v2').status, 'pending', 'den anden klients samtidige tilføjelse overlevede også')
})

