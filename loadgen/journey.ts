import { signAuthToken } from './auth'
import type { MetricsCollector } from './metrics'

export interface VirtualUserOptions {
  workerId: number
  users: number
  rampUpSec: number
  thinkTimeMs: number
  targetUrl: string
  useAuth: boolean
  stopTimestamp: number
  collector: MetricsCollector
}

function parseServerTiming(header: string | null): number | null {
  if (!header) return null
  const m = header.match(/dur=([0-9.]+)/)
  return m ? parseFloat(m[1]) : null
}

export async function runVirtualUser(opts: VirtualUserOptions) {
  const {
    workerId,
    users,
    rampUpSec,
    thinkTimeMs,
    targetUrl,
    useAuth,
    stopTimestamp,
    collector,
  } = opts

  const userId = (workerId % 5000) + 1
  let authToken = useAuth ? signAuthToken(userId) : null
  let authHeaders: Record<string, string> = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : {}
  let requestCounter = 0

  let homeCursor: number | null = null
  let exploreCursor: number | null = null

  // Multi-stage ramp-up staggering
  if (rampUpSec > 0) {
    const staggerDelayMs = (workerId / users) * (rampUpSec * 1000)
    await Bun.sleep(staggerDelayMs)
  }

  let targetScheduledTime = performance.now()

  while (Date.now() < stopTimestamp) {
    const dispatchTime = performance.now()
    const scheduleDelay = Math.max(0, dispatchTime - targetScheduledTime)

    requestCounter++
    // Periodically rotate/refresh authentication token (every 20 requests = 5% churn)
    // to benchmark both the fast-path token cache (~95%) and HMAC-SHA256 signature verification (~5%)
    if (useAuth && requestCounter % 20 === 0) {
      authToken = signAuthToken(userId)
      authHeaders = { Authorization: `Bearer ${authToken}` }
    }

    const roll = Math.random()

    if (roll < 0.40) {
      // 40% Home Timeline Scroll
      const t0 = performance.now()
      try {
        const url = `${targetUrl}/api/feed/home?userId=${userId}&${homeCursor ? `cursor=${homeCursor}&` : ''}limit=20`
        const res = await fetch(url, { headers: authHeaders })
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}))
          homeCursor = data.nextCursor || null
          collector.record('homeTimeline', elapsed, scheduleDelay, res.status, null, origin)
        } else {
          await res.text().catch(() => '')
          collector.record('homeTimeline', elapsed, scheduleDelay, res.status, null, origin)
        }
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('homeTimeline', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.60) {
      // 20% Explore Feed Discovery
      const t0 = performance.now()
      try {
        const url = `${targetUrl}/api/feed/explore?${exploreCursor ? `cursor=${exploreCursor}&` : ''}limit=20`
        const res = await fetch(url)
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}))
          exploreCursor = data.nextCursor || null
          collector.record('exploreFeed', elapsed, scheduleDelay, res.status, null, origin)
        } else {
          await res.text().catch(() => '')
          collector.record('exploreFeed', elapsed, scheduleDelay, res.status, null, origin)
        }
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('exploreFeed', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.72) {
      // 12% Stories Tray Fetch (24-hour active stories from followed creators)
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/stories/tray?userId=${userId}`, { headers: authHeaders })
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('storiesTray', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('storiesTray', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.80) {
      // 8% Profile & Photo Grid View (Zipfian skew to top influencers)
      const targetProfileId = Math.floor(Math.random() * 50) + 1
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/users/${targetProfileId}`)
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('profileView', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('profileView', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.85) {
      // 5% Read Post Comments (Keyset cursor paginated)
      const postId = Math.floor(Math.random() * 50000) + 1
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/posts/${postId}/comments?limit=20`)
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('readComments', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('readComments', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.87) {
      // 2% Write Comment on Post (Write transaction incrementing comments_count)
      const postId = Math.floor(Math.random() * 50000) + 1
      const comments = ['Incredible shot! 🔥', 'Love this lighting ✨', 'Stunning composition 👏', 'Clean work! 🚀', 'Great vibes.']
      const content = comments[Math.floor(Math.random() * comments.length)]
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/posts/${postId}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ userId, content }),
        })
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('writeComment', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('writeComment', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.92) {
      // 5% Double-tap Like (Write transaction with auth)
      const postId = Math.floor(Math.random() * 50000) + 1
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/posts/${postId}/like`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ userId }),
        })
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('likePost', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('likePost', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.96) {
      // 4% Search Discovery (Prefix & keyword search for creators and captions)
      const terms = ['dev', 'user_', 'photo', 'sunset', 'cloud', 'tech', 'coffee', 'art']
      const query = terms[Math.floor(Math.random() * terms.length)]
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/search?q=${query}&limit=15`)
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('searchQuery', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('searchQuery', elapsed, scheduleDelay, null, errType, null)
      }
    } else if (roll < 0.98) {
      // 2% Save / Bookmark Post (Toggle save on post)
      const postId = Math.floor(Math.random() * 50000) + 1
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/posts/${postId}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ userId }),
        })
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('savePost', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('savePost', elapsed, scheduleDelay, null, errType, null)
      }
    } else {
      // 2% Follow Creator Toggle (Write transaction with auth)
      let creatorId = Math.floor(Math.random() * 50) + 1
      if (creatorId === userId) creatorId = (creatorId % 50) + 2
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/users/${creatorId}/follow`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders,
          },
          body: JSON.stringify({ followerId: userId }),
        })
        const elapsed = performance.now() - t0
        const origin = parseServerTiming(res.headers.get('server-timing'))
        await res.text().catch(() => '')
        collector.record('followCreator', elapsed, scheduleDelay, res.status, null, origin)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('followCreator', elapsed, scheduleDelay, null, errType, null)
      }
    }

    // Human think time with Pareto/log-normal jitter
    let pauseDuration = 0
    if (thinkTimeMs > 0) {
      const jitterMultiplier = 0.75 + Math.random() * 0.5
      pauseDuration = thinkTimeMs * jitterMultiplier
    }

    // Set target scheduled dispatch for next request BEFORE entering sleep.
    // This ensures any timer slip or event loop contention is accurately recorded as scheduleDelay.
    targetScheduledTime = performance.now() + pauseDuration
    if (pauseDuration > 0) {
      await Bun.sleep(pauseDuration)
    }
  }
}
