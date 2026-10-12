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

| Metric | 🦊 Bun 1.4.3 + Elysia (AOT) | ⚡ Bun 1.4.3 + Hono (Tuned) | 🟢 Node.js 26 + Express | Leader / Advantage |
| :--- | :---: | :---: | :---: | :--- |
| **Sustained Throughput** | 🏆 **5,266.5 req/s** | **5,216.6 req/s** | **3,433.9 req/s** | **Elysia leads (+53.4% over Node)** |
| **Average CPU Utilization** | 🏆 **78.2%** (~22% idle) | **79.4%** (~21% idle) | 🔥 **85.7%** (high load) | **Bun sustains +53% rps at less CPU** |
| **Compute Efficiency** | 🏆 **67.3 req/s / %CPU** | **65.7 req/s / %CPU** | **40.1 req/s / %CPU** | **Bun +67.8% more CPU-efficient** |
| **Peak Memory (RSS)** | **97.0 MB** (9.5% RAM) | 🏆 **92.0 MB** (9.0% RAM) | **176.0 MB** (17.2% RAM) | **Bun ~1.9x leaner than Node** |
| **Event Loop Lag (p95)** | **3.50 ms** | 🏆 **1.85 ms** | 🔥 **9.66 ms** | **Node stalls 5.2x longer** |
| **Median Latency (p50)** | 🏆 **66.71 ms** | **69.94 ms** | **134.48 ms** | **Bun is 2x faster end-to-end** |
| **p95 Latency** | **102.69 ms** | 🏆 **100.93 ms** | **265.92 ms** | **Bun 2.6x lower tail latency** |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 errors across 455k+ requests |

👉 **For the full 10-action route latency breakdown, origin `Server-Timing` metrics, and the middleware Promise tax discovery, see [`docs/BENCHMARK_RESULTS.md`](docs/BENCHMARK_RESULTS.md).**

---

## Key Findings

1. **5,200+ Req/Sec Single-Core Milestone:** Both Bun runtimes broke past **5,200 requests/sec** on the single **1 vCPU / 1 GB RAM** microVM tier—completing **+36,981 more requests (+53.4%)** than Node.js with 0 errors across 100,000+ real social media operations.
2. **The Middleware "Promise Tax" Discovery:** By eliminating Hono's `await next()` onion middleware overhead and measuring timing natively, Hono leaped **+35.8% (from 3,840 to 5,217 req/s)**, closing the gap with Elysia's JIT compiler to within **0.95%**.
3. **Compute & Memory Efficiency:** Bun delivers **67.3 req/s per 1% CPU** (vs. Node's 40.1 req/s per 1% CPU) while holding RSS memory strictly under **97 MB** (vs. Node's 176 MB). Node pins the CPU and experiences 9.66 ms p95 event-loop stalls.

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
