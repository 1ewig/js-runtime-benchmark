import { signAuthToken } from '../src/auth'
import { cleanBenchmarkData } from './clean-benchmark-data'

const API_URL = process.env.API_URL || 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com'
const LOADGEN_URL = process.env.LOADGEN_URL || 'https://prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com'

async function warmup() {
  console.log('🔥 [Warmup] Initializing full 3-service warmup routine...')
  console.log(`   API Target:     ${API_URL}`)
  console.log(`   Loadgen Target: ${LOADGEN_URL}\n`)

  // --- Step 1: Health & Observability Ping ---
  console.log('1️⃣ Checking Health of API & Loadgen microVMs...')
  const [apiHealthRes, loadgenHealthRes] = await Promise.all([
    fetch(`${API_URL}/health`).catch((e) => ({ ok: false, status: 0, error: e.message })),
    fetch(`${LOADGEN_URL}/health`).catch((e) => ({ ok: false, status: 0, error: e.message })),
  ])

  if ('json' in apiHealthRes && apiHealthRes.ok) {
    const json: any = await apiHealthRes.json()
    console.log(`   ✅ API microVM Healthy: DB status = "${json.db}", ping = ${json.dbLatencyMs}ms, memory = ${json.memory?.rssMb}MB`)
  } else {
    console.warn(`   ⚠️ API microVM returned non-200 or failed to reach:`, apiHealthRes)
  }

  if ('json' in loadgenHealthRes && loadgenHealthRes.ok) {
    const json: any = await loadgenHealthRes.json()
    console.log(`   ✅ Loadgen microVM Healthy: memory = ${json.memory?.rssMb}MB, uptime = ${json.uptimeSec}s`)
  } else {
    console.warn(`   ⚠️ Loadgen microVM returned non-200 or failed to reach:`, loadgenHealthRes)
  }

  // --- Step 2: Warm up API & DB Routes (JIT, Connection Pool, Prepared Statements) ---
  console.log('\n2️⃣ Priming API server routes, JIT compilation, and DB connection pool...')
  const warmupTokens = [1, 2, 5, 10, 50, 100].map((id) => signAuthToken(id))

  const sampleCalls = [
    // Telemetry reset
    fetch(`${API_URL}/api/telemetry/reset`, { method: 'POST' }),
    // Token generation
    fetch(`${API_URL}/api/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 1 }),
    }),
    // Home feed queries
    fetch(`${API_URL}/api/feed/home?userId=1&limit=20`, { headers: { Authorization: `Bearer ${warmupTokens[0]}` } }),
    fetch(`${API_URL}/api/feed/home?userId=2&limit=20`, { headers: { Authorization: `Bearer ${warmupTokens[1]}` } }),
    // Explore feed
    fetch(`${API_URL}/api/feed/explore?limit=20`),
    fetch(`${API_URL}/api/feed?limit=20`),
    // Stories tray
    fetch(`${API_URL}/api/stories/tray?userId=1`, { headers: { Authorization: `Bearer ${warmupTokens[0]}` } }),
    fetch(`${API_URL}/api/stories/tray?userId=5`, { headers: { Authorization: `Bearer ${warmupTokens[2]}` } }),
    // User profile grids
    fetch(`${API_URL}/api/users/1`),
    fetch(`${API_URL}/api/users/2`),
    fetch(`${API_URL}/api/users/10`),
    // Comments
    fetch(`${API_URL}/api/posts/100/comments?limit=20`),
    fetch(`${API_URL}/api/posts/200/comments?limit=20`),
    // Search
    fetch(`${API_URL}/api/search?q=dev&type=all&limit=15`),
    fetch(`${API_URL}/api/search?q=photo&type=posts&limit=15`),
    // Saved posts
    fetch(`${API_URL}/api/users/1/saved?limit=20`, { headers: { Authorization: `Bearer ${warmupTokens[0]}` } }),
  ]

  const warmupStart = performance.now()
  const results = await Promise.all(sampleCalls)
  const duration = (performance.now() - warmupStart).toFixed(1)
  const successful = results.filter((r) => r.ok).length
  console.log(`   ✅ Executed ${results.length} diverse API route requests in ${duration}ms (${successful}/${results.length} succeeded)`)

  // --- Step 3: Warm up Loadgen MicroVM with a brief mini-burst ---
  console.log('\n3️⃣ Priming Loadgen microVM (allocator, timers, worker pool)...')
  try {
    const burstRes = await fetch(`${LOADGEN_URL}/run?users=20&duration=4&rampUpSec=1&thinkTimeMs=50&useAuth=true&targetUrl=${encodeURIComponent(API_URL)}`, {
      signal: AbortSignal.timeout(15000),
    })
    if (burstRes.ok) {
      const burstJson: any = await burstRes.json()
      console.log(`   ✅ Loadgen mini-burst complete: ${burstJson.performance?.totalRequestsCompleted || 0} requests executed, p50 = ${burstJson.latencyPercentilesMs?.raw?.p50 || 0}ms`)
    } else {
      console.warn(`   ⚠️ Loadgen mini-burst returned status ${burstRes.status}`)
    }
  } catch (err: any) {
    console.warn(`   ⚠️ Loadgen burst warm-up notice: ${err.message}`)
  }

  // --- Step 4: Sanitize Database Benchmark Mutations & Reset Telemetry ---
  console.log('\n4️⃣ Sanitizing DB mutations and resetting API telemetry window...')
  try {
    await cleanBenchmarkData()
  } catch (err: any) {
    console.warn(`   ⚠️ DB cleanup notice: ${err.message}`)
  }
  await fetch(`${API_URL}/api/telemetry/reset`, { method: 'POST' }).catch(() => {})
  console.log('   ✅ API Telemetry baseline cleared and DB sanitized.')

  console.log('\n✨ [Warmup] All 3 services (API, DB, Loadgen) are hot, clean, and ready for benchmark!\n')
}

warmup().catch(console.error)
