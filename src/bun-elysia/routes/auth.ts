import { Elysia } from 'elysia'
import { signAuthToken } from '../../shared/auth'

export const authRoutes = new Elysia({ prefix: '/api/auth' })

// Authentication Token Issuance (for benchmark simulation & clients)
authRoutes.post('/token', async ({ body }) => {
  const userId = Number((body as any)?.userId) || 1
  const token = signAuthToken(userId)
  return { userId, token, scheme: 'Bearer' }
})
