const { generateId, randomInt } = require('../utils/helpers')
const { getCollection } = require('../config/db')
const AudienceVoteSession = require('../models/AudienceVoteSession')
const AudienceMember = require('../models/AudienceMember')
const AudienceVote = require('../models/AudienceVote')
const AudienceTeamVote = require('../models/AudienceTeamVote')
const PlayerPerformance = require('../models/PlayerPerformance')
const TeamPerformance = require('../models/TeamPerformance')
const RoundTeam = require('../models/RoundTeam')
const User = require('../models/User')

const AUDIENCE_COUNT = 1000
const VOTES_PER_AUDIENCE = 3

// 评审随机档案生成
const GENDERS = ['男', '女']
const NON_STUDENT_OCCUPATIONS = [
  '教师', '医生', '程序员', '设计师', '销售', '会计', '律师',
  '公务员', '自由职业', '企业职员', '个体户', '媒体从业者', '艺术工作者',
  '服务业', '工程师', '护士', '研究员', '编辑', '摄影师'
]

// 中文姓名库（按性别区分，避免男生女名）
const SURNAMES = [
  '赵', '钱', '孙', '李', '周', '吴', '郑', '王', '冯', '陈', '褚', '卫', '蒋', '沈', '韩', '杨',
  '朱', '秦', '尤', '许', '何', '吕', '施', '张', '孔', '曹', '严', '华', '金', '魏', '陶', '姜',
  '戚', '谢', '邹', '喻', '柏', '水', '窦', '章', '云', '苏', '潘', '葛', '奚', '范', '彭', '郎',
  '鲁', '韦', '昌', '马', '苗', '凤', '花', '方', '俞', '任', '袁', '柳', '酆', '鲍', '史', '唐',
  '费', '廉', '岑', '薛', '雷', '贺', '倪', '汤', '滕', '殷', '罗', '毕', '郝', '邬', '安', '常',
  '乐', '于', '时', '傅', '皮', '卞', '齐', '康', '伍', '余', '元', '卜', '顾', '孟', '平', '黄'
]

const MALE_NAMES = [
  '伟', '强', '磊', '军', '洋', '勇', '杰', '涛', '超', '明', '辉', '刚', '平', '鹏', '飞', '波',
  '宇', '浩', '鑫', '俊', '峰', '建军', '志伟', '建国', '国强', '浩然', '子轩', '梓豪', '宇轩',
  '俊杰', '博文', '天佑', '皓轩', '昊然', '明轩', '雨泽', '烨磊', '晟睿', '文昊', '修洁', '黎昕',
  '远航', '旭尧', '鸿涛', '伟祺', '荣轩', '越泽', '浩宇', '瑾瑜', '擎苍', '擎宇', '志泽', '子杰',
  '睿渊', '弘文', '哲瀚', '楷瑞', '建辉', '晋鹏', '天磊', '绍辉', '泽洋', '明辉', '伟诚', '健柏',
  '修杰', '峻熙', '嘉懿', '煜城', '懿轩', '烨伟', '苑博', '伟泽', '熠彤', '鸿煊', '博涛', '烨霖',
  '烨华', '煜祺', '智宸', '正豪', '立诚', '立轩', '立辉', '鑫鹏', '昊天', '思聪', '展鹏', '志强'
]

const FEMALE_NAMES = [
  '娜', '敏', '静', '丽', '婷', '雪', '颖', '艳', '慧', '娟', '秀英', '桂英', '秀兰', '霞', '燕', '玲',
  '红', '梅', '莉', '洁', '云', '倩', '璐', '茜', '欣怡', '梓涵', '诗涵', '梓萱', '子涵', '雨涵', '语桐',
  '梦瑶', '若曦', '可馨', '雨萱', '诗琪', '佳怡', '梦洁', '婧琪', '雅琳', '美莲', '欢馨', '优璇', '雨嘉',
  '明美', '惠茜', '漫妮', '香茹', '月婵', '嫦曦', '静香', '凌薇', '雅静', '雪丽', '依娜', '雅芙', '雨婷',
  '怡香', '珺瑶', '婉婷', '睿婕', '静琪', '彦妮', '馨蕊', '雪雁', '煜婷', '笑怡', '娅楠', '桑榆', '倩雪',
  '灵芸', '玉珍', '茹雪', '正梅', '美琳', '梦璐', '白凡', '乐菱', '惜文', '香寒', '新柔', '语蓉', '海安',
  '夜蓉', '涵柏', '水桃', '醉蓝', '春儿', '语琴', '从彤', '傲晴', '语兰', '又菱', '碧彤', '元霜', '怜梦'
]

function randomGender() {
  return GENDERS[Math.floor(Math.random() * GENDERS.length)]
}

function randomAge() {
  return 18 + Math.floor(Math.random() * 43) // 18 ~ 60
}

function randomOccupation(age) {
  // 22岁及以下：90%概率为学生，10%为其他职业
  if (age <= 22) {
    if (Math.random() < 0.9) return '学生'
    return NON_STUDENT_OCCUPATIONS[Math.floor(Math.random() * NON_STUDENT_OCCUPATIONS.length)]
  }
  // 22岁以上：不出现学生
  return NON_STUDENT_OCCUPATIONS[Math.floor(Math.random() * NON_STUDENT_OCCUPATIONS.length)]
}

function randomChineseName(gender) {
  const surname = SURNAMES[Math.floor(Math.random() * SURNAMES.length)]
  const pool = gender === '女' ? FEMALE_NAMES : MALE_NAMES
  const given = pool[Math.floor(Math.random() * pool.length)]
  return surname + given
}

function getTeamRankBonus(rank, totalTeams) {
  // rank=1 → +30, rank=last → +0, 中间等差递减
  if (totalTeams <= 1) return 0
  return Math.round(30 * (totalTeams - rank) / (totalTeams - 1))
}

function sampleWithoutReplacement(players, count) {
  const pool = players.map(p => ({ playerId: p.playerId, weight: p.weight }))
  const selected = []

  for (let i = 0; i < count; i++) {
    const totalWeight = pool.reduce((sum, p) => sum + p.weight, 0)
    let rand = Math.random() * totalWeight
    let chosen = pool[0]

    for (const p of pool) {
      if (rand < p.weight) {
        chosen = p
        break
      }
      rand -= p.weight
    }

    selected.push(chosen.playerId)
    const idx = pool.findIndex(p => p.playerId === chosen.playerId)
    if (idx >= 0) pool.splice(idx, 1)
  }

  return selected
}

async function clearAudienceVote(roundId, includeMembers = false) {
  const targets = [
    AudienceVoteSession.deleteMany({ roundId }),
    AudienceVote.deleteMany({ roundId })
  ]
  if (includeMembers) {
    targets.push(AudienceMember.deleteMany({ roundId }))
    targets.push(AudienceTeamVote.deleteMany({ roundId }))
  }
  await Promise.all(targets)
}

async function generateAudienceVoteForRound(round, { reuseMembers = true } = {}) {
  if (!round || !round.id) throw new Error('round 必填')

  // RoundTeam 的 roundId 是前端格式 "round-{N}"，需要构造
  const frontRoundId = `round-${round.index || 1}`

  const [playerPerfs, teamPerfs, users, teams] = await Promise.all([
    PlayerPerformance.find({ roundId: round.id }),
    TeamPerformance.find({ roundId: round.id }),
    User.find({}),
    RoundTeam.find({ roundId: frontRoundId })
  ])

  if (playerPerfs.length === 0) {
    throw new Error('该轮尚未生成选手公演结果，无法生成大众评审投票')
  }

  const userMap = {}
  for (const u of users) userMap[u.id] = u

  const teamMap = {}
  for (const t of teams) teamMap[t.id] = t

  const teamRankMap = {}
  for (const t of teamPerfs) teamRankMap[t.teamId] = t.rank

  // 总队伍数（用于等差递减排名加成）
  const totalTeams = teamPerfs.length

  // 生成权重细分数据（五项分数）
  const playerWeights = []
  const weightDetails = []
  for (const pp of playerPerfs) {
    const u = userMap[pp.playerId]
    const attrs = u && u.attributes ? u.attributes : { vocal: 30, dance: 30, charm: 30 }
    // ① 基础属性贡献 = 魅力 × 2
    const baseContribution = Math.round((attrs.charm || 0) * 2)
    // ② 实时发挥贡献 = max(0, 发挥值 + random(-5, 5))
    const performanceContribution = Math.max(0, (pp.performanceValue || 0) + randomInt(-5, 5))
    // ③ 团队排名加成：第 1 名 +30，最后一名 +0，中间等差递减
    const teamRank = teamRankMap[pp.teamId] || totalTeams
    const teamRankBonus = getTeamRankBonus(teamRank, totalTeams)
    // ④ 队内 MVP 加成
    const mvpBonus = pp.rankInTeam === 1 ? randomInt(10, 20) : 0
    // ⑤ 观众缘随机值
    const audienceLuck = randomInt(0, 15)
    const totalWeight = baseContribution + performanceContribution + teamRankBonus + mvpBonus + audienceLuck

    const team = teamMap[pp.teamId]

    pp.popularityWeight = totalWeight
    pp.audienceAffinity = audienceLuck
    pp.baseContribution = baseContribution
    pp.performanceContribution = performanceContribution
    pp.teamRankBonus = teamRankBonus
    pp.mvpBonus = mvpBonus
    await pp.save()

    playerWeights.push({
      playerId: pp.playerId,
      playerName: pp.playerName || (u?.name) || null,
      teamId: pp.teamId || null,
      teamName: team?.name || null,
      weight: totalWeight,
      baseContribution,
      performanceContribution,
      teamRankBonus,
      mvpBonus,
      audienceLuck
    })

    weightDetails.push({
      playerId: pp.playerId,
      playerName: pp.playerName || (u?.name) || null,
      teamId: pp.teamId || null,
      teamName: team?.name || null,
      baseContribution,
      performanceContribution,
      teamRankBonus,
      mvpBonus,
      audienceLuck,
      totalWeight
    })
  }

  // ===== 差距拉大调整 =====
  // 将权重最低的选手权重降为 10，该选手降低 N，所有选手等量降低 N
  // 用调整后的权重进行加权抽样
  const minWeight = Math.min(...playerWeights.map(p => p.weight))
  if (minWeight > 10) {
    const N = minWeight - 10
    for (const pw of playerWeights) pw.weight -= N
    for (const wd of weightDetails) wd.totalWeight -= N
    // 同步更新数据库中的 popularityWeight
    const ppCollection = getCollection('PlayerPerformance')
    await ppCollection.updateMany(
      { roundId: round.id },
      { $inc: { popularityWeight: -N } }
    )
  }

  // 只清除旧的个人喜爱度投票，保留大众评审成员（成员在公演结算时已生成）
  await clearAudienceVote(round.id, false)

  const sessionId = `vote-round-${round.index || 1}-${Date.now()}`
  const session = new AudienceVoteSession({
    id: sessionId,
    roundId: round.id,
    createdAt: new Date().toISOString()
  })
  await session.save()

  // 复用已有的评审成员；若不存在且允许新建，则生成 1000 人
  let members = reuseMembers ? await AudienceMember.find({ roundId: round.id }) : []
  if (members.length === 0) {
    if (reuseMembers) {
      // 防御：正常流程下成员应由公演结算生成，此处给出明确提示
      console.warn(`[AudienceVote] 第 ${round.index || '?'} 轮尚未生成大众评审成员，将自动创建新成员（建议先完成公演结算）`)
    }
    const newMembers = []
    for (let i = 1; i <= AUDIENCE_COUNT; i++) {
      const age = randomAge()
      const gender = randomGender()
      newMembers.push({
        id: generateId(),
        roundId: round.id,
        seatNumber: i,
        name: randomChineseName(gender),
        gender,
        age,
        occupation: randomOccupation(age)
      })
    }
    members = await AudienceMember.insertMany(newMembers)
  }

  const votes = []
  const createdAt = session.createdAt

  for (const m of members) {
    const selectedPlayerIds = sampleWithoutReplacement(playerWeights, VOTES_PER_AUDIENCE)
    for (let order = 1; order <= VOTES_PER_AUDIENCE; order++) {
      votes.push({
        id: generateId(),
        roundId: round.id,
        audienceId: m.id,
        seatNumber: m.seatNumber,
        voteOrder: order,
        playerId: selectedPlayerIds[order - 1],
        createdAt
      })
    }
  }

  await AudienceVote.insertMany(votes)

  const voteCounts = {}
  for (const v of votes) {
    voteCounts[v.playerId] = (voteCounts[v.playerId] || 0) + 1
  }

  const rankings = playerWeights
    .map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      teamId: p.teamId,
      teamName: p.teamName,
      votes: voteCounts[p.playerId] || 0,
      totalWeight: p.weight
    }))
    .sort((a, b) => b.votes - a.votes)

  rankings.forEach((r, i) => { r.rank = i + 1 })

  return {
    sessionId,
    session: session.toObject(),
    totalAudience: AUDIENCE_COUNT,
    totalVotes: votes.length,
    rankings,
    weights: weightDetails
  }
}

module.exports = {
  generateAudienceVoteForRound,
  clearAudienceVote,
  randomChineseName,
  randomGender,
  randomAge,
  randomOccupation,
  AUDIENCE_COUNT,
  VOTES_PER_AUDIENCE
}
