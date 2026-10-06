import crypto from 'node:crypto'

export const AUTH_SECRET = process.env.AUTH_SECRET || 'instacloud-benchmark-secret-2026'

/**
 * Generate a signed Bearer token: `<userId>.<timestamp>.<signature>`
 */
export function signAuthToken(userId: number, secret: string = AUTH_SECRET): string {
  const payload = `${userId}.${Date.now()}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

/**
 * Verify a Bearer token with HMAC-SHA256 and constant-time equality check.
 * Returns decoded userId or null if invalid.
 */
export function verifyAuthToken(authHeader?: string | null, secret: string = AUTH_SECRET): { userId: number } | null {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  const token = authHeader.slice(7).trim()
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
  const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex')

  const sigBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expectedSig)

  if (sigBuffer.length !== expectedBuffer.length) {
    return null
  }

  if (crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return { userId }
  }

  return null
}
