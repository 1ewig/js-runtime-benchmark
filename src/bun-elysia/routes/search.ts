import { Elysia, status } from 'elysia'
import { sql } from '../../shared/db'

export const searchRoutes = new Elysia({ prefix: '/api/search' })

// Fast Explore & Discovery Search
searchRoutes.get('/', async ({ query }) => {
  const q = String(query.q || '').trim()
  const type = String(query.type || 'all').toLowerCase()
  const limit = Math.min(Number(query.limit) || 15, 30)

  if (!q) {
    return { query: '', users: [], posts: [] }
  }

  try {
    const pattern = `${q.toLowerCase()}%`
    const containsPattern = `%${q.toLowerCase()}%`

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

    return {
      query: q,
      type,
      usersCount: matchedUsers.length,
      postsCount: matchedPosts.length,
      users: matchedUsers,
      posts: matchedPosts,
    }
  } catch (err: any) {
    return status(500, { error: 'Search failed', details: err.message })
  }
})
