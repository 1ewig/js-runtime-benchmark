const arg = process.argv.slice(2).find((a) => !a.startsWith('-'))
const raw = (arg || process.env.STACK)?.toLowerCase().trim()

if (!raw) {
  console.error(`❌ No stack specified to run locally.\n`)
  console.error(`Please provide a stack to start:`)
  console.error(`  • hono     (Bun 1.4.3 + Hono)`)
  console.error(`  • elysia   (Bun 1.4.3 + Elysia)`)
  console.error(`  • express  (Node.js 26 + Express)`)
  console.error(`  • fastify  (Node.js 26 + Fastify)\n`)
  console.error(`Usage:`)
  console.error(`  bun run start <stack>`)
  console.error(`  e.g. bun run start hono`)
  console.error(`       bun run start elysia\n`)
  process.exit(1)
}

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

const stack = STACK_MAP[raw]

if (!stack) {
  console.error(`❌ Unknown stack "${raw}". Supported stacks: ${Object.keys(STACK_MAP).join(', ')}`)
  process.exit(1)
}

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
    await import('./bun-hono/index')
    break
}
