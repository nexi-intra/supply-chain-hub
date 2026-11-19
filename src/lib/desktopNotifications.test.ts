import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { APP_VIEW_IDS } from './appNavigation'
import { toDesktopRequest } from './desktopNotifications'
import type { HubNotificationItem } from './hubNotifications'

const require = createRequire(import.meta.url)
const main = require('../../electron/desktopNotifications.cjs') as {
  normalizeDesktopNotification(input: unknown): unknown
  VIEW_IDS: string[]
}

const item = (overrides: Partial<HubNotificationItem> = {}): HubNotificationItem => ({
  id: 'email-e1', kind: 'email', iconColor: 'text-primary', title: 'Subject', subtitle: 'From a@example.test', timestamp: 1, target: { view: 'email' },
  ...overrides,
})

describe('toDesktopRequest', () => {
  it('maps a bell item to a request with the language for the summary toast', () => {
    expect(toDesktopRequest(item(), 'da')).toEqual({ id: 'email-e1', title: 'Subject', body: 'From a@example.test', target: { view: 'email' }, language: 'da' })
  })

  it('keeps target params and drops anything the main process would reject', () => {
    const result = toDesktopRequest(item({ target: { view: 'games', params: { tab: 'multiplayer', itemId: 'g1' } } }), 'en')
    expect(result.target).toEqual({ view: 'games', params: { tab: 'multiplayer', itemId: 'g1' } })
  })

  it('truncates over-long text to the limits enforced by the main process', () => {
    const long = 'x'.repeat(500)
    const result = toDesktopRequest(item({ id: `id-${long}`, title: long, subtitle: long, target: { view: 'guides', params: { search: long } } }), 'en')
    expect(result.id).toHaveLength(200)
    expect(result.title).toHaveLength(120)
    expect(result.title.endsWith('…')).toBe(true)
    expect(result.body).toHaveLength(300)
    expect(result.target?.params?.search).toHaveLength(200)
  })

  it('falls back to the body or the app name when a title is empty', () => {
    expect(toDesktopRequest(item({ title: '  ' }), 'en').title).toBe('From a@example.test')
    expect(toDesktopRequest(item({ title: '', subtitle: '' }), 'en').title).toBe('Supply Chain Hub')
  })

  it('always produces a request the main process accepts, for every view', () => {
    for (const view of APP_VIEW_IDS) {
      const request = toDesktopRequest(item({ title: 'T'.repeat(400), target: { view, params: { tab: 't', itemId: 'i', search: 's'.repeat(300) } } }), 'sv')
      expect(() => main.normalizeDesktopNotification(request)).not.toThrow()
    }
  })

  it('keeps the main-process view list in sync with the app view ids', () => {
    expect([...main.VIEW_IDS].sort()).toEqual([...APP_VIEW_IDS].sort())
  })
})
