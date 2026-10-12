import { createMetricsCollector } from './metrics'
import { runVirtualUser } from './journey'

const targetUrl = process.env.API_URL || "http://3.107.199.146";
const users = Number(process.env.USERS) || 30;
const duration = Number(process.env.DURATION) || 12;
const rampUpSec = 2;
const thinkTimeMs = 50;
const useAuth = true;

console.log("==========================================================");
console.log("       Realistic Virtual User (VU) Simulation             ");
console.log("==========================================================");
console.log(`Target:        ${targetUrl}`);
console.log(`Virtual Users: ${users} concurrent active users`);
console.log(`Duration:      ${duration}s (ramp-up: ${rampUpSec}s)`);
console.log(`Think Time:    ${thinkTimeMs}ms between actions`);
console.log(`User Actions:  Feed scrolling, Stories, Likes, Comments, Search`);
console.log("----------------------------------------------------------\n");

// Reset API server telemetry
await fetch(`${targetUrl}/api/telemetry/reset`, { method: "POST" }).catch(() => {});

const startTime = performance.now();
const stopTimestamp = Date.now() + duration * 1000;
const collector = createMetricsCollector(duration, startTime);

console.log(`🚀 Launching ${users} Virtual Users...`);

await Promise.all(
  Array.from({ length: users }, (_, i) =>
    runVirtualUser({
      workerId: i + 1,
      users,
      rampUpSec,
      thinkTimeMs,
      targetUrl,
      useAuth,
      stopTimestamp,
      collector,
    })
  )
);

const totalDurationSec = (performance.now() - startTime) / 1000;

// Fetch server telemetry
const apiTelRes = await fetch(`${targetUrl}/api/telemetry`).catch(() => null);
const apiTelemetry: any = apiTelRes?.ok ? await apiTelRes.json() : null;

const report = collector.compileReport(
  {
    users,
    duration,
    rampUpSec,
    thinkTimeMs,
    targetUrl,
    useAuth,
    totalDurationSec,
  },
  { cpuSamples: [], memSamples: [] } as any,
  apiTelemetry
);

console.log("\n=================== SIMULATION RESULTS ===================");
console.log(`Total Requests:         ${report.performance.totalRequestsCompleted}`);
console.log(`Simulated Throughput:   ${report.performance.sustainedRps} req/sec`);
console.log(`Success Rate:           ${report.performance.successRatePercent}%`);
console.log(`Active Human Capacity:  ~${report.performance.estimatedActiveConcurrentHumanCapacity} active users`);
console.log(`Status Codes:           `, report.statusMatrix.httpStatusCodes);
console.log(`Client Latency (p50):   ${report.latencyPercentilesMs.raw.p50} ms`);
console.log(`Client Latency (p95):   ${report.latencyPercentilesMs.raw.p95} ms`);
console.log(`Client Latency (p99):   ${report.latencyPercentilesMs.raw.p99} ms`);
console.log(`Server Origin (p50):    ${report.latencyPercentilesMs.originCompute?.p50 ?? "N/A"} ms`);
console.log("---------------- Workload Breakdown ----------------------");
for (const [action, data] of Object.entries(report.workloadBreakdown as Record<string, any>)) {
  if (data.requests > 0) {
    console.log(` - ${action.padEnd(16)}: ${String(data.requests).padStart(4)} reqs (${data.sharePercent}%) | avg: ${data.avgLatencyMs} ms`);
  }
}
console.log("----------------------------------------------------------");
if (apiTelemetry) {
  console.log(`EC2 Peak CPU:           ${apiTelemetry.cpuUtilization?.peakCpuPct}%`);
  console.log(`EC2 RAM Usage:          ${apiTelemetry.memory?.currentRssMb} MB (${apiTelemetry.memory?.ramUsedPercent}%)`);
  console.log(`EC2 Event Loop Lag:     ${apiTelemetry.serverEventLoopLagMs?.avg} ms (p95: ${apiTelemetry.serverEventLoopLagMs?.p95} ms)`);
}
console.log("==========================================================");
