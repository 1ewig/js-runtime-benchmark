# InstaCloud Social Media Backend & High-Throughput Benchmark

A high-performance social media backend prototype built with **Bun 1.4.3 (Rust Core)** and **Hono**, deployed on **InstaCloud** serverless microVMs and backed by **Managed PostgreSQL 16**.

---

## 🏗️ Architecture & Infrastructure

* **Platform:** [InstaCloud](https://instacloud.com) (`prod` environment, `us-east-1`)
* **Project Name:** `testing purposes`
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d` (Branch: `main`)
* **Live Service URL:** `https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com`

### Provisioned Services (2 vCPU / 2 GB RAM per Service)

| Service | Type | Specs / Plan Limits | Purpose |
| :--- | :--- | :--- | :--- |
| **`api-bun-hono`** | Compute (MicroVM) | 2 vCPU / 2 GB RAM | Clustered multi-core Bun 1.4.3 + Hono HTTP server |
| **`loadgen`** | Compute (MicroVM) | 2 vCPU / 2 GB RAM | Dedicated distributed realistic load generator |
| **`db`** | PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB Storage | Managed relational database (`us-east-1`) |

---

## 📦 Technology Stack & Runtime Optimizations

* **Runtime:** [Bun v1.4.3](https://bun.sh) (Linux x64 container / Windows local development) — built on Bun's rewritten **Rust core** with upgraded JavaScriptCore (JSC) engine and ultra-lean memory allocator.
* **Concurrency Model:** Multi-process worker clustering via `node:cluster` with `Bun.serve({ reusePort: true })` saturating all 2 vCPUs under Linux kernel `SO_REUSEPORT` socket distribution.
* **Framework:** [Hono v4.13](https://hono.dev) — ultra-fast, lightweight web framework.
* **Cryptography:** Native Zig/BoringSSL `Bun.CryptoHasher('sha256')` for Bearer token verification with constant-time validation (`crypto.timingSafeEqual`) and fast in-memory token cache.
* **Database Driver:** [`postgres.js v3.4`](https://github.com/porsager/postgres) with tuned connection pooling:
  * Pool Size: Balanced per clustered worker (`max: 25` per worker, 50 total)
  * Idle Timeout: `20s`
  * Prepared Statements: `true`
  * Write Execution: Atomic single-roundtrip Common Table Expressions (CTEs)
* **Modular Multi-Stack Architecture:**
  * `src/shared/`: Shared PostgreSQL queries, HMAC authentication, and Linux cgroup telemetry samplers.
  * `src/bun-hono/`: Production Bun 1.4.3 + Hono implementation.
  * `src/bun-elysia/`: Scaffolding for Bun + Elysia stack.
  * `src/node-express/`: Scaffolding for Node.js 22 + Express stack.
  * `src/node-fastify/`: Scaffolding for Node.js 22 + Fastify stack.
* **Container Packaging:** Multi-stage Docker builds isolating production dependencies (`oven/bun:1.4.3-alpine`) and running under unprivileged non-root user `bun`.
* **Type System & Quality:**
  * **TypeScript 7** (`tsc --noEmit`)
  * **Oxlint v1.87** — blazingly fast Rust-based linter (runs in <20ms).

---

## 🗄️ Database Schema & Indexes

The database is migrated and pre-seeded with realistic Instagram-scale data:

* **`users`** (5,000 rows): `id`, `username`, `display_name`, `avatar_url`, `bio`, `followers_count`, `following_count`, `posts_count`, `created_at`
* **`posts`** (50,000+ rows): `id`, `user_id` (FK), `image_url`, `caption`, `likes_count`, `comments_count`, `created_at`
* **`likes`** (133,000+ rows): `id`, `user_id` (FK), `post_id` (FK), `created_at` (Unique pair)
* **`follows`** (152,000+ rows): `follower_id`, `following_id`, `created_at` (Power-law influencer distribution)
* **`comments`** (26,000+ rows): `id`, `post_id` (FK), `user_id` (FK), `content`, `created_at`
* **`stories`** (2,700+ active rows): `id`, `user_id` (FK), `media_url`, `created_at`, `expires_at` (24-hour TTL)
* **`saved_posts`** (9,800+ rows): `user_id` (FK), `post_id` (FK), `created_at` (Private bookmarks)
* **High-Throughput Indexes:**
  * `idx_posts_user_id_id` on `posts(user_id, id DESC)` (Home feed fan-in keyset lookup)
  * `idx_posts_likes_id` on `posts(likes_count DESC, id DESC)` (Explore feed popularity sort)
  * `idx_follows_following_id` on `follows(following_id)` (Reverse follow graph lookup)
  * `idx_comments_post_id` on `comments(post_id, id DESC)` (Threaded post comments keyset lookup)
  * `idx_stories_user_created` on `stories(user_id, created_at DESC)` (Stories tray active lookup)
  * `idx_saved_posts_user` on `saved_posts(user_id, created_at DESC)` (Private saved collection lookup)
  * `idx_posts_caption_trgm` on `posts USING gin (lower(caption) gin_trgm_ops)` (GIN Trigram substring search)
  * `idx_users_display_name_trgm` on `users USING gin (lower(display_name) gin_trgm_ops)` (GIN Trigram name search)
  * `idx_users_username_trgm` on `users USING gin (lower(username) gin_trgm_ops)` (GIN Trigram username search)

---

## 🚀 API Endpoints

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/` | `GET` | Service metadata & available route directory |
| `/health` | `GET` | System health, DB ping latency, and memory telemetry |
| `/api/telemetry` | `GET` | Real-time container CPU %, RAM, and event-loop lag sampler report |
| `/api/telemetry/reset` | `POST` | Reset telemetry sample windows for fresh benchmark |
| `/api/auth/token` | `POST` | Generate HMAC-SHA256 Bearer authorization token |
| `/api/feed/home?userId=<id>&cursor=<id>&limit=20` | `GET` | Personalized timeline of posts from followed accounts |
| `/api/feed/explore?cursor=<id>&limit=20` | `GET` | Discovery feed of top-engagement posts |
| `/api/feed?cursor=<id>&limit=20` | `GET` | Reverse-chronological timeline |
| `/api/stories/tray?userId=<id>` | `GET` | Ephemeral stories tray from followed accounts (24h TTL) |
| `/api/stories` | `POST` | Publish ephemeral story (`{ userId, mediaUrl }`) |
| `/api/users/:id` | `GET` | Profile metadata, follower/following counts, and 12-photo grid |
| `/api/users/:id/saved?cursor=<id>&limit=20` | `GET` | Authenticated private saved / bookmarked photo grid |
| `/api/users/:id/follow` | `POST` | Toggle follow / unfollow on target user |
| `/api/posts` | `POST` | Create photo post (`{ userId, imageUrl, caption }`) |
| `/api/posts/:id/like` | `POST` | Atomic single-roundtrip CTE like & `likes_count` increment |
| `/api/posts/:id/comments?cursor=<id>&limit=20` | `GET` | Keyset cursor-paginated comments with author metadata |
| `/api/posts/:id/comments` | `POST` | Atomic single-roundtrip CTE comment & `comments_count` increment |
| `/api/posts/:id/save` | `POST` | Toggle private post bookmark in saved collection |
| `/api/search?q=<term>&type=users\|posts\|all` | `GET` | GIN Trigram prefix and keyword search across creators and posts |

---

## 📊 Realistic User Journey Simulation Benchmark (2 vCPU / 2 GB MicroVM)

Simulating full human mobile app journeys with **HMAC-SHA256 Token Authentication**, **stateful keyset cursor pagination**, and **power-law influencer profile distributions** executed from the dedicated `loadgen` microVM over the datacenter network across **10 concurrent user interactions**.

### 🏆 Benchmark Results (Bun 1.4.3 + Hono — 1,000 Virtual Users, 5s Ramp-Up + 15.2s Sustained Peak)

| Metric | Measured Value | Analysis & Notes |
| :--- | :---: | :--- |
| **Total Test Duration** | **20.20s** | 5.0s Linear Ramp-Up + 15.20s Sustained Peak |
| **Concurrent Virtual Users** | **1,000 VUs** | Staggered launch simulating human mobile clients |
| **Total Requests Completed** | **99,603** | 99,603 succeeded (**100.0% success rate, 0 failed**) |
| **Sustained Throughput** | **4,929.8 req/s** | ~5,000 RPS sustained directly against PostgreSQL 16 |
| **Estimated Active Humans** | **~49,300 users** | Concurrent human user equivalents with 100ms think time |
| **HTTP Status Matrix** | **97,590 `200` / 2,013 `201`** | **0 errors (0 timeouts, 0 resets, 0 5xx)** |
| **Cryptographic Token Auth** | **Active** | Native `Bun.CryptoHasher` Bearer verification on every journey |
| **MicroVM CPU Utilization** | **26.1% avg / 61.3% peak** | Only 0.52 cores avg used — **74% CPU headroom remaining!** |
| **MicroVM Memory Footprint** | **79 MB peak (3.9% of RAM)** | **-78% memory reduction** compared to Bun 1.4.2 |
| **Event Loop Lag** | **0.16 ms avg / 0.30 ms p95** | Practically zero event-loop starvation |

---

### ⏱️ Latency Percentiles & Coordinated Omission Analysis

| Percentile | Raw Server Round-Trip | Coordinated Omission (CO) Corrected | User Experience |
| :---: | :---: | :---: | :--- |
| **p50 (Median)** | **78.02 ms** | **78.02 ms** | Instant interactive mobile response |
| **p75** | **94.04 ms** | **94.04 ms** | Sub-100ms fluid scrolling threshold |
| **p90** | **111.29 ms** | **111.29 ms** | Under heavy concurrent writes & joins |
| **p95** | **127.39 ms** | **127.39 ms** | Consistent sub-130ms mobile SLA under 1,000 VUs |
| **p99** | **234.73 ms** | **234.73 ms** | Direct PostgreSQL 16 tail latency (no cache) |
| **Min / Max / Avg** | **9.31 ms / 2892 ms / 75.91 ms** | Consistent response distribution across all actions |

---

### 📈 Workload Breakdown (10 Realistic Social App Actions)

| Action | Share | Total Volume | Avg Latency | HTTP Success Rate |
| :--- | :---: | :---: | :---: | :---: |
| **Home Timeline Scroll** (Follower Graph Join) | **40.1%** | 39,900 | 75.77 ms | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | **19.8%** | 19,765 | 75.38 ms | 100% (200 OK) |
| **Stories Tray Fetch** (24h Ephemeral Filter) | **12.1%** | 12,029 | 72.38 ms | 100% (200 OK) |
| **Profile & 12-Photo Grid** (`Promise.all`) | **8.1%** | 8,082 | 76.23 ms | 100% (200 OK) |
| **Read Post Comments** (Keyset Pagination) | **4.9%** | 4,885 | 71.29 ms | 100% (200 OK) |
| **Double-Tap Likes** (Atomic CTE Write) | **5.0%** | 4,962 | 79.44 ms | 100% (200 OK) |
| **Search Discovery** (GIN Trigrams) | **4.0%** | 3,992 | 80.13 ms | 100% (200 OK) |
| **Save / Bookmark Post** (Atomic Bookmark Toggle) | **1.9%** | 1,934 | 84.35 ms | 100% (200 OK) |
| **Follow Creator** (Graph Mutation + Counters) | **2.0%** | 2,041 | 84.11 ms | 100% (200 OK) |
| **Post Comment** (Atomic CTE Write) | **2.0%** | 2,013 | 81.37 ms | 100% (201 Created) |

---

### 💡 Key Takeaways on Architecture & Capacity
* **~5,000 RPS on 2 vCPUs:** Completed **99,603 requests in 20.2 seconds** with 100% success rate across 1,000 concurrent virtual users.
* **Extreme Memory Efficiency with Bun 1.4.3:** Peak memory dropped from **356 MB to just 79 MB** (3.9% of the 2 GB container RAM), leaving 96% free.
* **Over 70% CPU Headroom:** Average CPU utilization sits at **26.1% (0.52 cores)**, proving that the microVM has room to push beyond 1,500+ concurrent virtual users before CPU saturation.
* **Direct to PostgreSQL:** Every single write and read hits Managed PostgreSQL 16 **without Redis or an intermediate caching layer**.

---

## 🛠️ Developer Scripts & CLI Commands

### Routine Scripts
```bash
# Typecheck with TypeScript
bun run typecheck

# Lint with Oxlint
bun run lint

# Warm up API, Database, and Loadgen microVMs
bun run warmup

# Run all endpoint smoke tests
bun run test:endpoints

# Run 1,000-user benchmark (configurable via flags or env vars)
bun run benchmark
# or: bun run scripts/run-benchmark.ts --users=1000 --duration=20 --rampUp=5

# Deploy specific stacks to InstaCloud
bun run deploy:hono
bun run deploy:elysia
bun run deploy:express
bun run deploy:fastify
```

### InstaCloud CLI Commands
```bash
# View deployment and linked project status
bunx insta status

# View live container compute logs
bunx insta compute logs api-bun-hono

# Check real-time resource utilization
bunx insta compute metrics api-bun-hono

# Trigger loadgen benchmark via direct HTTP call
curl "https://<loadgen-url>/run?users=1000&duration=20&rampUpSec=5&thinkTimeMs=100&useAuth=true"
```
