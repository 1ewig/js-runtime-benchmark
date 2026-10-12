# ☁️ InstaCloud Architecture & CLI Operational Guide

This document is the operational guide for managing services, microVM lifecycles, secrets, and deployments on **InstaCloud**.

---

## 🏗️ 1. Infrastructure Overview

* **Platform:** [InstaCloud](https://instacloud.com)
* **Environment:** `prod` (`us-east-1`)
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d`
* **Default Branch:** `main`

### Provisioned Services

| Service | Type | Specs / Plan | Purpose & Live Domain |
| :--- | :--- | :--- | :--- |
| **`compute/api-bun-hono`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Bun 1.4.3 + Hono API<br>`prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com` |
| **`compute/api-node-express`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Node.js 26 + Express API<br>`prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com` |
| **`compute/api-bun-elysia`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Bun 1.4.3 + Elysia API<br>`prod-main-api-bun-elysia-a0dd1d-00bw66fwy72.compute.instacloud-edge.com` |
| **`compute/loadgen`** | Compute MicroVM | 2 vCPU / 2 GB RAM | Distributed realistic load generator<br>`prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com` |
| **`postgres/db`** | Managed PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB SSD | Managed relational database (`us-east-1`) |

---

## 💻 2. Verified InstaCloud CLI Commands

All commands run through `bunx insta`. The syntax and options below have been verified against the live CLI.

### Status & Service Management

```bash
# Check current authentication status and linked project
bunx insta status

# List all provisioned services, status, images, and live edge domains
bunx insta service list

# Provision a new compute microVM service
bunx insta service add compute <service-name>
```

### MicroVM Lifecycle

Compute services automatically scale-to-zero / suspend when idle to conserve resources.

```bash
# Check desired vs. live state (running vs suspended)
bunx insta compute status <service-name>

# Bring a compute service online (enables auto-wake on incoming traffic)
bunx insta compute start <service-name>

# Stop a compute service (traffic will NOT wake it until `start`)
bunx insta compute stop <service-name>

# Restart a running service with freshly resolved environment / secrets
bunx insta compute restart <service-name>
```

### Hardware Ceilings & Resource Limits

```bash
# View current resource ceiling for a compute service
bunx insta compute limits <service-name>

# Set microVM resource limits (e.g. 1 vCPU / 1 GB RAM tier)
bunx insta compute limits <service-name> --cpu 1 --memory 1gb
```

### Observability, Logs & Telemetry

```bash
# View real-time container runtime logs
bunx insta compute logs <service-name>

# View machine deployment lifecycle events
bunx insta compute logs --deploy <service-name>

# Check real-time resource utilization metrics
bunx insta compute metrics <service-name>
```

### Managed PostgreSQL Operations

```bash
# Inspect database connection count, cache hit rate, and state (does not wake suspended DB)
bunx insta postgres stats db --json

# Print the database connection URL
bunx insta postgres url db

# Restart PostgreSQL instance (e.g. for parameter changes)
bunx insta postgres restart db
```

### Secrets & Credential Bindings

Compute microVMs do not automatically inherit database credentials; they require explicit bindings.

```bash
# Bind the managed database URL to a compute service
bunx insta secrets bind DATABASE_URL postgres/db --to compute/<service-name>

# Inspect active credential bindings for a compute service
bunx insta secrets bindings --target compute/<service-name>
```

### Deploying to Compute Services

```bash
# Deploy a directory with a root Dockerfile to a compute service
bunx insta deploy . --group <service-name> --port 3000

# Automated deployment script (copies docker/Dockerfile.<stack> to root and deploys)
bun run deploy <stack>
```

---

## ⚙️ 3. MicroVM Lifecycle & Behavior

1. **Auto-Suspension & Cold Starts:**
   * Idle compute microVMs suspend automatically.
   * When traffic hits a suspended microVM via Cloudflare Edge, InstaCloud automatically wakes the container.
   * During waking, initial DNS or TLS negotiation may briefly take 2–5 seconds. If needed, wake manually before benchmarking using `bunx insta compute start <service-name>`.

2. **Database Wake Latency:**
   * PostgreSQL instances also suspend after sustained idle periods.
   * The first connection to a cold database may take up to ~7 seconds to wake. Always run `bun run warmup <stack>` before executing benchmarks so all pools are warm.

3. **Applying New Secrets:**
   * Changes made with `bunx insta secrets bind` or `bunx insta secrets set` are baked at deploy or container launch time.
   * To apply newly bound secrets to an already running container without rebuilding, run `bunx insta compute restart <service-name>`.

4. **Root Dockerfile Convention:**
   * The root `Dockerfile` is ephemeral and git-ignored.
   * Project deploy scripts automatically copy the appropriate template from `docker/Dockerfile.<stack>` into the root directory during `bun run deploy <stack>`. Do not manually commit changes to the root `Dockerfile`.
