import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL is not set in environment or .env')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 1, ssl: 'require' })

async function migrate() {
  console.log('⚡ Running Instagram schema migrations...')

  // 1. Users table
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      display_name VARCHAR(100) NOT NULL,
      avatar_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(250) DEFAULT '';`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS followers_count INTEGER NOT NULL DEFAULT 0;`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS following_count INTEGER NOT NULL DEFAULT 0;`
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS posts_count INTEGER NOT NULL DEFAULT 0;`

  // 2. Posts table
  await sql`
    CREATE TABLE IF NOT EXISTS posts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content VARCHAR(500) NOT NULL DEFAULT '',
      likes_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800';`
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS caption VARCHAR(1000) DEFAULT '';`
  await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS comments_count INTEGER NOT NULL DEFAULT 0;`

  // Sync existing content into caption if empty
  await sql`UPDATE posts SET caption = content WHERE (caption IS NULL OR caption = '') AND content != '';`

  // 3. Likes table
  await sql`
    CREATE TABLE IF NOT EXISTS likes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, post_id)
    );
  `

  // 4. Follows table
  await sql`
    CREATE TABLE IF NOT EXISTS follows (
      follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (follower_id, following_id)
    );
  `

  // 5. Comments table
  await sql`
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content VARCHAR(500) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `

  // 6. Ephemeral Stories table (24h validity)
  await sql`
    CREATE TABLE IF NOT EXISTS stories (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      media_url TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
    );
  `

  // 7. Saved Posts / Bookmarks table
  await sql`
    CREATE TABLE IF NOT EXISTS saved_posts (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, post_id)
    );
  `

  // High-throughput indexes tailored for Instagram access patterns
  console.log('📌 Creating and verifying indexes...')
  // Home feed fan-in keyset lookup: WHERE user_id IN (...) AND id < cursor ORDER BY id DESC
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_user_id_id ON posts (user_id, id DESC);`
  // Explore / trending feed lookup
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_likes_id ON posts (likes_count DESC, id DESC);`
  // Reverse follow graph lookup: "who follows user X"
  await sql`CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows (following_id);`
  // Direct post and like lookups
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts (user_id, created_at DESC);`
  await sql`CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes (post_id);`
  await sql`CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes (user_id);`
  await sql`CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments (post_id, id DESC);`
  // Stories tray lookup: active stories from followed users
  await sql`CREATE INDEX IF NOT EXISTS idx_stories_user_expires ON stories (user_id, expires_at DESC);`
  await sql`CREATE INDEX IF NOT EXISTS idx_stories_expires_at ON stories (expires_at DESC);`
  // Saved posts lookup: user's bookmarks
  await sql`CREATE INDEX IF NOT EXISTS idx_saved_posts_user ON saved_posts (user_id, created_at DESC);`
  // Search lookup by username
  await sql`CREATE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));`

  // GIN Trigram indexes for fast text search
  await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm;`
  await sql`CREATE INDEX IF NOT EXISTS idx_posts_caption_trgm ON posts USING gin (lower(caption) gin_trgm_ops);`
  await sql`CREATE INDEX IF NOT EXISTS idx_users_display_name_trgm ON users USING gin (lower(display_name) gin_trgm_ops);`
  await sql`CREATE INDEX IF NOT EXISTS idx_users_username_trgm ON users USING gin (lower(username) gin_trgm_ops);`
  await sql`CREATE INDEX IF NOT EXISTS idx_stories_user_created ON stories (user_id, created_at DESC);`

  console.log('✅ Instagram schema & index migrations completed successfully.')
  await sql.end()
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
