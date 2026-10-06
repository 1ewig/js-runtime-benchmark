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
      (SELECT count(*)::int FROM follows) AS follows_count,
      (SELECT count(*)::int FROM comments) AS comments_count,
      pg_size_pretty(pg_total_relation_size('users')) AS users_size,
      pg_size_pretty(pg_total_relation_size('posts')) AS posts_size,
      pg_size_pretty(pg_total_relation_size('likes')) AS likes_size,
      pg_size_pretty(pg_total_relation_size('follows')) AS follows_size;
  `
  console.log('=== TABLE RECORD COUNTS & ON-DISK SIZES ===')
  console.log(stats)

  const sampleUsers = await sql`
    SELECT id, username, display_name, bio, followers_count, following_count, posts_count, created_at 
    FROM users 
    ORDER BY id 
    LIMIT 2;
  `
  console.log('\n=== SAMPLE USERS (WITH INSTAGRAM PROFILE FIELDS) ===')
  console.log(sampleUsers)

  const samplePosts = await sql`
    SELECT p.id, p.user_id, u.username, p.image_url, p.caption, p.likes_count, p.comments_count, p.created_at 
    FROM posts p 
    JOIN users u ON p.user_id = u.id 
    ORDER BY p.id DESC 
    LIMIT 2;
  `
  console.log('\n=== SAMPLE POSTS (WITH INSTAGRAM MEDIA FIELDS) ===')
  console.log(samplePosts)

  const indexes = await sql`
    SELECT tablename, indexname 
    FROM pg_indexes 
    WHERE schemaname = 'public' 
    ORDER BY tablename, indexname;
  `
  console.log('\n=== VERIFIED DATABASE INDEXES ===')
  console.table(indexes)

  await sql.end()
}

verify().catch((err) => {
  console.error('Verification error:', err)
  process.exit(1)
})
