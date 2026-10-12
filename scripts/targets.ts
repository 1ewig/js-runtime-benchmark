export interface StackTarget {
  name: string
  label: string
  url: string
}

export const STACK_TARGETS: Record<string, StackTarget> = {
  'bun-hono': {
    name: 'bun-hono',
    label: '⚡ Bun 1.4.3 + Hono',
    url: 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com',
  },
  'hono': {
    name: 'bun-hono',
    label: '⚡ Bun 1.4.3 + Hono',
    url: 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com',
  },
  'bun-elysia': {
    name: 'bun-elysia',
    label: '🦊 Bun 1.4.3 + Elysia',
    url: 'https://prod-main-api-bun-elysia-a0dd1d-00bw66fwy72.compute.instacloud-edge.com',
  },
  'elysia': {
    name: 'bun-elysia',
    label: '🦊 Bun 1.4.3 + Elysia',
    url: 'https://prod-main-api-bun-elysia-a0dd1d-00bw66fwy72.compute.instacloud-edge.com',
  },
  'node-express': {
    name: 'node-express',
    label: '🟢 Node.js 26 + Express',
    url: 'https://prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com',
  },
  'express': {
    name: 'node-express',
    label: '🟢 Node.js 26 + Express',
    url: 'https://prod-main-api-node-express-d91ff5-00q3502k1xe.compute.instacloud-edge.com',
  },
}

export const UNIQUE_STACKS: StackTarget[] = [
  STACK_TARGETS['bun-hono'],
  STACK_TARGETS['bun-elysia'],
  STACK_TARGETS['node-express'],
]

export const DEFAULT_LOADGEN_URL =
  process.env.LOADGEN_URL || 'https://prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com'

export function resolveStackTarget(rawArgs: string[] = process.argv.slice(2)): StackTarget {
  if (process.env.API_URL) {
    return {
      name: 'custom',
      label: 'Custom API Target',
      url: process.env.API_URL,
    }
  }

  const stackFlag = rawArgs.find((a) => a.startsWith('--stack='))?.split('=')[1]
  const positional = rawArgs.find((a) => !a.startsWith('-'))
  const requested = (stackFlag || positional || process.env.STACK || 'bun-hono').toLowerCase().trim()

  const target = STACK_TARGETS[requested]
  if (target) {
    return target
  }

  if (requested.startsWith('http://') || requested.startsWith('https://')) {
    return {
      name: 'custom',
      label: 'Custom API Target',
      url: requested,
    }
  }

  console.warn(`⚠️ Unknown stack "${requested}". Defaulting to "bun-hono". Available: ${Object.keys(STACK_TARGETS).join(', ')}`)
  return STACK_TARGETS['bun-hono']
}
