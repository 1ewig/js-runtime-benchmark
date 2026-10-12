import { UNIQUE_STACKS, STACK_TARGETS, type StackTarget } from './targets'
import { warmup } from './warmup'
import { runBenchmark } from './run-benchmark'

interface StackComparisonResult {
  target: StackTarget
  totalRequests: number
  sustainedRps: number
  successRate: number
  originP50: number
  originP95: number
  e2eP50: number
  e2eP95: number
  cpuAvgPct: number
  cpuPeakPct: number
  ramPeakMb: number
  ramPercent: number
  loopLagP95: number
}

async function runComparison() {
  const args = process.argv.slice(2)
  const getArg = (flag: string, fallback: number) => {
    const match = args.find((a) => a.startsWith(`--${flag}=`))
    if (match) return Number(match.split('=')[1])
    return fallback
  }

  const users = Math.min(Math.max(Number(process.env.USERS) || getArg('users', 1000), 1), 2000)
  const duration = Math.min(Math.max(Number(process.env.DURATION) || getArg('duration', 20), 5), 300)
  const rampUp = Math.min(Math.max(Number(process.env.RAMP_UP) || getArg('rampUp', 5), 0), duration - 1)
  const thinkTime = Number(process.env.THINK_TIME) || getArg('thinkTime', 100)

  // Parse which stacks to test
  const stacksArg = args.find((a) => a.startsWith('--stacks='))?.split('=')[1]
  let stacksToTest: StackTarget[] = UNIQUE_STACKS

  if (stacksArg) {
    const requestedNames = stacksArg.split(',').map((s) => s.trim().toLowerCase())
    stacksToTest = requestedNames
      .map((name) => STACK_TARGETS[name])
      .filter((t): t is StackTarget => Boolean(t))
  }

  console.log('╔═════════════════════════════════════════════════════════════════════╗')
  console.log('║       InstaCloud Automated Multi-Stack Benchmark Matrix             ║')
  console.log('╚═════════════════════════════════════════════════════════════════════╝')
  console.log(`  Virtual Users:  ${users}`)
  console.log(`  Duration:       ${duration}s (Ramp-up: ${rampUp}s)`)
  console.log(`  Think Time:     ${thinkTime}ms`)
  console.log(`  Stacks (${stacksToTest.length}):    ${stacksToTest.map((s) => s.label).join(' | ')}\n`)

  const results: StackComparisonResult[] = []

  for (let i = 0; i < stacksToTest.length; i++) {
    const stack = stacksToTest[i]
    console.log(`\n===============================================================`)
    console.log(`🚀 [${i + 1}/${stacksToTest.length}] RUNNING BENCHMARK: ${stack.label}`)
    console.log(`   URL: ${stack.url}`)
    console.log(`===============================================================\n`)

    try {
      console.log(`[Phase 1] Warming up ${stack.label}...`)
      await warmup(stack.url)
      await Bun.sleep(2500)

      console.log(`[Phase 2] Triggering benchmark for ${stack.label}...`)
      const report: any = await runBenchmark({
        targetUrl: stack.url,
        stackName: stack.name,
        users,
        duration,
        rampUp,
        thinkTime,
      })

      if (report) {
        results.push({
          target: stack,
          totalRequests: report.performance?.totalRequestsCompleted || 0,
          sustainedRps: report.performance?.sustainedRps || 0,
          successRate: report.performance?.successRatePercent || 0,
          originP50: report.latencyPercentilesMs?.originCompute?.p50 || 0,
          originP95: report.latencyPercentilesMs?.originCompute?.p95 || 0,
          e2eP50: report.latencyPercentilesMs?.raw?.p50 || 0,
          e2eP95: report.latencyPercentilesMs?.raw?.p95 || 0,
          cpuAvgPct: report.apiServerTelemetry?.cpuUtilization?.avgCpuPct || 0,
          cpuPeakPct: report.apiServerTelemetry?.cpuUtilization?.peakCpuPct || 0,
          ramPeakMb: report.apiServerTelemetry?.memory?.peakRssMb || 0,
          ramPercent: report.apiServerTelemetry?.memory?.ramUsedPercent || 0,
          loopLagP95: report.apiServerTelemetry?.serverEventLoopLagMs?.p95 || 0,
        })
      }
    } catch (err: any) {
      console.error(`❌ Benchmark failed for ${stack.label}:`, err.message)
    }

    if (i < stacksToTest.length - 1) {
      console.log(`\n⏳ Cooling down 5s before next stack...\n`)
      await Bun.sleep(5000)
    }
  }

  // Generate Final Comparison Leaderboard
  console.log('\n\n========================================================================================')
  console.log('🏆 FINAL MULTI-STACK BENCHMARK LEADERBOARD (1 vCPU / 1 GB Tier)')
  console.log('========================================================================================\n')

  results.sort((a, b) => b.sustainedRps - a.sustainedRps)

  console.log(
    'Rank | Framework Stack       | Sustained Throughput | Origin p50 / p95 | End-to-End p50 | Avg CPU | Peak RAM'
  )
  console.log(
    '-----|-----------------------|----------------------|------------------|----------------|---------|---------'
  )
  results.forEach((r, idx) => {
    const rank = `#${idx + 1}`.padEnd(4)
    const name = r.target.label.padEnd(21)
    const rps = `${r.sustainedRps.toLocaleString()} req/s`.padStart(20)
    const origin = `${r.originP50}ms / ${r.originP95}ms`.padStart(16)
    const e2e = `${r.e2eP50}ms`.padStart(14)
    const cpu = `${r.cpuAvgPct}%`.padStart(7)
    const ram = `${r.ramPeakMb}MB (${r.ramPercent}%)`.padStart(12)
    console.log(`${rank} | ${name} | ${rps} | ${origin} | ${e2e} | ${cpu} | ${ram}`)
  })

  console.log('\n========================================================================================\n')
}

runComparison().catch(console.error)
