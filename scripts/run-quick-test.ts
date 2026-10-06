const LOADGEN_URL = process.env.LOADGEN_URL || 'https://prod-main-loadgen-e58fbb-00gzy05gj85.compute.instacloud-edge.com'

async function run() {
  console.log('🚀 Triggering 10s benchmark @ 1000 VUs...')
  const res = await fetch(`${LOADGEN_URL}/run?users=1000&duration=10&rampUpSec=2&thinkTimeMs=100&useAuth=true`, {
    signal: AbortSignal.timeout(60000),
  })

  const data = await res.json()
  console.log(JSON.stringify(data, null, 2))
}

run().catch(console.error)
