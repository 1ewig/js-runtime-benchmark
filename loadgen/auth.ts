import crypto from 'node:crypto'

const rawSecret = process.env.AUTH_SECRET
if (!rawSecret) {
  throw new Error(
    'AUTH_SECRET is not set. Bind it with `insta secrets set AUTH_SECRET` ' +
      '(or export it locally) - there is no default fallback by design.',
  )
}

export const AUTH_SECRET = rawSecret

/**
 * Generate a signed Bearer token: `<userId>.<timestamp>.<signature>`
 */
export function signAuthToken(userId: number, secret: string = AUTH_SECRET): string {
  const payload = `${userId}.${Date.now()}`
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  return `${payload}.${hmac}`
}
