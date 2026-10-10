import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

const stack = process.argv[2] || 'bun-hono'

const STACK_MAP: Record<string, { group: string; dockerfile: string }> = {
  'bun-hono': { group: 'api-bun-hono', dockerfile: 'Dockerfile.bun-hono' },
  'hono': { group: 'api-bun-hono', dockerfile: 'Dockerfile.bun-hono' },
  'bun-elysia': { group: 'api-bun-elysia', dockerfile: 'Dockerfile.bun-elysia' },
  'elysia': { group: 'api-bun-elysia', dockerfile: 'Dockerfile.bun-elysia' },
  'node-express': { group: 'api-node-express', dockerfile: 'Dockerfile.node-express' },
  'express': { group: 'api-node-express', dockerfile: 'Dockerfile.node-express' },
  'node-fastify': { group: 'api-node-fastify', dockerfile: 'Dockerfile.node-fastify' },
  'fastify': { group: 'api-node-fastify', dockerfile: 'Dockerfile.node-fastify' },
}

const config = STACK_MAP[stack]
if (!config) {
  console.error(`❌ Unknown stack "${stack}". Supported stacks: ${Object.keys(STACK_MAP).join(', ')}`)
  process.exit(1)
}

const dockerSrc = join(process.cwd(), 'docker', config.dockerfile)
const dockerDest = join(process.cwd(), 'Dockerfile')

if (!existsSync(dockerSrc)) {
  console.error(`❌ Dockerfile template not found: ${dockerSrc}`)
  process.exit(1)
}

console.log(`\n🐳 [Deploy] Preparing Dockerfile for "${stack}"...`)
copyFileSync(dockerSrc, dockerDest)
console.log(`   ✅ Synced ${config.dockerfile} -> Dockerfile`)
console.log(`🚀 [Deploy] Deploying to InstaCloud group: "${config.group}" (Port 3000)...`)

const isWindows = process.platform === 'win32'
const cmd = isWindows ? 'cmd.exe' : 'bunx'
const args = isWindows
  ? ['/c', 'bunx', 'insta', 'deploy', '.', '--group', config.group, '--port', '3000']
  : ['insta', 'deploy', '.', '--group', config.group, '--port', '3000']

const proc = spawn(cmd, args, { stdio: 'inherit' })

proc.on('close', (code) => {
  try {
    if (existsSync(dockerDest)) {
      unlinkSync(dockerDest)
    }
  } catch {}

  if (code === 0) {
    console.log(`\n✨ [Deploy] Successfully deployed stack "${stack}" to InstaCloud group "${config.group}"!\n`)
  } else {
    console.error(`\n❌ [Deploy] Deployment exited with code ${code}`)
    process.exit(code || 1)
  }
})
