// Synchronous text extraction from a stored .docx (zip) for the assistant's guide index.
// Read-only and bounded: no file system access, size-capped inflate, paragraph cap.
const zlib = require('node:zlib')

const MAX_XML_BYTES = 20 * 1024 ** 2
const MAX_PARAGRAPHS = 3000

function zipEntry(buffer, name) {
  const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0 || end + 22 > buffer.length) throw new Error('Not a zip file')
  const count = buffer.readUInt16LE(end + 10)
  let offset = buffer.readUInt32LE(end + 16)
  for (let i = 0; i < count && offset + 46 <= buffer.length; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Corrupt zip directory')
    const method = buffer.readUInt16LE(offset + 10)
    const size = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const skip = nameLength + buffer.readUInt16LE(offset + 30) + buffer.readUInt16LE(offset + 32)
    const local = buffer.readUInt32LE(offset + 42)
    if (buffer.toString('utf8', offset + 46, offset + 46 + nameLength) === name) {
      if (local + 30 > buffer.length || buffer.readUInt32LE(local) !== 0x04034b50) throw new Error('Corrupt zip entry')
      const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
      const data = buffer.subarray(start, start + size)
      if (method === 0) return data
      if (method === 8) return zlib.inflateRawSync(data, { maxOutputLength: MAX_XML_BYTES })
      throw new Error('Unsupported zip compression')
    }
    offset += 46 + skip
  }
  return null
}

const decode = text => text
  .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
  .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')

/** Returns [{ heading: boolean, text }] for the non-empty paragraphs of a .docx buffer. */
function docxParagraphs(buffer) {
  const xml = zipEntry(buffer, 'word/document.xml')
  if (!xml) throw new Error('Missing word/document.xml')
  const paragraphs = []
  for (const [body] of xml.toString('utf8').matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)) {
    const text = decode(body.replace(/<w:(?:tab|br|cr)\b[^>]*\/>/g, ' ').match(/<w:t(?:\s[^>]*)?>[^<]*<\/w:t>/g)?.map(run => run.replace(/<[^>]+>/g, '')).join('') || '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    paragraphs.push({ heading: /<w:pStyle w:val="(?:Heading|Overskrift|Title|Titel|Otsikko)[^"]*"/i.test(body), text })
    if (paragraphs.length >= MAX_PARAGRAPHS) break
  }
  return paragraphs
}

module.exports = { docxParagraphs }
