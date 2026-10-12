# 📊 High-Throughput Benchmark Results & Deep Analysis

This document contains the detailed benchmark metrics, workload distributions, network latency breakdowns, and capacity scaling analyses across the tested runtimes and frameworks.

All benchmarks are executed from an independent `loadgen` microVM (2 vCPU / 2 GB RAM) over the datacenter network against single-core application microVMs (**1 vCPU / 1 GB RAM**) and **Managed PostgreSQL 16**.

---

## 🏆 1. Primary Benchmark (1,000 Concurrent Virtual Users)

**Test Conditions:**
* **Load Profile:** 1,000 closed-loop virtual users, 100 ms human think time, 5s ramp-up, 20s sustained load.
* **Database State:** Warm PostgreSQL 16 instance (pre-warmed connection pools and shared buffers).
* **Worker Model:** Single dedicated worker process (`WEB_CONCURRENCY=1`, PID 1) on 1 vCPU / 1 GB RAM.
* **Execution Protocol:** All stacks tested fresh twice back-to-back following a full 3-service warmup routine (`bun run warmup <stack>`) and database sanitization (`bun run db:clean`).

### Multi-Stack Leaderboard & Dual-Run Matrix

| Metric | 🦊 Bun + Elysia (Avg) | ⚡ Bun + Hono (Avg) | 🟢 Node + Express (Avg) | Leader / Impact |
| :--- | :---: | :---: | :---: | :--- |
| **Sustained Throughput** | 🏆 **3,941.5 req/s** | **3,839.9 req/s** | **3,433.9 req/s** | **Elysia leads (+14.8% over Node)** |
| **Total Completed Reqs** | 🏆 **80,330** | **78,072** | **69,736** | **Elysia +10,594 reqs over Node** |
| **Average CPU Utilization** | 🏆 **65.5%** (~34.5% idle) | **69.9%** (~30.1% idle) | 🔥 **85.7%** (high saturation) | **Elysia uses 20.2% less CPU than Node** |
| **Compute Efficiency** | 🏆 **60.2 req/s / %CPU** | **54.9 req/s / %CPU** | **40.1 req/s / %CPU** | **Elysia +50.1% more efficient than Node** |
| **Peak Memory (RSS)** | 🏆 **90.0 MB** (8.8% RAM) | **94.5 MB** (9.2% RAM) | **176.0 MB** (17.2% RAM) | **Elysia 1.95x leaner than Node** |
| **Event Loop Lag (p95)** | 🏆 **2.13 ms** | **2.14 ms** | 🔥 **9.66 ms** | **Node stalls 4.5x longer** |
| **Origin Compute (p50)** | 🏆 **2.56 ms** | **2.87 ms** | **8.08 ms** | **Elysia 3.15x faster origin execution** |
| **Origin Compute (p95)** | 🏆 **8.74 ms** | **11.89 ms** | **22.31 ms** | **Elysia 2.55x faster origin tail** |
| **End-to-End Latency (p50)** | 🏆 **96.68 ms** | **106.46 ms** | **134.48 ms** | **Elysia is 38 ms faster end-to-end** |
| **End-to-End Latency (p95)** | 🏆 **240.78 ms** | **246.76 ms** | **265.92 ms** | **Elysia lowest 95th percentile** |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 errors across 455,000+ total requests |

### Detailed Dual-Run Breakdown

| Metric | 🦊 Elysia R1 | 🦊 Elysia R2 | ⚡ Hono R1 | ⚡ Hono R2 | 🟢 Node R1 | 🟢 Node R2 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Requests Completed** | 79,818 | 80,841 | 79,733 | 76,411 | 68,619 | 70,852 |
| **Sustained Throughput** | 3,937.7 rps | 3,945.3 rps | 3,904.6 rps | 3,775.3 rps | 3,378.0 rps | 3,489.7 rps |
| **Avg CPU Utilization** | 65.4% | 65.6% | 72.1% | 67.6% | 87.2% | 84.1% |
| **Peak RAM (RSS)** | 88 MB | 92 MB | 93 MB | 96 MB | 176 MB | 176 MB |
| **Origin Compute (p50)** | 2.35 ms | 2.76 ms | 2.80 ms | 2.93 ms | 7.81 ms | 8.35 ms |
| **Origin Compute (p95)** | 7.24 ms | 10.24 ms | 9.49 ms | 14.29 ms | 21.74 ms | 22.88 ms |
| **End-to-End p50** | 96.37 ms | 96.98 ms | 103.61 ms | 109.30 ms | 139.76 ms | 129.19 ms |
| **End-to-End p95** | 247.55 ms | 234.01 ms | 254.05 ms | 239.47 ms | 263.75 ms | 268.09 ms |
| **Event Loop Lag (p95)**| 1.91 ms | 2.35 ms | 2.15 ms | 2.13 ms | 8.49 ms | 10.83 ms |

---

## 💡 Key Architectural Insights

1. **Elysia Takes the Crown:**
   * Bun + Elysia achieved the **highest sustained throughput (3,941.5 req/s)** while running at the **lowest CPU utilization (65.5%)** and **leanest memory footprint (90 MB RSS)**.
   * Its static schema compilation and internal JIT routing shaved origin compute latency down to **2.56 ms p50** (vs. 2.87 ms for Hono and 8.08 ms for Express).
2. **Compute Efficiency Leaderboard:**
   * 🦊 **Elysia:** 3,941.5 req/s ÷ 65.5% CPU = **60.2 req/s per 1% CPU** (+50.1% vs Node)
   * ⚡ **Hono:** 3,839.9 req/s ÷ 69.9% CPU = **54.9 req/s per 1% CPU** (+36.9% vs Node)
   * 🟢 **Node Express:** 3,433.9 req/s ÷ 85.7% CPU = **40.1 req/s per 1% CPU**
3. **Operational Headroom:**
   * Both Bun stacks retain **30%–35% CPU headroom** under 1,000 active concurrent users on a single core. Node pushes the core to 85.7% average (peaking at 100%), leaving no safety margin.
4. **Memory Economy:**
   * Both Bun runtimes hold memory below **95 MB**, consuming less than 10% of the 1 GB microVM. Node consumes **176 MB**, almost double.

---

## 📱 2. Granular Workload Breakdown (10 Real Mobile Actions)

Average latency across the 10 realistic mobile routes:

| Action | Target Share | Elysia Latency | Hono Latency | Node Latency | Delta (Elysia vs Node) | Success Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Home Timeline Scroll** (Follower Graph Join) | 40% | **114.57 ms** | 121.87 ms | 147.88 ms | **Elysia −33.3 ms** | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | 20% | **114.45 ms** | 122.01 ms | 147.83 ms | **Elysia −33.4 ms** | 100% (200 OK) |
| **Stories Tray** (24h Ephemeral Filter) | 12% | **114.51 ms** | 121.72 ms | 146.56 ms | **Elysia −32.1 ms** | 100% (200 OK) |
| **Profile & 12-Photo Grid** (`Promise.all`) | 8% | **114.09 ms** | 122.12 ms | 147.72 ms | **Elysia −33.6 ms** | 100% (200 OK) |
| **Read Post Comments** (Keyset Pagination) | 5% | **113.74 ms** | 122.77 ms | 146.98 ms | **Elysia −33.2 ms** | 100% (200 OK) |
| **Double-Tap Like** (Atomic CTE Write) | 5% | **115.97 ms** | 125.18 ms | 149.01 ms | **Elysia −33.0 ms** | 100% (200 OK) |
| **Search Discovery** (GIN Trigrams) | 4% | **118.07 ms** | 122.21 ms | 147.04 ms | **Elysia −29.0 ms** | 100% (200 OK) |
| **Save / Bookmark Post** (Atomic Bookmark Toggle) | 2% | **120.24 ms** | 128.09 ms | 160.99 ms | **Elysia −40.8 ms** | 100% (200 OK) |
| **Post Comment** (Atomic CTE Write) | 2% | **118.31 ms** | 121.03 ms | 149.14 ms | **Elysia −30.8 ms** | 100% (201 Created) |
| **Follow Creator** (Graph Mutation) | 2% | **117.05 ms** | 127.77 ms | 153.23 ms | **Elysia −36.2 ms** | 100% (200 OK) |

---

## 🌐 3. Origin Compute vs. Edge Network Isolation (`Server-Timing`)

All traffic from the load generator to the API microVMs traverses Cloudflare's Anycast CDN edge (`CF-Ray`, TLS termination):

| Stack | Origin Compute (p50) | Origin Compute (p95) | End-to-End (p50) | End-to-End (p95) |
| :--- | :---: | :---: | :---: | :---: |
| 🦊 **Bun 1.4.3 + Elysia** | 🏆 **2.56 ms** | 🏆 **8.74 ms** | 🏆 **96.68 ms** | 🏆 **240.78 ms** |
| ⚡ **Bun 1.4.3 + Hono** | **2.87 ms** | **11.89 ms** | **106.46 ms** | **246.76 ms** |
| 🟢 **Node.js 26 + Express** | **8.08 ms** (3.15x slower) | **22.31 ms** (2.55x slower) | **134.48 ms** | **265.92 ms** |

---

## 📉 4. Closed-Loop Capacity Dynamics & Little's Law

Under closed-loop testing ($N$ concurrent virtual users, think time $Z = 100\text{ ms}$, response time $R$, throughput $X$), capacity is governed by **Little's Law** / the **Interactive Response Time Law**:

$$X = \frac{N}{R + Z}$$

With $R \approx 96.7\text{ ms}$ (Elysia) and $Z = 100\text{ ms}$, total loop turnaround is $\approx 196.7\text{ ms}$, yielding $X \approx 1,000 / 0.1967 \approx 5,084\text{ rps}$ theoretical ceiling. When network transit fluctuates by 20–30 ms on the edge, throughput shifts proportionally while origin compute execution remains locked at ~2.5 ms.

---

## 🎯 5. Test Harness & Database Validation

To ensure the test harness itself was never the bottleneck, loadgen telemetry was recorded continuously during all runs:

| Run | Loadgen Loop Lag (avg / p95) | Loadgen RSS | Cadence Delay | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| Elysia Run 1 | 4.42 ms / 18.87 ms | 95 MB | 3.79 ms | ✅ Healthy |
| Elysia Run 2 | 4.69 ms / 18.01 ms | 91 MB | 4.19 ms | ✅ Healthy |
| Hono Run 1 | 3.54 ms / 15.51 ms | 98 MB | 3.47 ms | ✅ Healthy |
| Hono Run 2 | 4.45 ms / 19.55 ms | 89 MB | 3.85 ms | ✅ Healthy |
| Node Run 1 | 4.73 ms / 18.97 ms | 93 MB | 4.49 ms | ✅ Healthy |
| Node Run 2 | 5.15 ms / 18.68 ms | 94 MB | 4.88 ms | ✅ Healthy |

* Peak database active connections stayed below 25 (out of 100 pooled) with a **99.98% cache hit ratio**, proving the database was serving out of memory and was never the constraint.
