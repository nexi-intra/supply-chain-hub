// Explicit creator-only export (the IPC gate enforces the role). Normal
// profile reads never include credentials; a deliberate account backup must.
function exportBackup(store) {
  const data = {}
  for (const key of store.keys().filter(key => !key.startsWith('__') && !key.startsWith('account-') && key !== 'active-sessions')) {
    const value = store.get(key, { skipCache: true })
    if (value === undefined) throw Object.assign(new Error('BACKUP_CHANGED'), { code: 'BACKUP_CHANGED' })
    data[key] = value
  }
  return { app: 'tcd-hub', formatVersion: 1, exportedAt: new Date().toISOString(), data }
}
module.exports = { exportBackup }
