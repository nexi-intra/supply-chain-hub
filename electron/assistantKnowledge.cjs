// Explicit module adapters. No arbitrary KV keys, object dumps or model-chosen
// permissions. Every record is projected AFTER its team/row access check.
const clean = (value, max = 12000) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\u0000/g, '').slice(0, max) : ''
const { indexGuide } = require('./assistantGuideIndex.cjs')
const norm = value => String(value || '').normalize('NFKC').trim().toLowerCase()
const array = value => Array.isArray(value) ? value : []
const timestamp = value => Number.isFinite(value) && !Number.isNaN(new Date(value).getTime()) ? new Date(value).toISOString() : ''
const keyWords = value => [...new Set(norm(value).split(/[^\p{L}\p{N}@._-]+/u).filter(word => word.length > 1))]
const STOP = new Set('giv give mig me en et the a an of over om about ind i på til fra for med and og er var står den det de der som skal ville vil kan kunne hvordan hvad hvilke hvilken hvem hvor hvornår what which who how when does do is are was were tell show find search please vis find søg oversigt overblik overview summary alle all min mine my dine your data hub hubben uge week næste next denne this sidste last år year 2026 opgaver tasks arbejde arbejder lave arbejde med'.split(' '))
for (const word of 'så ud så den ud team teamet mit vores sin eget hele ser se sås looked looks look like hvordan mange how many antal en hvilke bliver blev har have havde has læs læse read læste pr planer plan planned hvad indeholder indhold indeholdt hvilke ugen uge'.split(' ')) STOP.add(word)
for (const word of 'vi we our findes findes der fælles shared personlige personal guide guides guidebibliotek bibliotek status lige nu stadig endnu sker sket stod skrevet skrev said wrote skriver skriverne sammenfat opsummer forklar explain summarize summary betyder mean means hvorfor why kuinka monta nämä kaikki mitä on ollut näyttää miltä'.split(' ')) STOP.add(word)
for (const word of ['jeg', 'mig', 'me', 'minun']) STOP.add(word)
// Modal-/hjaelpeverber og fyld-spoergeord er ikke soegeord: de maa ikke nulstille
// ellers gyldige modul-traef (fx "what should we eat today" -> madplan).
for (const word of 'should shall would could can cannot will must may might do does skal skulle burde vil ville kan kunne må pitäisi täytyy voisi saisi voiko'.split(' ')) STOP.add(word)
// Tidsfragmenter fra flerords-datoudtryk (fx "i dag" -> token "dag") er ikke soegeord.
for (const word of 'dag idag morgen imorgen går igår overmorgen'.split(' ')) STOP.add(word)
const terms = value => keyWords(value).filter(word => !STOP.has(word) && !/^\d+$/.test(word))
// Meal questions express a period and optionally a dish. Their auxiliary verbs
// are not ingredients to require in the menu. Keep this vocabulary scoped to
// meals rather than silently weakening free-text searches in every module.
const MEAL_QUESTION_WORDS = new Set('at af fik får få fået have haft did had get got in us served serveret serverede syötiin'.split(' '))
const CATALOG = [
  { id: 'meals', labels: ['Madplan', 'Meal plan', 'Ruokalista'], topic: /madplan|menu|måltid|frokost|kantine|spise|spiste|maden|meal|lunch|canteen|ruokalista|ruoka|lounas|(?:^|[^\p{L}])(?:mad|spist|eat|ate|eating|food|söimme|syömme|syödä)(?=$|[^\p{L}])/u, view: 'meals', fields: 'week/year, Monday–Friday meals' },
  { id: 'projects', labels: ['Projekter', 'Projects', 'Projektit'], topic: /projekt|project|projekti/u, view: 'projects', fields: 'title, description, status, members, creation/completion dates' },
  { id: 'notes', labels: ['Notesbog', 'Notebook', 'Muistikirja'], topic: /notesbog|notebook|noter|note\b|notat|muisti/u, view: 'notebook', fields: 'accessible shared notes and own personal notes, tags, authors, timestamps' },
  { id: 'messages', labels: ['Beskeder', 'Messages', 'Viestit'], topic: /besked|beskeder|mail|message|inbox|indbakke|viesti/u, view: 'email', fields: 'ONLY own incoming/outgoing messages, subject, body, read flag, folders, timestamp' },
  { id: 'announcements', labels: ['Opslagstavle', 'Announcements', 'Ilmoitukset'], topic: /opslag|meddelel|announcement|bulletin|ilmoitus/u, view: 'hub', fields: 'team announcements, title, body, author, timestamp' },
  { id: 'people', labels: ['Teamoversigt', 'Team overview', 'Tiimin yleiskuva'], topic: /medarbejd|kollega|manager|chef|brugernavn|telefon|kontakt|teamoversigt|fødselsdag|birthday|employee|colleague|people|phone|contact|esihenkilö|syntymä|työntekij/u, view: 'team', fields: 'approved team members, names, usernames, work contact, roles and birthdays; NEVER passwords' },
  { id: 'absence', labels: ['Fravær og anmodninger', 'Absence and requests', 'Poissaolot ja pyynnöt'], topic: /fravær|syg|syge|anmodning|godkendelse|afventer|sygemeld|absence|sick|pending|request|approval|poissaolo|sairas|pyyntö/u, view: 'calendar', fields: 'approved absence dates; own requests; manager-only pending requests and authorized details' },
  { id: 'reviews', labels: ['Guide-review', 'Guide review', 'Oppaiden tarkistus'], topic: /review|guide.admin|kladde|revision|arkiver|historik|guide.*version|version.*guide|draft|archive|restore|tarkistus|luonnos/u, view: 'guides', fields: 'own drafts/requests; reviewers authorized requests and archived guides; accessible published guide version history' },
  { id: 'settings', labels: ['Personlige indstillinger', 'Personal settings', 'Omat asetukset'], topic: /dashboard|widget|indstilling|settings|asetus/u, view: 'hub', fields: 'own dashboard widget preferences; no other users preferences' },
  { id: 'modules', labels: ['Moduler', 'Modules', 'Moduulit'], topic: /modul|module|dokumentbibliotek|document library|team.chat|moduuli/u, view: 'hub', fields: 'module availability, capabilities; document library and team chat are unimplemented placeholders' },
  { id: 'administration', labels: ['Administration', 'Administration', 'Hallinta'], topic: /administration|managerpanel|manager.panel|guide.admins|brugeranmod|bruger.*afventer|user.*pending|hallinta/u, view: 'manager', fields: 'manager-only user statuses, shift roles, guide admins and incoming guide access requests; never credentials' },
  { id: 'system', labels: ['App og datalagring', 'App and storage', 'Sovellus ja tallennus'], topic: /datalagr|lagring|datamappe|forbindelse|opdatering|app.version|storage|connection|(?:app|hub).*update|update.*(?:app|hub)|version.*app|tallennus|yhteys/u, view: 'hub', fields: 'app version, online/offline state and pending sync count; no filesystem dumps, credentials or backups' },
  { id: 'games', labels: ['Spilhjørnet', 'Game corner', 'Pelinurkka'], topic: /spilhjørne|hvilke spil|spille|game corner|available games|pelinurkka/u, view: 'games', fields: 'available games and own play counts; public highscores use separate scoreboard tool' },
  { id: 'notifications', labels: ['Notifikationer', 'Notifications', 'Ilmoitukset'], topic: /notifikation|notification|ilmoitukset/u, view: 'hub', fields: 'own unread messages/accessible note alerts; manager/reviewer queues; stored state, not transient dismissed UI state' },
]
const LEGACY = [
  { id: 'shifts', fields: 'shift roles/assignments for authorized people and dates' },
  { id: 'homeOffice', fields: 'home office patterns and date exceptions, approved vacation exclusion' },
  { id: 'vacation', fields: 'approved vacations for authorized people and date ranges' },
  { id: 'highscores', fields: 'public game scoreboards, difficulties and winners' },
  { id: 'guides', fields: 'authorized published guide sections, steps, text and images' },
]
const PLANNING_MODULES = [
  { id: 'shifts', labels: ['Vagtplan', 'Shift schedule', 'Vuorot'], topic: /opgave|vagt|shift|task|assignment|tehtäv|vuoro/u },
  { id: 'homeOffice', labels: ['Hjemmearbejde', 'Home office', 'Etätyö'], topic: /hjemme|home office|from home|etäty|etänä/u },
  { id: 'vacation', labels: ['Ferie', 'Vacation', 'Loma'], topic: /ferie|vacation|holiday|loma/u },
]
const LABELS = {
  da: { empty: 'Ingen tilgængelige registreringer matcher spørgsmålet.', date: 'Hvilken dato eller uge mener du? Du kan også skrive fx “uge 36 2026”.', count: 'Antal matchende registreringer', found: 'Fundet i hubben', total: 'matchende registreringer', more: 'viser', missing: 'Ikke registreret', noAccess: 'Dette modul er ikke tilgængeligt i din valgte hub.', days: ['Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag'], role: { creator: 'Creator', manager: 'Manager', user: 'Bruger' } },
  en: { empty: 'No accessible records match the question.', date: 'Which date or week? You can also write e.g. “week 36 2026”.', count: 'Number of matching records', found: 'Found in the hub', total: 'matching records', more: 'showing', missing: 'Not recorded', noAccess: 'This module is not available in your selected hub.', days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], role: { creator: 'Creator', manager: 'Manager', user: 'User' } },
  fi: { empty: 'Kysymykseen sopivia käytettävissä olevia tietoja ei löytynyt.', date: 'Mitä päivää tai viikkoa tarkoitat? Voit kirjoittaa esimerkiksi ”viikko 36 2026”.', count: 'Vastaavien tietueiden määrä', found: 'Hubista löytyneet tiedot', total: 'vastaavaa tietuetta', more: 'näytetään', missing: 'Ei kirjattu', noAccess: 'Moduuli ei ole käytettävissä valitussa hubissa.', days: ['Maanantai', 'Tiistai', 'Keskiviikko', 'Torstai', 'Perjantai'], role: { creator: 'Creator', manager: 'Esihenkilö', user: 'Käyttäjä' } },
}
const OBSERVER = new Set(['people', 'absence', 'modules', 'shifts', 'homeOffice', 'vacation'])
const MANAGER = user => user.role === 'manager' || user.role === 'admin' || (!user.role && user.isManager === true)
const WIDGETS = ['teamTasks', 'offToday', 'todaysMeal', 'sickToday', 'supplyOff', 'supplyHomeOffice', 'supplySick']

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.modules) || plan.modules.length > 6 || !Array.isArray(plan.terms) || plan.terms.length > 10) throw new Error('Ugyldig lokal søgeplan')
  const known = new Set([...CATALOG, ...LEGACY].map(module => module.id))
  if (plan.modules.some(id => typeof id !== 'string' || !known.has(id)) || plan.terms.some(term => typeof term !== 'string' || term.length > 80)) throw new Error('Ugyldig lokal søgeplan')
  return { modules: [...new Set(plan.modules)], terms: plan.terms.flatMap(terms).slice(0, 15) }
}
function createKnowledge({ readTeam, readShared, creatorEmail, resolveDates, getDiagnostics = () => ({}), getGuides }) {
  const indexedWords = new WeakMap()
  function records(principal, ids, language = 'da', range) {
    const lang = ['da', 'en', 'fi'].indexOf(language); const t = LABELS[language] || LABELS.da
    const output = []
    for (const team of principal.teams) {
      const label = team.abbreviation || team.teamId
      let users
      const getUsers = () => users ||= readTeam(team, 'users') || {}
      const userEntries = () => Object.entries(getUsers()).filter(([key, user]) => user && typeof user === 'object' && (!user.status || user.status === 'approved') && norm(user.email || key) !== norm(creatorEmail()) && user.role !== 'creator')
      const name = email => clean(Object.entries(getUsers()).find(([key, user]) => norm(user?.email || key) === norm(email))?.[1]?.fullName || String(email || '—'), 150)
      const ownUser = Object.entries(getUsers()).find(([key, user]) => norm(user?.email || key) === principal.email)?.[1]
      // Manager privileges apply only inside a real active team, NEVER inside an observer hub.
      const manager = !principal.viewId && (principal.role === 'creator' || MANAGER(ownUser || {}))
      for (const module of [...CATALOG, ...PLANNING_MODULES].filter(module => ids.includes(module.id))) {
        if (principal.viewId && !OBSERVER.has(module.id)) continue
        const title = module.labels[lang < 0 ? 0 : lang]
        const add = (id, heading, body, extra = {}) => output.push({ kind: 'module', moduleId: module.id, recordId: String(id), teamId: team.teamId, title: `${label} · ${title} · ${clean(String(heading), 180)}`, text: clean(body, 24000), ...extra })
        if (module.id === 'shifts') {
          const roles = array(readTeam(team, 'shift-roles'))
          for (const shift of array(readTeam(team, 'shift-assignments'))) {
            if (!shift?.id) continue
            const employee = userEntries().find(([key, user]) => [norm(key), norm(user.email), norm(user.id)].includes(norm(shift.employeeId)))?.[1]
            if (!employee) continue
            const date = clean(shift.date, 10)
            add(shift.id, `${clean(employee.fullName || employee.name)} · ${date}`, `${name(employee.email || shift.employeeId)}\n${roles.find(role => role?.id === shift.roleId)?.name || t.missing}\n${date}`, { start: date, owner: norm(employee.email || shift.employeeId) })
          }
        } else if (module.id === 'homeOffice') {
          const patterns = readTeam(team, 'home-office-patterns') || {}
          const exceptions = array(readTeam(team, 'home-office-exceptions'))
          const vacations = array(readTeam(team, 'vacation-entries')).filter(entry => entry?.status === 'approved')
          for (const [key, user] of userEntries()) {
            const email = norm(user.email || key)
            if (range) {
              const date = new Date(`${range.start}T12:00:00`)
              for (let i = 0; i < 366; i++, date.setDate(date.getDate() + 1)) {
                const current = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
                if (current > range.end) break
                const exception = exceptions.find(item => norm(item?.userEmail) === email && item.date === current)
                const home = exception ? exception.isHomeOffice === true : array(patterns[email]?.weekdays).includes(date.getDay())
                if (!home || vacations.some(item => norm(item.userEmail) === email && clean(item.startDate, 10) <= current && clean(item.endDate, 10) >= current)) continue
                add(`home:${email}:${current}`, `${name(email)} · ${current}`, `${name(email)} · Home office / Hjemmearbejde / Etätyö\n${current}`, { start: current, owner: email })
              }
            } else if (patterns[email]) {
              add(`pattern:${email}`, name(email), `${name(email)}\n${array(patterns[email].weekdays).filter(index => Number.isInteger(index) && index >= 0 && index < 7).map(index => new Intl.DateTimeFormat(language === 'fi' ? 'fi-FI' : language === 'en' ? 'en-GB' : 'da-DK', { weekday: 'long' }).format(new Date(2026, 0, 4 + index, 12))).join(', ')}`, { owner: email })
            }
          }
        } else if (module.id === 'vacation') {
          for (const entry of array(readTeam(team, 'vacation-entries'))) if (entry?.id && entry.status === 'approved') add(entry.id, name(entry.userEmail), `${name(entry.userEmail)} · ${clean(entry.startDate, 10)} → ${clean(entry.endDate, 10)}`, { start: clean(entry.startDate, 10), end: clean(entry.endDate, 10), owner: norm(entry.userEmail) })
        } else if (module.id === 'meals') {
          for (const menu of array(readTeam(team, 'meal-plan-weeks'))) {
            if (!menu || !Number.isInteger(menu.year) || !Number.isInteger(menu.weekNumber)) continue
            // Stored year/week is authoritative; weekStart is occasionally localized.
            const range = require('./assistantDates.cjs').isoWeek(menu.weekNumber, menu.year)
            if (!range) continue
            const meals = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
            add(`${menu.year}-${menu.weekNumber}`, `${menu.year} · ${language === 'da' ? 'uge' : language === 'fi' ? 'viikko' : 'week'} ${menu.weekNumber}`, meals.map((key, i) => `${t.days[i]}: ${clean(menu.meals?.[key]) || t.missing}`).join('\n'), { start: range.start, end: range.end })
          }
        } else if (module.id === 'projects') {
          for (const project of array(readTeam(team, 'projects'))) {
            if (!project?.id) continue
            add(project.id, project.title, `${clean(project.title)}\n${clean(project.description)}\nStatus: ${clean(project.status)}\n${clean(project.createdByName) || name(project.createdBy)}\n${clean(project.createdAt)}${project.completedAt ? ` → ${clean(project.completedAt)}` : ''}\n${array(project.teamMembers).map(member => clean(member.name) || name(member.email)).join(', ')}`, { start: clean(project.createdAt, 10), end: clean(project.completedAt || project.createdAt, 10), owner: norm(project.createdBy), members: array(project.teamMembers).map(member => norm(member.email)), status: project.status })
          }
        } else if (module.id === 'notes') {
          for (const note of array(readTeam(team, 'notebook-notes'))) {
            if (!note?.id || (note.isPersonal !== false && norm(note.creatorEmail) !== principal.email)) continue
            add(note.id, note.title, `${clean(note.content)}\n${array(note.tags).map(tag => clean(tag, 80)).join(', ')}\n${clean(note.creatorName) || name(note.creatorEmail)} · ${clean(note.updatedAt || note.createdAt)}`, { start: clean(note.updatedAt || note.createdAt, 10), owner: norm(note.creatorEmail), personal: note.isPersonal !== false, pinned: note.pinned === true })
          }
        } else if (module.id === 'messages') {
          const folders = array(readTeam(team, 'email-folders')).filter(folder => norm(folder?.userId) === principal.email)
          for (const email of array(readTeam(team, 'emails'))) {
            if (!email?.id || (norm(email.from) !== principal.email && norm(email.to) !== principal.email)) continue
            const date = timestamp(email.timestamp)
            add(email.id, email.subject, `${clean(email.subject)}\n${clean(email.message)}\n${name(email.from)} → ${name(email.to)}\n${date}\n${email.read ? 'Read / Læst / Luettu' : 'Unread / Ulæst / Lukematon'}${email.folderId ? `\n${clean(folders.find(folder => folder.id === email.folderId)?.name)}` : ''}`, { start: date.slice(0, 10), read: email.read === true, from: norm(email.from), to: norm(email.to), starred: email.starred === true })
          }
          for (const folder of folders) add(`folder:${folder.id}`, folder.name, clean(folder.name), { folder: true })
        } else if (module.id === 'announcements') {
          for (const item of array(readTeam(team, 'announcements'))) {
            if (!item?.id) continue
            const date = timestamp(item.createdAt).slice(0, 10)
            add(item.id, item.title, `${clean(item.message)}\n${clean(item.createdByName) || name(item.createdBy)} · ${date}`, { start: date })
          }
        } else if (module.id === 'people') {
          const birthdays = array(readTeam(team, 'employee-birthdays'))
          for (const [key, user] of userEntries()) {
            const email = norm(user.email || (Array.isArray(getUsers()) ? user.id : key))
            const birthday = birthdays.find(item => norm(item.email) === email)
            const role = MANAGER(user) ? 'manager' : 'user'
            add(email, user.fullName || user.name || email, `${clean(user.fullName || user.name)}\n${email}\n${clean(user.username)}\n${clean(user.phone)}\n${t.role[role]}${birthday ? `\n${language === 'da' ? 'Fødselsdag' : language === 'fi' ? 'Syntymäpäivä' : 'Birthday'}: ${clean(birthday.birthday, 10)}` : ''}`, { role, birthday: clean(birthday?.birthday, 10) })
          }
        } else if (module.id === 'absence') {
          for (const [key, type] of [['vacation-entries', 'Ferie / Vacation / Loma'], ['sick-leave-entries', 'Sygemelding / Sick leave / Sairasloma']]) {
            for (const entry of array(readTeam(team, key))) {
              if (!entry?.id) continue
              const own = norm(entry.userEmail) === principal.email
              if (entry.status !== 'approved' && !own && !manager) continue
              add(`${key}:${entry.id}`, `${name(entry.userEmail)} · ${type}`, `${name(entry.userEmail)}\n${type} · ${clean(entry.status)}\n${clean(entry.startDate, 10)} → ${clean(entry.endDate || entry.startDate, 10)}${(own || manager) && !principal.viewId ? `\n${clean(entry.notes || entry.reason)}` : ''}`, { start: clean(entry.startDate, 10), end: clean(entry.endDate || entry.startDate, 10), owner: norm(entry.userEmail), status: entry.status, absenceType: key })
            }
          }
        } else if (module.id === 'reviews') {
          const reviewer = !principal.viewId && (manager || array(readTeam(team, 'guide-admin-emails')).some(email => norm(email) === principal.email))
          if (!principal.viewId) for (const item of array(readTeam(team, 'guide-review-requests'))) {
            if (!item?.id || (!reviewer && norm(item.submittedBy) !== principal.email)) continue
            // Review content is explicitly a draft, never published evidence.
            const draft = item.proposedGuide
            add(`review:${item.id}`, `${item.guideTitle} · ${item.status}`, `REVIEW / KLADDE / LUONNOS — ${clean(item.action)} · ${clean(item.status)}\n${clean(item.changeNote)}\n${clean(item.reviewerComment)}\n${clean(item.submittedByName) || name(item.submittedBy)}${draft ? `\n${clean(draft.content)}\n${array(draft.sections).map(section => `${clean(section.heading)}\n${array(section.steps).map(step => clean(step.text)).join('\n')}`).join('\n')}` : ''}`, { owner: norm(item.submittedBy), status: item.status, draft: true })
          }
          if (reviewer) for (const item of array(readTeam(team, 'archived-guides'))) if (item?.id && item.guide) add(`archive:${item.id}`, `${item.guide.title} · Archive`, `ARKIVERET / ARCHIVED / ARKISTOITU\n${clean(item.guide.content)}`, { archived: true })
          // Do not expose old removed content to ordinary users through version history.
          if (reviewer) for (const guide of array(readTeam(team, 'guides'))) if (/^[\w-]{1,160}$/.test(guide?.id || '')) {
            for (const version of array(readTeam(team, `guide-versions-${guide.id}`))) add(`version:${guide.id}:${version.version}`, `${guide.title} · v${version.version}`, `HISTORIK / HISTORY / HISTORIA\n${clean(version.changeNote)}\n${clean(version.snapshot?.content)}\n${array(version.snapshot?.sections).map(section => `${clean(section.heading)}\n${array(section.steps).map(step => clean(step.text)).join('\n')}`).join('\n')}`, { history: true })
          }
        } else if (module.id === 'settings') {
          const preferences = readTeam(team, `hub-dashboard-${principal.email}`)
          for (const widget of WIDGETS) if (preferences?.[widget]) add(`widget:${widget}`, widget, `${widget}: ${preferences[widget].visible === false ? 'Hidden / Skjult / Piilotettu' : 'Visible / Synlig / Näkyvä'} · ${['compact', 'standard', 'large'].includes(preferences[widget].size) ? preferences[widget].size : 'standard'}`)
        } else if (module.id === 'modules') {
          add('available', 'Supply Chain Hub', CATALOG.filter(item => !principal.viewId || OBSERVER.has(item.id)).map(item => `${item.labels[lang < 0 ? 0 : lang]}: ${item.fields}`).concat(LEGACY.map(item => `${item.id}: ${item.fields}`)).join('\n'))
          if (!principal.viewId) add('placeholders', 'Document library / Team chat', language === 'da' ? 'Dokumentbibliotek og teamchat er endnu ikke implementeret. Der findes ikke moduldata at svare ud fra.' : language === 'fi' ? 'Dokumenttikirjastoa ja tiimichattia ei ole vielä toteutettu. Moduulitietoja ei ole saatavilla.' : 'Document library and team chat are not implemented yet. There is no module data to answer from.')
        } else if (module.id === 'administration' && manager) {
          for (const [key, user] of Object.entries(getUsers())) if (user && norm(user.email || key) !== norm(creatorEmail())) add(`user:${norm(user.email || key)}`, user.fullName || user.email || key, `${clean(user.fullName)}\n${norm(user.email || key)}\nStatus: ${clean(user.status || 'approved')}\n${MANAGER(user) ? t.role.manager : t.role.user}`, { status: user.status || 'approved' })
          for (const role of array(readTeam(team, 'shift-roles'))) if (role?.id) add(`role:${role.id}`, role.name, `${clean(role.name)} · ${clean(role.color, 120)}`)
          for (const email of array(readTeam(team, 'guide-admin-emails'))) if (typeof email === 'string') add(`guide-admin:${norm(email)}`, name(email), `Guide Admin: ${name(email)}`)
          for (const request of array(readTeam(team, 'guide-access-requests'))) if (request?.id) add(`guide-access:${request.id}`, request.guideTitle, `${clean(request.guideTitle)}\n${clean(request.requestingUserName)} · ${clean(request.requestingTeamCode)}\nStatus: ${clean(request.status)}\n${clean(request.expiresAt)}`, { status: request.status })
        } else if (module.id === 'system') {
          const info = getDiagnostics(principal)
          add('status', 'Supply Chain Hub', `Version: ${clean(info.version, 40) || t.missing}\n${info.connected === true ? 'Online' : info.connected === false ? 'Offline' : t.missing}\nPending sync: ${Number.isInteger(info.pendingSync) ? info.pendingSync : t.missing}${principal.role === 'creator' || manager ? `\n${clean(info.dataDir, 1000)}` : ''}`)
        } else if (module.id === 'games') {
          const games = [['Nexi Flyer', 'nexi-flyer-play-counts'], ['Neon Snake', 'neon-snake-play-counts'], ['Brick Break', 'brickbreak-play-counts'], ['Endless Dodger', 'endless-dodger-play-counts'], ['Tetris', 'tetris-play-counts']]
          for (const [game, key] of games) {
            const counts = readTeam(team, key)?.[principal.email]
            const keys = game === 'Tetris' ? ['all'] : ['easy', 'medium', 'hard', 'expert']
            const values = game === 'Tetris' && counts && !Object.hasOwn(counts, 'all') ? { all: ['easy', 'medium', 'hard', 'expert'].reduce((total, id) => total + (Number.isInteger(counts[id]) && counts[id] >= 0 ? counts[id] : 0), 0) } : counts
            add(key, game, `${game}${values && typeof values === 'object' ? `\n${keys.map(difficulty => `${difficulty}: ${Number.isInteger(values[difficulty]) && values[difficulty] >= 0 ? values[difficulty] : t.missing}`).join('\n')}` : `\n${t.missing}`}`)
          }
          add('modern', 'Modern', 'Cube Basher\nThe Librarian 2\nNo persisted game state / Ingen gemt spiltilstand / Ei tallennettua pelitilaa')
        } else if (module.id === 'notifications') {
          for (const email of array(readTeam(team, 'emails'))) if (email?.id && norm(email.to) === principal.email && !email.read) add(`email:${email.id}`, email.subject, `${clean(email.subject)}\n${name(email.from)}\nUnread / Ulæst / Lukematon`)
          const notes = array(readTeam(team, 'notebook-notes'))
          for (const alert of array(readTeam(team, 'notebook-notifications'))) {
            if (!alert?.id || alert.read || norm(alert.originalCreator) !== principal.email) continue
            const note = notes.find(note => note?.id === alert.noteId)
            if (!note || (note.isPersonal !== false && norm(note.creatorEmail) !== principal.email)) continue
            add(`note:${alert.id}`, note.title, `${clean(note.title)}\n${clean(alert.editedByName)} · ${clean(alert.timestamp)}`)
          }
          if (manager) for (const key of ['vacation-entries', 'sick-leave-entries']) for (const entry of array(readTeam(team, key))) if (entry?.id && entry.status === 'pending') add(`${key}:${entry.id}`, name(entry.userEmail), `${name(entry.userEmail)}\n${key} · pending\n${clean(entry.startDate, 10)}`)
          const reviewer = manager || array(readTeam(team, 'guide-admin-emails')).some(email => norm(email) === principal.email)
          if (reviewer) for (const request of array(readTeam(team, 'guide-review-requests'))) if (request?.id && request.status === 'pending') add(`review:${request.id}`, request.guideTitle, `${clean(request.guideTitle)}\nGuide review · pending`)
        }
      }
    }
    if (ids.includes('guides') && getGuides) for (const { guide, team } of getGuides(principal)) {
      if (!guide?.id) continue
      for (const chunk of indexGuide(guide)) {
        const item = { kind: 'guide', moduleId: 'guides', teamId: team.teamId, guideId: guide.id, title: chunk.title, version: chunk.version, revision: chunk.revision, reference: chunk.reference, imageIds: chunk.imageIds, text: chunk.text }
        indexedWords.set(item, chunk.words)
        output.push(item)
      }
    }
    return output
  }
  function query({ principal, question, language, now, plan, page = 0 }) {
    const t = LABELS[language] || LABELS.da
    if (!Number.isInteger(page) || page < 0 || page > 10000) throw new Error('Ugyldig resultatside')
    const q = norm(question)
    const targeted = CATALOG.filter(module => module.topic.test(q)).map(module => module.id)
    const planning = PLANNING_MODULES.filter(module => module.topic.test(q)).map(module => module.id)
    // Combine multiple requested domains; retain old direct handlers for a single
    // ordinary planning question. Explicit plans are still constrained to adapters.
    if (targeted.length || planning.length > 1 || /hvornår|when|fast mønster|fixed pattern/u.test(q)) targeted.push(...planning)
    const available = [...CATALOG, ...PLANNING_MODULES]
    let ids = plan?.modules?.filter(id => available.some(module => module.id === id)) || targeted
    if (ids.includes('absence')) ids = ids.filter(id => id !== 'vacation')
    if (principal.viewId && ids.some(id => !OBSERVER.has(id))) return { mode: 'data', text: t.noAccess, sources: [], contextQuestion: question }
    const range = resolveDates(q, now)
    if (ids.includes('meals') && !range) return { mode: 'data', text: t.date, sources: [], contextQuestion: question }
    const searches = plan ? plan.terms : terms(q).filter(word =>
      !available.some(module => module.topic.test(word)) &&
      !(ids.includes('meals') && MEAL_QUESTION_WORDS.has(word)))
    const requestedPeriod = /uge\s*\d|week\s*\d|viik(?:ko|olla|on)\s*\d|næste|denne|sidste|next|last|today|tomorrow|i dag|i morgen|\d{4}-\d{2}-\d{2}/u.test(q)
    if (requestedPeriod && !range && ids.length) return { mode: 'data', text: t.date, sources: [], contextQuestion: question }
    // Preserve the focused guide parser for guide-only queries; general searches
    // and multi-module requests can combine published guides with other records.
    if (!ids.length && /guide|vejledning|manual|opas|oppaa/u.test(q) && !plan) return null
    // A normal factual search uses current information, not draft proposals or
    // historical snapshots. Do not even read version files unless requested.
    let items = records(principal, ids.length ? [...ids, ...(/guide|vejledning|manual|opas|oppaa/u.test(q) ? ['guides'] : [])] : [...available.filter(module => !['reviews', 'notifications'].includes(module.id)).map(module => module.id), 'guides'], language, range)
    if (/historik|history|historia/u.test(q)) items = items.filter(item => item.moduleId !== 'reviews' || item.history === true)
    if (range) items = items.filter(item => !item.start || (item.start <= range.end && (item.end || item.start) >= range.start))
    if (/ulæst|unread|lukematon/u.test(q)) items = items.filter(item => item.moduleId !== 'messages' || (!item.folder && item.to === principal.email && !item.read))
    if (/indbakke|inbox|saapuneet/u.test(q)) items = items.filter(item => item.moduleId !== 'messages' || (!item.folder && item.to === principal.email))
    if (/sendte|sent|lähetetyt/u.test(q)) items = items.filter(item => item.moduleId !== 'messages' || (!item.folder && item.from === principal.email))
    if (/afventer|pending|odottaa/u.test(q)) items = items.filter(item => !['absence', 'reviews', 'administration'].includes(item.moduleId) || item.status === 'pending')
    if (/ferie|vacation|holiday|loma/u.test(q)) items = items.filter(item => item.moduleId !== 'absence' || item.absenceType === 'vacation-entries')
    if (/syg|sick|sairas/u.test(q)) items = items.filter(item => item.moduleId !== 'absence' || item.absenceType === 'sick-leave-entries')
    if (/færdige|afsluttede|completed|valmiit/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || item.status === 'completed')
    if (/åbne|open|avoimet/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || item.status !== 'completed')
    if (/i gang|igang|in.progress|käynnissä/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || item.status === 'in-progress')
    if (/mine projekter|my projects|omat projektit/u.test(q)) items = items.filter(item => item.moduleId !== 'projects' || item.owner === principal.email || item.members?.includes(principal.email))
    if (/personlige noter|personal notes|omat muistiinpanot/u.test(q)) items = items.filter(item => item.moduleId !== 'notes' || item.personal)
    if (/fælles noter|shared notes/u.test(q)) items = items.filter(item => item.moduleId !== 'notes' || !item.personal)
    if (/manager|chef|esihenkilö/u.test(q)) items = items.filter(item => item.moduleId !== 'people' || item.role === 'manager')
    if (/fødselsdag|birthday|syntymä/u.test(q)) items = items.filter(item => item.moduleId !== 'people' || (item.birthday && (!range || (() => { const dates = [range.start.slice(0, 4), range.end.slice(0, 4)].map(year => `${year}-${item.birthday}`); return dates.some(date => date >= range.start && date <= range.end) })())))
    if (/(?:^|[^\p{L}])(?:jeg|mig|min|mine|my|me|omat|minun)(?=$|[^\p{L}])/u.test(q)) items = items.filter(item => !['shifts', 'homeOffice', 'vacation', 'absence'].includes(item.moduleId) || item.owner === principal.email)
    const filterWords = new Set('ulæste ulæst unread lukematon indbakke inbox saapuneet sendte sent lähetetyt afventer pending odottaa færdige afsluttede completed valmiit åbne open avoimet mine my omat personlige personal manager chef esihenkilö uge week viikko viikolla viikon 2026'.split(' '))
    const meaningful = searches.filter(word => !filterWords.has(word) && !/^\d+$/.test(word) && !(range && resolveDates(word, now)))
    // General free-text search indexes only permission-projected records.
    if (meaningful.length) {
      const ranked = items.map(item => {
        const body = indexedWords.get(item) || new Set(keyWords(`${item.title} ${item.text}`))
        const matches = meaningful.filter(word => body.has(word) || [...body].some(value => value.startsWith(word) && word.length >= 4))
        return { item, score: matches.length }
      }).filter(value => value.score >= Math.min(2, meaningful.length) && value.score / meaningful.length >= 0.5)
      ranked.sort((a, b) => b.score - a.score || (b.item.start || '').localeCompare(a.item.start || ''))
      items = ranked.map(value => value.item)
    } else if (!ids.length) return null
    const total = items.length
    if (!total && !ids.length) return null
    if (/hvor mange|how many|kuinka monta/u.test(q)) return { mode: 'data', text: `${t.count}: ${total}${range ? ` (${range.start} – ${range.end})` : ''}`, sources: [], total, contextQuestion: question }
    const selected = items.slice(page * 8, (page + 1) * 8)
    const sources = selected.map(({ text, ...source }) => source.kind === 'guide' || source.history ? { ...source, text } : source)
    const header = `${t.found}${range ? ` (${range.start} – ${range.end})` : ''} · ${total} ${t.total}${total > 8 ? `; ${t.more} ${page * 8 + 1}–${Math.min((page + 1) * 8, total)}` : ''}`
    const direct = ids.length > 0 && !/forklar|betyder|sammenfat|opsummer|summar|explain|analyser|analyse|hvorfor|why|miksi|selitä/u.test(q)
    return { mode: direct ? 'data' : selected.length && selected.every(item => item.kind === 'guide') ? 'retrieval' : 'knowledge', text: selected.length ? `${header}:\n\n${selected.map((item, i) => `[${i + 1}] ${item.title}\n${item.text.slice(0, direct ? 2400 : 1000)}${item.text.length > (direct ? 2400 : 1000) ? '\n[…] — open source for more' : ''}`).join('\n\n')}` : t.empty, sources, total, nextPage: (page + 1) * 8 < total ? page + 1 : undefined, contextQuestion: question }
  }
  function getRecord(principal, moduleId, recordId, teamId, language) {
    if (![...CATALOG, ...PLANNING_MODULES].some(module => module.id === moduleId)) throw new Error('Ukendt modul')
    if (!principal.teams.some(team => team.teamId === teamId)) throw new Error('Ingen adgang til dette team')
    const range = moduleId === 'homeOffice' && typeof recordId === 'string' ? resolveDates(recordId, new Date()) : undefined
    const item = records({ ...principal, teams: principal.teams.filter(team => team.teamId === teamId) }, [moduleId], language, range).find(item => item.recordId === recordId)
    if (!item) throw new Error('Kilden findes ikke længere, eller du har ikke adgang til den')
    return { title: item.title, text: item.text }
  }
  return { query, getRecord, matchedModules: question => [...CATALOG, ...PLANNING_MODULES].filter(module => module.topic.test(norm(question))).map(module => module.id) }
}
module.exports = { createKnowledge, validatePlan, moduleCatalog: () => [...CATALOG, ...LEGACY].map(({ id, fields }) => ({ id, fields })) }
