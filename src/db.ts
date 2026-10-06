import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.warn('⚠️ DATABASE_URL is not set. Database queries will fail.')
}

const poolMax = Number(process.env.DB_POOL_MAX) || 25

export const sql = postgres(dbUrl || '', {
  max: poolMax, // Tuned pool size for high concurrency
  idle_timeout: 20, // 20s idle connection reap
  connect_timeout: 10,
  prepare: true, // Use prepared statements for higher throughput
  ssl: 'require',
})
