import fs from 'node:fs'

export interface TelemetryReport {
  healthy: boolean
  cpuUtilization: {
    avgCpuPct: number
    peakCpuPct: number
    coresConfigured: number
  }
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

// Mirrors the cgroup sampler in src/shared/telemetry.ts. Kept self-contained
// because the loadgen image only ships this directory's *.ts files.
function detectCpuSource(): 'cgroup_v2' | 'cgroup_v1' | 'proc_stat' | 'process' {
  try {
    if (fs.existsSync('/sys/fs/cgroup/cpu.stat')) return 'cgroup_v2'
    if (fs.existsSync('/sys/fs/cgroup/cpuacct/cpuacct.usage')) return 'cgroup_v1'
    if (fs.existsSync('/proc/self/stat')) return 'proc_stat'
  } catch {}
  return 'process'
}

const cpuSource = detectCpuSource()

function readProcTicks(): { utime: number; stime: number } | null {
  try {
    const content = fs.readFileSync('/proc/self/stat', 'utf8')
    const lastParen = content.lastIndexOf(')')
    if (lastParen === -1) return null
    const rest = content.slice(lastParen + 2).split(' ')
    return { utime: parseInt(rest[11], 10), stime: parseInt(rest[12], 10) }
  } catch {}
  return null
}

function readCpuMicros(): number {
  try {
    if (cpuSource === 'cgroup_v2') {
      const m = fs.readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8').match(/usage_usec\s+(\d+)/)
      if (m) return parseInt(m[1], 10)
    } else if (cpuSource === 'cgroup_v1') {
      const val = parseInt(fs.readFileSync('/sys/fs/cgroup/cpuacct/cpuacct.usage', 'utf8'), 10)
      if (!isNaN(val)) return Math.round(val / 1000)
    } else if (cpuSource === 'proc_stat') {
      const ticks = readProcTicks()
      if (ticks) return (ticks.utime + ticks.stime) * 10000
    }
  } catch {}
  const u = process.cpuUsage()
  return u.user + u.system
}

export function startLoadgenTelemetry() {
  const lagSamples: number[] = []
  const cpuSamples: number[] = []
  let peakRssBytes = 0
  let peakHeapBytes = 0
  let peakCpuPct = 0
  let nextExpectedHeartbeat = performance.now() + 50
  let lastSampleTime = performance.now()
  let lastCpuMicros = readCpuMicros()

  const coresConfigured = Number(process.env.VCPU_COUNT) || 2

  const intervalId = setInterval(() => {
    const now = performance.now()
    const lag = Math.max(0, now - nextExpectedHeartbeat)
    lagSamples.push(lag)
    nextExpectedHeartbeat = now + 50

    const elapsedMs = now - lastSampleTime
    if (elapsedMs >= 50) {
      const currentCpuMicros = readCpuMicros()
      const deltaMicros = currentCpuMicros - lastCpuMicros
      const rawPct = (deltaMicros / (elapsedMs * 1000)) * 100
      const normalizedPct = Math.min(Math.max(rawPct / coresConfigured, 0), 100)
      cpuSamples.push(normalizedPct)
      if (normalizedPct > peakCpuPct) peakCpuPct = normalizedPct
      lastSampleTime = now
      lastCpuMicros = currentCpuMicros
    }

    const mem = process.memoryUsage()
    if (mem.rss > peakRssBytes) peakRssBytes = mem.rss
    if (mem.heapUsed > peakHeapBytes) peakHeapBytes = mem.heapUsed
  }, 50)

  function stop(): TelemetryReport {
    clearInterval(intervalId)

    lagSamples.sort((a, b) => a - b)
    const maxLagMs = lagSamples.length > 0 ? Number(lagSamples[lagSamples.length - 1].toFixed(2)) : 0
    const avgLagMs = lagSamples.length > 0 ? Number((lagSamples.reduce((a, b) => a + b, 0) / lagSamples.length).toFixed(2)) : 0
    const p95LagMs = lagSamples.length > 0 ? Number(lagSamples[Math.min(Math.floor(lagSamples.length * 0.95), lagSamples.length - 1)].toFixed(2)) : 0

    const avgCpuPct = cpuSamples.length > 0
      ? Number((cpuSamples.reduce((a, b) => a + b, 0) / cpuSamples.length).toFixed(1))
      : 0

    const loadgenIsHealthy = p95LagMs < 25 && maxLagMs < 75 && avgCpuPct < 80

    const warnings: string[] = []
    if (p95LagMs >= 25 || maxLagMs >= 75) {
      warnings.push('Load generator event loop experienced contention (>25ms p95 lag). Recorded percentiles may include client-side queue delay.')
    }
    if (avgCpuPct >= 80) {
      warnings.push(`Load generator itself saturated at ${avgCpuPct}% CPU — measured throughput may be generator-bound, not server-bound.`)
    }

    return {
      healthy: loadgenIsHealthy,
      cpuUtilization: {
        avgCpuPct,
        peakCpuPct: Number(peakCpuPct.toFixed(1)),
        coresConfigured,
      },
      eventLoopLagMs: {
        max: maxLagMs,
        p95: p95LagMs,
        avg: avgLagMs,
      },
      peakMemory: {
        rssMb: Math.round(peakRssBytes / 1024 / 1024),
        heapUsedMb: Math.round(peakHeapBytes / 1024 / 1024),
      },
      warning: warnings.length > 0 ? warnings.join(' ') : null,
    }
  }

  return { stop }
}
