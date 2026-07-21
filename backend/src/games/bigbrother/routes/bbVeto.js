const express = require('express')
const router = express.Router()
const BBVetoRecord = require('../models/BBVetoRecord')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, getCurrentSeason, BB_ACTION_TYPES } = require('../helpers')

// GET /current - 获取当前轮次否决权记录
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const record = await BBVetoRecord.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    res.json({ success: true, data: record ? record.toObject() : null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取否决权信息失败', code: 'SERVER_ERROR' })
  }
})

// POST /competition - 模拟否决权竞争（仅在 veto_competition 阶段可操作）
router.post('/competition', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHouseguest')
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_competition') {
      return res.status(400).json({ success: false, error: '当前不是否决权竞争阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`

    // 获取所有活跃房客（排除管理员）
    const allActive = await col.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' }).toArray()
    if (allActive.length === 0) {
      return res.status(400).json({ success: false, error: '没有活跃房客', code: 'NO_ACTIVE' })
    }

    // 获取当前 HOH 和被提名人
    const hohCol = getCollection('BBHohRecord')
    const nomCol = getCollection('BBNomination')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })

    // 默认参与者：HOH 和被提名人
    const defaultIds = new Set()
    if (currentHoh?.winnerId) defaultIds.add(currentHoh.winnerId)
    if (nominationDoc?.nomineeIds) {
      nominationDoc.nomineeIds.forEach((id) => defaultIds.add(id))
    }
    const defaultPlayers = allActive.filter(h => defaultIds.has(h.id))

    // 候选池：排除 HOH 和被提名人
    const candidatePool = allActive.filter(h => !defaultIds.has(h.id))

    // 随机抽 3 人（如果总人数 > 3，确保不重复）
    const shuffled = [...candidatePool]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const drawnCount = Math.min(3, shuffled.length)
    const drawnPlayers = shuffled.slice(0, drawnCount)

    // 最终参与者：HOH + 2名被提名人 + 随机抽选的 3 人
    const participants = [...defaultPlayers, ...drawnPlayers]

    // 从参与者中随机选择赢家
    const winner = participants[Math.floor(Math.random() * participants.length)]

    await BBVetoRecord.deleteMany({ gameId: 'bigbrother', roundId })
    const record = new BBVetoRecord({
      id: generateId(),
      roundId,
      roundIndex: season.currentRound,
      winnerId: winner.id,
      winnerName: winner.name,
      used: false,
      participants: participants.map((p) => ({ playerId: p.id, playerName: p.name })),
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await record.save()
    res.json({
      success: true,
      data: {
        ...record.toObject(),
        participants: participants.map((p) => ({ playerId: p.id, playerName: p.name })),
        totalPlayers: allActive.length,
        drawCount: drawnPlayers.length,
        drawMode: 'draw'
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '否决权竞争失败', code: 'SERVER_ERROR' })
  }
})

// POST /use - 使用否决权（仅在 veto_ceremony 阶段可操作）
router.post('/use', async (req, res) => {
  try {
    const { targetPlayerId, targetPlayerName } = req.body
    if (!targetPlayerId) return res.status(400).json({ success: false, error: '目标选手ID不能为空', code: 'INVALID_ID' })
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_ceremony') {
      return res.status(400).json({ success: false, error: '当前不是否决权会议阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    const { getCollection } = require('../../../config/db')
    // 更新否决权记录
    const vetoCol = getCollection('BBVetoRecord')
    const record = await vetoCol.findOne({ gameId: 'bigbrother', roundId })
    if (!record) return res.status(404).json({ success: false, error: '否决权记录不存在', code: 'NOT_FOUND' })
    await vetoCol.updateOne(
      { gameId: 'bigbrother', roundId },
      { $set: { used: true, usedOnPlayerId: targetPlayerId, usedOnPlayerName: targetPlayerName, updatedAt: new Date().toISOString() } }
    )
    // 从提名名单中移除被拯救者
    const nomCol = getCollection('BBNomination')
    const nominationDoc = await nomCol.findOne({ gameId: 'bigbrother', roundId })
    if (nominationDoc && nominationDoc.nomineeIds) {
      const savedIdx = nominationDoc.nomineeIds.indexOf(targetPlayerId)
      if (savedIdx !== -1) {
        const newNomineeIds = nominationDoc.nomineeIds.filter(id => id !== targetPlayerId)
        const newNomineeNames = nominationDoc.nomineeNames.filter((_, i) => i !== savedIdx)
        await nomCol.updateOne(
          { gameId: 'bigbrother', roundId },
          { $set: { nomineeIds: newNomineeIds, nomineeNames: newNomineeNames, vetoUsed: true, updatedAt: new Date().toISOString() } }
        )
      }
    }
    res.json({ success: true, data: { used: true, targetPlayerId, targetPlayerName, saved: true } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '使用否决权失败', code: 'SERVER_ERROR' })
  }
})

// POST /skip - 不使用否决权（仅在 veto_ceremony 阶段可操作）
router.post('/skip', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    if (season.currentStage !== 'veto_ceremony') {
      return res.status(400).json({ success: false, error: '当前不是否决权会议阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const record = await BBVetoRecord.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    if (record) {
      record.used = false
      record.updatedAt = new Date().toISOString()
      await record.save()
    }
    res.json({ success: true, data: record ? record.toObject() : null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '跳过否决权失败', code: 'SERVER_ERROR' })
  }
})

// GET /history - 获取否决权历史
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBVetoRecord')
    const docs = await col.find({ gameId: 'bigbrother' }).sort({ createdAt: -1 }).toArray()
    const records = docs.map(d => new BBVetoRecord(d).toObject())
    res.json({ success: true, data: records })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取否决权历史失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
