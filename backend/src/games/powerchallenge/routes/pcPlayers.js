const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../../../middleware/auth')
const PCPlayer = require('../models/PCPlayer')
const { generateId } = require('../helpers')

// GET / - List all players
router.get('/', async (req, res) => {
  try {
    const players = await PCPlayer.find({ gameId: 'powerchallenge' })
    res.json({ success: true, data: players.map(p => p.toObject()) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取玩家列表失败' })
  }
})

// GET /active - Active players
router.get('/active', async (req, res) => {
  try {
    const players = await PCPlayer.find({ gameId: 'powerchallenge', status: 'active' })
    res.json({ success: true, data: players.map(p => p.toObject()) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取玩家列表失败' })
  }
})

// GET /stats - Player stats
router.get('/stats', async (req, res) => {
  try {
    const total = await PCPlayer.countDocuments({ gameId: 'powerchallenge' })
    const active = await PCPlayer.countDocuments({ gameId: 'powerchallenge', status: 'active' })
    res.json({ success: true, data: { total, active } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取统计失败' })
  }
})

// GET /:id - Get single player
router.get('/:id', async (req, res) => {
  try {
    const player = await PCPlayer.findOne({ id: req.params.id })
    if (!player) return res.status(404).json({ success: false, error: '玩家不存在' })
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取玩家失败' })
  }
})

// POST / - Create player
router.post('/', async (req, res) => {
  try {
    const { name, loginCode, role } = req.body
    if (!name || !loginCode) return res.status(400).json({ success: false, error: '姓名和登录码为必填' })
    const existing = await PCPlayer.findOne({ loginCode, gameId: 'powerchallenge' })
    if (existing) return res.status(400).json({ success: false, error: '登录码已存在' })
    const player = new PCPlayer({
      id: generateId(), name, loginCode,
      role: role || 'player', gameId: 'powerchallenge'
    })
    await player.save()
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建玩家失败' })
  }
})

// PUT /:id - Update player
router.put('/:id', async (req, res) => {
  try {
    const { name, loginCode, role, status } = req.body
    const player = await PCPlayer.findOne({ id: req.params.id })
    if (!player) return res.status(404).json({ success: false, error: '玩家不存在' })
    if (name !== undefined) player.name = name
    if (loginCode !== undefined) {
      const existing = await PCPlayer.findOne({ loginCode, gameId: 'powerchallenge', id: { $ne: req.params.id } })
      if (existing) return res.status(400).json({ success: false, error: '登录码已存在' })
      player.loginCode = loginCode
    }
    if (role !== undefined) player.role = role
    if (status !== undefined) player.status = status
    player.updatedAt = new Date().toISOString()
    await player.save()
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新玩家失败' })
  }
})

// DELETE /:id - Delete player
router.delete('/:id', async (req, res) => {
  try {
    await PCPlayer.deleteOne({ id: req.params.id })
    res.json({ success: true, data: { deleted: true } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除玩家失败' })
  }
})

module.exports = router
