import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { parseTimeText } from './timeText'

const require = createRequire(import.meta.url)
const server = require('../../electron/assistantTimeText.cjs') as { parseTimeText: typeof parseTimeText }

const CASES: Array<[string, ReturnType<typeof parseTimeText>]> = [
  ['Ring til DHL kl. 10:30', { title: 'Ring til DHL', startTime: '10:30' }],
  ['Ring til DHL 10:30', { title: 'Ring til DHL', startTime: '10:30' }],
  ['Møde med Anna kl. 13-14', { title: 'Møde med Anna', startTime: '13:00', endTime: '14:00' }],
  ['Møde med Anna kl 13 til 14.30', { title: 'Møde med Anna', startTime: '13:00', endTime: '14:30' }],
  ['Møde 9:30–10:15 med IT', { title: 'Møde med IT', startTime: '09:30', endTime: '10:15' }],
  ['Ugemøde klo 9.15', { title: 'Ugemøde', startTime: '09:15' }],
  ['Call IT at 8', { title: 'Call IT', startTime: '08:00' }],
  ['Kl. 7 tjek pallerne', { title: 'tjek pallerne', startTime: '07:00' }],
  ['Nattevagt kl. 22-02', { title: 'Nattevagt', startTime: '22:00' }],
]

const UNTOUCHED = ['Bestil 3-4 paller', 'Ring til IT 2026-10-14', 'Levering 14.10', 'Tjek 21/9', 'Kl. 25 er ikke et tidspunkt', 'Husk at bestille kaffe']

describe('parseTimeText', () => {
  it.each(CASES)('reads the time in %s', (text, expected) => {
    expect(parseTimeText(text)).toEqual(expected)
  })

  it.each(UNTOUCHED)('leaves %s alone', text => {
    expect(parseTimeText(text)).toEqual({ title: text })
  })

  it('returns an empty title when the text is only a time', () => {
    expect(parseTimeText('kl. 10')).toEqual({ title: '', startTime: '10:00' })
  })

  it('matches the copy Hubert uses in the main process', () => {
    for (const text of [...CASES.map(([value]) => value), ...UNTOUCHED, 'kl. 10']) expect(server.parseTimeText(text)).toEqual(parseTimeText(text))
  })
})
