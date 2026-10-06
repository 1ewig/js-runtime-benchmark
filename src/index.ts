import { Hono } from 'hono'

const app = new Hono()

app.get('/', (c) => {
  return c.json({
    message: 'Hello from Bun + Hono on InstaCloud! 🚀',
    timestamp: new Date().toISOString(),
    runtime: 'Bun ' + Bun.version,
  })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy', uptime: process.uptime() })
})

const port = Number(process.env.PORT) || 3000

export default {
  port,
  hostname: '0.0.0.0',
  fetch: app.fetch,
}
