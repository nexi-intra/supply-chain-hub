// Tegningen af lageret for one hub: admins edit one draft (autosaved), preview what a publish does to the places and
// publish it – the places and the drawing are written in one transaction. Everyone in the hub reads the published drawing.
const { normalizeDraft } = require('./layout.cjs')
const { locationKey } = require('./model.cjs')
const { planPublish, applyPublish } = require('./publish.cjs')

const VERSIONS_KEPT = 20

const lower = value => String(value || '').trim().toLowerCase()
const codeError = (code, message) => Object.assign(new Error(message || code), { code })
const noDraft = () => codeError('LAYOUT_NO_DRAFT', 'Der er ingen kladde til tegningen')
const emptyLayout = () => ({ version: 0, hall: { w: 59, h: 68 }, notes: '', items: [] })
// A draft stored before revisions existed counts as revision 0.
const revOf = draft => draft?.rev ?? 0
// The draft written by a publish or a discard belongs to no one yet: free while nobody has saved it since (a 1.6.6
// takeover raises the revision and so ends it). editedBy stays, because 1.6.6 needs it.
const released = draft => ({ ...draft, free: { rev: revOf(draft) } })
const isFree = draft => draft?.free?.rev === revOf(draft)
/** The draft's content as JSON with sorted keys: what an autosave compares, without revision and editor. */
const contentOf = draft => {
  const { rev, editedBy, editedAt, ...content } = draft
  return JSON.stringify(content, (key, value) => (value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(name => [name, value[name]]))
    : value))
}

function createLayoutService({ repo, locations, now = Date.now }) {
  const by = user => ({ email: lower(user.email), name: user.fullName || user.email })

  /** A new draft of a drawing: without its publish stamp, building on `basedOn`, with the drawing's outside decisions. */
  function draftFrom(drawing, basedOn, user, rev = 1) {
    const { publishedAt, publishedBy, outside, ...rest } = drawing
    return { ...rest, basedOn, rev, decisions: { outside: outside ?? [], remove: [] }, editedBy: by(user), editedAt: now() }
  }

  /** LAYOUT_DRAFT_BUSY when another admin stands as the draft's editor and the caller does not take over. */
  function checkEditor(current, editor, takeOver) {
    if (current?.editedBy && current.editedBy.email !== editor.email && takeOver !== true && !isFree(current)) {
      throw codeError('LAYOUT_DRAFT_BUSY', `${current.editedBy.name} redigerer tegningen`)
    }
  }

  async function layout(user) {
    const team = locations.teamOf(user)
    return { layout: (await repo.readLayout(team)).layout }
  }

  async function draft(user) {
    const team = await locations.requireAdmin(user)
    const stored = await repo.readLayout(team)
    return { draft: stored.draft, version: stored.layout?.version ?? 0 }
  }

  async function startDraft(user) {
    const team = await locations.requireAdmin(user)
    const { layout: published } = await repo.readLayout(team)
    const started = await repo.writeDraft(team, current => (current ? undefined : draftFrom(published ?? emptyLayout(), published?.version ?? 0, user)))
    return { draft: started }
  }

  /**
   * Autosave: the draft must be saved on the stored revision (LAYOUT_STALE when another PC saved meanwhile); the revision
   * goes up only when the content changed. `takeOver` without a draft makes the caller the editor of the stored draft.
   */
  async function saveDraft(user, { draft: raw, takeOver = false } = {}) {
    const team = await locations.requireAdmin(user)
    const editedBy = by(user)
    const editedAt = now()
    if (raw == null && takeOver === true) {
      const taken = await repo.writeDraft(team, current => {
        if (!current) return undefined
        const { free: _free, ...rest } = current
        return { ...rest, rev: revOf(current) + 1, editedBy, editedAt }
      })
      if (!taken) throw noDraft()
      return { editedAt, rev: taken.rev, draft: taken }
    }
    // basedOn is never taken from the editor: it stays the stored draft's (the editor's is only checked below).
    const checked = normalizeDraft({ ...raw, basedOn: 0 })
    // meta.layout is written with the drawing; cheaper than reading it and its versions on every autosave.
    const published = (await repo.meta(team)).layout?.version ?? 0
    let stale = false
    const saved = await repo.writeDraft(team, current => {
      // The editor's content must build on the stored draft's drawing (the published one when a publish deleted it), even on a takeover.
      if (raw?.basedOn !== (current?.basedOn ?? published)) { stale = true; return undefined }
      checkEditor(current, editedBy, takeOver)
      if (current && raw.rev !== revOf(current)) throw codeError('LAYOUT_STALE', 'Kladden er gemt et andet sted imens – hent den nye')
      const next = { ...checked, basedOn: current?.basedOn ?? published }
      const rev = !current ? 1 : revOf(current) + (contentOf(normalizeDraft(current)) === contentOf(next) ? 0 : 1)
      return { ...next, rev, editedBy, editedAt }
    })
    if (stale) {
      const { layout: latest } = await repo.readLayout(team)
      throw codeError('LAYOUT_STALE', `Tegningen er udgivet af ${latest?.publishedBy?.name || 'en anden'} imens – hent den nye og ret igen`)
    }
    return { editedAt, rev: saved.rev }
  }

  /** Discards the draft and starts the next one from the published drawing in the same write (the editor shows it at once). */
  async function discardDraft(user) {
    const team = locations.teamOf(user)
    const [, { layout: published }] = await Promise.all([locations.requireAdmin(user), repo.readLayout(team)])
    const editor = by(user)
    // A revision above the discarded draft's, so a PC still holding that one cannot save it back.
    const draft = await repo.writeDraft(team, current => { checkEditor(current, editor, false); return released(draftFrom(published ?? emptyLayout(), published?.version ?? 0, user, revOf(current) + 1)) })
    return { ok: true, draft }
  }

  async function previewPublish(user) {
    const team = await locations.requireAdmin(user)
    const [{ layout: published, draft: stored }, state] = await Promise.all([repo.readLayout(team), repo.read(team)])
    if (!stored) throw noDraft()
    return { ...planPublish({ next: normalizeDraft(stored), previous: published, state, team }), rev: revOf(stored) }
  }

  /** Publishes the stored draft when it is still the revision `rev` the admin previewed. */
  async function publish(user, { rev } = {}) {
    const team = await locations.requireAdmin(user)
    const publishedBy = by(user)
    return repo.transact(team, { withLayout: true, snapshot: false }, tx => {
      if (!tx.draft) throw noDraft()
      // Only the plan the editing admin has seen is published; another admin takes over (and so previews) first.
      checkEditor(tx.draft, publishedBy, false)
      const next = normalizeDraft(tx.draft)
      const previous = tx.layout?.version ?? 0
      if (next.basedOn !== previous) throw codeError('LAYOUT_STALE', 'Tegningen er udgivet af en anden imens – hent den nye og ret igen')
      if (revOf(tx.draft) !== rev) throw codeError('LAYOUT_STALE', 'Kladden er ændret efter oversigten – se den igen')
      const plan = planPublish({ next, previous: tx.layout, state: tx, team })
      // Once published, places are only made on the drawing: a drawing without them would leave the whole list outside for good.
      const listed = Object.keys(tx.locations).length
      if (!plan.linked.length && listed) throw codeError('LAYOUT_BLOCKED', `Tegningen har ingen pladser – alle ${listed} pladser ville stå uden for tegningen`)
      const publishedAt = now()
      const { linked } = applyPublish(tx, plan, { at: publishedAt, by: publishedBy })
      const version = previous + 1
      if (tx.layout) tx.layoutVersions = [tx.layout, ...tx.layoutVersions].slice(0, VERSIONS_KEPT)
      const { basedOn, rev: _rev, decisions, ...drawing } = next
      const stillOutside = new Set(plan.outside.map(entry => locationKey(entry.name)))
      const outside = decisions.outside.filter(name => stillOutside.has(locationKey(name)))
      tx.layout = { ...drawing, outside, version, publishedAt, publishedBy }
      // The next draft starts from the new drawing in the same write, so the editor shows it without another save.
      tx.draft = released(draftFrom(tx.layout, version, user))
      tx.meta.layout = { version, linked }
      const { create, rename, change, remove } = plan.counts
      tx.event({
        type: 'layout', by: publishedBy, changes: { version: [previous, version] }, counts: { create, rename, change, remove },
        detail: {
          created: plan.create.map(entry => entry.name),
          renamed: plan.rename.map(entry => [entry.from, entry.to]),
          removed: plan.remove.map(entry => entry.name),
          changed: plan.change.map(entry => entry.name),
        },
      })
      return { version, counts: plan.counts, draft: tx.draft }
    })
  }

  async function versions(user) {
    const team = await locations.requireAdmin(user)
    const stored = (await repo.readLayout(team)).versions
    return { versions: stored.map(({ version, publishedAt, publishedBy }) => ({ version, publishedAt, publishedBy })) }
  }

  async function openVersion(user, { version, takeOver = false } = {}) {
    const team = await locations.requireAdmin(user)
    const { layout: published, versions: stored } = await repo.readLayout(team)
    const old = [published, ...stored].find(entry => entry && entry.version === version)
    if (!old) throw codeError('LAYOUT_INVALID', `Version ${version} af tegningen findes ikke længere`)
    const editor = by(user)
    const opened = await repo.writeDraft(team, current => {
      checkEditor(current, editor, takeOver)
      // A revision above the replaced draft's, so a PC still holding that one cannot save over the opened version.
      return draftFrom(old, published?.version ?? 0, user, revOf(current) + 1)
    })
    return { draft: opened }
  }

  return { layout, draft, startDraft, saveDraft, discardDraft, previewPublish, publish, versions, openVersion }
}

module.exports = { createLayoutService }
