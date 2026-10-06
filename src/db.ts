import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.warn('⚠️ DATABASE_URL is not set. Database queries will fail.')
}

export const sql = postgres(dbUrl || '', {
  max: 20, // Optimized pool size for 2 vCPU / 2 GB microVM
  idle_timeout: 20, // 20s idle connection reap
  connect_timeout: 10,
  prepare: true, // Use prepared statements for higher throughput
  ssl: 'require',
})
