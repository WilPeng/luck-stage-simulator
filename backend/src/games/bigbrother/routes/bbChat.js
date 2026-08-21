const express = require('express')
const router = express.Router()
const { auth } = require('../../../middleware/auth')
const BBChatMessage = require('../models/BBChatMessage')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId } = require('../helpers')

// GET / - 获取公开聊天消息（数据库层分页）
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 50 } = req.query
    const currentPage = Number(page) || 1
    const currentPageSize = Number(pageSize) || 50
    const skip = (currentPage - 1) * currentPageSize
    const { data: documents, total } = await BBChatMessage.findPaginated(
      { gameId: 'bigbrother', chatType: 'public' },
      { sort: { createdAt: -1 }, skip, limit: currentPageSize }
    )
    const list = documents.reverse()
    res.json({
      success: true,
      data: {
        messages: list.map(m => typeof m.toObject === 'function' ? m.toObject() : m),
        total
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取消息失败', code: 'SERVER_ERROR' })
  }
})

// GET /private/:targetId - 获取与某人的私聊消息（数据库层分页）
router.get('/private/:targetId', auth, async (req, res) => {
  try {
    const myId = req.user.userId
    const targetId = req.params.targetId
    const { page = 1, pageSize = 50 } = req.query
    const currentPage = Number(page) || 1
    const currentPageSize = Number(pageSize) || 50
    const skip = (currentPage - 1) * currentPageSize

    const query = {
      gameId: 'bigbrother',
      chatType: 'private',
      $or: [
        { senderId: myId, targetId: targetId },
        { senderId: targetId, targetId: myId }
      ]
    }

    const { data: documents, total } = await BBChatMessage.findPaginated(query, {
      sort: { createdAt: -1 },
      skip,
      limit: currentPageSize
    })
    const list = documents.reverse()
    res.json({
      success: true,
      data: {
        messages: list.map(m => typeof m.toObject === 'function' ? m.toObject() : m),
        total
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取私聊消息失败', code: 'SERVER_ERROR' })
  }
})

// GET /all-private - 管理员查看所有私聊（按用户对分组，仅返回对话摘要 + 最近50条消息）
router.get('/all-private', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅管理员可查看', code: 'FORBIDDEN' })
    }
    const messages = await BBChatMessage.find({
      gameId: 'bigbrother',
      chatType: 'private'
    })
    messages.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

    // 按对话对分组，每对只保留最近50条
    const conversations = {}
    for (const m of messages) {
      const pair = [m.senderId, m.targetId].sort().join('::')
      if (!conversations[pair]) {
        conversations[pair] = {
          user1Id: m.senderId,
          user1Name: m.senderName,
          user2Id: m.targetId,
          user2Name: m.targetName,
          messages: []
        }
      }
      if (conversations[pair].messages.length < 50) {
        conversations[pair].messages.push(m.toObject())
      }
    }

    // 每个对话的消息反转成正序（旧在上，新在下）
    for (const pair in conversations) {
      conversations[pair].messages.reverse()
    }

    res.json({
      success: true,
      data: {
        conversations: Object.values(conversations)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取所有私聊失败', code: 'SERVER_ERROR' })
  }
})

// POST / - 发送消息（通过 REST，WebSocket 也通过此接口落库）
router.post('/', auth, async (req, res) => {
  try {
    const { content, chatType, targetId, targetName } = req.body
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: '内容不能为空', code: 'EMPTY_CONTENT' })
    }
    const type = chatType || 'public'
    const user = await BBHouseguest.findOne({ id: req.user.userId })
    const message = new BBChatMessage({
      id: generateId(),
      senderId: req.user.userId,
      senderName: user?.name || req.user.name || '未知',
      senderRole: req.user.role || 'houseguest',
      senderAvatar: user?.avatar || null,
      content: content.trim(),
      chatType: type,
      targetId: type === 'private' ? (targetId || null) : null,
      targetName: type === 'private' ? (targetName || null) : null,
      gameId: 'bigbrother'
    })
    await message.save()
    res.json({ success: true, data: message.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '发送失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /:id - 删除消息
router.delete('/:id', auth, async (req, res) => {
  try {
    await BBChatMessage.deleteOne({ id: req.params.id })
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// DELETE / - 清空消息
router.delete('/', auth, async (req, res) => {
  try {
    const { chatType } = req.query
    const filter = { gameId: 'bigbrother' }
    if (chatType) filter.chatType = chatType
    await BBChatMessage.deleteMany(filter)
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清空失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
