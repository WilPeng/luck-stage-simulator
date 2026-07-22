const express = require('express')
const router = express.Router()
const LVLetter = require('../models/LVLetter')
const LVPlayer = require('../models/LVPlayer')
const { generateId, logAction, getCurrentSeason, LV_ACTION_TYPES } = require('../helpers')

// GET /list - 管理员获取所有信件（支持筛选）
router.get('/list', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可查看所有信件', code: 'FORBIDDEN' })
    }

    const { senderId, receiverId, keyword, page = '1', pageSize = '50' } = req.query
    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLetter')
    const filter = { gameId: 'lovevariety' }
    if (senderId) filter.senderId = senderId
    if (receiverId) filter.receiverId = receiverId
    if (keyword) {
      filter.$or = [
        { content: { $regex: keyword, $options: 'i' } },
        { senderName: { $regex: keyword, $options: 'i' } },
        { receiverName: { $regex: keyword, $options: 'i' } }
      ]
    }
    const currentPage = Math.max(1, parseInt(page) || 1)
    const currentPageSize = Math.max(1, Math.min(200, parseInt(pageSize) || 50))
    const skip = (currentPage - 1) * currentPageSize
    const [docs, total] = await Promise.all([
      col.find(filter).sort({ createdAt: -1 }).skip(skip).limit(currentPageSize).toArray(),
      col.countDocuments(filter)
    ])
    res.json({
      success: true,
      data: {
        list: docs,
        total,
        page: currentPage,
        pageSize: currentPageSize,
        totalPages: Math.ceil(total / currentPageSize)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取信件列表失败', code: 'SERVER_ERROR' })
  }
})

// GET /inbox - 获取当前用户的收件箱
router.get('/inbox', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLetter')
    const docs = await col.find({ gameId: 'lovevariety', receiverId: decoded.userId })
      .sort({ createdAt: -1 })
      .toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取收件箱失败', code: 'SERVER_ERROR' })
  }
})

// GET /sent - 获取当前用户的发件箱
router.get('/sent', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVLetter')
    const docs = await col.find({ gameId: 'lovevariety', senderId: decoded.userId })
      .sort({ createdAt: -1 })
      .toArray()
    res.json({ success: true, data: docs })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取发件箱失败', code: 'SERVER_ERROR' })
  }
})

// POST /send - 发送信件
router.post('/send', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)

    const { receiverId, content, isAnonymous } = req.body
    if (!receiverId || !content || !content.trim()) {
      return res.status(400).json({ success: false, error: '接收人和信件内容不能为空', code: 'INVALID_PARAMS' })
    }

    // 检查寄信次数
    const sender = await LVPlayer.findOne({ id: decoded.userId })
    if (!sender) return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })

    const isAnon = !!isAnonymous
    if (isAnon) {
      if ((sender.letterAnonymousCount ?? 0) <= 0) {
        return res.status(400).json({ success: false, error: '匿名寄信次数不足，请联系管理员增加次数', code: 'NO_ANON_COUNT' })
      }
    } else {
      if ((sender.letterPublicCount ?? 0) <= 0) {
        return res.status(400).json({ success: false, error: '实名寄信次数不足，请联系管理员增加次数', code: 'NO_PUBLIC_COUNT' })
      }
    }

    // 校验接收人存在且活跃
    const receiver = await LVPlayer.findOne({ id: receiverId })
    if (!receiver || receiver.status !== 'active') {
      return res.status(400).json({ success: false, error: '接收人不存在或已淘汰', code: 'INVALID_RECEIVER' })
    }

    // 不能给自己寄信
    if (receiverId === decoded.userId) {
      return res.status(400).json({ success: false, error: '不能给自己寄信', code: 'SELF_LETTER' })
    }

    const letter = new LVLetter({
      id: generateId(),
      roundId: `round-${(await getCurrentSeason())?.currentRound || 1}`,
      senderId: decoded.userId,
      senderName: sender.name,
      senderAvatar: sender.avatar || null,
      receiverId,
      receiverName: receiver.name,
      receiverAvatar: receiver.avatar || null,
      content: content.trim(),
      isAnonymous: !!isAnonymous,
      gameId: 'lovevariety'
    })
    await letter.save()

    // 根据是否匿名扣减对应寄信次数
    if (isAnon) {
      sender.letterAnonymousCount = (sender.letterAnonymousCount ?? 0) - 1
    } else {
      sender.letterPublicCount = (sender.letterPublicCount ?? 0) - 1
    }
    await sender.save()

    await logAction(decoded.userId, sender.name, 'player',
      'LETTER_SEND', 'letter', letter.id,
      `寄信: ${sender.name} → ${receiver.name}${isAnon ? '(匿名)' : ''}`)

    res.json({ success: true, data: letter.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '寄信失败', code: 'SERVER_ERROR' })
  }
})

// POST /add-count - 管理员增加选手寄信次数
router.post('/add-count', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可操作', code: 'FORBIDDEN' })
    }

    const { playerIds, amount, letterType } = req.body
    const count = parseInt(amount) || 1
    if (count < 1) {
      return res.status(400).json({ success: false, error: '增加次数必须 >= 1', code: 'INVALID_AMOUNT' })
    }

    // 确定增加的字段：public=实名, anonymous=匿名, 默认实名
    const countField = letterType === 'anonymous' ? 'letterAnonymousCount' : 'letterPublicCount'

    let filter = { gameId: 'lovevariety', role: 'player' }
    if (Array.isArray(playerIds) && playerIds.length > 0) {
      filter.id = { $in: playerIds }
    }

    const { getCollection } = require('../../../config/db')
    const col = getCollection('LVPlayer')
    const result = await col.updateMany(
      filter,
      { $inc: { [countField]: count } }
    )

    const typeName = letterType === 'anonymous' ? '匿名' : '实名'
    await logAction(decoded.userId, 'admin', 'admin',
      'LETTER_ADD_COUNT', 'letter', '',
      `管理员增加${typeName}寄信次数: ${count}次, 影响${result.modifiedCount}人`)

    res.json({ success: true, data: { modifiedCount: result.modifiedCount } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '增加寄信次数失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /:id - 管理员删除信件
router.delete('/:id', async (req, res) => {
  try {
    const authHeader = req.header('Authorization')
    if (!authHeader) return res.status(401).json({ success: false, error: '未认证', code: 'NO_TOKEN' })
    const token = authHeader.replace('Bearer ', '')
    const jwt = require('jsonwebtoken')
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    if (decoded.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可删除信件', code: 'FORBIDDEN' })
    }

    // 从数据库获取管理员真实姓名
    const admin = await LVPlayer.findOne({ id: decoded.userId })
    const adminName = admin?.name || 'admin'

    const letter = await LVLetter.findOne({ id: req.params.id })
    if (!letter) {
      return res.status(404).json({ success: false, error: '信件不存在', code: 'NOT_FOUND' })
    }

    await LVLetter.deleteOne({ id: req.params.id })

    await logAction(decoded.userId, adminName, 'admin',
      'LETTER_DELETE', 'letter', req.params.id,
      `管理员删除信件: ${letter.senderName} → ${letter.receiverName}`)

    res.json({ success: true, data: null })
  } catch (e) {
    console.error('删除信件失败:', e)
    // 确保始终返回 JSON，防止 Vite 代理回退到 HTML
    res.setHeader('Content-Type', 'application/json')
    res.status(500).json({ success: false, error: '删除信件失败: ' + (e.message || '未知错误'), code: 'SERVER_ERROR' })
  }
})

module.exports = router
