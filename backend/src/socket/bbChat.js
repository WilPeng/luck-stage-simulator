const jwt = require('jsonwebtoken')
const { v4: generateId } = require('uuid')
const BBChatMessage = require('../games/bigbrother/models/BBChatMessage')
const BBHouseguest = require('../games/bigbrother/models/BBHouseguest')

const initBBChatSocket = (io) => {
  const bbNamespace = io.of('/bigbrother-chat')

  // JWT 认证中间件
  bbNamespace.use((socket, next) => {
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

  bbNamespace.on('connection', async (socket) => {
    const userId = socket.user.userId || socket.user.id
    const userRole = socket.user.role || 'houseguest'
    console.log(`[BBChatSocket] User connected: ${userId} (${userRole})`)

    // 加入公开群聊房间
    socket.join('public')

    // 发送历史公开消息（数据库层分页，只查最近50条）
    try {
      const pageSize = 50
      const page = 1
      const skip = (page - 1) * pageSize

      const { data: messages, total } = await BBChatMessage.findPaginated(
        { gameId: 'bigbrother', chatType: 'public' },
        { sort: { createdAt: -1 }, skip, limit: pageSize }
      )

      // 反转成正序（旧在上，新在下），去除 _id
      const data = messages.reverse().map(m => {
        const o = typeof m.toObject === 'function' ? m.toObject() : m
        delete o._id
        o.senderAvatar = o.senderAvatar ?? null
        o.senderName = o.senderName || '未知'
        return o
      })
      socket.emit('chat:history', { messages: data, total, page, pageSize, hasMore: skip + pageSize < total })
    } catch (err) {
      console.error('[BBChatSocket] Failed to load public history:', err)
    }

    // 发送私聊对话列表（与该用户相关的）
    try {
      const privateMsgs = await BBChatMessage.find({
        gameId: 'bigbrother',
        chatType: 'private',
        $or: [{ senderId: userId }, { targetId: userId }]
      })
      // 按对话对分组
      const convMap = {}
      for (const m of privateMsgs) {
        const otherId = m.senderId === userId ? m.targetId : m.senderId
        const otherName = m.senderId === userId ? m.targetName : m.senderName
        if (!convMap[otherId]) {
          convMap[otherId] = { targetId: otherId, targetName: otherName, lastMessage: m.content, lastTime: m.createdAt }
        }
      }
      socket.emit('chat:private-conversations', Object.values(convMap))
    } catch (err) {
      console.error('[BBChatSocket] Failed to load private conversations:', err)
    }

    // 发送公开群聊消息
    socket.on('chat:send-public', async (data, callback) => {
      const { content } = data
      if (!content || !content.trim()) {
        return callback?.({ success: false, error: '消息内容不能为空' })
      }

      try {
        const userDoc = await BBHouseguest.findOne({ id: userId })
        const senderName = userDoc?.name || socket.user.name || '未知'
        const senderAvatar = userDoc?.avatar ?? null

        const message = new BBChatMessage({
          id: generateId(),
          senderId: userId,
          senderName,
          senderRole: userRole,
          senderAvatar,
          content: content.trim(),
          chatType: 'public',
          gameId: 'bigbrother',
          createdAt: new Date().toISOString()
        })
        await message.save()

        const msgData = message.toObject()
        delete msgData._id
        msgData.senderAvatar = msgData.senderAvatar ?? null
        msgData.senderName = msgData.senderName || '未知'

        // 广播给群聊房间所有人
        bbNamespace.to('public').emit('chat:message', msgData)
        callback?.({ success: true, data: msgData })
      } catch (err) {
        console.error('[BBChatSocket] Public send error:', err)
        callback?.({ success: false, error: '发送失败' })
      }
    })

    // 发送私聊消息
    socket.on('chat:send-private', async (data, callback) => {
      const { content, targetId, targetName } = data
      if (!content || !content.trim()) {
        return callback?.({ success: false, error: '消息内容不能为空' })
      }
      if (!targetId) {
        return callback?.({ success: false, error: '未指定私聊目标' })
      }

      try {
        const userDoc = await BBHouseguest.findOne({ id: userId })
        const senderName = userDoc?.name || socket.user.name || '未知'
        const senderAvatar = userDoc?.avatar ?? null

        const message = new BBChatMessage({
          id: generateId(),
          senderId: userId,
          senderName,
          senderRole: userRole,
          senderAvatar,
          content: content.trim(),
          chatType: 'private',
          targetId,
          targetName: targetName || '',
          gameId: 'bigbrother',
          createdAt: new Date().toISOString()
        })
        await message.save()

        const msgData = message.toObject()
        delete msgData._id
        msgData.senderAvatar = msgData.senderAvatar ?? null
        msgData.senderName = msgData.senderName || '未知'

        // 发送给目标用户（如果在线）和发送者自己
        // 管理员也能收到所有私聊
        const adminSockets = await bbNamespace.fetchSockets()
        for (const s of adminSockets) {
          const sUserId = s.user?.userId || s.user?.id
          const sRole = s.user?.role
          // 发送给发送者、目标用户、以及所有管理员
          if (sUserId === userId || sUserId === targetId || sRole === 'admin') {
            s.emit('chat:private-message', msgData)
          }
        }

        callback?.({ success: true, data: msgData })
      } catch (err) {
        console.error('[BBChatSocket] Private send error:', err)
        callback?.({ success: false, error: '发送失败' })
      }
    })

    // 获取与某人的私聊历史（数据库层分页）
    socket.on('chat:get-private-history', async (data, callback) => {
      const { targetId, page = 1, pageSize = 50 } = data
      if (!targetId) {
        return callback?.({ success: false, error: '未指定目标' })
      }

      try {
        let query
        // 管理员模式：targetId 是 pairKey 格式 "user1Id::user2Id"
        if (userRole === 'admin' && targetId.includes('::')) {
          const [uid1, uid2] = targetId.split('::')
          query = {
            gameId: 'bigbrother',
            chatType: 'private',
            $or: [
              { senderId: uid1, targetId: uid2 },
              { senderId: uid2, targetId: uid1 }
            ]
          }
        } else {
          query = {
            gameId: 'bigbrother',
            chatType: 'private',
            $or: [
              { senderId: userId, targetId },
              { senderId: targetId, targetId: userId }
            ]
          }
        }

        const skip = (page - 1) * pageSize

        const { data: messages, total } = await BBChatMessage.findPaginated(query, {
          sort: { createdAt: -1 },
          skip,
          limit: pageSize
        })

        const result = messages.reverse().map(m => {
          const o = typeof m.toObject === 'function' ? m.toObject() : m
          delete o._id
          return o
        })
        callback?.({ success: true, data: result, total, page, pageSize, hasMore: skip + pageSize < total })
      } catch (err) {
        console.error('[BBChatSocket] Private history error:', err)
        callback?.({ success: false, error: '获取私聊历史失败' })
      }
    })

    // 加载更多公开消息（数据库层分页）
    socket.on('chat:load-more-public', async (data, callback) => {
      const { page = 2, pageSize = 50 } = data

      try {
        const skip = (page - 1) * pageSize

        const { data: messages, total } = await BBChatMessage.findPaginated(
          { gameId: 'bigbrother', chatType: 'public' },
          { sort: { createdAt: -1 }, skip, limit: pageSize }
        )

        const result = messages.reverse().map(m => {
          const o = typeof m.toObject === 'function' ? m.toObject() : m
          delete o._id
          o.senderAvatar = o.senderAvatar ?? null
          o.senderName = o.senderName || '未知'
          return o
        })
        callback?.({ success: true, data: result, total, page, pageSize, hasMore: skip + pageSize < total })
      } catch (err) {
        console.error('[BBChatSocket] Load more public error:', err)
        callback?.({ success: false, error: '加载更多失败' })
      }
    })

    // 加载更多私聊消息（数据库层分页）
    socket.on('chat:load-more-private', async (data, callback) => {
      const { targetId, page = 2, pageSize = 50 } = data
      if (!targetId) {
        return callback?.({ success: false, error: '未指定目标' })
      }

      try {
        let query
        if (userRole === 'admin' && targetId.includes('::')) {
          const [uid1, uid2] = targetId.split('::')
          query = {
            gameId: 'bigbrother',
            chatType: 'private',
            $or: [
              { senderId: uid1, targetId: uid2 },
              { senderId: uid2, targetId: uid1 }
            ]
          }
        } else {
          query = {
            gameId: 'bigbrother',
            chatType: 'private',
            $or: [
              { senderId: userId, targetId },
              { senderId: targetId, targetId: userId }
            ]
          }
        }

        const skip = (page - 1) * pageSize

        const { data: messages, total } = await BBChatMessage.findPaginated(query, {
          sort: { createdAt: -1 },
          skip,
          limit: pageSize
        })

        const result = messages.reverse().map(m => {
          const o = typeof m.toObject === 'function' ? m.toObject() : m
          delete o._id
          return o
        })
        callback?.({ success: true, data: result, total, page, pageSize, hasMore: skip + pageSize < total })
      } catch (err) {
        console.error('[BBChatSocket] Load more private error:', err)
        callback?.({ success: false, error: '加载更多失败' })
      }
    })

    // 删除消息
    socket.on('chat:delete', async (data, callback) => {
      const { messageId } = data
      const message = await BBChatMessage.findOne({ id: messageId })

      if (!message) {
        return callback?.({ success: false, error: '消息不存在' })
      }

      const isSender = message.senderId === userId
      const isAdmin = userRole === 'admin'

      if (!isSender && !isAdmin) {
        return callback?.({ success: false, error: '无权限删除此消息' })
      }

      await BBChatMessage.deleteMany({ id: messageId })
      bbNamespace.emit('chat:delete', { messageId })
      callback?.({ success: true })
    })

    // 清空公开聊天（仅管理员）
    socket.on('chat:clear-public', async (data, callback) => {
      if (userRole !== 'admin') {
        return callback?.({ success: false, error: '仅管理员可清空' })
      }
      await BBChatMessage.deleteMany({ gameId: 'bigbrother', chatType: 'public' })
      bbNamespace.to('public').emit('chat:cleared', { chatType: 'public' })
      callback?.({ success: true })
    })

    socket.on('disconnect', () => {
      console.log(`[BBChatSocket] User disconnected: ${userId}`)
    })
  })

  return {
    getNamespace: () => bbNamespace
  }
}

module.exports = { initBBChatSocket }
