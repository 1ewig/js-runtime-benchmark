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
