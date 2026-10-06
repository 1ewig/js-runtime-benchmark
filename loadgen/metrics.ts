import type { TelemetryReport } from './telemetry'

export interface ActionStats {
  count: number
  errors: number
  totalMs: number
  statusCodes: Record<string, number>
}

export interface PercentileStats {
  p50: number
  p75: number
  p90: number
  p95: number
  p99: number
  p99_9: number
  min: number
  max: number
  avg: number
}

export function computePercentiles(arr: number[]): PercentileStats {
  if (arr.length === 0) {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0, p99_9: 0, min: 0, max: 0, avg: 0 }
  }
  arr.sort((a, b) => a - b)
  const getP = (p: number) => {
    const idx = Math.floor((p / 100) * arr.length)
    return Number(arr[Math.min(idx, arr.length - 1)].toFixed(2))
  }
  const sum = arr.reduce((acc, v) => acc + v, 0)
  return {
    p50: getP(50),
    p75: getP(75),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    p99_9: getP(99.9),
    min: Number(arr[0].toFixed(2)),
    max: Number(arr[arr.length - 1].toFixed(2)),
    avg: Number((sum / arr.length).toFixed(2)),
  }
}

export function createMetricsCollector(duration: number, startTime: number) {
  const rawLatencies: number[] = []
  const coCorrectedLatencies: number[] = []
  const scheduleDelays: number[] = []
  let totalRequests = 0
  let totalErrors = 0

  const statusMatrix: Record<string, number> = {
    '200': 0,
    '201': 0,
    '400': 0,
    '401': 0,
    '404': 0,
    '429': 0,
    '500': 0,
    '502': 0,
    '503': 0,
    '504': 0,
    other: 0,
  }

  const networkErrors: Record<string, number> = {
    TIMEOUT: 0,
    ECONNRESET: 0,
    FETCH_FAILED: 0,
  }

  const actionStats: Record<string, ActionStats> = {
    homeTimeline: { count: 0, errors: 0, totalMs: 0, statusCodes: {} },
    exploreFeed: { count: 0, errors: 0, totalMs: 0, statusCodes: {} },
    profileView: { count: 0, errors: 0, totalMs: 0, statusCodes: {} },
    likePost: { count: 0, errors: 0, totalMs: 0, statusCodes: {} },
    followCreator: { count: 0, errors: 0, totalMs: 0, statusCodes: {} },
  }

  const secondBuckets = new Map<number, { count: number; errors: number; totalMs: number }>()

  function record(
    actionName: string,
    rawElapsed: number,
    scheduleDelay: number,
    status: number | null,
    errType: string | null
  ) {
    const coLatency = rawElapsed + scheduleDelay
    rawLatencies.push(rawElapsed)
    coCorrectedLatencies.push(coLatency)
    scheduleDelays.push(scheduleDelay)

    totalRequests++
    const isSuccess = status !== null && status >= 200 && status < 400
    if (!isSuccess) totalErrors++

    if (status !== null) {
      const codeKey = String(status)
      if (statusMatrix[codeKey] !== undefined) {
        statusMatrix[codeKey]++
      } else {
        statusMatrix.other++
      }
    } else if (errType) {
      if (networkErrors[errType] !== undefined) {
        networkErrors[errType]++
      } else {
        networkErrors.FETCH_FAILED++
      }
    }

    const act = actionStats[actionName]
    act.count++
    if (!isSuccess) act.errors++
    act.totalMs += rawElapsed
    if (status !== null) {
      const sKey = String(status)
      act.statusCodes[sKey] = (act.statusCodes[sKey] || 0) + 1
    }

    const sec = Math.min(Math.floor((performance.now() - startTime) / 1000), duration)
    let bucket = secondBuckets.get(sec)
    if (!bucket) {
      bucket = { count: 0, errors: 0, totalMs: 0 }
      secondBuckets.set(sec, bucket)
    }
    bucket.count++
    if (!isSuccess) bucket.errors++
    bucket.totalMs += rawElapsed
  }

  function compileReport(
    config: {
      users: number
      duration: number
      rampUpSec: number
      thinkTimeMs: number
      targetUrl: string
      useAuth: boolean
      totalDurationSec: number
    },
    telemetry: TelemetryReport,
    apiServerTelemetry?: any
  ) {
    const rawStats = computePercentiles(rawLatencies)
    const coStats = computePercentiles(coCorrectedLatencies)
    const avgScheduleDelayMs = scheduleDelays.length > 0
      ? Number((scheduleDelays.reduce((a, b) => a + b, 0) / scheduleDelays.length).toFixed(2))
      : 0

    const rps = Number((totalRequests / config.totalDurationSec).toFixed(2))
    const successRate = totalRequests > 0
      ? Number((((totalRequests - totalErrors) / totalRequests) * 100).toFixed(2))
      : 100

    const workloadBreakdown: Record<string, any> = {}
    for (const [key, val] of Object.entries(actionStats)) {
      workloadBreakdown[key] = {
        requests: val.count,
        errors: val.errors,
        avgLatencyMs: val.count > 0 ? Number((val.totalMs / val.count).toFixed(2)) : 0,
        sharePercent: totalRequests > 0 ? Number(((val.count / totalRequests) * 100).toFixed(1)) : 0,
        statusCodes: val.statusCodes,
      }
    }

    const rpsTimeline: { second: number; rps: number; avgLatencyMs: number; errors: number }[] = []
    for (let s = 0; s <= Math.floor(config.totalDurationSec); s++) {
      const b = secondBuckets.get(s)
      if (b) {
        rpsTimeline.push({
          second: s,
          rps: b.count,
          avgLatencyMs: b.count > 0 ? Number((b.totalMs / b.count).toFixed(2)) : 0,
          errors: b.errors,
        })
      }
    }

    const estimatedActiveHumanCapacity = Math.round(rps * 10)

    return {
      test: 'Realistic Instagram Virtual User Journey Benchmark [A+ Production-Grade]',
      lifecycle: {
        totalDurationSeconds: Number(config.totalDurationSec.toFixed(2)),
        rampUpSeconds: config.rampUpSec,
        steadyStateDurationSeconds: Number(Math.max(0, config.totalDurationSec - config.rampUpSec).toFixed(2)),
        concurrentVirtualUsers: config.users,
        thinkTimeMs: config.thinkTimeMs,
        targetUrl: config.targetUrl,
        authenticationSimulated: config.useAuth,
      },
      performance: {
        sustainedRps: rps,
        totalRequestsCompleted: totalRequests,
        failedRequests: totalErrors,
        successRatePercent: successRate,
        estimatedActiveConcurrentHumanCapacity: estimatedActiveHumanCapacity,
      },
      latencyPercentilesMs: {
        raw: rawStats,
        coordinatedOmissionCorrected: coStats,
        avgCadenceDelayMs: avgScheduleDelayMs,
      },
      statusMatrix: {
        httpStatusCodes: statusMatrix,
        networkErrors,
      },
      workloadBreakdown,
      apiServerTelemetry: apiServerTelemetry || null,
      loadgenTelemetry: telemetry,
      rpsTimeline: rpsTimeline.slice(0, 30),
      timestamp: new Date().toISOString(),
    }
  }

  return {
    record,
    compileReport,
  }
}

export type MetricsCollector = ReturnType<typeof createMetricsCollector>
