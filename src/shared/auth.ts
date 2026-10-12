import crypto from 'node:crypto'

const rawSecret = process.env.AUTH_SECRET
if (!rawSecret) {
  throw new Error(
    'AUTH_SECRET is not set. Bind it with `insta secrets set AUTH_SECRET` ' +
      '(or export it locally) - there is no default fallback by design.',
  )
}

export const AUTH_SECRET = rawSecret

/** Maximum age of a bearer token before verification rejects it. */
export const TOKEN_MAX_AGE_MS = 5 * 60_000
/** Tolerance for clocks that disagree between the signer and verifier. */
const CLOCK_SKEW_MS = 30_000

function computeHmacHex(payload: string, secret: string): string {
  if (typeof Bun !== 'undefined' && Bun.CryptoHasher) {
    return new Bun.CryptoHasher('sha256', secret).update(payload).digest('hex')
  }
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

/**
 * Generate a signed Bearer token: `<userId>.<timestamp>.<signature>`
 */
export function signAuthToken(userId: number, secret: string = AUTH_SECRET): string {
  const payload = `${userId}.${Date.now()}`
  const hmac = computeHmacHex(payload, secret)
  return `${payload}.${hmac}`
}

const verifiedTokenCache = new Map<string, { userId: number; expiresAt: number }>()
const MAX_CACHE_SIZE = 10000

/**
 * Verify a Bearer token with HMAC-SHA256 and constant-time equality check.
 * Returns decoded userId or null if invalid.
 */
export function verifyAuthToken(authHeader?: string | null, secret: string = AUTH_SECRET): { userId: number } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7).trim()

  // Fast path: check in-memory cache
  const cached = verifiedTokenCache.get(token)
  if (cached) {
    if (Date.now() < cached.expiresAt) {
      return { userId: cached.userId }
    }
    verifiedTokenCache.delete(token)
  }

  const parts = token.split('.')
  if (parts.length !== 3) {
    return null
  }

  const [userIdStr, timestampStr, signature] = parts
  const userId = Number(userIdStr)
  if (!userId || isNaN(userId)) {
    return null
  }

  const payload = `${userIdStr}.${timestampStr}`
  const expectedSig = computeHmacHex(payload, secret)

  // Reject tokens that are too old, or dated implausibly far in the future.
  const issuedAt = Number(timestampStr)
  const age = Date.now() - issuedAt
  if (age > TOKEN_MAX_AGE_MS || age < -CLOCK_SKEW_MS) {
    return null
  }

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSig)

  if (sigBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    if (verifiedTokenCache.size >= MAX_CACHE_SIZE) {
      verifiedTokenCache.clear()
    }
    // Cache valid token, but never past the token's own expiry - a cache
    // entry that outlives its token would keep accepting a stale credential.
    verifiedTokenCache.set(token, {
      userId,
      expiresAt: Math.min(Date.now() + TOKEN_MAX_AGE_MS, issuedAt + TOKEN_MAX_AGE_MS),
    })
    return { userId }
  }

  return null
}
