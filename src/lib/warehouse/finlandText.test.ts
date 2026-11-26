import { afterEach, describe, expect, it } from 'vitest'
import { backendText, kolli } from './finlandText'
import { setWarehouseLanguage } from './text'

describe('finlandText', () => {
  afterEach(() => setWarehouseLanguage('da'))

  it("keeps the backend's Danish in Danish and gives the known texts in English, with their numbers", () => {
    expect(backendText('Mangler T&T')).toBe('Mangler T&T')
    setWarehouseLanguage('en')
    expect(backendText('Mangler T&T')).toBe('No T&T')
    expect(backendText('T&T står allerede på levering 82100001 i række 17.')).toBe('The T&T is already on delivery 82100001 on row 17.')
    expect(backendText('Nummeret er et PostNord-nummer. Vælg PostNord.')).toBe('The number is a PostNord number. Choose PostNord.')
    expect(backendText('Noget helt nyt')).toBe('Noget helt nyt')
    expect(kolli(1)).toBe('1 parcel')
  })
})
