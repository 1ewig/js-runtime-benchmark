import { Hono } from 'hono'
import cluster from 'node:cluster'
import { sql } from '../shared/db'
import { authRoutes } from './routes/auth'
import { feedRoutes } from './routes/feed'
import { usersRoutes } from './routes/users'
import { postsRoutes } from './routes/posts'
import { storiesRoutes } from './routes/stories'
import { searchRoutes } from './routes/search'
import { telemetryRoutes } from './routes/telemetry'
import { apiTelemetry } from '../shared/telemetry'

const port = Number(process.env.PORT) || 3000
const numWorkers = Number(process.env.WEB_CONCURRENCY) || 2

if (cluster.isPrimary && numWorkers > 1) {
  console.log(`🚀 [Cluster Primary ${process.pid}] Spawning ${numWorkers} Bun workers across microVM vCPUs...`)
  for (let i = 0; i < numWorkers; i++) {
    cluster.fork()
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`⚠️ [Cluster] Worker ${worker.process.pid} exited (${signal || code}). Respawning...`)
    cluster.fork()
  })
} else {
  // Worker process (or single-process if WEB_CONCURRENCY=1)
  apiTelemetry.start()

  const app = new Hono()

  // Service Directory
  app.get('/', (c) => {
    return c.json({
      service: 'InstaCloud Instagram-Style Backend API',
      runtime: 'Bun ' + Bun.version,
      workerPid: process.pid,
      endpoints: [
        'GET  /health',
        'GET  /api/telemetry',
        'POST /api/telemetry/reset',
        'POST /api/auth/token',
        'GET  /api/feed/home?userId=<id>&cursor=<id>&limit=20',
        'GET  /api/feed/explore?cursor=<id>&limit=20',
        'GET  /api/feed?cursor=<id>&limit=20',
        'GET  /api/stories/tray?userId=<id>',
        'POST /api/stories',
        'GET  /api/users/:id',
        'GET  /api/users/:id/saved?cursor=<id>&limit=20',
        'POST /api/users/:id/follow',
        'POST /api/posts',
        'POST /api/posts/:id/like',
        'GET  /api/posts/:id/comments?cursor=<id>&limit=20',
        'POST /api/posts/:id/comments',
        'POST /api/posts/:id/save',
        'GET  /api/search?q=<term>&type=users|posts|all',
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
        workerPid: process.pid,
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
  app.route('/api/stories', storiesRoutes)
  app.route('/api/search', searchRoutes)
  app.route('/api/telemetry', telemetryRoutes)

  Bun.serve({
    port,
    hostname: '0.0.0.0',
    reusePort: true,
    development: false,
    maxRequestBodySize: 10 * 1024 * 1024,
    idleTimeout: 30,
    fetch: app.fetch,
  })

  console.log(`⚡ [Worker ${process.pid}] Listening on http://0.0.0.0:${port} (reusePort: true)`)
}
