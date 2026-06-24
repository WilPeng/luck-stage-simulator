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

    const admin = new User({
      id: generateId(),
      name: '赛事管理员',
      loginCode: 'ADMIN2026',
      password: '$2a$10$rJ3iK8WX5v9u0V7k8M2yUe7i8j9k0L1m2n3o4p5q6r7s8t9u0',
      role: 'admin',
      status: 'active',
      hasLogin: false,
      attributes: { vocal: 0, dance: 0, charm: 0 },
      trainingCount: 0
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
        trainingCount: randomInt(0, 3)
      })
      users.push(user)
    }
    await User.insertMany(users)

    const season = new Season({
      id: generateId(),
      name: '乘风2026第一季',
      currentStage: 'setup',
      status: 'running',
      teamSetup: null
    })
    await season.save()

    const songs = [
      { id: 's001', name: '逆光飞翔', style: '流行', difficulty: 3, vocalWeight: 4, danceWeight: 3, charmWeight: 3, baseScore: 100, riskFactor: 0.2 },
      { id: 's002', name: '舞动奇迹', style: '舞曲', difficulty: 4, vocalWeight: 2, danceWeight: 5, charmWeight: 3, baseScore: 100, riskFactor: 0.3 },
      { id: 's003', name: '星光大道', style: '抒情', difficulty: 3, vocalWeight: 5, danceWeight: 2, charmWeight: 3, baseScore: 100, riskFactor: 0.15 },
      { id: 's004', name: '魅力四射', style: '动感', difficulty: 4, vocalWeight: 3, danceWeight: 3, charmWeight: 5, baseScore: 100, riskFactor: 0.25 },
      { id: 's005', name: '乘风破浪', style: '励志', difficulty: 5, vocalWeight: 4, danceWeight: 4, charmWeight: 4, baseScore: 100, riskFactor: 0.4 },
      { id: 's006', name: '梦想舞台', style: '流行', difficulty: 3, vocalWeight: 3, danceWeight: 4, charmWeight: 3, baseScore: 100, riskFactor: 0.2 }
    ]
    await Song.insertMany(songs.map(s => new Song(s)))

    const trainingCards = [
      { id: 'tc001', name: '声乐老师加课', type: 'vocal', description: '声乐老师单独辅导，Vocal大幅提升', effect: { vocal: 5 }, weight: 15, enabled: true },
      { id: 'tc002', name: '高强度舞蹈课', type: 'dance', description: '魔鬼训练，Dance能力大幅提升', effect: { dance: 5 }, weight: 15, enabled: true },
      { id: 'tc003', name: '镜头感爆发', type: 'charm', description: '突然开窍，Charm大幅提升', effect: { charm: 5 }, weight: 15, enabled: true },
      { id: 'tc004', name: '状态稳定', type: 'mixed', description: '状态良好，三项属性均有提升', effect: { vocal: 2, dance: 2, charm: 2 }, weight: 20, enabled: true },
      { id: 'tc005', name: '摆烂一天', type: 'event', description: '状态不佳，随机一项属性下降', effect: { randomOne: -4 }, weight: 10, enabled: true },
      { id: 'tc006', name: '黑马时刻', type: 'event', description: '潜力爆发，最低属性大幅提升', effect: { lowest: 6 }, weight: 10, enabled: true },
      { id: 'tc007', name: '全能特训', type: 'mixed', description: '全面训练，两项属性提升', effect: { randomTwo: 3 }, weight: 10, enabled: true },
      { id: 'tc008', name: '巅峰突破', type: 'event', description: '突破瓶颈，最高属性大幅提升', effect: { highest: 4 }, weight: 5, enabled: true },
      { id: 'tc009', name: '轻声吟唱', type: 'vocal', description: '轻声练习，Vocal小幅提升', effect: { vocal: 3 }, weight: 18, enabled: true },
      { id: 'tc010', name: '舞蹈基础', type: 'dance', description: '基础舞步练习，Dance小幅提升', effect: { dance: 3 }, weight: 18, enabled: true },
      { id: 'tc011', name: '表情管理', type: 'charm', description: '学习表情管理，Charm小幅提升', effect: { charm: 3 }, weight: 18, enabled: true },
      { id: 'tc012', name: '综合练习', type: 'mixed', description: '综合能力训练', effect: { vocal: 1, dance: 1, charm: 1 }, weight: 25, enabled: true },
      { id: 'tc013', name: '超级摆烂', type: 'event', description: '彻底休息，随机两项属性下降', effect: { randomTwo: -3 }, weight: 8, enabled: true },
      { id: 'tc014', name: '潜力觉醒', type: 'event', description: '潜力觉醒，最低属性中幅提升', effect: { lowest: 4 }, weight: 12, enabled: true },
      { id: 'tc015', name: '突破极限', type: 'event', description: '突破自身极限，最高属性中幅提升', effect: { highest: 3 }, weight: 10, enabled: true }
    ]
    await TrainingCard.insertMany(trainingCards.map(tc => new TrainingCard(tc)))

    const stageEvents = [
      { id: 'evt001', name: '观众沸腾', voteEffect: 87, description: '现场气氛极佳，观众给予了极高认可' },
      { id: 'evt002', name: '全场合唱', voteEffect: 120, description: '全场观众起立合唱，场面震撼人心' },
      { id: 'evt003', name: '舞台事故', voteEffect: -100, description: '演出中出现意外，影响了整体表现' },
      { id: 'evt004', name: '完美配合', voteEffect: 65, description: '队员之间配合默契，舞台效果极佳' },
      { id: 'evt005', name: '灯光故障', voteEffect: -50, description: '灯光系统出现短暂故障，但选手坚持完成演出' },
      { id: 'evt006', name: '即兴发挥', voteEffect: 45, description: '选手临场即兴发挥，给观众带来惊喜' },
      { id: 'evt007', name: '深情演绎', voteEffect: 55, description: '情感投入极深，打动了许多观众' },
      { id: 'evt008', name: '高音爆发', voteEffect: 70, description: '高音部分爆发力十足，全场欢呼' },
      { id: 'evt009', name: '服装失误', voteEffect: -30, description: '服装出现小问题，略微影响了视觉效果' },
      { id: 'evt010', name: '中规中矩', voteEffect: 0, description: '演出平稳进行，没有特别出彩但也没有失误' }
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

app.use('/api/auth', require('./routes/auth'))
app.use('/api/season', require('./routes/season'))
app.use('/api/admin', require('./routes/admin'))
app.use('/api/users', require('./routes/users'))
app.use('/api/teams', require('./routes/teams'))
app.use('/api/captain', require('./routes/captain'))
app.use('/api/songs', require('./routes/songs'))
app.use('/api/training', require('./routes/training'))
app.use('/api/rehearsal', require('./routes/rehearsal'))
app.use('/api/performance', require('./routes/performance'))
app.use('/api/player', require('./routes/player'))
app.use('/api/admin/audience-vote', require('./routes/audienceVote'))
app.use('/api/audience-vote', require('./routes/audienceVote'))
app.use('/api/elimination', require('./routes/elimination'))
app.use('/api/logs', require('./routes/logs'))
app.use('/api/chat', require('./routes/chat'))
app.use('/api/songs/round', require('./routes/roundSongs'))

app.get('/', (req, res) => {
  res.send('乘风2026运气赛 API 服务运行中')
})

const PORT = process.env.PORT || 3000

initStore().then(() => {
  initData().then(() => {
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
}).catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})

process.on('SIGINT', async () => {
  await closeStore()
  process.exit(0)
})
