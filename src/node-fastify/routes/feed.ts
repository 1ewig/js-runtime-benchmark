import type { FastifyPluginAsync } from 'fastify'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const feedRoutes: FastifyPluginAsync = async (app) => {
  // Instagram Home Feed: Timeline of posts from accounts the user follows
  app.get('/home', async (request, reply) => {
    const authHeader = request.headers.authorization
    const queryParams = request.query as any
    let userId = Number(queryParams.userId) || 1
    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return reply.code(401).send({ error: 'Unauthorized: Invalid authentication token' })
      }
      userId = verified.userId
    }
    const cursor = queryParams.cursor ? Number(queryParams.cursor) : null
    const limit = Math.min(Number(queryParams.limit) || 20, 50)

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

      return reply.send({
        type: 'home',
        userId,
        count: posts.length,
        nextCursor,
        posts,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to fetch home feed', details: err.message })
    }
  })

  // Instagram Explore Feed: Discovery of popular posts across the platform
  app.get('/explore', async (request, reply) => {
    const queryParams = request.query as any
    const cursor = queryParams.cursor ? Number(queryParams.cursor) : null
    const limit = Math.min(Number(queryParams.limit) || 20, 50)

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

      return reply.send({
        type: 'explore',
        count: posts.length,
        nextCursor,
        posts,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to fetch explore feed', details: err.message })
    }
  })

  // General reverse-chronological feed (backward compatible with /api/feed)
  app.get('/', async (request, reply) => {
    const queryParams = request.query as any
    const cursor = queryParams.cursor ? Number(queryParams.cursor) : null
    const limit = Math.min(Number(queryParams.limit) || 20, 50)

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

      return reply.send({
        count: posts.length,
        nextCursor,
        posts,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to fetch feed', details: err.message })
    }
  })
}