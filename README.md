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

| Metric | ⚡ Bun 1.4.3 + Hono (Avg) | 🟢 Node.js 26 + Express (Avg) | Advantage / Delta |
| :--- | :---: | :---: | :--- |
| **Sustained Throughput** | 🏆 **3,839.9 req/s** | **3,433.9 req/s** | **Bun +11.8% higher throughput** |
| **Average CPU Utilization** | 🏆 **69.9%** (~30% headroom) | 🔥 **85.7%** (high saturation) | Bun operates with +15.8% less CPU load |
| **Compute Efficiency** | 🏆 **54.9 req/s / %CPU** | **40.1 req/s / %CPU** | **Bun 36.9% more CPU-efficient** |
| **Peak Memory (RSS)** | 🏆 **94.5 MB** (9.2% of RAM) | **176.0 MB** (17.2% of RAM) | **Bun 1.86x leaner footprint** |
| **Event Loop Lag (p95)** | 🏆 **2.14 ms** | 🔥 **9.66 ms** | Node stalled **4.5x longer** |
| **Origin Compute Latency (p50)** | 🏆 **2.87 ms** | **8.08 ms** | **Bun 2.8x faster origin compute** |
| **Median Latency (p50)** | 🏆 **106.46 ms** | **134.48 ms** | Bun 28 ms faster end-to-end |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 errors across 295k+ requests |

👉 **For the full 10-action route latency breakdown, origin `Server-Timing` metrics, and Little's Law scaling tests, see [`docs/BENCHMARK_RESULTS.md`](docs/BENCHMARK_RESULTS.md).**

---

## Key Findings

1. **Compute Efficiency & Throughput:** Bun completed **3,839.9 req/s** vs. Node's **3,433.9 req/s** (+11.8% throughput) while using **15.8% less CPU** (69.9% vs. 85.7%). In throughput per core capacity, Bun delivers **54.9 req/s per 1% CPU** versus Node's **40.1 req/s per 1% CPU** (+36.9% efficiency advantage).
2. **Origin Compute & Event Loop Stall:** On pure origin microVM execution (`Server-Timing`), Bun is **2.8x faster at p50 (2.87 ms vs. 8.08 ms)**. Node experienced **9.66 ms p95 event loop stall** under load, 4.5x higher than Bun's **2.14 ms p95**.
3. **Memory Economy:** Bun's Rust jemalloc allocator stabilized at **94.5 MB peak RSS** (9.2% of the 1 GB microVM) versus Node's **176 MB** (17.2%), cutting the RAM footprint nearly in half on identical workloads.

---

## Multi-Stack Benchmark Roadmap

- [x] **Stage 1:** Bun 1.4.3 + Hono (Reference Baseline)
- [x] **Stage 2:** Node.js 26 + Express (Completed)
- [ ] **Stage 3:** Bun 1.4.3 + Elysia (Scaffolded & in progress)
- [ ] **Stage 4:** Node.js 26 + Fastify (Scaffolded)
- [ ] **Stage 5:** Final multi-stack leaderboard & comparison report

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
