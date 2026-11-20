// SAP moves a group all or nothing, so a rejected group is split in halves until the bad items stand alone.
// Halves run one after the other, because SAP GUI handles one posting at a time.
// onDone is awaited before the next attempt, so a posting is saved before a later crash can lose it.
//
// With `systemic` (a function from SAP's message to an Error) a refused group is first probed with its first and its
// last item alone. When both fail with exactly the group's message, SAP refuses them all for one shared reason (no
// authorisation, a locked period ...): halving would only repeat it, so the error of `systemic` is thrown instead.
// A probe that goes through, or fails with another message, ends the probing and the rest is split as usual.
async function bisect(items, attempt, onDone = async () => {}, { systemic = null } = {}) {
  const done = []
  const failed = []

  const record = async (group, result) => {
    if (result.ok) {
      const entry = { items: group, doc: result.doc }
      done.push(entry)
      await onDone(entry)
      return
    }
    if (group.length === 1) failed.push({ item: group[0], message: result.message })
  }

  const run = async group => {
    if (group.length === 0) return
    const result = await attempt(group)
    await record(group, result)
    if (result.ok || group.length === 1) return
    const half = Math.ceil(group.length / 2)
    await run(group.slice(0, half))
    await run(group.slice(half))
  }

  if (!systemic || items.length < 2) {
    await run(items)
    return { done, failed }
  }

  const whole = await attempt(items)
  await record(items, whole)
  if (whole.ok) return { done, failed }
  const tried = new Set()
  let same = 0
  for (const item of [items[0], items[items.length - 1]]) {
    const result = await attempt([item])
    tried.add(item)
    await record([item], result)
    if (result.ok || result.message !== whole.message) break
    same++
  }
  if (same === 2) throw systemic(whole.message)
  await run(items.filter(item => !tried.has(item)))
  return { done, failed }
}

module.exports = { bisect }
