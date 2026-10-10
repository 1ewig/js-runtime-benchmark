import fs from 'node:fs'

export interface ApiTelemetryReport {
  cpuUtilization: {
    peakCpuPct: number
    avgCpuPct: number
    currentCpuPct: number
    coresConfigured: number
    estimatedCoresUsed: number
  }
  memory: {
    peakRssMb: number
    avgRssMb: number
    currentRssMb: number
    peakHeapUsedMb: number
    totalMicroVmRamMb: number
    ramUsedPercent: number
  }
  serverEventLoopLagMs: {
    avg: number
    p95: number
    max: number
  }
  sampleCount: number
  uptimeSec: number
}

function getLinuxCpuTicks(): { utime: number; stime: number } | null {
  try {
    if (fs.existsSync('/proc/self/stat')) {
      const content = fs.readFileSync('/proc/self/stat', 'utf8')
      const lastParen = content.lastIndexOf(')')
      if (lastParen !== -1) {
        const rest = content.slice(lastParen + 2).split(' ')
        const utime = parseInt(rest[11], 10)
        const stime = parseInt(rest[12], 10)
        return { utime, stime }
      }
    }
  } catch {}
  return null
}

let detectedCpuSource: 'cgroup_v2' | 'cgroup_v1' | 'proc_stat' | 'process' = 'process'
try {
  if (fs.existsSync('/sys/fs/cgroup/cpu.stat')) {
    detectedCpuSource = 'cgroup_v2'
  } else if (fs.existsSync('/sys/fs/cgroup/cpuacct/cpuacct.usage')) {
    detectedCpuSource = 'cgroup_v1'
  } else if (fs.existsSync('/proc/self/stat')) {
    detectedCpuSource = 'proc_stat'
  }
} catch {}

function getProcessCpuMicros(): number {
  try {
    if (detectedCpuSource === 'cgroup_v2') {
      const content = fs.readFileSync('/sys/fs/cgroup/cpu.stat', 'utf8')
      const m = content.match(/usage_usec\s+(\d+)/)
      if (m) return parseInt(m[1], 10)
    } else if (detectedCpuSource === 'cgroup_v1') {
      const val = parseInt(fs.readFileSync('/sys/fs/cgroup/cpuacct/cpuacct.usage', 'utf8'), 10)
      if (!isNaN(val)) return Math.round(val / 1000)
    } else if (detectedCpuSource === 'proc_stat') {
      const linuxTicks = getLinuxCpuTicks()
      if (linuxTicks) {
        return (linuxTicks.utime + linuxTicks.stime) * 10000
      }
    }
  } catch {}

  const u = process.cpuUsage()
  return u.user + u.system
}

class ApiTelemetryManager {
  private cpuSamples: number[] = []
  private rssSamples: number[] = []
  private heapSamples: number[] = []
  private lagSamples: number[] = []

  private peakRss = 0
  private peakHeap = 0
  private peakCpu = 0

  private lastSampleTime = performance.now()
  private lastCpuMicros = getProcessCpuMicros()
  private nextExpectedHeartbeat = performance.now() + 100
  private intervalId: ReturnType<typeof setInterval> | null = null
  private startedAt = Date.now()

  start() {
    if (this.intervalId) return
    this.lastSampleTime = performance.now()
    this.lastCpuMicros = getProcessCpuMicros()
    this.nextExpectedHeartbeat = performance.now() + 100

    this.intervalId = setInterval(() => {
      this.sample()
    }, 100)
  }

  private sample() {
    const now = performance.now()
    const elapsedMs = now - this.lastSampleTime
    const lag = Math.max(0, now - this.nextExpectedHeartbeat)
    this.lagSamples.push(lag)
    this.nextExpectedHeartbeat = now + 100

    if (elapsedMs >= 50) {
      const currentCpuMicros = getProcessCpuMicros()
      const deltaMicros = currentCpuMicros - this.lastCpuMicros
      const elapsedMicros = elapsedMs * 1000

      // Configured vCPUs (defaults to 1 for 1 vCPU tier)
      const cores = Number(process.env.VCPU_COUNT) || 1
      const rawPct = (deltaMicros / elapsedMicros) * 100
      const normalizedPct = Math.min(Math.max(rawPct / cores, 0), 100)

      this.cpuSamples.push(normalizedPct)
      if (normalizedPct > this.peakCpu) {
        this.peakCpu = normalizedPct
      }

      this.lastSampleTime = now
      this.lastCpuMicros = currentCpuMicros
    }

    const mem = process.memoryUsage()
    const rssMb = Math.round(mem.rss / 1024 / 1024)
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024)

    this.rssSamples.push(rssMb)
    this.heapSamples.push(heapMb)
    if (rssMb > this.peakRss) this.peakRss = rssMb
    if (heapMb > this.peakHeap) this.peakHeap = heapMb

    // Keep memory bounded to last 3,000 samples (5 minutes at 100ms)
    if (this.cpuSamples.length > 3000) {
      this.cpuSamples.shift()
      this.rssSamples.shift()
      this.heapSamples.shift()
      this.lagSamples.shift()
    }
  }

  reset() {
    this.cpuSamples = []
    this.rssSamples = []
    this.heapSamples = []
    this.lagSamples = []
    this.peakRss = 0
    this.peakHeap = 0
    this.peakCpu = 0
    this.lastSampleTime = performance.now()
    this.lastCpuMicros = getProcessCpuMicros()
    this.nextExpectedHeartbeat = performance.now() + 100
  }

  getReport(): ApiTelemetryReport {
    const avgCpu = this.cpuSamples.length > 0
      ? Number((this.cpuSamples.reduce((a, b) => a + b, 0) / this.cpuSamples.length).toFixed(1))
      : 0
    const currentCpu = this.cpuSamples.length > 0
      ? Number(this.cpuSamples[this.cpuSamples.length - 1].toFixed(1))
      : 0
    const avgRss = this.rssSamples.length > 0
      ? Math.round(this.rssSamples.reduce((a, b) => a + b, 0) / this.rssSamples.length)
      : 0
    const currentRss = this.rssSamples.length > 0
      ? this.rssSamples[this.rssSamples.length - 1]
      : 0

    const sortedLag = [...this.lagSamples].sort((a, b) => a - b)
    const avgLag = sortedLag.length > 0
      ? Number((sortedLag.reduce((a, b) => a + b, 0) / sortedLag.length).toFixed(2))
      : 0
    const p95Lag = sortedLag.length > 0
      ? Number(sortedLag[Math.min(Math.floor(sortedLag.length * 0.95), sortedLag.length - 1)].toFixed(2))
      : 0
    const maxLag = sortedLag.length > 0
      ? Number(sortedLag[sortedLag.length - 1].toFixed(2))
      : 0

    const configuredCores = Number(process.env.VCPU_COUNT) || 1
    const configuredRamMb = Number(process.env.MICROVM_RAM_MB) || 1024

    return {
      cpuUtilization: {
        peakCpuPct: Number(this.peakCpu.toFixed(1)),
        avgCpuPct: avgCpu,
        currentCpuPct: currentCpu,
        coresConfigured: configuredCores,
        estimatedCoresUsed: Number(((avgCpu * configuredCores) / 100).toFixed(2)),
      },
      memory: {
        peakRssMb: this.peakRss,
        avgRssMb: avgRss,
        currentRssMb: currentRss,
        peakHeapUsedMb: this.peakHeap,
        totalMicroVmRamMb: configuredRamMb,
        ramUsedPercent: Number(((this.peakRss / configuredRamMb) * 100).toFixed(1)),
      },
      serverEventLoopLagMs: {
        avg: avgLag,
        p95: p95Lag,
        max: maxLag,
      },
      sampleCount: this.cpuSamples.length,
      uptimeSec: Math.round((Date.now() - this.startedAt) / 1000),
    }
  }
}

export const apiTelemetry = new ApiTelemetryManager()
