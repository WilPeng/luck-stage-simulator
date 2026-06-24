const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction, maskPlayer, getCurrentSeason, ACTION_TYPES, STAGE_ORDER } = require('../utils/helpers')
const CaptainVote = require('../models/CaptainVote')
const RoundCaptain = require('../models/RoundCaptain')
const RoundTeam = require('../models/RoundTeam')
const RoundTeamMember = require('../models/RoundTeamMember')
const Round = require('../models/Round')
const User = require('../models/User')

const router = express.Router()

async function getRound(roundId) {
  if (roundId) {
    // 先按 id 精确查找
    let round = await Round.findOne({ id: roundId })
    if (round) return round
    // 未找到时尝试按索引查找（如 "round-1" → index: 1）
    const match = roundId.match(/^round[_-](\d+)$/i)
    if (match) {
      const idx = parseInt(match[1])
      const season = await getCurrentSeason()
      if (season) {
        round = await Round.findOne({ seasonId: season.id, index: idx })
        if (round) return round
      }
      // 数据库无此轮次记录时，返回虚拟 round（兼容开发模式）
      return { id: `round-${idx}`, index: idx }
    }
    return null
  }
  const season = await getCurrentSeason()
  if (!season) return null
  return await Round.findOne({ seasonId: season.id, index: season.currentRound })
}

// ===== POST /api/captain/vote - 队长投票（每人每轮 2 票）=====
router.post('/vote', auth, async (req, res) => {
  try {
    const { roundId, voteForPlayerIds } = req.body
    const voterId = req.user.userId

    // 参数校验
    if (!Array.isArray(voteForPlayerIds) || voteForPlayerIds.length < 1 || voteForPlayerIds.length > 2) {
      return res.status(400).json({ success: false, error: 'voteForPlayerIds 数组长度须为 1-2', code: 'INVALID_PARAMS' })
    }

    // 检查候选人是否有重复
    if (new Set(voteForPlayerIds).size !== voteForPlayerIds.length) {
      return res.status(400).json({ success: false, error: '不可重复投票给同一人', code: 'DUPLICATE_CANDIDATE' })
    }

    // 检查轮次
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    // 检查投票阶段是否已过（当前阶段必须是 captain_vote 或之前）
    const season = await getCurrentSeason()
    if (season) {
      const curIdx = STAGE_ORDER.indexOf(season.currentStage)
      const voteIdx = STAGE_ORDER.indexOf('captain_vote')
      if (curIdx > voteIdx) {
        return res.status(400).json({ success: false, error: '本轮队长投票已截止', code: 'VOTE_CLOSED' })
      }
    }

    // 检查该选手在本轮是否已投过票
    const existingVotes = await CaptainVote.find({ roundId: rId, voterId })
    if (existingVotes.length > 0) {
      return res.status(400).json({ success: false, error: '你已在本轮投过票，不可修改', code: 'ALREADY_VOTED' })
    }

    // 验证候选人是否为有效选手（存在且活跃）
    const allUsers = await User.find({})
    const userMap = {}
    for (const u of allUsers) userMap[u.id] = u

    for (const pid of voteForPlayerIds) {
      const user = userMap[pid]
      if (!user) return res.status(400).json({ success: false, error: `选手 ${pid} 不存在`, code: 'CANDIDATE_NOT_FOUND' })
      if (user.status === 'eliminated') return res.status(400).json({ success: false, error: `选手 ${user.name} 已被淘汰`, code: 'CANDIDATE_ELIMINATED' })
    }

    // 创建投票记录
    const voteRecords = []
    for (const candidateId of voteForPlayerIds) {
      const vote = new CaptainVote({
        id: generateId(), roundId: rId, roundIndex: round.index,
        voterId, candidateId, createdAt: new Date().toISOString()
      })
      await vote.save()
      voteRecords.push(vote)
    }

    logAction(voterId, req.user.name || voterId, req.user.role, ACTION_TYPES.CAPTAIN_VOTE, 'round', rId,
      `投票给 ${voteForPlayerIds.map(id => userMap[id]?.name || id).join('、')}`)

    res.json({ success: true, data: voteRecords, votedFor: voteForPlayerIds })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '投票失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/captain/votes - 管理员查看本轮所有投票详情 =====
router.get('/votes', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const votes = await CaptainVote.find({ roundId: rId })

    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const enriched = votes.map(v => ({
      id: v.id, roundId: v.roundId,
      voterId: v.voterId, voterName: userMap[v.voterId] ? userMap[v.voterId].name : null,
      targetId: v.candidateId, targetName: userMap[v.candidateId] ? userMap[v.candidateId].name : null,
      createdAt: v.createdAt
    }))
    res.json({ success: true, data: enriched, total: enriched.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取投票失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/captain/results - 投票结果（得票统计）=====
router.get('/results', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const votes = await CaptainVote.find({ roundId: rId })

    const countMap = {}
    for (const v of votes) countMap[v.candidateId] = (countMap[v.candidateId] || 0) + 1
    const users = await User.find({})
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const results = Object.keys(countMap)
      .map(cid => ({
        playerId: cid,
        playerName: userMap[cid] ? userMap[cid].name : null,
        voteCount: countMap[cid]
      }))
      .sort((a, b) => b.voteCount - a.voteCount)
      .map((item, index) => ({ ...item, rank: index + 1 }))

    res.json({ success: true, data: results })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取投票结果失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/captain/votes - 清空投票（roundId 必填）=====
router.delete('/votes', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const result = await CaptainVote.deleteMany({ roundId: rId })
    res.json({ success: true, deleted: result.deletedCount || 0 })
  } catch (e) {
    res.status(500).json({ success: false, error: '清除投票失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/captain/admin/assign - 管理员指定队长 =====
router.post('/admin/assign', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, userId, playerId, teamId } = req.body
    const pid = playerId || userId
    if (!pid || !teamId) return res.status(400).json({ success: false, error: 'playerId 和 teamId 必填', code: 'INVALID_PARAMS' })

    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')

    // 删除该轮该队伍原队长记录
    await RoundCaptain.deleteMany({ roundId: rId, teamId })

    const captain = new RoundCaptain({
      id: generateId(), roundId: rId, roundIndex: round ? round.index : null,
      playerId: pid, teamId, assignedBy: req.user.userId, createdAt: new Date().toISOString()
    })
    await captain.save()

    // 更新 RoundTeam.captainId
    const team = await RoundTeam.findOne({ id: teamId })
    if (team) { team.captainId = pid; await team.save() }

    // 更新用户角色
    const user = await User.findOne({ id: pid })
    if (user && user.role !== 'admin') { user.role = 'captain'; await user.save() }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.CAPTAIN_ASSIGN, 'team', teamId, `指派 ${user ? user.name : pid} 为队长`)
    res.json({ success: true, data: captain })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '指派队长失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/captain/admin/unassign - 取消队长（roundId 必填）=====
router.post('/admin/unassign', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, userId, playerId, teamId } = req.body
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const pid = playerId || userId
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const filter = { roundId: rId }
    if (teamId) filter.teamId = teamId
    if (pid) filter.playerId = pid

    const records = await RoundCaptain.find(filter)
    for (const r of records) {
      await RoundCaptain.deleteOne({ id: r.id })
      if (r.teamId) {
        const t = await RoundTeam.findOne({ id: r.teamId })
        if (t && t.captainId === r.playerId) { t.captainId = null; await t.save() }
      }
      const u = await User.findOne({ id: r.playerId })
      if (u && u.role === 'captain') { u.role = 'player'; await u.save() }
    }
    res.json({ success: true, deleted: records.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '取消指派失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/captain/assigned - 查看已指派队长（roundId 必填）=====
router.get('/assigned', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const captains = await RoundCaptain.find({ roundId: rId })
    const teams = await RoundTeam.find({ roundId: rId })
    const users = await User.find({})
    const teamMap = {}
    const userMap = {}
    for (const t of teams) teamMap[t.id] = t
    for (const u of users) userMap[u.id] = u

    const enriched = captains.map(c => ({
      id: c.id, roundId: c.roundId, roundIndex: c.roundIndex,
      playerId: c.playerId, playerName: userMap[c.playerId] ? userMap[c.playerId].name : null,
      playerAvatar: userMap[c.playerId] ? (userMap[c.playerId].avatar || null) : null,
      teamId: c.teamId, teamName: teamMap[c.teamId] ? teamMap[c.teamId].name : null,
      assignedBy: c.assignedBy, createdAt: c.createdAt
    }))
    res.json({ success: true, data: enriched, total: enriched.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取队长列表失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/captain/history（roundId 必填）=====
router.get('/history', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const [captains, votes] = await Promise.all([
      RoundCaptain.find({ roundId: rId }),
      CaptainVote.find({ roundId: rId })
    ])
    res.json({ success: true, data: { captains, votes, captainCount: captains.length, voteCount: votes.length } })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取历史失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/captain/available-players - 按轮次返回可用队长候选人 =====
router.get('/available-players', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })

    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    // 获取该轮已被设为队长的选手
    const captains = await RoundCaptain.find({ roundId: rId })
    const captainPlayerIds = new Set(captains.map(c => c.playerId))

    // 获取该轮所有在团队中的选手
    const members = await RoundTeamMember.find({ roundId: rId })
    const memberPlayerIds = new Set(members.map(m => m.playerId))

    // 获取所有活跃选手
    const users = await User.find({})
    const available = users.filter(u => {
      if (u.role === 'admin') return false
      if (u.status === 'eliminated') return false
      return !captainPlayerIds.has(u.id)
    })

    res.json({
      success: true,
      data: available.map(u => ({
        id: u.id,
        name: u.name,
        avatar: u.avatar || null,
        attributes: u.attributes,
        inTeam: memberPlayerIds.has(u.id),
        status: u.status
      }))
    })
  } catch (e) {
    console.error('Get available players error:', e)
    res.status(500).json({ success: false, error: '获取可用选手失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/captain/current - 按轮次返回已分配的队长列表 =====
router.get('/current', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })

    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const captains = await RoundCaptain.find({ roundId: rId })
    const teams = await RoundTeam.find({ roundId: rId })
    const users = await User.find({})
    const teamMap = {}
    const userMap = {}
    for (const t of teams) teamMap[t.id] = t
    for (const u of users) userMap[u.id] = u

    const enriched = captains.map(c => ({
      id: c.id,
      playerId: c.playerId,
      playerName: userMap[c.playerId]?.name || null,
      playerAvatar: userMap[c.playerId]?.avatar || null,
      teamId: c.teamId,
      teamName: teamMap[c.teamId]?.name || null
    }))

    res.json({ success: true, data: enriched, total: enriched.length })
  } catch (e) {
    console.error('Get current captains error:', e)
    res.status(500).json({ success: false, error: '获取队长列表失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/captain/my-vote - 检查当前用户本轮是否已投票 =====
router.get('/my-vote', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })

    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const voterId = req.user.userId
    const votes = await CaptainVote.find({ roundId: rId, voterId })

    res.json({
      success: true,
      data: {
        hasVoted: votes.length > 0,
        votedFor: votes.map(v => v.candidateId)
      }
    })
  } catch (e) {
    console.error('Get my vote error:', e)
    res.status(500).json({ success: false, error: '获取投票状态失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
