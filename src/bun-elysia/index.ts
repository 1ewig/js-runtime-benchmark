import { Elysia } from 'elysia'
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
const numWorkers = Number(process.env.WEB_CONCURRENCY) || 1

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

  const app = new Elysia({ aot: true })
    .onRequest(({ request }) => {
      (request as any)._t0 = performance.now()
    })
    .onAfterHandle(({ request, set }) => {
      const t0 = (request as any)._t0
      if (t0) {
        const dur = (performance.now() - t0).toFixed(2)
        set.headers['Server-Timing'] = `origin;dur=${dur}`
      }
    })

  // Service Directory
  app.get('/', () => ({
    service: 'InstaCloud Instagram-Style Backend API',
    runtime: 'Bun ' + Bun.version + ' + Elysia',
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
  }))

  // Observability & Database Health
  app.get('/health', async () => {
    try {
      const start = performance.now()
      const [ping] = await sql`SELECT 1 as alive;`
      const dbLatency = (performance.now() - start).toFixed(2)

      const mem = process.memoryUsage()
      return {
        status: 'healthy',
        db: ping.alive === 1 ? 'connected' : 'degraded',
        dbLatencyMs: Number(dbLatency),
        memory: {
          rssMb: Math.round(mem.rss / 1024 / 1024),
          heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
        },
        uptimeSec: Math.round(process.uptime()),
        workerPid: process.pid,
      }
    } catch (err: any) {
      return { status: 'unhealthy', error: err.message }
    }
  })

  // Mount Modular Sub-Routers
  app.use(authRoutes)
  app.use(feedRoutes)
  app.use(usersRoutes)
  app.use(postsRoutes)
  app.use(storiesRoutes)
  app.use(searchRoutes)
  app.use(telemetryRoutes)

  // Elysia manages its own Bun server via .listen(), unlike Hono which hands
  // app.fetch to Bun.serve(). This is one of the benchmarked variables.
  app.listen({ port, hostname: '0.0.0.0', reusePort: true })

  console.log(`⚡ [Worker ${process.pid}] Listening on http://0.0.0.0:${port} (Bun ${Bun.version} + Elysia)`)
}
