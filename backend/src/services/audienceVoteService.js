const { generateId, randomInt } = require('../utils/helpers')
const AudienceVoteSession = require('../models/AudienceVoteSession')
const AudienceMember = require('../models/AudienceMember')
const AudienceVote = require('../models/AudienceVote')
const PlayerPerformance = require('../models/PlayerPerformance')
const TeamPerformance = require('../models/TeamPerformance')
const RoundTeam = require('../models/RoundTeam')
const User = require('../models/User')

const AUDIENCE_COUNT = 1000
const VOTES_PER_AUDIENCE = 3

function getTeamRankBonus(rank) {
  if (rank === 1) return 50
  if (rank === 2) return 30
  if (rank === 3) return 20
  if (rank === 4) return 10
  if (rank === 5) return 5
  return 0
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

  // 生成权重细分数据（五项分数）
  const playerWeights = []
  const weightDetails = []
  for (const pp of playerPerfs) {
    const u = userMap[pp.playerId]
    const attrs = u && u.attributes ? u.attributes : { vocal: 30, dance: 30, charm: 30 }
    const baseContribution = Math.round(((attrs.vocal || 0) + (attrs.dance || 0) + (attrs.charm || 0)) * 0.5)
    const performanceContribution = Math.max(0, (pp.performanceValue || 0) * 2 + randomInt(-5, 5))
    const teamRank = teamRankMap[pp.teamId] || 99
    const teamRankBonus = getTeamRankBonus(teamRank)
    const mvpBonus = pp.rankInTeam === 1 ? randomInt(15, 30) : 0
    const audienceLuck = randomInt(5, 35)
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
    members.push({ id: generateId(), roundId: round.id, seatNumber: i })
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
