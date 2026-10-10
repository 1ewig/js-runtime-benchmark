import { Router } from 'express'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const postsRoutes = Router()

// Create Photo Post
postsRoutes.post('/', async (req, res) => {
  try {
    const authHeader = req.get('authorization')
    let userId = Number(req.body?.userId)

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return res.status(401).json({ error: 'Unauthorized: Invalid authentication token' })
      }
      userId = verified.userId
    }

    if (!userId || isNaN(Number(userId))) {
      return res.status(400).json({ error: 'Missing or invalid userId' })
    }

    const postCaption = String(req.body?.caption || req.body?.content || '').slice(0, 1000)
    const postImage = req.body?.imageUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'

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

    return res.status(201).json({ success: true, post: newPost })
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create post', details: err.message })
  }
})

// Like Post
postsRoutes.post('/:id/like', async (req, res) => {
  const postId = Number(req.params.id)
  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID' })
  }

  try {
    const authHeader = req.get('authorization')
    let userId = Number(req.body?.userId) || 1

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return res.status(401).json({ error: 'Unauthorized: Invalid authentication token' })
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

    return res.json({
      success: true,
      liked,
      ...(liked ? {} : { message: 'Already liked' }),
      likesCount,
    })
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to like post', details: err.message })
  }
})

// Get Comments on Post (Keyset cursor paginated)
postsRoutes.get('/:id/comments', async (req, res) => {
  const postId = Number(req.params.id)
  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID' })
  }

  const cursor = req.query.cursor ? Number(req.query.cursor) : null
  const limit = Math.min(Number(req.query.limit) || 20, 50)

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

    return res.json({
      postId,
      count: comments.length,
      nextCursor,
      comments,
    })
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch comments', details: err.message })
  }
})

// Create Comment on Post
postsRoutes.post('/:id/comments', async (req, res) => {
  const postId = Number(req.params.id)
  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID' })
  }

  try {
    const authHeader = req.get('authorization')
    let userId = Number(req.body?.userId) || 1

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return res.status(401).json({ error: 'Unauthorized: Invalid authentication token' })
      }
      userId = verified.userId
    }

    const content = String(req.body?.content || req.body?.text || '').trim().slice(0, 500)
    if (!content) {
      return res.status(400).json({ error: 'Comment content cannot be empty' })
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

    return res.status(201).json({ success: true, comment })
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to create comment', details: err.message })
  }
})

// Toggle Save / Bookmark Post
postsRoutes.post('/:id/save', async (req, res) => {
  const postId = Number(req.params.id)
  if (isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID' })
  }

  try {
    const authHeader = req.get('authorization')
    let userId = Number(req.body?.userId) || 1

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return res.status(401).json({ error: 'Unauthorized: Invalid authentication token' })
      }
      userId = verified.userId
    }

    const [deleted] = await sql`
      DELETE FROM saved_posts 
      WHERE user_id = ${userId} AND post_id = ${postId}
      RETURNING post_id;
    `

    if (deleted) {
      return res.json({ success: true, saved: false, message: 'Post removed from saved collection' })
    } else {
      await sql`
        INSERT INTO saved_posts (user_id, post_id, created_at)
        VALUES (${userId}, ${postId}, NOW())
        ON CONFLICT DO NOTHING;
      `
      return res.json({ success: true, saved: true, message: 'Post saved successfully' })
    }
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to toggle post bookmark', details: err.message })
  }
})
