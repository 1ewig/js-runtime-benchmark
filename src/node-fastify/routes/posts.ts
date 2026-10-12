import type { FastifyPluginAsync } from 'fastify'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const postsRoutes: FastifyPluginAsync = async (app) => {
  // Create Photo Post
  app.post('/', async (request, reply) => {
    try {
      const body = request.body as any
      const authHeader = request.headers.authorization
      let userId = Number(body?.userId)

      if (authHeader) {
        const verified = verifyAuthToken(authHeader)
        if (!verified) {
          return reply.code(401).send({ error: 'Unauthorized: Invalid authentication token' })
        }
        userId = verified.userId
      }

      if (!userId || isNaN(Number(userId))) {
        return reply.code(400).send({ error: 'Missing or invalid userId' })
      }

      const postCaption = String(body?.caption || body?.content || '').slice(0, 1000)
      const postImage = body?.imageUrl || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'

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

      return reply.code(201).send({ success: true, post: newPost })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to create post', details: err.message })
    }
  })

  // Like Post
  app.post('/:id/like', async (request, reply) => {
    const params = request.params as any
    const postId = Number(params.id)
    if (isNaN(postId)) {
      return reply.code(400).send({ error: 'Invalid post ID' })
    }

    try {
      const body = request.body as any
      const authHeader = request.headers.authorization
      let userId = Number(body?.userId) || 1

      if (authHeader) {
        const verified = verifyAuthToken(authHeader)
        if (!verified) {
          return reply.code(401).send({ error: 'Unauthorized: Invalid authentication token' })
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

      return reply.send({
        success: true,
        liked,
        ...(liked ? {} : { message: 'Already liked' }),
        likesCount,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to like post', details: err.message })
    }
  })

  // Get Comments on Post (Keyset cursor paginated)
  app.get('/:id/comments', async (request, reply) => {
    const params = request.params as any
    const postId = Number(params.id)
    if (isNaN(postId)) {
      return reply.code(400).send({ error: 'Invalid post ID' })
    }

    const queryParams = request.query as any
    const cursor = queryParams.cursor ? Number(queryParams.cursor) : null
    const limit = Math.min(Number(queryParams.limit) || 20, 50)

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

      return reply.send({
        postId,
        count: comments.length,
        nextCursor,
        comments,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to fetch comments', details: err.message })
    }
  })

  // Create Comment on Post
  app.post('/:id/comments', async (request, reply) => {
    const params = request.params as any
    const postId = Number(params.id)
    if (isNaN(postId)) {
      return reply.code(400).send({ error: 'Invalid post ID' })
    }

    try {
      const body = request.body as any
      const authHeader = request.headers.authorization
      let userId = Number(body?.userId) || 1

      if (authHeader) {
        const verified = verifyAuthToken(authHeader)
        if (!verified) {
          return reply.code(401).send({ error: 'Unauthorized: Invalid authentication token' })
        }
        userId = verified.userId
      }

      const content = String(body?.content || body?.text || '').trim().slice(0, 500)
      if (!content) {
        return reply.code(400).send({ error: 'Comment content cannot be empty' })
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

      return reply.code(201).send({ success: true, comment })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to create comment', details: err.message })
    }
  })

  // Toggle Save / Bookmark Post
  app.post('/:id/save', async (request, reply) => {
    const params = request.params as any
    const postId = Number(params.id)
    if (isNaN(postId)) {
      return reply.code(400).send({ error: 'Invalid post ID' })
    }

    try {
      const body = request.body as any
      const authHeader = request.headers.authorization
      let userId = Number(body?.userId) || 1

      if (authHeader) {
        const verified = verifyAuthToken(authHeader)
        if (!verified) {
          return reply.code(401).send({ error: 'Unauthorized: Invalid authentication token' })
        }
        userId = verified.userId
      }

      const [deleted] = await sql`
        DELETE FROM saved_posts
        WHERE user_id = ${userId} AND post_id = ${postId}
        RETURNING post_id;
      `

      if (deleted) {
        return reply.send({ success: true, saved: false, message: 'Post removed from saved collection' })
      } else {
        await sql`
          INSERT INTO saved_posts (user_id, post_id, created_at)
          VALUES (${userId}, ${postId}, NOW())
          ON CONFLICT DO NOTHING;
        `
        return reply.send({ success: true, saved: true, message: 'Post saved successfully' })
      }
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to toggle post bookmark', details: err.message })
    }
  })
}