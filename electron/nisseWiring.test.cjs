const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const main = fs.readFileSync(path.join(__dirname, 'main.cjs'), 'utf8')
const preload = fs.readFileSync(path.join(__dirname, 'preload.cjs'), 'utf8')

test('main answers the nisse channels and tells every window when a find lands', () => {
  for (const channel of ["ipcMain.handle('nisse:today'", "ipcMain.handle('nisse:claim'", "ipcMain.handle('nisse:finds'"]) assert.ok(main.includes(channel), channel)
  assert.ok(main.includes("startsWith('nisse-finds-')"))
  assert.ok(main.includes("broadcast('nisse:changed')"))
  assert.ok(main.includes("'ipc:nisse:'"), 'a find being saved must hold the app open on quit')
})

test('the renderer reaches the judge through window.electronNisse', () => {
  assert.match(preload, /exposeInMainWorld\('electronNisse',[\s\S]*?'nisse:today'[\s\S]*?'nisse:claim'[\s\S]*?'nisse:finds'[\s\S]*?'nisse:changed'/)
})
