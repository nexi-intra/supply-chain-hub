// Light, domain-limited spelling repair before routing. Only the hub's own
// vocabulary is corrected, and only with typo kinds that cannot turn one real
// word into another: swapped neighbours ("feire"), a doubled letter
// ("vagtplann") or one missing letter in longer words ("arbjder").
const SPLIT = new Map(Object.entries({
  idag: 'i dag', imorgen: 'i morgen', iovermorgen: 'i overmorgen', igaar: 'i går', 'igår': 'i går',
  naeste: 'næste', paa: 'på', foedselsdag: 'fødselsdag', fravaer: 'fravær', loerdag: 'lørdag', soendag: 'søndag',
  // Frequent slips and accent-less Finnish/Swedish that the single-edit rules below cannot reach.
  fere: 'ferie', imorgn: 'i morgen', frokst: 'frokost', hjemmearbeijde: 'hjemmearbejde', lunsh: 'lunch', lunc: 'lunch', sik: 'sick', hom: 'home', taks: 'tasks',
  lomala: 'lomalla', tanaan: 'tänään', mita: 'mitä', kenella: 'kenellä', nasta: 'nästa', aer: 'är', ar: 'är', pa: 'på',
  // Question words with a slip or swapped letters.
  wer: 'who', hwo: 'who', wher: 'where', waht: 'what', hevm: 'hvem', hvme: 'hvem', kuak: 'kuka',
  // Chess and Multiplayer vocabulary: slips that the single-edit rules cannot reach (short words, or one wrong letter).
  spiler: 'spiller', kolega: 'kollega', tilbyer: 'tilbyder', remiz: 'remis', remy: 'remi', schak: 'schack', chesss: 'chess', ofer: 'offer', colegue: 'colleague', colegues: 'colleagues',
  // Multiplayer results and games: accent-less Danish/Finnish/Swedish and a Danish slip for chess.
  skack: 'skak', skakk: 'skak', traek: 'træk', slaaet: 'slået', aabne: 'åbne', kaynnissa: 'käynnissä', havinnyt: 'hävinnyt', peleja: 'pelejä', pagaende: 'pågående', forlorat: 'förlorat', forlust: 'förlust',
}))
const VOCABULARY = ['ferie', 'feriedage', 'vagter', 'vagtplan', 'opgaver', 'sygemeldt', 'sygemelding', 'sygdom', 'hjemmearbejde', 'hjemmefra', 'kalender', 'arbejder', 'arbejde', 'morgen', 'guide', 'guides', 'vejledning', 'madplan', 'kantine', 'tilbage', 'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'vacation', 'holiday', 'shifts', 'schedule', 'tomorrow', 'today', 'working', 'opslag', 'announcement', 'announcements']
const KNOWN = new Set([...VOCABULARY, 'opgave', 'vagten', 'vagterne', 'arbejdet', 'arbejdede', 'morgenen', 'guiden', 'ferien', 'sygemeld', 'sygemelde', 'hjemme', 'dagen', 'kalenderen', 'madplanen', 'shift', 'holidays', 'vacations', 'oplag', 'opslaget', 'opslagene'])

function oneEditFrom(word, target) {
  if (word === target) return false
  if (word.length === target.length && word.length >= 5) {
    for (let i = 0; i < word.length - 1; i++) {
      if (word[i] !== target[i]) return word[i] === target[i + 1] && word[i + 1] === target[i] && word.slice(i + 2) === target.slice(i + 2)
    }
    return false
  }
  if (word.length === target.length + 1 && target.length >= 6) {
    // doubled letter, e.g. vagtplann
    for (let i = 0; i < word.length; i++) if (word.slice(0, i) + word.slice(i + 1) === target && word[i] === word[i - 1]) return true
    return false
  }
  if (word.length + 1 === target.length && target.length >= 6) {
    for (let i = 0; i < target.length; i++) if (target.slice(0, i) + target.slice(i + 1) === word) return true
  }
  return false
}

function correctTypos(question) {
  return String(question).replace(/[\p{L}]+/gu, token => {
    const lower = token.toLowerCase()
    if (SPLIT.has(lower)) return SPLIT.get(lower)
    if (lower.length < 5 || KNOWN.has(lower)) return token
    const fix = VOCABULARY.find(word => oneEditFrom(lower, word))
    return fix || token
  })
}

module.exports = { correctTypos }
