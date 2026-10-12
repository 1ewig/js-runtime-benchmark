import type { FastifyPluginAsync } from 'fastify'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const storiesRoutes: FastifyPluginAsync = async (app) => {
  // Get Active Stories Tray for User (From Followed Creators in Last 24 Hours)
  app.get('/tray', async (request, reply) => {
    const authHeader = request.headers.authorization
    const queryParams = request.query as any
    let userId = Number(queryParams.userId) || 1

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

      return reply.send({
        userId,
        creatorsWithStoriesCount: tray.length,
        totalActiveStories: stories.length,
        tray,
      })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to fetch stories tray', details: err.message })
    }
  })

  // Create Ephemeral Story (24-Hour TTL)
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

      if (!userId || isNaN(userId)) {
        return reply.code(400).send({ error: 'Missing or invalid userId' })
      }

      const mediaUrl = body?.mediaUrl || body?.imageUrl || 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=720'

      const [story] = await sql`
        INSERT INTO stories (user_id, media_url, created_at, expires_at)
        VALUES (${userId}, ${mediaUrl}, NOW(), NOW() + INTERVAL '24 hours')
        RETURNING id, user_id, media_url, created_at, expires_at;
      `

      return reply.code(201).send({ success: true, story })
    } catch (err: any) {
      return reply.code(500).send({ error: 'Failed to create story', details: err.message })
    }
  })
}