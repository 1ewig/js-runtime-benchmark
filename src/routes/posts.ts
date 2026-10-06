import { Hono } from 'hono'
import { sql } from '../db'
import { verifyAuthToken } from '../auth'

export const postsRoutes = new Hono()

// Create Photo Post
postsRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json().catch(() => ({}))
    const authHeader = c.req.header('authorization')
    let userId = Number(body.userId)

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return c.json({ error: 'Unauthorized: Invalid authentication token' }, 401)
      }
      userId = verified.userId
    }

    if (!userId || isNaN(Number(userId))) {
      return c.json({ error: 'Missing or invalid userId' }, 400)
    }

    const postCaption = String(body.caption || body.content || '').slice(0, 1000)
    const postImage = body.imageUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'

    const [newPost] = await sql`
      WITH ins AS (
        INSERT INTO posts (user_id, image_url, caption, content, likes_count, comments_count, created_at)
        VALUES (${Number(userId)}, ${postImage}, ${postCaption}, ${postCaption.slice(0, 500)}, 0, 0, NOW())
        RETURNING id, user_id, image_url, caption, likes_count, comments_count, created_at
      ),
      upd AS (
        UPDATE users 
        SET posts_count = posts_count + 1 
        WHERE id = ${Number(userId)}
      )
      SELECT * FROM ins;
    `

    return c.json({ success: true, post: newPost }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create post', details: err.message }, 500)
  }
})

// Like Post
postsRoutes.post('/:id/like', async (c) => {
  const postId = Number(c.req.param('id'))
  if (isNaN(postId)) {
    return c.json({ error: 'Invalid post ID' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const authHeader = c.req.header('authorization')
    let userId = Number(body.userId) || 1

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return c.json({ error: 'Unauthorized: Invalid authentication token' }, 401)
      }
      userId = verified.userId
    }

    const [result] = await sql`
      WITH ins AS (
        INSERT INTO likes (user_id, post_id, created_at)
        VALUES (${userId}, ${postId}, NOW())
        ON CONFLICT (user_id, post_id) DO NOTHING
        RETURNING post_id
      ),
      upd AS (
        UPDATE posts
        SET likes_count = likes_count + 1
        WHERE id IN (SELECT post_id FROM ins)
        RETURNING likes_count
      )
      SELECT 
        EXISTS(SELECT 1 FROM ins) AS liked,
        COALESCE(
          (SELECT likes_count FROM upd),
          (SELECT likes_count FROM posts WHERE id = ${postId})
        ) AS likes_count;
    `

    const liked = Boolean(result?.liked)
    const likesCount = Number(result?.likes_count || 0)

    return c.json({
      success: true,
      liked,
      ...(liked ? {} : { message: 'Already liked' }),
      likesCount,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to like post', details: err.message }, 500)
  }
})

// Get Comments on Post (Keyset cursor paginated)
postsRoutes.get('/:id/comments', async (c) => {
  const postId = Number(c.req.param('id'))
  if (isNaN(postId)) {
    return c.json({ error: 'Invalid post ID' }, 400)
  }

  const cursor = c.req.query('cursor') ? Number(c.req.query('cursor')) : null
  const limit = Math.min(Number(c.req.query('limit')) || 20, 50)

  try {
    let comments
    if (cursor) {
      comments = await sql`
        SELECT 
          c.id, 
          c.post_id, 
          c.content, 
          c.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ${postId} AND c.id < ${cursor}
        ORDER BY c.id DESC
        LIMIT ${limit};
      `
    } else {
      comments = await sql`
        SELECT 
          c.id, 
          c.post_id, 
          c.content, 
          c.created_at,
          u.id as user_id, 
          u.username, 
          u.display_name, 
          u.avatar_url
        FROM comments c
        JOIN users u ON c.user_id = u.id
        WHERE c.post_id = ${postId}
        ORDER BY c.id DESC
        LIMIT ${limit};
      `
    }

    const nextCursor = comments.length === limit ? comments[comments.length - 1].id : null

    return c.json({
      postId,
      count: comments.length,
      nextCursor,
      comments,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch comments', details: err.message }, 500)
  }
})

// Create Comment on Post
postsRoutes.post('/:id/comments', async (c) => {
  const postId = Number(c.req.param('id'))
  if (isNaN(postId)) {
    return c.json({ error: 'Invalid post ID' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const authHeader = c.req.header('authorization')
    let userId = Number(body.userId) || 1

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return c.json({ error: 'Unauthorized: Invalid authentication token' }, 401)
      }
      userId = verified.userId
    }

    const content = String(body.content || body.text || '').trim().slice(0, 500)
    if (!content) {
      return c.json({ error: 'Comment content cannot be empty' }, 400)
    }

    const [comment] = await sql`
      WITH ins AS (
        INSERT INTO comments (post_id, user_id, content, created_at)
        VALUES (${postId}, ${userId}, ${content}, NOW())
        RETURNING id, post_id, user_id, content, created_at
      ),
      upd AS (
        UPDATE posts
        SET comments_count = comments_count + 1
        WHERE id = ${postId}
      )
      SELECT * FROM ins;
    `

    return c.json({ success: true, comment }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create comment', details: err.message }, 500)
  }
})

// Toggle Save / Bookmark Post
postsRoutes.post('/:id/save', async (c) => {
  const postId = Number(c.req.param('id'))
  if (isNaN(postId)) {
    return c.json({ error: 'Invalid post ID' }, 400)
  }

  try {
    const body = await c.req.json().catch(() => ({}))
    const authHeader = c.req.header('authorization')
    let userId = Number(body.userId) || 1

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return c.json({ error: 'Unauthorized: Invalid authentication token' }, 401)
      }
      userId = verified.userId
    }

    const [deleted] = await sql`
      DELETE FROM saved_posts 
      WHERE user_id = ${userId} AND post_id = ${postId}
      RETURNING post_id;
    `

    if (deleted) {
      return c.json({ success: true, saved: false, message: 'Post removed from saved collection' })
    } else {
      await sql`
        INSERT INTO saved_posts (user_id, post_id, created_at)
        VALUES (${userId}, ${postId}, NOW())
        ON CONFLICT DO NOTHING;
      `
      return c.json({ success: true, saved: true, message: 'Post saved successfully' })
    }
  } catch (err: any) {
    return c.json({ error: 'Failed to toggle post bookmark', details: err.message }, 500)
  }
})
