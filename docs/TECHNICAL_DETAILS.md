# ⚙️ Technical Specifications & Implementation Details

This document covers the deep technical architecture, stack parity matrix, authentication model, schema specifications, full API routing table, environment/telemetry configuration, and performance modeling details for the high-throughput social media benchmark.

---

## 🏗️ Architecture & Infrastructure

* **Platform:** [InstaCloud](https://instacloud.com) (`prod` environment, `us-east-1`)
* **Project ID:** `bb8545e1-fc83-4d22-938c-b91f5661d06d` (Branch: `main`)
* **Live Service Endpoints:**
  * **Bun 1.4.3 + Hono:** `https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com`
  * **Bun 1.4.3 + Elysia:** `https://prod-main-api-bun-elysia-a0dd1d-00bw66fwy72.compute.instacloud-edge.com`
  * **Node.js 26 + Express:** `https://prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com`
  * **Node.js 26 + Fastify:** `https://prod-main-api-node-fastify-40cc97-00wsycas21e.compute.instacloud-edge.com`
  * **Distributed Load Generator:** `https://prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com`

### Provisioned Hardware Topology

| Service | Type | Specs / Limits | Role & Configuration |
| :--- | :--- | :--- | :--- |
| **`api-bun-hono`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Bun 1.4.3 + Hono (`WEB_CONCURRENCY=1`) |
| **`api-bun-elysia`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Bun 1.4.3 + Elysia AOT (`WEB_CONCURRENCY=1`) |
| **`api-node-express`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Node.js 26 + Express 5 (`WEB_CONCURRENCY=1`) |
| **`api-node-fastify`** | Compute MicroVM | 1 vCPU / 1 GB RAM | Node.js 26 + Fastify 5.12.5 (`WEB_CONCURRENCY=1`) |
| **`loadgen`** | Compute MicroVM | 2 vCPU / 2 GB RAM | Distributed realistic load generator |
| **`db`** | Managed PostgreSQL 16 | 2 vCPU / 2 GB RAM, 10 GB Storage | Relational store (`us-east-1`) |

> **Constraint Design:** All four API microVMs are strictly pinned to **1 vCPU / 1 GB** (`VCPU_COUNT=1`, `MICROVM_RAM_MB=1024`, `WEB_CONCURRENCY=1`). The load generator and PostgreSQL instance run at 2 vCPU / 2 GB to ensure the application microVM is always the single resource bottleneck.

> **Node image note:** Node stacks build from the floating `node:current-alpine` tag, so the exact Node minor version is whatever `current` resolves to at image build time — re-check with `bunx insta compute logs <service>` after a deploy rather than trusting a hardcoded minor here.

---

## 🧩 Stack Matrix & Parity Engineering

Every stack implements the same 18 API endpoints (19 routes including `/`) against the same database with the same auth, pool, and telemetry code (`src/shared/`), then diverges only where the framework itself dictates. The tables below capture both the bill of materials and the per-concern parity decisions.

### Runtime & Package Versions

| Stack | Runtime | Framework | Router | HTTP server entry |
| :--- | :--- | :--- | :--- | :--- |
| `bun-hono` | Bun 1.4.3 (Rust core, JavaScriptCore, jemalloc) | Hono 4.13.13 | Hono default router (RegExpRouter) | `Bun.serve` → `app.fetch` |
| `bun-elysia` | Bun 1.4.3 (Rust core, JavaScriptCore, jemalloc) | Elysia 1.4.30 (`aot: true`) | Elysia AOT-compiled routes | Elysia `.listen()` (owns its own Bun server) |
| `node-express` | Node.js 26 (V8) | Express 5.3.0 | `express.Router()` sub-apps | `http.createServer` → `app(req, res)` |
| `node-fastify` | Node.js 26 (V8) | Fastify 5.12.5 | `find-my-way` 9.10.0 via prefixed plugins | `serverFactory` → `http.createServer` |

Shared across all four: **postgres.js 3.4.9** driver, `src/shared/{db,auth,telemetry}.ts`, and the identical SQL in each `routes/` directory.

### Parity Concern Matrix

| Concern | ⚡ Bun + Hono | 🦊 Bun + Elysia | 🟢 Node + Express | 🔵 Node + Fastify |
| :--- | :--- | :--- | :--- | :--- |
| **Origin timing** | Single `fetch` handler wrapping `app.fetch` — zero middleware onion | `onRequest` (stamp `t0`) + `onAfterHandle` (set `Server-Timing`) | Single `res.end` wrap at the raw `ServerResponse` | Single `res.writeHead` wrap inside `serverFactory` |
| **Query parsing** | Hono `c.req.query` | Elysia query parser | `query parser: simple` (native `querystring`, no recursive `qs`) | Native `querystring.parse` (Fastify default) |
| **Body parsing** | `c.req.json()` only when a route reads the body | `request.json()` only when a route reads the body | `express.json()` skipped for `GET`/`HEAD`/`OPTIONS` (89% of workload) | Natively skips parsing when the request carries no body |
| **JSON serialization** | `c.json()` → `JSON.stringify` | `mapResponse` → `JSON.stringify` | `res.json()` → `JSON.stringify` | No response schemas → native `JSON.stringify` |
| **Logging** | None | None | None (`x-powered-by` + `etag` disabled) | `logger: false` (Pino per-request logging disabled for parity) |
| **Worker model** | `WEB_CONCURRENCY=1`; `reusePort: true` on the server; `cluster` only forks when `>1` | `WEB_CONCURRENCY=1`; `reusePort: true`; `cluster` only forks when `>1` | `WEB_CONCURRENCY=1`; `cluster` only forks when `>1` (no `reusePort`) | `WEB_CONCURRENCY=1`; `cluster` only forks when `>1` (no `reusePort`) |
| **Server envelope** | `maxRequestBodySize` 10 MB, `idleTimeout` 30 s, `development: false` | Elysia defaults (it manages its own server — one of the benchmarked variables) | `keepAliveTimeout=65000`, `headersTimeout=66000`, `requestTimeout=0` | Identical keep-alive envelope to Express |
| **Container envelope** | `PORT=3000`, `VCPU_COUNT=1`, `MICROVM_RAM_MB=1024` | Identical | + `UV_THREADPOOL_SIZE=2`, `NODE_OPTIONS="--max-old-space-size=768"` | Identical to Express |

**Why the timing wraps differ (Fastify footnote):** Fastify's `onSendEnd()` calls `safeWriteHead()` *before* `res.end()` (see `fastify/lib/reply.js`), so the `Server-Timing: origin;dur=` header must be injected by wrapping `res.writeHead` — an `res.end` wrapper guarded on `!res.headersSent` never fires. Express instead flushes headers lazily on `res.end`. Either way it is exactly **one method wrap per request**, so neither Node stack pays an interception the other avoids, and both bypass the framework middleware/hook path entirely.

**Why Hono's timing is a `fetch` wrap:** A Koa-style `await next()` timing middleware allocates a Promise microtask frame per request; moving timing to the outer `Bun.serve` fetch handler removed that tax and lifted Hono from 3,839.9 to 5,216.6 req/s (+35.8%) — see [`BENCHMARK_RESULTS.md` §2.1](BENCHMARK_RESULTS.md).

---

## 🔐 Authentication & Request Pipeline

Implemented once in `src/shared/auth.ts` and shared by every stack (and mirrored by `loadgen/auth.ts`, which mints the tokens the APIs verify).

* **Token format:** `<userId>.<timestampMs>.<hmacHex>` — HMAC-SHA256 over `<userId>.<timestampMs>`.
* **Signing key:** `AUTH_SECRET`, a user secret set via `bunx insta secrets set AUTH_SECRET`. `src/shared/auth.ts` **throws at startup** when it is missing — there is deliberately no default fallback. Every API service and the loadgen must share the same value; a mismatch surfaces as `401`s across the board, not as a startup error.
* **Crypto paths:** Bun uses native `Bun.CryptoHasher('sha256')` (Zig/BoringSSL); Node stacks fall back to `crypto.createHmac('sha256', …)`.
* **Expiry:** tokens are rejected once older than **5 minutes** (`TOKEN_MAX_AGE_MS`), with a **30 s** allowance for clock skew between signer and verifier.
* **Verification:** length-checked then `crypto.timingSafeEqual` (constant-time) comparison.
* **Cache:** successful verifications land in an in-memory `Map` capped at **10,000** entries (cleared wholesale on overflow); a cache hit skips the HMAC entirely, and entries never outlive the token's own expiry. The loadgen rotates its token every 20 requests, exercising both the cache fast path (~95%) and full HMAC verification (~5%).

### Auth Semantics Per Route

**No endpoint hard-requires a Bearer token.** Verification runs only when an `Authorization: Bearer` header is actually present: an *invalid* token returns `401` on most routes, while an *absent* token falls back to `userId` from the query/body (defaulting to `1` on write routes). Routes in the API table below are marked accordingly:

* **`Public`** — no auth code is ever invoked.
* **`Optional¹`** — header checked if present; otherwise query/body `userId` fallback.
* **`None`** — no verification path exists at all.

¹ Exception: `GET /api/stories/tray` silently **ignores** an invalid token instead of returning `401` (`src/*/routes/stories.ts`) — an inconsistency kept for workload fidelity, not a security model to copy.

The loadgen deliberately calls the `None` routes unauthenticated and the `Optional` routes with a real token (`loadgen/journey.ts`).

---

## 📦 Runtime Optimizations & Implementation Details

* **Bun 1.4.3 Runtime:** Built on Bun's rewritten **Rust core** paired with the updated JavaScriptCore (JSC) engine and jemalloc-based memory allocator.
* **Concurrency Isolation:** Single dedicated worker process (`WEB_CONCURRENCY=1`) per microVM. The `cluster` primary branch only forks when `WEB_CONCURRENCY > 1`, so benchmarks run as one PID-1 process with no cluster IPC. Both Bun stacks additionally set `reusePort: true` on their servers, but with a single worker there is no socket fan-out — pure single-core evaluation either way.
* **Cryptography:** HMAC-SHA256 bearer verification as described in the Authentication section — `Bun.CryptoHasher` on Bun, `crypto.createHmac` on Node, constant-time comparison (`crypto.timingSafeEqual`), in-memory token cache.
* **Database Driver (`postgres.js` v3.4.9):**
  * Pool size: `max: 25` (`DB_POOL_MAX`), capped per single worker process.
  * `idle_timeout: 20` (20 s idle connection reap), `connect_timeout: 10`.
  * `max_lifetime: 300` (5 min socket recycling), `keep_alive: 10` (TCP keepalive every 10 s).
  * Prepared statements: `prepare: true` for all queries; `ssl: 'require'`.
  * Atomic writes: single-roundtrip Common Table Expressions (CTEs) for state updates (e.g. inserting likes and incrementing counters in one roundtrip).
* **Multi-Stack Directory Structure:**
  * `src/shared/`: Shared PostgreSQL pool, HMAC authentication, and Linux cgroup telemetry samplers.
  * `src/bun-hono/`: Reference Bun 1.4.3 + Hono implementation.
  * `src/bun-elysia/`: Bun 1.4.3 + Elysia (AOT) implementation.
  * `src/node-express/`: Node.js 26 + Express 5 implementation.
  * `src/node-fastify/`: Node.js 26 + Fastify 5.12.5 implementation.
  * `src/index.ts`: Local stack selector — `bun run start <stack>`.
* **Container Packaging:** Multi-stage Alpine builds with unprivileged non-root users (`bun` / `node`). Bun stacks run TS directly on `oven/bun:1.4.3-alpine`; Node stacks bundle TS to ESM (`bun build --target=node --packages=external`) on `oven/bun:1.4.3-alpine`, then run `dist/index.mjs` on `node:current-alpine`. Templates live in `docker/Dockerfile.<stack>` and are copied to the ephemeral root `Dockerfile` by `bun run deploy <stack>` (never commit the root `Dockerfile`).

---

## 🗄️ Database Schema & Index Design

### Row Counts

Live counts from the managed PostgreSQL 16 instance (**snapshot: 2026-10-12**) versus the `bun run db:seed` baseline. The two diverge because benchmark traffic mutates data continuously: `bun run db:clean` prunes benchmark-created posts/comments/stories and reconciles counters, but **never touches `likes` or `saved_posts`**, while `follows` toggles in both directions.

| Table | Live rows (2026-10-12) | Seed baseline | Drift behavior |
| :--- | ---: | ---: | :--- |
| `users` | 5,000 | 5,000 | Fixed |
| `posts` | 50,010 | 50,000 | `db:clean` deletes ids > 50,000 |
| `likes` | 419,721 | 100,000 | Grows monotonically (never pruned) |
| `follows` | 134,856 | ~150,000 | Toggles both directions; drifts either way |
| `comments` | 124,398 | 25,000 | `db:clean` deletes ids > 121,000 |
| `stories` | 1,401 total / 28 active (`expires_at > NOW()`) | Tops up to ~2,500 active (first 250 creators, 1–10 each, 4–24 h TTL) | 24 h TTL; active pool decays between `db:seed` runs |
| `saved_posts` | 132,248 | 5,000 | Toggles; never pruned |

### Schema

* **`users`**: `id`, `username` (UNIQUE), `display_name`, `avatar_url`, `bio`, `followers_count`, `following_count`, `posts_count`, `created_at`
* **`posts`**: `id`, `user_id` (FK), `content` (VARCHAR(500), legacy column kept in sync with `caption`), `image_url`, `caption`, `likes_count`, `comments_count`, `created_at`
* **`likes`**: `id`, `user_id` (FK), `post_id` (FK), `created_at` (UNIQUE pair)
* **`follows`**: `follower_id` (FK), `following_id` (FK), `created_at` (composite PK; power-law influencer graph)
* **`comments`**: `id`, `post_id` (FK), `user_id` (FK), `content`, `created_at`
* **`stories`**: `id`, `user_id` (FK), `media_url`, `created_at`, `expires_at` (24-hour TTL)
* **`saved_posts`**: `user_id` (FK), `post_id` (FK), `created_at` (composite PK; private bookmarks)

### Index Architecture

Created by `scripts/migrate.ts` (plus `scripts/optimize-db.ts`, which is idempotent over the trigram set):

```sql
-- Home feed fan-in keyset lookup: user_id IN (...) AND id < cursor ORDER BY id DESC
CREATE INDEX idx_posts_user_id_id ON posts (user_id, id DESC);

-- Explore feed sorting by engagement
CREATE INDEX idx_posts_likes_id ON posts (likes_count DESC, id DESC);

-- Reverse follow graph lookup ("who does this user follow")
CREATE INDEX idx_follows_following_id ON follows (following_id);

-- Chronological per-creator lookups and profile grids
CREATE INDEX idx_posts_user_created ON posts (user_id, created_at DESC);

-- Like existence checks and per-user like history
CREATE INDEX idx_likes_post_id ON likes (post_id);
CREATE INDEX idx_likes_user_id ON likes (user_id);

-- Post comments cursor pagination
CREATE INDEX idx_comments_post_id ON comments (post_id, id DESC);

-- Ephemeral stories: active tray filter + TTL sweeps
CREATE INDEX idx_stories_user_expires ON stories (user_id, expires_at DESC);
CREATE INDEX idx_stories_expires_at ON stories (expires_at DESC);
CREATE INDEX idx_stories_user_created ON stories (user_id, created_at DESC);

-- User saved bookmarks lookup
CREATE INDEX idx_saved_posts_user ON saved_posts (user_id, created_at DESC);

-- Case-insensitive username prefix lookup
CREATE INDEX idx_users_username_lower ON users (lower(username));

-- Trigram substring and prefix search
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_posts_caption_trgm ON posts USING gin (lower(caption) gin_trgm_ops);
CREATE INDEX idx_users_display_name_trgm ON users USING gin (lower(display_name) gin_trgm_ops);
CREATE INDEX idx_users_username_trgm ON users USING gin (lower(username) gin_trgm_ops);
```

---

## 🚀 Complete API Routing Directory

All four stacks expose the identical surface. Auth semantics follow the model defined in the Authentication section — **`None`/`Public` routes never verify a token; `Optional¹` routes verify only when a header is present.**

| Endpoint | Method | Auth | Description |
| :--- | :--- | :---: | :--- |
| `/` | `GET` | Public | Service metadata & directory |
| `/health` | `GET` | Public | Healthcheck, DB ping latency, process memory |
| `/api/telemetry` | `GET` | Public | Live container CPU %, RSS, event loop lag |
| `/api/telemetry/reset` | `POST` | Public | Reset telemetry sample windows |
| `/api/auth/token` | `POST` | Public | Generate HMAC-SHA256 Bearer authorization token |
| `/api/feed/home` | `GET` | Optional¹ | Keyset cursor timeline from followed accounts (falls back to `?userId=`) |
| `/api/feed/explore` | `GET` | None | Popularity-ranked discovery feed |
| `/api/feed` | `GET` | None | Reverse-chronological timeline |
| `/api/stories/tray` | `GET` | Optional¹·² | Active 24h stories tray from followed users |
| `/api/stories` | `POST` | Optional¹ | Publish new ephemeral story |
| `/api/users/:id` | `GET` | None | User profile & 12-photo grid (`Promise.all`) |
| `/api/users/:id/saved` | `GET` | Optional¹ | Private bookmarked posts collection (identity from `:id` when no token) |
| `/api/users/:id/follow` | `POST` | Optional¹ | Toggle follow / unfollow graph relationship |
| `/api/posts` | `POST` | Optional¹ | Create new photo post |
| `/api/posts/:id/like` | `POST` | Optional¹ | Atomic CTE like toggle and counter increment |
| `/api/posts/:id/comments` | `GET` | None | Keyset paginated post comments |
| `/api/posts/:id/comments` | `POST` | Optional¹ | Atomic CTE comment insert and counter increment |
| `/api/posts/:id/save` | `POST` | Optional¹ | Toggle private bookmark |
| `/api/search` | `GET` | None | GIN trigram prefix/keyword search across users & posts |

¹ Invalid token → `401`; absent token → query/body `userId` fallback (default `1` on write routes).
² `stories/tray` ignores an invalid token rather than returning `401`.

---

## 🌐 Environment Configuration

Source of truth: `.env.example` (regenerate the local `.env` with `bunx insta secrets -o .env`; run one-offs with `bunx insta run -- <cmd>`).

| Variable | Required | Default | Consumed by | Purpose |
| :--- | :---: | :--- | :--- | :--- |
| `DATABASE_URL` | ✅ | — | `src/shared/db.ts`, `scripts/*` | Managed Postgres connection string; reaches compute only via `insta secrets bind DATABASE_URL postgres/db --to compute/<svc>` |
| `AUTH_SECRET` | ✅ | — | `src/shared/auth.ts`, `loadgen/auth.ts` | HMAC key signing bearer tokens; throws at startup when absent; must match across all APIs + loadgen |
| `DB_POOL_MAX` | | `25` | `src/shared/db.ts` | Postgres pool ceiling per worker process |
| `PORT` | | `3000` (API) / `8080` (loadgen) | all stacks, `loadgen/Dockerfile` | Must match the `insta deploy --port` value |
| `WEB_CONCURRENCY` | | `1` | `src/*/index.ts` | Worker processes; held at 1 for single-core comparability |
| `STACK` | | — | `src/index.ts` | Fallback stack selector; `bun run start <stack>` takes precedence |
| `VCPU_COUNT` | | `1` | `src/shared/telemetry.ts` | Normalizes cgroup CPU samples to configured cores |
| `MICROVM_RAM_MB` | | `1024` | `src/shared/telemetry.ts` | Denominator for RAM-utilization reporting |
| `API_URL` | | per-stack target | `scripts/targets.ts` | Overrides the built-in stack URL (accepts a custom URL as the positional arg too) |
| `LOADGEN_URL` | | `prod-main-loadgen-…` | `scripts/targets.ts` | Load generator endpoint |
| `USERS` / `DURATION` / `RAMP_UP` / `THINK_TIME` | | `1000` / `20` / `5` / `100` | `scripts/run-benchmark.ts` | Load shape; CLI flags `--users= --duration= --rampUp= --thinkTime=` take precedence |

---

## 📡 Telemetry & Instrumentation

* **Origin timing (`Server-Timing: origin;dur=`):** emitted by every stack via the parity matrix above; the loadgen parses it (`loadgen/journey.ts → parseServerTiming`) to separate origin compute time from edge transit + TLS in its latency report.
* **API sampler (`src/shared/telemetry.ts`):** 100 ms interval, four `Float64Array` ring buffers (3,000 samples ≈ 5 min) for CPU %, RSS, heap, and event-loop lag.
  * **CPU source detection**, in order: cgroup v2 (`/sys/fs/cgroup/cpu.stat`) → cgroup v1 (`cpuacct.usage`) → `/proc/self/stat` ticks → `process.cpuUsage()`; samples normalized by `VCPU_COUNT` and capped at 100%.
  * **Event-loop lag:** drift against a 100 ms heartbeat expectation — the actual stall metric behind the benchmark's p95 lag numbers.
  * **Endpoints:** `GET /api/telemetry` (report), `POST /api/telemetry/reset` (clear windows; loadgen fires this automatically at the start of every run).
* **Loadgen telemetry (`loadgen/telemetry.ts`):** independent CPU/RSS/loop-lag sampling on the generator VM — the control channel proving the generator itself is never the bottleneck (loop lag ≈ 1 ms vs the 25 ms health threshold). Compiled into every report as `loadgenTelemetry` alongside `apiServerTelemetry`, a status-code matrix, per-second RPS timeline, per-action workload breakdown, and coordinated-omission-corrected percentiles (`loadgen/metrics.ts`). See [`BENCHMARK_RESULTS.md` §4](BENCHMARK_RESULTS.md).

---

## 📉 Capacity Dynamics & Queueing Theory

Under closed-loop testing ($N$ concurrent virtual users, think time $Z$, service response time $R$, throughput $X$), the system is governed by the **Interactive Response Time Law**:

$$X = \frac{N}{R + Z}$$

From a dedicated 1,000 → 2,000 VU scaling run against the single-core microVM (separate from the Stage 1–4 leaderboard runs):

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
bun run lint:fix

# Run a stack locally (no default — the stack arg is mandatory)
bun run start hono

# Deploy a stack (copies docker/Dockerfile.<stack> -> root Dockerfile, then insta deploy)
bun run deploy hono

# Warmup routines (health pings, route/JIT/pool priming, loadgen mini-burst,
# cleans benchmark mutations, resets telemetry)
bun run warmup hono
bun run warmup elysia
bun run warmup express
bun run warmup fastify

# Smoke tests (every endpoint against a live stack)
bun run test hono            # alias: bun run test:endpoints hono

# Single stack benchmark (options: --users= --duration= --rampUp= --thinkTime=)
bun run benchmark hono
bun run benchmark elysia
bun run benchmark express
bun run benchmark fastify

# Repeat per stack to compare in a single session
bun run benchmark hono
bun run benchmark elysia
bun run benchmark express
bun run benchmark fastify

# Local load generator (Bun server, default port 8080)
bun run loadgen

# Database maintenance
bun run db:migrate           # schema + index migrations
bun run db:seed              # seed / top up baseline data
bun run db:clean             # prune benchmark mutations, reconcile counters

# Utility scripts (no package.json alias — invoke directly)
bun run scripts/verify.ts      # live row counts, on-disk sizes, sample rows
bun run scripts/optimize-db.ts # pg_trgm extension + GIN trigram index tuning (idempotent)
```
