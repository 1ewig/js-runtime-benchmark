# InstaCloud Social Media Backend & High-Throughput Benchmark

A high-performance social media backend prototype built with **Bun 1.4.2 (Rust Core)** and **Hono**, deployed on **InstaCloud** serverless microVMs and backed by **Managed PostgreSQL 16**.

---

## 🏗️ Architecture & Infrastructure

* **Platform:** [InstaCloud](https://instacloud.com) (`prod` environment, `us-east-1`)
* **Project Name:** `testing purposes`
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d` (Branch: `main`)
* **Live Service URL:** `https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com`

### Provisioned Services (Shared Free-Tier: 4 vCPU / 4 GB Total)

| Service | Type | Specs / Plan Limits | Purpose |
| :--- | :--- | :--- | :--- |
| **`api`** | Compute (MicroVM) | 2 vCPU / 2 GB RAM | Container running Bun + Hono HTTP server |
| **`db`** | PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB Storage | Managed relational database (`us-east-1`) |

---

## 📦 Technology Stack

* **Runtime:** [Bun v1.4.2](https://bun.sh) (Linux x64 container / Windows local development) — built on Bun's rewritten **Rust core**.
* **Framework:** [Hono v4.13](https://hono.dev) — ultra-fast, lightweight web framework.
* **Database Driver:** [`postgres.js v3.4`](https://github.com/porsager/postgres) — high-performance SQL client with tuned connection pooling:
  * Pool Size: `max: 20` (optimized for 2 vCPU)
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
| `/api/feed/home?userId=<id>&cursor=<id>&limit=20` | `GET` | Personalized timeline of posts from followed accounts |
| `/api/feed/explore?cursor=<id>&limit=20` | `GET` | Discovery feed of top-engagement posts |
| `/api/users/:id` | `GET` | Profile metadata, follower/following counts, and 12-photo grid |
| `/api/users/:id/follow` | `POST` | Toggle follow / unfollow on target user |
| `/api/posts` | `POST` | Create photo post (`{ userId, imageUrl, caption }`) |
| `/api/posts/:id/like` | `POST` | Atomic like transaction & `likes_count` increment |
| `/api/bench/feed` | `GET` | Pure in-memory 20-post feed (isolated runtime benchmark) |

---

## 📊 Stress Test & Benchmark Results (2 vCPU / 2 GB MicroVM)

Executed directly inside the 2 vCPU microVM via `insta compute exec` (0ms network delay) to reveal true hardware capacity:

### 1. Pure In-Memory Runtime Ceiling (`/api/bench/feed`)
* **⚡ Sustained Throughput:** **60,754 requests/sec**
* **📦 Completed in 10s:** 607,568 requests (0 failures)
* **⏱️ Latency:** p50: **0.67 ms**, p90: **1.25 ms**, p99: **1.91 ms**
* **💾 Memory Consumption:** **47 MB RSS** (out of 2,048 MB available)

### 2. User Profile Grid (`/api/users/:id`)
* **⚡ Sustained Throughput:** **6,510 requests/sec**
* **📦 Completed in 10s:** 65,120 queries (0 failures)
* **⏱️ Latency:** p50: **4.23 ms**, p90: **6.15 ms**, p99: **10.16 ms**
* **💾 Memory Consumption:** **41 MB RSS**

### 3. Explore Discovery Feed (`/api/feed/explore`)
Querying 50,000 posts indexed by engagement (`likes_count DESC, id DESC`) joined with users:
* **⚡ Sustained Throughput:** **5,733 requests/sec**
* **📦 Completed in 10s:** 57,353 queries (0 failures)
* **⏱️ Latency:** p50: **4.95 ms**, p90: **7.89 ms**, p99: **13.15 ms**
* **💾 Memory Consumption:** **43 MB RSS**

### 4. Home Timeline (`/api/feed/home?userId=1`)
Querying relational subquery traversing 150,000 follow connections + 50,000 posts:
* **⚡ Sustained Throughput:** **4,211 requests/sec**
* **📦 Completed in 10s:** 42,129 queries (0 failures)
* **⏱️ Latency:** p50: **5.19 ms**, p90: **11.78 ms**, p99: **37.97 ms**
* **💾 Memory Consumption:** **44 MB RSS**

---

### 💡 Key Takeaway on Concurrency & Active Users
* **Database Workloads (4,200 – 6,500 req/s):** Supports **42,000 to 65,000 concurrently active browsing users** on this free 2 vCPU / 2 GB microVM (assuming average user click interval of 10s).
* **Pure Compute Ceiling (60,754 req/s):** With an in-memory micro-cache (e.g. 2s TTL) on the Explore feed, this exact 2 vCPU setup can easily absorb **600,000+ active users**.
* **RAM Efficiency:** Across all stress tests, memory hovered between **41 MB and 47 MB**, utilizing less than **2.5% of the 2 GB memory allocation**.

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
