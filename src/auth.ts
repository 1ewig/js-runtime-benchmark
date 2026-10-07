import crypto from 'node:crypto'

export const AUTH_SECRET = process.env.AUTH_SECRET || 'instacloud-benchmark-secret-2026'

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

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSig)

  if (sigBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    if (verifiedTokenCache.size >= MAX_CACHE_SIZE) {
      verifiedTokenCache.clear()
    }
    // Cache valid token for 5 minutes
    verifiedTokenCache.set(token, { userId, expiresAt: Date.now() + 300_000 })
    return { userId }
  }

  return null
}
