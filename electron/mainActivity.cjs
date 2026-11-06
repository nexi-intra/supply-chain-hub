// Holder styr på hvad main-processen er i gang med, så MAIN BLOCKED-loggen kan sige hvad der frøs.
function createActivityTracker({ now = Date.now } = {}) {
  const active = new Map()
  let nextId = 0
  let lastStarted = null
  return {
    begin(label) {
      const id = nextId++
      active.set(id, { label, startedAt: now() })
      lastStarted = label
      return () => { active.delete(id) }
    },
    describe() {
      const at = now()
      const running = [...active.values()].map(entry => `${entry.label} (${Math.round(at - entry.startedAt)} ms)`)
      return `i gang: ${running.length ? running.join(', ') : '–'} · sidst startet: ${lastStarted ?? '–'}`
    },
  }
}

module.exports = { createActivityTracker }
