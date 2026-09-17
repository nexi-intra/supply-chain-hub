import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { KvStore } from './localKvStore'

let kv: KvStore
let raw: Map<string, string>
beforeEach(async () => {
  vi.resetModules()
  raw = new Map()
  const storage = {
    getItem: (key: string) => raw.get(key) ?? null,
    setItem: (key: string, value: string) => { raw.set(key, value) },
    removeItem: (key: string) => { raw.delete(key) },
    key: (index: number) => Array.from(raw.keys())[index] ?? null,
    get length() { return raw.size },
  }
  vi.stubGlobal('window', { localStorage: storage, addEventListener: () => {} })
  kv = (await import('./localKvStore')).localKv
})
afterEach(() => vi.unstubAllGlobals())

describe('browser KV safety', () => {
  it('does not treat corrupted saved data as a missing key', async () => {
    raw.set('tcd-hub:items', '{broken')
    await expect(kv.get('items')).rejects.toThrow()
    expect(raw.get('tcd-hub:items')).toBe('{broken')
  })
  it('rejects stale compare-and-set without writing', async () => {
    await kv.set('items', ['new'])
    await expect(kv.compareAndSet('items', ['old'], ['mine'])).rejects.toThrow('KV_CONFLICT')
    expect(await kv.get('items')).toEqual(['new'])
  })
  it('preserves both concurrent operations in the same renderer', async () => {
    await Promise.all([kv.update('items', { op: 'append', items: [{ id: 'first' }] }), kv.update('items', { op: 'append', items: [{ id: 'second' }] })])
    expect(await kv.get('items')).toEqual([{ id: 'first' }, { id: 'second' }])
  })
  it('renames an account atomically and preserves its password', async () => {
    const user = { email: 'old@example.com', password: 'synthetic-hash' }
    await kv.set('users', { 'old@example.com': user })
    await kv.updateField('users', { op: 'renameField', field: 'old@example.com', newField: 'new@example.com', expected: user, value: { ...user, email: 'new@example.com' } })
    expect(await kv.get('users')).toEqual({ 'new@example.com': { ...user, email: 'new@example.com' } })
  })
  it('does not overwrite another account or an invalid object', async () => {
    const user = { email: 'old@example.com' }
    await kv.set('users', { 'old@example.com': user, 'taken@example.com': { name: 'Other' } })
    await expect(kv.updateField('users', { op: 'renameField', field: 'old@example.com', newField: 'taken@example.com', expected: user, value: user })).rejects.toThrow('KV_CONFLICT')
    expect(await kv.get('users')).toEqual({ 'old@example.com': user, 'taken@example.com': { name: 'Other' } })
    await kv.set('users', ['retained'])
    await expect(kv.updateField('users', { op: 'setField', field: 'new', value: true })).rejects.toThrow('KV_INVALID_OPERATION')
    expect(await kv.get('users')).toEqual(['retained'])
  })
})
