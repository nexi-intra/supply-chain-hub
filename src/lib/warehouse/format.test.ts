import { describe, expect, it } from 'vitest'
import { formatDateTime, formatMoney, formatNumber, formatPercent, kindLabel, outcomeView, scopeText, stockLabel } from './format'

describe('format', () => {
  it('formats numbers, money and percentages the Danish way', () => {
    expect(formatNumber(1234567)).toBe('1.234.567')
    expect(formatNumber(-5)).toBe('-5')
    expect(formatMoney(-2015.5)).toBe('-2.015,50 kr.')
    expect(formatMoney(null)).toBe('–')
    expect(formatPercent(37.6)).toBe('38 %')
  })

  it('formats dates with time', () => {
    expect(formatDateTime(new Date(2026, 9, 16, 9, 5).getTime())).toBe('16.10.2026 09:05')
    expect(formatDateTime(undefined)).toBe('–')
  })

  it('labels kinds, stock types and scopes', () => {
    expect(kindLabel('used')).toBe('Brugte terminaler')
    expect(stockLabel('blocked')).toBe('Blocked')
    expect(scopeText({ type: 'slocs', slocs: ['D000', 'D004'], materials: [] })).toBe('D000, D004')
    expect(scopeText({ type: 'slocs', slocs: ['D000'], materials: [], stockTypes: ['blocked'] })).toBe('D000 · Blocked')
    expect(scopeText({ type: 'slocs', slocs: ['D000'], materials: [], stockTypes: ['unrestricted', 'blocked'] })).toBe('D000')
    expect(scopeText({ type: 'materials', slocs: ['D000'], materials: ['R1', 'R2', 'R3', 'R4'] })).toBe('Materialer: R1, R2, R3 +1')
  })

  it('describes scan outcomes with a tone', () => {
    expect(outcomeView({ outcome: 'found', blocked: false, move: false, suggestions: [], sloc: 'D000' })).toEqual({ tone: 'success', title: 'Fundet', detail: '' })
    expect(outcomeView({ outcome: 'found', blocked: true, move: false, suggestions: [], sloc: 'D000' }).title).toBe('Fundet – blocked')
    expect(outcomeView({ outcome: 'found', blocked: false, move: true, suggestions: ['D004', 'D005'], sloc: 'D000' })).toEqual({ tone: 'warning', title: 'Fundet – skal flyttes', detail: 'Flyt til D004' })
    expect(outcomeView({ outcome: 'other-sloc', blocked: false, move: true, suggestions: [], sloc: 'D001' }).detail).toBe('SAP siger D001')
    expect(outcomeView({ outcome: 'other-count', blocked: true, move: false, suggestions: [], sloc: 'D000', stockType: 'blocked', otherCount: 'D000 blocked' }).title).toBe("Blocked – tælles i 'D000 blocked'")
    expect(outcomeView({ outcome: 'unknown', blocked: false, move: false, suggestions: [], sloc: null }).tone).toBe('error')
  })
})
