// The order in which calls on some IPC channels reached the main process. Electron hands them over in the order the
// windows sent them, but each call then waits for the user to be looked up (cached, sometimes read from M:), and a call
// can overtake an earlier one there. A channel registered with `order` is numbered on arrival, before any of that, and
// `turn` lets it go on only when every earlier call on such a channel has let go (`leave`).
function createArrivalOrder() {
  const ordered = new Set()
  const open = new Map()
  const tickets = new WeakMap()
  let next = 0

  return {
    order(channel) { ordered.add(channel) },
    /** At the very start of every IPC call, synchronously. */
    arrive(channel, event) {
      if (!ordered.has(channel) || !event || typeof event !== 'object') return
      const number = ++next
      let release
      const gone = new Promise(resolve => { release = resolve })
      open.set(number, { gone, release })
      tickets.set(event, number)
    },
    /** Resolves when every ordered call that arrived before this one has let go. */
    async turn(event) {
      const number = event && typeof event === 'object' ? tickets.get(event) : undefined
      if (number === undefined) return
      for (;;) {
        const earlier = [...open].filter(([other]) => other < number).map(([, entry]) => entry.gone)
        if (!earlier.length) return
        await Promise.all(earlier)
      }
    },
    /** Lets the later calls go on; also when the call failed. Safe to call twice. */
    leave(event) {
      const number = event && typeof event === 'object' ? tickets.get(event) : undefined
      if (number === undefined) return
      tickets.delete(event)
      const entry = open.get(number)
      open.delete(number)
      entry?.release()
    },
  }
}

module.exports = { createArrivalOrder }
