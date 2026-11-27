import { describe, expect, it } from 'vitest'
import { cleanSerial, parseSerials } from './common'

describe('cleanSerial', () => {
  it('keeps the last 18 digits of a scanned 24-digit serial, spaces ignored', () => {
    expect(cleanSerial('251427303201349258058038')).toBe('303201349258058038')
    expect(cleanSerial(' 251427 303201349258058038 ')).toBe('303201349258058038')
  })

  it('leaves every other value as before', () => {
    expect(cleanSerial('25142730320134925805803')).toBe('25142730320134925805803')
    expect(cleanSerial('2514273032013492580580381')).toBe('2514273032013492580580381')
    expect(cleanSerial('a51427303201349258058038')).toBe('A51427303201349258058038')
    expect(cleanSerial(' n1 ')).toBe('N1')
  })
})

describe('parseSerials', () => {
  it('shortens pasted 24-digit serials and finds the repeat of the short one', () => {
    expect(parseSerials('251427303201349258058038\n303201349258058038\nN1')).toEqual({ serials: ['303201349258058038', 'N1'], invalid: [] })
  })
})
