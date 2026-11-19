/** Runs one task at a time: a second Enter while a save is still on its way to M: is ignored instead of saving twice. */
export function createSingleFlight() {
  let running = false
  return async function once(task: () => Promise<void>): Promise<void> {
    if (running) return
    running = true
    try {
      await task()
    } finally {
      running = false
    }
  }
}
