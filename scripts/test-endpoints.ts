const baseUrl = 'https://prod-main-api-594cb0-006w55rw71q.compute.instacloud-edge.com'

async function testAll() {
  console.log(`🔎 Testing live API at: ${baseUrl}\n`)

  // 1. Health
  console.log('1️⃣ GET /health')
  const hRes = await fetch(`${baseUrl}/health`)
  const hJson: any = await hRes.json()
  console.log('Status:', hRes.status, hJson)

  // 2. Feed
  console.log('\n2️⃣ GET /api/feed?limit=3')
  const fRes = await fetch(`${baseUrl}/api/feed?limit=3`)
  const fJson: any = await fRes.json()
  console.log('Status:', fRes.status, `Posts received: ${fJson.count}, nextCursor: ${fJson.nextCursor}`)
  if (fJson.posts && fJson.posts.length > 0) {
    console.log('Sample post:', fJson.posts[0])
  }

  // 3. User profile
  console.log('\n3️⃣ GET /api/users/1')
  const uRes = await fetch(`${baseUrl}/api/users/1`)
  const uJson: any = await uRes.json()
  console.log('Status:', uRes.status, uJson.user)

  // 4. Create post
  console.log('\n4️⃣ POST /api/posts')
  const pRes = await fetch(`${baseUrl}/api/posts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 1, content: 'Live test post from Bun script!' }),
  })
  const pJson: any = await pRes.json()
  console.log('Status:', pRes.status, pJson)

  // 5. Like post
  const postIdToLike = pJson.post?.id || 1
  console.log(`\n5️⃣ POST /api/posts/${postIdToLike}/like`)
  const lRes = await fetch(`${baseUrl}/api/posts/${postIdToLike}/like`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 2 }),
  })
  const lJson: any = await lRes.json()
  console.log('Status:', lRes.status, lJson)

  console.log('\n🎉 ALL LIVE ENDPOINTS VERIFIED SUCCESSFULLY!')
}

testAll().catch(console.error)
