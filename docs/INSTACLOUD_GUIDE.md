# ☁️ InstaCloud Architecture, CLI Guide & Multi-Stack Benchmark Roadmap

This document serves as the operational manual for engineers and AI agents working on this high-throughput benchmarking testbed on **InstaCloud**.

---

## 🏗️ 1. Infrastructure Overview

* **Platform:** [InstaCloud](https://instacloud.com)
* **Environment:** `prod` (`us-east-1`)
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d`
* **Default Branch:** `main`

### Provisioned Services (1 vCPU / 1 GB API MicroVM Tier)

| Service Name | Type | Specs / Plan | Purpose & Live Domain |
| :--- | :--- | :--- | :--- |
| **`api-bun-hono`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Reference Bun 1.4.3 + Hono API<br>`prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com` |
| **`api-node-express`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Stage 2 Node.js 26 + Express API<br>`prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com` |
| **`loadgen`** | Compute MicroVM | 2 vCPU / 2 GB RAM | Distributed realistic load generator<br>`prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com` |
| **`db`** | Managed PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB SSD | High-concurrency relational store with GIN trigram indexes |

> Both API microVMs are pinned to the **1 vCPU / 1 GB** tier via `VCPU_COUNT=1`, `MICROVM_RAM_MB=1024` and `WEB_CONCURRENCY=1` in their Dockerfiles. The generator and database sit at 2 vCPU / 2 GB, so the measured application is the smallest resource in the request path.

---

## 💻 2. Essential InstaCloud CLI Commands

All commands are run using the InstaCloud CLI (`bunx insta`):

### Project & Service Status
```bash
# Check current CLI environment, user, and linked project
bunx insta status

# List all provisioned services, running images, ports, and domains
bunx insta service list

# Check desired vs. live state of a compute microVM
bunx insta compute status api-bun-hono
bunx insta compute status loadgen
```

### MicroVM Lifecycle Management
Compute services on InstaCloud automatically suspend when idle to conserve resources. If a service is suspended, use these commands:

```bash
# Wake / start a microVM service
bunx insta compute start api-bun-hono
bunx insta compute start loadgen

# Stop a compute service (traffic will NOT wake it)
bunx insta compute stop <service-name>

# Restart a service (applies newly bound environment variables/secrets)
bunx insta compute restart api-bun-hono
```

### Observability, Logs & Telemetry
```bash
# View real-time compute container logs
bunx insta compute logs api-bun-hono

# View container deployment lifecycle events
bunx insta compute logs --deploy api-bun-hono

# Check real-time resource utilization (CPU, memory, bandwidth)
bunx insta compute metrics api-bun-hono
```

### Secrets & Database Credential Bindings
When provisioning a new compute service (e.g. for a new stack), bind database credentials with:
```bash
# Provision a new microVM service
bunx insta service add compute api-node-express

# Bind the managed database URL to the new service
bunx insta secrets bind DATABASE_URL postgres/db --to compute/api-node-express

# Inspect credential bindings
bunx insta secrets bindings --service compute/api-node-express
```

### Deployment
Deployments are automated through project scripts:
```bash
# Automated deployment of Bun + Hono stack
bun run deploy:hono

# Manual deployment of any directory to a compute group
bunx insta deploy . --group <service-name> --port 3000
```

---

## 🔬 3. Multi-Stack Benchmarking Workflow

The repository is structured to enable apples-to-apples comparisons across different runtimes and frameworks under identical database and hardware conditions.

### Directory Structure
```text
src/
├── shared/              # Shared logic across all stacks
│   ├── db.ts            # postgres.js pool (max: 25 per worker)
│   ├── auth.ts          # HMAC-SHA256 Bearer verification + token cache
│   └── telemetry.ts     # Linux cgroup v1/v2 CPU % & RSS memory sampler
│
├── bun-hono/            # [Active Baseline] Bun 1.4.3 + Hono
│   ├── routes/          # 10 core social app endpoints
│   └── index.ts         # Multi-core clustering with Bun.serve({ reusePort: true })
│
├── bun-elysia/          # [Upcoming] Bun 1.4.3 + Elysia
├── node-express/        # [Completed] Node.js 26 + Express
├── node-fastify/        # [Upcoming] Node.js 26 + Fastify
└── index.ts             # Dynamic entrypoint (STACK=bun-hono by default)

docker/
├── Dockerfile.bun-hono  # Multi-stage Bun 1.4.3 Alpine template
└── Dockerfile.*         # Dedicated templates for upcoming stacks
```

### Standard Execution Routine for Future Agents
When testing any stack, follow this sequence:

1. **Deploy:**
   ```bash
   bun run deploy:<stack>
   ```
2. **Warm Up (Crucial):**
   ```bash
   bun run warmup
   ```
   *Pings the health check, JIT compiles routes, opens DB connection pools, and resets telemetry counters.*
3. **Run Benchmark:**
   ```bash
   bun run scripts/run-benchmark.ts --users=1000 --duration=20 --rampUp=5
   ```
4. **Evaluate Metrics:**
   Verify **100% HTTP success rate**, check **p50/p95 latency**, note **Peak RSS RAM**, and record **Average CPU %**.

---

## 🗺️ 4. Multi-Stack Benchmark Roadmap

### ✅ Stage 1: Bun 1.4.3 + Hono (Completed Reference Baseline)
* **Runtime:** Bun 1.4.3 (Alpine Linux container)
* **Framework:** Hono 4.13
* **Tier:** 1 vCPU / 1 GB RAM, 1 dedicated worker (`WEB_CONCURRENCY=1`)
* **Performance (1,000 VUs, 100 ms think time, warm environment):**
  * Throughput: **5,451.3 req/sec** (109,907 requests in 20.2s)
  * Latency: 57.62 ms p50 / 76.37 ms p75 / 96.29 ms p95 / 123.77 ms p99
  * CPU Usage: **79.5% avg** (0.80 cores — ~20% average headroom)
  * Peak RSS RAM: **87 MB (8.5% of 1 GB)**
  * Event Loop Lag: 0.45 ms avg / 2.97 ms p95
  * Success Rate: 100.0% (0 errors)
* **Generator control:** loadgen loop lag 0.53 ms avg / 1.16 ms p95, cadence delay 0 ms, `healthy: true` — not generator-bound.

---

### ✅ Stage 2: Node.js 26 (Latest) + Express (Completed)
* **Runtime:** Node.js 26.11.1 (`node:current-alpine` container)
* **Framework:** Express 5.3 with disabled `etag` / `x-powered-by`
* **Tier:** 1 vCPU / 1 GB RAM, 1 dedicated worker (`WEB_CONCURRENCY=1`)
* **Performance (1,000 VUs, 100 ms think time, warm environment):**
  * Throughput: **4,361.7 req/sec** (88,624 requests in 20.3s)
  * Latency: 101.76 ms p50 / 114.31 ms p75 / 139.26 ms p95 / 192.19 ms p99
  * CPU Usage: **98.4% avg** (0.98 cores — single core effectively pinned)
  * Peak RSS RAM: **178 MB (17.4% of 1 GB)**
  * Event Loop Lag: 5.87 ms avg / 15.59 ms p95
  * Success Rate: 100.0% (0 errors)
* **Generator control:** loadgen loop lag 0.42–0.45 ms avg / 1.04 ms p95, cadence delay 0 ms, `healthy: true` — not generator-bound.
* **Variance note:** two runs produced 4,144.6 and 4,361.7 req/sec (~5% spread). The throughput delta against Bun should be read as ~20–25%, not an exact figure.

---

### ⏳ Stage 3: Bun 1.4.3 + Elysia
* **Goal:** Test Bun’s flagship native framework with static schema compilation and JIT typebox routing.
* **Architecture:**
  * Base Image: `oven/bun:1.4.3-alpine`
  * Framework: Elysia with type validation schemas.
* **Expected Hypothesis:** Throughput equal to or exceeding Hono with similar sub-100MB memory footprint.

---

### ⏳ Stage 4: Node.js 26 (Latest) + Fastify
* **Goal:** Test the fastest framework in the Node.js ecosystem using schema compilation (`fast-json-stringify`).
* **Architecture:**
  * Base Image: `node:current-alpine`
  * Framework: Fastify with single/clustered workers.
* **Expected Hypothesis:** Significantly faster than Express, testing whether Node's V8 JIT can match Bun's Rust core when optimized.

---

### ⏳ Stage 5: Final Comprehensive Comparison Report
* Side-by-side leaderboard across:
  * **Throughput (req/sec)**
  * **Tail Latency (p95 / p99)**
  * **Compute Efficiency (req/sec per % CPU core)**
  * **RAM Footprint (MB RSS per 1,000 VUs)**
  * **Operational Cost (estimated monthly cost per million requests)**

---

## 🛠️ 5. Operational Notes & Troubleshooting

1. **Transient `ENOTFOUND` during cold restart:**
   * If a microVM was suspended and DNS momentarily glitches while waking, run `bunx insta compute start <service>` and retry in 3 seconds.
2. **Never Edit Root `Dockerfile` Directly:**
   * Root `Dockerfile` is git-ignored and automatically generated/cleaned by `scripts/deploy.ts`. Edit templates inside `docker/Dockerfile.<stack>`.
3. **Database Connection Pool Sizing:**
   * The managed database supports ~100 concurrent pooled connections, and observed peak usage under full load is only **24**. Each microVM worker is capped at `max: 25`; with `WEB_CONCURRENCY=1` that is 25 connections total. Leave headroom for loadgen and admin tasks.
