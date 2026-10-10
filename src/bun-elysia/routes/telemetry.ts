import { Elysia } from 'elysia'
import { apiTelemetry } from '../../shared/telemetry'

export const telemetryRoutes = new Elysia({ prefix: '/api/telemetry' })

// Get live CPU, Memory, and Event-Loop statistics
telemetryRoutes.get('/', () => apiTelemetry.getReport())

// Reset metric samples before starting a new benchmark window
telemetryRoutes.post('/reset', () => {
  apiTelemetry.reset()
  return { success: true, message: 'API telemetry samples reset to baseline' }
})
