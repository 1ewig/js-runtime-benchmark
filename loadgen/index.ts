import { Hono } from 'hono'
import { startLoadgenTelemetry } from './telemetry'
import { createMetricsCollector } from './metrics'
import { runVirtualUser } from './journey'

const app = new Hono()

const DEFAULT_TARGET_URL = 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com'

let lastResult: any = null
let isRunning = false

app.get('/', (c) => {
  return c.json({
    service: 'InstaCloud Distributed Realistic Load Generator (loadgen) [A+ Grade]',
    runtime: 'Bun ' + Bun.version,
    status: isRunning ? 'running_test' : 'idle',
    features: [
      'Multi-Stage Ramp-Up Lifecycle',
      'Coordinated Omission Detection & Correction',
      'Granular HTTP Status Code Matrix',
      'Loadgen Event-Loop & Memory Telemetry',
      'Per-Second Time-Series RPS Timeline',
      'HMAC-SHA256 Token Authentication Simulation',
    ],
    endpoints: {
      'GET /health': 'Observability and memory telemetry',
      'GET /run': 'Run test via query params: ?users=100&duration=60&rampUpSec=15&thinkTimeMs=200',
      'POST /run': 'Run test via JSON body: { users, duration, rampUpSec, thinkTimeMs, targetUrl, useAuth }',
      'GET /last-result': 'Fetch the report from the most recent load test run',
    },
    defaultTarget: DEFAULT_TARGET_URL,
  })
})

app.get('/health', (c) => {
  const mem = process.memoryUsage()
  return c.json({
    status: 'healthy',
    busy: isRunning,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    },
    uptimeSec: Math.round(process.uptime()),
  })
})

app.get('/last-result', (c) => {
  if (!lastResult) {
    return c.json({ message: 'No load test has been executed yet.' }, 404)
  }
  return c.json(lastResult)
})

// Unified runner handler for GET and POST
async function handleRun(c: any) {
  if (isRunning) {
    return c.json({ error: 'A load test is already in progress. Please wait for it to complete.' }, 409)
  }

  let users = 100
  let duration = 60
  let rampUpSec = 15
  let thinkTimeMs = 200
  let targetUrl = DEFAULT_TARGET_URL
  let useAuth = true

  if (c.req.method === 'POST') {
    const body = await c.req.json().catch(() => ({}))
    if (body.users !== undefined) users = Math.min(Math.max(Number(body.users), 1), 2000)
    if (body.duration !== undefined) duration = Math.min(Math.max(Number(body.duration), 5), 300)
    if (body.rampUpSec !== undefined) rampUpSec = Math.min(Math.max(Number(body.rampUpSec), 0), duration - 1)
    if (body.thinkTimeMs !== undefined) thinkTimeMs = Math.max(Number(body.thinkTimeMs), 0)
    if (body.targetUrl) targetUrl = String(body.targetUrl).replace(/\/$/, '')
    if (body.useAuth !== undefined) useAuth = Boolean(body.useAuth)
  } else {
    const qUsers = c.req.query('users')
    const qDuration = c.req.query('duration')
    const qRamp = c.req.query('rampUpSec')
    const qThink = c.req.query('thinkTimeMs')
    const qTarget = c.req.query('targetUrl')
    const qAuth = c.req.query('useAuth')

    if (qUsers) users = Math.min(Math.max(Number(qUsers), 1), 2000)
    if (qDuration) duration = Math.min(Math.max(Number(qDuration), 5), 300)
    if (qRamp !== undefined) rampUpSec = Math.min(Math.max(Number(qRamp), 0), duration - 1)
    if (qThink !== undefined) thinkTimeMs = Math.max(Number(qThink), 0)
    if (qTarget) targetUrl = String(qTarget).replace(/\/$/, '')
    if (qAuth !== undefined) useAuth = qAuth !== 'false'
  }

  isRunning = true

  // Reset API server telemetry to begin a clean measurement window
  try {
    await fetch(`${targetUrl}/api/telemetry/reset`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    }).catch(() => {})
  } catch {}

  const startTime = performance.now()
  const stopTimestamp = Date.now() + duration * 1000

  // Start microVM telemetry and initialize metrics collector
  const telemetry = startLoadgenTelemetry()
  const collector = createMetricsCollector(duration, startTime)

  // Launch virtual users concurrently
  await Promise.all(
    Array.from({ length: users }, (_, i) =>
      runVirtualUser({
        workerId: i + 1,
        users,
        rampUpSec,
        thinkTimeMs,
        targetUrl,
        useAuth,
        stopTimestamp,
        collector,
      })
    )
  )

  const totalDurationSec = (performance.now() - startTime) / 1000
  const telemetryReport = telemetry.stop()

  // Retrieve API server CPU & Memory telemetry recorded during the benchmark
  let apiServerTelemetry: any = null
  try {
    const apiTelRes = await fetch(`${targetUrl}/api/telemetry`, {
      signal: AbortSignal.timeout(4000),
    }).catch(() => null)
    if (apiTelRes && apiTelRes.ok) {
      apiServerTelemetry = await apiTelRes.json().catch(() => null)
    }
  } catch {}

  isRunning = false

  const report = collector.compileReport(
    {
      users,
      duration,
      rampUpSec,
      thinkTimeMs,
      targetUrl,
      useAuth,
      totalDurationSec,
    },
    telemetryReport,
    apiServerTelemetry
  )

  lastResult = report
  return c.json(report)
}

app.get('/run', handleRun)
app.post('/run', handleRun)

const port = Number(process.env.PORT) || 8080

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}
