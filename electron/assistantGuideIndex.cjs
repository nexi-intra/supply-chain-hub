// Guide objects retain identity in the read cache. A weak index therefore gets
// reused for repeated questions and is collected when a guide is replaced/evicted.
const indexes = new WeakMap()
const { createHash } = require('node:crypto')
const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\u0000/g, '').slice(0, 12000) : ''
const words = value => new Set(String(value || '').normalize('NFKC').toLowerCase().split(/[^\p{L}\p{N}@._-]+/u).filter(word => word.length > 1))
function indexGuide(guide) {
  if (!guide || typeof guide !== 'object') return []
  if (indexes.has(guide)) return indexes.get(guide)
  const title = clean(guide.title).slice(0, 180)
  const tags = (Array.isArray(guide.tags) ? guide.tags : []).map(tag => clean(tag).slice(0, 80)).join(', ')
  const titleWords = words(`${title} ${tags}`)
  const revision = createHash('sha256').update(JSON.stringify(guide)).digest('hex')
  const chunks = []
  const sections = guide.sections?.length ? guide.sections : [{ heading: '', steps: [{ text: guide.content, imageIds: [] }] }]
  sections.forEach((section, si) => (Array.isArray(section?.steps) ? section.steps : []).forEach((step, ti) => {
    if (!step) return
    const heading = clean(section.heading).slice(0, 200)
    const text = `${heading}\n${clean(step.text)}\n${tags}`
    chunks.push({ title, heading, text, stepText: clean(step.text), version: guide.version || '1.00', revision, reference: `${si + 1}.${ti + 1}`, imageIds: (Array.isArray(step.imageIds) ? step.imageIds : []).slice(0, 1), words: words(`${title} ${text}`), titleWords })
  }))
  indexes.set(guide, chunks)
  return chunks
}
module.exports = { indexGuide }
