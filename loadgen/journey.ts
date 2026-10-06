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
  const authToken = useAuth ? signAuthToken(userId) : null
  const authHeaders: Record<string, string> = authToken
    ? { Authorization: `Bearer ${authToken}` }
    : {}

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

    const roll = Math.random()

    if (roll < 0.55) {
      // 55% Home Timeline Scroll
      const t0 = performance.now()
      try {
        const url = `${targetUrl}/api/feed/home?userId=${userId}&${homeCursor ? `cursor=${homeCursor}&` : ''}limit=20`
        const res = await fetch(url, { headers: authHeaders })
        const elapsed = performance.now() - t0
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}))
          homeCursor = data.nextCursor || null
          collector.record('homeTimeline', elapsed, scheduleDelay, res.status, null)
        } else {
          await res.text().catch(() => '')
          collector.record('homeTimeline', elapsed, scheduleDelay, res.status, null)
        }
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('homeTimeline', elapsed, scheduleDelay, null, errType)
      }
    } else if (roll < 0.80) {
      // 25% Explore Feed Discovery
      const t0 = performance.now()
      try {
        const url = `${targetUrl}/api/feed/explore?${exploreCursor ? `cursor=${exploreCursor}&` : ''}limit=20`
        const res = await fetch(url)
        const elapsed = performance.now() - t0
        if (res.ok) {
          const data: any = await res.json().catch(() => ({}))
          exploreCursor = data.nextCursor || null
          collector.record('exploreFeed', elapsed, scheduleDelay, res.status, null)
        } else {
          await res.text().catch(() => '')
          collector.record('exploreFeed', elapsed, scheduleDelay, res.status, null)
        }
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('exploreFeed', elapsed, scheduleDelay, null, errType)
      }
    } else if (roll < 0.92) {
      // 12% Profile & Photo Grid View (Zipfian skew to top influencers)
      const targetProfileId = Math.floor(Math.random() * 50) + 1
      const t0 = performance.now()
      try {
        const res = await fetch(`${targetUrl}/api/users/${targetProfileId}`)
        const elapsed = performance.now() - t0
        await res.text().catch(() => '')
        collector.record('profileView', elapsed, scheduleDelay, res.status, null)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('profileView', elapsed, scheduleDelay, null, errType)
      }
    } else if (roll < 0.98) {
      // 6% Double-tap Like (Write transaction with auth)
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
        await res.text().catch(() => '')
        collector.record('likePost', elapsed, scheduleDelay, res.status, null)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('likePost', elapsed, scheduleDelay, null, errType)
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
        await res.text().catch(() => '')
        collector.record('followCreator', elapsed, scheduleDelay, res.status, null)
      } catch (e: any) {
        const elapsed = performance.now() - t0
        const errType = e?.name === 'TimeoutError' ? 'TIMEOUT' : 'FETCH_FAILED'
        collector.record('followCreator', elapsed, scheduleDelay, null, errType)
      }
    }

    // Human think time with Pareto/log-normal jitter
    let pauseDuration = 0
    if (thinkTimeMs > 0) {
      const jitterMultiplier = 0.75 + Math.random() * 0.5
      pauseDuration = thinkTimeMs * jitterMultiplier
      await Bun.sleep(pauseDuration)
    }

    targetScheduledTime = performance.now() + pauseDuration
  }
}
