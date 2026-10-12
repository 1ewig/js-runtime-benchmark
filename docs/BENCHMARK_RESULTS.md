# 📊 High-Throughput Benchmark Results & Deep Analysis

This document contains the detailed benchmark metrics, workload distributions, network latency breakdowns, and capacity scaling analyses across the tested runtimes and frameworks.

All benchmarks are executed from an independent `loadgen` microVM (2 vCPU / 2 GB RAM) over the datacenter network against single-core application microVMs (**1 vCPU / 1 GB RAM**) and **Managed PostgreSQL 16**.

---

## 🏆 1. Primary Benchmark (1,000 Concurrent Virtual Users)

**Test Conditions:**
* **Load Profile:** 1,000 closed-loop virtual users, 100 ms human think time, 5s ramp-up, 20s sustained load.
* **Database State:** Warm PostgreSQL 16 instance (pre-warmed connection pools and shared buffers).
* **Worker Model:** Single dedicated worker process (`WEB_CONCURRENCY=1`, PID 1) on 1 vCPU / 1 GB RAM.
* **Execution Protocol:** Both stacks tested fresh twice back-to-back following a full 3-service warmup routine (`bun run warmup <stack>`) and database sanitization (`bun run db:clean`).

### Dual-Run Head-to-Head Comparison Matrix

| Metric | ⚡ Bun Run 1 | ⚡ Bun Run 2 | ⚡ Bun (Avg) | 🟢 Node Run 1 | 🟢 Node Run 2 | 🟢 Node (Avg) | Advantage / Delta |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Total Completed Reqs** | 79,733 | 76,411 | **78,072** | 68,619 | 70,852 | **69,736** | **Bun +8,336 more reqs (+11.9%)** |
| **Sustained Throughput** | 3,904.6 rps | 3,775.3 rps | 🏆 **3,839.9 rps** | 3,378.0 rps | 3,489.7 rps | **3,433.9 rps** | **Bun +11.8% higher throughput** |
| **Average CPU Utilization** | 72.1% | 67.6% | 🏆 **69.9%** | 87.2% | 84.1% | 🔥 **85.7%** | **Bun leaves ~30% CPU headroom** |
| **Peak Memory (RSS)** | 93 MB | 96 MB | 🏆 **94.5 MB** | 176 MB | 176 MB | **176.0 MB** | **Bun 1.86x leaner memory** |
| **Event Loop Lag (p95)** | 2.15 ms | 2.13 ms | 🏆 **2.14 ms** | 8.49 ms | 10.83 ms | 🔥 **9.66 ms** | **Node 4.5x more event-loop lag** |
| **Event Loop Lag (avg)** | 0.54 ms | 0.63 ms | 🏆 **0.59 ms** | 2.32 ms | 2.49 ms | **2.41 ms** | Bun 4.1x faster loop turnaround |
| **Origin Compute (p50)** | 2.80 ms | 2.93 ms | 🏆 **2.87 ms** | 7.81 ms | 8.35 ms | **8.08 ms** | **Bun 2.8x faster origin compute** |
| **Origin Compute (p95)** | 9.49 ms | 14.29 ms | 🏆 **11.89 ms** | 21.74 ms | 22.88 ms | **22.31 ms** | **Bun 1.9x faster origin p95** |
| **End-to-End Latency (p50)** | 103.61 ms | 109.30 ms | 🏆 **106.46 ms** | 139.76 ms | 129.19 ms | **134.48 ms** | **Bun 28 ms lower p50 latency** |
| **End-to-End Latency (p95)** | 254.05 ms | 239.47 ms | 🏆 **246.76 ms** | 263.75 ms | 268.09 ms | **265.92 ms** | Bun 19 ms lower p95 latency |
| **End-to-End Latency (p99)** | 421.87 ms | 448.41 ms | **435.14 ms** | 409.46 ms | 399.69 ms | **404.58 ms** | Edge proxy tail latency parity |
| **HTTP Success Rate** | 100% | 100% | **100.0%** | 100% | 100% | **100.0%** | 0 errors across 295,000+ total requests |

---

## 💡 Key Architectural Insights

1. **Compute Efficiency (Throughput per % CPU):**
   * **Bun:** 3,839.9 req/s ÷ 69.9% CPU = **54.9 req/s per 1% CPU**
   * **Node:** 3,433.9 req/s ÷ 85.7% CPU = **40.1 req/s per 1% CPU**
   * Bun delivers **+36.9% higher throughput per CPU core unit**. It converts available clock cycles into completed requests significantly more efficiently than Node.js.
2. **Operational Headroom:**
   * At 1,000 virtual users, Bun cruises with **~30% idle headroom**, allowing it to absorb traffic bursts without throttling.
   * Node averages **85.7% CPU (peaking at 100%)**, approaching saturation where tail queueing escalates.
3. **Origin Compute Latency (`Server-Timing`):**
   * Origin microVM compute time (routing + auth + PostgreSQL queries) is **2.87 ms p50 on Bun vs. 8.08 ms p50 on Node** — a **2.8x speedup**.
4. **Memory Footprint:**
   * Bun's Rust jemalloc allocator stabilizes at **~94.5 MB peak RSS (9.2% of 1 GB RAM)**.
   * Node's V8 heap and buffer overhead settles at **176 MB RSS (17.2% of RAM)**, consuming nearly double the memory.
5. **Event Loop Health:**
   * Node experiences **9.66 ms p95 event loop stall** under load. Bun maintains **2.14 ms p95**, eliminating event-loop starvation.

---

## 📱 2. Granular Workload Breakdown (10 Real Mobile Actions)

Average latency and traffic distribution across both fresh dual-run sessions:

| Action | Target Share | Bun Latency (Avg) | Node Latency (Avg) | Latency Delta | Success Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Home Timeline Scroll** (Follower Graph Join) | 40% | **121.87 ms** | 147.88 ms | Bun −26.0 ms | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | 20% | **122.01 ms** | 147.83 ms | Bun −25.8 ms | 100% (200 OK) |
| **Stories Tray** (24h Ephemeral Filter) | 12% | **121.72 ms** | 146.56 ms | Bun −24.8 ms | 100% (200 OK) |
| **Profile & 12-Photo Grid** (`Promise.all`) | 8% | **122.12 ms** | 147.72 ms | Bun −25.6 ms | 100% (200 OK) |
| **Read Post Comments** (Keyset Pagination) | 5% | **122.77 ms** | 146.98 ms | Bun −24.2 ms | 100% (200 OK) |
| **Double-Tap Like** (Atomic CTE Write) | 5% | **125.18 ms** | 149.01 ms | Bun −23.8 ms | 100% (200 OK) |
| **Search Discovery** (GIN Trigrams) | 4% | **122.21 ms** | 147.04 ms | Bun −24.8 ms | 100% (200 OK) |
| **Save / Bookmark Post** (Atomic Bookmark Toggle) | 2% | **128.09 ms** | 160.99 ms | **Bun −32.9 ms** | 100% (200 OK) |
| **Post Comment** (Atomic CTE Write) | 2% | **121.03 ms** | 149.14 ms | Bun −28.1 ms | 100% (201 Created) |
| **Follow Creator** (Graph Mutation) | 2% | **127.77 ms** | 153.23 ms | Bun −25.5 ms | 100% (200 OK) |

---

## 🌐 3. Origin Compute vs. Edge Network Isolation (`Server-Timing`)

All traffic from the load generator to the API microVMs traverses Cloudflare's Anycast CDN edge (`CF-Ray`, TLS termination). Each stack emits a high-resolution origin timing header (`Server-Timing: origin;dur=<ms>`):

| Stack | Origin Compute (p50) | Origin Compute (p95) | End-to-End (p50) | End-to-End (p95) |
| :--- | :---: | :---: | :---: | :---: |
| ⚡ **Bun 1.4.3 + Hono** (Dual-Run Avg) | 🏆 **2.87 ms** | 🏆 **11.89 ms** | 🏆 **106.46 ms** | 🏆 **246.76 ms** |
| 🟢 **Node.js 26 + Express** (Dual-Run Avg) | **8.08 ms** (2.8x slower) | **22.31 ms** (1.9x slower) | **134.48 ms** | **265.92 ms** |
| 🦊 **Bun 1.4.3 + Elysia** (Preliminary) | **14.04 ms** | **46.53 ms** | **90.65 ms** | **261.54 ms** |

---

## 📉 4. Closed-Loop Capacity Dynamics & Little's Law

Under closed-loop testing ($N$ concurrent virtual users, think time $Z = 100\text{ ms}$, response time $R$, throughput $X$), capacity is governed by **Little's Law** / the **Interactive Response Time Law**:

$$X = \frac{N}{R + Z}$$

With $R \approx 106\text{ ms}$ (Bun) and $Z = 100\text{ ms}$, total loop turnaround is $\approx 206\text{ ms}$, producing $X \approx 1,000 / 0.206 \approx 4,850\text{ rps}$ theoretical ceiling. When network transit fluctuates by 20–30 ms on the edge, throughput shifts proportionally while origin compute execution remains steady at ~2.8 ms.

---

## 🎯 5. Test Harness & Database Validation

To ensure the test harness itself was never the bottleneck, loadgen telemetry was recorded continuously during all runs:

| Run | Loadgen Loop Lag (avg / p95) | Loadgen RSS | Cadence Delay | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| Bun Run 1 | 3.54 ms / 15.51 ms | 98 MB | 3.47 ms | ✅ Healthy |
| Bun Run 2 | 4.45 ms / 19.55 ms | 89 MB | 3.85 ms | ✅ Healthy |
| Node Run 1 | 4.73 ms / 18.97 ms | 93 MB | 4.49 ms | ✅ Healthy |
| Node Run 2 | 5.15 ms / 18.68 ms | 94 MB | 4.88 ms | ✅ Healthy |

* The harness flags itself unhealthy if p95 loop lag exceeds 25 ms; all runs remained well within healthy thresholds.
* Live PostgreSQL telemetry showed peak active connections stayed below 25 (out of 100 available) with a **99.98% cache hit ratio**, proving the database was serving out of memory and was never the constraint.
