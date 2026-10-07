import { Hono } from 'hono'
import { sql } from '../db'
import { verifyAuthToken } from '../auth'

export const storiesRoutes = new Hono()

// Get Active Stories Tray for User (From Followed Creators in Last 24 Hours)
storiesRoutes.get('/tray', async (c) => {
  const authHeader = c.req.header('authorization')
  let userId = Number(c.req.query('userId')) || 1

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

    return c.json({
      userId,
      creatorsWithStoriesCount: tray.length,
      totalActiveStories: stories.length,
      tray,
    })
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch stories tray', details: err.message }, 500)
  }
})

// Create Ephemeral Story (24-Hour TTL)
storiesRoutes.post('/', async (c) => {
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

    if (!userId || isNaN(userId)) {
      return c.json({ error: 'Missing or invalid userId' }, 400)
    }

    const mediaUrl = body.mediaUrl || body.imageUrl || 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720'

    const [story] = await sql`
      INSERT INTO stories (user_id, media_url, created_at, expires_at)
      VALUES (${userId}, ${mediaUrl}, NOW(), NOW() + INTERVAL '24 hours')
      RETURNING id, user_id, media_url, created_at, expires_at;
    `

    return c.json({ success: true, story }, 201)
  } catch (err: any) {
    return c.json({ error: 'Failed to create story', details: err.message }, 500)
  }
})
