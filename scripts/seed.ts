import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL is not set in environment or .env')
  process.exit(1)
}

const sql = postgres(dbUrl, { max: 10, ssl: 'require' })

const curatedPhotos = [
  'photo-1512917774080-9991f1c4c750', // architecture
  'photo-1507525428034-b723cf961d3e', // beach/ocean
  'photo-1519681393784-d120267933ba', // starry mountains
  'photo-1517841905240-472988babdf9', // portrait
  'photo-1565299624946-b28f40a0ae38', // artisan pizza
  'photo-1498050108023-c5249f4df085', // tech setup
  'photo-1470071459604-3b5ec3a7fe05', // misty forest
  'photo-1488646953014-85cb44e25828', // travel suitcase
  'photo-1515378791036-0648a3ef77b2', // aesthetic workspace
  'photo-1534447677768-be436bb09401', // northern lights
  'photo-1504674900247-0877df9cc836', // culinary dish
  'photo-1492691527719-9d1e07e534b4', // street photography
  'photo-1526778548025-fa2f459cd5c1', // coastal cliffs
  'photo-1469474968028-56623f02e42e', // nature trail
  'photo-1500648767791-00dcc994a43e', // creator portrait
  'photo-1494790108377-be9c29b29330', // studio portrait
  'photo-1539571696357-5a69c17a67c6', // urban fashion
  'photo-1522071820081-009f0129c71c', // collaborative team
  'photo-1464822759023-fed622ff2c3b', // snowy peaks
  'photo-1518791841217-8f162f1e1131', // cozy cat
  'photo-1543610892-0b1f7e6d8ac1', // abstract gradient
  'photo-1531297484001-80022131f5a1', // cyberpunk laptop
  'photo-1550745165-9bc0b252726f', // retro arcade
  'photo-1516259762381-22954d7d3ad2', // code editor
  'photo-1493770348161-369560ae357d', // brunch table
]

const sampleBios = [
  '📸 Visual storyteller & photographer | 📍 NYC',
  '⚡ Building high-throughput cloud infrastructure @ InstaCloud',
  '🌿 Nature lover | Weekend hiker | Coffee enthusiast ☕',
  '🎨 Digital artist & UI/UX designer. Making the web beautiful.',
  '🚀 Tech founder & investor. Obsessed with distributed systems.',
  '🍕 Pizza connoisseur | Exploring hidden food gems worldwide',
  '📚 Reading 50 books a year | Writing about life and philosophy',
  '🏃 Marathon runner & fitness coach | Daily motivation',
  '✨ Lifestyle, aesthetics, and minimalist living',
  '🎵 Music producer & sound designer | Synthesizers & beats',
  '🌍 42 countries and counting. Wandering with a camera.',
  '💻 Rust, Bun & TypeScript developer. Building the future.',
  '🌊 Surfer, ocean activist, and drone videographer',
  '🍵 Matcha obsessed | Interior design & plant parent',
  '🎮 Game developer | Pixel art & retro nostalgia',
]

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

const sampleComments = [
  'Stunning shot! 🔥',
  'Love the lighting and composition here.',
  'What camera did you use for this?',
  'This is incredible 👏',
  'Major inspiration right here.',
  'Vibes are immaculate ✨',
  'Great perspective on this one.',
  'Adding this to my bucket list 📍',
  'So clean! Keep shipping.',
  'Obsessed with this color palette.',
]

async function seed() {
  const startTime = Date.now()
  console.log('🌱 Starting comprehensive Instagram database seeding...')

  // 0. Clean slate truncate
  console.log('🧹 Wiping and resetting all tables with RESTART IDENTITY CASCADE...')
  await sql`TRUNCATE TABLE users, posts, likes, follows, comments, stories, saved_posts RESTART IDENTITY CASCADE;`
  console.log('✅ Clean slate ready.')

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
        bio: sampleBios[idx % sampleBios.length],
        followers_count: 0,
        following_count: 0,
        posts_count: 0,
        created_at: new Date(Date.now() - Math.floor(Math.random() * 30 * 86400000)),
      })
    }
    await sql`
      INSERT INTO users ${sql(usersBatch, 'username', 'display_name', 'avatar_url', 'bio', 'followers_count', 'following_count', 'posts_count', 'created_at')}
      ON CONFLICT (username) DO NOTHING
    `
    process.stdout.write(`  Inserted ${Math.min(i + USER_BATCH_SIZE, USER_COUNT)} / ${USER_COUNT} users\r`)
  }
  console.log(`\n✅ 5,000 Users ready.`)

  // 2. Fetch min and max user IDs
  const [{ min: minUserId, max: maxUserId }] = await sql`SELECT min(id)::int, max(id)::int FROM users`
  console.log(`📍 User ID range: ${minUserId} to ${maxUserId}`)

  // 3. Generate & Insert 50,000 Posts with Media
  console.log('📝 Inserting 50,000 photo posts in batches...')
  const POST_COUNT = 50000
  const POST_BATCH_SIZE = 2000

  const [{ count: existingPosts }] = await sql`SELECT count(*)::int FROM posts`
  if (existingPosts < POST_COUNT) {
    for (let i = existingPosts; i < POST_COUNT; i += POST_BATCH_SIZE) {
      const postsBatch = []
      for (let j = 0; j < POST_BATCH_SIZE && i + j < POST_COUNT; j++) {
        const randomUserId = Math.floor(Math.random() * (maxUserId - minUserId + 1)) + minUserId
        const snippet = sampleSnippets[Math.floor(Math.random() * sampleSnippets.length)]
        const photoId = curatedPhotos[(i + j) % curatedPhotos.length]
        const imgUrl = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=800&q=80`

        postsBatch.push({
          user_id: randomUserId,
          content: `${snippet} [#${i + j + 1}]`,
          caption: `${snippet} [#${i + j + 1}]`,
          image_url: imgUrl,
          likes_count: 0,
          comments_count: 0,
          created_at: new Date(Date.now() - Math.floor(Math.random() * 14 * 86400000)),
        })
      }
      await sql`
        INSERT INTO posts ${sql(postsBatch, 'user_id', 'content', 'caption', 'image_url', 'likes_count', 'comments_count', 'created_at')}
      `
      process.stdout.write(`  Inserted ${Math.min(i + POST_BATCH_SIZE, POST_COUNT)} / ${POST_COUNT} posts\r`)
    }
  }
  console.log(`\n✅ Posts ready.`)

  // 4. Fetch min and max post IDs
  const [{ min: minPostId, max: maxPostId }] = await sql`SELECT min(id)::int, max(id)::int FROM posts`

  // 5. Generate & Insert Follows Graph (Power-Law Distribution)
  console.log('🤝 Ensuring ~150,000 follow connections...')
  const [{ count: existingFollows }] = await sql`SELECT count(*)::int FROM follows`
  if (existingFollows < 100000) {
    const topInfluencerThreshold = Math.min(minUserId + 50, maxUserId)
    const TARGET_FOLLOWS = 150000
    const FOLLOW_BATCH_SIZE = 2500
    let insertedCount = existingFollows
    const pairsBatch: { follower_id: number; following_id: number }[] = []

    for (let followerId = minUserId; followerId <= maxUserId && insertedCount < TARGET_FOLLOWS; followerId++) {
      const followsToMake = Math.floor(Math.random() * 21) + 25

      for (let f = 0; f < followsToMake; f++) {
        const followingId = Math.random() < 0.70
          ? Math.floor(Math.random() * (topInfluencerThreshold - minUserId + 1)) + minUserId
          : Math.floor(Math.random() * (maxUserId - minUserId + 1)) + minUserId

        if (followerId === followingId) continue

        pairsBatch.push({ follower_id: followerId, following_id: followingId })
        if (pairsBatch.length >= FOLLOW_BATCH_SIZE) {
          await sql`
            INSERT INTO follows ${sql(pairsBatch, 'follower_id', 'following_id')}
            ON CONFLICT DO NOTHING
          `
          insertedCount += pairsBatch.length
          pairsBatch.length = 0
          process.stdout.write(`  Follows: ${insertedCount.toLocaleString()} / ~${TARGET_FOLLOWS.toLocaleString()}\r`)
        }
      }
    }
    if (pairsBatch.length > 0) {
      await sql`
        INSERT INTO follows ${sql(pairsBatch, 'follower_id', 'following_id')}
        ON CONFLICT DO NOTHING
      `
    }
  }
  console.log(`\n✅ Follow graph ready.`)

  // 6. Generate & Insert 100,000 Likes
  console.log('❤️ Ensuring likes are populated...')
  const [{ count: existingLikes }] = await sql`SELECT count(*)::int FROM likes`
  if (existingLikes < 100000) {
    const LIKE_COUNT = 100000
    const LIKE_BATCH_SIZE = 2500
    for (let i = existingLikes; i < LIKE_COUNT; i += LIKE_BATCH_SIZE) {
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
    }
  }
  console.log(`✅ Likes ready.`)

  // 7. Generate & Insert 25,000 Comments
  console.log('💬 Ensuring comments are populated...')
  const [{ count: existingComments }] = await sql`SELECT count(*)::int FROM comments`
  if (existingComments < 25000) {
    const COMMENT_COUNT = 25000
    const COMMENT_BATCH_SIZE = 2500
    for (let i = existingComments; i < COMMENT_COUNT; i += COMMENT_BATCH_SIZE) {
      const commentsBatch = []
      for (let j = 0; j < COMMENT_BATCH_SIZE && i + j < COMMENT_COUNT; j++) {
        const randomUserId = Math.floor(Math.random() * (maxUserId - minUserId + 1)) + minUserId
        const randomPostId = Math.floor(Math.random() * (maxPostId - minPostId + 1)) + minPostId
        const commentText = sampleComments[(i + j) % sampleComments.length]
        commentsBatch.push({
          post_id: randomPostId,
          user_id: randomUserId,
          content: commentText,
          created_at: new Date(Date.now() - Math.floor(Math.random() * 7 * 86400000)),
        })
      }
      await sql`
        INSERT INTO comments ${sql(commentsBatch, 'post_id', 'user_id', 'content', 'created_at')}
      `
      process.stdout.write(`  Comments: ${Math.min(i + COMMENT_BATCH_SIZE, COMMENT_COUNT).toLocaleString()} / ${COMMENT_COUNT.toLocaleString()}\r`)
    }
    console.log('\n✅ Comments ready.')
  }

  // 8. Generate & Insert ~2,500 Active Stories (Expires in +12h to +24h)
  console.log('📱 Populating active ephemeral stories...')
  const [{ count: existingStories }] = await sql`SELECT count(*)::int FROM stories WHERE expires_at > NOW()`
  if (existingStories < 2500) {
    const topCreators = Math.min(minUserId + 250, maxUserId)
    const storiesBatch = []
    for (let u = minUserId; u <= topCreators; u++) {
      const storiesCount = Math.floor(Math.random() * 10) + 1
      for (let s = 0; s < storiesCount; s++) {
        const photoId = curatedPhotos[(u + s) % curatedPhotos.length]
        const hoursLeft = Math.floor(Math.random() * 20) + 4
        storiesBatch.push({
          user_id: u,
          media_url: `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=720&q=80`,
          created_at: new Date(Date.now() - Math.floor(Math.random() * 4 * 3600000)),
          expires_at: new Date(Date.now() + hoursLeft * 3600000),
        })
      }
    }
    if (storiesBatch.length > 0) {
      await sql`
        INSERT INTO stories ${sql(storiesBatch, 'user_id', 'media_url', 'created_at', 'expires_at')}
      `
    }
    console.log(`✅ ${storiesBatch.length} Active stories ready.`)
  }

  // 9. Generate & Insert ~5,000 Bookmarks / Saved Posts
  console.log('🔖 Populating bookmarks / saved posts...')
  const [{ count: existingSaved }] = await sql`SELECT count(*)::int FROM saved_posts`
  if (existingSaved < 5000) {
    const SAVED_COUNT = 5000
    const savedBatch = []
    const seenSaved = new Set<string>()
    for (let i = 0; i < SAVED_COUNT; i++) {
      const randomUserId = Math.floor(Math.random() * 500) + minUserId
      const randomPostId = Math.floor(Math.random() * 1000) + minPostId
      const key = `${randomUserId}-${randomPostId}`
      if (!seenSaved.has(key)) {
        seenSaved.add(key)
        savedBatch.push({
          user_id: randomUserId,
          post_id: randomPostId,
          created_at: new Date(),
        })
      }
    }
    if (savedBatch.length > 0) {
      await sql`
        INSERT INTO saved_posts ${sql(savedBatch, 'user_id', 'post_id', 'created_at')}
        ON CONFLICT DO NOTHING
      `
    }
    console.log(`✅ Saved posts ready.`)
  }

  // 10. Synchronize all denormalized counters
  console.log('🔄 Synchronizing denormalized counters...')
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

  await sql`
    UPDATE posts p
    SET comments_count = sub.count
    FROM (
      SELECT post_id, count(*)::int AS count
      FROM comments
      GROUP BY post_id
    ) sub
    WHERE p.id = sub.post_id;
  `

  await sql`
    UPDATE users u
    SET following_count = COALESCE(f.cnt, 0)
    FROM (SELECT follower_id, COUNT(*)::int AS cnt FROM follows GROUP BY follower_id) f
    WHERE u.id = f.follower_id;
  `

  await sql`
    UPDATE users u
    SET followers_count = COALESCE(f.cnt, 0)
    FROM (SELECT following_id, COUNT(*)::int AS cnt FROM follows GROUP BY following_id) f
    WHERE u.id = f.following_id;
  `

  await sql`
    UPDATE users u
    SET posts_count = COALESCE(p.cnt, 0)
    FROM (SELECT user_id, COUNT(*)::int AS cnt FROM posts GROUP BY user_id) p
    WHERE u.id = p.user_id;
  `
  console.log('✅ All counters synced.')

  // Final summary
  const [{ count: finalUsers }] = await sql`SELECT count(*)::int FROM users`
  const [{ count: finalPosts }] = await sql`SELECT count(*)::int FROM posts`
  const [{ count: finalLikes }] = await sql`SELECT count(*)::int FROM likes`
  const [{ count: finalFollows }] = await sql`SELECT count(*)::int FROM follows`
  const [{ count: finalComments }] = await sql`SELECT count(*)::int FROM comments`
  const [{ count: finalStories }] = await sql`SELECT count(*)::int FROM stories WHERE expires_at > NOW()`
  const [{ count: finalSaved }] = await sql`SELECT count(*)::int FROM saved_posts`

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2)
  console.log('\n📊 Seeding Complete Summary:')
  console.log(`   - Users:        ${finalUsers.toLocaleString()}`)
  console.log(`   - Posts:        ${finalPosts.toLocaleString()}`)
  console.log(`   - Likes:        ${finalLikes.toLocaleString()}`)
  console.log(`   - Follows:      ${finalFollows.toLocaleString()}`)
  console.log(`   - Comments:     ${finalComments.toLocaleString()}`)
  console.log(`   - Active Stories: ${finalStories.toLocaleString()}`)
  console.log(`   - Bookmarks:    ${finalSaved.toLocaleString()}`)
  console.log(`   - Elapsed:      ${elapsed}s`)

  await sql.end()
}

seed().catch((err) => {
  console.error('Seeding error:', err)
  process.exit(1)
})
