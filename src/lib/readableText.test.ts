import { describe, it, expect } from 'vitest'
import { colorLuminance, readableTextOn } from './readableText'
import { EMPLOYEE_COLOR_PALETTE } from './employeeColors'

const BLACK = 'oklch(0.14 0.03 274)'
const WHITE = 'oklch(0.99 0 0)'

function contrast(a: string, b: string): number {
  const la = colorLuminance(a) as number
  const lb = colorLuminance(b) as number
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
}

describe('colorLuminance', () => {
  it('laeser de former appen faktisk bruger', () => {
    expect(colorLuminance('#ffffff')).toBeCloseTo(1, 3)
    expect(colorLuminance('#000')).toBeCloseTo(0, 3)
    expect(colorLuminance('rgb(255, 255, 255)')).toBeCloseTo(1, 3)
    expect(colorLuminance('oklch(1 0 0)')).toBeCloseTo(1, 2)
    expect(colorLuminance('oklch(0 0 0)')).toBeCloseTo(0, 3)
  })

  it('giver null paa noget vi ikke kan laese', () => {
    expect(colorLuminance('rebeccapurple')).toBeNull()
    expect(colorLuminance('')).toBeNull()
  })
})

describe('readableTextOn', () => {
  it('vaelger moerk tekst paa lyse flader og lys tekst paa moerke', () => {
    expect(readableTextOn('#ffffff')).toBe(BLACK)
    expect(readableTextOn('#111111')).toBe(WHITE)
  })

  it('falder tilbage til hvid naar farven ikke kan laeses', () => {
    expect(readableTextOn('noget-vaas')).toBe(WHITE)
  })

  it('holder hele medarbejderpaletten over WCAG AA for lille tekst', () => {
    // Det var praecis her "text-white" faldt igennem: de lyse farver i
    // paletten gav 2,8:1 bag initialerne.
    for (const entry of EMPLOYEE_COLOR_PALETTE) {
      const ratio = contrast(entry.bg, readableTextOn(entry.bg))
      expect(ratio, `${entry.name} (${entry.bg})`).toBeGreaterThanOrEqual(4.5)
    }
  })
})
