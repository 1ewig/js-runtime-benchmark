# 📊 High-Throughput Benchmark Results & Deep Analysis

This document contains the detailed benchmark metrics, workload distributions, network latency breakdowns, and capacity scaling analyses across the tested runtimes and frameworks.

All benchmarks are executed from an independent `loadgen` microVM (2 vCPU / 2 GB RAM) over the datacenter network against single-core application microVMs (**1 vCPU / 1 GB RAM**) and **Managed PostgreSQL 16**.

---

## 🏆 1. Primary Benchmark (1,000 Concurrent Virtual Users)

**Test Conditions:**
* **Load Profile:** 1,000 closed-loop virtual users, 100 ms human think time, 5s ramp-up, 20s sustained load.
* **Database State:** Warm PostgreSQL 16 instance (pre-warmed connection pools and shared buffers).
* **Worker Model:** Single worker process (`WEB_CONCURRENCY=1`, PID 1) on 1 vCPU / 1 GB RAM.

| Metric | ⚡ Bun 1.4.3 + Hono | 🟢 Node.js 26 + Express | Impact / Delta |
| :--- | :---: | :---: | :--- |
| **Total Requests Completed** | **109,907** | **88,624** | **Bun +21,283 requests** |
| **Sustained Throughput** | 🏆 **5,451.3 req/s** | **4,361.7 req/s** | **Bun +25.0% higher throughput** |
| **Average CPU Utilization** | 🏆 **79.5%** (0.80 cores) | 🔥 **98.4%** (0.98 cores) | **Node pinned the single core** |
| **Peak Memory (RSS)** | 🏆 **87 MB** (8.5% of RAM) | **178 MB** (17.4% of RAM) | **Bun 2.05x leaner footprint** |
| **Event Loop Lag (p95)** | 🏆 **2.97 ms** | 🔥 **15.59 ms** | **Node stalled 5.2x longer** |
| **Event Loop Lag (avg)** | 🏆 **0.45 ms** | **5.87 ms** | Bun maintained sub-millisecond response |
| **Median Latency (p50)** | 🏆 **57.62 ms** | **101.76 ms** | **Bun 43.4% faster** |
| **p75 Latency** | 🏆 **76.37 ms** | **114.31 ms** | Bun 33.2% faster |
| **p95 Latency** | 🏆 **96.29 ms** | **139.26 ms** | Bun 30.9% faster |
| **p99 Tail Latency** | 🏆 **123.77 ms** | **192.19 ms** | Bun 35.6% faster |
| **Average Latency** | 🏆 **59.82 ms** | **98.92 ms** | Bun 39.5% faster |
| **HTTP Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 failures across 198,000+ requests |

> **Variance & Confidence Note:** Node was evaluated across multiple benchmark runs, yielding 4,144.6 req/s and 4,361.7 req/s (~5% natural run variance). Across all captured runs, the performance delta consistently lands at +20% to +25% in favor of Bun on this workload.

---

## 📱 2. Granular Workload Breakdown (10 Real Mobile Actions)

The benchmark simulates real user sessions weighted by typical social media usage patterns:

| Action | Share | Bun Volume | Node Volume | Avg Latency (Bun) | Avg Latency (Node) | Success Rate |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Home Timeline Scroll** (Follower Graph Join) | 39.9% | 43,849 | 35,360 | **59.83 ms** | 97.92 ms | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | 20.0% | 21,997 | 17,725 | **58.89 ms** | 98.04 ms | 100% (200 OK) |
| **Stories Tray** (24h Ephemeral Filter) | 12.0% | 13,232 | 10,635 | **58.02 ms** | 97.22 ms | 100% (200 OK) |
| **Profile & 12-Photo Grid** (`Promise.all`) | 8.0% | 8,775 | 7,090 | **60.37 ms** | 99.08 ms | 100% (200 OK) |
| **Read Post Comments** (Keyset Pagination) | 5.0% | 5,479 | 4,431 | **56.73 ms** | 97.51 ms | 100% (200 OK) |
| **Double-Tap Like** (Atomic CTE Write) | 5.1% | 5,553 | 4,520 | **60.57 ms** | 99.13 ms | 100% (200 OK) |
| **Search Discovery** (GIN Trigrams) | 4.0% | 4,409 | 3,545 | **64.87 ms** | 100.39 ms | 100% (200 OK) |
| **Save / Bookmark Post** (Atomic Bookmark Toggle) | 2.0% | 2,229 | 1,772 | **67.67 ms** | 123.99 ms | 100% (200 OK) |
| **Follow Creator** (Graph Mutation) | 2.0% | 2,201 | 1,772 | **64.84 ms** | 111.29 ms | 100% (200 OK) |
| **Post Comment** (Atomic CTE Write) | 2.0% | 2,183 | 1,774 | **60.18 ms** | 99.19 ms | 100% (201 Created) |

**Key Takeaways by Route:**
* Read endpoints remain remarkably stable at ~57–60 ms on Bun and ~97–99 ms on Node.
* Write-heavy toggle operations (`save` and `follow`) were the most resource-intensive operations across both stacks.
* On the `save` toggle endpoint, Node degraded significantly under load (**123.99 ms vs Bun's 67.67 ms**—an 83% latency penalty).

---

## 🌐 3. Origin Compute vs. Edge Network Isolation (`Server-Timing`)

All traffic from the load generator to the API microVMs traverses Cloudflare's Anycast CDN edge (`CF-Ray`, TLS termination), introducing 15–45 ms of external transit and proxying into total end-to-end measurements.

To isolate application execution speed from edge network transit, every stack emits a high-resolution origin timing header:
`Server-Timing: origin;dur=<ms>`

| Stack (500 VUs) | Origin Compute (p50) | Origin Compute (p95) | End-to-End (p50) | End-to-End (p95) |
| :--- | :---: | :---: | :---: | :---: |
| ⚡ **Bun 1.4.3 + Hono** | 🏆 **1.67 ms** | 🏆 **4.59 ms** | 🏆 **46.45 ms** | 🏆 **235.32 ms** |
| 🟢 **Node.js 26 + Express** | **3.91 ms** (2.3x slower) | **12.19 ms** (2.7x slower) | **56.64 ms** | **235.57 ms** |
| 🦊 **Bun 1.4.3 + Elysia** | **14.04 ms** | **46.53 ms** | **90.65 ms** | **261.54 ms** |

---

## 📉 4. Closed-Loop Capacity Dynamics & Little's Law

Doubling virtual users from 1,000 to 2,000 demonstrates closed-loop capacity saturation governed by **Little's Law** / the **Interactive Response Time Law** ($N = X \cdot (R + Z)$):

| Metric | 1,000 VUs | 2,000 VUs | Delta |
| :--- | ---: | ---: | :---: |
| Throughput ($X$) | 5,451.3 req/s | 5,711.2 req/s | **+4.8%** |
| p50 Latency ($R$) | 57.62 ms | 217.01 ms | **+276%** |
| API Event Loop Lag (p95) | 2.97 ms | 0.19 ms | Normal |
| API CPU (avg) | 79.5% | 80.5% | +1.0% |
| DB Active Connections | 24 | 6 | Idle |

In a closed-loop system where each user waits for an HTTP response before sleeping for $Z = 100\text{ ms}$:
$$X = \frac{N}{R + Z}$$

As the single-core microVM approaches its processing capacity ceiling ($X_{\max} \approx 5,700\text{ req/s}$), additional virtual users cannot yield more completed work. Instead, requests queue in socket backlogs and round-trip latency $R$ grows linearly with $N$.

---

## 🎯 5. Test Harness & Database Validation

To ensure the test harness itself was never the bottleneck, loadgen telemetry was recorded continuously during all runs:

| Run | Loadgen Loop Lag (avg / p95) | Loadgen RSS | Cadence Delay | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| Bun (1,000 VUs) | 0.53 ms / 1.16 ms | 89 MB | 0 ms | ✅ Healthy |
| Bun (2,000 VUs) | 0.61 ms / 1.18 ms | 111 MB | 0 ms | ✅ Healthy |
| Node (1,000 VUs) | 0.42 ms / 1.04 ms | 94 MB | 0 ms | ✅ Healthy |

* The harness flags itself unhealthy if p95 loop lag exceeds 25 ms; actual lag remained at ~1 ms (24x below threshold).
* Cadence delay remained at **0 ms**, confirming all users dispatched exactly on schedule.
* Live PostgreSQL telemetry showed peak active connections reached **24** (out of 100 available) with a **99.98% cache hit ratio**, proving the database was serving out of memory and was never the constraint.
