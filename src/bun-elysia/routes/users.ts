import { Elysia, status } from 'elysia'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const usersRoutes = new Elysia({ prefix: '/api/users' })

// User Profile & Recent Photos Grid (12 items)
usersRoutes.get('/:id', async ({ params }) => {
  const userId = Number(params.id)
  if (isNaN(userId)) {
    return status(400, { error: 'Invalid user ID' })
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
      return status(404, { error: 'User not found' })
    }

    return {
      user,
      recentPosts,
    }
  } catch (err: any) {
    return status(500, { error: 'Failed to fetch user', details: err.message })
  }
})

// Follow / Unfollow Toggle
usersRoutes.post('/:id/follow', async ({ params, headers, request }) => {
  const targetUserId = Number(params.id)
  if (isNaN(targetUserId)) {
    return status(400, { error: 'Invalid user ID' })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const authHeader = headers['authorization']
    let followerId = Number((body as any).followerId)

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return status(401, { error: 'Unauthorized: Invalid authentication token' })
      }
      followerId = verified.userId
    }

    if (!followerId || isNaN(followerId)) {
      return status(400, { error: 'Missing or invalid followerId' })
    }

    if (followerId === targetUserId) {
      return status(400, { error: 'Users cannot follow themselves' })
    }

    // Try unfollow first in a single atomic CTE roundtrip
    const [delResult] = await sql`
      WITH del AS (
        DELETE FROM follows
        WHERE follower_id = ${followerId} AND following_id = ${targetUserId}
        RETURNING following_id
      ),
      upd_target AS (
        UPDATE users
        SET followers_count = GREATEST(followers_count - 1, 0)
        WHERE id = ${targetUserId} AND EXISTS (SELECT 1 FROM del)
      ),
      upd_follower AS (
        UPDATE users
        SET following_count = GREATEST(following_count - 1, 0)
        WHERE id = ${followerId} AND EXISTS (SELECT 1 FROM del)
      )
      SELECT EXISTS(SELECT 1 FROM del) AS unfollowed;
    `

    if (delResult?.unfollowed) {
      return { success: true, following: false, message: 'Unfollowed successfully' }
    }

    // Follow in a single atomic CTE roundtrip
    await sql`
      WITH ins AS (
        INSERT INTO follows (follower_id, following_id, created_at)
        VALUES (${followerId}, ${targetUserId}, NOW())
        ON CONFLICT DO NOTHING
        RETURNING following_id
      ),
      upd_target AS (
        UPDATE users
        SET followers_count = followers_count + 1
        WHERE id = ${targetUserId} AND EXISTS (SELECT 1 FROM ins)
      ),
      upd_follower AS (
        UPDATE users
        SET following_count = following_count + 1
        WHERE id = ${followerId} AND EXISTS (SELECT 1 FROM ins)
      )
      SELECT 1;
    `
    return { success: true, following: true, message: 'Followed successfully' }
  } catch (err: any) {
    return status(500, { error: 'Failed to update follow relationship', details: err.message })
  }
})

// User's Saved / Bookmarked Posts Grid (Keyset Cursor Paginated)
usersRoutes.get('/:id/saved', async ({ params, headers, query }) => {
  const userId = Number(params.id)
  if (isNaN(userId)) {
    return status(400, { error: 'Invalid user ID' })
  }

  const authHeader = headers['authorization']
  if (authHeader) {
    const verified = verifyAuthToken(authHeader)
    if (!verified) {
      return status(401, { error: 'Unauthorized: Invalid authentication token' })
    }
  }

  const cursor = query.cursor ? Number(query.cursor) : null
  const limit = Math.min(Number(query.limit) || 20, 50)

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

    return {
      userId,
      count: saved.length,
      nextCursor,
      savedPosts: saved,
    }
  } catch (err: any) {
    return status(500, { error: 'Failed to fetch saved posts', details: err.message })
  }
})
