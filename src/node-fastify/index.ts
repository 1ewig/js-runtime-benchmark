import Fastify from 'fastify'
import cluster from 'node:cluster'
import http from 'node:http'
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

  const app = Fastify({
    // Native HTTP Server with zero-middleware Server-Timing resolution.
    // Timing is captured at the raw Node ServerResponse layer (single writeHead
    // wrap) rather than an onSend/onResponse hook, so no Fastify hook or
    // serializer tax is added to the hot request path — the same technique the
    // Express stack uses, and exactly ONE method wrap per request so neither
    // stack pays a second interception Express does not pay.
    serverFactory: (handler) =>
      http.createServer((req, res) => {
        const t0 = performance.now()

        // Fastify's onSendEnd() calls safeWriteHead() (lib/reply.js) BEFORE
        // res.end(), so headers must be injected at writeHead time. Express
        // instead flushes lazily on end(); both capture origin time at the raw
        // ServerResponse layer rather than via any framework hook.
        const origWriteHead = res.writeHead
        res.writeHead = function (this: http.ServerResponse, ...args: any[]) {
          if (!res.headersSent) {
            try {
              res.setHeader('Server-Timing', `origin;dur=${(performance.now() - t0).toFixed(2)}`)
            } catch {
              /* headers already locked — skip */
            }
          }
          return origWriteHead.apply(this, args as any)
        }

        handler(req, res)
      }),

    // Query parsing: Fastify already defaults to Node's native
    // querystring.parse (no deep/nested parsing), which is the level-playing
    // field equivalent of the Express stack's `query parser: simple`.
    // Left at the default deliberately so neither stack pays extra parse tax.

    // Pino logs every request by default and serialises both req and res on
    // each hit. Express pays no logging cost, so logging is disabled outright.
    logger: false,

    // No response schemas are declared on any route, so Fastify serialises
    // payloads with native JSON.stringify — the same path used by Express
    // res.json(), Hono and Elysia. Keeps the comparison honest.

    })

  const fastifyVersion: string = (Fastify as unknown as { version?: () => string }).version?.() ?? 'unknown'

  // Service Directory
  app.get('/', async (_request, reply) => {
    return reply.send({
      service: 'InstaCloud Instagram-Style Backend API',
      runtime: 'Node.js ' + process.version,
      framework: 'Fastify ' + fastifyVersion,
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
  app.get('/health', async (_request, reply) => {
    try {
      const start = performance.now()
      const [ping] = await sql`SELECT 1 as alive;`
      const dbLatency = (performance.now() - start).toFixed(2)

      const mem = process.memoryUsage()
      return reply.send({
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
      return reply.code(500).send({ status: 'unhealthy', error: err.message })
    }
  })

  // Mount Modular Encapsulated Plugin Routers (find-my-way router)
  app.register(authRoutes, { prefix: '/api/auth' })
  app.register(feedRoutes, { prefix: '/api/feed' })
  app.register(usersRoutes, { prefix: '/api/users' })
  app.register(postsRoutes, { prefix: '/api/posts' })
  app.register(storiesRoutes, { prefix: '/api/stories' })
  app.register(searchRoutes, { prefix: '/api/search' })
  app.register(telemetryRoutes, { prefix: '/api/telemetry' })

  const httpServer = app.server as unknown as http.Server
  httpServer.keepAliveTimeout = 65000
  httpServer.headersTimeout = 66000
  httpServer.requestTimeout = 0

  app.listen({ port, host: '0.0.0.0' }, (err) => {
    if (err) {
      console.error(`❌ [Worker ${process.pid}] Fastify failed to listen:`, err)
      process.exit(1)
    }
    console.log(`⚡ [Worker ${process.pid}] Node Fastify listening on http://0.0.0.0:${port}`)
  })
}