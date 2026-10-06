import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL is not set in environment or .env')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 1, ssl: 'require' })

async function migrate() {
  console.log('⚡ Running database migrations...')

  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content VARCHAR(500) NOT NULL,
      likes_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  await sql`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, post_id)
    );
  `

  await sql`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id)
    );
  `

  // Essential indexes for social media read/write patterns
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC);`
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at DESC);`
  await sql`CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes (post_id);`
  await sql`CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes (user_id);`

  console.log('✅ Migrations completed successfully with indexes.')
  await sql.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
