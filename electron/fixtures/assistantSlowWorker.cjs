// Synthetic process fixture; no storage, hub content or model is read.
process.on('message', message => {
  if (message.kind !== 'call') return
  if (message.args[0]?.question === 'crash') process.exit(1)
  if (message.args[0]?.question === 'slow') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000)
  if (message.method === 'prepare') Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
  process.send({ id: message.id, result: { synthetic: true } })
})
process.on('disconnect', () => process.exit(0))
