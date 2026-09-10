const jwt = require('jsonwebtoken')
const engine = require('../games/powerchallenge/engine')

const initPCGameSocket = (io) => {
  engine.setIo(io)
  const ns = io.of('/powerchallenge')

  ns.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token
    if (!token) return next(new Error('未提供认证令牌'))
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET)
      socket.user = decoded
      next()
    } catch (err) {
      next(new Error('令牌无效或已过期'))
    }
  })

  ns.on('connection', async (socket) => {
    const userId = socket.user.userId || socket.user.id
    const role = socket.user.role || 'player'
    const name = socket.user.name || '玩家'
    console.log(`[PowerChallenge] ${role} connected: ${name} (${userId})`)

    socket.join('pc-live')
    socket.join(`pc-${userId}`)

    const sendState = async () => {
      try {
        socket.emit('pc:state', await engine.publicSummary())
      } catch (e) {
        console.error('[PowerChallenge] sendState error:', e)
      }
    }
    sendState()

    // 玩家进入比赛房间后才计为“在线参与”
    socket.on('pc_join_arena', () => {
      if (role === 'player') engine.playerJoinArena(userId, name)
    })
    socket.on('pc_leave_arena', () => {
      if (role === 'player') engine.playerLeaveArena(userId)
    })

    // ---- 玩家答题 ----
    socket.on('pc_answer', async (payload, callback) => {
      if (role !== 'player') return
      try {
        const result = await engine.submitAnswer(userId, payload)
        if (typeof callback === 'function') callback(result)
      } catch (e) {
        console.error('[PowerChallenge] answer error:', e)
        if (typeof callback === 'function') callback({ success: false, error: '服务异常' })
      }
    })

    // ---- 管理端 ----
    const adminAction = async (fn, callback) => {
      if (role !== 'admin') {
        if (typeof callback === 'function') callback({ success: false, error: '需要管理员权限' })
        return
      }
      try {
        const result = await fn()
        if (typeof callback === 'function') callback(result)
      } catch (e) {
        console.error('[PowerChallenge] admin action error:', e)
        if (typeof callback === 'function') callback({ success: false, error: '服务异常' })
      }
    }

    socket.on('pc_admin_start', (cb) => adminAction(() => engine.startRound(), cb))
    socket.on('pc_admin_end', (cb) => adminAction(() => engine.endRound(), cb))
    socket.on('pc_admin_next', (cb) => adminAction(() => engine.prepareNextRound(), cb))
    socket.on('pc_admin_reset', (cb) => adminAction(() => engine.resetSeason(), cb))

    socket.on('disconnect', () => {
      if (role === 'player') engine.playerDisconnected(userId)
      console.log(`[PowerChallenge] ${role} disconnected: ${name} (${userId})`)
    })
  })

  return ns
}

module.exports = { initPCGameSocket }
