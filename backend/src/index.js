const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv')
const path = require('path')
const fs = require('fs')
const http = require('http')
const { Server } = require('socket.io')
const { initStore, closeStore } = require('./config/db')

dotenv.config()

const app = express()

app.use(cors({
  origin: [
    'https://luck-stage-simulator.pages.dev',
    'http://localhost:5173',
    'http://localhost:4173'
  ],
  credentials: true
}))
app.use(express.json())

// 确保 Big Brother 头像上传目录存在
const BB_AVATAR_DIR = path.join(__dirname, '..', 'uploads', 'bbavatars')
if (!fs.existsSync(BB_AVATAR_DIR)) fs.mkdirSync(BB_AVATAR_DIR, { recursive: true })
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

// ===== Big Brother 全局实时广播：任意 /api/bigbrother 写操作成功后推送 bb:update =====
app.use('/api/bigbrother', (req, res, next) => {
  if (req.method === 'GET' || req.method === 'OPTIONS') return next()
  // 注意：必须在进入子路由前记录完整路径，否则子路由会改写 req.url 导致路径前缀丢失
  const fullPath = req.originalUrl || req.path
  res.on('finish', () => {
    if (res.statusCode < 400) {
      try {
        const { broadcastBBGame } = require('./socket/bbGame')
        broadcastBBGame('bb:update', { path: fullPath, method: req.method })
      } catch (e) { /* ignore */ }
    }
  })
  next()
})

// ===== Big Brother 路由（固定 gameId = bigbrother）=====
const bbGameIdMiddleware = (req, res, next) => { req.gameId = 'bigbrother'; next() }
app.use('/api/bigbrother/auth', bbGameIdMiddleware, require('./games/bigbrother/routes/bbAuth'))
app.use('/api/bigbrother/season', bbGameIdMiddleware, require('./games/bigbrother/routes/bbSeason'))
app.use('/api/bigbrother/houseguests', bbGameIdMiddleware, require('./games/bigbrother/routes/bbHouseguests'))
app.use('/api/bigbrother/hoh', bbGameIdMiddleware, require('./games/bigbrother/routes/bbHoh'))
app.use('/api/bigbrother/nomination', bbGameIdMiddleware, require('./games/bigbrother/routes/bbNomination'))
app.use('/api/bigbrother/veto', bbGameIdMiddleware, require('./games/bigbrother/routes/bbVeto'))
app.use('/api/bigbrother/eviction', bbGameIdMiddleware, require('./games/bigbrother/routes/bbEviction'))
app.use('/api/bigbrother/jury-qa', bbGameIdMiddleware, require('./games/bigbrother/routes/bbJuryQA'))
app.use('/api/bigbrother/logs', bbGameIdMiddleware, require('./games/bigbrother/routes/bbLogs'))
app.use('/api/bigbrother/minigame', bbGameIdMiddleware, require('./games/bigbrother/routes/bbMinigame'))
app.use('/api/bigbrother/custom-game', bbGameIdMiddleware, require('./games/bigbrother/routes/bbCustomGame'))
app.use('/api/bigbrother/power-challenge', bbGameIdMiddleware, require('./games/bigbrother/routes/bbPowerChallenge'))
app.use('/api/bigbrother/house', bbGameIdMiddleware, require('./games/bigbrother/routes/bbHouse'))

app.get('/', (req, res) => {
  res.send('Big Brother API 服务运行中')
})

app.get('/api', (req, res) => {
  res.json({ success: true, message: 'Big Brother API 服务运行中', version: '1.0.0' })
})

// ===== Big Brother Seed 数据初始化 =====
async function initBBData() {
  const BBHouseguest = require('./games/bigbrother/models/BBHouseguest')
  const BBSeason = require('./games/bigbrother/models/BBSeason')
  const { generateId } = require('./games/bigbrother/helpers')

  const existing = await BBHouseguest.countDocuments({ gameId: 'bigbrother' })
  if (existing > 0) {
    console.log('[Big Brother] Existing data found, skipping initialization')
    // 老库可能缺少 House 空间数据，幂等补齐
    const { ensureBBHouseData } = require('./games/bigbrother/houseMap')
    await ensureBBHouseData()
    // 幂等补齐新增模式的示例题目
    const { ensureCustomGameExamples } = require('./games/bigbrother/seedCustomGames')
    await ensureCustomGameExamples()
    // 幂等补齐账号密码（老数据迁移：从登录码迁移为「账号+密码」）
    const allGuests = await BBHouseguest.find({ gameId: 'bigbrother' })
    const usedNames = new Set(allGuests.map(g => g.username).filter(Boolean))
    let pendingAdminIndex = 0
    let idx = 0
    for (const h of allGuests) {
      idx++
      let changed = false
      if (!h.username) {
        if (h.role === 'admin') {
          let candidate = pendingAdminIndex === 0 ? 'admin' : `admin${pendingAdminIndex + 1}`
          while (usedNames.has(candidate)) { pendingAdminIndex++; candidate = `admin${pendingAdminIndex + 1}` }
          h.username = candidate
          pendingAdminIndex++
        } else {
          h.username = h.loginCode || `houseguest${String(idx).padStart(2, '0')}`
        }
        usedNames.add(h.username)
        changed = true
      }
      if (!h.password) {
        h.password = h.role === 'admin' ? 'ADMIN2026' : 'BB1234'
        changed = true
      }
      if (changed) await h.save()
    }
    // 保证始终存在可用的 admin / ADMIN2026 账号
    const adminExists = await BBHouseguest.findOne({ gameId: 'bigbrother', role: 'admin', username: 'admin' })
    if (!adminExists) {
      await new BBHouseguest({
        id: generateId(),
        name: 'Big Brother 管理员',
        username: 'admin',
        password: 'ADMIN2026',
        role: 'admin',
        status: 'active',
        gameId: 'bigbrother'
      }).save()
      console.log('[Big Brother] Ensured admin account (admin / ADMIN2026)')
    }
    return
  }

  console.log('[Big Brother] Initializing seed data...')

  const admin = new BBHouseguest({
    id: generateId(),
    name: 'Big Brother 管理员',
    username: 'admin',
    password: 'ADMIN2026',
    role: 'admin',
    status: 'active',
    gameId: 'bigbrother'
  })
  await admin.save()

  const houseguestNames = [
    { name: '艾丽斯' }, { name: '鲍勃' }, { name: '查理' },
    { name: '戴安娜' }, { name: '伊森' }, { name: '菲奥娜' },
    { name: '乔治' }, { name: '海伦' }, { name: '伊万' },
    { name: '朱莉娅' }
  ]
  const houseguests = houseguestNames.map((h, i) => new BBHouseguest({
    id: generateId(),
    name: h.name,
    username: `houseguest${String(i + 1).padStart(2, '0')}`,
    password: `BB${String(i + 1).padStart(3, '0')}`,
    role: 'houseguest',
    status: 'active',
    gameId: 'bigbrother'
  }))
  await BBHouseguest.insertMany(houseguests)

  const season = new BBSeason({
    id: generateId(),
    name: 'Big Brother 第一季',
    currentRound: 1,
    currentStage: 'hoh_competition',
    totalRounds: 10,
    status: 'running',
    gameId: 'bigbrother'
  })
  await season.save()

  // 初始化 BB House 房间/通道/门数据
  const BBHouseRoom = require('./games/bigbrother/models/BBHouseRoom')
  const BBHousePassage = require('./games/bigbrother/models/BBHousePassage')
  const BBHouseDoor = require('./games/bigbrother/models/BBHouseDoor')
  const BBPlayerLocation = require('./games/bigbrother/models/BBPlayerLocation')
  const { seedHouseData } = require('./games/bigbrother/houseMap')
  await seedHouseData({ BBHouseRoom, BBHousePassage, BBHouseDoor })

  // 为所有活跃玩家创建位置记录（默认 living_room）
  for (const h of houseguests) {
    const loc = new BBPlayerLocation({
      id: h.id, playerId: h.id, playerName: h.name,
      currentRoomId: 'living_room', enteredAt: new Date().toISOString(),
      gameId: 'bigbrother'
    })
    await loc.save()
  }
  // 管理员也创建位置记录
  const adminLoc = new BBPlayerLocation({
    id: admin.id, playerId: admin.id, playerName: admin.name,
    currentRoomId: 'living_room', enteredAt: new Date().toISOString(),
    gameId: 'bigbrother'
  })
  await adminLoc.save()

  console.log('[Big Brother] Seed data initialized:')
  console.log(`  - 1 admin (账号: admin / 密码: ADMIN2026)`)
  console.log(`  - ${houseguests.length} houseguests`)
  houseguests.forEach(h => console.log(`    ${h.name} (账号: ${h.username} / 密码: ${h.password})`))
  console.log(`  - 1 season (Round 1, Stage: HOH Competition)`)
  const { ensureCustomGameExamples } = require('./games/bigbrother/seedCustomGames')
  await ensureCustomGameExamples()
}

const PORT = process.env.PORT || 3000

initStore().then(() => {
  initBBData().then(() => {
    // 创建 HTTP 服务器并绑定 socket.io
    const server = http.createServer(app)
    const io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    })
    app.set('io', io)

    // 初始化 Big Brother 小游戏 WebSocket
    const { initBBMinigameSocket } = require('./socket/bbMinigame')
    initBBMinigameSocket(io)

    // 初始化 Big Brother House 实时通信
    const { initBBHouseSocket } = require('./socket/bbHouse')
    initBBHouseSocket(io)

    // 初始化 Big Brother 全局实时通信
    const { initBBGameSocket } = require('./socket/bbGame')
    initBBGameSocket(io)

    server.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`)
      console.log(`WebSocket (Socket.IO) enabled`)
      console.log(`Database persistence enabled: ${process.env.MONGODB_URI}`)
    })
  })
}).catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})

process.on('SIGINT', async () => {
  await closeStore()
  process.exit(0)
})
