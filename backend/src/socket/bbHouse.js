/**
 * BB House Socket.IO 实时通信
 * 命名空间: /bigbrother-house
 * 功能: 房间聊天、移动通知、后院门状态、HOH 邀请
 */
const jwt = require('jsonwebtoken')
const BBPlayerLocation = require('../games/bigbrother/models/BBPlayerLocation')
const BBHouseguest = require('../games/bigbrother/models/BBHouseguest')
const BBChatMessage = require('../games/bigbrother/models/BBChatMessage')
const BBHouseRoom = require('../games/bigbrother/models/BBHouseRoom')
const BBHouseDoor = require('../games/bigbrother/models/BBHouseDoor')
const BBHousePassage = require('../games/bigbrother/models/BBHousePassage')
const BBSeason = require('../games/bigbrother/models/BBSeason')
const { getCurrentHoh } = require('../games/bigbrother/houseMap')
const locationHistory = require('../games/bigbrother/locationHistory')

const JWT_SECRET = process.env.JWT_SECRET || 'bigbrother_secret_key'
const gameId = 'bigbrother'

let bbHouseNamespace = null

// 待处理的 HOH 邀请（targetPlayerId -> { hohId, hohName, at }）
const pendingInvites = new Map()

function getNamespace() { return bbHouseNamespace }

// 头像查询
async function getAvatarMap() {
  const guests = await BBHouseguest.find({ gameId })
  const map = {}
  for (const g of guests) map[g.id] = g.avatar || null
  return map
}
async function getAvatar(playerId) {
  const g = await BBHouseguest.findOne({ id: playerId, gameId })
  return g?.avatar || null
}

function initBBHouseSocket(io) {
  bbHouseNamespace = io.of('/bigbrother-house')

  // JWT 认证中间件
  bbHouseNamespace.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token
      if (!token) return next(new Error('未提供认证令牌'))
      const decoded = jwt.verify(token, JWT_SECRET)
      socket.userId = decoded.userId
      socket.userName = decoded.name || ''
      socket.userRole = decoded.role || 'houseguest'
      next()
    } catch (e) {
      next(new Error('认证失败'))
    }
  })

  bbHouseNamespace.on('connection', async (socket) => {
    // 用数据库中的房客姓名/头像覆盖 token 中可能缺失的信息
    try {
      const guest = await BBHouseguest.findOne({ id: socket.userId, gameId })
      if (guest?.name) socket.userName = guest.name
    } catch (e) { /* ignore */ }
    console.log(`[BBHouse] Player connected: ${socket.userName} (${socket.userId})`)

    try {
      // 获取玩家当前位置
      const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
      const currentRoomId = loc?.currentRoomId || 'living_room'

      // 确保位置历史有当前区间
      await locationHistory.ensureOpenInterval(socket.userId, socket.userName, currentRoomId, loc?.enteredAt)

      // 加入当前房间的 Socket.IO room
      socket.join(`room:${currentRoomId}`)
      socket.currentRoomId = currentRoomId

      // 发送当前房间的历史消息（仅“发送时我在该房间”的消息，最近 50 条）
      const allMessages = await BBChatMessage.find({ gameId, chatType: 'room', roomId: currentRoomId })
      allMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      const visible = await locationHistory.filterVisibleMessages(socket.userId, currentRoomId, allMessages)
      const recent = visible.slice(-50)
      socket.emit('house:history', { roomId: currentRoomId, messages: recent.map(m => m.toObject()) })

      // 发送房间内玩家列表
      await broadcastRoomPresence(currentRoomId)

      // 通知房间有人进入
      bbHouseNamespace.to(`room:${currentRoomId}`).emit('house:player-joined', {
        roomId: currentRoomId,
        playerName: socket.userName
      })
    } catch (e) {
      console.error('[BBHouse] Connection init error:', e)
    }

    // === 房间聊天 ===
    socket.on('house:send-message', async ({ roomId, content }) => {
      try {
        if (!content || !content.trim()) return

        // 校验玩家是否在该房间
        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        if (!loc || loc.currentRoomId !== roomId) {
          return socket.emit('house:error', { error: '你不在这个房间' })
        }

        // 保存消息
        const avatar = await getAvatar(socket.userId)
        const msg = new BBChatMessage({
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          senderId: socket.userId,
          senderName: socket.userName,
          senderRole: socket.userRole,
          senderAvatar: avatar,
          content: content.trim(),
          chatType: 'room',
          roomId,
          gameId
        })
        await msg.save()

        // 广播给同房间所有人
        bbHouseNamespace.to(`room:${roomId}`).emit('house:new-message', {
          roomId,
          message: msg.toObject()
        })
      } catch (e) {
        console.error('[BBHouse] Send message error:', e)
        socket.emit('house:error', { error: '发送失败' })
      }
    })

    // === 加载更多历史消息 ===
    socket.on('house:load-more', async ({ roomId, before }) => {
      try {
        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        if (!loc || loc.currentRoomId !== roomId) return

        const all = await BBChatMessage.find({ gameId, chatType: 'room', roomId })
        all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        // 仅可见消息（发送时我在该房间）
        const visible = await locationHistory.filterVisibleMessages(socket.userId, roomId, all)
        let older
        if (before) {
          const idx = visible.findIndex(m => new Date(m.createdAt).getTime() < new Date(before).getTime())
          older = idx >= 0 ? visible.slice(idx, idx + 30) : []
        } else {
          older = visible.slice(0, 30)
        }
        older = older.slice().reverse()

        socket.emit('house:older-messages', { roomId, messages: older.map(m => m.toObject()) })
      } catch (e) {
        console.error('[BBHouse] Load more error:', e)
      }
    })

    // === 房间移动通知（由 REST API 触发，通过 socket 广播） ===
    socket.on('house:moved', async ({ oldRoomId, newRoomId }) => {
      try {
        // 离开旧房间
        if (oldRoomId) {
          socket.leave(`room:${oldRoomId}`)
          bbHouseNamespace.to(`room:${oldRoomId}`).emit('house:player-left', {
            roomId: oldRoomId,
            playerName: socket.userName
          })
          await broadcastRoomPresence(oldRoomId)
        }

        // 进入新房间
        if (newRoomId) {
          socket.join(`room:${newRoomId}`)
          socket.currentRoomId = newRoomId
          // 记录位置历史（消息可见性核心）
          await locationHistory.recordMove(socket.userId, socket.userName, oldRoomId, newRoomId)
          bbHouseNamespace.to(`room:${newRoomId}`).emit('house:player-joined', {
            roomId: newRoomId,
            playerName: socket.userName
          })
          await broadcastRoomPresence(newRoomId)

          // 发送新房间可见历史消息
          const allMessages = await BBChatMessage.find({ gameId, chatType: 'room', roomId: newRoomId })
          allMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          const visible = await locationHistory.filterVisibleMessages(socket.userId, newRoomId, allMessages)
          socket.emit('house:history', { roomId: newRoomId, messages: visible.slice(-50).map(m => m.toObject()) })
        }
      } catch (e) {
        console.error('[BBHouse] Moved event error:', e)
      }
    })

    // === HOH 邀请 ===
    socket.on('house:invite-player', async ({ targetPlayerId }) => {
      try {
        const hoh = await getCurrentHoh()
        if (!hoh || hoh.id !== socket.userId) {
          return socket.emit('house:error', { error: '仅 HOH 可邀请' })
        }

        pendingInvites.set(targetPlayerId, {
          hohId: socket.userId,
          hohName: socket.userName,
          at: Date.now()
        })

        // 找到目标玩家的 socket
        for (const [, s] of bbHouseNamespace.sockets) {
          if (s.userId === targetPlayerId) {
            s.emit('house:invite-received', {
              hohName: socket.userName,
              hohId: socket.userId,
              roomId: 'hoh_room'
            })
            break
          }
        }
      } catch (e) {
        console.error('[BBHouse] Invite error:', e)
      }
    })

    // === 拒绝 HOH 邀请（通知 HOH） ===
    socket.on('house:decline-invite', async ({ hohId }) => {
      try {
        pendingInvites.delete(socket.userId)
        if (!hohId) return
        for (const [, s] of bbHouseNamespace.sockets) {
          if (s.userId === hohId) {
            s.emit('house:invite-declined', {
              playerId: socket.userId,
              playerName: socket.userName
            })
            break
          }
        }
      } catch (e) {
        console.error('[BBHouse] Decline invite error:', e)
      }
    })

    // === 撤销 HOH 邀请（HOH 取消已发出的邀请） ===
    socket.on('house:cancel-invite', async ({ targetPlayerId }) => {
      try {
        const hoh = await getCurrentHoh()
        if (!hoh || hoh.id !== socket.userId) {
          return socket.emit('house:error', { error: '仅 HOH 可撤销邀请' })
        }
        if (!targetPlayerId) return
        pendingInvites.delete(targetPlayerId)
        // 通知被邀请者：邀请已撤销
        for (const [, s] of bbHouseNamespace.sockets) {
          if (s.userId === targetPlayerId) {
            s.emit('house:invite-cancelled', { hohId: socket.userId })
            break
          }
        }
        // 回执给 HOH
        socket.emit('house:invite-cancelled', { playerId: targetPlayerId })
      } catch (e) {
        console.error('[BBHouse] Cancel invite error:', e)
      }
    })

    // === 接受 HOH 邀请 ===
    socket.on('house:accept-invite', async () => {
      try {
        if (!pendingInvites.has(socket.userId)) {
          return socket.emit('house:error', { error: '没有待处理的 HOH 邀请' })
        }
        pendingInvites.delete(socket.userId)

        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        const oldRoomId = loc?.currentRoomId || 'living_room'

        // 移动到 HOH Room
        if (loc) {
          loc.currentRoomId = 'hoh_room'
          loc.enteredAt = new Date().toISOString()
          await loc.save()
        } else {
          const newLoc = new BBPlayerLocation({
            id: socket.userId, playerId: socket.userId, playerName: socket.userName,
            currentRoomId: 'hoh_room', enteredAt: new Date().toISOString(), gameId
          })
          await newLoc.save()
        }

        const hg = await BBHouseguest.findOne({ id: socket.userId, gameId })
        if (hg) {
          hg.currentRoomId = 'hoh_room'
          await hg.save()
        }

        // 广播旧房间离开
        socket.leave(`room:${oldRoomId}`)
        bbHouseNamespace.to(`room:${oldRoomId}`).emit('house:player-left', {
          roomId: oldRoomId, playerName: socket.userName
        })
        await broadcastRoomPresence(oldRoomId)

        // 进入新房间
        socket.join(`room:hoh_room`)
        socket.currentRoomId = 'hoh_room'
        await locationHistory.recordMove(socket.userId, socket.userName, oldRoomId, 'hoh_room')
        bbHouseNamespace.to(`room:hoh_room`).emit('house:player-joined', {
          roomId: 'hoh_room', playerName: socket.userName
        })
        await broadcastRoomPresence('hoh_room')

        // 通知 HOH：邀请已被接受
        const hoh = await getCurrentHoh()
        if (hoh) {
          for (const [, s] of bbHouseNamespace.sockets) {
            if (s.userId === hoh.id) {
              s.emit('house:invite-accepted', {
                playerId: socket.userId,
                playerName: socket.userName
              })
              break
            }
          }
        }

        const allMessages = await BBChatMessage.find({ gameId, chatType: 'room', roomId: 'hoh_room' })
        allMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        const visible = await locationHistory.filterVisibleMessages(socket.userId, 'hoh_room', allMessages)
        socket.emit('house:history', { roomId: 'hoh_room', messages: visible.slice(-50).map(m => m.toObject()) })
      } catch (e) {
        console.error('[BBHouse] Accept invite error:', e)
      }
    })

    // === 后院门状态监听（REST 触发后通过 socket 广播） ===
    // 这个由 REST API 的 admin/door 端点调用 broadcastDoorUpdate 触发

    // === HOH 房门控制（房内房客 或 门外的 HOH） ===
    socket.on('house:hoh-door-set', async ({ isOpen }) => {
      try {
        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        const hoh = await getCurrentHoh()
        const isHoh = !!(hoh && hoh.id === socket.userId)
        const canControl = loc && (loc.currentRoomId === 'hoh_room' || (isHoh && loc.currentRoomId === 'hoh_door'))
        if (!canControl) {
          return socket.emit('house:error', { error: '无权控制 HOH 房门' })
        }
        const door = await BBHouseDoor.findOne({ id: 'hoh_door', gameId })
        if (!door) return
        door.isOpen = !!isOpen
        door.updatedAt = new Date().toISOString()
        await door.save()
        broadcastDoorUpdate('hoh_door', door.isOpen)
      } catch (e) {
        console.error('[BBHouse] hoh-door-set error:', e)
      }
    })

    // === 按门铃（门外房客通知房内的人） ===
    socket.on('house:hoh-doorbell', async () => {
      try {
        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        if (!loc || loc.currentRoomId !== 'hoh_door') {
          return socket.emit('house:error', { error: '你不在 HOH 房门口' })
        }
        const door = await BBHouseDoor.findOne({ id: 'hoh_door', gameId })
        if (door && door.isOpen) {
          return socket.emit('house:error', { error: '门是开着的，直接进入即可' })
        }
        bbHouseNamespace.to('room:hoh_room').emit('house:hoh-doorbell', {
          playerId: socket.userId,
          playerName: socket.userName
        })
        socket.emit('house:hoh-doorbell-sent', {})
      } catch (e) {
        console.error('[BBHouse] hoh-doorbell error:', e)
      }
    })

    // === 断开连接 ===
    socket.on('disconnect', async () => {
      try {
        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        if (loc) {
          bbHouseNamespace.to(`room:${loc.currentRoomId}`).emit('house:player-left', {
            roomId: loc.currentRoomId,
            playerName: socket.userName
          })
          await broadcastRoomPresence(loc.currentRoomId)
        }
      } catch (e) {
        console.error('[BBHouse] Disconnect error:', e)
      }
      console.log(`[BBHouse] Player disconnected: ${socket.userName}`)
    })
  })

  console.log('[BBHouse] Socket.IO namespace /bigbrother-house initialized')
}

// 广播房间内玩家列表
async function broadcastRoomPresence(roomId) {
  if (!bbHouseNamespace) return
  const locations = await BBPlayerLocation.find({ currentRoomId: roomId, gameId })
  const avatars = await getAvatarMap()
  const players = locations.map(l => ({
    playerId: l.playerId,
    playerName: l.playerName,
    avatar: avatars[l.playerId] || null
  }))
  bbHouseNamespace.to(`room:${roomId}`).emit('house:room-presence', {
    roomId,
    players
  })
  // 人数变化时同步 House Monitor
  broadcastMonitorUpdate()
}

// 广播 House Monitor（实时人数）给当前 HOH 与管理员（仅人数，不含身份）
async function broadcastMonitorUpdate() {
  if (!bbHouseNamespace) return
  try {
    const hoh = await getCurrentHoh()
    const rooms = await BBHouseRoom.find({ gameId })
    const result = []
    for (const room of rooms) {
      if (room.type === 'hidden') continue // Diary Room 不参与监控
      const count = await BBPlayerLocation.countDocuments({ currentRoomId: room.id, gameId })
      result.push({ roomId: room.id, roomName: room.name, icon: room.icon, count })
    }
    for (const [, s] of bbHouseNamespace.sockets) {
      if (s.userRole === 'admin') {
        s.emit('house:monitor-update', result)
        continue
      }
      if (hoh && s.userId === hoh.id) {
        // HOH 仅身处 HOH 房时才能收到监控
        const loc = await BBPlayerLocation.findOne({ playerId: s.userId, gameId })
        if (loc && loc.currentRoomId === 'hoh_room') {
          s.emit('house:monitor-update', result)
        }
      }
    }
  } catch (e) {
    console.error('[BBHouse] Monitor update error:', e)
  }
}

// 广播门状态（仅特定房间可见）
async function broadcastDoorUpdate(doorId, isOpen) {
  if (!bbHouseNamespace) return
  const payload = { doorId, isOpen }
  if (doorId === 'backyard_door') {
    bbHouseNamespace.to('room:living_room').emit('house:door-update', payload)
    bbHouseNamespace.to('room:backyard').emit('house:door-update', payload)
  } else if (doorId === 'hoh_door') {
    bbHouseNamespace.to('room:hoh_room').emit('house:door-update', payload)
    bbHouseNamespace.to('room:hoh_door').emit('house:door-update', payload)
  } else {
    bbHouseNamespace.emit('house:door-update', payload)
  }
}

// 取出并清除指定玩家的待处理邀请（供 REST accept-invite 使用）
function takePendingInvite(targetPlayerId) {
  const invite = pendingInvites.get(targetPlayerId) || null
  if (invite) pendingInvites.delete(targetPlayerId)
  return invite
}

// 广播强制移动通知（供 REST API 调用）
function notifyForceMove(playerId, targetRoomId, reason) {
  if (!bbHouseNamespace) return
  for (const [, s] of bbHouseNamespace.sockets) {
    if (s.userId === playerId) {
      s.emit('house:force-moved', { targetRoomId, reason })
      break
    }
  }
}

// 管理员强制移动/清空后院：服务端权威地切换玩家 socket 房间并实时广播
async function movePlayerSockets(playerId, oldRoomId, newRoomId, reason = '管理员移动') {
  if (!bbHouseNamespace) return
  const hg = await BBHouseguest.findOne({ id: playerId, gameId })
  // 记录位置历史（消息可见性核心）
  await locationHistory.recordMove(playerId, hg?.name || '', oldRoomId, newRoomId)
  const targets = []
  for (const [, s] of bbHouseNamespace.sockets) {
    if (s.userId === playerId) targets.push(s)
  }

  // 预先取该玩家在新房间可见的历史
  const allMessages = await BBChatMessage.find({ gameId, chatType: 'room', roomId: newRoomId })
  allMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const visible = await locationHistory.filterVisibleMessages(playerId, newRoomId, allMessages)

  for (const s of targets) {
    s.leave(`room:${oldRoomId}`)
    if (oldRoomId) {
      bbHouseNamespace.to(`room:${oldRoomId}`).emit('house:player-left', {
        roomId: oldRoomId, playerName: s.userName
      })
    }
    s.join(`room:${newRoomId}`)
    s.currentRoomId = newRoomId
    bbHouseNamespace.to(`room:${newRoomId}`).emit('house:player-joined', {
      roomId: newRoomId, playerName: s.userName
    })
    // 先通知客户端切换，再补发新房间历史（保证顺序）
    s.emit('house:force-moved', { targetRoomId: newRoomId, reason })
    s.emit('house:history', { roomId: newRoomId, messages: visible.slice(-50).map(m => m.toObject()) })
  }

  await broadcastRoomPresence(oldRoomId)
  if (oldRoomId !== newRoomId) await broadcastRoomPresence(newRoomId)
}

// 广播给所有 House 连接（供管理员广播使用）
function broadcastHouse(event, payload) {
  if (!bbHouseNamespace) return
  bbHouseNamespace.emit(event, payload)
}

module.exports = {
  initBBHouseSocket,
  getNamespace,
  broadcastDoorUpdate,
  broadcastHouse,
  notifyForceMove,
  broadcastRoomPresence,
  broadcastMonitorUpdate,
  movePlayerSockets,
  takePendingInvite
}
