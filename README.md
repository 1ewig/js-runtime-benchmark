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

### Provisioned Services (1 vCPU / 1 GB API MicroVM Tier)

| Service | Type | Specs / Limits | Purpose |
| :--- | :--- | :--- | :--- |
| **`api-bun-hono`** | Compute (MicroVM) | 1 vCPU / 1 GB RAM | Reference Bun 1.4.3 + Hono HTTP server |
| **`api-node-express`** | Compute (MicroVM) | 1 vCPU / 1 GB RAM | Node.js 26.11 (Latest) + Express 5 server |
| **`loadgen`** | Compute (MicroVM) | 2 vCPU / 2 GB RAM | Dedicated distributed realistic load generator |
| **`db`** | PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB Storage | Managed relational database (`us-east-1`) |

> Both API microVMs are pinned to the **1 vCPU / 1 GB** tier with `VCPU_COUNT=1`, `MICROVM_RAM_MB=1024` and `WEB_CONCURRENCY=1`. The generator and the database run at 2 vCPU / 2 GB, so the measured applications are deliberately the smallest resource in the path.

---

## 📦 Technology Stack & Runtime Optimizations

* **Runtime:** [Bun v1.4.3](https://bun.sh) (Linux x64 container / Windows local development) — built on Bun's rewritten **Rust core** with upgraded JavaScriptCore (JSC) engine and ultra-lean memory allocator.
* **Concurrency Model:** Single dedicated worker process per microVM (`WEB_CONCURRENCY=1`) on the 1 vCPU / 1 GB tier — no cluster IPC and no `SO_REUSEPORT` socket distribution, so measurements are pure single-core behaviour.
* **Framework:** [Hono v4.13](https://hono.dev) — ultra-fast, lightweight web framework.
* **Cryptography:** Native Zig/BoringSSL `Bun.CryptoHasher('sha256')` for Bearer token verification with constant-time validation (`crypto.timingSafeEqual`) and fast in-memory token cache.
* **Database Driver:** [`postgres.js v3.4`](https://github.com/porsager/postgres) with tuned connection pooling:
  * Pool Size: `max: 25` (single worker — 25 connections total)
  * Idle Timeout: `20s`
  * Prepared Statements: `true`
  * Write Execution: Atomic single-roundtrip Common Table Expressions (CTEs)
* **Modular Multi-Stack Architecture:**
  * `src/shared/`: Shared PostgreSQL queries, HMAC authentication, and Linux cgroup telemetry samplers.
  * `src/bun-hono/`: Production Bun 1.4.3 + Hono implementation.
  * `src/bun-elysia/`: Scaffolding for Bun + Elysia stack.
  * `src/node-express/`: Production Node.js 26.11 (Latest) + Express 5 implementation.
  * `src/node-fastify/`: Scaffolding for Node.js 26 + Fastify stack.
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

## 📊 Benchmark Results — 1 vCPU / 1 GB MicroVM Tier (1 Dedicated Worker)

Simulating full human mobile app journeys with **HMAC-SHA256 Token Authentication**, **stateful keyset cursor pagination**, and **power-law influencer profile distributions** executed from the dedicated `loadgen` microVM over the datacenter network across **10 concurrent user interactions**.

Both API microVMs run the **1 vCPU / 1 GB** tier with a single dedicated worker, measured at **1,000 virtual users, 100 ms think time, 5 s ramp + 20 s sustained**, against a **warm** database and JIT-compiled routes.

> **Run conditions matter.** These figures require a warm environment. During one measured run the database was observed taking **7,296 ms** to wake from suspended; a benchmark started against a waking database measures cold-start cost, not steady-state throughput. Always run `bun run warmup` first.

| Metric | ⚡ Bun 1.4.3 + Hono | 🟢 Node.js 26.11.1 + Express | Delta / Impact |
| :--- | :---: | :---: | :--- |
| **MicroVM Hardware Tier** | **1 vCPU / 1 GB RAM** | **1 vCPU / 1 GB RAM** | Strict single-core constraint |
| **Worker Concurrency** | **1 Worker (PID 1)** | **1 Worker (PID 1)** | No cluster IPC, no `SO_REUSEPORT` |
| **Total Requests Completed** | **109,907** | **88,624** | **Bun completed +21,283 more** |
| **Sustained Throughput** | 🏆 **5,451.3 req/sec** | **4,361.7 req/sec** | **Bun +25.0%** |
| **Average CPU Utilization** | 🏆 **79.5% (0.80 cores)** | 🔥 **98.4% (0.98 cores)** | **Node pinned the single core** |
| **Peak CPU Utilization** | **100.0%** (bursts) | **100.0%** (pinned) | Bun kept ~20% average headroom |
| **Peak Memory (RSS)** | 🏆 **87 MB (8.5% of RAM)** | **178 MB (17.4% of RAM)** | **Bun 2.05x leaner** |
| **Event Loop Lag (p95)** | 🏆 **2.97 ms** | 🔥 **15.59 ms** | **Node 5.2x higher** |
| **Median Latency (p50)** | 🏆 **57.62 ms** | **101.76 ms** | **Bun −43.4%** |
| **p75 Latency** | 🏆 **76.37 ms** | **114.31 ms** | Bun −33.2% |
| **p95 Latency** | 🏆 **96.29 ms** | **139.26 ms** | Bun −30.9% |
| **p99 Tail Latency** | 🏆 **123.77 ms** | **192.19 ms** | Bun −35.6% |
| **Average Latency** | 🏆 **59.82 ms** | **98.92 ms** | Bun −39.5% |
| **Success Rate** | **100.0%** (0 errors) | **100.0%** (0 errors) | 0 failures, 0 timeouts, 0 resets |

**The headline:** Node reached **98.4% average CPU — effectively saturated — and still finished 25% slower**, using 2.05x the memory and 5.2x the event-loop stall. Bun completed more work while leaving a fifth of the core idle.

> **Statistical note.** Node was measured twice; it produced 4,144.6 and 4,361.7 req/sec (~5% spread). Bun has a single run at this tier. The direction is consistent across every run captured, but treat the throughput delta as ~20–25% rather than an exact figure.

---

### 📈 Workload Breakdown (10 Realistic Social App Actions)

| Action | Share | Total Volume | Avg Latency (Bun) | Avg Latency (Node) | Success Rate |
| :--- | :---: | :---: | :---: | :---: | :--- |
| **Home Timeline Scroll** (Follower Graph Join) | **39.9%** | 43,849 | 59.83 ms | 97.92 ms | 100% (200 OK) |
| **Explore Discovery** (Popularity Sort) | **20.0%** | 21,997 | 58.89 ms | 98.04 ms | 100% (200 OK) |
| **Stories Tray Fetch** (24h Ephemeral Filter) | **12.0%** | 13,232 | 58.02 ms | 97.22 ms | 100% (200 OK) |
| **Profile & 12-Photo Grid** (`Promise.all`) | **8.0%** | 8,775 | 60.37 ms | 99.08 ms | 100% (200 OK) |
| **Read Post Comments** (Keyset Pagination) | **5.0%** | 5,479 | 56.73 ms | 97.51 ms | 100% (200 OK) |
| **Double-Tap Likes** (Atomic CTE Write) | **5.1%** | 5,553 | 60.57 ms | 99.13 ms | 100% (200 OK) |
| **Search Discovery** (GIN Trigrams) | **4.0%** | 4,409 | 64.87 ms | 100.39 ms | 100% (200 OK) |
| **Save / Bookmark Post** (Atomic Bookmark Toggle) | **2.0%** | 2,229 | 67.67 ms | 123.99 ms | 100% (200 OK) |
| **Follow Creator** (Graph Mutation + Counters) | **2.0%** | 2,201 | 64.84 ms | 111.29 ms | 100% (200 OK) |
| **Post Comment** (Atomic CTE Write) | **2.0%** | 2,183 | 60.18 ms | 99.19 ms | 100% (201 Created) |

Read paths stay near 57–61 ms on Bun; the two write-heavy toggles (`save`, `follow`) are the most expensive on both stacks, and `save` is where Node degrades hardest — **123.99 ms vs 67.67 ms**, an 83% penalty.

---

### 🎯 Loadgen Control — Is the Generator Itself the Bottleneck?

Every run records the load generator's own condition, so a generator-bound result can never be mistaken for a server-bound one.

| Run | Loop Lag avg / p95 / max | Peak RSS | Cadence Delay | Verdict |
| :--- | :---: | :---: | :---: | :--- |
| Bun — 1,000 VUs | 0.53 / 1.16 / 3.7 ms | 89 MB | 0 ms | ✅ healthy |
| Bun — 2,000 VUs | 0.61 / 1.18 / 18.3 ms | 111 MB | 0 ms | ✅ healthy |
| Node — 1,000 VUs | 0.42 / 1.04 / 2.3 ms | 94 MB | 0 ms | ✅ healthy |
| Node — 1,000 VUs (rerun) | 0.45 / 1.04 / 2.9 ms | 97 MB | 0 ms | ✅ healthy |

The generator flags itself unhealthy at **25 ms p95 loop lag**. It measured **~1 ms** — roughly **24x under the threshold** — at every load level. `Client Cadence Delay` of **0 ms** confirms all 1,000 virtual users dispatched precisely on schedule and none queued behind the harness.

**PostgreSQL was sampled live during the runs and is also not the constraint:**

| Metric | Observed | Available |
| :--- | :---: | :---: |
| Peak active connections | **24** | 100 |
| Cache hit ratio | **99.98%** | — |

The database was serving almost entirely from shared buffers and never came close to connection exhaustion.

---

### 📉 Harness Ceiling — Where Throughput Actually Stops

Doubling the virtual users reveals the shape of the curve:

| | 1,000 VUs | 2,000 VUs | Change |
| :--- | ---: | ---: | :---: |
| Throughput | 5,451.3 rps | 5,711.2 rps | **+4.8%** |
| p50 latency | 57.62 ms | 217.01 ms | **+276%** |
| API event loop lag (p95) | 2.97 ms | 0.19 ms | — |
| API CPU (avg) | 79.5% | 80.5% | +1.0 pt |
| DB active connections | 24 | 6 | −18 |

**Double the load bought 4.8% more throughput and tripled latency.** Meanwhile the application event loop stayed responsive and database connections actually *fell*. The queue is therefore in neither the app nor the database — it sits at the **HTTP connection layer** between the generator and the microVM's edge gateway.

This means the harness tops out near **5,700 req/sec** regardless of how fast the application is. **These results are an efficiency comparison, not a maximum-throughput comparison** — neither stack reached that ceiling, which is the correct regime for comparing CPU cost per request.

---

### 💡 Key Architectural Insights

1. **Compute efficiency is the real story.** On an identical single core, Bun completed **109,907** requests to Node's **88,624** (+25% throughput) while averaging **79.5% CPU against Node's 98.4%**. Node was saturated and still slower — it converts CPU into completed requests less effectively.
2. **Event-loop starvation compounds.** Node's **15.59 ms p95** event-loop lag against Bun's **2.97 ms** is why its latency tails worsen disproportionately. At 1,000 concurrent users even a few milliseconds of stall per event loop turns into visible queueing.
3. **Memory economy is consistent.** Bun's Rust allocator holds peak RSS at **87 MB (8.5%)** of the 1 GB microVM; Node's V8 heap settles at **178 MB (17.4%)** — a **2.05x** difference on the same workload.
4. **Cost translation.** Bun sustains its full measured workload on the budget **1 vCPU / 1 GB** tier while retaining headroom. Node pins that same core at 98.4%, leaving no margin for traffic growth without resizing.
5. **Direct to PostgreSQL.** Every read and write hits managed PostgreSQL 16 with **no Redis or cache layer** — the 99.98% cache hit ratio is PostgreSQL's own shared buffers doing the work.

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

# Inspect / adjust microVM hardware limits (current tier: 1 vCPU / 1 GB)
bunx insta compute limits api-bun-hono --cpu 1 --memory 1gb
bunx insta compute limits api-node-express --cpu 1 --memory 1gb

# Sample database saturation while a benchmark runs (read-only)
bunx insta postgres stats db --json

# View live container compute logs
bunx insta compute logs api-bun-hono
bunx insta compute logs api-node-express

# Check real-time resource utilization
bunx insta compute metrics api-bun-hono
bunx insta compute metrics api-node-express

# Trigger loadgen benchmark via direct HTTP call
curl "https://<loadgen-url>/run?users=1000&duration=20&rampUpSec=5&thinkTimeMs=100&useAuth=true"
```
