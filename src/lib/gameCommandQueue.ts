// Commands to a multiplayer game go to the shared drive one at a time (a save there takes ~20 s), each built on the
// revision the earlier ones produced - the server rejects a move with an old revision. A chat message therefore
// queues instead of locking the board: a move sent meanwhile simply waits for it.
export interface GameCommandQueue {
  /** True while any command (chat too) is queued or on its way. */
  active(): boolean
  /** Runs `task` after every command queued before it; a failed command does not stop the next. */
  enqueue<T>(task: () => Promise<T>): Promise<T>
}

export function createGameCommandQueue(): GameCommandQueue {
  let tail: Promise<void> = Promise.resolve()
  let running = 0
  return {
    active: () => running > 0,
    enqueue<T>(task: () => Promise<T>): Promise<T> {
      running++
      const previous = tail
      let release!: () => void
      tail = new Promise<void>(resolve => { release = resolve })
      return previous.then(task).finally(() => {
        running--
        release()
      })
    },
  }
}
