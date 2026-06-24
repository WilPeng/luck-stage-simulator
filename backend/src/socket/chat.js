const jwt = require('jsonwebtoken')
const { v4: generateId } = require('uuid')
const ChatMessage = require('../models/ChatMessage')
const ChatConfig = require('../models/ChatConfig')
const User = require('../models/User')

// 获取聊天室配置（默认开启）
const getChatConfig = async () => {
  let config = await ChatConfig.findOne({ id: 'default' })
  if (!config) {
    config = { id: 'default', enabled: true }
  }
  return config
}

// 更新聊天室配置
const updateChatConfig = async (enabled) => {
  const existing = await ChatConfig.findOne({ id: 'default' })
  if (existing) {
    await ChatConfig.updateOne({ id: 'default' }, { enabled })
  } else {
    const config = new ChatConfig({ id: 'default', enabled })
    await config.save()
  }
}

const initChatSocket = (io) => {
  // JWT 认证中间件
  io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token
    if (!token) {
      return next(new Error('未提供认证令牌'))
    }
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      socket.user = decoded
      next()
    } catch (err) {
      next(new Error('令牌无效或已过期'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = socket.user.userId || socket.user.id
    console.log(`[ChatSocket] User connected: ${userId}`)

    // 发送当前聊天室状态
    const config = await getChatConfig()
    socket.emit('chat:config', { enabled: config.enabled })

    // 发送历史消息（最近 50 条）
    try {
      let messages = await ChatMessage.find()
      messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      const recent = messages.slice(0, 50).reverse()
      const data = recent.map(m => {
        const o = m.toObject ? m.toObject() : m
        delete o._id
        o.senderAvatar = o.senderAvatar ?? null
        o.senderName = o.senderName || '未知用户'
        return o
      })
      socket.emit('chat:history', data)
    } catch (err) {
      console.error('[ChatSocket] Failed to load history:', err)
    }

    // 发送消息
    socket.on('chat:send', async (data, callback) => {
      const config = await getChatConfig()
      if (!config.enabled) {
        return callback?.({ success: false, error: '聊天室已关闭' })
      }

      const { content } = data
      if (!content || !content.trim()) {
        return callback?.({ success: false, error: '消息内容不能为空' })
      }

      try {
        const userDoc = await User.findOne({ id: userId })
        const senderName = userDoc?.name || socket.user.name || '未知用户'
        const senderAvatar = userDoc?.avatar ?? null
        const senderRole = socket.user.role || 'player'

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

        const msgData = message.toObject()
        delete msgData._id
        msgData.senderAvatar = msgData.senderAvatar ?? null
        msgData.senderName = msgData.senderName || '未知用户'

        // 广播给所有客户端
        io.emit('chat:message', msgData)

        callback?.({ success: true, data: msgData })
      } catch (err) {
        console.error('[ChatSocket] Send error:', err)
        callback?.({ success: false, error: '发送失败' })
      }
    })

    // 删除消息
    socket.on('chat:delete', async (data, callback) => {
      const { messageId } = data
      const message = await ChatMessage.findOne({ id: messageId })

      if (!message) {
        return callback?.({ success: false, error: '消息不存在' })
      }

      const isSender = message.senderId === userId
      const isAdmin = socket.user.role === 'admin'

      if (!isSender && !isAdmin) {
        return callback?.({ success: false, error: '无权限删除此消息' })
      }

      await ChatMessage.deleteMany({ id: messageId })
      io.emit('chat:delete', { messageId })
      callback?.({ success: true })
    })

    socket.on('disconnect', () => {
      console.log(`[ChatSocket] User disconnected: ${userId}`)
    })
  })

  // 提供给管理员调用：更新聊天室开关状态
  return {
    setEnabled: async (enabled) => {
      await updateChatConfig(enabled)
      io.emit('chat:config', { enabled })
    },
    getEnabled: async () => {
      const config = await getChatConfig()
      return config.enabled
    }
  }
}

module.exports = { initChatSocket }
