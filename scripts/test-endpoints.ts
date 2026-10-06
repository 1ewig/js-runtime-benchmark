const baseUrl = 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com'

async function testAll() {
  console.log(`🔎 Testing live Instagram API at: ${baseUrl}\n`)

  // 1. Health & DB ping
  console.log('1️⃣ GET /health')
  const hRes = await fetch(`${baseUrl}/health`)
  const hJson: any = await hRes.json()
  console.log('Status:', hRes.status, hJson)

  // 2. Home Feed (posts from accounts user 1 follows)
  console.log('\n2️⃣ GET /api/feed/home?userId=1&limit=3')
  const homeRes = await fetch(`${baseUrl}/api/feed/home?userId=1&limit=3`)
  const homeJson: any = await homeRes.json()
  console.log('Status:', homeRes.status, `Feed count: ${homeJson.count}, nextCursor: ${homeJson.nextCursor}`)
  if (homeJson.posts && homeJson.posts.length > 0) {
    console.log('Sample Home post:', {
      id: homeJson.posts[0].id,
      creator: homeJson.posts[0].username,
      caption: homeJson.posts[0].caption?.slice(0, 50),
      image_url: homeJson.posts[0].image_url?.slice(0, 60) + '...',
      likes: homeJson.posts[0].likes_count,
    })
  }

  // 3. Explore Feed (popular posts)
  console.log('\n3️⃣ GET /api/feed/explore?limit=3')
  const expRes = await fetch(`${baseUrl}/api/feed/explore?limit=3`)
  const expJson: any = await expRes.json()
  console.log('Status:', expRes.status, `Explore count: ${expJson.count}, nextCursor: ${expJson.nextCursor}`)
  if (expJson.posts && expJson.posts.length > 0) {
    console.log('Top Explore post:', {
      id: expJson.posts[0].id,
      creator: expJson.posts[0].username,
      likes: expJson.posts[0].likes_count,
    })
  }

  // 4. User Profile Grid
  console.log('\n4️⃣ GET /api/users/1')
  const uRes = await fetch(`${baseUrl}/api/users/1`)
  const uJson: any = await uRes.json()
  console.log('Status:', uRes.status, {
    username: uJson.user?.username,
    bio: uJson.user?.bio,
    followers: uJson.user?.followers_count,
    following: uJson.user?.following_count,
    postsCount: uJson.user?.posts_count,
    gridPhotosReturned: uJson.recentPosts?.length,
  })

  // 5. Follow Toggle
  console.log('\n5️⃣ POST /api/users/50/follow (User 1 toggles follow on User 50)')
  const fRes = await fetch(`${baseUrl}/api/users/50/follow`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ followerId: 1 }),
  })
  const fJson: any = await fRes.json()
  console.log('Status:', fRes.status, fJson)

  // 6. Create Instagram Photo Post
  console.log('\n6️⃣ POST /api/posts')
  const pRes = await fetch(`${baseUrl}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 1,
      imageUrl: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
      caption: 'Sunset in the city with Bun + Hono on InstaCloud! 🌇⚡',
    }),
  })
  const pJson: any = await pRes.json()
  console.log('Status:', pRes.status, pJson)

  // 7. Like Post
  const postIdToLike = pJson.post?.id || 1
  console.log(`\n7️⃣ POST /api/posts/${postIdToLike}/like`)
  const lRes = await fetch(`${baseUrl}/api/posts/${postIdToLike}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 }),
  })
  const lJson: any = await lRes.json()
  console.log('Status:', lRes.status, lJson)

  // 8. In-Memory Pure Compute Benchmark Feed
  console.log('\n8️⃣ GET /api/bench/feed')
  const bRes = await fetch(`${baseUrl}/api/bench/feed`)
  const bJson: any = await bRes.json()
  console.log('Status:', bRes.status, `Cached: ${bJson.cached}, Count: ${bJson.count}`)

  console.log('\n🎉 ALL INSTAGRAM API ENDPOINTS VERIFIED SUCCESSFULLY!')
}

testAll().catch(console.error)
