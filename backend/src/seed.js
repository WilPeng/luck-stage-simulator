const dotenv = require('dotenv')

dotenv.config()

const User = require('./models/User')
const Season = require('./models/Season')
const Team = require('./models/Team')
const Song = require('./models/Song')
const TrainingCard = require('./models/TrainingCard')
const Round = require('./models/Round')
const RoundPreparation = require('./models/RoundPreparation')
const StageEvent = require('./models/StageEvent')

const { v4: uuidv4 } = require('uuid')

const generateId = () => uuidv4()

const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

const seedData = async () => {
  try {
    console.log('Initializing memory database...')

    await User.deleteMany({})
    await Season.deleteMany({})
    await Team.deleteMany({})
    await Song.deleteMany({})
    await TrainingCard.deleteMany({})
    await Round.deleteMany({})
    await RoundPreparation.deleteMany({})
    console.log('Cleared existing data')

    // ===== 创建管理员 =====
    const admin = new User({
      id: generateId(),
      name: '赛事管理员',
      loginCode: 'ADMIN2026',
      role: 'admin',
      status: 'active',
      hasLogin: false,
      attributes: { vocal: 0, dance: 0, charm: 0 },
      trainingCount: 0
    })
    await admin.save()
    console.log('Created admin user')

    // ===== 创建选手 =====
    const playerNames = ['选手A', '选手B', '选手C', '选手D', '选手E', '选手F', '选手G', '选手H', '选手I', '选手J', '选手K', '选手L', '选手M', '选手N', '选手O', '选手P']
    const users = []

    for (let i = 0; i < 16; i++) {
      const user = new User({
        id: `u${String(i + 1).padStart(3, '0')}`,
        name: playerNames[i],
        loginCode: `CF2026-A${String(i + 1).padStart(3, '0')}`,
        role: 'player',
        status: 'active',
        teamId: null,
        hasLogin: false,
        attributes: {
          vocal: randomInt(30, 60),
          dance: randomInt(30, 60),
          charm: randomInt(30, 60)
        },
        trainingCount: 0
      })
      users.push(user)
    }
    await User.insertMany(users)
    console.log(`Created ${users.length} players`)

    // ===== 创建 Season（含 totalRounds/currentRound） =====
    const seasonId = generateId()
    const season = new Season({
      id: seasonId,
      name: '乘风2026第一季',
      currentStage: 'preparation',
      currentRound: 1,
      totalRounds: 3,
      status: 'running'
    })
    await season.save()
    console.log('Created season')

    // ===== 创建 Round 记录（第一轮默认） =====
    const round1 = new Round({
      id: generateId(),
      seasonId: seasonId,
      index: 1
    })
    await round1.save()
    console.log('Created round 1')

    // ===== 创建默认 RoundPreparation（第一轮准备配置） =====
    const prep = new RoundPreparation({
      id: generateId(),
      roundId: round1.id,
      teamCount: 4,
      teams: [
        { teamId: null, maxMembers: 4 },
        { teamId: null, maxMembers: 4 },
        { teamId: null, maxMembers: 4 },
        { teamId: null, maxMembers: 4 }
      ],
      songPool: []
    })
    await prep.save()
    console.log('Created default round preparation')

    // ===== 创建歌曲库 =====
    const songs = [
      { id: 's001', name: '逆光飞翔', style: '流行', difficulty: 3, vocalWeight: 4, danceWeight: 3, charmWeight: 3, baseScore: 100, riskFactor: 0.2, type: 'team_show' },
      { id: 's002', name: '舞动奇迹', style: '舞曲', difficulty: 4, vocalWeight: 2, danceWeight: 5, charmWeight: 3, baseScore: 100, riskFactor: 0.3, type: 'team_show' },
      { id: 's003', name: '星光大道', style: '抒情', difficulty: 3, vocalWeight: 5, danceWeight: 2, charmWeight: 3, baseScore: 100, riskFactor: 0.15, type: 'team_show' },
      { id: 's004', name: '魅力四射', style: '动感', difficulty: 4, vocalWeight: 3, danceWeight: 3, charmWeight: 5, baseScore: 100, riskFactor: 0.25, type: 'team_collab' },
      { id: 's005', name: '乘风破浪', style: '励志', difficulty: 5, vocalWeight: 4, danceWeight: 4, charmWeight: 4, baseScore: 100, riskFactor: 0.4, type: 'team_show' },
      { id: 's006', name: '梦想舞台', style: '流行', difficulty: 3, vocalWeight: 3, danceWeight: 4, charmWeight: 3, baseScore: 100, riskFactor: 0.2, type: 'pk_show' }
    ]
    await Song.insertMany(songs)
    console.log(`Created ${songs.length} songs`)

    // ===== 创建训练卡 =====
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
      { id: 'tc015', name: '突破极限', type: 'event', description: '突破自身极限，最高属性中幅提升', effect: { highest: 3 }, weight: 10, enabled: true },
      { id: 'tc016', name: '自主特训', type: 'self_select', description: '自由选择一项属性增加', effect: { selfSelect: 5 }, weight: 8, enabled: true }
    ]
    await TrainingCard.insertMany(trainingCards)
    console.log(`Created ${trainingCards.length} training cards`)

    // ===== 创建舞台事件 =====
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
    await StageEvent.insertMany(stageEvents)
    console.log(`Created ${stageEvents.length} stage events`)

    console.log('\n=== Seed completed successfully! ===')
    console.log('\nAdmin login code: ADMIN2026')
    console.log('Player login codes: CF2026-A001 to CF2026-A016')

    process.exit(0)
  } catch (error) {
    console.error('Seed error:', error)
    process.exit(1)
  }
}

seedData()
