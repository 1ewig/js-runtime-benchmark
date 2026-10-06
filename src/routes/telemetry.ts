import { Hono } from 'hono'
import { apiTelemetry } from '../telemetry'

export const telemetryRoutes = new Hono()

// Get live CPU, Memory, and Event-Loop statistics
telemetryRoutes.get('/', (c) => {
  return c.json(apiTelemetry.getReport())
})

// Reset metric samples before starting a new benchmark window
telemetryRoutes.post('/reset', (c) => {
  apiTelemetry.reset()
  return c.json({ success: true, message: 'API telemetry samples reset to baseline' })
})
