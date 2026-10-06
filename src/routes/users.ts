import { Hono } from 'hono'
import { sql } from '../db'
import { verifyAuthToken } from '../auth'

export const usersRoutes = new Hono()

// User Profile & Recent Photos Grid (12 items)
usersRoutes.get('/:id', async (c) => {
  const userId = Number(c.req.param('id'))
  if (isNaN(userId)) {
    return c.json({ error: 'Invalid user ID' }, 400)
  }

  try {
    const [[user], recentPosts] = await Promise.all([
      sql`
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
      `,
      sql`
        SELECT id, image_url, caption, likes_count, comments_count, created_at
        FROM posts
        WHERE user_id = ${userId}
        ORDER BY id DESC
        LIMIT 12;
      `,
    ])

    if (!user) {
      return c.json({ error: 'User not found' }, 404)
    }

    return c.json({
      user,
      recentPosts,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch user', details: err.message }, 500)
  }
})

// Follow / Unfollow Toggle
usersRoutes.post('/:id/follow', async (c) => {
  const targetUserId = Number(c.req.param('id'))
  if (isNaN(targetUserId)) {
    return c.json({ error: 'Invalid user ID' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const authHeader = c.req.header('authorization')
    let followerId = Number(body.followerId)

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return c.json({ error: 'Unauthorized: Invalid authentication token' }, 401)
      }
      followerId = verified.userId
    }

    if (!followerId || isNaN(followerId)) {
      return c.json({ error: 'Missing or invalid followerId' }, 400)
    }

    if (followerId === targetUserId) {
      return c.json({ error: 'Users cannot follow themselves' }, 400)
    }

    // Try unfollow first without prior SELECT
    const [deleted] = await sql`
      DELETE FROM follows 
      WHERE follower_id = ${followerId} AND following_id = ${targetUserId}
      RETURNING following_id;
    `

    if (deleted) {
      await Promise.all([
        sql`UPDATE users SET followers_count = GREATEST(followers_count - 1, 0) WHERE id = ${targetUserId};`,
        sql`UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = ${followerId};`,
      ])
      return c.json({ success: true, following: false, message: 'Unfollowed successfully' })
    } else {
      await sql`
        INSERT INTO follows (follower_id, following_id, created_at)
        VALUES (${followerId}, ${targetUserId}, NOW())
        ON CONFLICT DO NOTHING;
      `
      await Promise.all([
        sql`UPDATE users SET followers_count = followers_count + 1 WHERE id = ${targetUserId};`,
        sql`UPDATE users SET following_count = following_count + 1 WHERE id = ${followerId};`,
      ])
      return c.json({ success: true, following: true, message: 'Followed successfully' })
    }
  } catch (err: any) {
    return c.json({ error: 'Failed to update follow relationship', details: err.message }, 500)
  }
})

// User's Saved / Bookmarked Posts Grid (Keyset Cursor Paginated)
usersRoutes.get('/:id/saved', async (c) => {
  const userId = Number(c.req.param('id'))
  if (isNaN(userId)) {
    return c.json({ error: 'Invalid user ID' }, 400)
  }

  const authHeader = c.req.header('authorization')
  if (authHeader) {
    const verified = verifyAuthToken(authHeader)
    if (!verified) {
      return c.json({ error: 'Unauthorized: Invalid authentication token' }, 401)
    }
  }

  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : null
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)

  try {
    let saved
    if (cursor) {
      saved = await sql`
        SELECT 
          p.id, 
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
          p.created_at as post_created_at,
          sp.created_at as saved_at,
          u.id as author_id,
          u.username as author_username,
          u.avatar_url as author_avatar_url
        FROM saved_posts sp
        JOIN posts p ON sp.post_id = p.id
        JOIN users u ON p.user_id = u.id
        WHERE sp.user_id = ${userId} AND p.id < ${cursor}
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    } else {
      saved = await sql`
        SELECT 
          p.id, 
          p.image_url, 
          p.caption, 
          p.likes_count, 
          p.comments_count, 
          p.created_at as post_created_at,
          sp.created_at as saved_at,
          u.id as author_id,
          u.username as author_username,
          u.avatar_url as author_avatar_url
        FROM saved_posts sp
        JOIN posts p ON sp.post_id = p.id
        JOIN users u ON p.user_id = u.id
        WHERE sp.user_id = ${userId}
        ORDER BY p.id DESC
        LIMIT ${limit};
      `
    }

    const nextCursor = saved.length === limit ? saved[saved.length - 1].id : null

    return c.json({
      userId,
      count: saved.length,
      nextCursor,
      savedPosts: saved,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch saved posts', details: err.message }, 500)
  }
})

