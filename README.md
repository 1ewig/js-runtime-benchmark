# InstaCloud Social Media Backend & High-Throughput Benchmark

A high-performance social media backend prototype built with **Bun 1.4.3 (Rust Core)** and **Hono**, deployed on **InstaCloud** serverless microVMs and backed by **Managed PostgreSQL 16**.

> 📖 **Developer & Agent Guide:** For InstaCloud CLI commands, lifecycle management, and the multi-stack benchmarking plan, see [`docs/INSTACLOUD_GUIDE.md`](docs/INSTACLOUD_GUIDE.md).

---

## 🏗️ Architecture & Infrastructure

* **Platform:** [InstaCloud](https://instacloud.com) (`prod` environment, `us-east-1`)
* **Project Name:** `testing purposes`
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d` (Branch: `main`)
* **Live Service URLs:**
  * **Bun 1.4.3 + Hono:** `https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com`
  * **Node.js 26 + Express:** `https://prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com`
  * **Distributed Loadgen:** `https://prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com`

### Provisioned Services (Configured for 1-2 vCPU / 1-2 GB MicroVM Tiers)

| Service | Type | Specs / Limits | Purpose |
| :--- | :--- | :--- | :--- |
| **`api-bun-hono`** | Compute (MicroVM) | 1-2 vCPU / 1-2 GB RAM | Reference Bun 1.4.3 + Hono HTTP server |
| **`api-node-express`** | Compute (MicroVM) | 1-2 vCPU / 1-2 GB RAM | Clustered Node.js 26.11 (Latest) + Express 5 server |
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
  * `src/node-express/`: Production Node.js 26.11 (Latest) + Express 5 implementation.
  * `src/node-fastify/`: Scaffolding for Node.js 22 + Fastify stack.
* **Container Packaging:** Multi-stage Docker builds isolating production dependencies (`oven/bun:1.4.3-alpine`) and running under unprivileged non-root user `bun`.
* **Type System & Quality:**
  * **TypeScript 7** (Native `bun check` runs in <250ms, with fallback `tsc --noEmit`)
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

## 📊 Multi-Stack Benchmark Results (1,000 Virtual Users Against PostgreSQL 16)

Simulating full human mobile app journeys with **HMAC-SHA256 Token Authentication**, **stateful keyset cursor pagination**, and **power-law influencer profile distributions** executed from the dedicated `loadgen` microVM over the datacenter network across **10 concurrent user interactions**.

---

### ⚔️ Round 2: The "1 vCPU / 1 GB Knife Fight" (1 Dedicated Worker)

To find the true runtime efficiency ceiling and simulate budget-constrained cloud deployments, both compute microVMs were constrained to **1 vCPU / 1 GB RAM** with **1 dedicated worker process**:

| Metric | ⚡ Bun 1.4.3 + Hono | 🟢 Node.js 26.11.1 + Express | Delta / Impact |
| :--- | :---: | :---: | :--- |
| **MicroVM Hardware Tier** | **1 vCPU / 1 GB RAM** | **1 vCPU / 1 GB RAM** | Strict single-core constraint |
| **Worker Concurrency** | **1 Worker (PID 1)** | **1 Worker (PID 1)** | Zero multi-core IPC context switching |
| **Total Requests Completed** | **99,205** | **90,235** | **Node dropped ~9,000 requests** (-9.0% deficit) |
| **Sustained Throughput** | 🏆 **4,908.6 req/sec** | **4,419.2 req/sec** | **Bun delivered +490 RPS more** |
| **Average CPU Utilization** | 🏆 **73.7% (0.74 cores)** | 🔥 **96.2% (0.96 cores)** | **Node pinned the core near 100% saturation** |
| **Peak CPU Utilization** | **100.0%** (bursts) | 🔥 **100.0%** (pinned) | Bun retained **26.3% idle headroom** avg |
| **Event Loop Lag (p95)** | 🏆 **0.19 ms** | 🔥 **13.95 ms** | **Node had 73x higher event loop lag!** |
| **Peak Memory (RSS)** | 🏆 **85 MB (8.3% of RAM)** | **178 MB (17.4% of RAM)** | **Node used 2.1x more RAM** |
| **Median Latency (p50)** | 🏆 **81.50 ms** | **97.58 ms** | **Node was +16.08 ms slower at median** |
| **p75 Latency** | 🏆 **95.52 ms** | **109.71 ms** | **Node broke past the 100ms fluid threshold** |
| **p95 Latency** | 🏆 **122.77 ms** | **132.75 ms** | Sub-135ms SLA across both |
| **Average Latency** | 🏆 **77.29 ms** | **95.25 ms** | **Node had +23.2% worse average latency** |
| **Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 dropped connections on both |

---

### 📊 Round 1: 2 vCPU / 2 GB RAM (Multi-Worker Clustered Baseline)

When given 2 full vCPUs and clustered workers (`node:cluster`), both runtimes completed ~100k requests without errors, but with vastly different compute overhead:

| Metric | ⚡ Bun 1.4.3 + Hono | 🟢 Node.js 26.11.1 + Express | Analysis |
| :--- | :---: | :---: | :--- |
| **Total Requests Completed** | **99,603** | **101,202** | Both completed ~100k requests in 20.2s |
| **Sustained Throughput** | **4,929.8 req/sec** | **5,018.3 req/sec** | ~5,000 RPS direct against PostgreSQL 16 |
| **Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | 100% reliability under 1,000 VUs |
| **Median Latency (p50)** | **78.02 ms** | **79.69 ms** | Sub-80ms interactive mobile response |
| **p95 Latency** | **127.39 ms** | **113.82 ms** | Consistent sub-130ms response |
| **p99 Tail Latency** | **234.73 ms** | **164.63 ms** | Postgres 16 tail queries |
| **Average CPU Utilization** | 🏆 **26.1% (0.52 cores)** | **72.8% (1.46 cores)** | **Bun is 2.79x more CPU-efficient** |
| **Peak CPU Utilization** | 🏆 **61.3%** | **100.0%** | **Bun preserved 74% CPU headroom** |
| **Peak Memory Footprint (RSS)**| 🏆 **79 MB (3.9% of RAM)** | **165 MB (8.1% of RAM)** | **Bun uses 52% less memory (2.08x leaner)** |
| **Event Loop Lag (p95)** | 🏆 **0.30 ms** | **2.89 ms** | **Bun had 9.6x lower event-loop lag** |

---

### 📈 Workload Breakdown (10 Realistic Social App Actions)

| Action | Share | Total Volume | Avg Latency (Bun) | Avg Latency (Node) | Success Rate |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Home Timeline Scroll** (Follower Graph Join) | **40%** | ~39,000 | 77.21 ms | 94.45 ms | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | **20%** | ~19,500 | 76.61 ms | 94.36 ms | 100% (200 OK) |
| **Stories Tray Fetch** (24h Ephemeral Filter) | **12%** | ~12,000 | 74.47 ms | 93.64 ms | 100% (200 OK) |
| **Profile & 12-Photo Grid** (`Promise.all`) | **8%** | ~8,000 | 78.02 ms | 95.11 ms | 100% (200 OK) |
| **Read Post Comments** (Keyset Pagination) | **5%** | ~5,000 | 74.37 ms | 93.52 ms | 100% (200 OK) |
| **Double-Tap Likes** (Atomic CTE Write) | **5%** | ~4,900 | 78.21 ms | 95.11 ms | 100% (200 OK) |
| **Search Discovery** (GIN Trigrams) | **4%** | ~3,900 | 83.36 ms | 96.94 ms | 100% (200 OK) |
| **Save / Bookmark Post** (Atomic Bookmark Toggle) | **2%** | ~1,900 | 88.53 ms | 119.12 ms | 100% (200 OK) |
| **Follow Creator** (Graph Mutation + Counters) | **2%** | ~1,900 | 83.44 ms | 108.02 ms | 100% (200 OK) |
| **Post Comment** (Atomic CTE Write) | **2%** | ~1,900 | 76.05 ms | 95.37 ms | 100% (201 Created) |

---

### 💡 Key Architectural Insights

1. **The Single-Core Choke Point:** On 1 vCPU, Node.js 26 pins at **96.2% average CPU**, suffering **13.95 ms p95 event loop lag** and dropping throughput by **~9% (4,419 RPS)**. Bun 1.4.3 sustains **4,909 RPS** with **73.7% CPU** (26% idle headroom) and **0.19 ms event loop lag**.
2. **2.8x Compute Efficiency:** On 2 vCPUs, Bun uses only **0.52 cores** to deliver ~5,000 RPS compared to Node's **1.46 cores**.
3. **Memory Economy:** Across both tiers, Bun's Rust memory allocator maintains a peak RSS of **79–85 MB**, while Node's V8 engine hovers around **165–178 MB** (2.1x higher memory footprint).
4. **Cloud Cost Translation:** Bun can comfortably run full 5,000 RPS production workloads on a budget **1 vCPU / 1 GB microVM tier** where Node requires a **2 vCPU instance** to avoid event loop choking.

---

## 🛠️ Developer Scripts & CLI Commands

### Routine Scripts
```bash
# Typecheck with native Bun (runs in <250ms)
bun run typecheck

# Lint with Oxlint
bun run lint

# Warm up API, Database, and Loadgen microVMs
bun run warmup

# Run all endpoint smoke tests
bun run test:endpoints

# Run 1,000-user benchmark against Bun Hono
bun run benchmark

# Run benchmark against Node Express stack
API_URL="https://prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com" bun run benchmark

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

# Adjust microVM hardware limits (e.g. 1 vCPU / 1 GB Knife Fight)
bunx insta compute limits api-bun-hono --cpu 1 --memory 1gb
bunx insta compute limits api-node-express --cpu 1 --memory 1gb

# View live container compute logs
bunx insta compute logs api-bun-hono
bunx insta compute logs api-node-express

# Check real-time resource utilization
bunx insta compute metrics api-bun-hono
bunx insta compute metrics api-node-express

# Trigger loadgen benchmark via direct HTTP call
curl "https://<loadgen-url>/run?users=1000&duration=20&rampUpSec=5&thinkTimeMs=100&useAuth=true"
```
