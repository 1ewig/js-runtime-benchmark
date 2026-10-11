import postgres from 'postgres'

const dbUrl = process.env.DATABASE_URL
if (!dbUrl) {
  console.error('DATABASE_URL is not set in environment or .env')
  process.exit(1)
}

export async function cleanBenchmarkData() {
  console.log('🧹 [DB Cleanup] Pruning test mutations and reconciling counter drift...')
  const sql = postgres(dbUrl!, { max: 1, ssl: 'require', idle_timeout: 1 })

  try {
    // 1. Delete benchmark-created comments, stories, and posts
    const deletedComments = await sql`DELETE FROM comments WHERE id > 121000 RETURNING id;`
    const deletedStories = await sql`DELETE FROM stories WHERE id > 2700 RETURNING id;`
    const deletedPosts = await sql`DELETE FROM posts WHERE id > 50000 RETURNING id;`

    // 2. Reconcile post counter columns (likes_count, comments_count)
    await sql`
      UPDATE posts p
      SET comments_count = (SELECT count(*)::int FROM comments WHERE post_id = p.id),
          likes_count = (SELECT count(*)::int FROM likes WHERE post_id = p.id)
      WHERE p.id > 49500;
    `

    // 3. Reconcile active user counters (followers_count, following_count, posts_count)
    await sql`
      UPDATE users u
      SET followers_count = (SELECT count(*)::int FROM follows WHERE following_id = u.id),
          following_count = (SELECT count(*)::int FROM follows WHERE follower_id = u.id),
          posts_count = (SELECT count(*)::int FROM posts WHERE user_id = u.id)
      WHERE u.id <= 100;
    `

    console.log(`   ✅ Pruned: ${deletedPosts.length} test posts, ${deletedComments.length} test comments, ${deletedStories.length} test stories`)
    console.log('   ✅ Reconciled denormalized counters on posts and active creators.')
  } finally {
    await sql.end()
  }
}

if (import.meta.main) {
  cleanBenchmarkData()
    .then(() => {
      console.log('✨ [DB Cleanup] Database sanitized to pristine baseline.')
      process.exit(0)
    })
    .catch((err) => {
      console.error('❌ [DB Cleanup] Error:', err.message)
      process.exit(1)
    })
}
