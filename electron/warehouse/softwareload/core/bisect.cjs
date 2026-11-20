// SAP moves a group all or nothing, so a rejected group is split in halves until the bad items stand alone.
// Halves run one after the other, because SAP GUI handles one posting at a time.
// onDone is awaited before the next attempt, so a posting is saved before a later crash can lose it.
async function bisect(items, attempt, onDone = async () => {}) {
  const done = []
  const failed = []

  const run = async group => {
    if (group.length === 0) return
    const result = await attempt(group)
    if (result.ok) {
      const entry = { items: group, doc: result.doc }
      done.push(entry)
      await onDone(entry)
      return
    }
    if (group.length === 1) { failed.push({ item: group[0], message: result.message }); return }
    const half = Math.ceil(group.length / 2)
    await run(group.slice(0, half))
    await run(group.slice(half))
  }

  await run(items)
  return { done, failed }
}

module.exports = { bisect }
