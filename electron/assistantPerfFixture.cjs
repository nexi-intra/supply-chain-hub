// Round 13: a realistic team-sized data set for latency measurements (fake people only, deterministic). Added on top of the small bank fixture by createFixture({ scale }).
const FIRST = ['Alma', 'Bent', 'Cecilie', 'Dennis', 'Emil', 'Freja', 'Gunnar', 'Hanne', 'Ivan', 'Jette', 'Karl', 'Lise', 'Mads', 'Nina', 'Ole', 'Pia', 'Rasmus', 'Sofie', 'Tobias', 'Ulla']
const LAST = ['Aagaard', 'Bruun', 'Clausen', 'Damgaard', 'Eriksen', 'Fischer', 'Gregersen', 'Hansen', 'Iversen', 'Jensen', 'Krogh', 'Larsen', 'Madsen', 'Nygaard', 'Olsen', 'Pedersen', 'Qvist', 'Rask', 'Skov', 'Thomsen']
const TASKS = ['pack', 'pick']
const iso = (base, offsetDays) => new Date(base.getTime() + offsetDays * 86400000).toISOString().slice(0, 10)

/** Adds `size` people and proportional shifts, absences, guides, notes, mail, articles and cases to the TCD team and the shared improvement cases. */
function scaleStores(stores, shared, size, now) {
  const team = stores.TCD
  const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const emails = []
  for (let i = 0; i < size; i++) {
    const name = `${FIRST[i % FIRST.length]} ${LAST[Math.floor(i / FIRST.length) % LAST.length]}${i >= 400 ? ` ${Math.floor(i / 400)}` : ''}`
    const email = `p${i}@test`
    emails.push(email)
    team.users[email] = { email, fullName: name, status: 'approved', phone: `555-${String(1000 + i).slice(-4)}` }
  }
  team['shift-roles'].push(...TASKS.map((id, index) => ({ id: `scale-${id}`, name: `Scaled ${id}${index}` })))
  for (let i = 0; i < size * 8; i++) team['shift-assignments'].push({ id: `sx${i}`, employeeId: emails[i % size], roleId: `scale-${TASKS[i % 2]}`, date: iso(base, (i % 45) - 15) })
  for (let i = 0; i < size * 2; i++) {
    const start = (i * 7) % 90 - 30
    team['vacation-entries'].push({ id: `vx${i}`, userEmail: emails[(i * 3) % size], startDate: iso(base, start), endDate: iso(base, start + (i % 5)), status: i % 6 === 0 ? 'pending' : 'approved' })
  }
  for (let i = 0; i < Math.floor(size * 0.75); i++) team['sick-leave-entries'].push({ id: `kx${i}`, userEmail: emails[(i * 5) % size], startDate: iso(base, (i % 40) - 20), endDate: iso(base, (i % 40) - 20), status: 'approved', reason: `scaled reason ${i}` })
  for (let i = 0; i < Math.floor(size * 0.3); i++) team['employee-birthdays'].push({ email: emails[i], fullName: team.users[emails[i]].fullName, birthday: `${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}` })
  for (let i = 0; i < Math.floor(size / 3); i++) team.guides.push({ id: `gx${i}`, title: `Scaled guide ${i} about ${['returns', 'pallets', 'terminals', 'labels', 'forklifts', 'dock doors'][i % 6]}`, version: '1.0', category: ['Terminal', 'Inbound', 'Safety'][i % 3], tags: ['scaled'], author: emails[i % size], responsibleEmail: emails[i % size], createdAt: Date.UTC(2026, 0, 1 + (i % 28)), updatedAt: Date.UTC(2026, 7, 1 + (i % 28)), reviewIntervalMonths: 6, nextReviewAt: Date.UTC(2027, i % 12, 1), sections: Array.from({ length: 4 }, (_, section) => ({ heading: `Section ${section} of guide ${i}`, steps: Array.from({ length: 5 }, (_, step) => ({ text: `Step ${step}: scan the ${['label', 'pallet', 'terminal', 'door'][step % 4]} and confirm in the system for guide ${i}.`, imageIds: [] })) })) })
  for (let i = 0; i < Math.floor(size * 0.75); i++) team['notebook-notes'].push({ id: `nx${i}`, title: `Scaled note ${i}`, content: `Handover remarks ${i}: pallets, labels and dock ${i % 12}.`, creatorEmail: emails[i % size], creatorName: team.users[emails[i % size]].fullName, isPersonal: i % 4 === 0, tags: ['scaled', `t${i % 9}`], updatedAt: iso(base, -(i % 60)) })
  for (let i = 0; i < size * 1.5; i++) team.emails.push({ id: `ex${i}`, from: emails[i % size], to: i % 3 === 0 ? 'me@test' : emails[(i + 1) % size], subject: `Scaled mail ${i}`, message: `Please check dock ${i % 12} before noon (${i}).`, read: i % 2 === 0, timestamp: `${iso(base, -(i % 30))}T08:00:00.000Z` })
  for (let i = 0; i < Math.floor(size / 8); i++) team['knowledge-articles'].push({ id: `kx${i}`, title: `Scaled article ${i}`, version: '1.00', language: 'en', category: 'Error Codes', tags: ['scaled'], sections: [{ heading: `Code ${i}`, steps: Array.from({ length: 6 }, (_, step) => ({ text: `${i}:${step} | Reason ${step} | Explanation of scaled code ${i}.`, imageIds: [] })) }] })
  for (let i = 0; i < Math.floor(size / 5); i++) team.announcements.push({ id: `ax${i}`, title: `Scaled announcement ${i}`, message: `Dock ${i % 12} is closed.`, createdBy: 'anne@test', createdAt: `${iso(base, -(i % 20))}T07:00:00.000Z` })
  for (let i = 0; i < Math.floor(size / 6); i++) shared['improvement-cases'].push({ id: `ix${i}`, title: `Scaled improvement ${i}`, problem: 'p', proposal: 'q', category: 'process', status: ['new', 'assessment', 'in-progress', 'completed'][i % 4], priority: 'low', createdBy: emails[i % size], createdByName: team.users[emails[i % size]].fullName, originTeamCode: 'TCD', createdAt: `${iso(base, -(i % 50))}T08:00:00.000Z`, assignments: [], history: [] })
}

module.exports = { scaleStores }
