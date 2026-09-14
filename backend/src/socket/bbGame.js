/**
 * Big Brother 全局实时通信
 * 命名空间: /bigbrother-game
 * 用于轮次/阶段切换、HOH/提名/否决权/淘汰等操作的全局广播，
 * 使选手端与管理端无需手动刷新即可获取最新状态。
 */
const jwt = require('jsonwebtoken')

let bbGameNamespace = null

function initBBGameSocket(io) {
  bbGameNamespace = io.of('/bigbrother-game')

  bbGameNamespace.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    if (!token) return next(new Error('未提供认证令牌'))
    try {
      socket.user = jwt.verify(token, process.env.JWT_SECRET)
      next()
    } catch (e) {
      next(new Error('令牌无效或已过期'))
    }
  })

  bbGameNamespace.on('connection', (socket) => {
    const userId = socket.user?.userId || socket.user?.id
    socket.join('bb-game')
    // 管理员加入 admin 房间
    if (socket.user?.role === 'admin') socket.join('bb-game-admin')
    console.log(`[BBGame] connected: ${socket.user?.name || ''} (${userId})`)

    // POV 发牌（仅管理员）——通过 WebSocket 触发，结果广播给所有端
    socket.on('veto:card-deal', async (payload, cb) => {
      const respond = typeof cb === 'function' ? cb : () => {}
      if (socket.user?.role !== 'admin') return respond({ success: false, error: '仅管理员可发牌' })
      try {
        const { dealVetoCards } = require('../games/bigbrother/vetoCardService')
        respond(await dealVetoCards())
      } catch (e) {
        respond({ success: false, error: '发牌失败' })
      }
    })

    // POV 翻牌（当前抽卡者或管理员）——通过 WebSocket 触发
    socket.on('veto:card-draw', async (payload, cb) => {
      const respond = typeof cb === 'function' ? cb : () => {}
      try {
        const { drawVetoCard } = require('../games/bigbrother/vetoCardService')
        respond(await drawVetoCard(userId, socket.user?.role === 'admin'))
      } catch (e) {
        respond({ success: false, error: '抽卡失败' })
      }
    })

    socket.on('disconnect', () => {
      console.log(`[BBGame] disconnected: ${socket.user?.name || ''} (${userId})`)
    })
  })

  console.log('[BBGame] Socket.IO namespace /bigbrother-game initialized')
}

// 广播给所有连接（scope 便于前端区分刷新范围）
function broadcastBBGame(event, payload = {}) {
  if (!bbGameNamespace) return
  bbGameNamespace.emit(event, payload)
}

module.exports = { initBBGameSocket, broadcastBBGame }
