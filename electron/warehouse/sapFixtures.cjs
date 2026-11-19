// Development/E2E only: answers CountPoint's SAP scripts from fixture files instead of SAP.
// main.cjs uses it only when the app is NOT packaged and COUNTPOINT_SAP_FIXTURES_DIR is set.
const fs = require('node:fs')
const path = require('node:path')

const ready = system => JSON.stringify({ running: true, scripting: true, connections: [{ disabledByServer: false, sessions: [{ busy: false, popup: false, system, client: '100', user: 'FIXTURE', transaction: 'SESSION_MANAGER' }] }] })
const FILES = { mb52: 'mb52-sample.txt', '01': 'iq09-01-sample.txt', '07': 'iq09-07-sample.txt' }

function createFixtureRunner(dir, { readClipboard = () => '', system = 'PS4' } = {}) {
  let nextDoc = 105900001
  return async function runScript(name, args = []) {
    if (name === 'status') return ready(system)
    if (name === 'pidoc-create') {
      const [, mode, sloc, , reference, outDir, outFile, , material, clip] = args
      const materials = clip ? (await readClipboard()).split(/\r?\n/).map(item => item.trim()).filter(Boolean) : [material]
      if (mode === 'test') {
        const lines = ['*** S t a t i s t i c s ***', `Total Number of Stock Management Units for PI             ${materials.length}`, 'Number of Errors Found                                    0', '\tPlnt\tLocation\tMaterial\tBatch\tSTy', ...materials.map(item => `\tD301\t${sloc}\t${item}\t\t1`)]
        await fs.promises.writeFile(path.join(outDir, outFile), lines.join('\r\n'), 'utf8')
        return '{"ok":true,"title":"Selected Data"}'
      }
      const docNo = String(nextDoc++)
      const lines = ['\tMaterial\t\t\t\t\tMaterial Description\t\t\t\t\tPlnt\tLocation', '\tPhysInvDoc\tItem\tBatch\tPeriod\tPlan. Date\t\tCount Date\tSTy\tPhys. Inv. No.\tDoc. Status']
      materials.forEach((item, index) => lines.push(`\t${item}\t\t\t\t\t${item}\t\t\t\t\tD301\t${sloc}`, `\t${docNo}\t${index + 1}\t\t0000.00\t19.10.2026\t\t\t1\t${reference}\tDoc. Active`))
      await fs.promises.writeFile(path.join(outDir, outFile), lines.join('\r\n'), 'utf8')
      return '{"ok":true,"title":"PI Documents Were Created Directly"}'
    }
    if (name === 'pidoc-print') return '{"ok":true,"message":"Print request completed"}'
    if (name === 'sap-show') return '{"ok":true}'
    if (name === 'pidoc-serials') {
      const serials = (await fs.promises.readFile(path.join(args[4], args[5]), 'utf8')).split(/\r?\n/).filter(Boolean)
      return JSON.stringify({ ok: true, message: '', newSerials: 0, counted: String(serials.length), serials: String(serials.length) })
    }
    if (name === 'pidoc-count') return JSON.stringify({ ok: true, message: `Count entered for phys. inv. doc. ${args[1]}`, items: 1 })
    if (name === 'pidoc-delete') {
      await fs.promises.writeFile(path.join(args[4], args[5]), '\tMaterial\tPlnt\tLocation\r\n\tPhysInvDoc\tItem\tPlan. Date\tSTy\tPhys. Inv. No.\tDoc. Status\r\n', 'utf8')
      return JSON.stringify({ ok: true, message: `Physical inventory document ${args[1]} deleted`, screens: '' })
    }
    if (name === 'pidoc-post') {
      const [, , outDir, listFile, statusFile, , firstDoc, clip] = args
      const docs = clip ? (await readClipboard()).split(/\r?\n/).map(item => item.trim()).filter(Boolean) : [firstDoc]
      const list = ['\tPhysInvDoc\tItem\tMaterial\tBatch\tPlnt\tLocation\tBook Quantity\tQty Counted\tDifference qty\tBUn\tDifference Amt.\tCrcy', ...docs.map(doc => `\t${doc}\t1\tFIXTURE\t\tD301\tD000\t10,000\t9,000\t1,000-\tEA\t50,00\tDKK`)]
      const status = ['\tMaterial\t\t\t\t\tMaterial Description\t\t\t\t\tPlnt\tLocation', '\tPhysInvDoc\tItem\tBatch\tPeriod\tPlan. Date\t\tCount Date\tSTy\tPhys. Inv. No.\tDoc. Status', '\tFIXTURE\t\t\t\t\tFixture\t\t\t\t\tD301\tD000', ...docs.map(doc => `\t${doc}\t1\t\t2026.10\t19.10.2026\t\t20.10.2026\t1\t\t`)]
      await fs.promises.writeFile(path.join(outDir, listFile), list.join('\r\n'), 'utf8')
      await fs.promises.writeFile(path.join(outDir, statusFile), status.join('\r\n'), 'utf8')
      return JSON.stringify({ ok: true, ticked: 1, screens: docs.map(doc => `[Diffs in phys. inv. doc. ${doc} posted with m. doc. 4900000001]`).join(' > ') })
    }
    if (name === 'matdoc') {
      const [mode, outDir, outFile] = args
      await fs.promises.copyFile(path.join(dir, `matdoc-${mode === 'rep' ? 'rep' : 'prep'}-sample.txt`), path.join(outDir, outFile))
      return '{"ok":true,"rows":3}'
    }
    if (name === 'longserno') {
      const [outDir, outFile, inFile] = args
      const asked = new Set((await fs.promises.readFile(path.join(outDir, inFile), 'utf8')).split(/\r?\n/).filter(Boolean))
      const [header, ...lines] = (await fs.promises.readFile(path.join(dir, 'longserno-sample.txt'), 'utf8')).split(/\r?\n/).filter(Boolean)
      const found = lines.filter(line => asked.has(line.split('\t')[0]))
      await fs.promises.writeFile(path.join(outDir, outFile), [header, ...found].join('\r\n'), 'utf8')
      return JSON.stringify({ ok: true, rows: found.length })
    }
    if (name === 'mm60') {
      const [outDir, outFile, inFile] = args
      const asked = new Set((await fs.promises.readFile(path.join(outDir, inFile), 'utf8')).split(/\r?\n/).map(item => item.trim()).filter(Boolean))
      const lines = (await fs.promises.readFile(path.join(dir, 'mm60-sample.txt'), 'utf8')).replace(/^﻿/, '').split(/\r?\n/)
      const header = lines.find(line => line.includes('Material Description'))
      const found = lines.filter(line => asked.has(line.split('\t').map(cell => cell.trim()).find(Boolean)))
      await fs.promises.writeFile(path.join(outDir, outFile), [header, ...found].join('\r\n'), 'utf8')
      return JSON.stringify({ ok: true, rows: -1 })
    }
    if (name === 'stockcheck') {
      const [outDir, outFile] = args
      await fs.promises.copyFile(path.join(dir, 'stockcheck-sample.txt'), path.join(outDir, outFile))
      return '{"ok":true,"rows":6}'
    }
    if (name !== 'export') throw Object.assign(new Error('SAP_SCRIPT_NOT_ALLOWED'), { code: 'SAP_SCRIPT_NOT_ALLOWED' })
    const [report, outDir, outFile, stockType] = args
    const source = path.join(dir, FILES[report === 'mb52' ? 'mb52' : stockType] || '')
    if (!fs.existsSync(source)) return '{"ok":true,"rows":0}'
    await fs.promises.copyFile(source, path.join(outDir, outFile))
    return '{"ok":true,"rows":1}'
  }
}

module.exports = { createFixtureRunner }
