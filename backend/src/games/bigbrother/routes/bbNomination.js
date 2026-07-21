const express = require('express')
const router = express.Router()
const BBNomination = require('../models/BBNomination')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, getCurrentSeason, BB_ACTION_TYPES } = require('../helpers')

// GET /current - 获取当前轮次提名
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const { getCollection } = require('../../../config/db')
    const nominationCol = getCollection('BBNomination')
    const doc = await nominationCol.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const hohCol = getCollection('BBHohRecord')
    const vetoCol = getCollection('BBVetoRecord')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const vetoRecord = await vetoCol.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    if (doc) {
      res.json({
        success: true,
        data: {
          id: doc.id || '',
          roundId: doc.roundId,
          nomineeIds: doc.nomineeIds || [],
          nomineeNames: doc.nomineeNames || [],
          hohId: doc.hohId || currentHoh?.winnerId || '',
          hohName: doc.hohName || currentHoh?.winnerName || '',
          vetoWinnerId: vetoRecord?.winnerId || '',
          vetoWinnerName: vetoRecord?.winnerName || '',
          replacementNomineeId: doc.replacementNomineeId || null,
          replacementNomineeName: doc.replacementNomineeName || '',
          vetoUsed: doc.vetoUsed || false,
          gameId: 'bigbrother',
          createdAt: doc.createdAt || new Date().toISOString(),
          updatedAt: doc.updatedAt || ''
        }
      })
    } else {
      res.json({ success: true, data: null })
    }
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取提名信息失败', code: 'SERVER_ERROR' })
  }
})

// POST /set - 设置提名（仅在 nomination 阶段可操作）
router.post('/set', async (req, res) => {
  try {
    const { nomineeIds, nomineeNames } = req.body
    if (!nomineeIds || !nomineeNames || nomineeIds.length === 0) {
      return res.status(400).json({ success: false, error: '请选择被提名人', code: 'INVALID_NOMINEES' })
    }
    const season = await getCurrentSeason()
    if (season.currentStage !== 'nomination') {
      return res.status(400).json({ success: false, error: '当前不是提名阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    await BBNomination.deleteMany({ gameId: 'bigbrother', roundId })
    // 查找当前 HOH
    const { getCollection } = require('../../../config/db')
    const hohCol = getCollection('BBHohRecord')
    const currentHoh = await hohCol.findOne({ gameId: 'bigbrother', roundId })
    const n = new BBNomination({
      id: generateId(),
      roundId,
      roundIndex: season.currentRound,
      nomineeIds: [...nomineeIds],
      nomineeNames: [...nomineeNames],
      hohId: currentHoh?.winnerId || null,
      hohName: currentHoh?.winnerName || '',
      replacementNomineeId: null,
      replacementNomineeName: '',
      vetoUsed: false,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await n.save()
    const data = n.toObject()
    res.json({
      success: true,
      data: {
        nominees: nomineeIds.map((id, i) => ({ id, name: nomineeNames[i] })),
        roundId,
        hohId: data.hohId,
        hohName: data.hohName
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置提名失败', code: 'SERVER_ERROR' })
  }
})

// POST /replace - 替换提名（否决权使用后，替换人选正式加入提名名单恢复2人，仅在 replacement_nom 阶段可操作）
router.post('/replace', async (req, res) => {
  try {
    const { playerId, playerName } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: '替换房客ID不能为空', code: 'INVALID_ID' })
    const season = await getCurrentSeason()
    if (season.currentStage !== 'replacement_nom') {
      return res.status(400).json({ success: false, error: '当前不是替换提名阶段，无法操作', code: 'WRONG_STAGE' })
    }
    const roundId = `round-${season.currentRound}`
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBNomination')
    const existing = await col.findOne({ gameId: 'bigbrother', roundId })
    if (existing) {
      // 将替换人选加入正式提名列表，恢复为2人
      await col.updateOne(
        { gameId: 'bigbrother', roundId },
        {
          $push: {
            nomineeIds: playerId,
            nomineeNames: playerName
          },
          $set: {
            replacementNomineeId: playerId,
            replacementNomineeName: playerName,
            updatedAt: new Date().toISOString()
          }
        }
      )
    }
    const updated = await col.findOne({ gameId: 'bigbrother', roundId })
    res.json({ success: true, data: updated || {} })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '替换提名失败', code: 'SERVER_ERROR' })
  }
})

// GET /history - 获取提名历史（按轮次聚合）
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const nomCol = getCollection('BBNomination')
    const hohCol = getCollection('BBHohRecord')
    const docs = await nomCol.find({ gameId: 'bigbrother' }).sort({ createdAt: -1 }).toArray()
    // 按 roundId 分组
    const roundMap = new Map()
    for (const d of docs) {
      const rid = d.roundId || `round-${d.roundIndex || 1}`
      if (!roundMap.has(rid)) {
        roundMap.set(rid, {
          id: rid,
          roundId: rid,
          roundIndex: d.roundIndex,
          nomineeIds: [],
          nomineeNames: [],
          replacementNomineeId: d.replacementNomineeId || null,
          replacementNomineeName: d.replacementNomineeName || null,
          createdAt: d.createdAt || new Date().toISOString(),
          hohName: d.hohName || '',
          vetoUsed: d.vetoUsed || false
        })
      }
      const entry = roundMap.get(rid)
      if (d.nomineeIds && Array.isArray(d.nomineeIds)) {
        d.nomineeIds.forEach((id, i) => {
          if (!entry.nomineeIds.includes(id)) {
            entry.nomineeIds.push(id)
            entry.nomineeNames.push(d.nomineeNames?.[i] || '')
          }
        })
      }
    }
    // 补充 HOH 信息
    for (const [, entry] of roundMap) {
      if (!entry.hohName) {
        try {
          const hoh = await hohCol.findOne({ gameId: 'bigbrother', roundId: entry.roundId })
          if (hoh) entry.hohName = hoh.winnerName || ''
        } catch {}
      }
    }
    const result = Array.from(roundMap.values()).sort((a, b) => (b.roundIndex || 0) - (a.roundIndex || 0))
    res.json({ success: true, data: result })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取提名历史失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
