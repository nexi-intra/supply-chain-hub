// Guide search for Hubert: light Danish/English stemming, a da/en/fi trade glossary,
// model-number splitting and IDF weighting so rare words (product names) decide the guide.
// Pure ranking over guides the caller has ALREADY authorized; never reads storage itself.
const { indexGuide } = require('./assistantGuideIndex.cjs')

const STOPWORDS = new Set(('jeg mig min mine mit skal kan kunne hvordan hvad hvem hvor der det den en et er at i på til fra for med og har havde have '
  + 'please how what can the a an in of to is does do who has which me my are about om du we you your '
  + 'would like tell gerne vil want know vide noget this that ikke '
  + 'op ud ind af hvis '
  + 'når naar så sådan saadan hvilken hvilke står stå ved får få nogen noget også bare lige its it on at by with from into get got '
  + 'should shall will må burde skulle miten mitä kuinka missä onko ja on se ne minä minun voin teen '
  + 'jag mina mitt ska kunna hur vad vem var är ett och hade ha snälla veta något detta inte när vilka någon också kunde borde finns').split(' '))
// Words that say little about WHICH guide: they rank (bonus) but are not required to match.
const SOFT = new Set(('guide guides guiden guiderne guidens vejledning vejledningen opas oppaat ohje explain forklare forklar fortæl hjælp hjælpe '
  + 'lave laver lav gøre gør finde finder bruge bruger sende sender udfylde udfylder printe make find use send fill print need vis show list alle all '
  + 'guider guiderna förklara berätta hjälp hjälpa göra hitta hittar använda använder skicka skickar fylla visa lista alla').split(' '))

const SUFFIXES = ['ernes', 'erne', 'enes', 'ene', 'ens', 'ets', 'ing', 'ed', 'en', 'et', 'er', 'es', 'e', 's']
const VOWELS = /[aeiouyæøåäö]/
function stemOnce(word) {
  for (const suffix of SUFFIXES) {
    if (!word.endsWith(suffix) || word.length - suffix.length < 4) continue
    let stem = word.slice(0, -suffix.length)
    // "lukker" -> "lukk" -> "luk", "sletter" -> "slet"
    if (stem.length >= 4 && stem.at(-1) === stem.at(-2) && !VOWELS.test(stem.at(-1))) stem = stem.slice(0, -1)
    return stem
  }
  return word
}
const stem = word => /\d/.test(word) ? word : stemOnce(stemOnce(word))
// Short Danish roots ("deler"/"deling" -> "del") as an extra form; only exact matches use it.
const shortStem = word => {
  if (/\d/.test(word) || word.length < 5) return null
  for (const suffix of ['ing', 'er', 'en', 'et', 'e']) if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length)
  return null
}
const split = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[éèêë]/g, 'e').replace(/[áàâ]/g, 'a').replace(/[íì]/g, 'i').replace(/[óòô]/g, 'o').replace(/[úù]/g, 'u').split(/[^\p{L}\p{N}:]+/u).map(word => word.replace(/^:+|:+$/g, '')).filter(word => word.length > 1)
// "move3500" is also "move" + "3500"; "n950" keeps "950".
const parts = word => /\p{L}/u.test(word) && /\d/.test(word) ? word.split(/(?<=\p{L})(?=\d)|(?<=\d)(?=\p{L})/u).filter(part => part.length > 1) : []
function stemSet(text) {
  const result = new Set()
  for (const word of split(text)) {
    result.add(stem(word))
    const short = shortStem(word)
    if (short) result.add(short)
    for (const part of parts(word)) result.add(stem(part))
  }
  return result
}

// Same concept in Danish / English / Finnish / Swedish. Multi-word forms must all be present.
const GLOSSARY = [
  ['kreditnota', 'credit note', 'hyvityslasku', 'kreditfaktura'], ['kredit', 'credit'],
  ['returordre', 'return order', 'palautustilaus', 'returorder'], ['retur', 'return', 'palautus'],
  ['reparationsordre', 'repair order', 'korjaustilaus', 'reparationsorder'], ['reparation', 'reparere', 'repair', 'korjaus', 'reparera'],
  ['ordre', 'order', 'tilaus'], ['annuller', 'annullering', 'cancel', 'cancellation', 'peruuta', 'avbryt', 'annullera'],
  ['slet', 'sletning', 'delete', 'remove', 'poista', 'radera', 'ta bort'], ['opret', 'oprettelse', 'ny', 'nyt', 'create', 'creating', 'new', 'luo', 'skapa'],
  ['ændr', 'ændring', 'change', 'edit', 'editing', 'muuta', 'ändra', 'ändring'], ['skift', 'change', 'replace', 'vaihda', 'byta'],
  ['adresse', 'address', 'osoite', 'adress'], ['materialenummer', 'material number', 'materiale number', 'materiaalinumero', 'materialnummer'],
  ['serienummer', 'serienumre', 'serial number', 'serial', 'sarjanumero'], ['lang', 'lange', 'long', 'pitkä', 'lång'],
  ['rengøring', 'rengør', 'rens', 'cleaning', 'clean', 'puhdistus', 'puhdista', 'rengöring', 'rengöra'],
  ['batteri', 'battery', 'akku'], ['oplad', 'opladning', 'lade', 'lader', 'charge', 'charging', 'lataa', 'lataus', 'ladda', 'laddning'],
  ['adgangskode', 'kodeord', 'password', 'salasana', 'lösenord'], ['timer', 'time', 'timeregistrering', 'timeseddel', 'hours', 'tunnit', 'tuntien', 'timmar', 'tidrapport'],
  ['tilbagefør', 'tilbageføre', 'reverse', 'reversing', 'reversal', 'återför', 'återföra'], ['vareudlevering', 'goods issue', 'varuutlämning'],
  ['varemodtagelse', 'goods received', 'goods receipt', 'tavaran vastaanotto', 'varumottagning'],
  ['dublet', 'dubletter', 'duplicate', 'duplicates', 'kaksoiskappale', 'dubblett', 'dubbletter'], ['antal', 'amount', 'quantity', 'määrä'],
  ['trafiklys', 'traffic light', 'liikennevalo', 'trafikljus'], ['fabriksnulstil', 'fabriksnulstilling', 'factory reset', 'tehdasasetukset', 'fabriksåterställning'],
  ['nulstil', 'nulstilling', 'reset', 'nollaa', 'återställ', 'nollställ'], ['nøgle', 'nøgler', 'key', 'keys', 'avain', 'avaimet', 'nyckel', 'nycklar'],
  ['migreret', 'migrering', 'migrated', 'migrate', 'migration', 'migrerad'], ['førstehjælp', 'first aid', 'ensiapu', 'första hjälpen'],
  ['kemikalie', 'kemikalier', 'kemi', 'chemical', 'chemicals', 'kemikaali'],
  ['sikkerhedsdatablad', 'datablad', 'safety data sheet', 'sds', 'käyttöturvallisuustiedote', 'säkerhetsdatablad'],
  ['opdater', 'opdatering', 'update', 'päivitä', 'päivitys', 'uppdatera', 'uppdatering'], ['opsæt', 'opsætning', 'setup', 'install', 'installation', 'asenna', 'installera'],
  ['blokeret', 'spærret', 'blocked', 'estetty', 'blockerad', 'spärrad'], ['lås', 'låse', 'låses', 'oplås', 'oplåse', 'unblock', 'unblocked', 'unlock', 'låst', 'lås upp'],
  ['faktura', 'invoice', 'lasku'], ['palle', 'pallet', 'lava', 'pall'], ['lager', 'stock', 'warehouse', 'varasto'],
  ['simkort', 'sim card', 'sim', 'sim-kortti'], ['kunde', 'customer', 'asiakas', 'kund'], ['kortaftale', 'card agreement', 'kortavtal'],
  ['transaktion', 'transaction', 'tapahtuma'], ['kode', 'koder', 'code', 'codes', 'koodi', 'kod'],
  ['glas', 'glasrens', 'glass', 'glass cleaner', 'lasi'], ['hånddesinfektion', 'hand sanitizer', 'desinfektion', 'käsidesi', 'handsprit'],
  ['sortering', 'sorter', 'sorting', 'sort', 'lajittelu'], ['dobbelt', 'double', 'kaksinkertainen', 'dubbel'],
  ['registrer', 'registrering', 'insert', 'inserting', 'register', 'kirjaa', 'registrera'], ['anmod', 'anmodning', 'request', 'pyyntö', 'begäran'],
  ['afsend', 'afsendelse', 'ship', 'shipping', 'booking out', 'lähetä', 'skicka', 'avsändning'], ['modtag', 'modtagelse', 'receive', 'inbound', 'vastaanota', 'ta emot', 'mottagning'],
  ['skærm', 'screen', 'display', 'näyttö', 'skärm'], ['printer', 'printe', 'print', 'tulostin', 'skrivare', 'skriv ut'], ['kabel', 'cable', 'kaapeli'],
]
const groups = new Map()
for (const forms of GLOSSARY) {
  const alternatives = forms.map(form => [...stemSet(form)])
  for (const form of forms) if (!form.includes(' ')) {
    const key = stem(form)
    groups.set(key, [...(groups.get(key) || []), ...alternatives])
  }
}

/** Query tokens: [{ surface, alternatives: [[stem, ...], ...], code }] */
function queryTokens(question, extraTerms = []) {
  const seen = new Set()
  const tokens = []
  for (const word of [...split(question), ...extraTerms.flatMap(split)]) {
    if (STOPWORDS.has(word) || seen.has(word)) continue
    seen.add(word)
    const own = [stem(word)]
    const alternatives = [own, ...(parts(word).length ? [parts(word).map(stem)] : []), ...(groups.get(stem(word)) || [])]
    if (shortStem(word) && shortStem(word) !== own[0]) alternatives.push([shortStem(word)])
    // Danish compounds: "adresseændring" = "adresse" + "ændring" -> address + change.
    if (!groups.has(stem(word)) && word.length >= 9) {
      for (let i = 4; i <= word.length - 3; i++) {
        const left = groups.get(stem(word.slice(0, i)))
        if (!left) continue
        // Linking letters: "adresse|ændring", "reparation|s|ordre".
        for (const rest of new Set([word.slice(i), word.slice(i).replace(/^[es]/, '')])) {
          const right = rest.length >= 3 && groups.get(stem(rest))
          if (right) for (const first of left) for (const second of right) alternatives.push([...first, ...second])
        }
      }
    }
    tokens.push({ surface: word, alternatives, code: /\d/.test(word), soft: SOFT.has(word) })
  }
  // Only soft words (e.g. "vis alle guides"): nothing identifies a guide.
  return tokens.some(token => !token.soft) ? tokens : []
}

const profiles = new WeakMap()
function profile(guide, paragraphs) {
  const withDocument = Array.isArray(paragraphs) && paragraphs.length > 0
  const cached = profiles.get(guide)
  if (cached && cached.withDocument === withDocument) return cached
  const chunks = indexGuide(guide, paragraphs)
  const titleStems = stemSet(`${guide.title || ''} ${(Array.isArray(guide.tags) ? guide.tags : []).join(' ')} ${guide.category || ''}`)
  const sections = []
  for (const chunk of chunks) {
    const si = Number(chunk.reference.split('.')[0]) - 1
    if (!sections[si]) sections[si] = { heading: chunk.heading, steps: [], stems: stemSet(chunk.heading) }
    const stems = stemSet(chunk.stepText)
    sections[si].steps.push({ chunk, stems })
    for (const value of stems) sections[si].stems.add(value)
  }
  const all = new Set([...titleStems, ...stemSet(guide.content)])
  for (const section of sections.filter(Boolean)) for (const value of section.stems) all.add(value)
  const result = { chunks, titleStems, all, sections: sections.filter(Boolean), withDocument }
  profiles.set(guide, result)
  return result
}

// Compound words: "bluetoothbase" contains "bluetooth", "transaktionskoder" starts with "transaktion".
function contains(set, value, minimum) {
  if (set.has(value)) return true
  if (value.length < minimum || /\d/.test(value)) return false
  for (const word of set) if (word.length >= minimum && (word.startsWith(value) || value.startsWith(word))) return true
  return false
}
const has = (set, alternative, minimum = 6) => alternative.length > 0 && alternative.every(value => contains(set, value, minimum))

/**
 * Ranks authorized guides. `entries`: [{ guide, team, paragraphs? }].
 * Returns { hits: [{ entry, score, coverage, section, step, titleTokens }], tokens, near }.
 */
function searchGuides(entries, question, { terms = [], isAppWord = () => false } = {}) {
  const tokens = queryTokens(question, terms)
  if (!tokens.length || !entries.length) return { hits: [], tokens, near: [] }
  const ranked = entries.map(entry => ({ entry, profile: profile(entry.guide, entry.paragraphs) }))
  const total = ranked.length
  const df = alternative => ranked.reduce((count, item) => count + (has(item.profile.all, alternative) ? 1 : 0), 0)
  const maxIdf = 1 + Math.log(total + 1)
  for (const token of tokens) {
    const counts = token.alternatives.map(df).filter(count => count > 0)
    // A word no guide contains cannot rank guides; an unknown code (e.g. "P300") means the topic is missing.
    token.weight = counts.length ? 1 + Math.log((total + 1) / Math.min(...counts)) : token.code ? maxIdf + 1 : 1
  }
  const weightSum = tokens.reduce((sum, token) => sum + (token.soft ? 0 : token.weight), 0)
  const hits = []
  const near = []
  for (const item of ranked) {
    if (tokens.some(token => /^\d+:\d+$/.test(token.surface) && !token.alternatives.some(alternative => has(item.profile.all, alternative)))) continue
    let score = 0
    let covered = 0
    const titleTokens = []
    for (const token of tokens) {
      const factor = token.soft ? 0.5 : 1
      if (token.alternatives.some(alternative => has(item.profile.titleStems, alternative, 5))) {
        score += token.weight * 2 * factor; if (!token.soft) { covered += token.weight; titleTokens.push(token) }
      } else if (token.alternatives.some(alternative => has(item.profile.all, alternative))) {
        score += token.weight * factor; if (!token.soft) covered += token.weight
      }
    }
    if (!covered) continue
    const coverage = covered / weightSum
    if (coverage < 0.5) {
      const titleHits = titleTokens.filter(token => token.surface.length >= 4)
      if (titleHits.length) near.push({ entry: item.entry, hits: titleHits.map(token => token.surface), score })
      continue
    }
    // Best section = most query weight inside it (heading counts double); ties keep document order.
    let best = null
    for (const section of item.profile.sections) {
      const headingStems = stemSet(section.heading)
      const sectionScore = tokens.reduce((sum, token) => sum + (token.alternatives.some(alternative => has(headingStems, alternative)) ? token.weight * 2 : token.alternatives.some(alternative => has(section.stems, alternative)) ? token.weight : 0) * (token.soft ? 0.5 : 1), 0)
      if (!best || sectionScore > best.score) best = { section, score: sectionScore }
    }
    if (!best) continue
    // A guide whose matching section is focused on the question outranks one that only mentions the words.
    score += best.score * 0.2
    const stepScore = step => tokens.reduce((sum, token) => sum + (token.alternatives.some(alternative => has(step.stems, alternative)) ? token.weight * (token.code ? 4 : 1) : 0), 0)
    const step = best.section.steps.reduce((winner, candidate) => stepScore(candidate) > stepScore(winner) ? candidate : winner, best.section.steps[0])
    const strong = titleTokens.some(token => !isAppWord(token.surface))
    const matchedTokens = tokens.filter(token => !token.soft && (token.alternatives.some(alternative => has(item.profile.all, alternative)) || titleTokens.includes(token)))
    hits.push({ entry: item.entry, score, coverage, section: best.section, step, strong, titleCount: titleTokens.length, nonApp: matchedTokens.some(token => !isAppWord(token.surface)) })
  }
  hits.sort((a, b) => b.score - a.score || b.coverage - a.coverage)
  near.sort((a, b) => b.score - a.score)
  return { hits: hits.filter(hit => hit.score >= hits[0]?.score * 0.5).slice(0, 3), tokens, near }
}

module.exports = { searchGuides, queryTokens, stem }
