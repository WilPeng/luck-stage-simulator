const express = require('express')
const router = express.Router()
const BBHohRecord = require('../models/BBHohRecord')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId, logAction, getCurrentSeason, BB_ACTION_TYPES } = require('../helpers')

// GET / - 获取当前轮次 HOH 信息
router.get('/', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const records = await BBHohRecord.find({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    res.json({ success: true, data: records.map(r => r.toObject()) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取 HOH 信息失败', code: 'SERVER_ERROR' })
  }
})

// GET /current - 获取当前 HOH
router.get('/current', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const record = await BBHohRecord.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    res.json({ success: true, data: record ? record.toObject() : null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取当前 HOH 失败', code: 'SERVER_ERROR' })
  }
})

// GET /history - 获取 HOH 历史记录
router.get('/history', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHohRecord')
    const docs = await col.find({ gameId: 'bigbrother' }).sort({ createdAt: -1 }).toArray()
    const records = docs.map(d => new BBHohRecord(d).toObject())
    res.json({ success: true, data: records })
  } catch (e) {
    console.error('[BB Hoh] History error:', e)
    res.status(500).json({ success: false, error: '获取 HOH 历史失败', code: 'SERVER_ERROR' })
  }
})

// POST /competition - 模拟 HOH 竞争（随机选择一位活跃房客，排除管理员）
router.post('/competition', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('BBHouseguest')
    const activeHouseguests = await col.find({ gameId: 'bigbrother', status: 'active', role: 'houseguest' }).toArray()
    if (activeHouseguests.length === 0) {
      return res.status(400).json({ success: false, error: '没有活跃房客可以参与竞争', code: 'NO_ACTIVE' })
    }
    const winner = activeHouseguests[Math.floor(Math.random() * activeHouseguests.length)]
    const season = await getCurrentSeason()
    const hohCol = getCollection('BBHohRecord')
    await hohCol.deleteMany({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const record = new BBHohRecord({
      id: generateId(),
      roundId: `round-${season.currentRound}`,
      roundIndex: season.currentRound,
      winnerId: winner.id,
      winnerName: winner.name,
      competitionType: 'luck',
      competitionName: '运气挑战',
      participants: activeHouseguests.map((h, i) => ({ playerId: h.id, playerName: h.name, rank: h.id === winner.id ? 1 : i + 2 })),
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await record.save()
    res.json({ success: true, data: record.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: 'HOH 竞争失败', code: 'SERVER_ERROR' })
  }
})

// POST /assign - 手动指定 HOH
router.post('/assign', async (req, res) => {
  try {
    const { playerId, playerName } = req.body
    if (!playerId) return res.status(400).json({ success: false, error: '房客ID不能为空', code: 'INVALID_ID' })
    const houseguest = await BBHouseguest.findOne({ id: playerId })
    if (!houseguest) return res.status(404).json({ success: false, error: '房客不存在', code: 'NOT_FOUND' })
    const season = await getCurrentSeason()
    await BBHohRecord.deleteMany({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    const record = new BBHohRecord({
      id: generateId(),
      roundId: `round-${season.currentRound}`,
      roundIndex: season.currentRound,
      winnerId: houseguest.id,
      winnerName: houseguest.name,
      competitionType: 'manual',
      competitionName: '管理员指定',
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await record.save()
    res.json({ success: true, data: record.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置 HOH 失败', code: 'SERVER_ERROR' })
  }
})

// DELETE / - 清除当前 HOH
router.delete('/', async (req, res) => {
  try {
    const season = await getCurrentSeason()
    await BBHohRecord.deleteMany({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清除 HOH 失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
