const express = require('express')
const router = express.Router()
const { v4: generateId } = require('uuid')
const ChatMessage = require('../models/ChatMessage')
const ChatConfig = require('../models/ChatConfig')
const User = require('../models/User')

// 简单的 ID 生成（纯数字字符串）
const genId = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36)

// 权限：登录即可（所有人都能发/查看聊天）
const { auth, requireAdmin } = require('../middleware/auth')

// 获取聊天室配置（enabled 状态）
router.get('/config', auth, async (req, res) => {
  try {
    let config = await ChatConfig.findOne({ id: 'default' })
    if (!config) {
      config = { id: 'default', enabled: true }
    }
    res.json({ success: true, data: { enabled: config.enabled } })
  } catch (error) {
    console.error('Get chat config error:', error)
    res.status(500).json({ success: false, error: '获取聊天室配置失败', code: 'SERVER_ERROR' })
  }
})

// 更新聊天室配置（管理员）
router.put('/config', auth, requireAdmin, async (req, res) => {
  try {
    const { enabled } = req.body
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled 参数必填且为布尔值', code: 'INVALID_PARAMS' })
    }

    const existing = await ChatConfig.findOne({ id: 'default' })
    if (existing) {
      existing.enabled = enabled
      await existing.save()
    } else {
      const config = new ChatConfig({ id: 'default', enabled })
      await config.save()
    }

    // 通过 io 对象广播给所有 WebSocket 客户端（io 会通过 req.app.get('io') 获取）
    const io = req.app.get('io')
    if (io) {
      io.emit('chat:config', { enabled })
    }

    res.json({ success: true, data: { enabled } })
  } catch (error) {
    console.error('Update chat config error:', error)
    res.status(500).json({ success: false, error: '更新聊天室配置失败', code: 'SERVER_ERROR' })
  }
})

// 获取聊天记录（支持分页）
router.get('/messages', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 50, keyword } = req.query

    // 检查聊天室是否开启
    const config = await ChatConfig.findOne({ id: 'default' })
    if (config && !config.enabled) {
      // 管理员可以查看历史，选手返回空
      if (req.user.role !== 'admin') {
        return res.json({
          success: true,
          data: {
            list: [],
            total: 0,
            page: 1,
            pageSize: 50,
            totalPages: 0,
            disabled: true
          }
        })
      }
    }

    let messages = await ChatMessage.find()

    // 关键词搜索（搜索内容和发送者昵称）
    if (keyword && keyword.trim()) {
      const kw = keyword.trim().toLowerCase()
      messages = messages.filter(m => {
        const contentMatch = (m.content || '').toLowerCase().includes(kw)
        const senderMatch = (m.senderName || '').toLowerCase().includes(kw)
        return contentMatch || senderMatch
      })
    }

    // 按时间倒序
    messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    // 分页
    const total = messages.length
    const p = parseInt(page)
    const ps = parseInt(pageSize)
    const start = (p - 1) * ps
    const paginated = messages.slice(start, start + ps)

    const data = paginated.map(m => {
      const o = m.toObject ? m.toObject() : m
      delete o._id
      // 确保字段存在且有有效值
      o.senderAvatar = o.senderAvatar ?? null
      o.senderName = o.senderName || '未知用户'
      return o
    })

    res.json({
      success: true,
      data: {
        list: data,
        total,
        page: p,
        pageSize: ps,
        totalPages: Math.ceil(total / ps)
      }
    })
  } catch (error) {
    console.error('Get chat messages error:', error)
    res.status(500).json({ success: false, error: '获取聊天记录失败', code: 'SERVER_ERROR' })
  }
})

// 获取未读消息数（自上次拉取以来的新消息）
router.get('/messages/unread-count', auth, async (req, res) => {
  try {
    const { since } = req.query

    let messages = await ChatMessage.find()
    if (since) {
      messages = messages.filter(m => new Date(m.createdAt) > new Date(since))
    }

    res.json({ success: true, data: { count: messages.length } })
  } catch (error) {
    console.error('Get unread count error:', error)
    res.status(500).json({ success: false, error: '获取未读数失败', code: 'SERVER_ERROR' })
  }
})

// 发送消息（HTTP 备用接口，WebSocket 为主要方式）
router.post('/messages', auth, async (req, res) => {
  try {
    // 检查聊天室是否开启
    const config = await ChatConfig.findOne({ id: 'default' })
    if (config && !config.enabled) {
      return res.status(403).json({ success: false, error: '聊天室已关闭', code: 'CHAT_DISABLED' })
    }

    const { content } = req.body

    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: '消息内容不能为空', code: 'MISSING_PARAMS' })
    }

    // 通过 userId 查库获取最新用户信息（确保 name 和 avatar 是最新的）
    const userId = req.user.userId || req.user.id
    const userDoc = await User.findOne({ id: userId })
    const senderName = userDoc?.name || req.user.name || '未知用户'
    const senderAvatar = userDoc?.avatar ?? null
    const senderRole = req.user.role || 'player'

    const message = new ChatMessage({
      id: generateId(),
      senderId: userId,
      senderName,
      senderRole,
      senderAvatar,
      content: content.trim(),
      createdAt: new Date().toISOString()
    })

    await message.save()

    const o = message.toObject ? message.toObject() : message
    delete o._id
    o.senderAvatar = o.senderAvatar ?? null
    o.senderName = o.senderName || '未知用户'

    // 通过 WebSocket 广播（如果 io 可用）
    const io = req.app.get('io')
    if (io) {
      io.emit('chat:message', o)
    }

    res.status(201).json({ success: true, data: o })
  } catch (error) {
    console.error('Send message error:', error)
    res.status(500).json({ success: false, error: '发送消息失败', code: 'SERVER_ERROR' })
  }
})

// 删除消息（仅发送者本人或管理员可删除）
router.delete('/messages/:id', auth, async (req, res) => {
  try {
    const { id } = req.params

    const message = await ChatMessage.findOne({ id })
    if (!message) {
      return res.status(404).json({ success: false, error: '消息不存在', code: 'NOT_FOUND' })
    }

    // 权限校验：发送者本人 或 管理员
    const isSender = (message.senderId === req.user.userId || message.senderId === req.user.id)
    const isAdmin = req.user.role === 'admin'

    if (!isSender && !isAdmin) {
      return res.status(403).json({ success: false, error: '无权限删除此消息', code: 'FORBIDDEN' })
    }

    await ChatMessage.deleteMany({ id })

    // 通过 WebSocket 广播
    const io = req.app.get('io')
    if (io) {
      io.emit('chat:delete', { messageId: id })
    }

    res.json({ success: true, data: { id } })
  } catch (error) {
    console.error('Delete message error:', error)
    res.status(500).json({ success: false, error: '删除消息失败', code: 'SERVER_ERROR' })
  }
})

// 清空所有聊天记录（仅管理员）
router.delete('/messages', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可清空聊天记录', code: 'FORBIDDEN' })
    }

    await ChatMessage.deleteMany({})

    // 通过 WebSocket 广播
    const io = req.app.get('io')
    if (io) {
      io.emit('chat:clear', {})
    }

    res.json({ success: true, data: { message: '已清空所有聊天记录' } })
  } catch (error) {
    console.error('Clear messages error:', error)
    res.status(500).json({ success: false, error: '清空聊天记录失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
