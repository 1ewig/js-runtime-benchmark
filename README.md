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

| Metric | 🦊 Bun 1.4.3 + Elysia | ⚡ Bun 1.4.3 + Hono | 🟢 Node.js 26 + Express | Leader / Advantage |
| :--- | :---: | :---: | :---: | :--- |
| **Sustained Throughput** | 🏆 **3,941.5 req/s** | **3,839.9 req/s** | **3,433.9 req/s** | **Elysia leads (+14.8% over Node)** |
| **Average CPU Utilization** | 🏆 **65.5%** (~34.5% idle) | **69.9%** (~30.1% idle) | 🔥 **85.7%** (high load) | **Elysia uses 20.2% less CPU than Node** |
| **Compute Efficiency** | 🏆 **60.2 req/s / %CPU** | **54.9 req/s / %CPU** | **40.1 req/s / %CPU** | **Elysia 50.1% more CPU-efficient** |
| **Peak Memory (RSS)** | 🏆 **90.0 MB** (8.8% RAM) | **94.5 MB** (9.2% RAM) | **176.0 MB** (17.2% RAM) | **Elysia 1.95x leaner than Node** |
| **Event Loop Lag (p95)** | 🏆 **2.13 ms** | **2.14 ms** | 🔥 **9.66 ms** | **Node stalls 4.5x longer** |
| **Origin Compute Latency (p50)** | 🏆 **2.56 ms** | **2.87 ms** | **8.08 ms** | **Elysia 3.15x faster origin compute** |
| **Median Latency (p50)** | 🏆 **96.68 ms** | **106.46 ms** | **134.48 ms** | **Elysia is 38 ms faster end-to-end** |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 errors across 455k+ requests |

👉 **For the full 10-action route latency breakdown, origin `Server-Timing` metrics, and Little's Law scaling tests, see [`docs/BENCHMARK_RESULTS.md`](docs/BENCHMARK_RESULTS.md).**

---

## Key Findings

1. **Elysia Takes the Lead:** Bun + Elysia achieved the highest sustained throughput (**3,941.5 req/s**) while maintaining the lowest CPU load (**65.5%**) and leanest memory footprint (**90.0 MB RSS**). Its static schema compilation and JIT routing produce an origin compute latency of just **2.56 ms p50**.
2. **Compute Efficiency Leaderboard:** In completed throughput per 1% CPU utilization, **Elysia achieves 60.2 req/s / %CPU** (+50.1% over Node's 40.1), while **Hono achieves 54.9 req/s / %CPU** (+36.9% over Node).
3. **Operational Headroom & Tails:** Both Bun stacks operate with **30%–35% idle headroom** on a single core at 1,000 VUs, with sub-2.2 ms p95 event loop lag. Node pushes the core to 85.7% average (peaking at 100%) with 9.66 ms p95 event loop stall.

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
