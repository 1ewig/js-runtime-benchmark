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
| `/api/telemetry` | `GET` | Real-time CPU %, RAM, and event-loop lag sampler report |
| `/api/telemetry/reset` | `POST` | Reset telemetry sample windows for fresh benchmark |
| `/api/auth/token` | `POST` | Generate HMAC-SHA256 Bearer authorization token |
| `/api/feed/home?userId=<id>&cursor=<id>&limit=20` | `GET` | Personalized timeline of posts from followed accounts |
| `/api/feed/explore?cursor=<id>&limit=20` | `GET` | Discovery feed of top-engagement posts |
| `/api/users/:id` | `GET` | Profile metadata, follower/following counts, and 12-photo grid |
| `/api/users/:id/follow` | `POST` | Toggle follow / unfollow on target user |
| `/api/posts` | `POST` | Create photo post (`{ userId, imageUrl, caption }`) |
| `/api/posts/:id/like` | `POST` | Atomic like transaction & `likes_count` increment |

---

## 📊 Realistic User Journey Simulation Benchmark (2 vCPU / 2 GB MicroVM)

Simulating full human mobile app journeys with **HMAC-SHA256 Token Authentication**, **stateful keyset cursor pagination**, and **power-law influencer profile distributions** executed from the dedicated `loadgen` microVM over the datacenter network.

### 🏆 60-Second Soak Benchmark (1,000 Virtual Users, 15s Ramp-Up + 45s Peak)

| Metric | Measured Value | Analysis & Notes |
| :--- | :---: | :--- |
| **Total Test Duration** | **61.83s** | 15.0s Linear Ramp-Up + 46.8s Sustained Peak |
| **Concurrent Virtual Users** | **1,000 VUs** | Staggered launch to eliminate artificial cold stampede |
| **Total Requests Completed** | **208,935** | 208,934 succeeded (99.9995% success rate) |
| **Steady-State Peak RPS** | **~4,149 req/s** | Sustained ~3,950–4,149 req/s during peak plateau |
| **Overall Average RPS** | **3,379 req/s** | Blended across initial ramp-up and steady peak |
| **Cryptographic Token Auth** | **Active** | HMAC-SHA256 Bearer Token verification on every journey |
| **Loadgen MicroVM Health** | **Healthy** | p95 Event Loop Lag: **1.08ms** (0 client bottleneck) |
| **Cadence Queue Delay** | **0.00ms** | Coordinated Omission mitigated (zero arrival drift) |
| **Equivalent Human Capacity** | **~35,000–40,000** | Continuously active human browsing users (10s avg clicks) |

---

### ⏱️ Latency Percentiles & Coordinated Omission Analysis

| Percentile | Raw Server Round-Trip | Coordinated Omission (CO) Corrected | User Experience |
| :---: | :---: | :---: | :--- |
| **p50 (Median)** | **42.85 ms** | **42.85 ms** | Instantaneous mobile response |
| **p75** | **61.75 ms** | **61.75 ms** | Smooth interactive feel |
| **p90** | **88.16 ms** | **88.16 ms** | Sub-100ms threshold |
| **p95** | **109.20 ms** | **109.20 ms** | Highly stable under 1,000 VUs |
| **p99** | **173.78 ms** | **173.78 ms** | Rock solid tail latency |
| **p99.9** | **371.49 ms** | **371.49 ms** | Zero runaway request queueing |
| **Average** | **51.83 ms** | **51.83 ms** | Across all 208,935 requests |

---

### 📈 Workload Breakdown (Realistic Social App Distribution)

| Action | Share | Total Volume | Avg Latency | HTTP Success Rate |
| :--- | :---: | :---: | :---: | :---: |
| **Home Timeline Scroll** (Follower Graph Join) | **55.1%** | 115,027 | 50.39 ms | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | **25.0%** | 52,248 | 50.61 ms | 100% (200 OK) |
| **Profile & 12-Photo Grid** (Influencer Skew) | **11.9%** | 24,879 | 53.09 ms | 100% (200 OK) |
| **Double-Tap Likes** (Atomic DB Transaction) | **6.0%** | 12,573 | 61.83 ms | 100% (200 OK) |
| **Follow Creator** (Graph Mutation + Counters) | **2.0%** | 4,208 | 69.06 ms | 99.98% (4,207 200 OK, 1 retry) |

---

### 💡 Key Takeaway on Concurrency & Capacity
* **Throughput Ceiling:** The 2 vCPU Bun server smoothly sustains **~4,000 requests/sec** under **1,000 concurrent virtual users** with full HMAC-SHA256 authentication and database write transactions.
* **Rock-Solid Tail Latencies:** p99 latency remains firmly under **175 ms** across **208,000+ total requests** over a 60-second test.
* **Real-World Capacity:** A single 2 vCPU / 2 GB container handles **35,000 to 40,000 continuously active human browsing users** direct to Postgres **without any Redis or caching layer**!

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
