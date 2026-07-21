const express = require('express')
const router = express.Router()
const { auth } = require('../../../middleware/auth')
const BBChatMessage = require('../models/BBChatMessage')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId } = require('../helpers')

// GET / - 获取聊天消息
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, pageSize = 50 } = req.query
    const currentPage = Number(page) || 1
    const currentPageSize = Number(pageSize) || 50
    const skip = (currentPage - 1) * currentPageSize
    const [documents, total] = await Promise.all([
      BBChatMessage.find({ gameId: 'bigbrother' }),
      BBChatMessage.countDocuments({ gameId: 'bigbrother' })
    ])
    documents.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
    const list = documents.slice(skip, skip + currentPageSize)
    res.json({
      success: true,
      data: {
        messages: list.map(m => m.toObject()),
        total
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取消息失败', code: 'SERVER_ERROR' })
  }
})

// POST / - 发送消息
router.post('/', auth, async (req, res) => {
  try {
    const { content } = req.body
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: '内容不能为空', code: 'EMPTY_CONTENT' })
    }
    const user = await BBHouseguest.findOne({ id: req.user.userId })
    const message = new BBChatMessage({
      id: generateId(),
      senderId: req.user.userId,
      senderName: user?.name || req.user.name || '未知',
      senderRole: req.user.role || 'houseguest',
      senderAvatar: user?.avatar || null,
      content: content.trim(),
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
    await BBChatMessage.deleteMany({ gameId: 'bigbrother' })
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清空失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
