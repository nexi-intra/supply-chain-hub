// Presentation of already authorized evidence only. Never infer facts from
// search-result order, old versions, model memory, or a hardcoded guide/value.
const normalize = text => String(text || '').normalize('NFKC').toLowerCase()
const words = text => normalize(text).match(/[\p{L}\p{N}._-]+/gu) || []
const filler = new Set('hvad hvad er den det de en et nye ny aktuelle gældende adresse adressen ip ip-adresse ip-adressen what is the a an new current address which mikä on uusi nykyinen osoite ip-osoite guide guiden i in står findes gamle gammel old vanha historik history historia kilde'.split(' '))
const qualifier = text => {
  const matches = [...normalize(text).matchAll(/\b(test|testing|testi|ny|nye|new|current|aktuel|aktuelle|gældende|production|produktion|uusi|nykyinen|gamle|gammel|old|vanha)\b/gu)]
  return matches.length ? /^(test|testing|testi)$/.test(matches.at(-1)[1]) ? 'test' : /^(gamle|gammel|old|vanha)$/.test(matches.at(-1)[1]) ? 'old' : 'current' : undefined
}
function conciseGuideFact(answer, request) {
  const q = normalize(request.question)
  // Detailed/list/comparison questions still need the complete evidence/model.
  if (request.image || request.page || !/\bip(?:-adresse|-address|-osoite)?\b/u.test(q) || /alle|both|begge|compare|sammenlign|forklar|explain|version|kaikki/u.test(q)) return null
  const wanted = qualifier(q)
  if (wanted !== 'old' && /historik|history|historia/u.test(q)) return null
  const eligible = source => source.kind === 'guide' || (wanted === 'old' && source.kind === 'module' && source.moduleId === 'reviews' && source.history === true)
  if (!answer.sources?.length || answer.nextPage !== undefined || answer.total > answer.sources.length || answer.sources.some(source => !eligible(source))) return null
  if (/guide kilde/u.test(q) && wanted !== 'old') {
    const guides = [...new Map(answer.sources.map((source, index) => [`${source.teamId}:${source.guideId}`, { source, index }])).values()]
    const prefix = request.language === 'en' ? 'Source' : request.language === 'fi' ? 'Lähde' : 'Kilde'
    return { ...answer, mode: 'data', text: `${prefix}: ${guides.map(({ source, index }) => `“${source.title}” [${index + 1}]`).join(', ')}.` }
  }
  const topic = words(q).filter(word => !filler.has(word))
  const candidates = []
  const published = new Set()
  // Establish current labelled values before interpreting historical snapshots.
  for (const source of answer.sources.filter(source => source.kind === 'guide')) {
    let end = 0
    for (const match of String(source.text || '').matchAll(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g)) {
      if (qualifier(source.text.slice(end, match.index)) === 'current') published.add(match[0])
      end = match.index + match[0].length
    }
  }
  answer.sources.forEach((source, index) => {
    const text = String(source.text || '')
    let previousEnd = 0
    for (const match of text.matchAll(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w.])/g)) {
      const label = text.slice(Math.max(previousEnd, match.index - 160), match.index).trim()
      previousEnd = match.index + match[0].length
      if (match[0].split('.').some(octet => Number(octet) > 255)) continue
      // An explicit qualifier must belong to THIS address, not another IP in
      // the same step. Unlabelled/ambiguous addresses are not guessed.
      const labelKind = qualifier(label)
      const historicalChange = wanted === 'old' && source.history === true && labelKind === 'current' && published.size && !published.has(match[0])
      if (wanted && labelKind !== wanted && !historicalChange) continue
      const context = normalize(`${source.title} ${label}`)
      if (topic.some(term => !context.includes(term))) continue
      candidates.push({ value: match[0], index, historical: historicalChange })
    }
  })
  const unique = [...new Set(candidates.map(candidate => candidate.value))]
  const lang = request.language
  if (!unique.length) return wanted === 'old' ? { ...answer, mode: 'data', text: lang === 'en' ? 'I cannot find a documented old IP address in the accessible sources.' : lang === 'fi' ? 'Saatavilla olevista lähteistä ei löydy dokumentoitua vanhaa IP-osoitetta.' : 'Jeg kan ikke finde en dokumenteret gammel IP-adresse i de tilgængelige kilder.' } : null
  if (unique.length > 1) {
    const text = lang === 'en' ? 'The guides contain different matching IP addresses. Which guide do you mean?' : lang === 'fi' ? 'Oppaissa on eri IP-osoitteita. Mitä opasta tarkoitat?' : 'Guiderne indeholder forskellige matchende IP-adresser. Hvilken guide mener du?'
    return { ...answer, mode: 'data', text: `${text} ${[...new Set(candidates.map(candidate => `[${candidate.index + 1}]`))].join(' ')}` }
  }
  const candidate = candidates.find(candidate => candidate.value === unique[0])
  const citation = candidate.index + 1
  if (wanted === 'old') {
    const prefix = candidate.historical ? lang === 'en' ? 'A previous guide version lists' : lang === 'fi' ? 'Aiemmassa opasversiossa on' : 'I en tidligere guideversion står' : lang === 'en' ? 'The old IP address is' : lang === 'fi' ? 'Vanha IP-osoite on' : 'Den gamle IP-adresse er'
    return { ...answer, mode: 'data', text: `${prefix} ${unique[0]}. [${citation}]` }
  }
  const label = lang === 'en' ? wanted === 'test' ? 'The test IP address is' : wanted === 'current' ? 'The current IP address is' : 'The IP address is' : lang === 'fi' ? wanted === 'test' ? 'Testi-IP-osoite on' : wanted === 'current' ? 'Nykyinen IP-osoite on' : 'IP-osoite on' : wanted === 'test' ? 'Test-IP-adressen er' : wanted === 'current' ? /\b(?:ny|nye)\b/u.test(q) ? 'Den nye IP-adresse er' : 'Den aktuelle IP-adresse er' : 'IP-adressen er'
  return { ...answer, mode: 'data', text: `${label} ${unique[0]}. [${citation}]` }
}
function conciseGuideFallback(answer, request) {
  // This is an explicitly marked excerpt, not a generated answer. Preserve
  // complete lists/module projections and intentional review/history requests.
  if (!answer.sources?.length || answer.sources.some(source => source.kind !== 'guide') || /alle|hele|fuld|all|full|kaikki|historik|history|version/u.test(normalize(request.question))) return answer
  const terms = words(request.question).filter(word => !filler.has(word) && word.length > 2)
  const seen = new Set()
  const excerpts = []
  answer.sources.forEach((source, index) => {
    const lines = String(source.text || '').split(/\n+/).map(line => line.trim()).filter(Boolean)
    const ranked = lines.map((line, i) => ({ line, i, score: terms.filter(term => normalize(line).includes(term)).length })).sort((a, b) => b.score - a.score || a.i - b.i)
    const best = ranked[0]
    if (!best) return
    // Keep the value following a heading (e.g. an address on its own line).
    let excerpt = best.line + (best.i + 1 < lines.length && /^[\d.:/]+$/.test(lines[best.i + 1]) ? ` ${lines[best.i + 1]}` : '')
    if (excerpt.length > 260) excerpt = `${excerpt.slice(0, 260).replace(/\s+\S*$/, '')}…`
    if (seen.has(normalize(excerpt))) return
    seen.add(normalize(excerpt))
    excerpts.push(`${excerpt} [${index + 1}]`)
  })
  if (!excerpts.length) return answer
  const label = request.language === 'en' ? 'Relevant excerpt' : request.language === 'fi' ? 'Olennainen ote' : 'Relevant uddrag'
  return { ...answer, text: `${label}:\n${excerpts.slice(0, 3).join('\n\n')}` }
}
module.exports = { conciseGuideFact, conciseGuideFallback }
