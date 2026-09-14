const express = require('express')
const router = express.Router()
const BBEvictionVote = require('../models/BBEvictionVote')
const BBEviction = require('../models/BBEviction')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, getCurrentSeason, BB_ACTION_TYPES, hasTwist, getEvictCountForRound } = require('../helpers')
const { auth, requireAdmin } = require('../../../middleware/auth')
const { broadcastBBGame } = require('../../../socket/bbGame')

// GET /votes - 获取当前轮次投票汇总（HOH 票不计入总票型，仅作平票裁决）
router.get('/votes', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const roundId = `round-${season.currentRound}`
    const votes = await BBEvictionVote.find({ gameId: 'bigbrother', roundId })
    const { getCollection } = require('../../../config/db')
    const hohCol = getCollection('BBHohRecord')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    const hohId = currentHoh?.winnerId || null
    const castVotes = hohId ? votes.filter(v => v.voterId !== hohId) : votes
    const voteMap = new Map()
    castVotes.forEach(v => {
      const key = v.targetId
      voteMap.set(key, (voteMap.get(key) || 0) + 1)
    })
    res.json({
      success: true,
      data: {
        votes: votes.map(v => v.toObject()),
        tally: Array.from(voteMap.entries()).map(([targetId, count]) => ({ targetId, count })),
        totalVotes: castVotes.length,
        hohVote: hohId ? (votes.find(v => v.voterId === hohId)?.targetId || null) : null
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取投票信息失败', code: 'SERVER_ERROR' })
  }
})

// POST /vote - 投票（仅在 eviction_vote 阶段可操作，HOH 仅在平票时可投票，管理员可代投）
router.post('/vote', async (req, res) => {
  try {
    const { targetId, targetName, voterId: specVoterId, voterName: specVoterName } = req.body
    if (!targetId) return res.status(400).json({ success: false, error: '目标ID不能为空', code: 'INVALID_ID' })
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const admin = await BBHouseguest.findOne({ id: decoded.userId })
    if (!admin) return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })
    const season = await getCurrentSeason()
    if (season.currentStage !== 'eviction_vote') {
      return res.status(400).json({ success: false, error: '当前不是淘汰投票阶段，无法操作', code: 'WRONG_STAGE' })
    }
    if (season.votesLocked) {
      return res.status(400).json({ success: false, error: '投票已锁定（淘汰夜已开始）', code: 'VOTES_LOCKED' })
    }
    const roundId = `round-${season.currentRound}`
    const { getCollection } = require('../../../config/db')
    // 校验投票目标是否在提名名单上
    const nomCol = getCollection('BBNomination')
    const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })
    const validTargetIds = nominationDoc?.nomineeIds || []
    if (!validTargetIds.includes(targetId)) {
      return res.status(400).json({ success: false, error: '投票目标不在提名名单上', code: 'INVALID_TARGET' })
    }
    // 确定实际的投票人：管理员可指定 voterId，否则为自己投票
    const actualVoterId = specVoterId || admin.id
    const actualVoterName = specVoterName || admin.name
    const isAdminVote = admin.role === 'admin' && !!specVoterId

    // 检查投票人是否为被提名人（被提名人不能投票）
    const allNomineeIds = [...(nominationDoc?.nomineeIds || [])]
    if (nominationDoc?.replacementNomineeId) allNomineeIds.push(nominationDoc.replacementNomineeId)
    if (allNomineeIds.includes(actualVoterId)) {
      return res.status(400).json({ success: false, error: '被提名者不能参与淘汰投票', code: 'NOMINEE_CANNOT_VOTE' })
    }

    if (admin.role !== 'admin' || !specVoterId) {
      // 非管理员代投模式 → HOH 也可以正常投票，票数在结算时仅作为平票裁决
    }
    // 删除该投票人本轮已有投票
    await BBEvictionVote.deleteMany({ gameId: 'bigbrother', roundId, voterId: actualVoterId })
    const vote = new BBEvictionVote({
      id: generateId(),
      roundId,
      roundIndex: season.currentRound,
      voterId: actualVoterId,
      voterName: actualVoterName,
      targetId,
      targetName: targetName || '',
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await vote.save()
    res.json({ success: true, data: vote.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '投票失败', code: 'SERVER_ERROR' })
  }
})

// POST /my-vote - 获取当前用户投票
router.post('/my-vote', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    const season = await getCurrentSeason()
    const vote = await BBEvictionVote.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}`, voterId: decoded.userId })
    res.json({ success: true, data: vote ? vote.toObject() : null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取我的投票失败', code: 'SERVER_ERROR' })
  }
})

// 计算淘汰结果（供 /result 与 /night/start 共用），会实际标记房客淘汰并写入 BBEviction
async function computeEvictionResult(season) {
  const curRound = season.currentRound
  const twistConfigs = season.twistConfigs || []
  const roundConfigs = season.roundConfigs || []
  const roundId = `round-${curRound}`
  const { getCollection } = require('../../../config/db')
  const voteCol = getCollection('BBEvictionVote')
  const votes = await voteCol.find({ gameId: 'bigbrother', roundId }).toArray()
  const nomCol = getCollection('BBNomination')
  const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })
  const validTargetIds = new Set(nominationDoc?.nomineeIds || [])
  // BBBB：胜者安全，不进入淘汰投票
  if (nominationDoc?.bbbbWinnerId) validTargetIds.delete(nominationDoc.bbbbWinnerId)
  const hohCol = getCollection('BBHohRecord')
  const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })

  const isTriple = hasTwist(curRound, 'triple_offering', twistConfigs, roundConfigs)
  const evictCount = getEvictCountForRound(curRound, twistConfigs, roundConfigs)

  const tally = new Map()
  votes.forEach(v => {
    if (!validTargetIds.has(v.targetId)) return
    if (currentHoh && v.voterId === currentHoh.winnerId) return
    tally.set(v.targetId, { id: v.targetId, name: v.targetName, count: (tally.get(v.targetId)?.count || 0) + 1 })
  })

  const counts = Array.from(tally.values()).sort((a, b) => b.count - a.count)
  if (counts.length === 0) return { error: '没有投票记录', code: 'NO_VOTES' }

  const maxCount = counts[0].count
  const tiedEntries = counts.filter(c => c.count === maxCount)
  const evictedTargets = []

  if (tiedEntries.length >= 2 && currentHoh && evictCount === 1) {
    const hohVote = votes.find(v => v.voterId === currentHoh.winnerId)
    if (hohVote) {
      evictedTargets.push({ id: hohVote.targetId, name: hohVote.targetName, count: maxCount, hohDecided: true })
    } else {
      evictedTargets.push(tiedEntries[Math.floor(Math.random() * tiedEntries.length)])
    }
  } else {
    for (let i = 0; i < Math.min(evictCount, counts.length); i++) {
      evictedTargets.push(counts[i])
    }
  }

  const evictedResults = []
  const jurySize = season.jurySize || 7
  const finalSize = season.finalSize || 2
  const hgColTotal = getCollection('BBHouseguest')
  const totalHouseguests = await hgColTotal.countDocuments({ gameId: 'bigbrother', role: 'houseguest' })
  const priorEvictions = await getCollection('BBEviction').countDocuments({ gameId: 'bigbrother', roundId: { $ne: roundId } })
  for (let ei = 0; ei < evictedTargets.length; ei++) {
    const target = evictedTargets[ei]
    const evicted = await BBHouseguest.findOne({ id: target.id })
    if (evicted) {
      const rank = totalHouseguests - priorEvictions - ei
      const isJury = rank > finalSize && rank <= finalSize + jurySize
      evicted.status = isJury ? 'jury' : 'evicted'
      await evicted.save()
    }
    evictedResults.push({ id: target.id, name: target.name, votes: target.count, rank: totalHouseguests - priorEvictions - ei, status: evicted?.status || 'evicted' })
  }

  if (hasTwist(curRound, 'karmic_pawnship', twistConfigs, roundConfigs)) {
    const evictedIds = new Set(evictedTargets.map(t => t.id))
    const survivors = (nominationDoc?.nomineeIds || []).filter(id => !evictedIds.has(id))
    if (survivors.length > 0) {
      let karmicHoh = null
      let karmicHohName = ''
      for (const c of counts) {
        if (!evictedIds.has(c.id)) { karmicHoh = c.id; karmicHohName = c.name; break }
      }
      if (!karmicHoh && survivors.length > 0) {
        const hgCol = getCollection('BBHouseguest')
        const survPlayer = await hgCol.findOne({ id: survivors[0] })
        karmicHoh = survivors[0]
        karmicHohName = survPlayer?.name || ''
      }
      season.nextHohPlayerId = karmicHoh
      season.nextHohPlayerName = karmicHohName
      season.updatedAt = new Date().toISOString()
      await season.save()
    }
  }

  await BBEviction.deleteMany({ gameId: 'bigbrother', roundId })
  for (let i = 0; i < evictedTargets.length; i++) {
    const target = evictedTargets[i]
    const result = new BBEviction({
      id: generateId(),
      roundId,
      roundIndex: curRound,
      evictedId: target.id,
      evictedName: target.name,
      voteCount: target.count,
      totalVotes: votes.length,
      isJury: evictedResults[i]?.status === 'jury',
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await result.save()
  }

  try {
    season.hohSleepAllowed = false
    season.updatedAt = new Date().toISOString()
    await season.save()
    const allGuests = await BBHouseguest.find({ gameId: 'bigbrother' })
    for (const g of allGuests) {
      if (g.hohSleepApproved) { g.hohSleepApproved = false; await g.save() }
    }
  } catch (e) {
    console.error('[Eviction] reset HOH sleep error:', e)
  }

  return {
    evicted: evictedResults,
    counts,
    isTripleEviction: isTriple,
    karmicHoh: season.nextHohPlayerName || null,
    totalVotes: votes.length
  }
}

// POST /result - 宣布淘汰结果（仅在 eviction 阶段可操作）
router.post('/result', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    if (season.currentStage !== 'eviction') {
      return res.status(400).json({ success: false, error: '当前不是淘汰结果阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const data = await computeEvictionResult(season)
    if (data.error) return res.status(400).json({ success: false, error: data.error, code: data.code })
    res.json({ success: true, data })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '宣布淘汰结果失败', code: 'SERVER_ERROR' })
  }
})

// ===== 淘汰夜：开始（锁票 + 计算 + 宣布框架）→ 确定（开门） =====

// POST /night/start - 管理员开始淘汰夜：锁定投票并显示宣布框架
router.post('/night/start', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    if (!['eviction_vote', 'eviction'].includes(season.currentStage)) {
      return res.status(400).json({ success: false, error: '当前不是淘汰夜阶段', code: 'WRONG_STAGE' })
    }
    // 锁票
    season.votesLocked = true
    await season.save()
    const data = await computeEvictionResult(season)
    if (data.error) return res.status(400).json({ success: false, error: data.error, code: data.code })

    const counts = data.counts || []
    const big = counts.length ? counts[0].count : 0
    const small = counts.length > 1 ? counts[counts.length - 1].count : 0
    season.evictionNight = {
      phase: 'announce',
      round: season.currentRound,
      evicted: data.evicted || [],
      counts,
      totalVotes: data.totalVotes || 0,
      big,
      small,
      isTripleEviction: data.isTripleEviction,
      karmicHoh: data.karmicHoh || null,
      createdAt: new Date().toISOString()
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:eviction-night', season.evictionNight)
    res.json({ success: true, data: season.evictionNight })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '开始淘汰夜失败', code: 'SERVER_ERROR' })
  }
})

// POST /night/confirm - 管理员确定：显示开门结果
router.post('/night/confirm', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    if (!season.evictionNight) return res.status(400).json({ success: false, error: '尚未开始淘汰夜' })
    season.evictionNight = { ...season.evictionNight, phase: 'door' }
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:eviction-night', season.evictionNight)
    res.json({ success: true, data: season.evictionNight })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '确认失败', code: 'SERVER_ERROR' })
  }
})

// POST /night/reset - 清除淘汰夜状态并解锁投票
router.post('/night/reset', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    season.evictionNight = null
    season.votesLocked = false
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:eviction-night', null)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清除失败', code: 'SERVER_ERROR' })
  }
})

// GET /night - 当前淘汰夜状态
router.get('/night', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    res.json({ success: true, data: season?.evictionNight || null, votesLocked: !!season?.votesLocked })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取淘汰夜状态失败', code: 'SERVER_ERROR' })
  }
})

// GET /history - 获取淘汰历史
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBEviction')
    const docs = await col.find({ gameId: 'bigbrother' }).sort({ createdAt: -1 }).toArray()
    const results = docs.map(d => new BBEviction(d).toObject())
    res.json({ success: true, data: results })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取淘汰历史失败', code: 'SERVER_ERROR' })
  }
})

// POST /restore/:id - 恢复房客
router.post('/restore/:id', async (req, res) => {
  try {
    const houseguest = await BBHouseguest.findOne({ id: req.params.id })
    if (!houseguest) return res.status(404).json({ success: false, error: '房客不存在', code: 'NOT_FOUND' })
    houseguest.status = 'active'
    await houseguest.save()
    res.json({ success: true, data: houseguest.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '恢复房客失败', code: 'SERVER_ERROR' })
  }
})

// ===== 淘汰结果分段宣布（管理员逐句释放，选手端实时展示） =====

// GET /announce - 当前宣布状态
router.get('/announce', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    res.json({ success: true, data: season?.evictionAnnouncement || null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取宣布状态失败' })
  }
})

// POST /announce/prepare - 管理员准备宣布内容（segments: [{type,text}]）
router.post('/announce/prepare', auth, requireAdmin, async (req, res) => {
  try {
    const { segments } = req.body || {}
    const season = await getCurrentSeason()
    season.evictionAnnouncement = {
      round: season.currentRound,
      segments: Array.isArray(segments) ? segments : [],
      released: 0
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:eviction-announce', season.evictionAnnouncement)
    res.json({ success: true, data: season.evictionAnnouncement })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '准备宣布失败' })
  }
})

// POST /announce/next - 释放下一句
router.post('/announce/next', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const a = season.evictionAnnouncement
    if (!a) return res.status(400).json({ success: false, error: '尚未准备宣布内容' })
    a.released = Math.min((a.released || 0) + 1, (a.segments || []).length)
    season.evictionAnnouncement = a
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:eviction-announce', a)
    res.json({ success: true, data: a })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '释放失败' })
  }
})

// POST /announce/reset - 清除宣布
router.post('/announce/reset', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    season.evictionAnnouncement = null
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:eviction-announce', null)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清除失败' })
  }
})

module.exports = router
