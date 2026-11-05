import { describe, expect, it } from 'vitest'
import { scheduleLifts } from './input'

describe('fordeling af tryk på motorens faste trin', () => {
  it('giver ét løft for ét tryk i første trin', () => {
    expect(scheduleLifts([105], 100, 116.7, 2)).toEqual({ lifts: [true, false], remaining: [] })
  })

  it('lægger to tryk under et hak på hver sit trin, der hvor de skete', () => {
    const { lifts, remaining } = scheduleLifts([110, 180], 100, 200, 12)
    expect(lifts.filter(Boolean)).toHaveLength(2)
    expect(lifts.indexOf(true)).toBe(1)
    expect(lifts.lastIndexOf(true)).toBe(9)
    expect(remaining).toEqual([])
  })

  it('giver altid to løft for to hurtige tryk i samme billede', () => {
    const { lifts } = scheduleLifts([101, 102], 100, 116.7, 2)
    expect(lifts).toEqual([true, true])
  })

  it('gemmer tryk til næste billede, når der ikke er trin nok', () => {
    expect(scheduleLifts([101, 102, 103], 100, 108, 1)).toEqual({ lifts: [true], remaining: [102, 103] })
    expect(scheduleLifts([101], 100, 104, 0)).toEqual({ lifts: [], remaining: [101] })
  })

  it('behandler tryk efter billedets tidsstempel som sket i sidste trin', () => {
    expect(scheduleLifts([130], 100, 116.7, 2)).toEqual({ lifts: [false, true], remaining: [] })
  })
})
