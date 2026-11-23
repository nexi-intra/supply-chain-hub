import { describe, expect, it } from 'vitest'
import { setWarehouseLanguage } from '@/lib/warehouse/text'
import { sinceTime, unsentPcText } from './since'

describe('since', () => {
  it('shows the time today and the date before today', () => {
    const at = new Date(2026, 10, 20, 10, 42).getTime()
    expect(sinceTime(at, new Date(2026, 10, 20, 17, 0).getTime())).toBe('10:42')
    expect(sinceTime(at, new Date(2026, 10, 23, 8, 0).getTime())).toBe('20.11.2026 10:42')
  })

  it('names the PC that has not sent, in Danish and English', () => {
    const since = new Date(2026, 10, 20, 10, 42).getTime()
    const today = new Date(2026, 10, 20, 11, 0).getTime()
    setWarehouseLanguage('da')
    expect(unsentPcText({ name: 'Bo', since }, today)).toBe('Bos PC har ikke sendt siden 10:42')
    expect(unsentPcText({ name: 'Lars', since }, today)).toBe("Lars' PC har ikke sendt siden 10:42")
    setWarehouseLanguage('en')
    expect(unsentPcText({ name: 'Bo', since }, today)).toBe("Bo's PC has not sent since 10:42")
    setWarehouseLanguage('da')
  })
})
