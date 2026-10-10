# ☁️ InstaCloud Architecture, CLI Guide & Multi-Stack Benchmark Roadmap

This document serves as the operational manual for engineers and AI agents working on this high-throughput benchmarking testbed on **InstaCloud**.

---

## 🏗️ 1. Infrastructure Overview

* **Platform:** [InstaCloud](https://instacloud.com)
* **Environment:** `prod` (`us-east-1`)
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d`
* **Default Branch:** `main`

### Provisioned Services (2 vCPU / 2 GB RAM Tier)

| Service Name | Type | Specs / Plan | Purpose & Live Domain |
| :--- | :--- | :--- | :--- |
| **`api-bun-hono`** | Compute MicroVM | 2 vCPU / 2 GB RAM | Active reference backend API<br>`prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com` |
| **`api-node-express`** | Compute MicroVM | 2 vCPU / 2 GB RAM | Stage 2 Node.js 26 + Express API<br>`prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com` |
| **`loadgen`** | Compute MicroVM | 2 vCPU / 2 GB RAM | Distributed realistic load generator<br>`prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com` |
| **`db`** | Managed PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB SSD | High-concurrency relational store with GIN trigram indexes |

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
├── node-express/        # [Upcoming] Node.js 22 LTS + Express
├── node-fastify/        # [Upcoming] Node.js 22 LTS + Fastify
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
* **Performance:**
  * **Throughput:** ~5,000 req/sec (99,603 requests completed in 20.2s)
  * **Success Rate:** 100.0% (0 errors across 10 actions)
  * **Median Latency (p50):** 78.02 ms
  * **Average CPU:** 26.1% (0.52 cores — 74% headroom remaining)
  * **Peak RSS RAM:** **79 MB (3.9% of 2 GB RAM)**
  * **Event Loop Lag:** 0.16 ms avg / 0.30 ms p95

---

### ✅ Stage 2: Node.js 26 (Latest) + Express (Completed)
* **Runtime:** Node.js 26.11.1 (`node:current-alpine` container)
* **Framework:** Express 5.3 with `node:cluster` (2 workers), disabled `etag` / `x-powered-by`
* **Performance (1,000 VUs, 20s test against PostgreSQL 16):**
  * **Throughput:** 5,018.3 req/sec (101,202 requests completed in 20.2s)
  * **Success Rate:** 100.0% (0 errors across 10 actions)
  * **Median Latency (p50):** 79.69 ms (p95: 113.82 ms, p99: 164.63 ms)
  * **Average CPU:** 72.8% (1.46 cores — peak 100%)
  * **Peak RSS RAM:** **165 MB (8.1% of 2 GB RAM)** (2.08x higher memory than Bun 1.4.3)
  * **Event Loop Lag:** 0.46 ms avg / 2.89 ms p95 (9.6x higher event loop lag than Bun 1.4.3)

---

### ⏳ Stage 3: Bun 1.4.3 + Elysia
* **Goal:** Test Bun’s flagship native framework with static schema compilation and JIT typebox routing.
* **Architecture:**
  * Base Image: `oven/bun:1.4.3-alpine`
  * Framework: Elysia with type validation schemas.
* **Expected Hypothesis:** Throughput equal to or exceeding Hono with similar sub-100MB memory footprint.

---

### ⏳ Stage 4: Node.js 22 LTS + Fastify
* **Goal:** Test the fastest framework in the Node.js ecosystem using schema compilation (`fast-json-stringify`).
* **Architecture:**
  * Base Image: `node:22-alpine`
  * Framework: Fastify with `node:cluster` (2 workers).
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
   * The managed database supports ~100 concurrent pooled connections. Each clustered microVM worker must be capped at `max: 25` (2 workers × 25 = 50 connections) to leave headroom for loadgen and admin tasks.
