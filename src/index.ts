import { Hono } from 'hono'
import { sql } from './db'

const app = new Hono()

// Service Directory
app.get('/', (c) => {
  return c.json({
    service: 'InstaCloud Instagram-Style Backend API',
    runtime: 'Bun ' + Bun.version,
    endpoints: [
      'GET  /health',
      'GET  /api/feed/home?userId=<id>&cursor=<id>&limit=20',
      'GET  /api/feed/explore?cursor=<id>&limit=20',
      'GET  /api/feed?cursor=<id>&limit=20',
      'GET  /api/users/:id',
      'POST /api/users/:id/follow',
      'POST /api/posts',
      'POST /api/posts/:id/like',
      'GET  /api/bench/feed',
    ],
  })
})

// Observability & Database Health
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

// Instagram Home Feed: Timeline of posts from accounts the user follows
app.get('/api/feed/home', async (c) => {
  const userId = Number(c.req.query('userId')) || 1
  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : null
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)

  try {
    let posts
    if (cursor) {
      posts = await sql`
        SELECT 
          p.id, 
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
          p.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.user_id IN (
          SELECT following_id FROM follows WHERE follower_id = ${userId}
        )
        AND p.id < ${cursor}
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    } else {
      posts = await sql`
        SELECT 
          p.id, 
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
          p.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.user_id IN (
          SELECT following_id FROM follows WHERE follower_id = ${userId}
        )
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    }

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null

    return c.json({
      type: 'home',
      userId,
      count: posts.length,
      nextCursor,
      posts,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch home feed', details: err.message }, 500)
  }
})

// Instagram Explore Feed: Discovery of popular posts across the platform
app.get('/api/feed/explore', async (c) => {
  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : null
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)

  try {
    let posts
    if (cursor) {
      posts = await sql`
        SELECT 
          p.id, 
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
          p.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id < ${cursor}
        ORDER BY p.likes_count DESC, p.id DESC
        LIMIT ${limit};
      `
    } else {
      posts = await sql`
        SELECT 
          p.id, 
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
          p.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM posts p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.likes_count DESC, p.id DESC
        LIMIT ${limit};
      `
    }

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null

    return c.json({
      type: 'explore',
      count: posts.length,
      nextCursor,
      posts,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch explore feed', details: err.message }, 500)
  }
})

// General reverse-chronological feed (backward compatible with original /api/feed)
app.get('/api/feed', async (c) => {
  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : null
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)

  try {
    let posts
    if (cursor) {
      posts = await sql`
        SELECT 
          p.id, 
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
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
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
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

// User Profile & Recent Photos Grid (12 items)
app.get('/api/users/:id', async (c) => {
  const userId = Number(c.req.param('id'))
  if (isNaN(userId)) {
    return c.json({ error: 'Invalid user ID' }, 400)
  }

  try {
    const [user] = await sql`
      SELECT 
        id, 
        username, 
        display_name, 
        avatar_url, 
        bio, 
        followers_count, 
        following_count, 
        posts_count, 
        created_at
      FROM users
      WHERE id = ${userId};
    `

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    const recentPosts = await sql`
      SELECT id, image_url, caption, likes_count, comments_count, created_at
      FROM posts
      WHERE user_id = ${userId}
      ORDER BY id DESC
      LIMIT 12;
    `

    return c.json({
      user,
      recentPosts,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch user', details: err.message }, 500)
  }
})

// Follow / Unfollow Toggle
app.post('/api/users/:id/follow', async (c) => {
  const targetUserId = Number(c.req.param('id'))
  if (isNaN(targetUserId)) {
    return c.json({ error: 'Invalid user ID' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const followerId = Number(body.followerId)

    if (!followerId || isNaN(followerId)) {
      return c.json({ error: 'Missing or invalid followerId' }, 400)
    }

    if (followerId === targetUserId) {
      return c.json({ error: 'Users cannot follow themselves' }, 400)
    }

    // Check if already following
    const [existing] = await sql`
      SELECT 1 FROM follows 
      WHERE follower_id = ${followerId} AND following_id = ${targetUserId};
    `

    if (existing) {
      // Unfollow
      await sql.begin(async (tx) => {
        await tx`
          DELETE FROM follows 
          WHERE follower_id = ${followerId} AND following_id = ${targetUserId};
        `
        await tx`
          UPDATE users 
          SET followers_count = GREATEST(followers_count - 1, 0) 
          WHERE id = ${targetUserId};
        `
        await tx`
          UPDATE users 
          SET following_count = GREATEST(following_count - 1, 0) 
          WHERE id = ${followerId};
        `
      })
      return c.json({ success: true, following: false, message: 'Unfollowed successfully' })
    } else {
      // Follow
      await sql.begin(async (tx) => {
        await tx`
          INSERT INTO follows (follower_id, following_id, created_at)
          VALUES (${followerId}, ${targetUserId}, NOW());
        `
        await tx`
          UPDATE users 
          SET followers_count = followers_count + 1 
          WHERE id = ${targetUserId};
        `
        await tx`
          UPDATE users 
          SET following_count = following_count + 1 
          WHERE id = ${followerId};
        `
      })
      return c.json({ success: true, following: true, message: 'Followed successfully' })
    }
  } catch (err: any) {
    return c.json({ error: 'Failed to update follow relationship', details: err.message }, 500)
  }
})

// Create Photo Post
app.post('/api/posts', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const { userId, imageUrl, caption, content } = body

    if (!userId || isNaN(Number(userId))) {
      return c.json({ error: 'Missing or invalid userId' }, 400)
    }

    const postCaption = String(caption || content || '').slice(0, 1000)
    const postImage = imageUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'

    const [newPost] = await sql.begin(async (tx) => {
      const [p] = await tx`
        INSERT INTO posts (user_id, image_url, caption, content, likes_count, comments_count, created_at)
        VALUES (${Number(userId)}, ${postImage}, ${postCaption}, ${postCaption.slice(0, 500)}, 0, 0, NOW())
        RETURNING id, user_id, image_url, caption, likes_count, comments_count, created_at;
      `

      await tx`
        UPDATE users 
        SET posts_count = posts_count + 1 
        WHERE id = ${Number(userId)};
      `

      return [p]
    })

    return c.json({ success: true, post: newPost }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create post', details: err.message }, 500)
  }
})

// Like Post
app.post('/api/posts/:id/like', async (c) => {
  const postId = Number(c.req.param('id'))
  if (isNaN(postId)) {
    return c.json({ error: 'Invalid post ID' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const userId = Number(body.userId) || 1

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

// In-Memory Benchmark Endpoint (Baseline Runtime Speed)
const inMemoryFeed = Array.from({ length: 20 }, (_, i) => ({
  id: 100000 + i,
  image_url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
  caption: `Benchmarking Bun 1.4 (Rust core) on InstaCloud 2 vCPU / 2 GB microVM! Post #${i + 1} ⚡`,
  likes_count: 42 + i * 3,
  comments_count: 5,
  created_at: new Date(Date.now() - i * 60000).toISOString(),
  user_id: 100 + i,
  username: `rust_dev_${i + 1}`,
  display_name: `Rustacean #${i + 1}`,
  avatar_url: `https://api.dicebear.com/7.x/identicon/svg?seed=rust_${i}`,
}))

app.get('/api/bench/feed', (c) => {
  return c.json({
    cached: true,
    engine: 'Bun ' + Bun.version,
    count: inMemoryFeed.length,
    posts: inMemoryFeed,
  })
})

const port = Number(process.env.PORT) || 3000

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}
