// Holder styr på hvad main-processen er i gang med, så MAIN BLOCKED-loggen kan sige hvad der frøs.
function createActivityTracker({ now = Date.now } = {}) {
  const active = new Map()
  let nextId = 0
  let lastStarted = null
  const idleWaiters = new Set()
  const notifyIdleWaiters = () => { for (const check of [...idleWaiters]) check() }
  const isBusy = predicate => [...active.values()].some(entry => { try { return predicate(entry.label) } catch { return false } })
  return {
    begin(label) {
      const id = nextId++
      active.set(id, { label, startedAt: now() })
      lastStarted = label
      return () => { if (active.delete(id)) notifyIdleWaiters() }
    },
    // Synchronous check, for the window's close event (which must decide at once whether to stay open).
    isBusy,
    // Lukning: vent til intet matchende arbejde er i gang (også arbejde startet undervejs). Afviser aldrig.
    whenIdle(predicate, timeoutMs) {
      return new Promise(resolve => {
        const busy = () => isBusy(predicate)
        if (!busy()) { resolve(true); return }
        let timer = null
        const finish = value => {
          idleWaiters.delete(check)
          if (timer) clearTimeout(timer)
          resolve(value)
        }
        const check = () => { if (!busy()) finish(true) }
        idleWaiters.add(check)
        timer = setTimeout(() => finish(false), Math.max(0, timeoutMs))
        timer.unref?.()
      })
    },
    describe() {
      const at = now()
      const running = [...active.values()].map(entry => `${entry.label} (${Math.round(at - entry.startedAt)} ms)`)
      return `i gang: ${running.length ? running.join(', ') : '–'} · sidst startet: ${lastStarted ?? '–'}`
    },
  }
}

module.exports = { createActivityTracker }
