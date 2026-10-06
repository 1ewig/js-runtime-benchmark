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
