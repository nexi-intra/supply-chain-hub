// Hubert's live answers about Optælling (Lagerstyring) for TCD and TRR: the status in progress, the counts, materials with a
// difference, SAP documents waiting, who counts what and the last locked status. Runs in the main process next to the
// warehouse services and reads through them as the signed-in Hub person, so the module's own rules apply: own team only,
// other hubs are refused. Read only: write requests get "I only read" and a button to Optælling; how-to questions,
// SAP transaction codes and everything else are left to Hubert's guides.
const { isHowToQuestion } = require('./assistantAppGuide.cjs')

const B = body => new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, 'u')
const norm = value => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()

const DOC_WORDS = String.raw`sap-?dokument\p{L}*|sap documents?|sap-asiakirj\p{L}*|optællingsdokument\p{L}*|count documents?|inventeringsdokument\p{L}*|inventointiasiakirj\p{L}*`
const TOPIC = B(String.raw`optæll\p{L}*|lagerstyring\p{L}*|stock[ -]?counts?|stocktake|stock taking|warehouse management|inventering\p{L}*|inventoin\p{L}*|varastonhallin\p{L}*|lagerstyrning\p{L}*|${DOC_WORDS}`)
const DOCS = B(DOC_WORDS)
// SAP codes ("MI31 optællingsdokument") are the team's own SAP guides, not Optælling's figures.
const CODE = B(String.raw`mi\d{2}|mb\d{2}|iq\d{2}|zms_[\p{L}\d_]+`)
const POLITE = /^(?:kan du|vil du|kunne du|can you|could you|would you|please|voitko|voisitko|vill du|skulle du)\s+/u
const WRITE = new RegExp(String.raw`^(?:opret\p{L}*|start\p{L}*|slet\p{L}*|godkend\p{L}*|lås|låse|bogfør\p{L}*|afslut\p{L}*|genåbn\p{L}*|scan\p{L}*|print\p{L}*|luo|luon|aloita|poista|hyväksy|lukitse|kirjaa|skapa|starta|ta bort|radera|godkänn|bokför|avsluta|create|delete|approve|lock|unlock|post|close|reopen|remove)(?![\p{L}\p{N}])`, 'u')
const OPEN = /^(?:åbn|vis mig|gå til|open|show me|go to|take me to|avaa|näytä|vie minut|öppna|visa mig|gå till)(?![\p{L}\p{N}])/u
const ARCHIVE_WORD = B(String.raw`arkiv\p{L}*|archive\p{L}*|arkisto\p{L}*`)
const ARCHIVE = B(String.raw`arkiv\p{L}*|archive\p{L}*|arkisto\p{L}*|låst\p{L}*|locked|lukitu\p{L}*|lukittu\p{L}*`)
const WHO = B(String.raw`hvem|who|kuka|ketkä|vem`)
const DIFF = B(String.raw`difference\p{L}*|differens\p{L}*|erotu\p{L}*|erotus|afvigelse\p{L}*|discrepanc\p{L}*`)
const PLURAL = B(String.raw`optællinger\p{L}*|stock counts|counts|inventoinnit|inventointeja|inventeringar\p{L}*`)
// "Kuinka pitkällä" / "how far" ask for figures even though they start like a how-to question.
const HOW_FAR = B(String.raw`hvor langt|how far|kuinka pitkällä|hur långt|fremdrift\p{L}*|progress|edistym\p{L}*|framsteg`)
const PROGRESS = B(String.raw`hvor langt|fremdrift\p{L}*|status|how far|progress|how is|kuinka pitkällä|edistym\p{L}*|tilanne|hur långt|framsteg|hvor mange|how many|montako|hur många|procent|percent|prosent\p{L}*`)

/** What a question asks about Optælling, or null when it is not about Optælling's own data. */
function warehouseIntent(question) {
  const q = norm(question)
  if (!q || !TOPIC.test(q) || CODE.test(q)) return null
  const bare = q.replace(POLITE, '')
  if (WRITE.test(bare)) return { intent: 'write' }
  if (OPEN.test(bare)) return { intent: 'open', archive: ARCHIVE_WORD.test(bare) }
  if (isHowToQuestion(question) && !HOW_FAR.test(q)) return null
  if (DOCS.test(q)) return { intent: 'documents' }
  if (WHO.test(q)) return { intent: 'who' }
  if (ARCHIVE.test(q)) return { intent: 'archive' }
  if (DIFF.test(q)) return { intent: 'differences' }
  if (PLURAL.test(q)) return { intent: 'counts' }
  if (PROGRESS.test(q)) return { intent: 'status' }
  return null
}

const LOCALES = { da: 'da-DK', en: 'en-GB', fi: 'fi-FI', sv: 'sv-SE' }
const TEXT = {
  da: {
    name: 'Optælling', archiveName: 'Arkiv',
    only: 'Optælling (Lagerstyring) findes kun i TCD- og TRR-hubben. Åbn TCD- eller TRR-hubben for at se optællingerne.',
    readOnly: 'Jeg kan kun læse i Optælling. Opret, ret, godkend, lås og bogfør gør du selv i Optælling.',
    unavailable: 'Optællingens data kan ikke læses lige nu. Prøv igen om lidt.',
    open: 'Åbn Optælling', openItem: name => `Åbn "${name}"`, openArchive: 'Åbn Arkiv', here: 'Her kan du åbne Optælling.',
    noStatus: 'Der er ingen igangværende status i Optælling lige nu.', lastLocked: (name, date) => ` Seneste låste status: ${name} (låst ${date}).`,
    status: (s, p) => `${s.name}: ${p.percent} samlet fremdrift (${p.reached} af ${p.total} serienumre og tællelinjer). ${s.progress.closed} af ${s.progress.counts} optællinger er afsluttet. Værdidifference indtil nu: ${p.value}`,
    countsTitle: name => `Optællinger i ${name}:`, noCounts: 'Der er ingen optællinger i statussen endnu.',
    countLine: (c, percent) => `• ${c.name} — ${c.status === 'open' ? 'Åben' : 'Afsluttet'} · ${percent} · ${c.owner?.name || ''}`,
    diffTitle: name => `Materialer med difference i ${name} (største værdi først):`, noDiff: 'Ingen materialer har difference lige nu.',
    diffLine: (r, qty, value, approval) => `• ${r.material} (${r.count}): ${qty} stk. · ${value} · ${approval}`,
    approvals: { approved: 'godkendt', posted: 'bogført i SAP', submitted: 'sendt til godkendelse', returned: 'sendt tilbage', none: 'ikke godkendt' },
    docsTitle: 'SAP-dokumenter, der venter:', noDocs: 'Ingen SAP-dokumenter venter lige nu.',
    next: { print: 'venter på print (manager)', count: 'venter på, at en admin lægger antal på', post: 'venter på bogføring (manager)' },
    docLine: (d, count, next) => `• ${d.docNo || '–'} (${count}, ${d.sloc || '–'}): ${next}`,
    whoTitle: 'Hvem tæller hvad lige nu:', nobody: 'Ingen tæller lige nu.',
    lockLine: (l, count) => `• ${l.holder.name} tæller ${l.material} (${count})${l.helpers?.length ? ` sammen med ${l.helpers.map(h => h.name).join(', ')}` : ''}`,
    claimLine: (c, count) => `• ${c.name} har låst område ${c.area} (${count})`,
    noLocked: 'Der er ingen låste statusser i Arkivet endnu.',
    archive: (s, date, t) => `${s.name} (låst ${date}): difference ${t.qty} af SAP-beholdningen i stk. og ${t.value} i kroner (over og under tæller begge med).`,
    money: value => `${value} kr.`, pcs: 'stk.',
  },
  en: {
    name: 'Stock count', archiveName: 'Archive',
    only: 'Stock count (Warehouse Management) is only in the TCD and TRR hubs. Open the TCD or TRR hub to see the counts.',
    readOnly: 'I can only read in Stock count. You create, edit, approve, lock and post in Stock count yourself.',
    unavailable: 'The stock count data cannot be read right now. Try again in a moment.',
    open: 'Open Stock count', openItem: name => `Open "${name}"`, openArchive: 'Open Archive', here: 'You can open Stock count here.',
    noStatus: 'There is no status in progress in Stock count right now.', lastLocked: (name, date) => ` Last locked status: ${name} (locked ${date}).`,
    status: (s, p) => `${s.name}: ${p.percent} overall progress (${p.reached} of ${p.total} serial numbers and count lines). ${s.progress.closed} of ${s.progress.counts} counts are closed. Value difference so far: ${p.value}`,
    countsTitle: name => `Counts in ${name}:`, noCounts: 'There are no counts in the status yet.',
    countLine: (c, percent) => `• ${c.name} — ${c.status === 'open' ? 'Open' : 'Closed'} · ${percent} · ${c.owner?.name || ''}`,
    diffTitle: name => `Materials with a difference in ${name} (largest value first):`, noDiff: 'No materials have a difference right now.',
    diffLine: (r, qty, value, approval) => `• ${r.material} (${r.count}): ${qty} pcs · ${value} · ${approval}`,
    approvals: { approved: 'approved', posted: 'posted in SAP', submitted: 'sent for approval', returned: 'sent back', none: 'not approved' },
    docsTitle: 'SAP documents waiting:', noDocs: 'No SAP documents are waiting right now.',
    next: { print: 'waiting for print (manager)', count: 'waiting for an admin to enter the quantity', post: 'waiting for posting (manager)' },
    docLine: (d, count, next) => `• ${d.docNo || '–'} (${count}, ${d.sloc || '–'}): ${next}`,
    whoTitle: 'Who is counting what right now:', nobody: 'Nobody is counting right now.',
    lockLine: (l, count) => `• ${l.holder.name} is counting ${l.material} (${count})${l.helpers?.length ? ` with ${l.helpers.map(h => h.name).join(', ')}` : ''}`,
    claimLine: (c, count) => `• ${c.name} has locked area ${c.area} (${count})`,
    noLocked: 'There are no locked statuses in the Archive yet.',
    archive: (s, date, t) => `${s.name} (locked ${date}): difference ${t.qty} of the SAP stock in pieces and ${t.value} in DKK (over and under both count).`,
    money: value => `DKK ${value}`, pcs: 'pcs',
  },
  fi: {
    name: 'Inventointi', archiveName: 'Arkisto',
    only: 'Inventointi (Varastonhallinta) on vain TCD- ja TRR-hubissa. Avaa TCD- tai TRR-hub nähdäksesi inventoinnit.',
    readOnly: 'Voin vain lukea inventointia. Luot, muokkaat, hyväksyt, lukitset ja kirjaat itse inventoinnissa.',
    unavailable: 'Inventoinnin tietoja ei voi lukea juuri nyt. Yritä hetken päästä uudelleen.',
    open: 'Avaa inventointi', openItem: name => `Avaa "${name}"`, openArchive: 'Avaa arkisto', here: 'Voit avata inventoinnin tästä.',
    noStatus: 'Inventoinnissa ei ole käynnissä olevaa statusta juuri nyt.', lastLocked: (name, date) => ` Viimeisin lukittu status: ${name} (lukittu ${date}).`,
    status: (s, p) => `${s.name}: kokonaisedistyminen ${p.percent} (${p.reached}/${p.total} sarjanumeroa ja laskentariviä). ${s.progress.closed}/${s.progress.counts} inventointia on päätetty. Arvoero tähän mennessä: ${p.value}`,
    countsTitle: name => `Inventoinnit statuksessa ${name}:`, noCounts: 'Statuksessa ei ole vielä inventointeja.',
    countLine: (c, percent) => `• ${c.name} — ${c.status === 'open' ? 'Avoin' : 'Päätetty'} · ${percent} · ${c.owner?.name || ''}`,
    diffTitle: name => `Materiaalit, joilla on erotus statuksessa ${name} (suurin arvo ensin):`, noDiff: 'Millään materiaalilla ei ole erotusta juuri nyt.',
    diffLine: (r, qty, value, approval) => `• ${r.material} (${r.count}): ${qty} kpl · ${value} · ${approval}`,
    approvals: { approved: 'hyväksytty', posted: 'kirjattu SAP:iin', submitted: 'lähetetty hyväksyttäväksi', returned: 'palautettu', none: 'ei hyväksytty' },
    docsTitle: 'Odottavat SAP-asiakirjat:', noDocs: 'Mitkään SAP-asiakirjat eivät odota juuri nyt.',
    next: { print: 'odottaa tulostusta (manager)', count: 'odottaa, että admin syöttää määrän', post: 'odottaa kirjausta (manager)' },
    docLine: (d, count, next) => `• ${d.docNo || '–'} (${count}, ${d.sloc || '–'}): ${next}`,
    whoTitle: 'Kuka laskee mitä juuri nyt:', nobody: 'Kukaan ei laske juuri nyt.',
    lockLine: (l, count) => `• ${l.holder.name} laskee materiaalia ${l.material} (${count})${l.helpers?.length ? `, mukana ${l.helpers.map(h => h.name).join(', ')}` : ''}`,
    claimLine: (c, count) => `• ${c.name} on lukinnut alueen ${c.area} (${count})`,
    noLocked: 'Arkistossa ei ole vielä lukittuja statuksia.',
    archive: (s, date, t) => `${s.name} (lukittu ${date}): erotus ${t.qty} SAP-saldosta kappaleina ja ${t.value} kruunuina (yli ja ali lasketaan molemmat).`,
    money: value => `${value} DKK`, pcs: 'kpl',
  },
  sv: {
    name: 'Inventering', archiveName: 'Arkiv',
    only: 'Inventering (Lagerstyrning) finns bara i TCD- och TRR-hubben. Öppna TCD- eller TRR-hubben för att se inventeringarna.',
    readOnly: 'Jag kan bara läsa i inventeringen. Du skapar, ändrar, godkänner, låser och bokför själv i inventeringen.',
    unavailable: 'Inventeringens data kan inte läsas just nu. Försök igen om en stund.',
    open: 'Öppna inventeringen', openItem: name => `Öppna "${name}"`, openArchive: 'Öppna arkivet', here: 'Här kan du öppna inventeringen.',
    noStatus: 'Det finns ingen pågående status i inventeringen just nu.', lastLocked: (name, date) => ` Senaste låsta status: ${name} (låst ${date}).`,
    status: (s, p) => `${s.name}: ${p.percent} totalt (${p.reached} av ${p.total} serienummer och räknerader). ${s.progress.closed} av ${s.progress.counts} inventeringar är avslutade. Värdedifferens hittills: ${p.value}`,
    countsTitle: name => `Inventeringar i ${name}:`, noCounts: 'Det finns inga inventeringar i statusen ännu.',
    countLine: (c, percent) => `• ${c.name} — ${c.status === 'open' ? 'Öppen' : 'Avslutad'} · ${percent} · ${c.owner?.name || ''}`,
    diffTitle: name => `Material med differens i ${name} (största värde först):`, noDiff: 'Inga material har differens just nu.',
    diffLine: (r, qty, value, approval) => `• ${r.material} (${r.count}): ${qty} st. · ${value} · ${approval}`,
    approvals: { approved: 'godkänt', posted: 'bokfört i SAP', submitted: 'skickat för godkännande', returned: 'skickat tillbaka', none: 'inte godkänt' },
    docsTitle: 'SAP-dokument som väntar:', noDocs: 'Inga SAP-dokument väntar just nu.',
    next: { print: 'väntar på utskrift (manager)', count: 'väntar på att en admin lägger in antal', post: 'väntar på bokföring (manager)' },
    docLine: (d, count, next) => `• ${d.docNo || '–'} (${count}, ${d.sloc || '–'}): ${next}`,
    whoTitle: 'Vem räknar vad just nu:', nobody: 'Ingen räknar just nu.',
    lockLine: (l, count) => `• ${l.holder.name} räknar ${l.material} (${count})${l.helpers?.length ? ` tillsammans med ${l.helpers.map(h => h.name).join(', ')}` : ''}`,
    claimLine: (c, count) => `• ${c.name} har låst område ${c.area} (${count})`,
    noLocked: 'Det finns inga låsta statusar i arkivet ännu.',
    archive: (s, date, t) => `${s.name} (låst ${date}): differens ${t.qty} av SAP-saldot i antal och ${t.value} i kronor (över och under räknas båda).`,
    money: value => `${value} DKK`, pcs: 'st.',
  },
}

const DIFF_LIMIT = 15

function createWarehouseAssistant({ userFor, counts, piDocs }) {
  async function answer({ event, question, language }) {
    const asked = warehouseIntent(question)
    if (!asked) return null
    const lang = TEXT[language] ? language : 'da'
    const t = TEXT[lang]
    const number = (value, digits = 0) => new Intl.NumberFormat(LOCALES[lang], { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value || 0).replace(/−/g, '-')
    const percent = value => `${new Intl.NumberFormat(LOCALES[lang], { maximumFractionDigits: 2 }).format(value || 0)} %`
    const money = value => t.money(number(value, 2))
    const date = ms => (Number.isFinite(ms) ? new Date(ms).toLocaleDateString(LOCALES[lang]) : '–')
    const reply = (text, navigation, user) => ({ mode: 'data', text, sources: user ? [{ kind: 'warehouse', teamId: user.team, title: `${user.team} · ${t.name}` }] : [], contextQuestion: question, ...(navigation ? { navigation } : {}) })
    const toModule = { view: 'warehouse', params: { tab: 'counts' }, label: t.open }
    const toStatus = (status, archive) => ({ view: 'warehouse', params: { ...(archive ? { tab: 'archive' } : {}), itemId: `status:${status.id}` }, label: t.openItem(status.name) })

    let user
    try {
      user = await userFor(event)
    } catch (error) {
      if (error?.code === 'WAREHOUSE_TEAM_NOT_ALLOWED') return reply(t.only)
      throw error
    }
    // Hubert reads only; changes are made in Optælling itself, where the module's own checks and confirmations apply.
    if (asked.intent === 'write') return reply(t.readOnly, toModule, user)

    try {
      const overview = await counts.statusOverview(user)
      const active = overview.active
      const locked = overview.statuses.filter(status => status.state === 'locked').sort((a, b) => (b.lockedAt || 0) - (a.lockedAt || 0))
      if (asked.intent === 'open') {
        if (asked.archive) return reply(t.here, { view: 'warehouse', params: { tab: 'archive' }, label: t.openArchive }, user)
        const q = norm(question)
        const named = (active?.counts || []).filter(count => count.name && q.includes(norm(count.name))).sort((a, b) => b.name.length - a.name.length)[0]
        return reply(t.here, named ? { view: 'warehouse', params: { itemId: named.id }, label: t.openItem(named.name) } : toModule, user)
      }
      if (asked.intent === 'archive') {
        const last = locked[0]
        if (!last) return reply(t.noLocked, toModule, user)
        const archive = await counts.statusArchive(user, last.id)
        return reply(t.archive(last, date(last.lockedAt), { qty: percent(archive.totals.absPercent), value: percent(archive.totals.valuePercent) }), toStatus(last, true), user)
      }
      if (!active) return reply(`${t.noStatus}${locked[0] ? t.lastLocked(locked[0].name, date(locked[0].lockedAt)) : ''}`, toModule, user)

      if (asked.intent === 'status') {
        const p = active.progress
        // "0,00 kr." already ends the sentence.
        const sentence = text => (text.endsWith('.') ? text : `${text}.`)
        return reply(sentence(t.status(active, { percent: percent(p.percent), reached: number(p.reached), total: number(p.total), value: money(p.valueDiff) })), toStatus(active), user)
      }
      if (asked.intent === 'counts') {
        const lines = active.counts.map(count => t.countLine(count, count.summary ? percent(count.summary.percent) : '–'))
        return reply(lines.length ? `${t.countsTitle(active.name)}\n${lines.join('\n')}` : t.noCounts, toStatus(active), user)
      }
      if (asked.intent === 'documents') {
        const lines = []
        for (const count of active.counts) {
          const list = await piDocs.list(user, count.id)
          for (const doc of list.docs) if (doc.status !== 'deleted' && doc.next && t.next[doc.next]) lines.push(t.docLine(doc, count.name, t.next[doc.next]))
        }
        return reply(lines.length ? `${t.docsTitle}\n${lines.join('\n')}` : t.noDocs, toStatus(active), user)
      }
      const views = []
      for (const count of active.counts) {
        if (asked.intent === 'who' && count.status !== 'open') continue
        views.push({ count, view: await counts.readCount(user, count.id) })
      }
      if (asked.intent === 'who') {
        const lines = views.flatMap(({ count, view }) => [...view.materialLocks.map(lock => t.lockLine(lock, count.name)), ...view.claims.map(claim => t.claimLine(claim, count.name))])
        return reply(lines.length ? `${t.whoTitle}\n${lines.join('\n')}` : t.nobody, toStatus(active), user)
      }
      // Differences: one line per material and count, the largest value first.
      const byMaterial = new Map()
      for (const { count, view } of views) {
        for (const row of view.rows) {
          if (!row.diff) continue
          const key = `${count.id}|${row.material}`
          const item = byMaterial.get(key) || { material: row.material, count: count.name, diff: 0, valueDiff: 0, approval: view.approvals?.[row.material]?.status || 'none' }
          item.diff += row.diff
          item.valueDiff += row.valueDiff || 0
          byMaterial.set(key, item)
        }
      }
      const rows = [...byMaterial.values()].filter(item => item.diff !== 0).sort((a, b) => Math.abs(b.valueDiff) - Math.abs(a.valueDiff) || Math.abs(b.diff) - Math.abs(a.diff)).slice(0, DIFF_LIMIT)
      const lines = rows.map(item => t.diffLine(item, `${item.diff > 0 ? '+' : ''}${number(item.diff)}`, money(item.valueDiff), t.approvals[item.approval] || t.approvals.none))
      return reply(lines.length ? `${t.diffTitle(active.name)}\n${lines.join('\n')}` : t.noDiff, toStatus(active), user)
    } catch (error) {
      console.error('Hubert: Optælling unavailable', error?.code || error?.message)
      return reply(t.unavailable, toModule, user)
    }
  }
  return { answer }
}

module.exports = { createWarehouseAssistant, warehouseIntent }
