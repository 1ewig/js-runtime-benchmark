import express from 'express'
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
  console.log(`🚀 [Cluster Primary ${process.pid}] Spawning ${numWorkers} Node.js workers across microVM vCPUs...`)
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

  const app = express()

  // Production HTTP Optimizations
  app.disable('x-powered-by')
  app.disable('etag')
  app.use(express.json({ limit: '10mb' }))

  // Service Directory
  app.get('/', (_req, res) => {
    res.json({
      service: 'InstaCloud Instagram-Style Backend API',
      runtime: 'Node.js ' + process.version,
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
  app.get('/health', async (_req, res) => {
    try {
      const start = performance.now()
      const [ping] = await sql`SELECT 1 as alive;`
      const dbLatency = (performance.now() - start).toFixed(2)

      const mem = process.memoryUsage()
      res.json({
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
      res.status(500).json({ status: 'unhealthy', error: err.message })
    }
  })

  // Mount Modular Sub-Routers
  app.use('/api/auth', authRoutes)
  app.use('/api/feed', feedRoutes)
  app.use('/api/users', usersRoutes)
  app.use('/api/posts', postsRoutes)
  app.use('/api/stories', storiesRoutes)
  app.use('/api/search', searchRoutes)
  app.use('/api/telemetry', telemetryRoutes)

  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`⚡ [Worker ${process.pid}] Node Express listening on http://0.0.0.0:${port}`)
  })

  server.keepAliveTimeout = 30000
  server.headersTimeout = 35000
}
