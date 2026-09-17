// Synthetic data only. Does not read the hub or retain prompts/conversations.
const { createLocalAI } = require('../electron/localAI.cjs')
const os = require('node:os')
const zlib = require('node:zlib')
const modelFlag = process.argv.indexOf('--model')
const ai = createLocalAI({ defaultModelId: modelFlag < 0 ? '8b' : process.argv[modelFlag + 1] })
function syntheticImage() {
  const crc32 = buffer => {
    let crc = 0xffffffff
    for (const byte of buffer) {
      crc ^= byte
      for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0)
    }
    return (crc ^ 0xffffffff) >>> 0
  }
  const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name), data])
    const length = Buffer.alloc(4); length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(224, 0); header.writeUInt32BE(224, 4); header[8] = 8; header[9] = 2
  const pixels = Buffer.alloc(224 * (1 + 224 * 3))
  for (let y = 0; y < 224; y++) for (let x = 0; x < 224; x++) {
    const position = y * (1 + 224 * 3) + 1 + x * 3
    pixels[position] = x < 112 ? 255 : 0
    pixels[position + 2] = x < 112 ? 0 : 255
  }
  return `data:image/png;base64,${Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]).toString('base64')}`
}
async function main() {
  console.log(JSON.stringify({ before: ai.status(), cpu: os.cpus()[0]?.model }, null, 2))
  const messages = process.argv.includes('--vision') ? [
    { role: 'system', content: 'Describe only the image. Answer briefly in Danish.' },
    { role: 'user', content: [{ type: 'text', text: 'Hvilke to farver viser billedet, og hvor er de placeret?' }, { type: 'image_url', image_url: { url: syntheticImage() } }] },
  ] : [
    { role: 'system', content: 'Svar kort på dansk ud fra data. Opfind aldrig oplysninger. Datoer og perioder er allerede beregnet af appen og må ikke genberegnes.' },
    { role: 'user', content: 'Testdata: I dag er 2026-09-15. Næste uge er 2026-09-21 til 2026-09-27. Mandag 2026-09-21: Ordrepakning. Tirsdag 2026-09-22: Returvarer. Ingen andre registrerede opgaver. Opsummer mine opgaver i næste uge.' },
  ]
  const result = await ai.complete(messages, { maxTokens: 128 })
  console.log(JSON.stringify({ text: result.text, metrics: result.metrics, after: ai.status() }, null, 2))
}
main().catch(error => { console.error(error.message); process.exitCode = 1 }).finally(() => ai.stop())
