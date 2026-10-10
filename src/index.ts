const stack = process.env.STACK || 'bun-hono'

switch (stack) {
  case 'bun-elysia':
    await import('./bun-elysia/index')
    break
  case 'node-express':
    await import('./node-express/index')
    break
  case 'node-fastify':
    await import('./node-fastify/index')
    break
  case 'bun-hono':
  default:
    await import('./bun-hono/index')
    break
}
