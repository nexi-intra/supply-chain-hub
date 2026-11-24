import { describe, expect, it } from 'vitest'
import { cargoLabels } from './labels'

describe('Cargo Stack-tekster', () => {
  it('har samme navn og oversatte rydninger på dansk, engelsk og finsk', () => {
    for (const lang of ['da', 'en', 'fi', 'sv']) expect(cargoLabels(lang).menu.title).toBe('Cargo Stack')
    expect(cargoLabels('da').clears[4]).toBe('Fuld last!')
    expect(cargoLabels('en').clears[4]).toBe('Full load!')
    expect(cargoLabels('fi').clears[4]).toBe('Täysi lasti!')
    expect(cargoLabels('da').level(4)).toBe('Niveau 4')
    expect(cargoLabels('en').combo(3)).toBe('Combo ×3')
  })

  it('formaterer point efter sproget og falder tilbage til dansk', () => {
    expect(cargoLabels('da').points(12500)).toBe('12.500')
    expect(cargoLabels('xx').perfect).toBe(cargoLabels('da').perfect)
  })
})
