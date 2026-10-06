# InstaCloud Social Media Backend & High-Throughput Benchmark

A high-performance social media backend prototype built with **Bun 1.4.2 (Rust Core)** and **Hono**, deployed on **InstaCloud** serverless microVMs and backed by **Managed PostgreSQL 16**.

---

## 🏗️ Architecture & Infrastructure

* **Platform:** [InstaCloud](https://instacloud.com) (`prod` environment, `us-east-1`)
* **Project Name:** `testing purposes`
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d` (Branch: `main`)
* **Live Service URL:** `https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com`

### Provisioned Services (2 vCPU / 2 GB RAM per Service)

| Service | Type | Specs / Plan Limits | Purpose |
| :--- | :--- | :--- | :--- |
| **`api`** | Compute (MicroVM) | 2 vCPU / 2 GB RAM | Container running Bun + Hono HTTP server |
| **`loadgen`** | Compute (MicroVM) | 2 vCPU / 2 GB RAM | Dedicated distributed realistic load generator |
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
| `/api/auth/token` | `POST` | Generate HMAC-SHA256 Bearer authorization token |
| `/api/feed/home?userId=<id>&cursor=<id>&limit=20` | `GET` | Personalized timeline of posts from followed accounts |
| `/api/feed/explore?cursor=<id>&limit=20` | `GET` | Discovery feed of top-engagement posts |
| `/api/users/:id` | `GET` | Profile metadata, follower/following counts, and 12-photo grid |
| `/api/users/:id/follow` | `POST` | Toggle follow / unfollow on target user |
| `/api/posts` | `POST` | Create photo post (`{ userId, imageUrl, caption }`) |
| `/api/posts/:id/like` | `POST` | Atomic like transaction & `likes_count` increment |

---

## 📊 Realistic User Journey Simulation Benchmark (2 vCPU / 2 GB MicroVM)

Simulating full human mobile app journeys (Home timeline scrolling 55%, Explore discovery 25%, Profile grid 12%, Double-tap likes 6%, Follows 2%) executed from the dedicated `loadgen` microVM over the datacenter network:

| Virtual Users | Sustained RPS | 10s Total Requests | Success Rate | Median Latency (p50) | p90 Latency | p99 Latency | Equivalent Active Human Capacity |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **100 Users** | **733 req/s** | 7,437 | 100% | **33.17 ms** | 48.07 ms | 199.22 ms | **7,300 active users** |
| **300 Users** | **2,221 req/s** | 22,560 | 100% | **31.88 ms** | 47.21 ms | 96.82 ms | **22,200 active users** |
| **600 Users** | **4,108 req/s** | 42,208 | 100% | **37.07 ms** | 66.42 ms | 176.85 ms | **41,000 active users** |
| **1,000 Users** | **5,495 req/s** | 56,307 | 100% | **67.20 ms** | 134.13 ms | 231.31 ms | **55,000 active users** |
| **1,500 Users** | **5,236 req/s** | 53,756 | 100% | **165.34 ms** | 261.52 ms | 357.80 ms | **52,000 active users** |

---

### 💡 Key Takeaway on Concurrency & Capacity
* **Saturation Point:** The 2 vCPU Bun server gracefully hits maximum throughput at **~5,500 requests/sec** under **1,000 to 1,500 simultaneous virtual users**.
* **Zero Failure Rate:** Across all stress tests (**182,000+ total requests**), the system experienced **0 failed requests, 0 timeouts, and 0 dropped connections**.
* **Real-World Capacity:** Supports **50,000 to 55,000 continuously active human browsing users** on a 2 vCPU / 2 GB container without any caching!

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

# Trigger A+ production-grade user simulation (60s total: 15s ramp-up + 45s sustained peak + Auth)
curl "https://<loadgen-url>/run?users=1000&duration=60&rampUpSec=15&thinkTimeMs=200&useAuth=true"
```
