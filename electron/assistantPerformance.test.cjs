// Coarse performance guard: Hubert must stay fast on a realistic team (hundreds of people, tasks, vacations, guides).
// Bounds are ~5x the measured values (p95 ~50 ms, max ~70 ms at scale 400; best of 3 runs per question) so parallel test load
// cannot make this flaky, yet the O(n^2) name lookups it guards against (p95 380 ms, max 1980 ms) would fail it.
const test = require('node:test')
const assert = require('node:assert/strict')
const { BANK } = require('./assistantTrainingData.cjs')
const { createFixture, NOW } = require('./assistantTrainingBank.cjs')

const SCALE = 400
const SAMPLE = 100
const tokenOf = spec => spec.role === 'manager' ? 'boss' : spec.role === 'creator' ? 'owner' : 'valid'

test('Hubert answers ~100 representative questions quickly on a large team', () => {
  const usable = BANK.filter(([, , , spec]) => !spec.after && !spec.prev && !spec.conv && !spec.parental && !spec.noGames && !spec.view && !spec.injected)
  const step = Math.floor(usable.length / SAMPLE)
  assert.ok(step >= 1, 'the bank must hold enough single-turn questions')
  const picks = Array.from({ length: SAMPLE }, (_, index) => usable[index * step])
  const api = createFixture({ scale: SCALE })
  const run = ([, language, question, spec]) => {
    const started = performance.now()
    try { api.query({ token: tokenOf(spec), question, language }, NOW) } catch { /* refusals throw; they are still timed */ }
    return performance.now() - started
  }
  for (const pick of picks) run(pick) // warm-up: caches and regex compilation, like a running worker
  const times = picks.map(pick => Math.min(run(pick), run(pick), run(pick))).sort((a, b) => a - b)
  const p95 = times[Math.floor(times.length * 0.95)]
  const max = times.at(-1)
  assert.ok(p95 < 250, `p95 ${p95.toFixed(0)} ms is above 250 ms`)
  assert.ok(max < 1000, `slowest answer ${max.toFixed(0)} ms is above 1000 ms`)
})
