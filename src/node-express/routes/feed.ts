import { Router } from 'express'
import { sql } from '../../shared/db'
import { verifyAuthToken } from '../../shared/auth'

export const feedRoutes = Router()

// Instagram Home Feed: Timeline of posts from accounts the user follows
feedRoutes.get('/home', async (req, res) => {
  const authHeader = req.get('authorization')
  let userId = Number(req.query.userId) || 1
  if (authHeader) {
    const verified = verifyAuthToken(authHeader)
    if (!verified) {
      return res.status(401).json({ error: 'Unauthorized: Invalid authentication token' })
    }
    userId = verified.userId
  }
  const cursor = req.query.cursor ? Number(req.query.cursor) : null
  const limit = Math.min(Number(req.query.limit) || 20, 50)

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

    return res.json({
      type: 'home',
      userId,
      count: posts.length,
      nextCursor,
      posts,
    })
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch home feed', details: err.message })
  }
})

// Instagram Explore Feed: Discovery of popular posts across the platform
feedRoutes.get('/explore', async (req, res) => {
  const cursor = req.query.cursor ? Number(req.query.cursor) : null
  const limit = Math.min(Number(req.query.limit) || 20, 50)

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

    return res.json({
      type: 'explore',
      count: posts.length,
      nextCursor,
      posts,
    })
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch explore feed', details: err.message })
  }
})

// General reverse-chronological feed (backward compatible with /api/feed)
feedRoutes.get('/', async (req, res) => {
  const cursor = req.query.cursor ? Number(req.query.cursor) : null
  const limit = Math.min(Number(req.query.limit) || 20, 50)

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

    return res.json({
      count: posts.length,
      nextCursor,
      posts,
    })
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch feed', details: err.message })
  }
})
