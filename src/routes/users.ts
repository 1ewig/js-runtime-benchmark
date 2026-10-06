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
