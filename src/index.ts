import { Hono } from 'hono'
import { sql } from './db'
import { authRoutes } from './routes/auth'
import { feedRoutes } from './routes/feed'
import { usersRoutes } from './routes/users'
import { postsRoutes } from './routes/posts'
import { telemetryRoutes } from './routes/telemetry'
import { apiTelemetry } from './telemetry'

// Start real-time CPU, Memory, and Event-Loop sampler
apiTelemetry.start()

const app = new Hono()

// Service Directory
app.get('/', (c) => {
  return c.json({
    service: 'InstaCloud Instagram-Style Backend API',
    runtime: 'Bun ' + Bun.version,
    endpoints: [
      'GET  /health',
      'GET  /api/telemetry',
      'POST /api/telemetry/reset',
      'POST /api/auth/token',
      'GET  /api/feed/home?userId=<id>&cursor=<id>&limit=20',
      'GET  /api/feed/explore?cursor=<id>&limit=20',
      'GET  /api/feed?cursor=<id>&limit=20',
      'GET  /api/users/:id',
      'POST /api/users/:id/follow',
      'POST /api/posts',
      'POST /api/posts/:id/like',
    ],
  })
})

// Observability & Database Health
app.get('/health', async (c) => {
  try {
    const start = performance.now()
    const [ping] = await sql`SELECT 1 as alive;`
    const dbLatency = (performance.now() - start).toFixed(2)

    const mem = process.memoryUsage()
    return c.json({
      status: 'healthy',
      db: ping.alive === 1 ? 'connected' : 'degraded',
      dbLatencyMs: Number(dbLatency),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      uptimeSec: Math.round(process.uptime()),
    })
  } catch (err: any) {
    return c.json({ status: 'unhealthy', error: err.message }, 500)
  }
})

// Mount Modular Sub-Routers
app.route('/api/auth', authRoutes)
app.route('/api/feed', feedRoutes)
app.route('/api/users', usersRoutes)
app.route('/api/posts', postsRoutes)
app.route('/api/telemetry', telemetryRoutes)

const port = Number(process.env.PORT) || 3000

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}
