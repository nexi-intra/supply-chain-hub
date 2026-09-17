// Deterministic task/person interpretation. No model, network or hardcoded users.
const canonical = value => String(value || '').normalize('NFKC').trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ')
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const bounded = (question, value) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(value)}(?:$|[^\\p{L}\\p{N}])`, 'u').test(question)
const SELF = new Set(['jeg', 'mig', 'min', 'mine', 'mig selv', 'i', 'me', 'my', 'myself', 'minun', 'omat'])
const EVERYONE = new Set(['teamet', 'teamets', 'hele teamet', 'hele teamets', 'mit team', 'vores team', 'alle', 'alle medarbejdere', 'alle i teamet', 'vi', 'everyone', 'everybody', 'the team', 'whole team', 'our team', 'my team', 'all employees', 'we', 'koko tiimi', 'tiimi', 'kaikki'])

function isTaskQuestion(question) {
  const q = canonical(question)
  if (/guide|vejledning|manual|opas|oppaa/.test(q)) return false
  return /opgave|vagt|task|shift|tehtäv|vuoro|arbejdsplan|assignment/.test(q)
    || /(?:skal|vil|kommer)\s+.+?\s+(?:arbejde|arbejder|lave|stå for|tage sig af)/.test(q)
    || /hvad\s+arbejder\s+.+?\s+med/.test(q)
    || /what\s+(?:should|will|does|is|am|do)\s+.+?\s+(?:do|work|working|be working)/.test(q)
    || /mitä\s+.+?\s+(?:tekee|teen|tehdä|työskentelee)/.test(q)
}

function extractSubject(question) {
  const q = canonical(question)
  const patterns = [
    /hvad\s+(?:skal|vil|kommer)\s+(.+?)\s+(?:arbejde(?:\s+med)?|arbejder|lave|stå for|tage sig af)/,
    /hvad\s+arbejder\s+(.+?)\s+med/,
    /what\s+(?:should|will|does|is|am|do)\s+(.+?)\s+(?:do|work(?:\s+on)?|working|be working)/,
    /(?:hvilke|hvilken)\s+(?:opgaver?|vagter?|roller?)\s+(?:skal|har|får)\s+(.+?)(?=\s+(?:have|lave|arbejde|i|på|næste|denne)\b|[?!.]|$)/,
    /(?:which|what)\s+(?:tasks|shifts|assignments)\s+(?:does|will|should|do)\s+(.+?)\s+(?:have|do|work)/,
    /(?:opgaver?|vagter?|vagtplan|arbejdsplan|tasks|shifts|assignments|tehtävät)\s+(?:for|til|of)\s+(.+?)(?=\s+(?:(?:i|på|on|in)\s+)?(?:næste|denne|next|this|i dag|i morgen|today|tomorrow|ensi|tällä|\d)\b|[?!]|$)/,
    /mitä\s+(.+?)\s+(?:tekee|teen|tehdä|työskentelee)/,
  ]
  for (const pattern of patterns) {
    const match = q.match(pattern)
    if (match) return match[1].replace(/\s+(?:fra|i|from|in)\s+.+$/, '').trim()
  }
  // Possessive task phrases; leave inflection intact for alias matching.
  const possessive = q.match(/(?:^|\s)([\p{L}\p{N}_@.+' -]+?)\s+(?:opgaver|vagter|vagtplan|tasks|shifts|tehtävät)\b/u)
  if (possessive) {
    const raw = possessive[1].replace(/^(?:hvad er|vis(?: mig)?|find|show(?: me)?|list|what are)\s+/, '').trim()
    if (raw && !/^(?:hvilke|hvilken|which|what)$/.test(raw)) return raw
  }
  return null
}

function aliasesFor(person) {
  const names = new Set()
  for (const name of person.names) {
    const value = canonical(name)
    if (!value) continue
    names.add(value)
    const words = value.split(' ')
    names.add(words[0]); names.add(words[words.length - 1])
  }
  for (const username of person.usernames) names.add(canonical(username))
  const aliases = []
  for (const name of names) {
    if (!name) continue
    const rank = name.includes(' ') ? 3 : 1
    for (const alias of [name, `${name}s`, `${name}'s`, `${name}'`, `${name}in`, `${name}n`]) aliases.push({ alias, rank })
  }
  aliases.push({ alias: person.email, rank: 4 })
  return aliases
}

function listPeople(teams, readTeam, creatorEmail) {
  const byEmail = new Map()
  for (const team of teams) {
    const users = readTeam(team, 'users') || {}
    for (const [key, user] of Object.entries(users)) {
      if (!user || typeof user !== 'object') continue
      const email = canonical(user.email || (Array.isArray(users) ? user.id : key))
      if (!email || email === canonical(creatorEmail) || user.role === 'creator' || (user.status && user.status !== 'approved')) continue
      const name = String(user.fullName || user.name || email.split('@')[0]).trim()
      let person = byEmail.get(email)
      if (!person) {
        person = { email, name, names: new Set(), usernames: new Set(), memberships: [] }
        byEmail.set(email, person)
      }
      person.names.add(name)
      if (user.username) person.usernames.add(String(user.username))
      person.memberships.push({ teamId: team.teamId, label: team.abbreviation || team.teamId, identifiers: new Set([email, canonical(user.id), Array.isArray(users) ? '' : canonical(key)].filter(Boolean)) })
    }
  }
  return [...byEmail.values()]
}

function selectTaskPeople(question, principal, teams, readTeam, creatorEmail, selectedPerson) {
  const q = canonical(question)
  const raw = extractSubject(q)
  const people = listPeople(teams, readTeam, creatorEmail)
  let all = raw !== null && EVERYONE.has(raw)
  if (raw === null) all = /hele teamet|alle medarbejdere|alle i teamet|teamets|everyone|whole team|all employees|koko tiimi/.test(q)
  let own = raw !== null && SELF.has(raw)
  if (raw === null) own = /(?:^|\s)(?:jeg|mig|min|mine|me|my|myself|minun|omat)(?:$|\s)/.test(q)
  let candidates = []
  if (all) candidates = people
  else if (own) candidates = people.filter(person => person.email === principal.email)
  else {
    const ranked = people.map(person => ({ person, rank: Math.max(0, ...aliasesFor(person).filter(({ alias }) => raw !== null ? alias === raw : bounded(q, alias)).map(({ rank }) => rank)) }))
    const best = Math.max(0, ...ranked.map(value => value.rank))
    candidates = best ? ranked.filter(value => value.rank === best).map(value => value.person) : []
    // An unnamed task query conventionally means the current user's plan.
    // An explicitly named unknown person must NEVER fall back to that plan.
    if (!candidates.length && raw === null) own = true
  }
  if (own && !candidates.length) candidates = [{ email: principal.email, name: principal.name, memberships: teams.map(team => ({ teamId: team.teamId, label: team.abbreviation || team.teamId, identifiers: new Set([principal.email]) })) }]
  if (selectedPerson !== undefined) {
    if (typeof selectedPerson !== 'string' || all || !candidates.some(person => person.email === canonical(selectedPerson))) throw new Error('Personvalget passer ikke til spørgsmålet eller de teams, du har adgang til')
    candidates = candidates.filter(person => person.email === canonical(selectedPerson))
  }
  if (!candidates.length && !all) return { reason: 'notFound', subject: raw || '' }
  if (!all && candidates.length > 1) return { reason: 'ambiguous', choices: candidates.map(person => ({ id: person.email, label: `${person.name} (${[...new Set(person.memberships.map(member => member.label))].join(', ')})` })).sort((a, b) => a.label.localeCompare(b.label)) }
  return { own, all, people: candidates }
}

module.exports = { isTaskQuestion, selectTaskPeople }
