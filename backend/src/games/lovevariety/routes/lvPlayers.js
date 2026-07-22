const express = require('express')
const router = express.Router()
const path = require('path')
const fs = require('fs')
const multer = require('multer')
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, LV_ACTION_TYPES } = require('../helpers')

// 头像上传配置
const AVATAR_DIR = path.join(__dirname, '..', '..', '..', '..', 'uploads', 'lvavatars')
if (!fs.existsSync(AVATAR_DIR)) fs.mkdirSync(AVATAR_DIR, { recursive: true })

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, AVATAR_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg'
    cb(null, `lv-avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`)
  }
})
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('仅支持图片文件'))
    cb(null, true)
  }
})

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

// GET /active - 获取活跃选手（waiting 阶段返回空列表）
router.get('/active', async (req, res) => {
  try {
    const { getCurrentSeason } = require('../helpers')
    const season = await getCurrentSeason()
    // waiting 阶段不暴露选手信息
    if (season && season.currentStage === 'waiting') {
      return res.json({ success: true, data: [] })
    }
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVPlayer')
    const docs = await col.find({ gameId: 'lovevariety', status: 'active', role: 'player' }).toArray()
    const list = docs.map(d => ({
      id: d.id, name: d.name, avatar: d.avatar || null, status: d.status,
      letterPublicCount: d.letterPublicCount ?? 0,
      letterAnonymousCount: d.letterAnonymousCount ?? 0,
      voteBudget: d.voteBudget ?? 0
    }))
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
    const { name, loginCode, status, avatar } = req.body
    if (name) player.name = name
    if (loginCode) player.loginCode = loginCode
    if (status) player.status = status
    if (avatar !== undefined) player.avatar = avatar
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

// POST /me/avatar - 选手自行上传头像（必须在 /:id/avatar 之前，避免被 /:id 匹配）
router.post('/me/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    let player = await LVPlayer.findOne({ id: decoded.userId })
    // 降级查找：如果 token 中的 userId 找不到，尝试用请求体中的 playerId 查找
    if (!player && req.body.playerId) {
      player = await LVPlayer.findOne({ id: req.body.playerId })
    }
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    if (!req.file) return res.status(400).json({ success: false, error: '未上传图片文件', code: 'MISSING_FILE' })

    const oldAvatar = player.avatar
    const avatarUrl = `/uploads/lvavatars/${req.file.filename}`
    player.avatar = avatarUrl
    player.updatedAt = new Date().toISOString()
    await player.save()

    if (oldAvatar && oldAvatar.startsWith('/uploads/lvavatars/')) {
      const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }

    res.json({ success: true, data: { avatar: avatarUrl, playerId: player.id } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '上传头像失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /me/avatar - 选手自行删除头像（必须在 /:id/avatar 之前）
router.delete('/me/avatar', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    let player = await LVPlayer.findOne({ id: decoded.userId })
    // 降级查找：如果 token 中的 userId 找不到，尝试用请求体中的 playerId 查找
    if (!player && req.body.playerId) {
      player = await LVPlayer.findOne({ id: req.body.playerId })
    }
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })

    const oldAvatar = player.avatar
    player.avatar = null
    player.updatedAt = new Date().toISOString()
    await player.save()

    if (oldAvatar && oldAvatar.startsWith('/uploads/lvavatars/')) {
      const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除头像失败', code: 'SERVER_ERROR' })
  }
})

// POST /:id/avatar - 管理员上传选手头像
router.post('/:id/avatar', upload.single('avatar'), async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    if (!req.file) return res.status(400).json({ success: false, error: '未上传图片文件', code: 'MISSING_FILE' })

    const oldAvatar = player.avatar
    const avatarUrl = `/uploads/lvavatars/${req.file.filename}`
    player.avatar = avatarUrl
    player.updatedAt = new Date().toISOString()
    await player.save()

    if (oldAvatar && oldAvatar.startsWith('/uploads/lvavatars/')) {
      const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }

    res.json({ success: true, data: { avatar: avatarUrl, playerId: player.id } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '上传头像失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /:id/avatar - 管理员删除选手头像
router.delete('/:id/avatar', async (req, res) => {
  try {
    const player = await LVPlayer.findOne({ id: req.params.id, gameId: 'lovevariety' })
    if (!player) return res.status(404).json({ success: false, error: '选手不存在', code: 'NOT_FOUND' })
    const oldAvatar = player.avatar
    player.avatar = null
    player.updatedAt = new Date().toISOString()
    await player.save()

    if (oldAvatar && oldAvatar.startsWith('/uploads/lvavatars/')) {
      const oldPath = path.join(__dirname, '..', '..', '..', '..', oldAvatar)
      if (fs.existsSync(oldPath)) fs.unlink(oldPath, () => {})
    }
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除头像失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
