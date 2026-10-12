# ⚙️ Technical Specifications & Implementation Details

This document covers the deep technical architecture, schema specifications, full API routing table, and performance modeling details for the high-throughput social media benchmark.

---

## 🏗️ Architecture & Infrastructure

* **Platform:** [InstaCloud](https://instacloud.com) (`prod` environment, `us-east-1`)
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d` (Branch: `main`)
* **Live Service Endpoints:**
  * **Bun 1.4.3 + Hono:** `https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com`
  * **Node.js 26 + Express:** `https://prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com`
  * **Node.js 26 + Fastify:** `https://prod-main-api-node-fastify-40cc97-00wsycas21e.compute.instacloud-edge.com`
  * **Distributed Load Generator:** `https://prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com`

### Provisioned Hardware Topology

| Service | Type | Specs / Limits | Role & Configuration |
| :--- | :--- | :--- | :--- |
| **`api-bun-hono`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Bun 1.4.3 + Hono (`WEB_CONCURRENCY=1`) |
| **`api-node-express`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Node.js 26.11 + Express 5 (`WEB_CONCURRENCY=1`) |
| **`api-node-fastify`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Node.js 26 + Fastify 5.12.5 (`WEB_CONCURRENCY=1`) |
| **`loadgen`** | Compute MicroVM | 2 vCPU / 2 GB RAM | Distributed realistic load generator |
| **`db`** | Managed PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB Storage | Relational store (`us-east-1`) |

> **Constraint Design:** Both API microVMs are strictly pinned to **1 vCPU / 1 GB** (`VCPU_COUNT=1`, `MICROVM_RAM_MB=1024`, `WEB_CONCURRENCY=1`). The load generator and PostgreSQL instance run at 2 vCPU / 2 GB to ensure the application microVM is always the single resource bottleneck.

### Fastify 5.12.5 Stack Configuration

The Fastify stack is engineered to the same standard as the Express stack. Parity decisions:

* **Version choice:** Fastify **5.12.5** (stable). The v6 line is still alpha and its headline change — dropping `fast-json-stringify` for native `JSON.stringify` — is already achieved here without any response schemas, so v5 delivers the v6 serialization profile with none of the pre-release risk.
* **Router:** `find-my-way` (v9), reached through encapsulated plugins registered with a `prefix` per route group (`app.register(feedRoutes, { prefix: '/api/feed' })`), mirroring Express's `Router()` sub-apps.
* **Origin timing via `serverFactory`:** Fastify's `onSendEnd()` calls `safeWriteHead()` *before* `res.end()` (see `fastify/lib/reply.js`), so the `Server-Timing: origin;dur=` header must be injected by wrapping `res.writeHead` — an `res.end` wrapper guarded on `!res.headersSent` never fires. Exactly **one** method wrap per request, matching the single `res.end` wrap the Express stack uses, so neither stack pays an interception the other avoids.
* **Query parsing:** left at Fastify's default native `querystring.parse`, the equivalent of Express's `query parser: simple`.
* **Logging:** `logger: false`. Fastify ships Pino, which logs and serialises both request and response on every hit by default; Express pays nothing, so leaving it on would be an unfair penalty.
* **Serialization:** no `response` schemas are declared on any route, so Fastify serialises via native `JSON.stringify` — the same path used by `res.json()`, Hono's `c.json()`, and Elysia.
* **Body parsing:** Fastify natively skips content-type parsing when a request carries no body, so GET/HEAD/OPTIONS (89% of the workload) allocate no parser or buffer — matching the Express stack's selective parsing with no extra branch on the hot path.
* **Envelope:** identical `UV_THREADPOOL_SIZE=2`, `NODE_OPTIONS="--max-old-space-size=768"`, `keepAliveTimeout=65000`, `headersTimeout=66000`, `requestTimeout=0`.

---

## 📦 Runtime Optimizations & Implementation Details

* **Bun 1.4.3 Runtime:** Built on Bun's rewritten **Rust core** paired with the updated JavaScriptCore (JSC) engine and jemalloc-based memory allocator.
* **Concurrency Isolation:** Single dedicated worker process (`WEB_CONCURRENCY=1`) per microVM. No cluster IPC and no `SO_REUSEPORT` socket round-robin, ensuring pure single-core evaluation.
* **Cryptography:** Native Zig/BoringSSL `Bun.CryptoHasher('sha256')` for Bearer token verification with constant-time comparison (`crypto.timingSafeEqual`) and in-memory token cache.
* **Database Driver (`postgres.js v3.4`):**
  * Pool size: `max: 25` (capped per single worker process).
  * Idle timeout: `20s`.
  * Prepared statements: `true` for all queries.
  * Atomic writes: Single-roundtrip Common Table Expressions (CTEs) for state updates (e.g. inserting likes and incrementing counters in one roundtrip).
* **Multi-Stack Directory Structure:**
  * `src/shared/`: Shared PostgreSQL queries, HMAC authentication, and Linux cgroup telemetry samplers.
  * `src/bun-hono/`: Reference Bun 1.4.3 + Hono implementation.
  * `src/bun-elysia/`: Bun 1.4.3 + Elysia implementation.
  * `src/node-express/`: Node.js 26.11 + Express 5 implementation.
  * `src/node-fastify/`: Node.js 26 + Fastify 5.12.5 implementation.
* **Container Packaging:** Multi-stage Alpine container builds with unprivileged non-root users (`bun` / `node`).

---

## 🗄️ Database Schema & Index Design

The managed PostgreSQL 16 database is pre-seeded with realistic production-scale data:

* **`users`** (5,000 rows): `id`, `username`, `display_name`, `avatar_url`, `bio`, `followers_count`, `following_count`, `posts_count`, `created_at`
* **`posts`** (50,000+ rows): `id`, `user_id` (FK), `image_url`, `caption`, `likes_count`, `comments_count`, `created_at`
* **`likes`** (133,000+ rows): `id`, `user_id` (FK), `post_id` (FK), `created_at` (Unique pair)
* **`follows`** (152,000+ rows): `follower_id`, `following_id`, `created_at` (Power-law influencer graph)
* **`comments`** (26,000+ rows): `id`, `post_id` (FK), `user_id` (FK), `content`, `created_at`
* **`stories`** (2,700+ active rows): `id`, `user_id` (FK), `media_url`, `created_at`, `expires_at` (24-hour TTL)
* **`saved_posts`** (9,800+ rows): `user_id` (FK), `post_id` (FK), `created_at` (Private bookmarks)

### Index Architecture

```sql
-- Keyset cursor lookup for home feed fan-in
CREATE INDEX idx_posts_user_id_id ON posts (user_id, id DESC);

-- Explore feed sorting by engagement
CREATE INDEX idx_posts_likes_id ON posts (likes_count DESC, id DESC);

-- Reverse follow graph lookup
CREATE INDEX idx_follows_following_id ON follows (following_id);

-- Post comments cursor pagination
CREATE INDEX idx_comments_post_id ON comments (post_id, id DESC);

-- Ephemeral stories 24h filter
CREATE INDEX idx_stories_user_created ON stories (user_id, created_at DESC);

-- User saved bookmarks lookup
CREATE INDEX idx_saved_posts_user ON saved_posts (user_id, created_at DESC);

-- Trigram substring and prefix search
CREATE INDEX idx_posts_caption_trgm ON posts USING gin (lower(caption) gin_trgm_ops);
CREATE INDEX idx_users_display_name_trgm ON users USING gin (lower(display_name) gin_trgm_ops);
CREATE INDEX idx_users_username_trgm ON users USING gin (lower(username) gin_trgm_ops);
```

---

## 🚀 Complete API Routing Directory

| Endpoint | Method | Auth | Description |
| :--- | :--- | :---: | :--- |
| `/` | `GET` | Public | Service metadata & directory |
| `/health` | `GET` | Public | Healthcheck, DB ping latency, process memory |
| `/api/telemetry` | `GET` | Public | Live container CPU %, RSS, event loop lag |
| `/api/telemetry/reset` | `POST` | Public | Reset telemetry sample windows |
| `/api/auth/token` | `POST` | Public | Generate HMAC-SHA256 Bearer authorization token |
| `/api/feed/home` | `GET` | Bearer | Keyset cursor timeline from followed accounts |
| `/api/feed/explore` | `GET` | Bearer | Popularity-ranked discovery feed |
| `/api/feed` | `GET` | Bearer | Reverse-chronological timeline |
| `/api/stories/tray` | `GET` | Bearer | Active 24h stories tray from followed users |
| `/api/stories` | `POST` | Bearer | Publish new ephemeral story |
| `/api/users/:id` | `GET` | Bearer | User profile & 12-photo grid (`Promise.all`) |
| `/api/users/:id/saved` | `GET` | Bearer | Private bookmarked posts collection |
| `/api/users/:id/follow` | `POST` | Bearer | Toggle follow / unfollow graph relationship |
| `/api/posts` | `POST` | Bearer | Create new photo post |
| `/api/posts/:id/like` | `POST` | Bearer | Atomic CTE like toggle and counter increment |
| `/api/posts/:id/comments` | `GET` | Bearer | Keyset paginated post comments |
| `/api/posts/:id/comments` | `POST` | Bearer | Atomic CTE comment insert and counter increment |
| `/api/posts/:id/save` | `POST` | Bearer | Toggle private bookmark |
| `/api/search` | `GET` | Bearer | GIN trigram prefix/keyword search across users & posts |

---

## 📉 Capacity Dynamics & Queueing Theory

Under closed-loop testing ($N$ concurrent virtual users, think time $Z$, service response time $R$, throughput $X$), the system is governed by the **Interactive Response Time Law**:

$$X = \frac{N}{R + Z}$$

When scaling from 1,000 to 2,000 virtual users against the single-core microVM:

| Metric | 1,000 VUs | 2,000 VUs | Impact |
| :--- | ---: | ---: | :---: |
| Throughput ($X$) | 5,451.3 req/s | 5,711.2 req/s | +4.8% (service capacity ceiling reached) |
| Latency p50 ($R$) | 57.62 ms | 217.01 ms | +276% (socket & connection queueing) |
| API CPU (avg) | 79.5% | 80.5% | Headroom preserved |
| DB Active Connections | 24 | 6 | DB idle; bottleneck strictly at compute |

Because each virtual user blocks until the HTTP response returns before sleeping for $Z = 100\text{ ms}$, exceeding the single-core processing capacity causes additional concurrency to accumulate in the TCP socket backlog, directly inflating round-trip latency without increasing throughput.

---

## 🛠️ Complete Scripts Reference

```bash
# Type checking & linting
bun run typecheck
bun run lint

# Warmup routines (cleans mutations, opens pools, resets telemetry)
bun run warmup hono
bun run warmup elysia
bun run warmup express
bun run warmup fastify

# Smoke tests
bun run test hono
bun run test elysia
bun run test express
bun run test fastify

# Single stack benchmark
bun run benchmark hono
bun run benchmark elysia
bun run benchmark express
bun run benchmark fastify

# Repeat per stack to compare in a single session
bun run benchmark hono
bun run benchmark elysia
bun run benchmark express
bun run benchmark fastify

# Database maintenance
bun run db:clean
bun run db:migrate
bun run db:seed
```
