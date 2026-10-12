import { createMetricsCollector } from './metrics'
import { runVirtualUser } from './journey'

const targetUrl = process.env.API_URL || "http://3.107.199.146";
const STAGES = [50, 150, 300, 600, 1000];
const DURATION_PER_STAGE = 10; // 10s per stage
const THINK_TIME_MS = 20;     // Fast aggressive user clicks
const USE_AUTH = true;

console.log("=================================================================");
console.log("    AWS EC2 BREAKPOINT STRESS TEST: FINDING THE VU CAPACITY LIMIT ");
console.log("=================================================================");
console.log(`Target:           ${targetUrl}`);
console.log(`Stages (VUs):     ${STAGES.join(" -> ")} concurrent users`);
console.log(`Duration/Stage:   ${DURATION_PER_STAGE}s each`);
console.log(`Think Time:       ${THINK_TIME_MS}ms (heavy aggressive load)\n`);

interface StageResult {
  vus: number
  rps: number
  totalReqs: number
  successRate: number
  p50Ms: number
  p95Ms: number
  p99Ms: number
  serverOriginP50: number
  serverCpuPct: number
  serverRamMb: number
  status: string
}

const results: StageResult[] = [];

for (const vus of STAGES) {
  process.stdout.write(`⚡ Testing ${vus} Virtual Users... `);

  // Reset telemetry on server
  await fetch(`${targetUrl}/api/telemetry/reset`, { method: "POST" }).catch(() => {});

  const startTime = performance.now();
  const stopTimestamp = Date.now() + DURATION_PER_STAGE * 1000;
  const collector = createMetricsCollector(DURATION_PER_STAGE, startTime);

  await Promise.all(
    Array.from({ length: vus }, (_, i) =>
      runVirtualUser({
        workerId: i + 1,
        users: vus,
        rampUpSec: 1,
        thinkTimeMs: THINK_TIME_MS,
        targetUrl,
        useAuth: USE_AUTH,
        stopTimestamp,
        collector,
      })
    )
  );

  const totalDurationSec = (performance.now() - startTime) / 1000;

  // Poll server telemetry
  const apiTelRes = await fetch(`${targetUrl}/api/telemetry`).catch(() => null);
  const apiTel: any = apiTelRes?.ok ? await apiTelRes.json() : null;

  const report = collector.compileReport(
    {
      users: vus,
      duration: DURATION_PER_STAGE,
      rampUpSec: 1,
      thinkTimeMs: THINK_TIME_MS,
      targetUrl,
      useAuth: USE_AUTH,
      totalDurationSec,
    },
    { cpuSamples: [], memSamples: [] } as any,
    apiTel
  );

  const successRate = report.performance.successRatePercent;
  let status = "🟢 Healthy";
  if (successRate < 95) status = "🔴 Failing";
  else if (report.latencyPercentilesMs.raw.p95 > 4000) status = "🟡 High Latency";

  console.log(`Done! RPS: ${report.performance.sustainedRps} | p50: ${report.latencyPercentilesMs.raw.p50}ms | Success: ${successRate}% [${status}]`);

  results.push({
    vus,
    rps: report.performance.sustainedRps,
    totalReqs: report.performance.totalRequestsCompleted,
    successRate,
    p50Ms: report.latencyPercentilesMs.raw.p50,
    p95Ms: report.latencyPercentilesMs.raw.p95,
    p99Ms: report.latencyPercentilesMs.raw.p99,
    serverOriginP50: report.latencyPercentilesMs.originCompute?.p50 ?? 0,
    serverCpuPct: apiTel?.cpuUtilization?.peakCpuPct ?? 0,
    serverRamMb: apiTel?.memory?.currentRssMb ?? 0,
    status
  });

  if (successRate < 80) {
    console.log(`\n⚠️ Breakpoint reached at ${vus} VUs! Server started dropping requests.`);
    break;
  }

  // Small 2s cooldown between stages
  await Bun.sleep(2000);
}

console.log("\n======================== SATURATION SUMMARY TABLE ========================");
console.log("VUs   | Throughput   | Success % | Latency (p50) | Latency (p95) | EC2 CPU | EC2 RAM | Status");
console.log("------+--------------+-----------+---------------+---------------+---------+---------+-----------");
for (const r of results) {
  const v = String(r.vus).padEnd(5);
  const rps = (r.rps + " rps").padEnd(12);
  const succ = (r.successRate + "%").padEnd(9);
  const p50 = (r.p50Ms + " ms").padEnd(13);
  const p95 = (r.p95Ms + " ms").padEnd(13);
  const cpu = (r.serverCpuPct + "%").padEnd(7);
  const ram = (r.serverRamMb + " MB").padEnd(7);
  console.log(`${v} | ${rps} | ${succ} | ${p50} | ${p95} | ${cpu} | ${ram} | ${r.status}`);
}
console.log("==========================================================================");
