const express = require('express')
const router = express.Router()
const LVPairingResult = require('../models/LVPairingResult')
const LVLoveVote = require('../models/LVLoveVote')
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, getCurrentSeason, LV_ACTION_TYPES } = require('../helpers')

// GET /history - 获取所有配对结果
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVPairingResult')
    const docs = await col.find({ gameId: 'lovevariety' }).sort({ createdAt: -1 }).toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取配对结果失败', code: 'SERVER_ERROR' })
  }
})

// GET /round/:roundId - 获取某轮配对结果
router.get('/round/:roundId', async (req, res) => {
  try {
    const { roundId } = req.params
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVPairingResult')
    const doc = await col.findOne({ gameId: 'lovevariety', roundId })
    res.json({ success: true, data: doc || null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取配对结果失败', code: 'SERVER_ERROR' })
  }
})

// POST /calculate - 计算配对结果
router.post('/calculate', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const roundId = `round-${season.currentRound}`

    // 获取本轮所有投送记录
    const { getCollection } = require('../../../config/db')
    const voteCol = getCollection('LVLoveVote')
    const allVotes = await voteCol.find({ gameId: 'lovevariety', roundId }).toArray()

    if (allVotes.length === 0) {
      return res.status(400).json({ success: false, error: '本轮暂无投送记录', code: 'NO_VOTES' })
    }

    // 获取所有活跃选手
    const activePlayers = await LVPlayer.find({ gameId: 'lovevariety', status: 'active', role: 'player' })
    if (activePlayers.length < 3) {
      return res.status(400).json({ success: false, error: '活跃选手不足3人，无法配对', code: 'NOT_ENOUGH_PLAYERS' })
    }

    // 计算每人收获的喜爱值总数
    const receivedSums = {}
    const votedPlayers = new Set()

    for (const v of allVotes) {
      votedPlayers.add(v.voterId)
      if (!receivedSums[v.targetId]) receivedSums[v.targetId] = 0
      receivedSums[v.targetId] += v.value
    }

    // 只考虑已投票的活跃选手
    const eligiblePlayers = activePlayers.filter(p => votedPlayers.has(p.id))

    // 找到收获喜爱值最少的选手（单身汉）
    let singlePlayerId = eligiblePlayers[0]?.id
    let minSum = receivedSums[singlePlayerId] ?? 0
    for (const p of eligiblePlayers) {
      const sum = receivedSums[p.id] ?? 0
      if (sum < minSum) {
        minSum = sum
        singlePlayerId = p.id
      }
    }

    const singlePlayer = eligiblePlayers.find(p => p.id === singlePlayerId)

    // 剩余选手
    const remainingPlayers = eligiblePlayers.filter(p => p.id !== singlePlayerId)

    // 确保剩余选手为偶数
    const pairingPlayers = remainingPlayers.length % 2 === 0
      ? remainingPlayers
      : remainingPlayers.slice(0, remainingPlayers.length - 1)

    if (pairingPlayers.length < 2) {
      return res.status(400).json({ success: false, error: '可配对选手不足', code: 'NOT_ENOUGH_FOR_PAIR' })
    }

    // 计算所有配对之间的互相投送值之和
    const mutualSums = []
    for (let i = 0; i < pairingPlayers.length; i++) {
      for (let j = i + 1; j < pairingPlayers.length; j++) {
        const p1 = pairingPlayers[i]
        const p2 = pairingPlayers[j]
        // p1 给 p2 的投送值
        const p1toP2 = allVotes.find(v => v.voterId === p1.id && v.targetId === p2.id)
        // p2 给 p1 的投送值
        const p2toP1 = allVotes.find(v => v.voterId === p2.id && v.targetId === p1.id)
        const mutualValue = (p1toP2?.value || 0) + (p2toP1?.value || 0)
        mutualSums.push({
          player1Id: p1.id,
          player1Name: p1.name,
          player2Id: p2.id,
          player2Name: p2.name,
          mutualValue,
          p1toP2: p1toP2?.value || 0,
          p2toP1: p2toP1?.value || 0
        })
      }
    }

    // 按互相投送值之和从高到低排序
    mutualSums.sort((a, b) => b.mutualValue - a.mutualValue)

    // 贪心配对：优先取最高和，移除已配对的选手
    const paired = new Set()
    const pairs = []

    for (const candidate of mutualSums) {
      if (paired.has(candidate.player1Id) || paired.has(candidate.player2Id)) continue
      paired.add(candidate.player1Id)
      paired.add(candidate.player2Id)
      pairs.push(candidate)
      if (paired.size >= pairingPlayers.length) break
    }

    // 保存或更新配对结果
    const resultCol = getCollection('LVPairingResult')
    await resultCol.deleteMany({ gameId: 'lovevariety', roundId })

    const result = new LVPairingResult({
      id: generateId(),
      roundId,
      pairs,
      singlePlayerId: singlePlayer?.id || null,
      singlePlayerName: singlePlayer?.name || '',
      gameId: 'lovevariety',
      createdAt: new Date().toISOString()
    })
    await result.save()

    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PAIRING_CALCULATE, 'pairing', result.id,
      `配对结算: ${singlePlayer?.name} 成为单身汉, 组成 ${pairs.length} 对`)

    res.json({ success: true, data: result.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '配对结算失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
