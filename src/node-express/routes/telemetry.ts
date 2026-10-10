import { Router } from 'express'
import { apiTelemetry } from '../../shared/telemetry'

export const telemetryRoutes = Router()

// Get live CPU, Memory, and Event-Loop statistics
telemetryRoutes.get('/', (_req, res) => {
  res.json(apiTelemetry.getReport())
})

// Reset metric samples before starting a new benchmark window
telemetryRoutes.post('/reset', (_req, res) => {
  apiTelemetry.reset()
  res.json({ success: true, message: 'API telemetry samples reset to baseline' })
})
