import { Router } from 'express'
import { signAuthToken } from '../../shared/auth'

export const authRoutes = Router()

// Authentication Token Issuance (for benchmark simulation & clients)
authRoutes.post('/token', (req, res) => {
  const userId = Number(req.body?.userId) || 1
  const token = signAuthToken(userId)
  res.json({ userId, token, scheme: 'Bearer' })
})
