const express = require('express')
const router = express.Router()
const BBEvictionVote = require('../models/BBEvictionVote')
const BBEviction = require('../models/BBEviction')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, getCurrentSeason, BB_ACTION_TYPES } = require('../helpers')

// GET /votes - 获取当前轮次投票汇总
router.get('/votes', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const votes = await BBEvictionVote.find({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const voteMap = new Map()
    votes.forEach(v => {
      const key = v.targetId
      voteMap.set(key, (voteMap.get(key) || 0) + 1)
    })
    res.json({
      success: true,
      data: {
        votes: votes.map(v => v.toObject()),
        tally: Array.from(voteMap.entries()).map(([targetId, count]) => ({ targetId, count })),
        totalVotes: votes.length
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
    if (admin.role !== 'admin' || !specVoterId) {
      // 非管理员代投模式 → 检查 HOH 限制
      const hohCol = getCollection('BBHohRecord')
      const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
      const isHoh = currentHoh && currentHoh.winnerId === actualVoterId
      if (isHoh) {
        const voteCol = getCollection('BBEvictionVote')
        const existingVotes = await voteCol.find({ gameId: 'bigbrother', roundId }).toArray()
        if (existingVotes.length > 0) {
          const tally = new Map()
          existingVotes.forEach(v => {
            if (v.voterId !== currentHoh.winnerId) {
              tally.set(v.targetId, (tally.get(v.targetId) || 0) + 1)
            }
          })
          const counts = Array.from(tally.values())
          const maxCount = Math.max(...counts, 0)
          const tiedCount = counts.filter(c => c === maxCount).length
          if (tiedCount !== 2 || counts.length < 2) {
            return res.status(400).json({ success: false, error: '当前非平票状态，HOH 无需投票', code: 'HOH_NOT_NEEDED' })
          }
        } else {
          return res.status(400).json({ success: false, error: '当前非平票状态，HOH 无需投票', code: 'HOH_NOT_NEEDED' })
        }
      }
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

// POST /result - 宣布淘汰结果（仅在 eviction 阶段可操作，平票时 HOH 投决定性一票）
router.post('/result', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    if (season.currentStage !== 'eviction') {
      return res.status(400).json({ success: false, error: '当前不是淘汰结果阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    const { getCollection } = require('../../../config/db')
    const voteCol = getCollection('BBEvictionVote')
    const votes = await voteCol.find({ gameId: 'bigbrother', roundId }).toArray()
    // 获取当前轮次提名名单，只统计有效投票（投给提名名单上的人）
    const nomCol = getCollection('BBNomination')
    const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })
    const validTargetIds = new Set(nominationDoc?.nomineeIds || [])
    // 获取当前 HOH
    const hohCol = getCollection('BBHohRecord')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    // 统计非 HOH 票数（只统计投给提名名单上的人）
    const tally = new Map()
    votes.forEach(v => {
      if (!validTargetIds.has(v.targetId)) return // 跳过非提名者投票
      if (currentHoh && v.voterId === currentHoh.winnerId) return // 先排除 HOH 票
      tally.set(v.targetId, { id: v.targetId, name: v.targetName, count: (tally.get(v.targetId)?.count || 0) + 1 })
    })
    // 判断是否平票
    const counts = Array.from(tally.values())
    const maxCount = Math.max(...counts.map(c => c.count), 0)
    const tiedEntries = counts.filter(c => c.count === maxCount)
    let evictedTarget = null
    if (tiedEntries.length >= 2 && currentHoh) {
      // 平票：HOH 投决定性一票
      const hohVote = votes.find(v => v.voterId === currentHoh.winnerId)
      if (hohVote) {
        evictedTarget = { id: hohVote.targetId, name: hohVote.targetName, count: maxCount + 1 }
      } else {
        // HOH 没投票，随机选一个
        evictedTarget = tiedEntries[Math.floor(Math.random() * tiedEntries.length)]
      }
    } else if (tiedEntries.length === 1) {
      evictedTarget = tiedEntries[0]
    }
    if (!evictedTarget) return res.status(400).json({ success: false, error: '没有投票记录', code: 'NO_VOTES' })
    // 标记房客淘汰
    const evicted = await BBHouseguest.findOne({ id: evictedTarget.id })
    if (evicted) {
      evicted.status = 'evicted'
      await evicted.save()
    }
    // 删除已有淘汰结果
    await BBEviction.deleteMany({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const result = new BBEviction({
      id: generateId(),
      roundId: `round-${season.currentRound}`,
      roundIndex: season.currentRound,
      evictedId: evictedTarget.id,
      evictedName: evictedTarget.name,
      voteCount: maxCount,
      totalVotes: votes.length,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await result.save()
    res.json({ success: true, data: result.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '宣布淘汰结果失败', code: 'SERVER_ERROR' })
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

module.exports = router
