import { afterEach, describe, expect, it } from 'vitest'
import { describeSapState, sapTestSystemNote, sapToolNote } from './sapStatus'
import { setWarehouseLanguage } from './text'
import type { SapStateName, SapStatus } from '@/types/warehouse'

const status = (state: SapStateName, extra: Partial<SapStatus> = {}): SapStatus => ({ state, ready: state === 'ready', system: null, client: null, user: null, ...extra })
const ALL_STATES: SapStateName[] = ['ready', 'busy', 'popup', 'max-sessions', 'scripting-off', 'not-logged-in', 'not-running', 'wrong-system', 'error']

afterEach(() => setWarehouseLanguage('da'))

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
    expect(describeSapState(status('wrong-system', { system: 'PS4', client: '100', expectedSystem: 'QS4' }), 'counts').help).toContain('Optælling bruger QS4')
  })

  it('names the tool that uses SAP, and "appen" where no tool is given', () => {
    const helps = (tool?: 'counts' | 'locations' | 'softwareload') => [null, ...ALL_STATES.map(state => status(state, { system: 'QS4', client: '200' }))].map(value => describeSapState(value, tool).help)
    for (const help of [...helps('locations'), ...helps('softwareload'), ...helps()]) expect(help).not.toContain('Optælling')
    expect(describeSapState(status('popup'), 'softwareload').help).toContain('så Softwareload kan bruge SAP')
    expect(describeSapState(status('ready'), 'locations').help).toContain('Placeringer åbner sin egen SAP-session')
    expect(describeSapState(status('max-sessions')).help).toContain('så appen kan åbne sin egen')
    expect(describeSapState(status('ready')).help).toContain('Appen åbner sin egen SAP-session')
    expect(describeSapState(status('wrong-system', { system: 'PS4', client: '100', expectedSystem: 'QS4' }), 'softwareload').help).toContain('Softwareload bruger QS4')
    setWarehouseLanguage('en')
    expect(describeSapState(status('ready')).help).toContain('The app opens its own SAP session')
    expect(describeSapState(status('popup'), 'locations').help).toContain('so Locations can use SAP')
    expect(describeSapState(null, 'counts').help).toBe('Stock count is checking whether SAP is ready.')
  })

  it('tells per tool what it does in SAP: only Softwareload posts by itself', () => {
    expect(sapToolNote('counts', 'PS4')).toBe('Optælling læser fra SAP. Optællingsdokumenter udfyldes i SAP, men du trykker altid selv F8, Gem eller Post.')
    expect(sapToolNote('locations', 'PS4')).toBe('Placeringer læser kun fra SAP (materialedokumenter og beskrivelser).')
    expect(sapToolNote('softwareload', 'PS4')).toBe("Softwareload flytter terminalerne i SAP selv, når du klikker 'Afslut og flyt i SAP' eller 'Flyt til D005'. Der bogføres i PS4.")
    expect(sapToolNote('softwareload', 'QS4')).toContain('Der bogføres i QS4.')
    expect(sapTestSystemNote('locations')).not.toMatch(/skriver|bogfører/)
    expect(sapTestSystemNote('softwareload')).toContain('Softwareload')
    setWarehouseLanguage('en')
    expect(sapToolNote('softwareload', 'PS4')).toBe("Softwareload moves the terminals in SAP itself when you click 'Finish and move in SAP' or 'Move to D005'. It posts in PS4.")
    expect(sapToolNote('locations', 'PS4')).toBe('Locations only reads from SAP (material documents and descriptions).')
    expect(sapToolNote('counts', 'PS4')).toContain('you always press F8, Save or Post yourself')
  })

  it('explains a timeout and shows a checking state before the first answer', () => {
    expect(describeSapState(status('error', { reason: 'timeout' })).help).toMatch(/svarede ikke/)
    expect(describeSapState(null).tone).toBe('unknown')
  })
})
