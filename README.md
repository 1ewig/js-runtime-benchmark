# InstaCloud Social Media Backend & High-Throughput Benchmark

A high-performance social media backend prototype built with **Bun 1.4.2 (Rust Core)** and **Hono**, deployed on **InstaCloud** serverless microVMs and backed by **Managed PostgreSQL 16**.

---

## 🏗️ Architecture & Infrastructure

* **Platform:** [InstaCloud](https://instacloud.com) (`prod` environment, `us-east-1`)
* **Project Name:** `testing purposes`
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d` (Branch: `main`)
* **Live Service URL:** `https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com`

### Provisioned Services

| Service | Type | Specs / Plan Limits | Purpose |
| :--- | :--- | :--- | :--- |
| **`api`** | Compute (MicroVM) | Up to 4 vCPU / 4 GB RAM | Container running Bun + Hono HTTP server |
| **`db`** | PostgreSQL 16 | Up to 4 vCPU / 4 GB RAM, 10 GB Storage | Managed relational database (`us-east-1`) |

---

## 📦 Technology Stack

* **Runtime:** [Bun v1.4.2](https://bun.sh) (Linux x64 container / Windows local development) — built on Bun's rewritten **Rust core**.
* **Framework:** [Hono v4.13](https://hono.dev) — ultra-fast, lightweight web framework.
* **Database Driver:** [`postgres.js v3.4`](https://github.com/porsager/postgres) — high-performance SQL client with tuned connection pooling:
  * Pool Size: `max: 25`
  * Idle Timeout: `20s`
  * Prepared Statements: `true`
* **Type System & Quality:**
  * **TypeScript 7** (`tsc --noEmit`)
  * **Oxlint v1.87** — blazingly fast Rust-based linter (runs in <15ms).
  * **Autocannon v8** — HTTP load testing and benchmarking.

---

## 🗄️ Database Schema & Seed Data

The database is migrated and pre-seeded with realistic social media data:

* **`users`** (5,000 rows): `id`, `username`, `display_name`, `avatar_url`, `created_at`
* **`posts`** (50,000 rows): `id`, `user_id` (FK), `content`, `likes_count`, `created_at`
* **`likes`** (99,976 rows): `id`, `user_id` (FK), `post_id` (FK), `created_at` (Unique pair)
* **`follows`**: `follower_id`, `following_id`, `created_at`
* **Indexes:**
  * `idx_posts_created_at` on `posts(created_at DESC)`
  * `idx_posts_user_created` on `posts(user_id, created_at DESC)`
  * `idx_likes_post_id` on `likes(post_id)`
  * `idx_likes_user_id` on `likes(user_id)`

---

## 🚀 API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Service metadata & available route directory |
| `/health` | `GET` | System health, DB ping latency, and memory telemetry |
| `/api/bench/feed` | `GET` | Pure in-memory 20-post feed (isolated runtime benchmark) |
| `/api/feed?cursor=<id>&limit=20` | `GET` | Cursor-paginated timeline with `posts` JOIN `users` |
| `/api/users/:id` | `GET` | User profile metadata + recent 10 posts |
| `/api/posts` | `POST` | Create a new post (`{ userId, content }`) |
| `/api/posts/:id/like` | `POST` | Atomic like transaction & `likes_count` increment |

---

## 📊 Stress Test & Benchmark Results

### Benchmark 1: Pure In-Memory Runtime Ceiling (Bun 1.4.2 Rust + Hono)
Executed directly inside the 4 vCPU container via `insta compute exec` (0ms network overhead):

```
⚡ Sustained Throughput:   70,986 requests/sec
📦 Completed in 10s:       709,895 requests
❌ Failed Requests:        0 (100% success)
⏱️ Median Latency (p50):    0.57 ms (< 1 millisecond)
⏱️ 99th Percentile (p99):  1.69 ms
💾 Memory Consumption:     52 MB RAM (out of 4 GB available!)
```

### Benchmark 2: Full-Stack with PostgreSQL 16 (`/api/feed` JOINs)
Querying 50,000 posts joined with users across the internal datacenter network:

```
⚡ Sustained Throughput:   5,923 requests/sec
📦 Completed in 10s:       59,253 queries
❌ Failed Requests:        0
⏱️ Median Latency (p50):    3.73 ms
⏱️ 99th Percentile (p99):  8.27 ms
💾 Memory Consumption:     43 MB RAM
```

### 💡 Key Takeaway on Concurrency Capacity
* At **~6,000 database requests/sec**, this free-tier 4 vCPU setup supports **60,000 to 90,000 concurrently active browsing users** (assuming average click interval of 10–15s).
* With an in-memory or Redis caching layer on top of Bun, the same container can easily absorb **500,000+ active users**.
* Note on external testing: Running load tests from residential broadband across 7,000 miles (e.g. Asia to US-East) reflects home ISP Wi-Fi packet latency (~250ms RTT), not server capacity. Datacenter-local execution reveals true hardware throughput.

---

## 🛠️ Developer Scripts & CLI Commands

### Routine Scripts
```bash
# Typecheck with TypeScript
bun run typecheck

# Lint with Oxlint
bun run lint

# Run all endpoint smoke tests
bun run test:endpoints

# Verify live DB record counts and sizes
bun run scripts/verify.ts

# Re-run migrations
bun run migrate

# Re-run database seeder
bun run seed
```

### InstaCloud CLI Commands
```bash
# View deployment and linked project status
bunx insta status

# View live container compute logs
bunx insta compute logs api

# Check real-time resource utilization
bunx insta compute metrics api

# Deploy code changes to InstaCloud
bunx insta deploy . --port 3000

# Execute internal commands directly in the microVM
bunx insta compute exec api -- bun run scripts/bench-internal.ts --concurrency 50 --duration 10
```
