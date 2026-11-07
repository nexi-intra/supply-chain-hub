/**
 * When a click handler returns a promise, the button shows that it works until the promise is settled: a save to the
 * shared drive can take many seconds. Returns the watched promise (it still rejects like the original, so an error
 * is never swallowed), or undefined when the handler returned nothing to wait for.
 */
export function watchClickResult(result: unknown, onBusy: (busy: boolean) => void): Promise<unknown> | undefined {
  if (!result || typeof (result as PromiseLike<unknown>).then !== 'function') return undefined
  onBusy(true)
  return Promise.resolve(result as PromiseLike<unknown>).then(
    value => { onBusy(false); return value },
    error => { onBusy(false); throw error },
  )
}
