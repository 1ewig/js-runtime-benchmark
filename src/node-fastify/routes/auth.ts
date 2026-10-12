import type { FastifyPluginAsync } from 'fastify'
import { signAuthToken } from '../../shared/auth'

export const authRoutes: FastifyPluginAsync = async (app) => {
  // Authentication Token Issuance (for benchmark simulation & clients)
  app.post('/token', async (request, reply) => {
    const body = request.body as any
    const userId = Number(body?.userId) || 1
    const token = signAuthToken(userId)
    return reply.send({ userId, token, scheme: 'Bearer' })
  })
}