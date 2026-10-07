const LOADGEN_URL = process.env.LOADGEN_URL || 'https://prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com'
const API_URL = process.env.API_URL || 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com'

async function run() {
  const args = process.argv.slice(2)
  const getArg = (flag: string, fallback: number) => {
    const match = args.find((a) => a.startsWith(`--${flag}=`))
    if (match) return Number(match.split('=')[1])
    return fallback
  }

  const users = Number(process.env.USERS) || getArg('users', 1000)
  const rampUpSec = Number(process.env.RAMP_UP) || getArg('rampUp', 10)
  const duration = Number(process.env.DURATION) || getArg('duration', 60)
  const thinkTimeMs = Number(process.env.THINK_TIME) || getArg('thinkTime', 100)
  const useAuth = true

  console.log('🚀 [Benchmark] Triggering Load Generator MicroVM...')
  console.log(`   Loadgen Target:   ${LOADGEN_URL}`)
  console.log(`   API Target:       ${API_URL}`)
  console.log(`   Virtual Users:    ${users}`)
  console.log(`   Ramp-Up:          ${rampUpSec}s`)
  console.log(`   Duration:         ${duration}s`)
  console.log(`   Think Time:       ${thinkTimeMs}ms`)
  console.log(`   Authentication:   ${useAuth}\n`)

  const url = `${LOADGEN_URL}/run?users=${users}&duration=${duration}&rampUpSec=${rampUpSec}&thinkTimeMs=${thinkTimeMs}&useAuth=${useAuth}&targetUrl=${encodeURIComponent(API_URL)}`

  console.log(`⏳ Benchmark running for ${duration}s (with ${rampUpSec}s ramp-up)...`)
  const startTime = Date.now()
  const expectedEndTimestamp = Date.now() + (duration + 2) * 1000

  try {
    let data: any = null

    // Initiate the run request
    fetch(url, { signal: AbortSignal.timeout(duration * 1000 + 15000) })
      .then(async (res) => {
        if (res.ok) {
          data = await res.json().catch(() => null)
        }
      })
      .catch(() => {})

    // Poll until complete
    while (!data) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0)
      process.stdout.write(`   ⏱️ Elapsed: ${elapsed}s / ${duration}s ...\r`)

      if (Date.now() > expectedEndTimestamp) {
        // Test duration has elapsed, check last-result
        const resLast = await fetch(`${LOADGEN_URL}/last-result`).catch(() => null)
        if (resLast && resLast.ok) {
          const json: any = await resLast.json().catch(() => null)
          if (json && json.lifecycle?.totalDurationSeconds >= duration - 2) {
            data = json
            break
          }
        }
      }
      await Bun.sleep(2000)
    }
    console.log(`\n`)

    const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(2)

    console.log(`\n===============================================================`)
    console.log(`🏁 BENCHMARK COMPLETED IN ${elapsedTotal}s`)
    console.log(`===============================================================\n`)

    console.log(`📊 PERFORMANCE SUMMARY:`)
    console.log(`   • Total Duration:           ${data.lifecycle?.totalDurationSeconds}s (Ramp-up: ${data.lifecycle?.rampUpSeconds}s, Steady: ${data.lifecycle?.steadyStateDurationSeconds}s)`)
    console.log(`   • Virtual Users (VUs):      ${data.lifecycle?.concurrentVirtualUsers}`)
    console.log(`   • Total Requests Completed: ${data.performance?.totalRequestsCompleted.toLocaleString()}`)
    console.log(`   • Failed Requests:          ${data.performance?.failedRequests}`)
    console.log(`   • Success Rate:             ${data.performance?.successRatePercent}%`)
    console.log(`   • Sustained Throughput:     ${data.performance?.sustainedRps.toLocaleString()} req/sec`)
    console.log(`   • Estimated Active Humans:  ~${data.performance?.estimatedActiveConcurrentHumanCapacity.toLocaleString()} concurrent users\n`)

    console.log(`⏱️ LATENCY PERCENTILES:`)
    console.log(`   • p50 (Median):             ${data.latencyPercentilesMs?.raw?.p50} ms  (CO Corrected: ${data.latencyPercentilesMs?.coordinatedOmissionCorrected?.p50} ms)`)
    console.log(`   • p75:                      ${data.latencyPercentilesMs?.raw?.p75} ms  (CO Corrected: ${data.latencyPercentilesMs?.coordinatedOmissionCorrected?.p75} ms)`)
    console.log(`   • p90:                      ${data.latencyPercentilesMs?.raw?.p90} ms  (CO Corrected: ${data.latencyPercentilesMs?.coordinatedOmissionCorrected?.p90} ms)`)
    console.log(`   • p95:                      ${data.latencyPercentilesMs?.raw?.p95} ms  (CO Corrected: ${data.latencyPercentilesMs?.coordinatedOmissionCorrected?.p95} ms)`)
    console.log(`   • p99:                      ${data.latencyPercentilesMs?.raw?.p99} ms  (CO Corrected: ${data.latencyPercentilesMs?.coordinatedOmissionCorrected?.p99} ms)`)
    console.log(`   • Min / Max / Avg:          ${data.latencyPercentilesMs?.raw?.min} ms / ${data.latencyPercentilesMs?.raw?.max} ms / ${data.latencyPercentilesMs?.raw?.avg} ms\n`)

    console.log(`📋 HTTP STATUS CODES:`)
    console.log(JSON.stringify(data.statusMatrix?.httpStatusCodes, null, 2))

    if (data.apiServerTelemetry) {
      console.log(`\n💻 API SERVER TELEMETRY:`)
      console.log(`   • CPU Avg / Peak:           ${data.apiServerTelemetry.cpuUtilization?.avgCpuPct}% / ${data.apiServerTelemetry.cpuUtilization?.peakCpuPct}% (${data.apiServerTelemetry.cpuUtilization?.estimatedCoresUsed} cores)`)
      console.log(`   • Memory Peak (RSS):        ${data.apiServerTelemetry.memory?.peakRssMb} MB (${data.apiServerTelemetry.memory?.ramUsedPercent}% of RAM)`)
      console.log(`   • Event Loop Lag (Avg/p95): ${data.apiServerTelemetry.serverEventLoopLagMs?.avg} ms / ${data.apiServerTelemetry.serverEventLoopLagMs?.p95} ms`)
    }

    console.log(`\n📈 WORKLOAD BREAKDOWN:`)
    for (const [action, stats] of Object.entries(data.workloadBreakdown || {})) {
      const s = stats as any
      console.log(`   • ${action.padEnd(16)}: ${String(s.requests).padStart(6)} reqs (${String(s.sharePercent).padStart(4)}%) | avg ${String(s.avgLatencyMs).padStart(6)}ms | errors: ${s.errors}`)
    }

    console.log('\n===============================================================\n')
  } catch (e: any) {
    console.error('❌ Benchmark error:', e.message)
    process.exit(1)
  }
}

run()
