import { Hono } from 'hono'
import { sql } from '../../shared/db'

export const searchRoutes = new Hono()

// Fast Explore & Discovery Search
searchRoutes.get('/', async (c) => {
  const query = String(c.req.query('q') || '').trim()
  const type = String(c.req.query('type') || 'all').toLowerCase()
  const limit = Math.min(Number(c.req.query('limit')) || 15, 30)

  if (!query) {
    return c.json({ query: '', users: [], posts: [] })
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

    return c.json({
      query,
      type,
      usersCount: matchedUsers.length,
      postsCount: matchedPosts.length,
      users: matchedUsers,
      posts: matchedPosts,
    })
  } catch (err: any) {
    return c.json({ error: 'Search failed', details: err.message }, 500)
  }
})
