import { Hono } from 'hono'
import { signAuthToken } from '../../shared/auth'

export const authRoutes = new Hono()

// Authentication Token Issuance (for benchmark simulation & clients)
authRoutes.post('/token', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const userId = Number(body.userId) || 1
  const token = signAuthToken(userId)
  return c.json({ userId, token, scheme: 'Bearer' })
})
