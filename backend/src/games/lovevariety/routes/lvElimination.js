const express = require('express')
const router = express.Router()
const LVElimination = require('../models/LVElimination')
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, getCurrentSeason, LV_ACTION_TYPES } = require('../helpers')

// GET /history - 获取所有淘汰记录
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVElimination')
    const docs = await col.find({ gameId: 'lovevariety' }).sort({ createdAt: -1 }).toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取淘汰记录失败', code: 'SERVER_ERROR' })
  }
})

// GET /round/:roundId - 获取某轮淘汰记录
router.get('/round/:roundId', async (req, res) => {
  try {
    const { roundId } = req.params
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVElimination')
    const docs = await col.find({ gameId: 'lovevariety', roundId }).toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取淘汰记录失败', code: 'SERVER_ERROR' })
  }
})

// POST /eliminate - 淘汰选手
router.post('/eliminate', async (req, res) => {
  try {
    const { playerId, playerName } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: '选手ID不能为空', code: 'INVALID_ID' })

    const season = await getCurrentSeason()
    const roundId = `round-${season.currentRound}`

    const player = await LVPlayer.findOne({ id: playerId })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })

    player.status = 'eliminated'
    player.updatedAt = new Date().toISOString()
    await player.save()

    const elimination = new LVElimination({
      id: generateId(),
      roundId,
      eliminatedId: playerId,
      eliminatedName: playerName || player.name,
      gameId: 'lovevariety',
      createdAt: new Date().toISOString()
    })
    await elimination.save()

    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.ELIMINATION_SET, 'elimination', elimination.id,
      `淘汰选手: ${player.name}`)

    res.json({ success: true, data: elimination.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '淘汰选手失败', code: 'SERVER_ERROR' })
  }
})

// POST /restore/:id - 恢复被淘汰选手
router.post('/restore/:id', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    player.status = 'active'
    player.updatedAt = new Date().toISOString()
    await player.save()
    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PLAYER_EDIT, 'player', player.id, `恢复选手: ${player.name}`)
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '恢复选手失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
