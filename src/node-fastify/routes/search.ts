import type { FastifyPluginAsync } from 'fastify'
import { sql } from '../../shared/db'

export const searchRoutes: FastifyPluginAsync = async (app) => {
  // Fast Explore & Discovery Search
  app.get('/', async (request, reply) => {
    const queryParams = request.query as any
    const query = String(queryParams.q || '').trim()
    const type = String(queryParams.type || 'all').toLowerCase()
    const limit = Math.min(Number(queryParams.limit) || 15, 30)

    if (!query) {
      return reply.send({ query: '', users: [], posts: [] })
    }

    try {
      const pattern = `${query.toLowerCase()}%`
      const containsPattern = `%${query.toLowerCase()}%`

      const userQueryPromise = (type === 'users' || type === 'all')
        ? sql`
            SELECT id, username, display_name, avatar_url, followers_count, posts_count
            FROM users
            WHERE lower(username) LIKE ${pattern} OR lower(display_name) LIKE ${containsPattern}
            ORDER BY followers_count DESC
            LIMIT ${limit};
          `
        : Promise.resolve([])

      const postQueryPromise = (type === 'posts' || type === 'all')
        ? sql`
            SELECT
              p.id,
              p.image_url,
              p.caption,
              p.likes_count,
              p.comments_count,
              p.created_at,
              u.username,
              u.avatar_url
            FROM posts p
            JOIN users u ON p.user_id = u.id
            WHERE lower(p.caption) LIKE ${containsPattern}
            ORDER BY p.likes_count DESC
            LIMIT ${limit};
          `
        : Promise.resolve([])

      const [matchedUsers, matchedPosts] = await Promise.all([userQueryPromise, postQueryPromise])

      return reply.send({
        query,
        type,
        usersCount: matchedUsers.length,
        postsCount: matchedPosts.length,
        users: matchedUsers,
        posts: matchedPosts,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Search failed', details: err.message })
    }
  })
}