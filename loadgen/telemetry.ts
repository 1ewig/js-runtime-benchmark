export interface TelemetryReport {
  healthy: boolean
  eventLoopLagMs: {
    max: number
    p95: number
    avg: number
  }
  peakMemory: {
    rssMb: number
    heapUsedMb: number
  }
  warning: string | null
}

export function startLoadgenTelemetry() {
  const lagSamples: number[] = []
  let peakRssBytes = 0
  let peakHeapBytes = 0
  let nextExpectedHeartbeat = performance.now() + 50

  const intervalId = setInterval(() => {
    const now = performance.now()
    const lag = Math.max(0, now - nextExpectedHeartbeat)
    lagSamples.push(lag)
    nextExpectedHeartbeat = now + 50

    const mem = process.memoryUsage()
    if (mem.rss > peakRssBytes) peakRssBytes = mem.rss
    if (mem.heapUsed > peakHeapBytes) peakHeapBytes = mem.heapUsed
  }, 50)

  function stop(): TelemetryReport {
    clearInterval(intervalId)

    lagSamples.sort((a, b) => a - b)
    const maxLagMs = lagSamples.length > 0 ? Number(lagSamples[lagSamples.length - 1].toFixed(2)) : 0
    const avgLagMs = lagSamples.length > 0
      ? Number((lagSamples.reduce((a, b) => a + b, 0) / lagSamples.length).toFixed(2))
      : 0
    const p95LagMs = lagSamples.length > 0
      ? Number(lagSamples[Math.min(Math.floor(lagSamples.length * 0.95), lagSamples.length - 1)].toFixed(2))
      : 0

    const loadgenIsHealthy = p95LagMs < 25 && maxLagMs < 75

    return {
      healthy: loadgenIsHealthy,
      eventLoopLagMs: {
        max: maxLagMs,
        p95: p95LagMs,
        avg: avgLagMs,
      },
      peakMemory: {
        rssMb: Math.round(peakRssBytes / 1024 / 1024),
        heapUsedMb: Math.round(peakHeapBytes / 1024 / 1024),
      },
      warning: loadgenIsHealthy
        ? null
        : 'Load generator event loop experienced contention (>25ms p95 lag). Recorded percentiles may include client-side queue delay.',
    }
  }

  return { stop }
}
