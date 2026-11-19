import { describe, expect, it } from 'vitest'
import { describeSapState } from './sapStatus'
import type { SapStateName, SapStatus } from '@/types/warehouse'

const status = (state: SapStateName, extra: Partial<SapStatus> = {}): SapStatus => ({ state, ready: state === 'ready', system: null, client: null, user: null, ...extra })

describe('describeSapState', () => {
  it('only the ready state is green', () => {
    const states: SapStateName[] = ['ready', 'busy', 'popup', 'max-sessions', 'scripting-off', 'not-logged-in', 'not-running', 'wrong-system', 'error']
    const green = states.filter(state => describeSapState(status(state)).tone === 'ok')
    expect(green).toEqual(['ready'])
  })

  it('every state has a Danish label and an explanation', () => {
    for (const state of ['busy', 'popup', 'max-sessions', 'scripting-off', 'not-logged-in', 'not-running', 'wrong-system', 'error'] as SapStateName[]) {
      const description = describeSapState(status(state))
      expect(description.label.length).toBeGreaterThan(3)
      expect(description.help.length).toBeGreaterThan(10)
    }
  })

  it('names the wrong system the user is on', () => {
    expect(describeSapState(status('wrong-system', { system: 'QS4', client: '200' })).help).toContain('QS4/200')
    expect(describeSapState(status('not-logged-in', { expectedSystem: 'QS4' })).help).toContain('SAP QS4')
    expect(describeSapState(status('wrong-system', { system: 'PS4', client: '100', expectedSystem: 'QS4' })).help).toContain('Optælling bruger QS4')
  })

  it('explains a timeout and shows a checking state before the first answer', () => {
    expect(describeSapState(status('error', { reason: 'timeout' })).help).toMatch(/svarede ikke/)
    expect(describeSapState(null).tone).toBe('unknown')
  })
})
