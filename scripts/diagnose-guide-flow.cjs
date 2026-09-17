// Read-only diagnose af guide-review-flowet mod den delte KV (samme kryptering som electron/store.cjs).
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const TEAM_DIR = process.argv[2] || 'M:\\372000 - SC All Employees\\ai Tools\\Supply Chain Hub Storage\\TCD'
const ENC_KEY = crypto.scryptSync('tcd-hub-storage-v1', 'tcd-hub-static-salt', 32)

function readKey(dir, key) {
  const file = path.join(dir, encodeURIComponent(key) + '.json')
  if (!fs.existsSync(file)) return undefined
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (parsed && typeof parsed === 'object' && parsed.__enc === 1) {
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENC_KEY, Buffer.from(parsed.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(parsed.tag, 'base64'))
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(parsed.data, 'base64')), decipher.final()]).toString('utf8'))
  }
  return parsed
}

const fmt = (ms) => ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 16) : '-'

const guides = readKey(TEAM_DIR, 'guides') || []
const shared = readKey(path.join(TEAM_DIR, '..', '_shared'), 'shared-guides') || []
const requests = readKey(TEAM_DIR, 'guide-review-requests') || []
const archived = readKey(TEAM_DIR, 'archived-guides') || []

console.log('=== PUBLISHED GUIDES (guides) ===')
for (const g of guides) console.log(`  '${g.title}' id=${g.id} ver=${g.version} updated=${fmt(g.updatedAt)} by=${g.updatedBy || g.createdBy || '-'}`)
console.log('=== SHARED GUIDES ===')
for (const g of shared) console.log(`  '${g.title}' id=${g.id} ver=${g.version} teams=${(g.sharedWithTeamCodes||[]).join('+')}`)
console.log('=== REVIEW REQUESTS ===')
for (const r of requests) {
  console.log(`  [${r.status}] '${r.guideTitle}' action=${r.action} guideId=${r.guideId}`)
  console.log(`      baseVer=${r.baseVersion} propVer=${r.proposedGuide ? r.proposedGuide.version : '-'} by=${r.submittedBy} sub=${fmt(r.submittedAt)} upd=${fmt(r.updatedAt)}`)
  if (r.reviewerComment) console.log(`      reviewerComment: ${String(r.reviewerComment).slice(0, 100)}`)
}
console.log('=== ARCHIVED ===')
for (const a of archived) console.log(`  '${a.guide.title}' id=${a.guide.id} ver=${a.guide.version} archived=${fmt(a.archivedAt)} restored=${fmt(a.restoredAt)}`)
