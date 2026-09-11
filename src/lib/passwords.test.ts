import { describe, it, expect } from 'vitest'
import { hashPassword, isHashedPassword, verifyPassword } from './passwords'

describe('passwords', () => {
  it('hashes a password into the pbkdf2$... format', async () => {
    const hashed = await hashPassword('correct horse battery staple')
    expect(hashed.startsWith('pbkdf2$')).toBe(true)
    expect(hashed.split('$')).toHaveLength(4)
  })

  it('verifies a correct password against its own hash', async () => {
    const hashed = await hashPassword('mySecret123')
    await expect(verifyPassword('mySecret123', hashed)).resolves.toBe(true)
  })

  it('rejects an incorrect password against a hash', async () => {
    const hashed = await hashPassword('mySecret123')
    await expect(verifyPassword('wrongPassword', hashed)).resolves.toBe(false)
  })

  it('produces different hashes for the same password (random salt)', async () => {
    const a = await hashPassword('sammePassword')
    const b = await hashPassword('sammePassword')
    expect(a).not.toBe(b)
  })

  it('recognizes hashed vs legacy plaintext passwords', () => {
    expect(isHashedPassword('pbkdf2$150000$abc$def')).toBe(true)
    expect(isHashedPassword('plaintext-password')).toBe(false)
  })

  it('falls back to direct comparison for legacy plaintext passwords', async () => {
    await expect(verifyPassword('legacyPass', 'legacyPass')).resolves.toBe(true)
    await expect(verifyPassword('wrong', 'legacyPass')).resolves.toBe(false)
  })
})
