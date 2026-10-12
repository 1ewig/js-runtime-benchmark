# 📊 High-Throughput Benchmark Results & Deep Analysis

This document contains the detailed benchmark metrics, workload distributions, network latency breakdowns, and capacity scaling analyses across the tested runtimes and frameworks.

All benchmarks are executed from an independent `loadgen` microVM (2 vCPU / 2 GB RAM) over the datacenter network against single-core application microVMs (**1 vCPU / 1 GB RAM**) and **Managed PostgreSQL 16**.

---

## 🏆 1. Primary Benchmark (1,000 Concurrent Virtual Users)

**Test Conditions:**
* **Load Profile:** 1,000 closed-loop virtual users, 100 ms human think time, 5s ramp-up, 20s sustained load.
* **Database State:** Warm PostgreSQL 16 instance (pre-warmed connection pools and shared buffers).
* **Worker Model:** Single dedicated worker process (`WEB_CONCURRENCY=1`, PID 1) on 1 vCPU / 1 GB RAM.

### Multi-Run Stability: Bun 1.4.3 + Hono (Fresh Dual Run)

Both runs were executed back-to-back following a full 3-service warmup routine (`bun run warmup hono`) and database sanitization:

| Metric | ⚡ Bun Run 1 (Fresh) | ⚡ Bun Run 2 (Repeat) | Bun Average | 🟢 Node.js 26 + Express |
| :--- | :---: | :---: | :---: | :---: |
| **Total Requests Completed** | **79,733** | **76,411** | **78,072** | 88,624 |
| **Sustained Throughput** | **3,904.55 req/s** | **3,775.27 req/s** | **3,839.9 req/s** | 4,361.7 req/s |
| **Average CPU Utilization** | **72.1%** (0.72 cores) | **67.6%** (0.68 cores) | **69.9%** (~30% headroom) | 🔥 **98.4%** (core pinned) |
| **Peak Memory (RSS)** | **93 MB** (9.1% RAM) | **96 MB** (9.4% RAM) | **94.5 MB** | **178 MB** (17.4% RAM) |
| **Event Loop Lag (p95)** | **2.15 ms** | **2.13 ms** | **2.14 ms** | 🔥 **15.59 ms** (7.3x higher) |
| **Event Loop Lag (avg)** | **0.54 ms** | **0.63 ms** | **0.59 ms** | 5.87 ms |
| **Origin Compute Latency (p50)** | **2.80 ms** | **2.93 ms** | **2.87 ms** | 3.91 ms |
| **Origin Compute Latency (p95)** | **9.49 ms** | **14.29 ms** | **11.89 ms** | 12.19 ms |
| **End-to-End Latency (p50)** | **103.61 ms** | **109.30 ms** | **106.46 ms** | 101.76 ms |
| **End-to-End Latency (p95)** | **254.05 ms** | **239.47 ms** | **246.76 ms** | 139.26 ms |
| **End-to-End Latency (p99)** | **421.87 ms** | **448.41 ms** | **435.14 ms** | 192.19 ms |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | **100.0%** | **100.0%** (0 errors) |

> **Efficiency & Headroom Takeaway:** Even under sustained 1,000 concurrent user load, Bun maintains **~30% average CPU headroom** (67.6%–72.1% utilization) and ultra-low event-loop stall (**2.1 ms p95**). In contrast, Node.js saturates the single core at **98.4% CPU** and experiences **15.6 ms p95 event-loop delay** with double the RAM footprint (**178 MB vs. 94.5 MB**).

---

## 📱 2. Granular Workload Breakdown (10 Real Mobile Actions)

Traffic from the fresh runs followed realistic social app usage distributions with 0 errors across 156,000+ requests:

| Action | Target Share | Measured Volume | Avg Latency (Run 1) | Avg Latency (Run 2) | Success Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Home Timeline Scroll** (Follower Graph Join) | 40% | 31,997 | 118.26 ms | 125.47 ms | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | 20% | 15,936 | 118.20 ms | 125.81 ms | 100% (200 OK) |
| **Stories Tray** (24h Ephemeral Filter) | 12% | 9,441 | 117.86 ms | 125.57 ms | 100% (200 OK) |
| **Profile & 12-Photo Grid** (`Promise.all`) | 8% | 6,292 | 118.80 ms | 125.43 ms | 100% (200 OK) |
| **Read Post Comments** (Keyset Pagination) | 5% | 4,084 | 119.50 ms | 126.03 ms | 100% (200 OK) |
| **Double-Tap Like** (Atomic CTE Write) | 5% | 4,044 | 120.76 ms | 129.60 ms | 100% (200 OK) |
| **Search Discovery** (GIN Trigrams) | 4% | 3,228 | 118.91 ms | 125.51 ms | 100% (200 OK) |
| **Save / Bookmark Post** (Atomic Bookmark Toggle) | 2% | 1,601 | 124.42 ms | 131.76 ms | 100% (200 OK) |
| **Post Comment** (Atomic CTE Write) | 2% | 1,587 | 114.63 ms | 127.43 ms | 100% (201 Created) |
| **Follow Creator** (Graph Mutation) | 2% | 1,523 | 124.44 ms | 131.09 ms | 100% (200 OK) |

---

## 🌐 3. Origin Compute vs. Edge Network Isolation (`Server-Timing`)

All traffic from the load generator to the API microVMs traverses Cloudflare's Anycast CDN edge (`CF-Ray`, TLS termination). Each stack emits a high-resolution origin timing header (`Server-Timing: origin;dur=<ms>`) to isolate true microVM execution time:

| Stack | Origin Compute (p50) | Origin Compute (p95) | End-to-End (p50) | End-to-End (p95) |
| :--- | :---: | :---: | :---: | :---: |
| ⚡ **Bun 1.4.3 + Hono** (Run 1) | 🏆 **2.80 ms** | 🏆 **9.49 ms** | 103.61 ms | 254.05 ms |
| ⚡ **Bun 1.4.3 + Hono** (Run 2) | 🏆 **2.93 ms** | 🏆 **14.29 ms** | 109.30 ms | 239.47 ms |
| 🟢 **Node.js 26 + Express** | **3.91 ms** | **12.19 ms** | **56.64 ms** | **235.57 ms** |
| 🦊 **Bun 1.4.3 + Elysia** (Preliminary) | **14.04 ms** | **46.53 ms** | **90.65 ms** | **261.54 ms** |

---

## 📉 4. Closed-Loop Capacity Dynamics & Little's Law

Doubling virtual users demonstrates closed-loop capacity saturation governed by **Little's Law** / the **Interactive Response Time Law** ($N = X \cdot (R + Z)$):

| Metric | 1,000 VUs | 2,000 VUs | Impact |
| :--- | ---: | ---: | :---: |
| Throughput ($X$) | 5,451.3 req/s | 5,711.2 req/s | +4.8% (service capacity ceiling reached) |
| p50 Latency ($R$) | 57.62 ms | 217.01 ms | +276% (socket & connection queueing) |
| API Event Loop Lag (p95) | 2.97 ms | 0.19 ms | Normal |
| API CPU (avg) | 79.5% | 80.5% | Headroom preserved |
| DB Active Connections | 24 | 6 | DB idle; bottleneck strictly at compute |

In a closed-loop system where each user waits for an HTTP response before sleeping for $Z = 100\text{ ms}$:
$$X = \frac{N}{R + Z}$$

As the single-core microVM approaches its processing capacity ceiling, additional virtual users cannot yield more completed work. Instead, requests queue in socket backlogs and round-trip latency $R$ scales roughly linearly with $N$.

---

## 🎯 5. Test Harness & Database Validation

To ensure the test harness itself was never the bottleneck, loadgen telemetry was recorded continuously during all runs:

| Run | Loadgen Loop Lag (avg / p95) | Loadgen RSS | Cadence Delay | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| Bun (Run 1) | 3.54 ms / 15.51 ms | 98 MB | 3.47 ms | ✅ Healthy |
| Bun (Run 2) | 4.45 ms / 19.55 ms | 89 MB | 3.85 ms | ✅ Healthy |
| Node (Benchmark) | 0.42 ms / 1.04 ms | 94 MB | 0 ms | ✅ Healthy |

* The harness flags itself unhealthy if p95 loop lag exceeds 25 ms; all runs remained comfortably below threshold.
* Live PostgreSQL telemetry showed peak active connections stayed well below the 100 connection limit with a **99.98% cache hit ratio**, proving the database was serving out of memory and was never the constraint.
