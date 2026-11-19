import { describe, it, expect } from 'vitest'
import { FIELD } from './config'
import { pointerToField } from './pointer'

describe('pointerToField', () => {
  const rect = { left: 100, top: 40, width: FIELD.width / 2, height: FIELD.height / 2 }

  it('omregner skærmkoordinater til banens logiske koordinater', () => {
    expect(pointerToField(100, 40, rect)).toEqual({ x: 0, y: 0 })
    expect(pointerToField(100 + rect.width / 2, 40 + rect.height / 2, rect)).toEqual({ x: FIELD.width / 2, y: FIELD.height / 2 })
    expect(pointerToField(100 + rect.width, 40 + rect.height, rect)).toEqual({ x: FIELD.width, y: FIELD.height })
  })

  it('følger skaleringen af den letterboxede skærm', () => {
    const wide = { left: 0, top: 0, width: FIELD.width * 1.5, height: FIELD.height * 1.5 }
    expect(pointerToField(150, 300, wide)).toEqual({ x: 100, y: 200 })
  })

  it('giver null for en skærm uden størrelse', () => {
    expect(pointerToField(10, 10, { left: 0, top: 0, width: 0, height: 0 })).toBeNull()
  })
})
