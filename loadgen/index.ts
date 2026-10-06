import { Hono } from 'hono'

const app = new Hono()

const DEFAULT_TARGET_URL = 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com'

let lastResult: any = null
let isRunning = false

interface ActionStats {
  count: number
  errors: number
  totalMs: number
}

app.get('/', (c) => {
  return c.json({
    service: 'InstaCloud Distributed Realistic Load Generator (loadgen)',
    runtime: 'Bun ' + Bun.version,
    status: isRunning ? 'running_test' : 'idle',
    endpoints: {
      'GET /health': 'Observability and memory usage',
      'GET /run': 'Run test via query params: ?users=100&duration=10&thinkTimeMs=200',
      'POST /run': 'Run test via JSON body: { users, duration, thinkTimeMs, targetUrl }',
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
  let duration = 10
  let thinkTimeMs = 200
  let targetUrl = DEFAULT_TARGET_URL

  if (c.req.method === 'POST') {
    const body = await c.req.json().catch(() => ({}))
    if (body.users) users = Math.min(Math.max(Number(body.users), 1), 2000)
    if (body.duration) duration = Math.min(Math.max(Number(body.duration), 1), 60)
    if (body.thinkTimeMs !== undefined) thinkTimeMs = Math.max(Number(body.thinkTimeMs), 0)
    if (body.targetUrl) targetUrl = String(body.targetUrl).replace(/\/$/, '')
  } else {
    const qUsers = c.req.query('users')
    const qDuration = c.req.query('duration')
    const qThink = c.req.query('thinkTimeMs')
    const qTarget = c.req.query('targetUrl')

    if (qUsers) users = Math.min(Math.max(Number(qUsers), 1), 2000)
    if (qDuration) duration = Math.min(Math.max(Number(qDuration), 1), 60)
    if (qThink !== undefined) thinkTimeMs = Math.max(Number(qThink), 0)
    if (qTarget) targetUrl = String(qTarget).replace(/\/$/, '')
  }

  isRunning = true
  const startTime = performance.now()
  const stopTime = Date.now() + duration * 1000

  const latencies: number[] = []
  let totalRequests = 0
  let totalErrors = 0

  const actionStats: Record<string, ActionStats> = {
    homeTimeline: { count: 0, errors: 0, totalMs: 0 },
    exploreFeed: { count: 0, errors: 0, totalMs: 0 },
    profileView: { count: 0, errors: 0, totalMs: 0 },
    likePost: { count: 0, errors: 0, totalMs: 0 },
    followCreator: { count: 0, errors: 0, totalMs: 0 },
  }

  function record(actionName: string, elapsed: number, ok: boolean) {
    latencies.push(elapsed)
    totalRequests++
    if (!ok) totalErrors++

    const a = actionStats[actionName]
    a.count++
    if (!ok) a.errors++
    a.totalMs += elapsed
  }

  async function virtualUser(workerId: number) {
    const userId = (workerId % 5000) + 1
    let homeCursor: number | null = null
    let exploreCursor: number | null = null

    while (Date.now() < stopTime) {
      const roll = Math.random()

      if (roll < 0.55) {
        // 55% Home Timeline Scroll
        const t0 = performance.now()
        try {
          const url = `${targetUrl}/api/feed/home?userId=${userId}&${homeCursor ? `cursor=${homeCursor}&` : ''}limit=20`
          const res = await fetch(url)
          const elapsed = performance.now() - t0
          if (res.ok) {
            const data: any = await res.json().catch(() => ({}))
            homeCursor = data.nextCursor || null
            record('homeTimeline', elapsed, true)
          } else {
            record('homeTimeline', elapsed, false)
          }
        } catch {
          record('homeTimeline', performance.now() - t0, false)
        }
      } else if (roll < 0.80) {
        // 25% Explore Feed Discovery
        const t0 = performance.now()
        try {
          const url = `${targetUrl}/api/feed/explore?${exploreCursor ? `cursor=${exploreCursor}&` : ''}limit=20`
          const res = await fetch(url)
          const elapsed = performance.now() - t0
          if (res.ok) {
            const data: any = await res.json().catch(() => ({}))
            exploreCursor = data.nextCursor || null
            record('exploreFeed', elapsed, true)
          } else {
            record('exploreFeed', elapsed, false)
          }
        } catch {
          record('exploreFeed', performance.now() - t0, false)
        }
      } else if (roll < 0.92) {
        // 12% Profile & Photo Grid View
        const targetProfileId = Math.floor(Math.random() * 50) + 1
        const t0 = performance.now()
        try {
          const res = await fetch(`${targetUrl}/api/users/${targetProfileId}`)
          const elapsed = performance.now() - t0
          if (res.ok) {
            await res.text()
            record('profileView', elapsed, true)
          } else {
            record('profileView', elapsed, false)
          }
        } catch {
          record('profileView', performance.now() - t0, false)
        }
      } else if (roll < 0.98) {
        // 6% Double-tap Like (Write transaction)
        const postId = Math.floor(Math.random() * 50000) + 1
        const t0 = performance.now()
        try {
          const res = await fetch(`${targetUrl}/api/posts/${postId}/like`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
          })
          const elapsed = performance.now() - t0
          if (res.ok) {
            await res.text()
            record('likePost', elapsed, true)
          } else {
            record('likePost', elapsed, false)
          }
        } catch {
          record('likePost', performance.now() - t0, false)
        }
      } else {
        // 2% Follow Creator Toggle (Write transaction)
        let creatorId = Math.floor(Math.random() * 50) + 1
        if (creatorId === userId) creatorId = (creatorId % 50) + 2
        const t0 = performance.now()
        try {
          const res = await fetch(`${targetUrl}/api/users/${creatorId}/follow`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ followerId: userId }),
          })
          const elapsed = performance.now() - t0
          if (res.ok) {
            await res.text()
            record('followCreator', elapsed, true)
          } else {
            record('followCreator', elapsed, false)
          }
        } catch {
          record('followCreator', performance.now() - t0, false)
        }
      }

      // Authentic human think time with slight jitter
      if (thinkTimeMs > 0) {
        const jitter = thinkTimeMs * (0.8 + Math.random() * 0.4)
        await Bun.sleep(jitter)
      }
    }
  }

  // Launch virtual users concurrently
  await Promise.all(Array.from({ length: users }, (_, i) => virtualUser(i + 1)))

  const totalDurationSec = (performance.now() - startTime) / 1000
  isRunning = false

  // Percentiles calculation
  latencies.sort((a, b) => a - b)
  function getP(p: number) {
    if (latencies.length === 0) return 0
    const idx = Math.floor((p / 100) * latencies.length)
    return Number(latencies[Math.min(idx, latencies.length - 1)].toFixed(2))
  }

  const rps = Number((totalRequests / totalDurationSec).toFixed(2))
  const successRate = totalRequests > 0 ? Number((((totalRequests - totalErrors) / totalRequests) * 100).toFixed(2)) : 100

  const breakdown: Record<string, any> = {}
  for (const [key, val] of Object.entries(actionStats)) {
    breakdown[key] = {
      requests: val.count,
      errors: val.errors,
      avgLatencyMs: val.count > 0 ? Number((val.totalMs / val.count).toFixed(2)) : 0,
      sharePercent: totalRequests > 0 ? Number(((val.count / totalRequests) * 100).toFixed(1)) : 0,
    }
  }

  // Real-world active human capacity estimation (10s average click interval)
  const estimatedActiveHumanCapacity = Math.round(rps * 10)

  const report = {
    test: 'Realistic Instagram Virtual User Journey Benchmark',
    configuration: {
      concurrentVirtualUsers: users,
      testDurationSeconds: totalDurationSec.toFixed(2),
      thinkTimeMs,
      targetUrl,
    },
    performance: {
      sustainedRps: rps,
      totalRequestsCompleted: totalRequests,
      failedRequests: totalErrors,
      successRatePercent: successRate,
      estimatedActiveConcurrentHumanCapacity: estimatedActiveHumanCapacity,
    },
    latencyPercentilesMs: {
      p50: getP(50),
      p75: getP(75),
      p90: getP(90),
      p99: getP(99),
      min: latencies.length > 0 ? Number(latencies[0].toFixed(2)) : 0,
      max: latencies.length > 0 ? Number(latencies[latencies.length - 1].toFixed(2)) : 0,
    },
    workloadBreakdown: breakdown,
    timestamp: new Date().toISOString(),
  }

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
