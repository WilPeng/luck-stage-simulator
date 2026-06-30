const { generateId, randomInt } = require('../utils/helpers')
const { getCollection } = require('../config/db')
const AudienceVoteSession = require('../models/AudienceVoteSession')
const AudienceMember = require('../models/AudienceMember')
const AudienceVote = require('../models/AudienceVote')
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

async function clearAudienceVote(roundId) {
  await Promise.all([
    AudienceVoteSession.deleteMany({ roundId }),
    AudienceMember.deleteMany({ roundId }),
    AudienceVote.deleteMany({ roundId })
  ])
}

async function generateAudienceVoteForRound(round) {
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

  await clearAudienceVote(round.id)

  const sessionId = `vote-round-${round.index || 1}-${Date.now()}`
  const session = new AudienceVoteSession({
    id: sessionId,
    roundId: round.id,
    createdAt: new Date().toISOString()
  })
  await session.save()

  const members = []
  for (let i = 1; i <= AUDIENCE_COUNT; i++) {
    const age = randomAge()
    members.push({
      id: generateId(),
      roundId: round.id,
      seatNumber: i,
      gender: randomGender(),
      age,
      occupation: randomOccupation(age)
    })
  }
  const savedMembers = await AudienceMember.insertMany(members)

  const votes = []
  const createdAt = session.createdAt

  for (const m of savedMembers) {
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
  AUDIENCE_COUNT,
  VOTES_PER_AUDIENCE
}
