import { Elysia, status } from 'elysia'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const feedRoutes = new Elysia({ prefix: '/api/feed' })

const POST_COLUMNS = `
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
`

// Instagram Home Feed: Timeline of posts from accounts the user follows
feedRoutes.get('/home', async ({ query, headers }) => {
  const authHeader = headers['authorization']
  let userId = Number(query.userId) || 1
  if (authHeader) {
    const verified = verifyAuthToken(authHeader)
    if (!verified) {
      return status(401, { error: 'Unauthorized: Invalid authentication token' })
    }
    userId = verified.userId
  }
  const cursor = query.cursor ? Number(query.cursor) : null
  const limit = Math.min(Number(query.limit) || 20, 50)

  try {
    let posts
    if (cursor) {
      posts = await sql`
        SELECT ${sql.unsafe(POST_COLUMNS)}
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
        SELECT ${sql.unsafe(POST_COLUMNS)}
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

    return {
      type: 'home',
      userId,
      count: posts.length,
      nextCursor,
      posts,
    }
  } catch (err: any) {
    return status(500, { error: 'Failed to fetch home feed', details: err.message })
  }
})

// Instagram Explore Feed: Discovery of popular posts across the platform
feedRoutes.get('/explore', async ({ query }) => {
  const cursor = query.cursor ? Number(query.cursor) : null
  const limit = Math.min(Number(query.limit) || 20, 50)

  try {
    let posts
    if (cursor) {
      posts = await sql`
        SELECT ${sql.unsafe(POST_COLUMNS)}
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id < ${cursor}
        ORDER BY p.likes_count DESC, p.id DESC
        LIMIT ${limit};
      `
    } else {
      posts = await sql`
        SELECT ${sql.unsafe(POST_COLUMNS)}
        FROM posts p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.likes_count DESC, p.id DESC
        LIMIT ${limit};
      `
    }

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null

    return {
      type: 'explore',
      count: posts.length,
      nextCursor,
      posts,
    }
  } catch (err: any) {
    return status(500, { error: 'Failed to fetch explore feed', details: err.message })
  }
})

// General reverse-chronological feed (backward compatible with original /api/feed)
feedRoutes.get('/', async ({ query }) => {
  const cursor = query.cursor ? Number(query.cursor) : null
  const limit = Math.min(Number(query.limit) || 20, 50)

  try {
    let posts
    if (cursor) {
      posts = await sql`
        SELECT ${sql.unsafe(POST_COLUMNS)}
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.id < ${cursor}
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    } else {
      posts = await sql`
        SELECT ${sql.unsafe(POST_COLUMNS)}
        FROM posts p
        JOIN users u ON p.user_id = u.id
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    }

    const nextCursor = posts.length === limit ? posts[posts.length - 1].id : null

    return {
      count: posts.length,
      nextCursor,
      posts,
    }
  } catch (err: any) {
    return status(500, { error: 'Failed to fetch feed', details: err.message })
  }
})
