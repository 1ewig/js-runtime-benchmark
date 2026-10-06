import { Hono } from 'hono'
import { sql } from './db'

const app = new Hono()

// Root overview
app.get('/', (c) => {
  return c.json({
    service: 'Social Media High-Throughput API',
    runtime: 'Bun ' + Bun.version,
    endpoints: [
      'GET /health',
      'GET /api/bench/feed',
      'GET /api/feed?cursor=<id>&limit=20',
      'GET /api/users/:id',
      'POST /api/posts',
      'POST /api/posts/:id/like',
    ],
  })
})

// Pre-generate in-memory cached feed for pure compute/runtime benchmarking
const inMemoryFeed = Array.from({ length: 20 }, (_, i) => ({
  id: 100000 + i,
  content: `Benchmarking Bun 1.4 (Rust core) on InstaCloud 4 vCPU / 4 GB microVM! Post #${i + 1} ⚡`,
  likes_count: 42 + i * 3,
  created_at: new Date(Date.now() - i * 60000).toISOString(),
  user_id: 100 + i,
  username: `rust_dev_${i + 1}`,
  display_name: `Rustacean #${i + 1}`,
  avatar_url: `https://api.dicebear.com/7.x/identicon/svg?seed=rust_${i}`,
}))

// Pure In-Memory / Compute Benchmark Endpoint (No DB I/O)
app.get('/api/bench/feed', (c) => {
  return c.json({
    cached: true,
    engine: 'Bun ' + Bun.version,
    count: inMemoryFeed.length,
    posts: inMemoryFeed,
  })
})


// Observability & DB Ping
app.get('/health', async (c) => {
  try {
    const start = performance.now()
    const [ping] = await sql`SELECT 1 as alive;`
    const dbLatency = (performance.now() - start).toFixed(2)

    const mem = process.memoryUsage()
    return c.json({
      status: 'healthy',
      db: ping.alive === 1 ? 'connected' : 'degraded',
      dbLatencyMs: Number(dbLatency),
      memory: {
        rssMb: Math.round(mem.rss / 1024 / 1024),
        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      },
      uptimeSec: Math.round(process.uptime()),
    })
  } catch (err: any) {
    return c.json({ status: 'unhealthy', error: err.message }, 500)
  }
})

// Feed: Read-heavy indexed query with cursor pagination
app.get('/api/feed', async (c) => {
  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : null
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)

  try {
    let posts
    if (cursor) {
      posts = await sql`
        SELECT 
          p.id, 
          p.content, 
          p.likes_count, 
          p.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id < ${cursor}
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    } else {
      posts = await sql`
        SELECT 
          p.id, 
          p.content, 
          p.likes_count, 
          p.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM posts p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    }

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null

    return c.json({
      count: posts.length,
      nextCursor,
      posts,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch feed', details: err.message }, 500)
  }
})

// User profile & recent posts
app.get('/api/users/:id', async (c) => {
  const userId = Number(c.req.param('id'))
  if (isNaN(userId)) {
    return c.json({ error: 'Invalid user ID' }, 400)
  }

  try {
    const [user] = await sql`
      SELECT id, username, display_name, avatar_url, created_at
      FROM users
      WHERE id = ${userId};
    `

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    const recentPosts = await sql`
      SELECT id, content, likes_count, created_at
      FROM posts
      WHERE user_id = ${userId}
      ORDER BY id DESC
      LIMIT 10;
    `

    return c.json({
      user,
      recentPosts,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch user', details: err.message }, 500)
  }
})

// Create post: Write operation
app.post('/api/posts', async (c) => {
  try {
    const body = await c.req.json()
    const { userId, content } = body

    if (!userId || !content || typeof content !== 'string') {
      return c.json({ error: 'Missing userId or content' }, 400)
    }

    const [newPost] = await sql`
      INSERT INTO posts (user_id, content, likes_count, created_at)
      VALUES (${Number(userId)}, ${content.slice(0, 500)}, 0, NOW())
      RETURNING id, user_id, content, likes_count, created_at;
    `

    return c.json({ success: true, post: newPost }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create post', details: err.message }, 500)
  }
})

// Like post: Write / transaction operation
app.post('/api/posts/:id/like', async (c) => {
  const postId = Number(c.req.param('id'))
  if (isNaN(postId)) {
    return c.json({ error: 'Invalid post ID' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const userId = Number(body.userId) || 1

    // Atomically insert like and increment counter
    const result = await sql.begin(async (tx) => {
      const inserted = await tx`
        INSERT INTO likes (user_id, post_id, created_at)
        VALUES (${userId}, ${postId}, NOW())
        ON CONFLICT (user_id, post_id) DO NOTHING
        RETURNING id;
      `

      if (inserted.length > 0) {
        const [updatedPost] = await tx`
          UPDATE posts
          SET likes_count = likes_count + 1
          WHERE id = ${postId}
          RETURNING likes_count;
        `
        return { liked: true, likesCount: updatedPost?.likes_count || 1 }
      }

      const [post] = await tx`SELECT likes_count FROM posts WHERE id = ${postId};`
      return { liked: false, message: 'Already liked', likesCount: post?.likes_count || 0 }
    })

    return c.json({ success: true, ...result })
  } catch (err: any) {
    return c.json({ error: 'Failed to like post', details: err.message }, 500)
  }
})

const port = Number(process.env.PORT) || 3000

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}
