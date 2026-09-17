// Engangs-reparation: lukker den fastlaaste create-request for 'hej med dig' (team TRR),
// hvis udgivelse allerede ER slaaet igennem men requesten aldrig blev markeret godkendt
// (afbrudt fler-trins godkendelse). Tager backup foerst. Read-modify-write med samme
// kryptering og atomiske tmp+rename som electron/store.cjs.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = 'M:\\372000 - SC All Employees\\ai Tools\\Supply Chain Hub Storage'
const TEAM_DIR = path.join(ROOT, 'TRR')
const BACKUP_DIR = path.join(ROOT, 'Backup')
const GUIDE_ID = 'guide_mu594na1_ixgofe'
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

function writeKeyEncrypted(dir, key, value) {
  const json = JSON.stringify(value)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const data = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const payload = JSON.stringify({ __enc: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
  const target = path.join(dir, encodeURIComponent(key) + '.json')
  const tmp = `${target}.${process.pid}.${Date.now()}.${crypto.randomBytes(4).toString('hex')}.tmp`
  fs.writeFileSync(tmp, payload)
  fs.renameSync(tmp, target)
}

const guides = readKey(TEAM_DIR, 'guides') || []
const requests = readKey(TEAM_DIR, 'guide-review-requests') || []

const published = guides.find((g) => g.id === GUIDE_ID)
const stuck = requests.find((r) => r.guideId === GUIDE_ID && r.action === 'create' && r.status === 'pending')

if (!stuck) { console.log('Ingen fastlaast request fundet - intet at reparere.'); process.exit(0) }
if (!published) { console.error('SIKKERHEDSSTOP: guiden er IKKE udgivet - requesten er reelt aaben og maa ikke lukkes.'); process.exit(1) }
if (published.version !== (stuck.proposedGuide && stuck.proposedGuide.version)) {
  console.error(`SIKKERHEDSSTOP: udgivet version (${published.version}) matcher ikke forslaget (${stuck.proposedGuide && stuck.proposedGuide.version}).`)
  process.exit(1)
}

fs.mkdirSync(BACKUP_DIR, { recursive: true })
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
fs.copyFileSync(path.join(TEAM_DIR, 'guide-review-requests.json'), path.join(BACKUP_DIR, `guide-review-requests-before-hejmeddig-${stamp}.json`))
console.log('Backup skrevet til Backup\\guide-review-requests-before-hejmeddig-' + stamp + '.json')

const now = Date.now()
const repaired = requests.map((r) => r === stuck ? { ...r, status: 'approved', reviewedBy: r.submittedBy, reviewedAt: now, updatedAt: now } : r)
writeKeyEncrypted(TEAM_DIR, 'guide-review-requests', repaired)

const verify = readKey(TEAM_DIR, 'guide-review-requests').find((r) => r.guideId === GUIDE_ID)
console.log(`Repareret: '${verify.guideTitle}' status=${verify.status} (guide v${published.version} er fortsat udgivet)`)
