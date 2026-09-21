/**
 * 通用游戏全局实时通信（乘风2026 等）
 * 命名空间: /game-realtime
 * 任意 /api/:gameId 写操作成功后广播 sf:update，使选手端/管理端无需刷新即可刷新。
 */
const jwt = require('jsonwebtoken')

let sfNamespace = null

function initSfGameSocket(io) {
  sfNamespace = io.of('/game-realtime')

  sfNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (!token) return next(new Error('未提供认证令牌'))
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET)
      next()
    } catch (e) {
      next(new Error('令牌无效或已过期'))
    }
  })

  sfNamespace.on('connection', (socket) => {
    const userId = socket.user?.userId || socket.user?.id
    const gameId = socket.handshake.auth?.gameId || socket.handshake.query?.gameId || ''
    if (gameId) socket.join(`sf-${gameId}`)
    socket.join('sf-all')
    console.log(`[SFGame] connected: ${socket.user?.name || ''} (${userId}) game=${gameId}`)
    socket.on('disconnect', () => {
      console.log(`[SFGame] disconnected: ${socket.user?.name || ''} (${userId})`)
    })
  })

  console.log('[SFGame] Socket.IO namespace /game-realtime initialized')
}

/** 广播给指定游戏（无 gameId 时广播给全部） */
function broadcastSfGame(gameId, payload = {}) {
  if (!sfNamespace) return
  if (gameId) sfNamespace.to(`sf-${gameId}`).emit('sf:update', { gameId, ...payload })
  else sfNamespace.emit('sf:update', payload)
}

module.exports = { initSfGameSocket, broadcastSfGame }
