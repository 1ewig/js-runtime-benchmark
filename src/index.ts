const arg = process.argv.slice(2).find((a) => !a.startsWith('-'))
const raw = (arg || process.env.STACK || 'bun-hono').toLowerCase().trim()

const STACK_MAP: Record<string, string> = {
  'bun-hono': 'bun-hono',
  'hono': 'bun-hono',
  'bun-elysia': 'bun-elysia',
  'elysia': 'bun-elysia',
  'node-express': 'node-express',
  'express': 'node-express',
  'node-fastify': 'node-fastify',
  'fastify': 'node-fastify',
}

const stack = STACK_MAP[raw] || 'bun-hono'

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
