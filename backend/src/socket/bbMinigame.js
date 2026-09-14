/**
 * Big Brother 小游戏 Socket.IO 命名空间
 * 处理小游戏的实时通信：房间管理、游戏开始、玩家操作、结果广播
 */
const jwt = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')
const { getGame } = require('../games/bigbrother/minigames/loadAll')
const { loadCustomGame, createCustomGameHandler, getCustomHandlerId } = require('../games/bigbrother/minigames/customGame')
const { startSession, recordEvent, finalizeSession, listLiveSessions } = require('../games/bigbrother/minigameReplay')

// 活跃游戏房间（内存管理）
const activeRooms = new Map() // roomId -> GameRoom

class GameRoom {
  constructor(roomId, gameType, minigameId, participants, targetScore) {
    this.roomId = roomId
    this.gameType = gameType      // 'hoh' | 'veto'
    this.minigameId = minigameId
    this.participants = participants // [{ playerId, playerName, avatar, connected }]
    this.targetScore = targetScore || null   // 达成即胜的目标值（可选，依游戏而定：分/时长/题数）
    this.status = 'waiting'       // waiting | countdown | playing | finished
    this.startTime = null
    this.gameState = null         // 小游戏内部状态
    this.winner = null
    this.winners = []             // 胜者列表（支持并列）
    this.manualWinnerId = null    // 管理员手动指定的胜者
    this.tickTimer = null         // balance-bar 的定时器
    this.handler = null           // 自定义游戏 handler 缓存
    this.minigameName = ''
    this.category = ''
    this.roundIndex = null
    this.roundId = ''
    this.replaySession = null     // 对局记录/复盘 session
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

// 解析游戏 handler：先查静态注册表，再查自定义游戏
async function resolveGameHandler(minigameId, room) {
  // 先检查房间缓存的 handler（自定义游戏在房间创建时加载）
  if (room && room.handler) return room.handler

  // 静态注册表
  let handler = getGame(minigameId)
  if (handler) return handler

  // 自定义游戏
  if (minigameId && minigameId.startsWith('custom-')) {
    const gameId = minigameId.replace(/^custom-/, '')
    const gameDef = await loadCustomGame(gameId)
    if (gameDef) {
      handler = createCustomGameHandler(gameDef)
      if (room) room.handler = handler // 缓存到房间
      return handler
    }
  }

  return null
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

      // 管理员可旁观任何房间；房客必须是参与者
      const isAdmin = socket.user.role === 'admin'
      const participant = room.getParticipant(userId)
      if (!isAdmin && !participant) {
        socket.emit('game_error', { message: '你不在本轮比赛参与者名单中' })
        return
      }

      socket.join(roomId)
      if (participant) room.setConnected(userId, true)
      else socket.isAdminObserver = true
      socket.roomId = roomId

      console.log(`[BBMinigame] ${userName} joined room ${roomId}${isAdmin ? ' (observer)' : ''}`)

      // 发送当前状态
      if (room.status === 'playing' && room.gameState) {
        resolveGameHandler(room.minigameId, room).then(handler => {
          if (isAdmin && handler && handler.getAllStates) {
            socket.emit('game_progress', buildProgress(room))
          } else if (handler && handler.getState) {
            socket.emit('game_state', handler.getState(room.gameState, userId))
          }
        }).catch(() => {})
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
    socket.on('game_action', async (data) => {
      const roomId = data?.roomId || socket.roomId
      if (!roomId) return

      const room = activeRooms.get(roomId)
      if (!room) return
      if (room.status !== 'playing') return

      const handler = await resolveGameHandler(room.minigameId, room)
      if (!handler) return

      const result = handler.handleAction(room.gameState, userId, data.action, { isAdmin: socket.user.role === 'admin' })
      if (!result || !result.updated) return

      // 记录操作事件（跳过高频 tick）
      if (data.action && data.action.type !== 'tick') {
        const player = room.getParticipant(userId)
        const pname = player?.playerName || userName
        let text = ''
        let extra = null
        try {
          const d = handler.describeEvent ? handler.describeEvent(room.gameState, userId, data.action, result.result) : null
          if (d && typeof d === 'object') { text = d.text || ''; extra = d.data || null }
          else if (typeof d === 'string') text = d
        } catch (e) { /* ignore */ }
        if (!text) text = defaultDescribe(pname, data.action)
        recordAndBroadcast(minigameNs, room, {
          playerId: userId,
          playerName: pname,
          type: data.action.type,
          text,
          data: { action: data.action, result: result.result || null, extra }
        })
      }
      // 处理器内部事件（回合结算/淘汰等）
      drainHandlerEvents(minigameNs, room, handler)

      // 发送操作结果给该玩家
      const playerState = handler.getState
        ? handler.getState(room.gameState, userId)
        : null
      socket.emit('game_state', { ...playerState, actionResult: result.result })

      // 需要全员同步的游戏（如少数决/顺序记忆），把最新状态推给其他参与者
      if (handler.broadcastState && handler.getState) {
        minigameNs.fetchSockets().then(namespaceSockets => {
          for (const s of namespaceSockets) {
            const uid = s.user?.userId || s.user?.id
            if (uid && uid !== userId && room.getParticipant(uid) && s.rooms.has(roomId)) {
              const ps = handler.getState(room.gameState, uid)
              if (ps) s.emit('game_state', ps)
            }
          }
        }).catch(() => {})
      }

      // 广播所有玩家的实时进度（管理员观察）
      broadcastProgress(room, minigameNs)

      // 目标判定：达到管理员设定的目标即结束，该玩家胜出
      if (handler.checkTarget && handler.checkTarget(room.gameState, userId, room.targetScore)) {
        room.manualWinnerId = userId
        finishGame(room, minigameNs)
        return
      }

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
  minigameNs.createRoom = (gameType, minigameId, participants, targetScore, meta) => {
    const roomId = uuidv4()
    const room = new GameRoom(roomId, gameType, minigameId, participants.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      avatar: p.avatar || null,
      connected: false
    })), targetScore)
    if (meta) {
      room.roundIndex = meta.roundIndex ?? null
      room.roundId = meta.roundId || ''
      room.minigameName = meta.name || ''
    }
    activeRooms.set(roomId, room)
    startSession(room)
    return room
  }

  minigameNs.startGame = async (roomId, callback) => {
    const room = activeRooms.get(roomId)
    if (!room) return callback({ success: false, error: '房间不存在' })

    const handler = await resolveGameHandler(room.minigameId, room)
    if (!handler) return callback({ success: false, error: '小游戏未找到' })

    // 复盘 session：补充游戏名称/分类
    room.minigameName = handler.name || room.minigameId
    room.category = handler.category || ''
    if (!room.replaySession) startSession(room)
    room.replaySession.minigameName = room.minigameName
    room.replaySession.category = room.category
    room.replaySession.targetScore = room.targetScore ?? null

    // 初始化游戏状态（支持异步加载题目池）
    const participants = room.participants.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName
    }))
    let gameState
    if (handler.loadQuestions) {
      const pool = await handler.loadQuestions()
      gameState = handler.init(participants, pool)
    } else {
      gameState = handler.init(participants)
    }
    room.gameState = gameState
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
        if (room.gameState) room.gameState.targetScore = room.targetScore
        if (room.gameState) room.gameState.status = 'playing'
        minigameNs.to(roomId).emit('game_started', { startTime: room.startTime })
        recordAndBroadcast(minigameNs, room, {
          type: 'game_start',
          text: `游戏开始：${room.minigameName}（${room.participants.length}人）`,
          data: {
            minigameId: room.minigameId,
            targetScore: room.targetScore ?? null,
            participants: room.participants.map(p => ({ playerId: p.playerId, playerName: p.playerName }))
          }
        })

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
            // 广播实时进度给管理员观察 + 所有玩家（balance-bar 状态每个人独立，走各自的 game_state）
            broadcastProgress(room, minigameNs)
            minigameNs.to(roomId).emit('game_state', handler.getAllStates ? handler.getAllStates(room.gameState) : {})
            // 目标判定：任一人达到目标时长即提前结束
            if (handler.checkTarget && room.targetScore) {
              for (const pid of Object.keys(room.gameState.playerStates)) {
                if (handler.checkTarget(room.gameState, pid, room.targetScore)) {
                  clearInterval(room.tickTimer)
                  room.tickTimer = null
                  room.manualWinnerId = pid
                  finishGame(room, minigameNs)
                  return
                }
              }
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
          // 需要服务端 tick 的对战模式（自定义游戏）
          if (handler.needsServerTick) {
            startServerTick(room, handler, minigameNs)
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

  // 手动指定胜者（管理员），立即结束游戏
  minigameNs.setWinner = (roomId, playerId, playerName) => {
    const room = activeRooms.get(roomId)
    if (!room) return { success: false, error: '房间不存在' }
    const participant = room.getParticipant(playerId)
    if (!participant) return { success: false, error: '该选手不在房间参与者中' }
    room.manualWinnerId = playerId
    if (playerName) participant.playerName = playerName
    room.winner = { playerId, playerName: participant.playerName }
    finishGame(room, minigameNs)
    return { success: true, winner: room.winner }
  }

  // 管理员暂停游戏
  minigameNs.pauseGame = (roomId) => {
    const room = activeRooms.get(roomId)
    if (!room) return { success: false, error: '房间不存在' }
    if (room.status !== 'playing') return { success: false, error: '游戏未在进行中' }

    room.status = 'paused'
    if (room.gameState) room.gameState.status = 'paused'

    // 停止 balance-bar tick
    if (room.tickTimer) {
      clearInterval(room.tickTimer)
      room.tickTimer = null
    }

    // 记录暂停时间
    room.pausedAt = Date.now()

    minigameNs.to(roomId).emit('game_paused', { status: 'paused' })
    broadcastProgress(room, minigameNs)
    return { success: true }
  }

  // 管理员恢复游戏
  minigameNs.resumeGame = (roomId) => {
    const room = activeRooms.get(roomId)
    if (!room) return { success: false, error: '房间不存在' }
    if (room.status !== 'paused') return { success: false, error: '游戏未暂停' }

    // 计算暂停时长并调整开始时间
    if (room.pausedAt && room.startTime) {
      const pauseDuration = Date.now() - room.pausedAt
      room.startTime += pauseDuration
      if (room.gameState) room.gameState.startTime = room.startTime
    }
    room.pausedAt = null

    room.status = 'playing'
    if (room.gameState) room.gameState.status = 'playing'

    // 重启 balance-bar tick
    if (room.minigameId === 'balance-bar') {
      const balanceBar = require('../games/bigbrother/minigames/balanceBar')
      const handler = room.handler || getGame(room.minigameId)
      const { TICK_INTERVAL } = balanceBar
      room.tickTimer = setInterval(() => {
        if (room.status !== 'playing') {
          clearInterval(room.tickTimer)
          room.tickTimer = null
          return
        }
        handler.tick(room.gameState)
        broadcastProgress(room, minigameNs)
        minigameNs.to(roomId).emit('game_state', handler.getAllStates ? handler.getAllStates(room.gameState) : {})
        if (handler.checkTarget && room.targetScore) {
          for (const pid of Object.keys(room.gameState.playerStates)) {
            if (handler.checkTarget(room.gameState, pid, room.targetScore)) {
              clearInterval(room.tickTimer)
              room.tickTimer = null
              room.manualWinnerId = pid
              finishGame(room, minigameNs)
              return
            }
          }
        }
        const elapsed = Date.now() - room.startTime
        if (elapsed >= (handler.duration || 60) * 1000) {
          clearInterval(room.tickTimer)
          room.tickTimer = null
          room.gameState.status = 'finished'
          finishGame(room, minigameNs)
        }
      }, TICK_INTERVAL)
    } else if (room.handler && room.handler.needsServerTick) {
      startServerTick(room, room.handler, minigameNs)
    }

    minigameNs.to(roomId).emit('game_resumed', { status: 'playing' })
    broadcastProgress(room, minigameNs)
    return { success: true }
  }

  // 管理员停止游戏（无胜者）
  minigameNs.stopGame = (roomId) => {
    const room = activeRooms.get(roomId)
    if (!room) return { success: false, error: '房间不存在' }
    if (room.status === 'finished') return { success: false, error: '游戏已结束' }

    room.status = 'finished'
    room.winner = null

    // 停止 balance-bar tick
    if (room.tickTimer) {
      clearInterval(room.tickTimer)
      room.tickTimer = null
    }

    minigameNs.to(roomId).emit('game_stopped', { status: 'finished', winner: null })
    broadcastProgress(room, minigameNs)
    recordAndBroadcast(minigameNs, room, { type: 'game_stop', text: '管理员停止了游戏', data: {} })
    finalizeSession(room, { status: 'stopped' }).catch(() => {})
    return { success: true }
  }

  // 获取房间实时进度（管理员轮询兜底）
  minigameNs.getRoomProgress = (roomId) => {
    const room = activeRooms.get(roomId)
    if (!room) return null
    return buildProgress(room)
  }

  // 列出所有活跃房间（管理员观战用）
  minigameNs.listActiveRooms = () => {
    return Array.from(activeRooms.values()).map(room => ({
      roomId: room.roomId,
      gameType: room.gameType,
      minigameId: room.minigameId,
      minigameName: room.minigameName || room.minigameId,
      category: room.category || '',
      status: room.status,
      targetScore: room.targetScore,
      roundIndex: room.roundIndex,
      roundId: room.roundId,
      participants: room.participants.map(p => ({ playerId: p.playerId, playerName: p.playerName, connected: p.connected })),
      winner: room.winner,
      eventCount: room.replaySession ? room.replaySession.events.length : 0,
      progress: buildProgress(room)
    }))
  }

  // 当前进行中的对局记录（内存）
  minigameNs.getLiveSessions = () => listLiveSessions()
}

// 构建进度汇总数据（管理员观察用）
function buildProgress(room) {
  // 优先使用房间缓存的 handler（自定义游戏），再查静态注册表
  const handler = room.handler || getGame(room.minigameId)
  const allStates = handler && handler.getAllStates ? handler.getAllStates(room.gameState) : {}
  return {
    roomId: room.roomId,
    gameType: room.gameType,
    minigameId: room.minigameId,
    status: room.status,
    targetScore: room.targetScore,
    winner: room.winner,
    winners: room.winners || [],
    participants: room.participants.map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      connected: p.connected
    })),
    states: allStates
  }
}

// 广播实时进度到房间（管理员观察 + 供前端刷新）
function broadcastProgress(room, minigameNs) {
  if (!room || room.status === 'finished') return
  minigameNs.to(room.roomId).emit('game_progress', buildProgress(room))
}

// ===== 对局复盘：事件记录与广播 =====
function fmtAnswer(v) {
  if (v === null || v === undefined || v === '') return '（空）'
  return String(v)
}

function defaultDescribe(playerName, action) {
  const t = action && action.type
  if (!t) return `${playerName} 执行操作`
  switch (t) {
    case 'answer': return `${playerName} 作答：${fmtAnswer(action.answer)}`
    case 'submit_all': return `${playerName} 提交全部答案`
    case 'choose': return `${playerName} 选择：${action.choice === 0 ? 'A' : action.choice === 1 ? 'B' : action.choice}`
    case 'roll': return `${playerName} 掷骰 ${action.count} 个`
    case 'flip': return `${playerName} 翻牌 #${action.index}`
    case 'move': return `${playerName} 移动方块 #${action.tileIndex}`
    case 'mark': return `${playerName} 标记 #${action.index}`
    case 'submit': return `${playerName} 提交答案`
    case 'click': return `${playerName} 点击`
    case 'hold': return `${playerName} ${action.holding ? '按住' : '松开'}`
    case 'check': return `${playerName} 判定`
    case 'start': return `${playerName} 准备开始`
    case 'pick': return `${playerName} 选择淘汰目标`
    case 'pick_pair': return `${playerName} 指定对决`
    default: return `${playerName} ${t}`
  }
}

function recordAndBroadcast(minigameNs, room, ev) {
  const event = recordEvent(room, ev)
  if (event) minigameNs.to(room.roomId).emit('game_event', event)
  return event
}

function drainHandlerEvents(minigameNs, room, handler) {
  if (!handler || !handler.takeReplayEvents) return
  try {
    const evs = handler.takeReplayEvents(room.gameState) || []
    for (const e of evs) recordAndBroadcast(minigameNs, room, e)
  } catch (e) { /* ignore */ }
}

// 推送每个参赛者的个性化状态
function pushPlayerStates(room, handler, minigameNs) {
  if (!handler || !handler.getState) return
  minigameNs.fetchSockets().then(namespaceSockets => {
    for (const s of namespaceSockets) {
      const uid = s.user?.userId || s.user?.id
      if (uid && room.getParticipant(uid) && s.rooms.has(room.roomId)) {
        const ps = handler.getState(room.gameState, uid)
        if (ps) s.emit('game_state', ps)
      }
    }
  }).catch(() => {})
}

// 启动服务端 tick（对战模式）
function startServerTick(room, handler, minigameNs) {
  if (room.tickTimer) return
  const ms = handler.serverTickMs || 500
  room.tickTimer = setInterval(() => {
    if (room.status !== 'playing') return
    try { handler.tick(room.gameState) } catch (e) { console.error('[BBMinigame] tick error', e) }
    drainHandlerEvents(minigameNs, room, handler)
    pushPlayerStates(room, handler, minigameNs)
    broadcastProgress(room, minigameNs)
    if (handler.isFinished && handler.isFinished(room.gameState)) {
      clearInterval(room.tickTimer)
      room.tickTimer = null
      finishGame(room, minigameNs)
    }
  }, ms)
}

function finishGame(room, minigameNs) {
  if (room.status === 'finished') return
  room.status = 'finished'

  // 优先使用房间缓存的 handler（自定义游戏），再查静态注册表
  const handler = room.handler || getGame(room.minigameId)
  if (!handler) return

  // 管理员手动指定胜者优先；否则按游戏规则计算
  let winnerId = room.manualWinnerId || null
  if (!winnerId && handler.computeWinner) {
    winnerId = handler.computeWinner(room.gameState)
  }
  const participant = room.participants.find(p => p.playerId === winnerId)
  room.winner = participant
    ? { playerId: participant.playerId, playerName: participant.playerName }
    : null

  // 支持多胜者（并列）：优先使用 handler.getWinners
  let winnerIds = []
  if (room.manualWinnerId) {
    winnerIds = [room.manualWinnerId]
  } else if (handler.getWinners) {
    winnerIds = handler.getWinners(room.gameState) || []
  } else if (winnerId) {
    winnerIds = [winnerId]
  }
  room.winners = winnerIds
    .map(id => room.participants.find(p => p.playerId === id))
    .filter(Boolean)
    .map(p => ({ playerId: p.playerId, playerName: p.playerName }))

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
    winners: room.winners,
    scores
  })

  minigameNs.to(room.roomId).emit('game_progress', buildProgress(room))

  // 记录结束事件并落库复盘
  recordAndBroadcast(minigameNs, room, {
    type: 'game_end',
    text: room.winner ? `游戏结束，胜者：${room.winner.playerName}` : '游戏结束（无胜者）',
    data: { winner: room.winner, winners: room.winners, scores }
  })
  finalizeSession(room, { winner: room.winner, winners: room.winners, scores, status: 'finished' }).catch(() => {})

  room.cleanup()

  console.log(`[BBMinigame] Game finished in room ${room.roomId}, winners: ${room.winners.map(w=>w.playerName).join(',')}`)
}

module.exports = { initBBMinigameSocket }
