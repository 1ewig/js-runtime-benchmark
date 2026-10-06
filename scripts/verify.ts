import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL not found')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 1, ssl: 'require' })

async function verify() {
  const [stats] = await sql`
    SELECT 
      (SELECT count(*)::int FROM users) AS users_count,
      (SELECT count(*)::int FROM posts) AS posts_count,
      (SELECT count(*)::int FROM likes) AS likes_count,
      pg_size_pretty(pg_total_relation_size('users')) AS users_table_size,
      pg_size_pretty(pg_total_relation_size('posts')) AS posts_table_size,
      pg_size_pretty(pg_total_relation_size('likes')) AS likes_table_size;
  `
  console.log('=== TABLE RECORD COUNTS & ON-DISK SIZES ===')
  console.log(stats)

  const sampleUsers = await sql`
    SELECT id, username, display_name, created_at 
    FROM users 
    ORDER BY id 
    LIMIT 2;
  `
  console.log('\n=== SAMPLE USERS ===')
  console.log(sampleUsers)

  const samplePosts = await sql`
    SELECT p.id, p.content, p.likes_count, u.username, p.created_at 
    FROM posts p 
    JOIN users u ON p.user_id = u.id 
    ORDER BY p.created_at DESC 
    LIMIT 2;
  `
  console.log('\n=== SAMPLE POSTS (JOIN WITH USERS) ===')
  console.log(samplePosts)

  await sql.end()
}

verify().catch((err) => {
  console.error('Verification error:', err)
  process.exit(1)
})
