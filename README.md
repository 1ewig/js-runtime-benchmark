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

| Metric | ⚡ Bun 1.4.3 + Hono (Avg) | 🟢 Node.js 26 + Express | Impact |
| :--- | :---: | :---: | :--- |
| **Sustained Throughput** | **3,839.9 req/s** | **4,361.7 req/s** | 3.3% dual-run spread on Bun |
| **Average CPU Utilization** | 🏆 **69.9%** (~30% headroom) | 🔥 **98.4%** (core pinned) | Node saturated the single core |
| **Peak Memory (RSS)** | 🏆 **94.5 MB** (9.2% of RAM) | **178 MB** (17.4% of RAM) | **Bun 1.9x leaner footprint** |
| **Event Loop Lag (p95)** | 🏆 **2.14 ms** | 🔥 **15.59 ms** | Node stalled **7.3x longer** |
| **Origin Compute Latency (p50)** | 🏆 **2.87 ms** | **3.91 ms** | **Bun 26% faster origin compute** |
| **Median Latency (p50)** | **106.46 ms** | **101.76 ms** | Edge proxy network parity |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 errors across 156k+ requests |

👉 **For the full 10-action route latency breakdown, origin `Server-Timing` metrics, and Little's Law scaling tests, see [`docs/BENCHMARK_RESULTS.md`](docs/BENCHMARK_RESULTS.md).**

---

## Key Findings

1. **CPU Headroom & Efficiency:** Even under 1,000 concurrent user load, Bun maintains **~30% average CPU headroom** (67.6%–72.1% utilization). In contrast, Node.js saturates the single core at **98.4% CPU**, leaving no capacity margin without resizing.
2. **Event Loop Starvation:** Under high concurrency, Node experienced **15.6 ms p95 event loop stall**—over 7x higher than Bun's **2.14 ms p95**.
3. **Memory Economy:** Bun's Rust-based memory allocator stabilized at **94.5 MB peak RSS** (9.2% of the 1 GB microVM) versus Node's **178 MB** (17.4%), cutting the RAM footprint nearly in half on identical workloads.

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
