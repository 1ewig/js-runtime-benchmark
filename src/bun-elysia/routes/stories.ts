import { Elysia, status } from 'elysia'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const storiesRoutes = new Elysia({ prefix: '/api/stories' })

// Get Active Stories Tray for User (From Followed Creators in Last 24 Hours)
storiesRoutes.get('/tray', async ({ headers, query }) => {
  const authHeader = headers['authorization']
  let userId = Number(query.userId) || 1

  if (authHeader) {
    const verified = verifyAuthToken(authHeader)
    if (verified) {
      userId = verified.userId
    }
  }

  try {
    const stories = await sql`
      SELECT
        s.id,
        s.media_url,
        s.created_at,
        s.expires_at,
        u.id as user_id,
        u.username,
        u.display_name,
        u.avatar_url
      FROM stories s
      JOIN users u ON s.user_id = u.id
      WHERE s.user_id IN (
        SELECT following_id FROM follows WHERE follower_id = ${userId}
      )
      AND s.expires_at > NOW()
      ORDER BY s.created_at DESC
      LIMIT 30;
    `

    // Group stories by creator for native Instagram tray format
    const trayMap = new Map<number, any>()
    for (const story of stories) {
      let entry = trayMap.get(story.user_id)
      if (!entry) {
        entry = {
          user: {
            id: story.user_id,
            username: story.username,
            displayName: story.display_name,
            avatarUrl: story.avatar_url,
          },
          items: [],
        }
        trayMap.set(story.user_id, entry)
      }
      entry.items.push({
        id: story.id,
        mediaUrl: story.media_url,
        createdAt: story.created_at,
        expiresAt: story.expires_at,
      })
    }

    const tray = Array.from(trayMap.values())

    return {
      userId,
      creatorsWithStoriesCount: tray.length,
      totalActiveStories: stories.length,
      tray,
    }
  } catch (err: any) {
    return status(500, { error: 'Failed to fetch stories tray', details: err.message })
  }
})

// Create Ephemeral Story (24-Hour TTL)
storiesRoutes.post('/', async ({ headers, request }) => {
  try {
    const body = await request.json().catch(() => ({}))
    const authHeader = headers['authorization']
    let userId = Number((body as any).userId)

    if (authHeader) {
      const verified = verifyAuthToken(authHeader)
      if (!verified) {
        return status(401, { error: 'Unauthorized: Invalid authentication token' })
      }
      userId = verified.userId
    }

    if (!userId || isNaN(userId)) {
      return status(400, { error: 'Missing or invalid userId' })
    }

    const mediaUrl = (body as any).mediaUrl || (body as any).imageUrl || 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720'

    const [story] = await sql`
      INSERT INTO stories (user_id, media_url, created_at, expires_at)
      VALUES (${userId}, ${mediaUrl}, NOW(), NOW() + INTERVAL '24 hours')
      RETURNING id, user_id, media_url, created_at, expires_at;
    `

    return status(201, { success: true, story })
  } catch (err: any) {
    return status(500, { error: 'Failed to create story', details: err.message })
  }
})
