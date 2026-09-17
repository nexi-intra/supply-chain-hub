import { afterEach, expect, it, vi } from 'vitest'
import { createBackup, restoreBackup, type BackupFile } from './backup'
afterEach(() => vi.unstubAllGlobals())
const backup: BackupFile = { app: 'tcd-hub', formatVersion: 1, exportedAt: '2026-09-15T00:00:00Z', data: { guides: [], users: {} } }
it('desktop export uses the creator-only backend, not sanitized profile reads', async () => {
  const exportFn = vi.fn(async () => backup), get = vi.fn()
  vi.stubGlobal('window', { electronAuth: {}, electronBackup: { export: exportFn }, kv: { get } })
  expect(await createBackup()).toEqual(backup); expect(exportFn).toHaveBeenCalledOnce(); expect(get).not.toHaveBeenCalled()
})
it('desktop restore with no backend transaction fails before writing any key', async () => {
  const set = vi.fn()
  vi.stubGlobal('window', { electronAuth: {}, kv: { set } })
  await expect(restoreBackup(backup)).rejects.toThrow('BACKUP_RESTORE_PENDING'); expect(set).not.toHaveBeenCalled()
})
it('desktop backup cannot silently fall back to a backup with missing credentials', async () => {
  const get = vi.fn()
  vi.stubGlobal('window', { electronAuth: {}, kv: { get } })
  await expect(createBackup()).rejects.toThrow('BACKUP_BACKEND_REQUIRED'); expect(get).not.toHaveBeenCalled()
})
it('browser fixture restoration remains independent of desktop authorization', async () => {
  const set = vi.fn(async () => undefined)
  vi.stubGlobal('window', { kv: { set } })
  expect(await restoreBackup(backup)).toBe(2); expect(set).toHaveBeenCalledTimes(2)
})
