// Password hashing med PBKDF2 (Web Crypto). Gemte passwords har formatet
// "pbkdf2$<iterationer>$<salt-b64>$<hash-b64>". Gamle klartekst-passwords
// genkendes ved at de IKKE starter med "pbkdf2$" og opgraderes ved login.

const ITERATIONS = 150_000

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function fromBase64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

async function deriveBits(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await deriveBits(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`
}

export function isHashedPassword(stored: string): boolean {
  return stored.startsWith('pbkdf2$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isHashedPassword(stored)) {
    // Legacy klartekst — sammenlign direkte (kalderen bør opgradere til hash).
    return stored === password
  }
  const [, iterStr, saltB64, hashB64] = stored.split('$')
  const iterations = Number(iterStr)
  if (!Number.isFinite(iterations) || iterations < 1) return false
  const expected = fromBase64(hashB64)
  const actual = await deriveBits(password, fromBase64(saltB64), iterations)
  if (actual.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i]
  return diff === 0
}
