// Guide objects retain identity in the read cache. A weak index therefore gets
// reused for repeated questions and is collected when a guide is replaced/evicted.
const indexes = new WeakMap()
const documentIndexes = new WeakMap()
const { createHash } = require('node:crypto')
const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\u0000/g, '').slice(0, 12000) : ''
// Inner dots/dashes stay (codes like "v1.2", e-mails); sentence punctuation around a word does not.
const words = value => new Set(String(value || '').normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}@._-]+/u).map(word => word.replace(/^[@._-]+|[@._-]+$/g, '')).filter(word => word.length > 1))
// Word-only guides: headings start a section, other paragraphs become its steps (max 12 per section).
function sectionsFromParagraphs(paragraphs) {
  const sections = []
  for (const paragraph of paragraphs) {
    const current = sections.at(-1)
    if (paragraph.heading || !current || current.steps.length >= 12) sections.push({ heading: paragraph.heading ? paragraph.text : current?.heading || '', steps: paragraph.heading ? [] : [{ text: paragraph.text, imageIds: [] }] })
    else current.steps.push({ text: paragraph.text, imageIds: [] })
  }
  return sections.filter(section => section.steps.length)
}
function indexGuide(guide, paragraphs) {
  if (!guide || typeof guide !== 'object') return []
  const useDocument = Array.isArray(paragraphs) && paragraphs.length > 0 && !guide.sections?.length
  const cache = useDocument ? documentIndexes : indexes
  if (cache.has(guide)) return cache.get(guide)
  const title = clean(guide.title).slice(0, 180)
  const tags = (Array.isArray(guide.tags) ? guide.tags : []).map(tag => clean(tag).slice(0, 80)).join(', ')
  const titleWords = words(`${title} ${tags}`)
  const revision = createHash('sha256').update(JSON.stringify(guide)).digest('hex')
  const chunks = []
  const sections = useDocument ? sectionsFromParagraphs(paragraphs) : guide.sections?.length ? guide.sections : [{ heading: '', steps: [{ text: guide.content, imageIds: [] }] }]
  sections.forEach((section, si) => (Array.isArray(section?.steps) ? section.steps : []).forEach((step, ti) => {
    if (!step) return
    const heading = clean(section.heading).slice(0, 200)
    const text = `${heading}\n${clean(step.text)}\n${tags}`
    chunks.push({ title, heading, text, stepText: clean(step.text), version: guide.version || '1.00', revision, reference: `${si + 1}.${ti + 1}`, imageIds: (Array.isArray(step.imageIds) ? step.imageIds : []).slice(0, 1), words: words(`${title} ${text}`), titleWords })
  }))
  cache.set(guide, chunks)
  return chunks
}
module.exports = { indexGuide }
