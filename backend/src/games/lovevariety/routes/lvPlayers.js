const express = require('express')
const router = express.Router()
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, LV_ACTION_TYPES } = require('../helpers')

// GET / - 获取所有选手
router.get('/', async (req, res) => {
  try {
    const { keyword, status, page = '1', pageSize = '20' } = req.query
    const filter = { gameId: 'lovevariety' }
    if (keyword) {
      filter.$or = [
        { name: { $regex: keyword, $options: 'i' } },
        { loginCode: { $regex: keyword, $options: 'i' } },
      ]
    }
    if (status) filter.status = status
    const currentPage = Math.max(1, parseInt(page) || 1)
    const currentPageSize = Math.max(1, Math.min(100, parseInt(pageSize) || 20))
    const skip = (currentPage - 1) * currentPageSize
    const [documents, total] = await Promise.all([
      new LVPlayer()._getCollection().find(filter).skip(skip).limit(currentPageSize).toArray(),
      new LVPlayer()._getCollection().countDocuments(filter)
    ])
    const list = documents.map(d => new LVPlayer(d).toObject())
    res.json({
      success: true,
      data: {
        list,
        total,
        page: currentPage,
        pageSize: currentPageSize,
        totalPages: Math.ceil(total / currentPageSize)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取选手列表失败', code: 'SERVER_ERROR' })
  }
})

// GET /active - 获取活跃选手
router.get('/active', async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVPlayer')
    const docs = await col.find({ gameId: 'lovevariety', status: 'active', role: 'player' }).toArray()
    const list = docs.map(d => ({ id: d.id, name: d.name, avatar: d.avatar || null, status: d.status }))
    res.json({ success: true, data: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取活跃选手失败', code: 'SERVER_ERROR' })
  }
})

// GET /stats - 选手统计
router.get('/stats', async (req, res) => {
  try {
    const stats = await LVPlayer.stats('lovevariety')
    res.json({ success: true, data: stats })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取统计失败', code: 'SERVER_ERROR' })
  }
})

// GET /:id - 获取单个选手
router.get('/:id', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取选手失败', code: 'SERVER_ERROR' })
  }
})

// POST / - 创建选手
router.post('/', async (req, res) => {
  try {
    const { name, loginCode } = req.body
    if (!name) return res.status(400).json({ success: false, error: '姓名不能为空', code: 'INVALID_NAME' })
    const player = new LVPlayer({
      id: generateId(),
      name,
      loginCode: loginCode || `LV-${Date.now()}`,
      role: 'player',
      status: 'active',
      gameId: 'lovevariety'
    })
    await player.save()
    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PLAYER_CREATE, 'player', player.id, `创建选手: ${player.name}`)
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建选手失败', code: 'SERVER_ERROR' })
  }
})

// PUT /:id - 更新选手
router.put('/:id', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    const { name, loginCode, status } = req.body
    if (name) player.name = name
    if (loginCode) player.loginCode = loginCode
    if (status) player.status = status
    player.updatedAt = new Date().toISOString()
    await player.save()
    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PLAYER_EDIT, 'player', player.id, `更新选手: ${player.name} status=${player.status}`)
    res.json({ success: true, data: player.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新选手失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /:id - 删除选手
router.delete('/:id', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    await LVPlayer.deleteOne({ id: req.params.id })
    await logAction(req.user?.userId || 'system', req.user?.name || 'system', 'admin',
      LV_ACTION_TYPES.PLAYER_DELETE, 'player', player.id, `删除选手: ${player.name}`)
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除选手失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
