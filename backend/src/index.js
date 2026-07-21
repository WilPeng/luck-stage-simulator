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

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads', 'avatars')
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

const initData = async () => {
  const User = require('./models/User')
  const Season = require('./models/Season')
  const Song = require('./models/Song')
  const TrainingCard = require('./models/TrainingCard')
  const Team = require('./models/Team')
  const StageEvent = require('./models/StageEvent')

  const existingUsers = await User.find({})
  if (existingUsers.length === 0) {
    console.log('Initializing seed data...')

    const { v4: uuidv4 } = require('uuid')
    const generateId = () => uuidv4()
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

    const gameId = 'shengfeng2026'
    const admin = new User({
      id: generateId(),
      name: '赛事管理员',
      loginCode: 'ADMIN2026',
      password: '$2a$10$rJ3iK8WX5v9u0V7k8M2yUe7i8j9k0L1m2n3o4p5q6r7s8t9u0',
      role: 'admin',
      status: 'active',
      hasLogin: false,
      attributes: { vocal: 0, dance: 0, charm: 0 },
      trainingCount: 0,
      gameId
    })
    await admin.save()

    const playerNames = [
      { name: '44岚', vocal: 58, dance: 42, charm: 55 },
      { name: '星辰', vocal: 62, dance: 38, charm: 48 },
      { name: '月影', vocal: 45, dance: 55, charm: 60 },
      { name: '晨曦', vocal: 50, dance: 48, charm: 52 },
      { name: '清风', vocal: 42, dance: 60, charm: 45 },
      { name: '暮光', vocal: 55, dance: 50, charm: 42 },
      { name: '繁星', vocal: 48, dance: 45, charm: 58 },
      { name: '云海', vocal: 60, dance: 35, charm: 50 },
      { name: '银辉', vocal: 38, dance: 52, charm: 56 },
      { name: '金焰', vocal: 52, dance: 46, charm: 48 }
    ]
    const users = []

    for (let i = 0; i < 10; i++) {
      const player = playerNames[i]
      const user = new User({
        id: `u${String(i + 1).padStart(3, '0')}`,
        name: player.name,
        loginCode: `CF2026-A${String(i + 1).padStart(3, '0')}`,
        password: '$2a$10$rJ3iK8WX5v9u0V7k8M2yUe7i8j9k0L1m2n3o4p5q6r7s8t9u0',
        role: 'player',
        status: 'active',
        teamId: null,
        hasLogin: false,
        attributes: {
          vocal: player.vocal,
          dance: player.dance,
          charm: player.charm
        },
        trainingCount: randomInt(0, 3),
        gameId
      })
      users.push(user)
    }
    await User.insertMany(users)

    const season = new Season({
      id: generateId(),
      name: '乘风2026第一季',
      currentStage: 'setup',
      status: 'running',
      teamSetup: null,
      gameId
    })
    await season.save()

    const songs = [
      { id: 's001', name: '逆光飞翔', style: '流行', difficulty: 3, vocalWeight: 4, danceWeight: 3, charmWeight: 3, baseScore: 100, riskFactor: 0.2, gameId },
      { id: 's002', name: '舞动奇迹', style: '舞曲', difficulty: 4, vocalWeight: 2, danceWeight: 5, charmWeight: 3, baseScore: 100, riskFactor: 0.3, gameId },
      { id: 's003', name: '星光大道', style: '抒情', difficulty: 3, vocalWeight: 5, danceWeight: 2, charmWeight: 3, baseScore: 100, riskFactor: 0.15, gameId },
      { id: 's004', name: '魅力四射', style: '动感', difficulty: 4, vocalWeight: 3, danceWeight: 3, charmWeight: 5, baseScore: 100, riskFactor: 0.25, gameId },
      { id: 's005', name: '乘风破浪', style: '励志', difficulty: 5, vocalWeight: 4, danceWeight: 4, charmWeight: 4, baseScore: 100, riskFactor: 0.4, gameId },
      { id: 's006', name: '梦想舞台', style: '流行', difficulty: 3, vocalWeight: 3, danceWeight: 4, charmWeight: 3, baseScore: 100, riskFactor: 0.2, gameId }
    ]
    await Song.insertMany(songs.map(s => new Song(s)))

    const trainingCards = [
      { id: 'tc001', name: '声乐老师加课', type: 'vocal', description: '声乐老师单独辅导，Vocal大幅提升', effect: { vocal: 5 }, weight: 15, enabled: true, gameId },
      { id: 'tc002', name: '高强度舞蹈课', type: 'dance', description: '魔鬼训练，Dance能力大幅提升', effect: { dance: 5 }, weight: 15, enabled: true, gameId },
      { id: 'tc003', name: '镜头感爆发', type: 'charm', description: '突然开窍，Charm大幅提升', effect: { charm: 5 }, weight: 15, enabled: true, gameId },
      { id: 'tc004', name: '状态稳定', type: 'mixed', description: '状态良好，三项属性均有提升', effect: { vocal: 2, dance: 2, charm: 2 }, weight: 20, enabled: true, gameId },
      { id: 'tc005', name: '摆烂一天', type: 'event', description: '状态不佳，随机一项属性下降', effect: { randomOne: -4 }, weight: 10, enabled: true, gameId },
      { id: 'tc006', name: '黑马时刻', type: 'event', description: '潜力爆发，最低属性大幅提升', effect: { lowest: 6 }, weight: 10, enabled: true, gameId },
      { id: 'tc007', name: '全能特训', type: 'mixed', description: '全面训练，两项属性提升', effect: { randomTwo: 3 }, weight: 10, enabled: true, gameId },
      { id: 'tc008', name: '巅峰突破', type: 'event', description: '突破瓶颈，最高属性大幅提升', effect: { highest: 4 }, weight: 5, enabled: true, gameId },
      { id: 'tc009', name: '轻声吟唱', type: 'vocal', description: '轻声练习，Vocal小幅提升', effect: { vocal: 3 }, weight: 18, enabled: true, gameId },
      { id: 'tc010', name: '舞蹈基础', type: 'dance', description: '基础舞步练习，Dance小幅提升', effect: { dance: 3 }, weight: 18, enabled: true, gameId },
      { id: 'tc011', name: '表情管理', type: 'charm', description: '学习表情管理，Charm小幅提升', effect: { charm: 3 }, weight: 18, enabled: true, gameId },
      { id: 'tc012', name: '综合练习', type: 'mixed', description: '综合能力训练', effect: { vocal: 1, dance: 1, charm: 1 }, weight: 25, enabled: true, gameId },
      { id: 'tc013', name: '超级摆烂', type: 'event', description: '彻底休息，随机两项属性下降', effect: { randomTwo: -3 }, weight: 8, enabled: true, gameId },
      { id: 'tc014', name: '潜力觉醒', type: 'event', description: '潜力觉醒，最低属性中幅提升', effect: { lowest: 4 }, weight: 12, enabled: true, gameId },
      { id: 'tc015', name: '突破极限', type: 'event', description: '突破自身极限，最高属性中幅提升', effect: { highest: 3 }, weight: 10, enabled: true, gameId }
    ]
    await TrainingCard.insertMany(trainingCards.map(tc => new TrainingCard(tc)))

    const stageEvents = [
      { id: 'evt001', name: '观众沸腾', voteEffect: 87, description: '现场气氛极佳，观众给予了极高认可', gameId },
      { id: 'evt002', name: '全场合唱', voteEffect: 120, description: '全场观众起立合唱，场面震撼人心', gameId },
      { id: 'evt003', name: '舞台事故', voteEffect: -100, description: '演出中出现意外，影响了整体表现', gameId },
      { id: 'evt004', name: '完美配合', voteEffect: 65, description: '队员之间配合默契，舞台效果极佳', gameId },
      { id: 'evt005', name: '灯光故障', voteEffect: -50, description: '灯光系统出现短暂故障，但选手坚持完成演出', gameId },
      { id: 'evt006', name: '即兴发挥', voteEffect: 45, description: '选手临场即兴发挥，给观众带来惊喜', gameId },
      { id: 'evt007', name: '深情演绎', voteEffect: 55, description: '情感投入极深，打动了许多观众', gameId },
      { id: 'evt008', name: '高音爆发', voteEffect: 70, description: '高音部分爆发力十足，全场欢呼', gameId },
      { id: 'evt009', name: '服装失误', voteEffect: -30, description: '服装出现小问题，略微影响了视觉效果', gameId },
      { id: 'evt010', name: '中规中矩', voteEffect: 0, description: '演出平稳进行，没有特别出彩但也没有失误', gameId }
    ]
    await StageEvent.insertMany(stageEvents.map(se => new StageEvent(se)))

    console.log('Seed data initialized successfully:')
    console.log('  - 1 admin user')
    console.log('  - 16 players (all unassigned, no teams)')
    console.log('  - 0 teams (admin needs to set up teams first)')
    console.log('  - 6 songs')
    console.log('  - 15 training cards')
    console.log('  - 1 season (stage: setup - 队伍配置阶段)')
    console.log('  -> 请管理员在前端页面设置团数和每团人数')
  } else {
    console.log('Existing data found, skipping initialization')
  }

  // ===== 数据迁移：修复 seed 数据中的 roundIndex 字段 =====
  await migrateRoundIndex()
}

// 修复种子数据中 Round 字段名错误（roundIndex → index），合并重复 Round
async function migrateRoundIndex() {
  const Round = require('./models/Round')
  const collections = [
    require('./models/RoundTeam'), require('./models/RoundTeamMember'),
    require('./models/RoundCaptain'), require('./models/RoundPreparation'),
    require('./models/TeamSong'), require('./models/TrainingRecord'),
    require('./models/RehearsalResult'), require('./models/CaptainVote'),
    require('./models/PerformanceValue'), require('./models/PerformanceRoundState'),
    require('./models/TeamInvite'), require('./models/TeamApplication'),
    require('./models/TeamPerformance'), require('./models/PlayerPerformance'),
    require('./models/AudienceVote'), require('./models/SafeTeam')
  ]

  const oldRounds = await Round.find({})
  let migrated = 0
  for (const r of oldRounds) {
    if (r.roundIndex != null && r.index == null) {
      r.index = r.roundIndex
      delete r.roundIndex
      await r.save()

      const dup = await Round.findOne({ seasonId: r.seasonId, index: r.index, id: { $ne: r.id } })
      if (dup) {
        const oldId = r.id, newId = dup.id
        for (const model of collections) {
          if (model.updateMany) {
            try { await model.updateMany({ roundId: oldId }, { $set: { roundId: newId } }) }
            catch (e) { /* ignore */ }
          }
        }
        await Round.deleteOne({ id: oldId })
        migrated++
      }
    }
  }
  if (migrated > 0) console.log(`[Migration] Fixed ${migrated} round(s): merged duplicate round data`)
}

// gameId 中间件：从路由参数提取 gameId 注入到 req
app.use('/api/:gameId', (req, res, next) => {
  req.gameId = req.params.gameId
  next()
})

// ===== Big Brother 路由（固定 gameId = bigbrother，必须在 :gameId 路由之前注册）=====
const bbGameIdMiddleware = (req, res, next) => { req.gameId = 'bigbrother'; next() }
app.use('/api/bigbrother/auth', bbGameIdMiddleware, require('./games/bigbrother/routes/bbAuth'))
app.use('/api/bigbrother/season', bbGameIdMiddleware, require('./games/bigbrother/routes/bbSeason'))
app.use('/api/bigbrother/houseguests', bbGameIdMiddleware, require('./games/bigbrother/routes/bbHouseguests'))
app.use('/api/bigbrother/hoh', bbGameIdMiddleware, require('./games/bigbrother/routes/bbHoh'))
app.use('/api/bigbrother/nomination', bbGameIdMiddleware, require('./games/bigbrother/routes/bbNomination'))
app.use('/api/bigbrother/veto', bbGameIdMiddleware, require('./games/bigbrother/routes/bbVeto'))
app.use('/api/bigbrother/eviction', bbGameIdMiddleware, require('./games/bigbrother/routes/bbEviction'))
app.use('/api/bigbrother/logs', bbGameIdMiddleware, require('./games/bigbrother/routes/bbLogs'))
app.use('/api/bigbrother/chat', bbGameIdMiddleware, require('./games/bigbrother/routes/bbChat'))

// ===== 恋综路由（固定 gameId = lovevariety）=====
const lvGameIdMiddleware = (req, res, next) => { req.gameId = 'lovevariety'; next() }
app.use('/api/lovevariety/auth', lvGameIdMiddleware, require('./games/lovevariety/routes/lvAuth'))
app.use('/api/lovevariety/season', lvGameIdMiddleware, require('./games/lovevariety/routes/lvSeason'))
app.use('/api/lovevariety/players', lvGameIdMiddleware, require('./games/lovevariety/routes/lvPlayers'))
app.use('/api/lovevariety/votes', lvGameIdMiddleware, require('./games/lovevariety/routes/lvVotes'))
app.use('/api/lovevariety/pairing', lvGameIdMiddleware, require('./games/lovevariety/routes/lvPairing'))
app.use('/api/lovevariety/elimination', lvGameIdMiddleware, require('./games/lovevariety/routes/lvElimination'))

app.use('/api/:gameId/auth', require('./routes/auth'))
app.use('/api/:gameId/season', require('./routes/season'))
app.use('/api/:gameId/admin', require('./routes/admin'))
app.use('/api/:gameId/users', require('./routes/users'))
app.use('/api/:gameId/teams', require('./routes/teams'))
app.use('/api/:gameId/captain', require('./routes/captain'))
app.use('/api/:gameId/songs', require('./routes/songs'))
app.use('/api/:gameId/training', require('./routes/training'))
app.use('/api/:gameId/rehearsal', require('./routes/rehearsal'))
app.use('/api/:gameId/performance', require('./routes/performance'))
app.use('/api/:gameId/player', require('./routes/player'))
app.use('/api/:gameId/admin/audience-vote', require('./routes/audienceVote'))
app.use('/api/:gameId/audience-vote', require('./routes/audienceVote'))
app.use('/api/:gameId/elimination', require('./routes/elimination'))
app.use('/api/:gameId/logs', require('./routes/logs'))
app.use('/api/:gameId/chat', require('./routes/chat'))
app.use('/api/:gameId/songs/round', require('./routes/roundSongs'))

// ===== Big Brother Seed 数据初始化 =====
async function initBBData() {
  const BBHouseguest = require('./games/bigbrother/models/BBHouseguest')
  const BBSeason = require('./games/bigbrother/models/BBSeason')
  const { generateId, randomInt } = require('./games/bigbrother/helpers')

  const existing = await BBHouseguest.countDocuments({ gameId: 'bigbrother' })
  if (existing > 0) {
    console.log('[Big Brother] Existing data found, skipping initialization')
    return
  }

  console.log('[Big Brother] Initializing seed data...')

  const admin = new BBHouseguest({
    id: generateId(),
    name: 'Big Brother 管理员',
    loginCode: 'BB_ADMIN',
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
    loginCode: `BB-HOUSE-${String(i + 1).padStart(3, '0')}`,
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

  console.log('[Big Brother] Seed data initialized:')
  console.log(`  - 1 admin (loginCode: BB_ADMIN)`)
  console.log(`  - ${houseguests.length} houseguests`)
  houseguests.forEach(h => console.log(`    ${h.name} (loginCode: ${h.loginCode})`))
  console.log(`  - 1 season (Round 1, Stage: HOH Competition)`)
}

// ===== 恋综 Seed 数据初始化 =====
async function initLoveVarietyData() {
  const LVPlayer = require('./games/lovevariety/models/LVPlayer')
  const LVSeason = require('./games/lovevariety/models/LVSeason')
  const { generateId, randomInt } = require('./games/lovevariety/helpers')

  const existing = await LVPlayer.countDocuments({ gameId: 'lovevariety' })
  if (existing > 0) {
    console.log('[恋综] Existing data found, skipping initialization')
    return
  }

  console.log('[恋综] Initializing seed data...')

  const admin = new LVPlayer({
    id: generateId(),
    name: '恋综管理员',
    loginCode: 'LV_ADMIN',
    role: 'admin',
    status: 'active',
    gameId: 'lovevariety'
  })
  await admin.save()

  const playerNames = [
    { name: '小美' }, { name: '小帅' }, { name: '小丽' },
    { name: '小杰' }, { name: '小芳' }, { name: '小强' },
    { name: '小雅' }, { name: '小豪' }, { name: '小欣' },
    { name: '小宇' }
  ]
  const players = playerNames.map((h, i) => new LVPlayer({
    id: generateId(),
    name: h.name,
    loginCode: `LV-PLAYER-${String(i + 1).padStart(3, '0')}`,
    role: 'player',
    status: 'active',
    gameId: 'lovevariety'
  }))
  await LVPlayer.insertMany(players)

  const season = new LVSeason({
    id: generateId(),
    name: '恋综第一季',
    currentRound: 1,
    currentStage: 'love_vote',
    totalRounds: 10,
    status: 'running',
    gameId: 'lovevariety'
  })
  await season.save()

  console.log('[恋综] Seed data initialized:')
  console.log(`  - 1 admin (loginCode: LV_ADMIN)`)
  console.log(`  - ${players.length} players`)
  players.forEach(h => console.log(`    ${h.name} (loginCode: ${h.loginCode})`))
  console.log(`  - 1 season (Round 1, Stage: 喜爱值投送)`)
}

app.get('/', (req, res) => {
  res.send('乘风2026运气赛 API 服务运行中')
})

app.get('/api', (req, res) => {
  res.json({ success: true, message: '乘风2026运气赛 API 服务运行中', version: '1.0.0' })
})

const PORT = process.env.PORT || 3000

initStore().then(() => {
  initData().then(() => {
    initBBData().then(() => {
      initLoveVarietyData().then(() => {
        // 创建 HTTP 服务器并绑定 socket.io
        const server = http.createServer(app)
        const io = new Server(server, {
          cors: {
            origin: '*',
            methods: ['GET', 'POST']
          }
        })
        // 将 io 存入 app 以便路由访问
        app.set('io', io)

        // 初始化聊天 WebSocket
        const { initChatSocket } = require('./socket/chat')
        initChatSocket(io)

        server.listen(PORT, () => {
          console.log(`Server running on port ${PORT}`)
          console.log(`WebSocket (Socket.IO) enabled`)
          console.log(`Database persistence enabled: ${process.env.MONGODB_URI}`)
        })
      })
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
