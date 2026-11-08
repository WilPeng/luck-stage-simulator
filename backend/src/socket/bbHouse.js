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
const {
  localDateStr,
  getSleepState,
  getShowerSettings,
  getShowerCooldownUntil
} = require('../games/bigbrother/houseRules')
const locationHistory = require('../games/bigbrother/locationHistory')
const sleepHistory = require('../games/bigbrother/sleepHistory')
const { getCollection } = require('../config/db')

const JWT_SECRET = process.env.JWT_SECRET || 'bigbrother_secret_key'
const gameId = 'bigbrother'

let bbHouseNamespace = null

// 待处理的 HOH 邀请（targetPlayerId -> { hohId, hohName, at }）
const pendingInvites = new Map()
// 待处理的同行邀请（targetPlayerId -> { inviterId, inviterName, fromRoomId, targetRoomId, ... })
const pendingMoveInvites = new Map()

function getNamespace() { return bbHouseNamespace }

function emitToUser(userId, event, payload) {
  if (!bbHouseNamespace || !userId) return
  // 通过 user 房间广播；Redis adapter 下可跨实例送达
  bbHouseNamespace.to(`user:${userId}`).emit(event, payload)
}

/** 兼容本地 Socket 与 RemoteSocket 读取用户 ID */
function socketUserId(s) {
  return s?.data?.userId || s?.userId || null
}

/** 获取某个用户的所有 socket（含其他实例上的连接） */
async function getUserSockets(userId) {
  if (!bbHouseNamespace || !userId) return []
  try {
    return await bbHouseNamespace.in(`user:${userId}`).fetchSockets()
  } catch (e) {
    return []
  }
}

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

/**
 * 批量获取房客状态，避免在广播循环中逐个 findOne。
 * @param {string[]} userIds
 * @returns {Promise<Map<string, {isSleeping:boolean,isMoving:boolean,isShowering:boolean}>>}
 */
async function getGuestStateMap(userIds) {
  const ids = Array.from(new Set((userIds || []).filter(Boolean)))
  if (!ids.length) return new Map()
  const guests = await BBHouseguest.find({ gameId, id: { $in: ids } })
  const map = new Map()
  for (const g of guests) {
    map.set(g.id, {
      isSleeping: !!g.isSleeping,
      isMoving: !!g.isMoving,
      isShowering: !!g.isShowering
    })
  }
  return map
}

// 发送消息时确定“谁能看到”：当前在该房间、清醒、未移动、且不在洗澡限制中
async function getRoomAudience(roomId) {
  const [guests, locations] = await Promise.all([
    BBHouseguest.find({ gameId }),
    BBPlayerLocation.find({ gameId })
  ])
  const roomByPlayer = new Map()
  for (const loc of locations) roomByPlayer.set(loc.playerId, loc.currentRoomId)
  const ids = []
  for (const g of guests) {
    if (g.role === 'admin' || g.status !== 'active') continue
    if (roomByPlayer.get(g.id) !== roomId) continue
    if (g.isSleeping || g.isMoving) continue
    if (g.isShowering && roomId !== 'bathroom') continue
    ids.push(g.id)
  }
  return ids
}

// 发给选手的消息不暴露 visibleTo 快照
function toPublicMessage(message) {
  const obj = typeof message.toObject === 'function' ? message.toObject() : { ...message }
  delete obj.visibleTo
  return obj
}

// 由后端向指定房间发送一条聊天消息（用于仪式等系统发言），并实时广播
async function postRoomMessage(roomId, { senderId, senderName, senderRole = 'houseguest', senderAvatar = null, content }) {
  try {
    const visibleTo = await getRoomAudience(roomId)
    const msg = new BBChatMessage({
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      senderId: senderId || 'system',
      senderName: senderName || '系统',
      senderRole,
      senderAvatar: senderAvatar || (senderId ? await getAvatar(senderId) : null),
      content: String(content || '').trim(),
      chatType: 'room',
      roomId,
      gameId,
      visibleTo
    })
    await msg.save()
    if (bbHouseNamespace) {
      const roomSockets = await bbHouseNamespace.in(`room:${roomId}`).fetchSockets()
      const audience = new Set(visibleTo)
      for (const s of roomSockets) {
        const isAdmin = s.data?.userRole === 'admin'
        if (!isAdmin && !audience.has(socketUserId(s))) continue
        s.emit('house:new-message', { roomId, message: toPublicMessage(msg) })
      }
    }
    return msg.toObject()
  } catch (e) {
    console.error('[BBHouse] postRoomMessage error:', e)
    return null
  }
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
      // 同步到 socket.data，便于 Redis adapter 下通过 RemoteSocket 识别用户
      socket.data.userId = decoded.userId
      socket.data.userName = socket.userName
      socket.data.userRole = socket.userRole
      next()
    } catch (e) {
      next(new Error('认证失败'))
    }
  })

  bbHouseNamespace.on('connection', async (socket) => {
    // 用数据库中的房客姓名/头像覆盖 token 中可能缺失的信息
    let connectedGuest = null
    try {
      connectedGuest = await BBHouseguest.findOne({ id: socket.userId, gameId })
      if (connectedGuest?.name) socket.userName = connectedGuest.name
      if (connectedGuest?.role) socket.userRole = connectedGuest.role
    } catch (e) { /* ignore */ }
    socket.data.userName = socket.userName
    socket.data.userRole = socket.userRole
    // 每个用户一个房间，便于跨实例定向推送（Redis adapter）
    socket.join(`user:${socket.userId}`)
    console.log(`[BBHouse] Player connected: ${socket.userName} (${socket.userId})`)

    try {
      if (socket.userRole === 'admin') {
        // 管理员不进入任何房间（上帝视角）：加入全部房间频道以接收所有发言
        const rooms = await BBHouseRoom.find({ gameId })
        for (const room of rooms) socket.join(`room:${room.id}`)
        socket.currentRoomId = null
        socket.emit('house:god-view', { rooms: rooms.map(r => ({ id: r.id, name: r.name, icon: r.icon })) })
        console.log(`[BBHouse] Admin ${socket.userName} entered god view (all rooms)`)
      } else if (connectedGuest?.isMoving) {
        // 移动中的玩家不加入任何房间，也不接收任何房间消息
        socket.currentRoomId = null
        socket.emit('house:move-started', {
          fromRoomId: connectedGuest.moveFromRoomId,
          toRoomId: connectedGuest.moveToRoomId,
          durationSeconds: connectedGuest.moveDurationSeconds,
          endsAt: connectedGuest.moveEndsAt,
          reason: '移动中'
        })
      } else {
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
        socket.emit('house:history', { roomId: currentRoomId, messages: recent.map(toPublicMessage) })

        // 发送房间内玩家列表（按位置，包含离线房客）
        await broadcastRoomPresence(currentRoomId)
        // 注意：上线/下线不产生“进入/离开房间”消息（视为一直在该房间）
      }
    } catch (e) {
      console.error('[BBHouse] Connection init error:', e)
    }

    // === 房间聊天 ===
    socket.on('house:send-message', async ({ roomId, content }) => {
      try {
        if (!content || !content.trim()) return
        if (!roomId) return socket.emit('house:error', { error: '请选择房间' })

        const isAdmin = socket.userRole === 'admin'

        // 管理员上帝视角，可在任意房间发言；房客必须身处该房间
        if (!isAdmin) {
          const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
          if (!loc || loc.currentRoomId !== roomId) {
            return socket.emit('house:error', { error: '你不在这个房间' })
          }
        } else {
          const room = await BBHouseRoom.findOne({ id: roomId, gameId })
          if (!room) return socket.emit('house:error', { error: '房间不存在' })
        }

        // 睡眠/洗澡状态限制（管理员不受限）
        const senderGuest = await BBHouseguest.findOne({ id: socket.userId, gameId })
        if (!isAdmin) {
        if (senderGuest?.isSleeping) {
          return socket.emit('house:error', { error: '睡眠中无法发送消息' })
        }
        if (senderGuest?.isMoving) {
          return socket.emit('house:error', { error: '移动中无法发送消息' })
        }
        if (senderGuest?.isShowering && roomId !== 'bathroom') {
          return socket.emit('house:error', { error: '洗澡中只能在浴室发言' })
        }
        }

        // 发送时确定可见者快照（睡眠中的同房间玩家会被排除）
        const visibleTo = await getRoomAudience(roomId)
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
          gameId,
          visibleTo
        })
        await msg.save()

        // 按可见者快照实时广播（睡眠中的房客不接收；洗澡中的房客只接收浴室消息）
        const roomSockets = await bbHouseNamespace.in(`room:${roomId}`).fetchSockets()
        const audience = new Set(visibleTo)
        const payload = { roomId, message: toPublicMessage(msg) }
        for (const s of roomSockets) {
          const isAdmin = s.data?.userRole === 'admin'
          if (!isAdmin && !audience.has(socketUserId(s))) continue
          s.emit('house:new-message', payload)
        }
      } catch (e) {
        console.error('[BBHouse] Send message error:', e)
        socket.emit('house:error', { error: '发送失败' })
      }
    })

    // === 加载更多历史消息 ===
    socket.on('house:load-more', async ({ roomId, before }) => {
      try {
        if (socket.userRole !== 'admin') {
          const guest = await BBHouseguest.findOne({ id: socket.userId, gameId })
          if (guest?.isMoving) return
          const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
          if (!loc || loc.currentRoomId !== roomId) return
        }

        const all = await BBChatMessage.find({ gameId, chatType: 'room', roomId })
        all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        // 仅可见消息（发送时我在该房间）
        const visible = await locationHistory.filterVisibleMessages(socket.userId, roomId, all)
        let older
        if (before) {
          const idx = visible.findIndex(m => new Date(m.createdAt).getTime() < new Date(before).getTime())
          older = idx >= 0 ? visible.slice(idx, idx + 50) : []
        } else {
          older = visible.slice(0, 50)
        }
        older = older.slice().reverse()

        socket.emit('house:older-messages', { roomId, messages: older.map(toPublicMessage) })
      } catch (e) {
        console.error('[BBHouse] Load more error:', e)
      }
    })

    // === 房间移动通知（由 REST API 触发，通过 socket 广播） ===
    socket.on('house:moved', async ({ oldRoomId, newRoomId }) => {
      try {
        // 移动必须由服务端计时完成，客户端不能直接切换房间
        const guest = await BBHouseguest.findOne({ id: socket.userId, gameId })
        if (guest?.isMoving) return
        const currentLoc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        if (!currentLoc || currentLoc.currentRoomId !== newRoomId) {
          return socket.emit('house:error', { error: '当前位置不匹配，无法切换房间' })
        }
        // 离开旧房间
        if (oldRoomId) {
          socket.leave(`room:${oldRoomId}`)
          bbHouseNamespace.to(`room:${oldRoomId}`).emit('house:player-left', {
            roomId: oldRoomId,
            playerName: socket.userName,
            at: new Date().toISOString()
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
            playerName: socket.userName,
            at: new Date().toISOString()
          })
          await broadcastRoomPresence(newRoomId)

          // 发送新房间可见历史消息
          const allMessages = await BBChatMessage.find({ gameId, chatType: 'room', roomId: newRoomId })
          allMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
          const visible = await locationHistory.filterVisibleMessages(socket.userId, newRoomId, allMessages)
          socket.emit('house:history', { roomId: newRoomId, messages: visible.slice(-50).map(toPublicMessage) })
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

        emitToUser(targetPlayerId, 'house:invite-received', {
          hohName: socket.userName,
          hohId: socket.userId,
          roomId: 'hoh_room'
        })
      } catch (e) {
        console.error('[BBHouse] Invite error:', e)
      }
    })

    // === 拒绝 HOH 邀请（通知 HOH） ===
    socket.on('house:decline-invite', async ({ hohId }) => {
      try {
        pendingInvites.delete(socket.userId)
        if (!hohId) return
        emitToUser(hohId, 'house:invite-declined', {
          playerId: socket.userId,
          playerName: socket.userName
        })
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
        emitToUser(targetPlayerId, 'house:invite-cancelled', { hohId: socket.userId })
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

        const hg = await BBHouseguest.findOne({ id: socket.userId, gameId })
        if (!hg || hg.status !== 'active') {
          return socket.emit('house:error', { error: '非活跃玩家' })
        }
        if (hg.isSleeping) {
          return socket.emit('house:error', { error: '睡眠中无法移动' })
        }
        if (hg.isShowering) {
          return socket.emit('house:error', { error: '洗澡中无法移动' })
        }
        if (hg.isMoving) {
          return socket.emit('house:error', { error: '移动中' })
        }

        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        const oldRoomId = loc?.currentRoomId || 'living_room'
        const targetRoom = await BBHouseRoom.findOne({ id: 'hoh_room', gameId })
        const durationSeconds = Math.max(0, Number(targetRoom?.moveDuration ?? 10))
        await startTimedMove({
          playerId: socket.userId,
          fromRoomId: oldRoomId,
          toRoomId: 'hoh_room',
          durationSeconds,
          reason: '接受 HOH 邀请'
        })

        // 通知 HOH：邀请已被接受
        const hoh = await getCurrentHoh()
        if (hoh) {
          emitToUser(hoh.id, 'house:invite-accepted', {
            playerId: socket.userId,
            playerName: socket.userName
          })
        }
      } catch (e) {
        console.error('[BBHouse] Accept invite error:', e)
      }
    })

    // === 邀请同房间玩家一起移动 ===
    socket.on('house:invite-move', async ({ targetPlayerId, targetRoomId }) => {
      try {
        if (!targetPlayerId || !targetRoomId) {
          return socket.emit('house:error', { error: '缺少邀请对象或目标房间' })
        }
        if (targetPlayerId === socket.userId) {
          return socket.emit('house:error', { error: '不能邀请自己' })
        }
        const ctx = await validateCoMove(socket.userId, targetPlayerId, targetRoomId)
        if (ctx.error) return socket.emit('house:error', { error: ctx.error })

        const invite = {
          inviterId: socket.userId,
          inviterName: socket.userName,
          targetPlayerId,
          targetPlayerName: ctx.target.name,
          fromRoomId: ctx.fromRoomId,
          targetRoomId,
          targetRoomName: ctx.targetRoom.name,
          targetRoomIcon: ctx.targetRoom.icon,
          at: Date.now()
        }
        // 同一邀请人同时只保留一个待处理邀请：自动取消之前发给其他人的邀请
        for (const [prevTargetId, prevInvite] of pendingMoveInvites) {
          if (prevInvite.inviterId !== socket.userId) continue
          if (prevTargetId === targetPlayerId) continue
          pendingMoveInvites.delete(prevTargetId)
          emitToUser(prevTargetId, 'house:move-invite-cancelled', {
            inviterId: socket.userId,
            inviterName: socket.userName
          })
        }
        pendingMoveInvites.set(targetPlayerId, invite)
        emitToUser(targetPlayerId, 'house:move-invite-received', {
          inviterId: socket.userId,
          inviterName: socket.userName,
          fromRoomId: ctx.fromRoomId,
          targetRoomId,
          roomName: ctx.targetRoom.name,
          roomIcon: ctx.targetRoom.icon
        })
        socket.emit('house:move-invite-sent', {
          targetPlayerId,
          targetPlayerName: ctx.target.name,
          targetRoomId,
          roomName: ctx.targetRoom.name
        })
      } catch (e) {
        console.error('[BBHouse] Invite move error:', e)
      }
    })

    socket.on('house:accept-move-invite', async () => {
      try {
        const invite = pendingMoveInvites.get(socket.userId)
        if (!invite) return socket.emit('house:error', { error: '没有待处理的同行邀请' })
        if (Date.now() - invite.at > 2 * 60 * 1000) {
          pendingMoveInvites.delete(socket.userId)
          return socket.emit('house:error', { error: '同行邀请已过期' })
        }

        const ctx = await validateCoMove(invite.inviterId, socket.userId, invite.targetRoomId)
        if (ctx.error) {
          pendingMoveInvites.delete(socket.userId)
          return socket.emit('house:error', { error: ctx.error })
        }
        pendingMoveInvites.delete(socket.userId)

        const durationSeconds = Math.max(0, Number(ctx.targetRoom.moveDuration ?? 10))
        await startTimedMove({
          playerId: invite.inviterId,
          fromRoomId: ctx.fromRoomId,
          toRoomId: invite.targetRoomId,
          durationSeconds,
          reason: `与 ${ctx.target.name} 同行`
        })
        await startTimedMove({
          playerId: socket.userId,
          fromRoomId: ctx.fromRoomId,
          toRoomId: invite.targetRoomId,
          durationSeconds,
          reason: `与 ${ctx.inviter.name} 同行`
        })

        emitToUser(invite.inviterId, 'house:move-invite-accepted', {
          playerId: socket.userId,
          playerName: ctx.target.name,
          targetRoomId: invite.targetRoomId,
          roomName: invite.targetRoomName
        })
      } catch (e) {
        console.error('[BBHouse] Accept move invite error:', e)
      }
    })

    socket.on('house:decline-move-invite', async () => {
      try {
        const invite = pendingMoveInvites.get(socket.userId)
        if (!invite) return
        pendingMoveInvites.delete(socket.userId)
        emitToUser(invite.inviterId, 'house:move-invite-declined', {
          playerId: socket.userId,
          playerName: socket.userName
        })
      } catch (e) {
        console.error('[BBHouse] Decline move invite error:', e)
      }
    })

    // 邀请人主动取消同行邀请
    socket.on('house:cancel-move-invite', () => {
      try {
        let cancelled = 0
        for (const [targetId, invite] of pendingMoveInvites) {
          if (invite.inviterId !== socket.userId) continue
          pendingMoveInvites.delete(targetId)
          emitToUser(targetId, 'house:move-invite-cancelled', {
            inviterId: socket.userId,
            inviterName: socket.userName
          })
          socket.emit('house:move-invite-cancelled', {
            targetPlayerId: targetId,
            targetPlayerName: invite.targetPlayerName,
            bySelf: true
          })
          cancelled++
        }
        if (!cancelled) socket.emit('house:error', { error: '没有待取消的同行邀请' })
      } catch (e) {
        console.error('[BBHouse] Cancel move invite error:', e)
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
        // 下线不视为离开房间，仅更新在线列表
        const loc = await BBPlayerLocation.findOne({ playerId: socket.userId, gameId })
        if (loc) await broadcastRoomPresence(loc.currentRoomId)
      } catch (e) {
        console.error('[BBHouse] Disconnect error:', e)
      }
      console.log(`[BBHouse] Player disconnected: ${socket.userName}`)
    })
  })

  console.log('[BBHouse] Socket.IO namespace /bigbrother-house initialized')
  startHouseTimers()
}

// ===== 定时任务：移动完成 / 自动睡眠 / 洗澡自动结束 =====
let houseTimer = null
let moveTimer = null
const processingMoves = new Set()

function startHouseTimers() {
  // 多实例部署时，移动/睡眠等定时任务只应在一个实例上运行，避免重复处理
  if (process.env.BB_ENABLE_TIMERS === '0' || process.env.BB_ENABLE_TIMERS === 'false') {
    console.log('[BBHouse] House timers disabled on this instance (BB_ENABLE_TIMERS=false)')
    return
  }
  if (!houseTimer) {
    houseTimer = setInterval(runHouseTimers, 60 * 1000)
    // 启动后先跑一次
    runHouseTimers()
  }
  if (!moveTimer) {
    moveTimer = setInterval(processPendingMoves, 1000)
    processPendingMoves()
  }
}

async function runHouseTimers() {
  try {
    const season = await BBSeason.findOne({ gameId })
    const now = new Date()

    // 自动睡眠：睡眠时间窗结束时仍未完成本轮睡觉 -> 被动入睡
    // 仅在结束时间点附近触发，避免服务重启/长时间延迟后在白天“突然”强制入睡
    const FORCE_GRACE_MS = 2 * 60 * 1000
    const guests = await BBHouseguest.find({ gameId, status: 'active' })
    for (const g of guests) {
      if (g.isSleeping) continue
      const sleepState = getSleepState(season, now, g.lastSleepDate)
      if (!sleepState.shouldForce) continue
      if (now.getTime() - sleepState.endAt > FORCE_GRACE_MS) continue
      // 玩家在窗口结束后才创建时，不追溯上一个周期
      const createdAt = g.createdAt ? new Date(g.createdAt).getTime() : 0
      if (createdAt > sleepState.endAt) continue
      const sleepStartedAt = new Date(sleepState.endAt)
      g.isSleeping = true
      g.sleepStartedAt = sleepStartedAt.toISOString()
      g.wakeAt = new Date(sleepStartedAt.getTime() + sleepState.sleepDurationMinutes * 60 * 1000).toISOString()
      g.lastSleepDate = sleepState.cycleDate
      await g.save()
      await sleepHistory.startSleep(g.id, g.sleepStartedAt)
      emitToUser(g.id, 'house:sleep-forced', {
        wakeAt: g.wakeAt,
        sleepCycleDate: g.lastSleepDate,
        sleepDurationMinutes: sleepState.sleepDurationMinutes
      })
    }

    // 洗澡 10 分钟后自动结束，进入冷却并移动到洗漱间
    const showerSettings = getShowerSettings(season)
    const showering = await BBHouseguest.find({ gameId, isShowering: true })
    for (const g of showering) {
      if (!g.showerStartedAt) continue
      if (now.getTime() - new Date(g.showerStartedAt).getTime() >= showerSettings.showerDurationMinutes * 60 * 1000) {
        g.isShowering = false
        g.showerStartedAt = null
        g.lastShowerDate = localDateStr(now)
        g.showerCooldownUntil = getShowerCooldownUntil(season, now)
        await g.save()
        const loc = await BBPlayerLocation.findOne({ playerId: g.id, gameId })
        if (loc && loc.currentRoomId === 'bathroom') {
          const oldRoomId = loc.currentRoomId
          loc.currentRoomId = 'washroom'
          loc.enteredAt = now.toISOString()
          await loc.save()
          g.currentRoomId = 'washroom'
          await g.save()
          await movePlayerSockets(g.id, oldRoomId, 'washroom', '洗澡结束')
        }
      }
    }
  } catch (e) {
    console.error('[BBHouse] House timer error:', e)
  }
}

// ===== 带移动时间的房间移动 =====

async function validateCoMove(inviterId, targetPlayerId, targetRoomId) {
  const [inviter, target] = await Promise.all([
    BBHouseguest.findOne({ id: inviterId, gameId }),
    BBHouseguest.findOne({ id: targetPlayerId, gameId })
  ])
  if (!inviter || inviter.status !== 'active') return { error: '邀请者不在游戏中' }
  if (!target || target.status !== 'active') return { error: '目标玩家不在游戏中' }
  if (inviter.isSleeping || target.isSleeping) return { error: '睡眠中无法移动' }
  if (inviter.isShowering || target.isShowering) return { error: '洗澡中无法移动' }
  if (inviter.isMoving) return { error: '邀请者正在移动中' }
  if (target.isMoving) return { error: '对方正在移动中' }

  const [inviterLoc, targetLoc] = await Promise.all([
    BBPlayerLocation.findOne({ playerId: inviterId, gameId }),
    BBPlayerLocation.findOne({ playerId: targetPlayerId, gameId })
  ])
  const fromRoomId = inviterLoc?.currentRoomId || 'living_room'
  if (!targetLoc || targetLoc.currentRoomId !== fromRoomId) {
    return { error: '你们不在同一个房间' }
  }
  if (targetRoomId === fromRoomId) return { error: '已经在这个房间了' }

  const targetRoom = await BBHouseRoom.findOne({ id: targetRoomId, gameId })
  if (!targetRoom) return { error: '目标房间不存在' }
  if (targetRoom.accessRule === 'admin_only') return { error: '该区域只能由管理员安排进入' }

  const passages = await BBHousePassage.find({ gameId })
  const passage = passages.find(p =>
    (p.from === fromRoomId && p.to === targetRoomId) ||
    (p.to === fromRoomId && p.from === targetRoomId)
  )
  if (!passage) return { error: '不可达：两个房间之间没有通道' }
  if (passage.type === 'door' && passage.doorId) {
    const door = await BBHouseDoor.findOne({ id: passage.doorId, gameId })
    if (door && !door.isOpen) return { error: '门已关闭' }
  }

  const hoh = await getCurrentHoh()
  if (targetRoom.accessRule === 'hoh_only' && hoh?.id !== inviterId && hoh?.id !== targetPlayerId) {
    return { error: '仅 HOH 可进入' }
  }
  if (targetRoom.accessRule === 'hoh_or_invited' && hoh?.id !== inviterId && hoh?.id !== targetPlayerId) {
    return { error: '需要 HOH 邀请' }
  }
  if (targetRoom.accessRule === 'single') {
    const count = await BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId, gameId })
    if (count >= 1) return { error: '房间已有人在内' }
  }
  if (targetRoom.capacity) {
    const [count, movingCount] = await Promise.all([
      BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId, gameId }),
      BBHouseguest.countDocuments({ gameId, isMoving: true, moveToRoomId: targetRoomId })
    ])
    if (count + movingCount + 2 > targetRoom.capacity) {
      return { error: '人数已满请稍后重试' }
    }
  }

  return { inviter, target, fromRoomId, targetRoom }
}

/** 开始一次计时移动：关闭旧房间历史区间，离开旧房间 socket，到达后由定时器完成 */
async function startTimedMove({ playerId, fromRoomId, toRoomId, durationSeconds = 10, reason = '移动中' }) {
  const hg = await BBHouseguest.findOne({ id: playerId, gameId })
  if (!hg) return null
  const duration = Math.max(0, Math.round(Number(durationSeconds) || 0))
  const now = new Date()
  const endsAt = new Date(now.getTime() + duration * 1000).toISOString()
  const targetRoom = await BBHouseRoom.findOne({ id: toRoomId, gameId })

  hg.isMoving = true
  hg.moveFromRoomId = fromRoomId
  hg.moveToRoomId = toRoomId
  hg.moveStartedAt = now.toISOString()
  hg.moveEndsAt = endsAt
  hg.moveDurationSeconds = duration
  await hg.save()

  // 移动期间不属于任何房间：立即结束旧房间的可见区间
  await locationHistory.recordMove(playerId, hg.name, fromRoomId, null, now.toISOString())

  const payload = {
    fromRoomId,
    toRoomId,
    roomName: targetRoom?.name || '',
    roomIcon: targetRoom?.icon || '🏠',
    durationSeconds: duration,
    endsAt,
    reason
  }

  if (bbHouseNamespace) {
    const playerSockets = await getUserSockets(playerId)
    for (const s of playerSockets) {
      await s.leave(`room:${fromRoomId}`)
      s.currentRoomId = null
      s.emit('house:move-started', payload)
    }
    if (fromRoomId) {
      bbHouseNamespace.to(`room:${fromRoomId}`).emit('house:player-left', {
        roomId: fromRoomId, playerName: hg.name, moving: true,
        at: new Date().toISOString()
      })
      await broadcastRoomPresence(fromRoomId)
    }
  }

  if (duration <= 0) {
    await completeTimedMove(hg, reason)
  }
  return { ...payload, isMoving: duration > 0 }
}

/** 完成移动：更新位置、恢复 socket 房间、推送新房间历史 */
async function completeTimedMove(guest, reason = '移动完成') {
  const g = await BBHouseguest.findOne({ id: guest.id, gameId })
  if (!g || !g.isMoving) return
  const fromRoomId = g.moveFromRoomId
  const toRoomId = g.moveToRoomId
  if (!fromRoomId || !toRoomId) {
    clearGuestMoveState(g)
    await g.save()
    return
  }

  const now = new Date()
  let loc = await BBPlayerLocation.findOne({ playerId: g.id, gameId })
  if (!loc) {
    loc = new BBPlayerLocation({
      id: g.id, playerId: g.id, playerName: g.name,
      currentRoomId: toRoomId, enteredAt: now.toISOString(), gameId
    })
    await loc.save()
  } else {
    loc.currentRoomId = toRoomId
    loc.enteredAt = now.toISOString()
    await loc.save()
  }

  g.currentRoomId = toRoomId
  clearGuestMoveState(g)

  // 到达浴室即开始洗澡
  if (toRoomId === 'bathroom') {
    g.isShowering = true
    g.showerStartedAt = now.toISOString()
    g.lastShowerDate = localDateStr(now)
    g.showerCooldownUntil = null
  }
  await g.save()

  // 移动开始阶段已经广播过离开旧房间，这里不再重复
  await movePlayerSockets(g.id, fromRoomId, toRoomId, reason, { announceOldLeave: false })
}

function clearGuestMoveState(g) {
  g.isMoving = false
  g.moveFromRoomId = null
  g.moveToRoomId = null
  g.moveStartedAt = null
  g.moveEndsAt = null
  g.moveDurationSeconds = null
}

async function processPendingMoves() {
  try {
    const now = Date.now()
    const movingGuests = await BBHouseguest.find({ gameId, isMoving: true })
    for (const g of movingGuests) {
      if (processingMoves.has(g.id)) continue
      if (!g.moveEndsAt || new Date(g.moveEndsAt).getTime() > now) continue
      processingMoves.add(g.id)
      try {
        await completeTimedMove(g, '移动完成')
      } finally {
        processingMoves.delete(g.id)
      }
    }
  } catch (e) {
    console.error('[BBHouse] Move timer error:', e)
  }
}

// 广播房间内玩家列表
async function broadcastRoomPresence(roomId) {
  if (!bbHouseNamespace) return
  const locations = await BBPlayerLocation.find({ currentRoomId: roomId, gameId })
  const movingGuests = await BBHouseguest.find({ gameId, isMoving: true })
  const movingIds = new Set(movingGuests.map(g => g.id))
  const avatars = await getAvatarMap()
  const players = locations
    .filter(l => !movingIds.has(l.playerId))
    .map(l => ({
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
// 优化：一次聚合统计所有房间人数；人数无变化时不重复推送；通过房间频道跨实例广播
let lastMonitorSignature = ''

async function broadcastMonitorUpdate() {
  if (!bbHouseNamespace) return
  try {
    const [rooms, countRows] = await Promise.all([
      BBHouseRoom.find({ gameId }),
      getCollection('BBPlayerLocation').aggregate([
        { $match: { gameId } },
        { $group: { _id: '$currentRoomId', n: { $sum: 1 } } }
      ]).toArray()
    ])

    const countMap = new Map(countRows.map(r => [r._id, r.n]))
    const result = []
    for (const room of rooms) {
      if (room.type === 'hidden') continue // Diary Room 不参与监控
      result.push({ roomId: room.id, roomName: room.name, icon: room.icon, count: countMap.get(room.id) || 0 })
    }

    // 人数未变化 → 跳过推送
    const signature = JSON.stringify(result)
    if (signature === lastMonitorSignature) return
    lastMonitorSignature = signature

    // 管理员在连接时加入了所有房间频道；HOH 房内的房客也在该频道中。
    // 使用房间广播而非本地 socket 遍历，兼容 Redis adapter 多进程部署。
    bbHouseNamespace.to('room:hoh_room').emit('house:monitor-update', result)
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
  emitToUser(playerId, 'house:force-moved', { targetRoomId, reason })
}

// 管理员强制移动/清空后院：服务端权威地切换玩家 socket 房间并实时广播
async function movePlayerSockets(playerId, oldRoomId, newRoomId, reason = '管理员移动', options = {}) {
  if (!bbHouseNamespace) return
  const hg = await BBHouseguest.findOne({ id: playerId, gameId })
  // 记录位置历史（消息可见性核心）
  await locationHistory.recordMove(playerId, hg?.name || '', oldRoomId, newRoomId)
  const targets = await getUserSockets(playerId)

  // 预先取该玩家在新房间可见的历史
  const allMessages = await BBChatMessage.find({ gameId, chatType: 'room', roomId: newRoomId })
  allMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
  const visible = await locationHistory.filterVisibleMessages(playerId, newRoomId, allMessages)

  for (const s of targets) {
    const playerName = s.data?.userName || s.userName || hg?.name || ''
    await s.leave(`room:${oldRoomId}`)
    if (oldRoomId && options.announceOldLeave !== false) {
      bbHouseNamespace.to(`room:${oldRoomId}`).emit('house:player-left', {
        roomId: oldRoomId, playerName,
        at: new Date().toISOString()
      })
    }
    await s.join(`room:${newRoomId}`)
    s.currentRoomId = newRoomId
    bbHouseNamespace.to(`room:${newRoomId}`).emit('house:player-joined', {
      roomId: newRoomId, playerName,
      at: new Date().toISOString()
    })
    // 先通知客户端切换，再补发新房间历史（保证顺序）
    s.emit('house:force-moved', { targetRoomId: newRoomId, reason })
    s.emit('house:history', { roomId: newRoomId, messages: visible.slice(-50).map(toPublicMessage) })
  }

  await broadcastRoomPresence(oldRoomId)
  if (oldRoomId !== newRoomId) await broadcastRoomPresence(newRoomId)
}

// 把「在线」玩家（活跃房客 + 已登录管理员）统一移动到指定房间（仪式开始等场景）
async function moveAllToRoom(targetRoomId, reason = '仪式开始') {
  // 管理员不进入任何房间，只移动活跃房客
  const guests = await BBHouseguest.find({ gameId, role: 'houseguest', status: 'active' })
  const moved = []
  for (const g of guests) {
    const loc = await BBPlayerLocation.findOne({ playerId: g.id, gameId })
    const oldRoomId = loc?.currentRoomId || 'living_room'
    if (oldRoomId === targetRoomId) continue
    if (loc) {
      loc.currentRoomId = targetRoomId
      loc.enteredAt = new Date().toISOString()
      await loc.save()
    } else {
      await BBPlayerLocation.insertOne({
        id: g.id, playerId: g.id, playerName: g.name,
        currentRoomId: targetRoomId, enteredAt: new Date().toISOString(), gameId
      })
    }
    g.currentRoomId = targetRoomId
    clearGuestMoveState(g)
    await g.save()
    try { await movePlayerSockets(g.id, oldRoomId, targetRoomId, reason) } catch (e) { /* ignore */ }
    moved.push(g.name)
  }
  return moved
}

// 广播给所有 House 连接（供管理员广播使用）
function broadcastHouse(event, payload) {
  if (!bbHouseNamespace) return
  bbHouseNamespace.emit(event, payload)
}

module.exports = {
  initBBHouseSocket,
  getNamespace,
  postRoomMessage,
  broadcastDoorUpdate,
  broadcastHouse,
  notifyForceMove,
  broadcastRoomPresence,
  broadcastMonitorUpdate,
  movePlayerSockets,
  moveAllToRoom,
  startTimedMove,
  clearGuestMoveState,
  takePendingInvite
}
