# InstaCloud Benchmark: Bun vs Node.js on MicroVMs

An apples-to-apples real-world benchmark comparing **Bun 1.4.3 (Rust core)** and **Node.js 26 (Latest)** on single-core cloud microVMs (**1 vCPU / 1 GB RAM**) backed by **Managed PostgreSQL 16**.

> 📚 **Documentation Links:**
> * 📊 [Full Benchmark Results & Workload Breakdown](docs/BENCHMARK_RESULTS.md)
> * ⚙️ [Technical Specifications, Schemas & API Routes](docs/TECHNICAL_DETAILS.md)
> * ☁️ [InstaCloud Architecture & CLI Operational Guide](docs/INSTACLOUD_GUIDE.md)

---

## The Setup

Most runtime benchmarks test a trivial `GET /` returning `"Hello World"`. In production, real applications execute database joins, keyset cursor pagination, HMAC auth verification, and JSON serialization under strict resource limits.

This benchmark evaluates an Instagram-scale backend deployed on [InstaCloud](https://instacloud.com) serverless microVMs:

* **Strict Hardware Constraint:** 1 vCPU and 1 GB RAM per API microVM.
* **Single Dedicated Worker:** `WEB_CONCURRENCY=1` (pure single-core execution; no cluster IPC, no multi-core socket distribution).
* **Direct to PostgreSQL 16:** No Redis or caching layer. Every read and write executes directly against PostgreSQL with connection pools capped at `max: 25`.
* **Realistic User Journeys:** 1,000 concurrent closed-loop virtual users executing 10 typical mobile actions (timeline feeds, explore discovery, 24h stories trays, GIN trigram search, and atomic CTE writes).

---

## Headline Results (1,000 Concurrent Virtual Users)

Tested from an independent microVM over the datacenter network with 100 ms human think time, 5s ramp-up, and 20s sustained load against a warm database:

| Metric | 🦊 Bun 1.4.3 + Elysia (AOT) | ⚡ Bun 1.4.3 + Hono (Tuned) | 🟢 Node.js 26 + Express (Tuned Peak / Sustained) | Leader / Advantage |
| :--- | :---: | :---: | :---: | :--- |
| **Sustained Throughput** | 🏆 **5,266.5 req/s** | **5,216.6 req/s** | **4,433.0 req/s** / **3,293.1 req/s** | **Elysia leads (+18.8% to +59.9% over Node)** |
| **Average CPU Utilization** | 🏆 **78.2%** (~22% idle) | **79.4%** (~21% idle) | 🔥 **95.8% – 96.5%** (peak 100%) | **Bun sustains higher rps at ~22% less CPU** |
| **Compute Efficiency** | 🏆 **67.3 req/s / %CPU** | **65.7 req/s / %CPU** | **45.9** / **34.4 req/s / %CPU** | **Bun +46% to +95% more CPU-efficient** |
| **Peak Memory (RSS)** | **97.0 MB** (9.5% RAM) | 🏆 **92.0 MB** (9.0% RAM) | **176.0 MB** (17.2% RAM) | **Bun ~1.9x leaner than Node** |
| **Event Loop Lag (p95)** | **3.50 ms** | 🏆 **1.85 ms** | 🔥 **14.13 ms** / **21.98 ms** | **Node stalls 6x to 12x longer under saturation** |
| **Median Latency (p50)** | 🏆 **66.71 ms** | **69.94 ms** | **95.30 ms** / **179.66 ms** | **Bun is 1.4x to 2.7x faster end-to-end** |
| **p95 Latency** | **102.69 ms** | 🏆 **100.93 ms** | **128.82 ms** / **222.06 ms** | **Bun 1.3x to 2.2x lower tail latency** |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | **100.0%** / **99.998%** | 0 to 1 error across hundreds of thousands of reqs |

👉 **For the full 10-action route latency breakdown, origin `Server-Timing` metrics, and the middleware Promise tax discovery, see [`docs/BENCHMARK_RESULTS.md`](docs/BENCHMARK_RESULTS.md).**

---

## Key Findings

1. **5,200+ Req/Sec Single-Core Milestone:** Both Bun runtimes broke past **5,200 requests/sec** on the single **1 vCPU / 1 GB RAM** microVM tier—completing **+16,412 to +39,738 more requests** than Node.js with 0 errors across 100,000+ real social media operations.
2. **The Middleware "Promise Tax" Discovery:** By eliminating Hono's `await next()` onion middleware overhead and measuring timing natively, Hono leaped **+35.8% (from 3,840 to 5,217 req/s)**, closing the gap with Elysia's JIT compiler to within **0.95%**.
3. **Level-Playing Field Tuning for Express:** Applying identical native HTTP timing wrapping and selective GET body parsing elevated Node + Express from **3,433.9 to 4,433.0 req/s (+29.1%)** at peak. Under continuous saturation, single-core CPU pins at 100% and event-loop lag (21.98 ms p95) settles sustained throughput at **3,293.1 req/s**.
4. **Compute & Memory Efficiency:** Bun delivers **67.3 req/s per 1% CPU** (vs. Node's 34.4–45.9 req/s per 1% CPU) while holding RSS memory strictly under **97 MB** (vs. Node's 176 MB). Node pins the CPU and experiences up to 21.98 ms p95 event-loop stalls under sustained load.

---

## Multi-Stack Benchmark Roadmap

- [x] **Stage 1:** Bun 1.4.3 + Hono (Reference Baseline)
- [x] **Stage 2:** Node.js 26 + Express (Completed)
- [x] **Stage 3:** Bun 1.4.3 + Elysia (Completed)
- [ ] **Stage 4:** Node.js 26 + Fastify (Scaffolded)
- [ ] **Stage 5:** Final multi-stack leaderboard & comprehensive comparison report

---

## Quick Start

```bash
# Smoke test endpoints against a specific stack
bun run test hono
bun run test express

# Warm up database connections and JIT routes
bun run warmup hono

# Run benchmark
bun run benchmark hono

# Run automated side-by-side comparison across all stacks
bun run benchmark:compare
```
