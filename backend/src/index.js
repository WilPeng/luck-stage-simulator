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
app.use(express.json({ limit: '20mb' }))
app.use(express.urlencoded({ extended: true, limit: '20mb' }))

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
app.use('/api/bigbrother/game-library', bbGameIdMiddleware, require('./games/bigbrother/routes/bbGameLibrary'))
app.use('/api/bigbrother/power-challenge', bbGameIdMiddleware, require('./games/bigbrother/routes/bbPowerChallenge'))
app.use('/api/bigbrother/house', bbGameIdMiddleware, require('./games/bigbrother/routes/bbHouse'))

// 请求体过大等解析错误统一返回 JSON，避免前端只收到 413 HTML
app.use((err, req, res, next) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413)) {
    return res.status(413).json({ success: false, error: '请求内容过大' })
  }
  next(err)
})

app.get('/', (req, res) => {
  res.send('Big Brother API 服务运行中')
})

app.get('/api', (req, res) => {
  res.json({ success: true, message: 'Big Brother API 服务运行中', version: '1.0.0' })
})

// ===== Big Brother Seed 数据初始化 =====
/**
 * 可选的管理员引导：仅当同时配置 BB_ADMIN_USERNAME 与 BB_ADMIN_PASSWORD，
 * 且该用户名尚不存在时，才创建一个管理员账号。
 * 不再自动创建 admin / ADMIN2026 默认账号。
 */
async function bootstrapAdminFromEnv(BBHouseguest) {
  const username = String(process.env.BB_ADMIN_USERNAME || '').trim()
  const password = process.env.BB_ADMIN_PASSWORD
  if (!username || !password) return null

  const { generateId } = require('./games/bigbrother/helpers')
  const { hashPassword, isBcryptHash } = require('./games/bigbrother/password')

  const exists = await BBHouseguest.findOne({ gameId: 'bigbrother', username })
  if (exists) {
    // 仅修复“空密码 / 不可查看的 bcrypt”管理员，避免覆盖管理员自行修改过的密码
    if (exists.role === 'admin' && (!exists.password || isBcryptHash(exists.password))) {
      exists.password = hashPassword(password)
      await exists.save()
      console.log(`[Big Brother] 已根据环境变量重置管理员密码: ${username}`)
    }
    return exists
  }

  const doc = new BBHouseguest({
    id: generateId(),
    name: username,
    username,
    password: hashPassword(password),
    role: 'admin',
    status: 'active',
    gameId: 'bigbrother'
  })
  await doc.save()
  console.log(`[Big Brother] 已根据环境变量创建管理员账号: ${username}`)
  return doc
}

async function initBBData() {
  const BBHouseguest = require('./games/bigbrother/models/BBHouseguest')
  const BBSeason = require('./games/bigbrother/models/BBSeason')
  const { generateId, ensureSuperAdmin } = require('./games/bigbrother/helpers')
  const { hashPassword, checkPassword, generateStrongPassword } = require('./games/bigbrother/password')

  const existing = await BBHouseguest.countDocuments({ gameId: 'bigbrother' })
  if (existing > 0) {
    console.log('[Big Brother] Existing data found, skipping initialization')
    // 老库可能缺少 House 空间数据，幂等补齐
    const { ensureBBHouseData } = require('./games/bigbrother/houseMap')
    await ensureBBHouseData()
    // 清除自动补种的示例游戏，避免云端游戏库反复出现示例
    const { removeCustomGameExamples } = require('./games/bigbrother/seedCustomGames')
    await removeCustomGameExamples()
    // 先按环境变量引导/修复管理员（仅当配置了 BB_ADMIN_USERNAME + BB_ADMIN_PASSWORD）
    await bootstrapAdminFromEnv(BBHouseguest)

    // 幂等补齐账号密码（老数据迁移：从登录码迁移为「账号+密码」）
    const allGuests = await BBHouseguest.find({ gameId: 'bigbrother' })

    // 清理历史默认管理员账号 admin/ADMIN2026：仅当还有其他管理员时才删除，避免锁死
    const otherAdmins = allGuests.filter(g => g.role === 'admin' && g.username !== 'admin')
    const legacyDefault = allGuests.find(g =>
      g.role === 'admin' &&
      g.username === 'admin' &&
      (!g.password || checkPassword('ADMIN2026', g.password))
    )
    if (legacyDefault && otherAdmins.length > 0) {
      await BBHouseguest.deleteOne({ id: legacyDefault.id, gameId: 'bigbrother' })
      const BBPlayerLocation = require('./games/bigbrother/models/BBPlayerLocation')
      await BBPlayerLocation.deleteMany({ gameId: 'bigbrother', playerId: legacyDefault.id })
      console.log('[Big Brother] 已移除历史默认管理员账号 admin（检测到其他管理员）')
    }
    const activeGuests = legacyDefault && otherAdmins.length > 0
      ? allGuests.filter(g => g.id !== legacyDefault.id)
      : allGuests

    const usedNames = new Set(activeGuests.map(g => g.username).filter(Boolean))
    let pendingAdminIndex = 0
    let idx = 0
    for (const h of activeGuests) {
      idx++
      let changed = false
      if (!h.username) {
        if (h.role === 'admin') {
          // 不再生成名为 admin 的默认账号，使用 admin1/admin2...
          pendingAdminIndex++
          let candidate = `admin${pendingAdminIndex}`
          while (usedNames.has(candidate)) { pendingAdminIndex++; candidate = `admin${pendingAdminIndex}` }
          h.username = candidate
        } else {
          h.username = h.loginCode || `houseguest${String(idx).padStart(2, '0')}`
        }
        usedNames.add(h.username)
        changed = true
      }
      if (!h.password) {
        // 老库缺失密码：生成随机密码并加密存储（避免继续使用弱默认密码）
        const pwd = generateStrongPassword(16)
        h.password = hashPassword(pwd)
        console.warn(`[Big Brother] 账号 ${h.username} 缺少密码，已生成随机密码: ${pwd}`)
        changed = true
      }
      if (changed) await h.save()
    }
    // 不再自动创建 admin / ADMIN2026 默认账号。
    // 如需引导创建管理员，可设置 BB_ADMIN_USERNAME + BB_ADMIN_PASSWORD（仅当该用户名不存在时创建）。
    if (legacyDefault && otherAdmins.length === 0) {
      // 仅剩默认管理员时保留账号，但轮换掉默认密码，避免继续使用 ADMIN2026
      const doc = await BBHouseguest.findOne({ id: legacyDefault.id, gameId: 'bigbrother' })
      if (doc && doc.password && checkPassword('ADMIN2026', doc.password)) {
        const pwd = generateStrongPassword(16)
        doc.password = hashPassword(pwd)
        await doc.save()
        console.warn('==================================================================')
        console.warn('[Big Brother] 检测到唯一管理员仍使用默认密码 ADMIN2026，已自动轮换！')
        console.warn(`[Big Brother] 新的管理员密码: ${pwd}`)
        console.warn('[Big Brother] 请立即记录并尽快修改。')
        console.warn('==================================================================')
      }
    }
    // 保证始终存在唯一的总管理员
    await ensureSuperAdmin()
    const adminCount = await BBHouseguest.countDocuments({ gameId: 'bigbrother', role: 'admin' })
    if (!adminCount) {
      console.warn('[Big Brother] 当前没有任何管理员账号。请设置 BB_ADMIN_USERNAME / BB_ADMIN_PASSWORD 后重启，或手动创建。')
    }
    // 管理员不进入任何房间：清理历史遗留的管理员位置记录
    const BBPlayerLocation = require('./games/bigbrother/models/BBPlayerLocation')
    const admins = await BBHouseguest.find({ gameId: 'bigbrother', role: 'admin' })
    const adminIds = admins.map(a => a.id)
    if (adminIds.length) {
      await BBPlayerLocation.deleteMany({ gameId: 'bigbrother', playerId: { $in: adminIds } })
      for (const a of admins) {
        if (a.currentRoomId) { a.currentRoomId = null; await a.save() }
      }
    }
    return
  }

  console.log('[Big Brother] Initializing seed data...')

  // 不创建默认 admin/ADMIN2026 账号；仅在配置了环境变量时引导创建管理员
  await bootstrapAdminFromEnv(BBHouseguest)

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
    password: hashPassword(`BB${String(i + 1).padStart(3, '0')}`),
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
  // 管理员不进入任何房间（上帝视角），因此不创建位置记录

  console.log('[Big Brother] Seed data initialized:')
  console.log(`  - ${houseguests.length} houseguests`)
  console.log(`  - 1 season (Round 1, Stage: HOH Competition)`)
  const { removeCustomGameExamples } = require('./games/bigbrother/seedCustomGames')
  await removeCustomGameExamples()
  // 保证存在唯一的总管理员（若配置了 BB_ADMIN_USERNAME/BB_ADMIN_PASSWORD 则已有管理员）
  await ensureSuperAdmin()
  const adminCount = await BBHouseguest.countDocuments({ gameId: 'bigbrother', role: 'admin' })
  if (!adminCount) {
    console.warn('[Big Brother] 未创建默认管理员。请设置 BB_ADMIN_USERNAME / BB_ADMIN_PASSWORD 后重启，或手动创建管理员。')
  }
}

const PORT = process.env.PORT || 3000

// ===== 数据库索引：显著降低查询延迟（尤其是远程/跨区数据库） =====
async function ensureBBIndexes() {
  const { getCollection } = require('./config/db')
  const specs = [
    ['BBHouseguest', [{ gameId: 1 }, { id: 1 }, { username: 1 }, { status: 1 }]],
    ['BBSeason', [{ gameId: 1 }]],
    ['BBRound', [{ gameId: 1, roundId: 1 }]],
    ['BBHohRecord', [{ gameId: 1, roundId: 1 }]],
    ['BBNomination', [{ gameId: 1, roundId: 1 }]],
    ['BBVetoRecord', [{ gameId: 1, roundId: 1 }]],
    ['BBEvictionVote', [{ gameId: 1, roundId: 1 }, { gameId: 1, voterId: 1 }]],
    ['BBEviction', [{ gameId: 1, roundId: 1 }]],
    ['BBChatMessage', [{ gameId: 1, chatType: 1, roomId: 1, createdAt: 1 }, { gameId: 1, roomId: 1 }]],
    ['BBPlayerLocation', [{ gameId: 1, currentRoomId: 1 }, { gameId: 1, playerId: 1 }]],
    ['BBLocationHistory', [{ gameId: 1, playerId: 1 }]],
    ['BBChampionVote', [{ gameId: 1 }, { gameId: 1, voterId: 1 }]],
    ['BBJuryQA', [{ gameId: 1, roundId: 1 }]],
    ['BBMinigameReplay', [{ gameId: 1, gameType: 1, startedAt: -1 }]],
    ['BBOperationLog', [{ gameId: 1, createdAt: -1 }]],
    ['BBCustomGame', [{ gameId: 1, enabled: 1 }]],
    ['BBGameLibrary', [{ gameId: 1 }]],
    ['BBPowerChallenge', [{ gameId: 1 }]],
    ['BBSerpentMark', [{ gameId: 1, roundIndex: 1 }]],
    ['BBHouseRoom', [{ gameId: 1, id: 1 }]],
    ['BBHouseDoor', [{ gameId: 1, id: 1 }]],
    ['BBHousePassage', [{ gameId: 1 }]]
  ]
  let created = 0
  for (const [name, idxs] of specs) {
    try {
      const col = getCollection(name)
      for (const key of idxs) { await col.createIndex(key); created++ }
    } catch (e) { /* ignore */ }
  }
  console.log(`[Big Brother] Indexes ensured (${created})`)
}

/**
 * 多实例部署时为 Socket.IO 启用 Redis Adapter。
 * 未设置 REDIS_URL 时自动退化为单实例内存 Adapter。
 * 注意：Redis Adapter 只负责跨实例的事件广播；多实例部署仍需要 nginx 配置
 * sticky session（见 backend/docs/水平扩展部署说明.md），否则轮询握手会落错实例。
 */
async function setupRedisAdapter(io) {
  const url = process.env.REDIS_URL
  if (!url) {
    console.log('[Socket.IO] REDIS_URL 未设置，使用单实例内存 Adapter')
    return
  }
  try {
    const { createClient } = require('redis')
    const { createAdapter } = require('@socket.io/redis-adapter')
    const pubClient = createClient({ url })
    const subClient = pubClient.duplicate()
    pubClient.on('error', (e) => console.error('[Redis pub]', e.message))
    subClient.on('error', (e) => console.error('[Redis sub]', e.message))
    await Promise.all([pubClient.connect(), subClient.connect()])
    io.adapter(createAdapter(pubClient, subClient))
    console.log('[Socket.IO] Redis Adapter 已启用')
  } catch (e) {
    console.error('[Socket.IO] Redis Adapter 初始化失败，回退为内存 Adapter:', e.message)
  }
}

initStore().then(() => {
  initBBData().then(async () => {
    try { await ensureBBIndexes() } catch (e) { console.error('[Big Brother] ensureBBIndexes failed', e) }
    // 创建 HTTP 服务器并绑定 socket.io
    const server = http.createServer(app)
    const io = new Server(server, {
      cors: { origin: '*', methods: ['GET', 'POST'] }
    })
    app.set('io', io)

    // 多进程/多实例：配置 REDIS_URL 后启用 Redis Adapter（跨实例广播）
    await setupRedisAdapter(io)

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
