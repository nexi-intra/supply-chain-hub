const normalize = value => String(value || '').trim().toLowerCase()
// Shared by the guide catalogue and Hubert. A newer rejection/pending
// request supersedes an old approval; only own-home-team grants count.
function guideAccessIds(rows, email, homeFolder, now = Date.now()) {
  const latest = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    if (normalize(row?.requestingUserEmail) !== normalize(email) || row.requestingTeamCode !== homeFolder || typeof row.guideId !== 'string') continue
    const previous = latest.get(row.guideId)
    if (!previous || String(row.requestedAt || '') >= String(previous.requestedAt || '')) latest.set(row.guideId, row)
  }
  return new Set([...latest.values()].filter(row => row.status === 'approved' && (!row.expiresAt || (Number.isFinite(Date.parse(row.expiresAt)) && Date.parse(row.expiresAt) > now))).map(row => row.guideId))
}
module.exports = { guideAccessIds }
