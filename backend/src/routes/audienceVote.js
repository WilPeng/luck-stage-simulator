const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, getCurrentSeason, logAction } = require('../utils/helpers')
const Round = require('../models/Round')
const RoundTeam = require('../models/RoundTeam')
const User = require('../models/User')
const PlayerPerformance = require('../models/PlayerPerformance')
const AudienceVoteSession = require('../models/AudienceVoteSession')
const AudienceMember = require('../models/AudienceMember')
const AudienceVote = require('../models/AudienceVote')
const AudienceVoteFinalRanking = require('../models/AudienceVoteFinalRanking')
const { generateAudienceVoteForRound, clearAudienceVote, AUDIENCE_COUNT, VOTES_PER_AUDIENCE } = require('../services/audienceVoteService')

const router = express.Router()

// ===== roundId 兼容解析（支持 round-1 / round_1 / 数字） =====
async function resolveRoundFromBody(req) {
  const { roundId, roundIndex, round } = req.body
  return resolveRound(roundId, roundIndex ?? round)
}

async function resolveRoundFromQuery(req) {
  const { roundId, roundIndex, round } = req.query
  return resolveRound(roundId, roundIndex ?? round)
}

async function resolveRound(roundId, qRoundIdx) {
  if (roundId) {
    const r = await Round.findOne({ id: roundId })
    if (r) return r
    // 兼容 round-1 / round_1 格式
    const match = roundId.match(/^round[_-](\d+)$/)
    if (match) {
      const idx = parseInt(match[1])
      const season = await getCurrentSeason()
      if (season) {
        const r2 = await Round.findOne({ seasonId: season.id, index: idx })
        if (r2) return r2
        // 兼容 seed 数据中 roundIndex 字段名错误的情况
        const r3 = await Round.findOne({ seasonId: season.id, roundIndex: idx })
        if (r3) { r3.index = idx; await r3.save(); return r3 }
        // 创建新 Round 记录
        const newRound = new Round({
          id: generateId(), seasonId: season.id, index: idx,
          stage: 'performance', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
        })
        await newRound.save()
        return newRound
      }
      return { id: `round-${idx}`, index: idx }
    }
  }
  qRoundIdx = parseInt(qRoundIdx)
  if (!isNaN(qRoundIdx)) {
    const season = await getCurrentSeason()
    if (season) {
      const r = await Round.findOne({ seasonId: season.id, index: qRoundIdx })
      if (r) return r
      const newRound = new Round({
        id: generateId(), seasonId: season.id, index: qRoundIdx,
        stage: 'performance', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      })
      await newRound.save()
      return newRound
    }
  }
  return null
}

// ================================================================
// POST /generate - 生成大众评审投票（管理员）
// ================================================================
router.post('/generate', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRoundFromBody(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    const result = await generateAudienceVoteForRound(round)

    res.json({
      success: true,
      sessionId: result.sessionId,
      totalAudience: result.totalAudience,
      totalVotes: result.totalVotes,
      rankings: result.rankings,
      weights: result.weights
    })
  } catch (e) {
    console.error('Generate audience vote error:', e)
    const code = e.message.includes('尚未生成') ? 'NO_PERFORMANCE_RESULT' : 'SERVER_ERROR'
    res.status(500).json({ success: false, error: e.message || '生成大众评审投票失败', code })
  }
})

// ================================================================
// GET /ranking - 喜爱度排行榜（登录用户可访问）
// ================================================================
router.get('/ranking', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    const session = await AudienceVoteSession.findOne({ roundId: round.id })
    if (!session) {
      return res.json({ success: false, error: '尚未生成大众评审投票，请先调用生成接口', message: '请检查 roundId 参数是否正确', code: 'NOT_GENERATED' })
    }

    const frontRoundId = `round-${round.index || 1}`

    const [votes, playerPerfs, users, teams] = await Promise.all([
      AudienceVote.find({ roundId: round.id }),
      PlayerPerformance.find({ roundId: round.id }),
      User.find({}),
      RoundTeam.find({ $or: [{ roundId: round.id }, { roundId: frontRoundId }] })
    ])

    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const teamMap = {}
    for (const t of teams) teamMap[t.id] = t

    // 统计票数
    const voteCounts = {}
    for (const v of votes) {
      voteCounts[v.playerId] = (voteCounts[v.playerId] || 0) + 1
    }

    // 构建排行榜
    const rankings = playerPerfs
      .map(pp => {
        const team = teamMap[pp.teamId]
        return {
          playerId: pp.playerId,
          playerName: pp.playerName || (userMap[pp.playerId]?.name) || null,
          teamId: pp.teamId || null,
          teamName: team?.name || null,
          votes: voteCounts[pp.playerId] || 0,
          totalWeight: pp.popularityWeight || 0
        }
      })
      .sort((a, b) => b.votes - a.votes)

    rankings.forEach((r, i) => { r.rank = i + 1 })

    // 构建权重详情
    const weights = playerPerfs.map(pp => {
      const team = teamMap[pp.teamId]
      return {
        playerId: pp.playerId,
        playerName: pp.playerName || (userMap[pp.playerId]?.name) || null,
        teamId: pp.teamId || null,
        teamName: team?.name || null,
        baseContribution: pp.baseContribution || 0,
        performanceContribution: pp.performanceContribution || 0,
        teamRankBonus: pp.teamRankBonus || 0,
        mvpBonus: pp.mvpBonus || 0,
        audienceLuck: pp.audienceAffinity || 0,
        totalWeight: pp.popularityWeight || 0
      }
    })

    res.json({
      success: true,
      totalAudience: AUDIENCE_COUNT,
      totalVotes: votes.length,
      rankings,
      weights
    })
  } catch (e) {
    console.error('Get audience vote ranking error:', e)
    res.status(500).json({ success: false, error: '获取喜爱度排名失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// GET /seats - 评审席座位列表（管理员）
// ================================================================
router.get('/seats', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    const members = await AudienceMember.find({ roundId: round.id })
    const votedSeatNumbers = new Set(members.map(m => m.seatNumber))

    // 固定返回 1000 个座位，已投票的标记 voted: true
    const seats = []
    for (let i = 1; i <= AUDIENCE_COUNT; i++) {
      seats.push({
        id: `seat-${i}`,
        seatNumber: i,
        voted: votedSeatNumbers.has(i)
      })
    }

    res.json({
      success: true,
      totalSeats: AUDIENCE_COUNT,
      seats
    })
  } catch (e) {
    console.error('Get audience seats error:', e)
    res.status(500).json({ success: false, error: '获取大众评审席失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// GET /seat/:seatNumber - 某评审投票详情（管理员）
// ================================================================
router.get('/seat/:seatNumber', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    const seatNumber = parseInt(req.params.seatNumber)
    if (isNaN(seatNumber) || seatNumber < 1 || seatNumber > AUDIENCE_COUNT) {
      return res.status(400).json({ success: false, error: '座位号必须在 1-1000 之间', code: 'INVALID_SEAT' })
    }

    const member = await AudienceMember.findOne({ roundId: round.id, seatNumber })
    if (!member) {
      // 该座位未投票，返回空票
      return res.json({
        success: true,
        detail: {
          seatNumber,
          votes: []
        }
      })
    }

    const votes = await AudienceVote.find({ roundId: round.id, audienceId: member.id })
    votes.sort((a, b) => a.voteOrder - b.voteOrder)

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    res.json({
      success: true,
      detail: {
        seatNumber,
        votes: votes.map(v => ({
          voteOrder: v.voteOrder,
          playerId: v.playerId,
          playerName: userMap[v.playerId]?.name || null
        }))
      }
    })
  } catch (e) {
    console.error('Get audience seat error:', e)
    res.status(500).json({ success: false, error: '获取评审投票失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// DELETE / - 清空大众评审投票（管理员）
// ================================================================
router.delete('/', auth, requireAdmin, async (req, res) => {
  try {
    const round = await resolveRoundFromBody(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次', code: 'NO_ROUND' })

    await clearAudienceVote(round.id)
    res.json({ success: true, message: `已清空第 ${round.index || '?'} 轮大众评审投票` })
  } catch (e) {
    console.error('Delete audience vote error:', e)
    res.status(500).json({ success: false, error: '清空失败', code: 'SERVER_ERROR' })
  }
})

// ===== PUT /api/audience-vote/seat/:seatNumber - 微调某个评审的投票 =====
router.put('/seat/:seatNumber', auth, requireAdmin, async (req, res) => {
  try {
    // 支持 body 或 query 传轮次参数
    let round = await resolveRoundFromQuery(req)
    if (!round) {
      // 尝试从 body 解析
      round = await resolveRoundFromBody(req)
      if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 round 参数）', code: 'NO_ROUND' })
    }

    const seatNumber = parseInt(req.params.seatNumber)
    if (isNaN(seatNumber) || seatNumber < 1 || seatNumber > AUDIENCE_COUNT) {
      return res.status(400).json({ success: false, error: '座位号必须在 1-1000 之间', code: 'INVALID_SEAT' })
    }

    // 支持两种 body 格式：
    // 1. { playerIds: ["u001", "u002", "u003"] } （旧格式）
    // 2. { votes: [{ voteOrder: 1, playerId: "u001", playerName: "张三" }, ...] } （新格式）
    // 3. { round: 1, votes: [...] } （新格式带 round）
    let playerIds = req.body.playerIds
    if (!playerIds && req.body.votes) {
      playerIds = req.body.votes.map(v => v.playerId)
    }

    if (!Array.isArray(playerIds) || playerIds.length === 0 || playerIds.length > VOTES_PER_AUDIENCE) {
      return res.status(400).json({
        success: false,
        error: `缺少 playerIds 或 votes 数组，长度需 1-${VOTES_PER_AUDIENCE}`,
        code: 'INVALID_PARAMS'
      })
    }

    // 查找该座位的评审
    const member = await AudienceMember.findOne({ roundId: round.id, seatNumber })
    if (!member) return res.status(404).json({ success: false, error: '该座位尚未投票', code: 'SEAT_NOT_VOTED' })

    // 删除旧投票
    await AudienceVote.deleteMany({ roundId: round.id, audienceId: member.id })

    // 创建新投票
    const newVotes = []
    for (let i = 0; i < playerIds.length; i++) {
      newVotes.push(new AudienceVote({
        id: generateId(),
        roundId: round.id,
        audienceId: member.id,
        seatNumber,
        voteOrder: i + 1,
        playerId: playerIds[i],
        createdAt: new Date().toISOString()
      }))
    }
    for (const v of newVotes) await v.save()

    res.json({ success: true })
  } catch (e) {
    console.error('Update seat vote error:', e)
    res.status(500).json({ success: false, error: '修改投票失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/audience-vote/release - 释放最终排名，锁定结果 =====
router.post('/release', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, roundIndex, round, rankings } = req.body

    // 解析轮次
    const roundObj = await resolveRoundFromBody(req)
    if (!roundObj) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 roundIndex）', code: 'NO_ROUND' })

    // 使用传入的 rankings 或自动统计
    let finalRankings = rankings

    if (!finalRankings || !Array.isArray(finalRankings) || finalRankings.length === 0) {
      // 兼容旧行为：没有传入 rankings 时自动统计
      const session = await AudienceVoteSession.findOne({ roundId: roundObj.id })
      if (!session) {
        return res.status(400).json({ success: false, error: '尚未生成大众评审投票，请先生成', code: 'NOT_GENERATED' })
      }

      const votes = await AudienceVote.find({ roundId: roundObj.id })
      const voteCounts = {}
      for (const v of votes) {
        voteCounts[v.playerId] = (voteCounts[v.playerId] || 0) + 1
      }

      const playerPerfs = await PlayerPerformance.find({ roundId: roundObj.id })
      const users = await User.find({})
      const userMap = {}
      for (const u of users) userMap[u.id] = u

      finalRankings = playerPerfs
        .map(pp => ({
          playerId: pp.playerId,
          playerName: pp.playerName || (userMap[pp.playerId]?.name) || null,
          teamId: pp.teamId || '',
          teamName: '',
          votes: voteCounts[pp.playerId] || 0,
          totalWeight: pp.popularityWeight || 0
        }))
        .sort((a, b) => b.votes - a.votes)

      finalRankings.forEach((r, i) => { r.rank = i + 1 })
    }

    // 保存最终排名到数据库
    const now = new Date().toISOString()
    // 先删除旧记录（同一轮只能释放一次）
    await AudienceVoteFinalRanking.deleteMany({ roundId: roundObj.id })

    const finalRankingDoc = new AudienceVoteFinalRanking({
      id: generateId(),
      roundId: roundObj.id,
      roundIndex: roundObj.index,
      rankings: finalRankings,
      releasedAt: now,
      createdAt: now
    })
    await finalRankingDoc.save()

    // 标记已释放（写入 Season）
    const season = await getCurrentSeason()
    if (season) {
      season.currentStage = 'elimination'
      season.updatedAt = now
      await season.save()
    }

    await logAction(
      req.user.userId,
      req.user.name || 'admin',
      'admin',
      'AUDIENCE_RELEASE',
      'round',
      roundObj.id,
      `释放第 ${roundObj.index} 轮大众评审投票最终结果，共 ${finalRankings.length} 位选手`
    )

    res.json({
      success: true,
      message: '个人喜爱度结果已释放',
      data: {
        roundId: roundObj.id,
        roundIndex: roundObj.index,
        released: true,
        rankings: finalRankings
      }
    })
  } catch (e) {
    console.error('Release audience vote error:', e)
    res.status(500).json({ success: false, error: '释放失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/audience-vote/final-ranking - 获取最终个人喜爱度排名 =====
router.get('/final-ranking', auth, async (req, res) => {
  try {
    const round = await resolveRoundFromQuery(req)
    if (!round) return res.status(400).json({ success: false, error: '未找到轮次（请传 roundId 或 round）', code: 'NO_ROUND' })

    const finalRanking = await AudienceVoteFinalRanking.findOne({ roundId: round.id })

    if (!finalRanking) {
      return res.json({
        success: true,
        released: false,
        rankings: []
      })
    }

    res.json({
      success: true,
      released: true,
      roundId: finalRanking.roundId,
      roundIndex: finalRanking.roundIndex,
      releasedAt: finalRanking.releasedAt,
      rankings: finalRanking.rankings
    })
  } catch (e) {
    console.error('Get final ranking error:', e)
    res.status(500).json({ success: false, error: '获取最终排名失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
