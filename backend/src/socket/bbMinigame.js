/**
 * Big Brother 小游戏 Socket.IO 命名空间
 * 处理小游戏的实时通信：房间管理、游戏开始、玩家操作、结果广播
 */
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { getGame } = require('../games/bigbrother/minigames/loadAll')

// 活跃游戏房间（内存管理）
const activeRooms = new Map() // roomId -> GameRoom

class GameRoom {
  constructor(roomId, gameType, minigameId, participants) {
    this.roomId = roomId
    this.gameType = gameType      // 'hoh' | 'veto'
    this.minigameId = minigameId
    this.participants = participants // [{ playerId, playerName, avatar, connected }]
    this.status = 'waiting'       // waiting | countdown | playing | finished
    this.startTime = null
    this.gameState = null         // 小游戏内部状态
    this.winner = null
    this.tickTimer = null         // balance-bar 的定时器
  }

  getParticipant(playerId) {
    return this.participants.find(p => p.playerId === playerId)
  }

  setConnected(playerId, connected) {
    const p = this.getParticipant(playerId)
    if (p) p.connected = connected
  }

  allConnected() {
    return this.participants.every(p => p.connected)
  }

  cleanup() {
    if (this.tickTimer) {
      clearInterval(this.tickTimer)
      this.tickTimer = null
    }
  }
}

const initBBMinigameSocket = (io) => {
  const minigameNs = io.of('/bigbrother-minigame')

  // JWT 认证中间件
  minigameNs.use((socket, next) => {
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

  minigameNs.on('connection', (socket) => {
    const userId = socket.user.userId || socket.user.id
    const userName = socket.user.name || ''
    console.log(`[BBMinigame] User connected: ${userName} (${userId})`)

    // 加入房间
    socket.on('join_room', (data) => {
      const { roomId } = data || {}
      if (!roomId) return

      const room = activeRooms.get(roomId)
      if (!room) {
        socket.emit('game_error', { message: '比赛房间不存在或已结束' })
        return
      }

      const participant = room.getParticipant(userId)
      if (!participant) {
        socket.emit('game_error', { message: '你不在本轮比赛参与者名单中' })
        return
      }

      socket.join(roomId)
      room.setConnected(userId, true)
      socket.roomId = roomId

      console.log(`[BBMinigame] ${userName} joined room ${roomId}`)

      // 发送当前状态
      if (room.status === 'playing' && room.gameState) {
        const handler = getGame(room.minigameId)
        if (handler && handler.getState) {
          socket.emit('game_state', handler.getState(room.gameState, userId))
        }
      }

      // 通知管理员（所有在 room 中的人）玩家已连接
      minigameNs.to(roomId).emit('participant_joined', {
        playerId: userId,
        playerName: userName,
        participants: room.participants.map(p => ({
          playerId: p.playerId,
          playerName: p.playerName,
          connected: p.connected
        }))
      })
    })

    // 离开房间
    socket.on('leave_room', (data) => {
      const roomId = data?.roomId || socket.roomId
      if (!roomId) return

      const room = activeRooms.get(roomId)
      if (room) {
        room.setConnected(userId, false)
      }
      socket.leave(roomId)
      socket.roomId = null

      minigameNs.to(roomId).emit('participant_left', {
        playerId: userId,
        playerName: userName
      })
    })

    // 游戏操作
    socket.on('game_action', (data) => {
      const roomId = data?.roomId || socket.roomId
      if (!roomId) return

      const room = activeRooms.get(roomId)
      if (!room) return
      if (room.status !== 'playing') return

      const handler = getGame(room.minigameId)
      if (!handler) return

      const result = handler.handleAction(room.gameState, userId, data.action)
      if (!result || !result.updated) return

      // 发送操作结果给该玩家
      const playerState = handler.getState
        ? handler.getState(room.gameState, userId)
        : null
      socket.emit('game_state', { ...playerState, actionResult: result.result })

      // 如果游戏结束
      if (result.finished) {
        finishGame(room, minigameNs)
      }
    })

    // 断开连接
    socket.on('disconnect', () => {
      const roomId = socket.roomId
      if (roomId) {
        const room = activeRooms.get(roomId)
        if (room) {
          room.setConnected(userId, false)
          minigameNs.to(roomId).emit('participant_left', {
            playerId: userId,
            playerName: userName
          })
        }
      }
      console.log(`[BBMinigame] User disconnected: ${userName} (${userId})`)
    })
  })

  // 管理房间相关方法挂载到 minigameNs 上供路由使用
  minigameNs.createRoom = (gameType, minigameId, participants) => {
    const roomId = uuidv4()
    const room = new GameRoom(roomId, gameType, minigameId, participants.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      avatar: p.avatar || null,
      connected: false
    })))
    activeRooms.set(roomId, room)
    return room
  }

  minigameNs.startGame = (roomId, callback) => {
    const room = activeRooms.get(roomId)
    if (!room) return callback({ success: false, error: '房间不存在' })

    const handler = getGame(room.minigameId)
    if (!handler) return callback({ success: false, error: '小游戏未找到' })

    // 初始化游戏状态
    const participants = room.participants.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName
    }))
    room.gameState = handler.init(participants)
    room.status = 'countdown'

    // 倒计时 3 秒
    let countdown = 3
    const countdownTimer = setInterval(() => {
      minigameNs.to(roomId).emit('game_countdown', { seconds: countdown })
      countdown--
      if (countdown < 0) {
        clearInterval(countdownTimer)
        // 开始游戏
        room.status = 'playing'
        room.startTime = Date.now()
        if (room.gameState) room.gameState.startTime = room.startTime
        if (room.gameState) room.gameState.status = 'playing'
        minigameNs.to(roomId).emit('game_started', { startTime: room.startTime })

        // 非 balance-bar 游戏：给每个已连接的选手发送各自的 game_state
        if (room.minigameId !== 'balance-bar' && handler.getState) {
          io.of('/bigbrother-minigame').fetchSockets().then(namespaceSockets => {
            for (const s of namespaceSockets) {
              const uid = s.user?.userId || s.user?.id
              if (uid && room.getParticipant(uid) && s.rooms.has(roomId)) {
                const ps = handler.getState(room.gameState, uid)
                if (ps) s.emit('game_state', ps)
              }
            }
          }).catch(err => {
            console.error('[BBMinigame] Failed to send game_state:', err)
          })
        }

        // 特殊处理：balance-bar 需要服务端 tick
        if (room.minigameId === 'balance-bar') {
          const balanceBar = require('../games/bigbrother/minigames/balanceBar')
          const { TICK_INTERVAL, GAME_DURATION } = balanceBar
          room.tickTimer = setInterval(() => {
            if (room.status !== 'playing') {
              clearInterval(room.tickTimer)
              room.tickTimer = null
              return
            }
            handler.tick(room.gameState)
            // 广播所有玩家状态
            if (handler.getAllStates) {
              minigameNs.to(roomId).emit('game_state', handler.getAllStates(room.gameState))
            }
            // 检查是否时间到
            const elapsed = Date.now() - room.startTime
            if (elapsed >= GAME_DURATION) {
              clearInterval(room.tickTimer)
              room.tickTimer = null
              room.gameState.status = 'finished'
              finishGame(room, minigameNs)
            }
          }, TICK_INTERVAL)
        } else {
          // 其他游戏：设置自动超时
          const timeoutMs = (handler.duration || 60) * 1000
          setTimeout(() => {
            if (room.status === 'playing') {
              finishGame(room, minigameNs)
            }
          }, timeoutMs)
        }
      }
    }, 1000)

    callback({ success: true })
  }

  minigameNs.getRoom = (roomId) => activeRooms.get(roomId) || null

  minigameNs.getActiveRoomForType = (gameType) => {
    for (const [, room] of activeRooms) {
      if (room.gameType === gameType && room.status !== 'finished') {
        return room
      }
    }
    return null
  }

  minigameNs.cleanupRoom = (roomId) => {
    const room = activeRooms.get(roomId)
    if (room) {
      room.cleanup()
      activeRooms.delete(roomId)
    }
  }
}

function finishGame(room, minigameNs) {
  if (room.status === 'finished') return
  room.status = 'finished'

  const handler = getGame(room.minigameId)
  if (!handler) return

  const winnerId = handler.computeWinner(room.gameState)
  const participant = room.participants.find(p => p.playerId === winnerId)
  room.winner = participant
    ? { playerId: participant.playerId, playerName: participant.playerName }
    : null

  // 收集分数
  const scores = {}
  if (room.gameState) {
    if (room.gameState.scores) {
      // click-speed
      Object.assign(scores, room.gameState.scores)
    } else if (room.gameState.playerStates) {
      // 其他游戏
      for (const [pid, ps] of Object.entries(room.gameState.playerStates)) {
        if (ps.totalScore !== undefined) {
          scores[pid] = ps.totalScore
        } else if (ps.timeInZone !== undefined) {
          scores[pid] = ps.timeInZone
        } else if (ps.finishTime && ps.startTime) {
          scores[pid] = ps.finishTime - ps.startTime
        }
      }
    }
  }

  minigameNs.to(room.roomId).emit('game_finished', {
    winner: room.winner,
    scores
  })

  // 清理 tick 定时器
  room.cleanup()

  console.log(`[BBMinigame] Game finished in room ${room.roomId}, winner: ${room.winner?.playerName}`)
}

module.exports = { initBBMinigameSocket }
