import { describe, expect, it } from 'vitest'
import { reflectVelocity, sweepCircleRect } from './physics'

describe('sweepCircleRect', () => {
  it('finds a fast circle crossing a thin rectangle', () => {
    const hit = sweepCircleRect(
      { x: 0, y: 5, vx: 1000, vy: 0, radius: 1 },
      { x: 50, y: 0, width: 2, height: 10 },
      0.1,
    )

    expect(hit).toEqual({ time: expect.closeTo(0.049), x: 49, y: 5, normal: { x: -1, y: 0 } })
  })

  it('returns the face normal opposing horizontal movement', () => {
    const hit = sweepCircleRect(
      { x: 0, y: 5, vx: 10, vy: 0, radius: 2 },
      { x: 10, y: 0, width: 10, height: 10 },
      2,
    )

    expect(hit?.normal).toEqual({ x: -1, y: 0 })
    expect(hit?.x).toBeCloseTo(8)
  })

  it('refines a corner hit to a radial normal', () => {
    const hit = sweepCircleRect(
      { x: 0, y: 0, vx: 10, vy: 10, radius: 2 },
      { x: 10, y: 10, width: 10, height: 10 },
      2,
    )

    expect(hit?.normal.x).toBeCloseTo(-Math.SQRT1_2)
    expect(hit?.normal.y).toBeCloseTo(-Math.SQRT1_2)
    expect(hit?.time).toBeCloseTo((10 - Math.sqrt(2)) / 10)
  })

  it('ignores a touching circle that is separating', () => {
    const hit = sweepCircleRect(
      { x: 8, y: 5, vx: -10, vy: 0, radius: 2 },
      { x: 10, y: 0, width: 10, height: 10 },
      1,
    )

    expect(hit).toBeNull()
  })

  it('resolves an initial overlap through its nearest outward face', () => {
    const hit = sweepCircleRect(
      { x: 11, y: 5, vx: 0, vy: 0, radius: 2 },
      { x: 10, y: 0, width: 10, height: 10 },
      0.1,
    )

    expect(hit?.time).toBe(0)
    expect(hit?.normal).toEqual({ x: -1, y: 0 })
    expect(hit?.x).toBeLessThan(11)
  })

  it('returns no collision for stationary separated circles without NaN', () => {
    const hit = sweepCircleRect(
      { x: 0, y: 0, vx: 0, vy: 0, radius: 2 },
      { x: 10, y: 10, width: 4, height: 4 },
      1,
    )

    expect(hit).toBeNull()
  })
})

describe('reflectVelocity', () => {
  it('reflects velocity across a unit contact normal', () => {
    expect(reflectVelocity(3, 4, { x: 0, y: -1 })).toEqual({ vx: 3, vy: -4 })
  })

  it('preserves horizontal travel while reversing vertical travel', () => {
    expect(reflectVelocity(3, 4, { x: 0, y: 1 })).toEqual({ vx: 3, vy: -4 })
  })

  it('does not inject NaN for a zero velocity', () => {
    expect(reflectVelocity(0, 0, { x: 0, y: 1 })).toEqual({ vx: 0, vy: 0 })
  })
})