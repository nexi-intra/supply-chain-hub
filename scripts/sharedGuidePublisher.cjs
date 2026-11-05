// Shared helper for publishing a guide to _shared/shared-guides (all teams).
// SAFE BY DEFAULT: without the --publish flag nothing is written to the data folder;
// a local preview JSON is written to the OS temp folder instead.
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const ROOT = 'M:\\372000 - SC All Employees\\ai Tools\\Supply Chain Hub Storage'
const SHARED_DIR = path.join(ROOT, '_shared')
const ALL_TEAMS = ['TCD', 'TRR', 'PIM', 'BPO', 'SCT', 'TSS', 'SCN']
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
function writeKey(dir, key, value) {
  const json = JSON.stringify(value)
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', ENC_KEY, iv)
  const data = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  const payload = JSON.stringify({ __enc: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') })
  const target = path.join(dir, encodeURIComponent(key) + '.json')
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(tmp, payload)
  // SMB kan kortvarigt holde maalfilen aaben (app-watcher) -> EPERM; proev igen.
  for (let attempt = 0; ; attempt++) {
    try { fs.renameSync(tmp, target); return } catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 14) { try { fs.unlinkSync(tmp) } catch { /* behold intet affald */ } throw error }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 350)
    }
  }
}

// Kildeteksten er skrevet ASCII-sikkert (aa/oe/ae) og konverteres her. Kun tekstfelter - aldrig id'er.
const danish = value => value
  .replace(/Aa(?=[a-z])/g, '\u00c5').replace(/aa/g, '\u00e5')
  .replace(/AE(?=[a-z])/g, '\u00c6').replace(/Ae(?=[a-z])/g, '\u00c6').replace(/ae/g, '\u00e6')
  .replace(/OE(?=[a-z])/g, '\u00d8').replace(/Oe(?=[a-z])/g, '\u00d8').replace(/oe/g, '\u00f8')

function sectionBuilder(prefix) {
  let counter = 0
  return (heading, steps) => ({
    id: `section_${prefix}_${(++counter).toString(36)}`,
    heading: danish(heading),
    steps: steps.map(step => typeof step === 'string'
      ? { id: `step_${prefix}_${(++counter).toString(36)}`, text: danish(step), imageIds: [] }
      : { id: `step_${prefix}_${(++counter).toString(36)}`, text: danish(step.text), imageIds: step.imageIds || [] }),
  })
}

const bump = version => ((Math.round(Number.parseFloat(version || '1.00') * 100) + 1) / 100).toFixed(2)

/** Replaces (or adds) one shared guide. Dry run unless process.argv includes --publish. */
function publishSharedGuide(guide, { label }) {
  const publish = process.argv.includes('--publish')
  const existing = readKey(SHARED_DIR, 'shared-guides') || []
  const previous = existing.find(item => item.id === guide.id)
  if (previous) { guide.version = bump(previous.version); guide.createdAt = previous.createdAt }
  const flat = JSON.stringify(guide.sections.map(section => [section.heading, section.steps.map(step => step.text)])) + guide.title + guide.content
  const leftovers = flat.match(/[a-zA-Z]*(?:aa|ae|oe)[a-zA-Z]*/g)
  console.log(`${label}: "${guide.title}" v${guide.version} · ${guide.sections.length} sektioner · ${guide.sections.reduce((n, s) => n + s.steps.length, 0)} trin`)
  console.log(leftovers ? `ADVARSEL - ukonverterede ord: ${[...new Set(leftovers)].slice(0, 10).join(', ')}` : 'Tegn-kontrol: OK')
  if (!publish) {
    const preview = path.join(os.tmpdir(), `${guide.id}-preview.json`)
    fs.writeFileSync(preview, JSON.stringify(guide, null, 2))
    console.log(`TOER KOERSEL - intet udgivet. Forhaandsvisning: ${preview}\nUdgiv med: node ${path.basename(process.argv[1])} --publish`)
    return guide
  }
  fs.mkdirSync(path.join(ROOT, 'Backup'), { recursive: true })
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)
  const sharedFile = path.join(SHARED_DIR, 'shared-guides.json')
  if (fs.existsSync(sharedFile)) fs.copyFileSync(sharedFile, path.join(ROOT, 'Backup', `shared-guides-before-${guide.id}-${stamp}.json`))
  writeKey(SHARED_DIR, 'shared-guides', [guide, ...existing.filter(item => item.id !== guide.id)])
  const written = (readKey(SHARED_DIR, 'shared-guides') || []).find(item => item.id === guide.id)
  console.log(`Udgivet: "${written.title}" v${written.version} · delt med ${written.sharedWithTeamCodes.join(', ')}`)
  return written
}

module.exports = { ROOT, SHARED_DIR, ALL_TEAMS, readKey, danish, sectionBuilder, publishSharedGuide }
