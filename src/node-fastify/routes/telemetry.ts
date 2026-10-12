import type { FastifyPluginAsync } from 'fastify'
import { apiTelemetry } from '../../shared/telemetry'

export const telemetryRoutes: FastifyPluginAsync = async (app) => {
  // Get live CPU, Memory, and Event-Loop statistics
  app.get('/', async (_request, reply) => {
    return reply.send(apiTelemetry.getReport())
  })

  // Reset metric samples before starting a new benchmark window
  app.post('/reset', async (_request, reply) => {
    apiTelemetry.reset()
    return reply.send({ success: true, message: 'API telemetry samples reset to baseline' })
  })
}