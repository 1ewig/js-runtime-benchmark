import autocannon from 'autocannon'

const BASE_URL = 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com'

// Parse CLI flags or use defaults
const args = process.argv.slice(2)
function getArg(flag: string, fallback: string): string {
  const idx = args.indexOf(flag)
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback
}

const connections = Number(getArg('--connections', '50'))
const duration = Number(getArg('--duration', '15'))
const path = getArg('--path', '/api/bench/feed')
const pipelining = Number(getArg('--pipelining', '1'))

const targetUrl = `${BASE_URL}${path}`

console.log('═══════════════════════════════════════════════════════════')
console.log('🚀 INSTACLOUD LOAD TESTER (Bun 1.4.2 Rust Runtime Benchmark)')
console.log('═══════════════════════════════════════════════════════════')
console.log(`🎯 Target:       ${targetUrl}`)
console.log(`👥 Concurrency:  ${connections} concurrent virtual connections`)
console.log(`⏱️ Duration:     ${duration} seconds`)
console.log(`⚡ Pipelining:   ${pipelining}`)
console.log('───────────────────────────────────────────────────────────')
console.log('Running test...\n')

async function run() {
  const result = await autocannon({
    url: targetUrl,
    connections,
    duration,
    pipelining,
  })

  console.log('═══════════════════════════════════════════════════════════')
  console.log('📊 BENCHMARK RESULTS SUMMARY')
  console.log('═══════════════════════════════════════════════════════════')
  console.log(`⚡ Requests/sec (RPS):  ${result.requests.average.toFixed(2)} req/s`)
  console.log(`📈 Peak RPS:            ${result.requests.max} req/s`)
  console.log(`📦 Total Requests:      ${result.requests.total.toLocaleString()}`)
  console.log(`💾 Throughput:          ${(result.throughput.average / 1024 / 1024).toFixed(2)} MB/s`)
  console.log('───────────────────────────────────────────────────────────')
  console.log('⏱️ LATENCY PERCENTILES:')
  console.log(`   p50 (Median):        ${result.latency.p50} ms`)
  console.log(`   p75:                 ${result.latency.p75} ms`)
  console.log(`   p90:                 ${result.latency.p90} ms`)
  console.log(`   p97.5:               ${result.latency.p97_5} ms`)
  console.log(`   p99:                 ${result.latency.p99} ms`)
  console.log('───────────────────────────────────────────────────────────')
  console.log('⚠️ ERRORS & STATUS:')
  console.log(`   2xx Responses:       ${result['2xx'].toLocaleString()}`)
  console.log(`   Non-2xx / Errors:    ${result.non2xx + result.errors}`)
  console.log(`   Timeouts:            ${result.timeouts}`)
  console.log('═══════════════════════════════════════════════════════════\n')
}

run().catch(console.error)
