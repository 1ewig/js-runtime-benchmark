import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL is not set')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 1, ssl: 'require' })

async function optimizeDb() {
  console.log('⚡ Applying Database Performance Optimizations...')

  // 1. Enable pg_trgm extension for fast substring & ILIKE searches
  console.log('1️⃣ Enabling pg_trgm extension...')
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`
    console.log('   ✅ pg_trgm extension enabled successfully.')
  } catch (err: any) {
    console.warn('   ⚠️ Could not enable pg_trgm:', err.message)
  }

  // 2. Add GIN Trigram Indexes for instant substring searches
  console.log('2️⃣ Creating GIN Trigram Indexes for Search Discovery...')
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_posts_caption_trgm ON posts USING gin (lower(caption) gin_trgm_ops);`
    await sql`CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm ON users USING gin (lower(display_name) gin_trgm_ops);`
    await sql`CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (lower(username) gin_trgm_ops);`
    console.log('   ✅ GIN Trigram indexes created on posts and users.')
  } catch (err: any) {
    console.warn('   ⚠️ Trigram index creation notice:', err.message)
  }

  // 3. Optimize Stories Indexing (user_id + created_at DESC)
  console.log('3️⃣ Creating optimized composite index for active stories...')
  try {
    await sql`CREATE INDEX IF NOT EXISTS idx_stories_user_created ON stories (user_id, created_at DESC);`
    console.log('   ✅ idx_stories_user_created created.')
  } catch (err: any) {
    console.warn('   ⚠️ Stories index creation notice:', err.message)
  }

  // 4. Run ANALYZE to update PostgreSQL query planner statistics
  console.log('4️⃣ Analyzing tables for PostgreSQL query planner...')
  await sql`ANALYZE users;`
  await sql`ANALYZE posts;`
  await sql`ANALYZE follows;`
  await sql`ANALYZE likes;`
  await sql`ANALYZE comments;`
  await sql`ANALYZE stories;`
  await sql`ANALYZE saved_posts;`
  console.log('   ✅ Table statistics updated.')

  console.log('\n🎉 Database optimizations completed successfully!')
  await sql.end()
}

optimizeDb().catch((err) => {
  console.error('Optimization error:', err)
  process.exit(1)
})
