const args = process.argv.slice(2)
function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const concurrency = Number(getArg('--concurrency', '100'))
const durationSec = Number(getArg('--duration', '10'))
const path = getArg('--path', '/api/bench/feed')
const targetUrl = `http://127.0.0.1:3000${path}`

console.log('═══════════════════════════════════════════════════════════')
console.log('⚡ INTERNAL IN-CONTAINER BENCHMARK (0ms Network Latency)')
console.log('═══════════════════════════════════════════════════════════')
console.log(`🎯 URL:          ${targetUrl}`)
console.log(`👥 Concurrency:  ${concurrency} parallel async workers`)
console.log(`⏱️ Duration:     ${durationSec}s`)
console.log(`⚙️ Bun:          ${Bun.version} (${process.arch}-${process.platform})`)
console.log('───────────────────────────────────────────────────────────')

let completed = 0
let errors = 0
const latencies: number[] = []

const stopTime = Date.now() + durationSec * 1000

async function worker() {
  while (Date.now() < stopTime) {
    const start = performance.now()
    try {
      const res = await fetch(targetUrl)
      if (res.ok) {
        await res.text() // read body
        const elapsed = performance.now() - start
        latencies.push(elapsed)
        completed++
      } else {
        errors++
      }
    } catch {
      errors++
    }
  }
}

const startMem = process.memoryUsage()
const startTime = performance.now()

// Launch concurrent workers
await Promise.all(Array.from({ length: concurrency }, () => worker()))

const totalTimeSec = (performance.now() - startTime) / 1000
const endMem = process.memoryUsage()

latencies.sort((a, b) => a - b)
function getP(p: number) {
  if (latencies.length === 0) return 0
  const idx = Math.floor((p / 100) * latencies.length)
  return latencies[Math.min(idx, latencies.length - 1)].toFixed(2)
}

const rps = (completed / totalTimeSec).toFixed(2)

console.log('═══════════════════════════════════════════════════════════')
console.log('📊 INTERNAL BENCHMARK RESULTS')
console.log('═══════════════════════════════════════════════════════════')
console.log(`⚡ Sustained RPS:       ${Number(rps).toLocaleString()} req/s`)
console.log(`📦 Completed Requests:  ${completed.toLocaleString()}`)
console.log(`❌ Failed Requests:     ${errors}`)
console.log(`⏱️ Test Duration:       ${totalTimeSec.toFixed(2)}s`)
console.log('───────────────────────────────────────────────────────────')
console.log('⏱️ LATENCY PERCENTILES (Internal):')
console.log(`   p50 (Median):        ${getP(50)} ms`)
console.log(`   p75:                 ${getP(75)} ms`)
console.log(`   p90:                 ${getP(90)} ms`)
console.log(`   p99:                 ${getP(99)} ms`)
console.log('───────────────────────────────────────────────────────────')
console.log('💾 MEMORY:')
console.log(`   RSS:                 ${Math.round(endMem.rss / 1024 / 1024)} MB (delta: +${Math.round((endMem.rss - startMem.rss) / 1024 / 1024)} MB)`)
console.log(`   Heap Used:           ${Math.round(endMem.heapUsed / 1024 / 1024)} MB`)
console.log('═══════════════════════════════════════════════════════════\n')
