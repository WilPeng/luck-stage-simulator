const { generateId, getCurrentSeason } = require('../utils/helpers')
const Round = require('../models/Round')
const RoundTeam = require('../models/RoundTeam')
const RoundTeamMember = require('../models/RoundTeamMember')
const TeamPerformance = require('../models/TeamPerformance')
const PlayerPerformance = require('../models/PlayerPerformance')
const Elimination = require('../models/Elimination')
const SafeTeam = require('../models/SafeTeam')
const User = require('../models/User')
const AudienceVoteFinalRanking = require('../models/AudienceVoteFinalRanking')
const AudienceVote = require('../models/AudienceVote')

// ====================== 轮次解析工具 ======================

/**
 * 解析轮次索引（支持 round-1 / round_1 / 1 三种格式）
 */
function parseRoundIndex(roundIdOrIndex) {
  if (typeof roundIdOrIndex === 'number') return roundIdOrIndex
  if (typeof roundIdOrIndex !== 'string') return null
  const match = roundIdOrIndex.match(/^round[_-](\d+)$/)
  if (match) return parseInt(match[1])
  const num = parseInt(roundIdOrIndex)
  if (!isNaN(num)) return num
  return null
}

/**
 * 获取 Round 对象（数据库 UUID），同时返回 frontRoundId
 */
async function resolveRoundDetail(roundIdOrIndex) {
  const idx = parseRoundIndex(roundIdOrIndex)
  if (idx === null) return null

  const season = await getCurrentSeason()
  if (!season) return null

  let round = await Round.findOne({ seasonId: season.id, index: idx })
  const frontRoundId = `round-${idx}`

  if (!round) {
    round = new Round({
      id: generateId(),
      seasonId: season.id,
      index: idx,
      stage: 'elimination',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    await round.save()
  }

  return { round, frontRoundId, roundIndex: idx }
}

// ====================== 1. 获取淘汰统计 ======================

async function getEliminationStats(roundIndex) {
  const season = await getCurrentSeason()
  if (!season) {
    return {
      totalPlayers: 0, eliminatedCount: 0, activeCount: 0,
      eliminationRate: 0, currentRound: 0, eliminatedList: []
    }
  }

  const users = await User.find({})
  const players = users.filter(u => u.role !== 'admin')

  const totalPlayers = players.length
  const eliminatedPlayers = players.filter(u => u.status === 'eliminated')
  const activePlayers = players.filter(u => u.status !== 'eliminated')
  const eliminatedCount = eliminatedPlayers.length
  const activeCount = activePlayers.length
  const eliminationRate = totalPlayers > 0 ? parseFloat(((eliminatedCount / totalPlayers) * 100).toFixed(1)) : 0

  // 获取已淘汰选手列表
  const roundDetail = roundIndex !== undefined ? await resolveRoundDetail(roundIndex) : null
  const elimFilter = roundDetail ? { roundId: roundDetail.round.id, eliminated: true } : { eliminated: true }
  const elimRecords = await Elimination.find(elimFilter)
  elimRecords.sort((a, b) => (a.rank || 999) - (b.rank || 999))

  const eliminatedList = elimRecords.map(e => ({
    id: e.id,
    userId: e.playerId || e.userId,
    userName: e.userName,
    teamName: e.teamName || null,
    round: e.roundIndex ?? null,
    rank: e.rank ?? null,
    finalScore: e.finalScore ?? null,
    reason: e.reason || '',
    eliminated: e.eliminated,
    eliminatedAt: e.eliminatedAt || null
  }))

  // 获取当前轮次
  let currentRound = season.currentRound
  if (roundDetail) {
    currentRound = roundDetail.roundIndex
  }

  return {
    totalPlayers,
    eliminatedCount,
    activeCount,
    eliminationRate,
    currentRound,
    eliminatedList
  }
}

// ====================== 2. 获取当前淘汰名单 ======================

async function getEliminationList(roundIndex) {
  const roundDetail = roundIndex !== undefined ? await resolveRoundDetail(roundIndex) : null
  const filter = roundDetail
    ? { roundId: roundDetail.round.id, eliminated: true }
    : { eliminated: true }

  const elimRecords = await Elimination.find(filter)
  elimRecords.sort((a, b) => (a.rank || 999) - (b.rank || 999))

  return elimRecords.map(e => ({
    id: e.id,
    userId: e.playerId || e.userId,
    userName: e.userName,
    teamName: e.teamName || null,
    round: e.roundIndex ?? null,
    rank: e.rank ?? null,
    finalScore: e.finalScore ?? null,
    reason: e.reason || '',
    eliminated: e.eliminated,
    eliminatedAt: e.eliminatedAt || null
  }))
}

// ====================== 3. 获取完整淘汰历史 ======================

async function getEliminationHistory() {
  const elimRecords = await Elimination.find({})
  elimRecords.sort((a, b) => {
    if (a.roundIndex !== b.roundIndex) return (a.roundIndex || 0) - (b.roundIndex || 0)
    return (a.rank || 999) - (b.rank || 999)
  })

  return elimRecords.map(e => ({
    id: e.id,
    userId: e.playerId || e.userId,
    userName: e.userName,
    teamName: e.teamName || null,
    round: e.roundIndex ?? null,
    rank: e.rank ?? null,
    finalScore: e.finalScore ?? null,
    reason: e.reason || '',
    eliminated: e.eliminated,
    eliminatedAt: e.eliminatedAt || null,
    restoredAt: e.restoredAt || null
  }))
}

// ====================== 获取大众喜爱度排名（辅助函数） ======================

/**
 * 获取选手个人喜爱度排名数据（按得票数排序）
 * 优先级：AudienceVoteFinalRanking > AudienceVote原始票数 > PlayerPerformance.rank
 * @param {object} round - Round 数据库对象
 * @returns {Map<string, {votes: number, popularityRank: number}>} playerId -> 票数和排名
 */
async function getPopularityRankings(round) {
  // 1. 优先使用已释放的最终排名
  const finalRanking = await AudienceVoteFinalRanking.findOne({ roundId: round.id })
  if (finalRanking && Array.isArray(finalRanking.rankings) && finalRanking.rankings.length > 0) {
    const result = new Map()
    for (const r of finalRanking.rankings) {
      result.set(r.playerId, { votes: r.votes || 0, popularityRank: r.rank || 999 })
    }
    return result
  }

  // 2. 其次从 AudienceVote 统计票数
  const votes = await AudienceVote.find({ roundId: round.id })
  if (votes.length > 0) {
    const voteCounts = {}
    for (const v of votes) {
      voteCounts[v.playerId] = (voteCounts[v.playerId] || 0) + 1
    }
    // 按票数排序
    const sorted = Object.entries(voteCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([playerId, count], idx) => ({ playerId, votes: count, rank: idx + 1 }))
    const result = new Map()
    for (const r of sorted) result.set(r.playerId, { votes: r.votes, popularityRank: r.rank })
    return result
  }

  // 3. 无可用的喜爱度数据，返回空
  return new Map()
}

// ====================== 4. 获取排名列表 ======================

async function getRankingList(roundIndex) {
  const roundDetail = roundIndex !== undefined ? await resolveRoundDetail(roundIndex) : null
  if (!roundDetail) {
    // 没有轮次信息，返回所有活跃选手
    const users = await User.find({})
    const players = users.filter(u => u.role !== 'admin')
    const rankings = players.map((u, i) => ({
      rank: i + 1,
      userId: u.id,
      name: u.name,
      teamId: null,
      teamName: null,
      finalScore: null,
      status: u.status === 'eliminated' ? 'eliminated' : 'safe',
      isDanger: false
    }))
    return { rankings }
  }

  const { round, frontRoundId } = roundDetail

  // 获取公演结果（用 dbRoundId 查询）
  const playerPerfs = await PlayerPerformance.find({ roundId: round.id })

  // 获取大众喜爱度排名（按得票数）
  const popularityRankings = await getPopularityRankings(round)

  // 按喜爱度排序（优先按喜爱度票数，无可比的数据用 PlayerPerformance.rank）
  const hasPopularity = popularityRankings.size > 0
  // 合并选手表现与喜爱度数据
  const enrichedPlayerPerfs = playerPerfs.map(pp => {
    const pop = popularityRankings.get(pp.playerId)
    return {
      ...(pp.toObject ? pp.toObject() : pp),
      popularityVotes: pop?.votes || 0,
      popularityRank: pop?.popularityRank || 999
    }
  })
  if (hasPopularity) {
    // 按喜爱度票数降序，同票按原始 rank 升序
    enrichedPlayerPerfs.sort((a, b) => b.popularityVotes - a.popularityVotes || (a.rank || 999) - (b.rank || 999))
  } else {
    // 无喜爱度数据，按原始公演排名
    enrichedPlayerPerfs.sort((a, b) => (a.rank || 999) - (b.rank || 999))
  }

  // 获取安全团
  const safeTeams = await SafeTeam.find({ round: round.index })
  const safeTeamIds = new Set(safeTeams.map(st => st.teamId))

  // 获取淘汰记录
  const elimRecords = await Elimination.find({ roundId: round.id, eliminated: true })
  const eliminatedPlayerIds = new Set()
  for (const e of elimRecords) {
    if (e.playerId) eliminatedPlayerIds.add(e.playerId)
    if (e.userId) eliminatedPlayerIds.add(e.userId)
  }

  // 获取用户信息
  const users = await User.find({})
  const userMap = {}
  for (const u of users) userMap[u.id] = u

  // 获取队伍信息（用 frontRoundId 查询）
  const members = await RoundTeamMember.find({ roundId: frontRoundId })
  const playerToTeam = new Map()
  for (const m of members) playerToTeam.set(m.playerId, m.teamId)

  const teams = await RoundTeam.find({ roundId: frontRoundId })
  const teamMap = {}
  for (const t of teams) teamMap[t.id] = t

  const totalPlayers = enrichedPlayerPerfs.length
  const dangerLine = Math.ceil(totalPlayers / 2) // 后50%是危险区

  const rankings = enrichedPlayerPerfs.map((pp, idx) => {
    const rank = idx + 1
    const userId = pp.playerId
    const user = userMap[userId]
    const teamId = playerToTeam.get(userId) || pp.teamId || null
    const team = teamId ? teamMap[teamId] : null

    let status = 'safe'
    let isDanger = false

    if (eliminatedPlayerIds.has(userId)) {
      status = 'eliminated'
    } else if (rank > dangerLine && !safeTeamIds.has(teamId)) {
      status = 'danger'
      isDanger = true
    } else if (safeTeamIds.has(teamId)) {
      status = 'safe'
    } else {
      status = rank <= dangerLine ? 'safe' : 'danger'
      isDanger = status === 'danger'
    }

    return {
      rank,
      userId,
      name: pp.playerName || (user?.name) || userId,
      teamId,
      teamName: team?.name || pp.teamName || null,
      finalScore: pp.finalScore ?? null,
      popularityVotes: pp.popularityVotes || 0,
      status,
      isDanger
    }
  })

  return { rankings }
}

// ====================== 5. 获取淘汰候选选手 ======================

async function getEliminationCandidates(roundIdOrIndex) {
  const roundDetail = await resolveRoundDetail(roundIdOrIndex)
  if (!roundDetail) throw new Error('无效的轮次参数')

  const { round, frontRoundId } = roundDetail

  // 获取安全团
  const safeTeams = await SafeTeam.find({ round: round.index })
  const safeTeamIds = new Set(safeTeams.map(st => st.teamId))

  // 获取已淘汰的选手
  const elimRecords = await Elimination.find({ roundId: round.id, eliminated: true })
  const eliminatedPlayerIds = new Set()
  for (const e of elimRecords) {
    if (e.playerId) eliminatedPlayerIds.add(e.playerId)
    if (e.userId) eliminatedPlayerIds.add(e.userId)
  }

  // 获取公演结果
  const playerPerfs = await PlayerPerformance.find({ roundId: round.id })

  // 获取大众喜爱度排名（按得票数）
  const popularityRankings = await getPopularityRankings(round)

  // 按喜爱度排序
  const hasPopularity = popularityRankings.size > 0
  const enrichedPlayerPerfs = playerPerfs.map(pp => {
    const pop = popularityRankings.get(pp.playerId)
    return {
      ...(pp.toObject ? pp.toObject() : pp),
      popularityVotes: pop?.votes || 0,
      popularityRank: pop?.popularityRank || 999
    }
  })
  if (hasPopularity) {
    enrichedPlayerPerfs.sort((a, b) => b.popularityVotes - a.popularityVotes || (a.rank || 999) - (b.rank || 999))
  } else {
    enrichedPlayerPerfs.sort((a, b) => (a.rank || 999) - (b.rank || 999))
  }

  const teamPerfs = await TeamPerformance.find({ roundId: round.id })
  const teamPerfMap = {}
  for (const tp of teamPerfs) teamPerfMap[tp.teamId] = tp

  // 获取队伍信息
  const members = await RoundTeamMember.find({ roundId: frontRoundId })
  const playerToTeam = new Map()
  for (const m of members) playerToTeam.set(m.playerId, m.teamId)

  const teams = await RoundTeam.find({ roundId: frontRoundId })
  const teamMap = {}
  for (const t of teams) teamMap[t.id] = t

  // 获取用户
  const users = await User.find({})
  const userMap = {}
  for (const u of users) userMap[u.id] = u

  const totalPlayers = enrichedPlayerPerfs.length
  const dangerLine = Math.ceil(totalPlayers / 2)

  // 筛选危险区选手（未被淘汰 + 喜爱度排名在后50% + 不在安全团）
  const candidates = enrichedPlayerPerfs
    .filter((pp, idx) => {
      if (eliminatedPlayerIds.has(pp.playerId)) return false
      if (safeTeamIds.has(pp.teamId)) return false
      return (idx + 1) > dangerLine
    })
    .map(pp => {
      const userId = pp.playerId
      const user = userMap[userId]
      const teamId = playerToTeam.get(userId) || pp.teamId || null
      const team = teamId ? teamMap[teamId] : null
      const tp = teamId ? teamPerfMap[teamId] : null

      return {
        userId,
        userName: pp.playerName || (user?.name) || userId,
        teamName: team?.name || pp.teamName || null,
        teamId,
        teamShowScore: tp?.finalVotes ?? tp?.finalScore ?? null,
        personalScore: pp.finalScore ?? null,
        popularityVotes: pp.popularityVotes || 0,
        rank: pp.rank ?? null
      }
    })

  return candidates
}

// ====================== 6. 手动批量淘汰 ======================

async function manualEliminate(params) {
  const { userIds, playerIds, reason = '管理员手动淘汰', round: roundIndex } = params
  const ids = Array.isArray(userIds) && userIds.length > 0 ? userIds : (Array.isArray(playerIds) ? playerIds : [])

  if (ids.length === 0) {
    throw new Error('请选择要淘汰的选手')
  }

  // 解析轮次
  let dbRoundId = null
  let roundIdx = roundIndex
  if (roundIndex !== undefined) {
    const roundDetail = await resolveRoundDetail(roundIndex)
    if (roundDetail) {
      dbRoundId = roundDetail.round.id
      roundIdx = roundDetail.roundIndex
    }
  }

  // 如果没有指定轮次，使用当前赛季轮次
  if (!dbRoundId) {
    const season = await getCurrentSeason()
    if (season) {
      const rd = await resolveRoundDetail(season.currentRound)
      if (rd) {
        dbRoundId = rd.round.id
        roundIdx = rd.roundIndex
      }
    }
  }

  const users = await User.find({})
  const userMap = {}
  for (const u of users) userMap[u.id] = u

  // 获取公演结果
  const playerPerfs = dbRoundId ? await PlayerPerformance.find({ roundId: dbRoundId }) : []
  const playerPerfMap = new Map()
  for (const pp of playerPerfs) playerPerfMap.set(pp.playerId, pp)

  // 获取队伍信息
  const frontRoundId = `round-${roundIdx || 1}`
  const members = await RoundTeamMember.find({ roundId: frontRoundId })
  const playerToTeam = new Map()
  for (const m of members) playerToTeam.set(m.playerId, m.teamId)

  const teams = await RoundTeam.find({ roundId: frontRoundId })
  const teamMap = {}
  for (const t of teams) teamMap[t.id] = t

  const eliminatedList = []
  const failedList = []

  // 获取安全团列表（如果指定了轮次）
  const safeTeamIds = new Set()
  if (roundIdx !== null && roundIdx !== undefined) {
    const safeTeams = await SafeTeam.find({ round: roundIdx })
    for (const st of safeTeams) safeTeamIds.add(st.teamId)
  }

  for (const userId of ids) {
    const user = userMap[userId]
    if (!user) {
      failedList.push({ userId, reason: '用户不存在' })
      continue
    }
    if (user.role === 'admin') {
      failedList.push({ userId, userName: user.name, reason: '不能淘汰管理员' })
      continue
    }
    if (user.status === 'eliminated') {
      failedList.push({ userId, userName: user.name, reason: '该选手已被淘汰' })
      continue
    }

    // 检查是否在安全团（如果能确定队伍）
    const teamId = playerToTeam.get(userId) || null
    if (teamId && safeTeamIds.has(teamId)) {
      failedList.push({ userId, userName: user.name, reason: '该选手在安全团中，不能淘汰' })
      continue
    }

    // 更新用户状态
    user.status = 'eliminated'
    await user.save()

    const pp = playerPerfMap.get(userId)
    const teamName = teamId ? teamMap[teamId]?.name || null : null

    // 写入淘汰记录
    const elim = new Elimination({
      id: generateId(),
      roundId: dbRoundId,
      roundIndex: roundIdx,
      playerId: userId,
      userId,
      userName: user.name,
      teamId,
      teamName,
      finalScore: pp?.finalScore ?? null,
      rank: pp?.rank ?? null,
      reason,
      eliminated: true,
      eliminatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    })
    await elim.save()

    eliminatedList.push({
      userId,
      userName: user.name,
      rank: pp?.rank ?? null,
      finalScore: pp?.finalScore ?? null
    })
  }

  return {
    round: roundIdx,
    eliminatedList,
    eliminatedCount: eliminatedList.length,
    failedList,
    failedCount: failedList.length
  }
}

// ====================== 7. 恢复被淘汰选手 ======================

async function restorePlayer(userId) {
  const user = await User.findOne({ id: userId })
  if (!user) throw new Error('用户不存在')

  user.status = 'active'
  await user.save()

  // 将最新的淘汰记录标记为已恢复
  const elimRecords = await Elimination.find({ playerId: userId, eliminated: true })
  elimRecords.sort((a, b) => new Date(b.eliminatedAt || b.createdAt) - new Date(a.eliminatedAt || a.createdAt))
  if (elimRecords.length > 0) {
    const latest = elimRecords[0]
    latest.eliminated = false
    latest.restoredAt = new Date().toISOString()
    await latest.save()
  }

  return {
    userId: user.id,
    name: user.name,
    status: 'active'
  }
}

// ====================== 8. 标记安全团 ======================

async function markSafeTeams(roundIndex, teamIds) {
  if (!Array.isArray(teamIds) || teamIds.length === 0) {
    throw new Error('请选择要标记的队伍')
  }
  if (typeof roundIndex !== 'number' || roundIndex < 1) {
    throw new Error('无效的轮次参数')
  }

  // 获取队伍信息
  const frontRoundId = `round-${roundIndex}`
  const teams = await RoundTeam.find({ roundId: frontRoundId })
  const teamMap = {}
  for (const t of teams) teamMap[t.id] = t

  // 删除该轮旧的安全团标记
  await SafeTeam.deleteMany({ round: roundIndex })

  const results = []
  const now = new Date().toISOString()

  for (const teamId of teamIds) {
    const team = teamMap[teamId]
    const safeTeam = new SafeTeam({
      id: `st-${teamId}`,
      round: roundIndex,
      teamId,
      teamName: team?.name || null,
      markedAt: now,
      createdAt: now,
      updatedAt: now
    })
    await safeTeam.save()
    results.push(safeTeam.toObject())
  }

  return results
}

// ====================== 9. 获取安全团列表 ======================

async function getSafeTeams(roundIndex) {
  const filter = {}
  if (roundIndex !== undefined) {
    filter.round = roundIndex
  }

  const safeTeams = await SafeTeam.find(filter)
  safeTeams.sort((a, b) => (a.round || 0) - (b.round || 0))

  return safeTeams.map(st => ({
    id: st.id,
    round: st.round,
    teamId: st.teamId,
    teamName: st.teamName || null,
    markedAt: st.markedAt || st.createdAt || null
  }))
}

module.exports = {
  parseRoundIndex,
  resolveRoundDetail,
  getEliminationStats,
  getEliminationList,
  getEliminationHistory,
  getRankingList,
  getEliminationCandidates,
  manualEliminate,
  restorePlayer,
  markSafeTeams,
  getSafeTeams
}
