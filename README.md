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

| Metric | ⚡ Bun 1.4.3 + Hono | 🟢 Node.js 26 + Express | Impact |
| :--- | :---: | :---: | :--- |
| **Sustained Throughput** | 🏆 **5,451.3 req/s** | **4,361.7 req/s** | **Bun +25.0% higher throughput** |
| **Average CPU Utilization** | 🏆 **79.5%** (~20% headroom) | 🔥 **98.4%** (core pinned) | Node saturated the single core |
| **Peak Memory (RSS)** | 🏆 **87 MB** (8.5% of RAM) | **178 MB** (17.4% of RAM) | **Bun 2.05x leaner footprint** |
| **Event Loop Lag (p95)** | 🏆 **2.97 ms** | 🔥 **15.59 ms** | Node stalled **5.2x longer** |
| **Median Latency (p50)** | 🏆 **57.62 ms** | **101.76 ms** | **Bun 43.4% faster** |
| **p95 Latency** | 🏆 **96.29 ms** | **139.26 ms** | Bun 30.9% faster |
| **p99 Tail Latency** | 🏆 **123.77 ms** | **192.19 ms** | Bun 35.6% faster |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 errors across 198,000+ requests |

👉 **For the full 10-action route latency breakdown, origin `Server-Timing` metrics, and Little's Law scaling tests, see [`docs/BENCHMARK_RESULTS.md`](docs/BENCHMARK_RESULTS.md).**

---

## Key Findings

1. **Compute Efficiency & Headroom:** On an identical single core, Bun finished **+21,283 more requests (+25% throughput)** while averaging **79.5% CPU**. Node pinned the core at **98.4% CPU** and maxed out at 4,361 req/s. Bun converts available CPU cycles into completed work with significantly less overhead.
2. **Event Loop Starvation:** Under high concurrency, Node experienced **15.6 ms p95 event loop stall**, causing requests to queue and inflating tail latencies. Bun remained responsive at **2.97 ms p95**.
3. **Memory Economy:** Bun's Rust-based memory allocator held peak RSS to **87 MB** (8.5% of the 1 GB microVM) versus Node's **178 MB** (17.4%), providing double the memory efficiency on identical workloads.

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
