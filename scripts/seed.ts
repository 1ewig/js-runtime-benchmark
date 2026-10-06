import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL is not set in environment or .env')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 10, ssl: 'require' })

const sampleSnippets = [
  'Just deployed my first Bun + Hono API on InstaCloud! Insanely fast ⚡',
  'Thinking about distributed systems and cache invalidation today...',
  'Who else is building serverless microVM architectures in 2026?',
  'Coffee in hand, terminal open. Let’s ship some high-throughput code.',
  'Postgres indexes really make or break your p99 latencies under load.',
  'Benchmarking database connection pooling. Noticeable improvements!',
  'Clean code is great, but robust and observable systems are even better.',
  'Working on real-time feed algorithms today. Graph queries vs Denormalization.',
  'The shift towards agent-native cloud infrastructure is fascinating.',
  'Scaling to zero when idle saves so much budget and computing resources.',
]

async function seed() {
  const startTime = Date.now()
  console.log('🌱 Starting database seeding...')

  // Check if already seeded
  const [{ count: existingUsers }] = await sql`SELECT count(*)::int FROM users`
  if (existingUsers > 0) {
    console.log(`ℹ️ Database already has ${existingUsers} users. Skipping user insertion or cleaning first...`)
  }

  // 1. Generate & Insert 5,000 Users
  console.log('👥 Inserting 5,000 users in batches...')
  const USER_COUNT = 5000
  const USER_BATCH_SIZE = 1000

  for (let i = 0; i < USER_COUNT; i += USER_BATCH_SIZE) {
    const usersBatch = []
    for (let j = 0; j < USER_BATCH_SIZE && i + j < USER_COUNT; j++) {
      const idx = i + j + 1
      usersBatch.push({
        username: `user_${idx}`,
        display_name: `Dev User #${idx}`,
        avatar_url: `https://api.dicebear.com/7.x/identicon/svg?seed=user_${idx}`,
        created_at: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)),
      })
    }
    await sql`
      INSERT INTO users ${sql(usersBatch, 'username', 'display_name', 'avatar_url', 'created_at')}
      ON CONFLICT (username) DO NOTHING
    `
    process.stdout.write(`  Inserted ${Math.min(i + USER_BATCH_SIZE, USER_COUNT)} / ${USER_COUNT} users\r`)
  }
  console.log(`\n✅ 5,000 Users inserted.`)

  // 2. Fetch min and max user IDs
  const [{ min: minUserId, max: maxUserId }] = await sql`SELECT min(id)::int, max(id)::int FROM users`
  console.log(`📍 User ID range: ${minUserId} to ${maxUserId}`)

  // 3. Generate & Insert 50,000 Posts
  console.log('📝 Inserting 50,000 posts in batches...')
  const POST_COUNT = 50000
  const POST_BATCH_SIZE = 2000

  for (let i = 0; i < POST_COUNT; i += POST_BATCH_SIZE) {
    const postsBatch = []
    for (let j = 0; j < POST_BATCH_SIZE && i + j < POST_COUNT; j++) {
      const randomUserId = Math.floor(Math.random() * (maxUserId - minUserId + 1)) + minUserId
      const snippet = sampleSnippets[Math.floor(Math.random() * sampleSnippets.length)]
      postsBatch.push({
        user_id: randomUserId,
        content: `${snippet} [#${i + j + 1}]`,
        likes_count: 0,
        created_at: new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)),
      })
    }
    await sql`
      INSERT INTO posts ${sql(postsBatch, 'user_id', 'content', 'likes_count', 'created_at')}
    `
    process.stdout.write(`  Inserted ${Math.min(i + POST_BATCH_SIZE, POST_COUNT)} / ${POST_COUNT} posts\r`)
  }
  console.log(`\n✅ 50,000 Posts inserted.`)

  // 4. Fetch min and max post IDs
  const [{ min: minPostId, max: maxPostId }] = await sql`SELECT min(id)::int, max(id)::int FROM posts`
  console.log(`📍 Post ID range: ${minPostId} to ${maxPostId}`)

  // 5. Generate & Insert 100,000 Likes
  console.log('❤️ Inserting 100,000 likes in batches...')
  const LIKE_COUNT = 100000
  const LIKE_BATCH_SIZE = 2500

  for (let i = 0; i < LIKE_COUNT; i += LIKE_BATCH_SIZE) {
    const likesBatch = []
    const seenPairs = new Set<string>()

    while (likesBatch.length < LIKE_BATCH_SIZE && i + likesBatch.length < LIKE_COUNT) {
      const randomUserId = Math.floor(Math.random() * (maxUserId - minUserId + 1)) + minUserId
      const randomPostId = Math.floor(Math.random() * (maxPostId - minPostId + 1)) + minPostId
      const pairKey = `${randomUserId}-${randomPostId}`
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey)
        likesBatch.push({
          user_id: randomUserId,
          post_id: randomPostId,
          created_at: new Date(),
        })
      }
    }

    await sql`
      INSERT INTO likes ${sql(likesBatch, 'user_id', 'post_id', 'created_at')}
      ON CONFLICT DO NOTHING
    `
    process.stdout.write(`  Inserted ${Math.min(i + LIKE_BATCH_SIZE, LIKE_COUNT)} / ${LIKE_COUNT} likes\r`)
  }
  console.log(`\n✅ 100,000 Likes inserted.`)

  // 6. Update likes_count in posts table for consistency
  console.log('🔄 Syncing likes_count counters...')
  await sql`
    UPDATE posts p
    SET likes_count = sub.count
    FROM (
      SELECT post_id, count(*)::int AS count
      FROM likes
      GROUP BY post_id
    ) sub
    WHERE p.id = sub.post_id;
  `
  console.log('✅ likes_count synced.')

  // Final verification
  const [{ count: finalUsers }] = await sql`SELECT count(*)::int FROM users`
  const [{ count: finalPosts }] = await sql`SELECT count(*)::int FROM posts`
  const [{ count: finalLikes }] = await sql`SELECT count(*)::int FROM likes`

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log('\n📊 Seeding Complete Summary:')
  console.log(`   - Users: ${finalUsers.toLocaleString()}`)
  console.log(`   - Posts: ${finalPosts.toLocaleString()}`)
  console.log(`   - Likes: ${finalLikes.toLocaleString()}`)
  console.log(`   - Elapsed Time: ${elapsed}s`)

  await sql.end()
}

seed().catch((err) => {
  console.error('Seeding error:', err)
  process.exit(1)
})
