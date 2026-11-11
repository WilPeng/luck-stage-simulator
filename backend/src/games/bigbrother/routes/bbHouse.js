/**
 * BB House REST 路由
 * 房屋地图、玩家移动、HOH 邀请、管理员控制
 */
const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../../../middleware/auth')
const BBHouseRoom = require('../models/BBHouseRoom')
const BBHousePassage = require('../models/BBHousePassage')
const BBHouseDoor = require('../models/BBHouseDoor')
const BBPlayerLocation = require('../models/BBPlayerLocation')
const BBHouseguest = require('../models/BBHouseguest')
const BBChatMessage = require('../models/BBChatMessage')
const BBLocationHistory = require('../models/BBLocationHistory')
const BBSleepRecord = require('../models/BBSleepRecord')
const sleepHistory = require('../sleepHistory')
const BBBroadcast = require('../models/BBBroadcast')
const { generateId, getCurrentSeason, logAction, BB_ACTION_TYPES } = require('../helpers')
const { getReachableRooms, getCurrentHoh } = require('../houseMap')
const {
  localDateStr,
  isValidHHMM,
  getSleepSettings,
  getShowerSettings,
  getSleepState,
  getShowerCooldownUntil
} = require('../houseRules')
const { getCollection } = require('../../../config/db')
const { broadcastDoorUpdate, movePlayerSockets, takePendingInvite, broadcastHouse, postRoomMessage, startTimedMove, clearGuestMoveState } = require('../../../socket/bbHouse')
const { broadcastBBGame } = require('../../../socket/bbGame')

// ===== 公共 API =====

// GET /map - 获取房屋地图
router.get('/map', auth, async (req, res) => {
  try {
    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })
    const passages = await BBHousePassage.find({ gameId: 'bigbrother' })
    const doors = await BBHouseDoor.find({ gameId: 'bigbrother' })
    const season = await getCurrentSeason()
    res.json({
      success: true,
      data: {
        rooms: rooms.map(r => r.toObject()),
        passages: passages.map(p => p.toObject()),
        doors: doors.map(d => d.toObject()),
        backyardDoorOpen: season?.backyardDoorOpen ?? true
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房屋地图失败' })
  }
})

// GET /rooms - 获取所有房间（人数仅对管理员/当前 HOH 可见）
router.get('/rooms', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const [rooms, loc] = await Promise.all([
      BBHouseRoom.find({ gameId: 'bigbrother' }),
      BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' })
    ])
    // 身处 HOH 房的房客（含 HOH）可见人数
    const inHohRoom = !!(loc && loc.currentRoomId === 'hoh_room')
    const showCounts = isAdmin || inHohRoom

    // 一次聚合拿到各房间人数，避免逐房间 countDocuments 的 N+1 查询
    let counts = {}
    if (showCounts) {
      const { getCollection } = require('../../../config/db')
      const rows = await getCollection('BBPlayerLocation').aggregate([
        { $match: { gameId: 'bigbrother' } },
        { $group: { _id: '$currentRoomId', n: { $sum: 1 } } }
      ]).toArray()
      for (const r of rows) counts[r._id] = r.n
    }

    // 普通玩家：隐藏特殊隔离区域（初入屋/陪审屋），除非自己当前就在该区域
    const currentRoomId = loc?.currentRoomId || null
    const visibleRooms = isAdmin
      ? rooms
      : rooms.filter(room => room.accessRule !== 'admin_only' || room.id === currentRoomId)
    const result = visibleRooms.map(room => ({ ...room.toObject(), currentCount: showCounts ? (counts[room.id] || 0) : null }))
    res.json({ success: true, data: result })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房间列表失败' })
  }
})

// GET /rooms/:roomId - 获取指定房间内玩家（普通玩家只能看到自己所在房间的玩家）
router.get('/rooms/:roomId', auth, async (req, res) => {
  try {
    const { roomId } = req.params
    const room = await BBHouseRoom.findOne({ id: roomId, gameId: 'bigbrother' })
    if (!room) return res.status(404).json({ success: false, error: '房间不存在' })

    const locations = await BBPlayerLocation.find({ currentRoomId: roomId, gameId: 'bigbrother' })

    // 判断请求者是否在该房间
    const myLoc = await BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' })
    const isInRoom = myLoc && myLoc.currentRoomId === roomId

    // 管理员/HOH 身份
    const isAdmin = req.user.role === 'admin'
    const hoh = await getCurrentHoh()
    const isHoh = !!(hoh && hoh.id === req.user.userId)

    let players
    let count = null
    if (isAdmin || isInRoom) {
      // 可以看到具体玩家（含头像）
      const avatars = {}
      const guests = await BBHouseguest.find({ gameId: 'bigbrother' })
      guests.forEach(g => { avatars[g.id] = g.avatar || null })
      players = locations.map(l => ({ playerId: l.playerId, playerName: l.playerName, avatar: avatars[l.playerId] || null, enteredAt: l.enteredAt }))
      count = locations.length
    } else if (isHoh) {
      // HOH：仅能看到人数，不能看到身份
      players = null
      count = locations.length
    } else {
      // 普通玩家且不在该房间：既看不到人数也看不到身份
      players = null
      count = null
    }

    res.json({
      success: true,
      data: {
        room: room.toObject(),
        count,
        players,
        bathroomPlayers: await (async () => {
          // 仅身处洗漱间（或管理员）可以看到浴室内有谁；聊天内容仍按房间隔离
          if (roomId !== 'washroom' || (!isAdmin && !isInRoom)) return null
          const locs = await BBPlayerLocation.find({ currentRoomId: 'bathroom', gameId: 'bigbrother' })
          const guests = await BBHouseguest.find({ gameId: 'bigbrother' })
          const av = {}
          guests.forEach(g => { av[g.id] = g.avatar || null })
          return locs.map(l => ({ playerId: l.playerId, playerName: l.playerName, avatar: av[l.playerId] || null }))
        })()
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房间信息失败' })
  }
})

// GET /my-location - 获取自己当前位置
router.get('/my-location', auth, async (req, res) => {
  try {
    const loc = await BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' })
    if (!loc) return res.json({ success: true, data: { roomId: 'living_room', enteredAt: null } })
    res.json({ success: true, data: loc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取位置失败' })
  }
})

// GET /all-chats - 冠军产生后由管理员公开，所有选手可查看全部聊天记录
router.get('/all-chats', auth, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const isAdmin = req.user.role === 'admin'
    if (!isAdmin && !season?.allChatsRevealed) {
      return res.status(403).json({ success: false, error: '管理员尚未公开全部聊天记录', code: 'CHATS_NOT_REVEALED' })
    }
    const [docs, rooms] = await Promise.all([
      BBChatMessage.find({ gameId: 'bigbrother' }),
      BBHouseRoom.find({ gameId: 'bigbrother' })
    ])
    const roomMap = new Map(rooms.map(r => [r.id, r]))
    docs.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
    const messages = docs.map(m => {
      const obj = m.toObject()
      delete obj.visibleTo
      const room = m.roomId ? roomMap.get(m.roomId) : null
      return {
        ...obj,
        roomName: room?.name || '',
        roomIcon: room?.icon || ''
      }
    })
    res.json({
      success: true,
      data: {
        allChatsRevealed: !!season?.allChatsRevealed || isAdmin,
        messages
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取全部聊天记录失败' })
  }
})

// GET /reachable - 获取从当前位置可达的房间
router.get('/reachable', auth, async (req, res) => {
  try {
    const { getCollection } = require('../../../config/db')
    const [loc, rooms, doors, hoh, countRows] = await Promise.all([
      BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' }),
      BBHouseRoom.find({ gameId: 'bigbrother' }),
      BBHouseDoor.find({ gameId: 'bigbrother' }),
      getCurrentHoh(),
      getCollection('BBPlayerLocation').aggregate([
        { $match: { gameId: 'bigbrother' } },
        { $group: { _id: '$currentRoomId', n: { $sum: 1 } } }
      ]).toArray()
    ])
    const currentRoomId = loc?.currentRoomId || 'living_room'
    const counts = {}
    for (const r of countRows) counts[r._id] = r.n

    const roomMap = {}
    rooms.forEach(r => { roomMap[r.id] = r })

    // 特殊隔离区域（初入屋/陪审屋）：无法自行移动，仅管理员可安排
    if (roomMap[currentRoomId]?.accessRule === 'admin_only') {
      return res.json({
        success: true,
        data: { currentRoomId, rooms: [], backyardDoorOpen: null, hohDoorOpen: null, locked: true, lockReason: '你当前处于特殊区域，只能由管理员安排移动' }
      })
    }

    const hohId = hoh ? hoh.id : null

    // 复用已取的 passages/doors 计算可达（避免重复查询）
    const doorMap = {}
    doors.forEach(d => { doorMap[d.id] = d })
    const passages = await BBHousePassage.find({ gameId: 'bigbrother' })
    const reachableIds = []
    for (const p of passages) {
      let target = null
      if (p.from === currentRoomId) target = p.to
      else if (p.to === currentRoomId) target = p.from
      if (!target) continue
      if (p.type === 'door' && p.doorId) {
        const door = doorMap[p.doorId]
        if (door && !door.isOpen) continue
      }
      reachableIds.push(target)
    }

    const reachable = reachableIds
      .filter(id => roomMap[id] && roomMap[id].accessRule !== 'admin_only')
      .map(id => {
        const room = roomMap[id]
        let canEnter = true
        let denyReason = ''
        let isFull = false
        if (room.accessRule === 'hoh_only') {
          if (hohId !== req.user.userId) { canEnter = false; denyReason = '仅 HOH 可进入' }
        } else if (room.accessRule === 'hoh_or_invited') {
          if (hohId !== req.user.userId) { canEnter = false; denyReason = '需要 HOH 邀请' }
        } else if (room.accessRule === 'have_not_only') {
          // 任何人（无论是否 Have-Not）都可进入贫民屋
        } else if (room.accessRule === 'single') {
          if ((counts[id] || 0) >= 1) { canEnter = false; denyReason = '已有人在内' }
        }

        // 人数上限：前端仍允许点击，进入时再由服务端返回“人数已满”
        if (canEnter && room.capacity) {
          if ((counts[id] || 0) >= room.capacity) { canEnter = false; denyReason = '房间已满'; isFull = true }
        }

        return { ...room.toObject(), canEnter, denyReason, isFull }
      })

    // 附带门状态，但仅在特定房间可见
    const doorMap2 = {}
    doors.forEach(d => { doorMap2[d.id] = d.isOpen })

    const canSeeBackyardDoor = currentRoomId === 'living_room' || currentRoomId === 'backyard'
    const canSeeHohDoor = currentRoomId === 'hoh_room' || currentRoomId === 'hoh_door'

    res.json({
      success: true,
      data: {
        currentRoomId,
        rooms: reachable,
        backyardDoorOpen: canSeeBackyardDoor ? (doorMap2['backyard_door'] ?? true) : null,
        hohDoorOpen: canSeeHohDoor ? (doorMap2['hoh_door'] ?? false) : null
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取可达房间失败' })
  }
})

// ===== 玩家操作 =====

// POST /move - 移动到目标房间
router.post('/move', auth, async (req, res) => {
  try {
    const { targetRoomId } = req.body
    if (!targetRoomId) return res.status(400).json({ success: false, error: '缺少目标房间' })
    if (req.user.role === 'admin') {
      return res.status(403).json({ success: false, error: '管理员不进入任何房间（上帝视角）' })
    }

    const gameId = 'bigbrother'

    // 1. 玩家状态
    const player = await BBHouseguest.findOne({ id: req.user.userId, gameId })
    if (!player || player.status !== 'active') {
      return res.status(403).json({ success: false, error: '非活跃玩家' })
    }

    // 睡眠/洗澡期间不可移动
    if (player.isSleeping) {
      return res.status(403).json({ success: false, error: '睡眠中无法移动' })
    }
    if (player.isShowering) {
      return res.status(403).json({ success: false, error: '洗澡中无法离开浴室' })
    }
    if (player.isMoving) {
      return res.status(403).json({ success: false, error: '移动中' })
    }

    // 进入浴室：需确认已过洗澡冷却
    if (targetRoomId === 'bathroom' && player.showerCooldownUntil) {
      const remainMs = new Date(player.showerCooldownUntil).getTime() - Date.now()
      if (remainMs > 0) {
        const minutes = Math.ceil(remainMs / 60000)
        return res.status(403).json({ success: false, error: `洗澡冷却中，还需 ${minutes} 分钟才能再次洗澡` })
      }
    }

    // 2. 目标房间存在
    const targetRoom = await BBHouseRoom.findOne({ id: targetRoomId, gameId })
    if (!targetRoom) return res.status(400).json({ success: false, error: '房间不存在' })

    // 3. 当前位置
    let loc = await BBPlayerLocation.findOne({ playerId: req.user.userId, gameId })
    if (!loc) {
      // 首次移动，创建位置记录
      loc = new BBPlayerLocation({
        id: req.user.userId, playerId: req.user.userId, playerName: player.name,
        currentRoomId: 'living_room', enteredAt: new Date().toISOString(), gameId
      })
    }

    // 不能原地不动
    if (loc.currentRoomId === targetRoomId) {
      return res.status(400).json({ success: false, error: '你已经在这个房间了' })
    }

    // 特殊隔离区域（初入屋/陪审屋）：选手无法自行进出，仅管理员可安排
    const currentRoomDoc = await BBHouseRoom.findOne({ id: loc.currentRoomId, gameId })
    if (currentRoomDoc?.accessRule === 'admin_only') {
      return res.status(403).json({ success: false, error: '你当前处于特殊区域，只能由管理员安排移动' })
    }
    if (targetRoom.accessRule === 'admin_only') {
      return res.status(403).json({ success: false, error: '该区域只能由管理员安排进入' })
    }

    // 4. 通道存在
    const passages = await BBHousePassage.find({ gameId })
    const passage = passages.find(p =>
      (p.from === loc.currentRoomId && p.to === targetRoomId) ||
      (p.to === loc.currentRoomId && p.from === targetRoomId)
    )
    if (!passage) return res.status(403).json({ success: false, error: '不可达：两个房间之间没有通道' })

    // 5. 通道开放（door 检查）
    if (passage.type === 'door' && passage.doorId) {
      const door = await BBHouseDoor.findOne({ id: passage.doorId, gameId })
      if (door && !door.isOpen) {
        return res.status(403).json({ success: false, error: '门已关闭' })
      }
    }

    // 6. 权限检查
    const hoh = await getCurrentHoh()
    const hohId = hoh ? hoh.id : null
    if (targetRoom.accessRule === 'hoh_only') {
      if (hohId !== req.user.userId) {
        return res.status(403).json({ success: false, error: '仅 HOH 可进入' })
      }
    } else if (targetRoom.accessRule === 'hoh_or_invited') {
      if (hohId !== req.user.userId) {
        // 检查是否被邀请（第一阶段简化：只允许 HOH）
        return res.status(403).json({ success: false, error: '需要 HOH 邀请' })
      }
    } else if (targetRoom.accessRule === 'have_not_only') {
      // 任何人（无论是否 Have-Not）都可进入贫民屋
    } else if (targetRoom.accessRule === 'single') {
      const count = await BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId, gameId })
      if (count >= 1) {
        return res.status(403).json({ success: false, error: 'Diary Room 已有人在内' })
      }
    }

    // 7. 容量检查（包含正在前往该房间的玩家，避免同时移动超员）
    if (targetRoom.capacity) {
      const [count, movingCount] = await Promise.all([
        BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId, gameId }),
        BBHouseguest.countDocuments({ gameId, isMoving: true, moveToRoomId: targetRoomId })
      ])
      if (count + movingCount >= targetRoom.capacity) {
        return res.status(403).json({ success: false, error: '人数已满请稍后重试' })
      }
    }

    // 执行计时移动（到达时间由服务端控制）
    const oldRoomId = loc.currentRoomId
    const durationSeconds = Math.max(0, Number(targetRoom.moveDuration ?? 10))
    const moveInfo = await startTimedMove({
      playerId: player.id,
      fromRoomId: oldRoomId,
      toRoomId: targetRoomId,
      durationSeconds,
      reason: '移动中'
    })

    res.json({
      success: true,
      data: { oldRoomId, newRoomId: targetRoomId, playerName: player.name, ...moveInfo }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '移动失败' })
  }
})

// POST /invite - HOH 邀请玩家进入 HOH Room
router.post('/invite', auth, async (req, res) => {
  try {
    const { targetPlayerId } = req.body
    if (!targetPlayerId) return res.status(400).json({ success: false, error: '缺少目标玩家' })

    const hoh = await getCurrentHoh()
    if (!hoh || hoh.id !== req.user.userId) {
      return res.status(403).json({ success: false, error: '仅 HOH 可邀请' })
    }

    const target = await BBHouseguest.findOne({ id: targetPlayerId, gameId: 'bigbrother' })
    if (!target || target.status !== 'active') {
      return res.status(400).json({ success: false, error: '目标玩家不存在或不活跃' })
    }

    // 邀请通过 socket 推送，REST 仅做校验
    res.json({
      success: true,
      data: {
        targetId: targetPlayerId,
        targetName: target.name,
        roomId: 'hoh_room'
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '邀请失败' })
  }
})

// POST /accept-invite - 接受 HOH 邀请
router.post('/accept-invite', auth, async (req, res) => {
  try {
    const player = await BBHouseguest.findOne({ id: req.user.userId, gameId: 'bigbrother' })
    if (!player || player.status !== 'active') {
      return res.status(403).json({ success: false, error: '非活跃玩家' })
    }

    // 必须存在待处理的 HOH 邀请
    if (!takePendingInvite(req.user.userId)) {
      return res.status(403).json({ success: false, error: '没有待处理的 HOH 邀请' })
    }

    if (player.isSleeping) return res.status(403).json({ success: false, error: '睡眠中无法移动' })
    if (player.isShowering) return res.status(403).json({ success: false, error: '洗澡中无法移动' })
    if (player.isMoving) return res.status(403).json({ success: false, error: '移动中' })

    let loc = await BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' })
    const oldRoomId = loc?.currentRoomId || 'living_room'
    const targetRoom = await BBHouseRoom.findOne({ id: 'hoh_room', gameId: 'bigbrother' })
    const durationSeconds = Math.max(0, Number(targetRoom?.moveDuration ?? 10))

    const moveInfo = await startTimedMove({
      playerId: req.user.userId,
      fromRoomId: oldRoomId,
      toRoomId: 'hoh_room',
      durationSeconds,
      reason: '接受 HOH 邀请'
    })

    res.json({ success: true, data: { oldRoomId, newRoomId: 'hoh_room', playerName: player.name, ...moveInfo } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '接受邀请失败' })
  }
})

// ===== HOH API =====

// GET /hoh-monitor - 监控（仅人数）：身处 HOH 房的房客或管理员可看
router.get('/hoh-monitor', auth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin'
    const myLoc = await BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' })
    const inHohRoom = !!(myLoc && myLoc.currentRoomId === 'hoh_room')
    if (!isAdmin && !inHohRoom) {
      return res.status(403).json({ success: false, error: '仅身处 HOH 房时才能查看监控' })
    }

    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })
    const result = []
    for (const room of rooms) {
      // 不显示 Diary Room 与特殊隔离区域（初入屋/陪审屋）
      if (room.type === 'hidden' || room.accessRule === 'admin_only') continue
      const count = await BBPlayerLocation.countDocuments({ currentRoomId: room.id, gameId: 'bigbrother' })
      result.push({ roomId: room.id, roomName: room.name, icon: room.icon, count })
    }
    res.json({ success: true, data: result })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取监控数据失败' })
  }
})

// ===== 管理员 API =====

// POST /admin/door - 开关门
router.post('/admin/door', auth, requireAdmin, async (req, res) => {
  try {
    const { doorId, isOpen } = req.body
    if (!doorId) return res.status(400).json({ success: false, error: '缺少门 ID' })

    const door = await BBHouseDoor.findOne({ id: doorId, gameId: 'bigbrother' })
    if (!door) return res.status(404).json({ success: false, error: '门不存在' })

    door.isOpen = !!isOpen
    door.updatedAt = new Date().toISOString()
    await door.save()

    // 同步 season 状态（如果是后院门）
    if (doorId === 'backyard_door') {
      const season = await getCurrentSeason()
      if (season) {
        season.backyardDoorOpen = door.isOpen
        season.updatedAt = new Date().toISOString()
        await season.save()
      }
    }

    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.TWIST_CONFIG_SAVED, 'house', doorId,
      `后院门${door.isOpen ? '打开' : '关闭'}`)

    // 实时广播给所有玩家
    broadcastDoorUpdate(doorId, door.isOpen)

    res.json({ success: true, data: door.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// POST /admin/evict-backyard - 关闭后院门并清空后院
router.post('/admin/evict-backyard', auth, requireAdmin, async (req, res) => {
  try {
    const gameId = 'bigbrother'

    // 关闭后院门
    const door = await BBHouseDoor.findOne({ id: 'backyard_door', gameId })
    if (door) {
      door.isOpen = false
      door.updatedAt = new Date().toISOString()
      await door.save()
    }
    const season = await getCurrentSeason()
    if (season) {
      season.backyardDoorOpen = false
      season.updatedAt = new Date().toISOString()
      await season.save()
    }

    // 将后院玩家移到客厅
    const backyardPlayers = await BBPlayerLocation.find({ currentRoomId: 'backyard', gameId })
    const moved = []
    for (const loc of backyardPlayers) {
      const oldRoomId = loc.currentRoomId
      loc.currentRoomId = 'living_room'
      loc.enteredAt = new Date().toISOString()
      await loc.save()

      // 同步 BBHouseguest
      const hg = await BBHouseguest.findOne({ id: loc.playerId, gameId })
      if (hg) {
        hg.currentRoomId = 'living_room'
        clearGuestMoveState(hg)
        await hg.save()
      }
      moved.push(loc.playerName)

      // 服务端权威切换 socket 房间 + 实时广播
      await movePlayerSockets(loc.playerId, oldRoomId, 'living_room', '后院门已关闭，管理员将你移至客厅')
    }

    // 实时广播门状态
    broadcastDoorUpdate('backyard_door', false)

    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.TWIST_CONFIG_SAVED, 'house', 'backyard_door',
      `关闭后院门并清空后院，移动 ${moved.length} 人`)

    res.json({ success: true, data: { movedPlayers: moved } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清空后院失败' })
  }
})

// 保存广播记录（供选手端与管理员端查看历史）
async function saveBroadcastRecord(payload, roomId = null, room = null) {
  try {
    const doc = new BBBroadcast({
      id: generateId(),
      type: payload.type || 'notice',
      roomId: roomId || null,
      roomName: room?.name || '',
      roomIcon: room?.icon || '',
      message: payload.message || '',
      from: payload.from || '',
      gameId: 'bigbrother',
      createdAt: payload.at || new Date().toISOString()
    })
    await doc.save()
  } catch (e) {
    console.error('[BBBroadcast] save failed:', e)
  }
}

// GET /broadcasts - 广播通知历史（选手端 / 管理员端）
router.get('/broadcasts', auth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 50))
    const docs = await BBBroadcast.find({ gameId: 'bigbrother' })
    const list = docs
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
      .slice(0, limit)
      .map(d => d.toObject())
    res.json({ success: true, data: list })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取广播记录失败' })
  }
})

// DELETE /broadcasts/:id - 管理员删除单条广播记录
router.delete('/broadcasts/:id', auth, requireAdmin, async (req, res) => {
  try {
    const result = await BBBroadcast.deleteOne({ id: req.params.id, gameId: 'bigbrother' })
    if (!result || !result.deletedCount) {
      return res.status(404).json({ success: false, error: '广播记录不存在' })
    }
    res.json({ success: true, data: null })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除广播记录失败' })
  }
})

// DELETE /broadcasts - 管理员清空全部广播记录
router.delete('/broadcasts', auth, requireAdmin, async (req, res) => {
  try {
    const result = await BBBroadcast.deleteMany({ gameId: 'bigbrother' })
    res.json({ success: true, data: { deleted: result?.deletedCount || 0 } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清空广播记录失败' })
  }
})

// POST /admin/broadcast - 管理员广播（通知 / 邀请所有人到某房间）
router.post('/admin/broadcast', auth, requireAdmin, async (req, res) => {
  try {
    const { type = 'notice', roomId = null, message = '' } = req.body || {}
    const gameId = 'bigbrother'

    if (type === 'invite') {
      if (!roomId) {
        return res.status(400).json({ success: false, error: '邀请广播需要指定房间' })
      }
      const targetRoom = await BBHouseRoom.findOne({ id: roomId, gameId })
      if (!targetRoom) return res.status(404).json({ success: false, error: '目标房间不存在' })

      // 邀请 = 强制移动所有房客到目标房间（忽略拓扑/门/权限）
      const houseguests = await BBHouseguest.find({ gameId, role: 'houseguest' })
      const moved = []
      for (const p of houseguests) {
        if (p.status !== 'active') continue
        let loc = await BBPlayerLocation.findOne({ playerId: p.id, gameId })
        const oldRoomId = loc?.currentRoomId || 'living_room'
        if (!loc) {
          loc = new BBPlayerLocation({
            id: p.id, playerId: p.id, playerName: p.name,
            currentRoomId: roomId, enteredAt: new Date().toISOString(), gameId
          })
          await loc.save()
        } else if (oldRoomId !== roomId) {
          loc.currentRoomId = roomId
          loc.enteredAt = new Date().toISOString()
          await loc.save()
        } else {
          continue // 已在该房间
        }
        p.currentRoomId = roomId
        clearGuestMoveState(p)
        await p.save()
        // 服务端权威切换 socket 房间 + 记录位置历史 + 实时通知
        await movePlayerSockets(p.id, oldRoomId, roomId, `管理员邀请前往 ${targetRoom.name}`)
        moved.push(p.name)
      }

      const payload = {
        type,
        roomId,
        roomName: targetRoom.name,
        roomIcon: targetRoom.icon,
        message: (message || '').trim() || `管理员邀请所有人前往「${targetRoom.name}」`,
        from: req.user.name || '管理员',
        at: new Date().toISOString()
      }
      broadcastHouse('house:broadcast', payload)
      broadcastBBGame('bb:broadcast', payload)
      await saveBroadcastRecord(payload, roomId, targetRoom)
      return res.json({ success: true, data: { ...payload, movedCount: moved.length } })
    }

    // 普通通知
    const payload = {
      type: 'notice',
      roomId: null,
      message: (message || '').trim(),
      from: req.user.name || '管理员',
      at: new Date().toISOString()
    }
    broadcastHouse('house:broadcast', payload)
    broadcastBBGame('bb:broadcast', payload)
    await saveBroadcastRecord(payload)
    res.json({ success: true, data: payload })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '广播失败' })
  }
})

// GET /admin/locations - 管理员查看所有玩家位置
router.get('/admin/locations', auth, requireAdmin, async (req, res) => {
  try {
    const locations = await BBPlayerLocation.find({ gameId: 'bigbrother' })
    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })

    // 按房间分组
    const avatars = {}
    const guests = await BBHouseguest.find({ gameId: 'bigbrother' })
    guests.forEach(g => { avatars[g.id] = g.avatar || null })
    const grouped = {}
    for (const room of rooms) {
      grouped[room.id] = { room: room.toObject(), players: [] }
    }
    for (const loc of locations) {
      if (grouped[loc.currentRoomId]) {
        grouped[loc.currentRoomId].players.push({
          playerId: loc.playerId,
          playerName: loc.playerName,
          avatar: avatars[loc.playerId] || null,
          enteredAt: loc.enteredAt
        })
      }
    }

    res.json({ success: true, data: grouped })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取位置信息失败' })
  }
})

// POST /admin/move-player - 管理员强制移动玩家
router.post('/admin/move-player', auth, requireAdmin, async (req, res) => {
  try {
    const { playerId, targetRoomId } = req.body
    if (!playerId || !targetRoomId) {
      return res.status(400).json({ success: false, error: '缺少参数' })
    }

    const gameId = 'bigbrother'
    const player = await BBHouseguest.findOne({ id: playerId, gameId })
    if (!player) return res.status(404).json({ success: false, error: '玩家不存在' })
    if (player.role === 'admin') {
      return res.status(400).json({ success: false, error: '管理员不进入任何房间（上帝视角）' })
    }

    const targetRoom = await BBHouseRoom.findOne({ id: targetRoomId, gameId })
    if (!targetRoom) return res.status(404).json({ success: false, error: '目标房间不存在' })

    let loc = await BBPlayerLocation.findOne({ playerId, gameId })
    if (!loc) {
      loc = new BBPlayerLocation({
        id: playerId, playerId, playerName: player.name,
        currentRoomId: 'living_room', enteredAt: new Date().toISOString(), gameId
      })
    }

    const oldRoomId = loc.currentRoomId
    loc.currentRoomId = targetRoomId
    loc.enteredAt = new Date().toISOString()
    await loc.save()

    player.currentRoomId = targetRoomId
    clearGuestMoveState(player)
    await player.save()

    // 服务端权威切换 socket 房间 + 实时广播
    await movePlayerSockets(playerId, oldRoomId, targetRoomId, '管理员强制移动')

    res.json({
      success: true,
      data: { playerId, playerName: player.name, oldRoomId, newRoomId: targetRoomId }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '强制移动失败' })
  }
})

// POST /admin/init-locations - 为所有活跃玩家初始化位置
router.post('/admin/init-locations', auth, requireAdmin, async (req, res) => {
  try {
    const gameId = 'bigbrother'
    // 管理员不进入任何房间，仅为房客初始化位置
    const activePlayers = await BBHouseguest.find({ gameId, status: 'active', role: 'houseguest' })
    let created = 0
    for (const p of activePlayers) {
      const existing = await BBPlayerLocation.findOne({ playerId: p.id, gameId })
      if (!existing) {
        const loc = new BBPlayerLocation({
          id: p.id, playerId: p.id, playerName: p.name,
          currentRoomId: 'living_room', enteredAt: new Date().toISOString(), gameId
        })
        await loc.save()
        created++
      }
    }
    res.json({ success: true, data: { created } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '初始化位置失败' })
  }
})

// ===== 睡眠 / 洗澡 / 状态 =====

function todayStr(d = new Date()) {
  return localDateStr(d)
}

// 结束洗澡：进入冷却，并把仍在浴室的玩家移动到洗漱间
async function finishShower(g, season, now = new Date()) {
  g.isShowering = false
  g.showerStartedAt = null
  g.lastShowerDate = localDateStr(now)
  g.showerCooldownUntil = getShowerCooldownUntil(season, now)
  await g.save()

  const loc = await BBPlayerLocation.findOne({ playerId: g.id, gameId: 'bigbrother' })
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

// GET /my-state - 当前玩家的睡眠/洗澡状态
router.get('/my-state', auth, async (req, res) => {
  try {
    const g = await BBHouseguest.findOne({ id: req.user.userId, gameId: 'bigbrother' })
    const season = await getCurrentSeason()
    const now = new Date()
    const sleepState = getSleepState(season, now, g?.lastSleepDate)
    const showerSettings = getShowerSettings(season)
    const hohApprovedGuest = await BBHouseguest.findOne({ gameId: 'bigbrother', hohSleepApproved: true })
    res.json({
      success: true,
      data: {
        isSleeping: g?.isSleeping || false,
        sleepStartedAt: g?.sleepStartedAt || null,
        wakeAt: g?.wakeAt || null,
        lastSleepDate: g?.lastSleepDate || null,
        hohSleepApproved: g?.hohSleepApproved || false,
        hohApprovedPlayerId: hohApprovedGuest?.id || null,
        hohApprovedPlayerName: hohApprovedGuest?.name || '',
        isShowering: g?.isShowering || false,
        showerStartedAt: g?.showerStartedAt || null,
        lastShowerDate: g?.lastShowerDate || null,
        showerCooldownUntil: g?.showerCooldownUntil || null,
        isMoving: g?.isMoving || false,
        moveFromRoomId: g?.moveFromRoomId || null,
        moveToRoomId: g?.moveToRoomId || null,
        moveStartedAt: g?.moveStartedAt || null,
        moveEndsAt: g?.moveEndsAt || null,
        moveDurationSeconds: g?.moveDurationSeconds ?? null,
        today: localDateStr(now),
        sleepCycleDate: sleepState.cycleDate,
        sleepCompleted: sleepState.completed,
        canSleepNow: sleepState.inWindow,
        sleepWindowStart: sleepState.sleepWindowStart,
        sleepWindowEnd: sleepState.sleepWindowEnd,
        sleepWindowEndAt: new Date(sleepState.endAt).toISOString(),
        sleepDurationMinutes: sleepState.sleepDurationMinutes,
        showerCooldownMinutes: showerSettings.showerCooldownMinutes,
        showerDurationMinutes: showerSettings.showerDurationMinutes,
        hohSleepAllowed: season?.hohSleepAllowed ?? true,
        now: Date.now()
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取状态失败' })
  }
})

// POST /sleep - 开始睡觉
router.post('/sleep', auth, async (req, res) => {
  try {
    const gameId = 'bigbrother'
    const g = await BBHouseguest.findOne({ id: req.user.userId, gameId })
    if (!g || g.status !== 'active') return res.status(403).json({ success: false, error: '非活跃玩家' })
    if (g.isSleeping) return res.status(400).json({ success: false, error: '你已在睡眠中' })
    if (g.isShowering) return res.status(400).json({ success: false, error: '洗澡中无法睡觉' })

    const now = new Date()
    const season = await getCurrentSeason()
    const sleepState = getSleepState(season, now, g.lastSleepDate)
    if (sleepState.completed) {
      return res.status(400).json({ success: false, error: '本睡眠周期已完成' })
    }
    if (!sleepState.inWindow) {
      return res.status(400).json({
        success: false,
        error: `当前不在可睡觉时间范围（${sleepState.sleepWindowStart} - ${sleepState.sleepWindowEnd}）`
      })
    }

    const loc = await BBPlayerLocation.findOne({ playerId: g.id, gameId })
    const room = await BBHouseRoom.findOne({ id: loc?.currentRoomId, gameId })
    if (!room || !room.canSleep) return res.status(400).json({ success: false, error: '该房间不能睡觉' })

    const hoh = await getCurrentHoh()
    const isHoh = !!(hoh && hoh.id === g.id)

    if (g.isHaveNot && room.id !== 'have_not_room') {
      return res.status(403).json({ success: false, error: '贫民只能在贫民屋睡觉' })
    }
    if (room.id === 'hoh_room' && !isHoh && !g.isHaveNot) {
      if (season && season.hohSleepAllowed === false) {
        return res.status(403).json({ success: false, error: '本周 HOH 房睡觉已关闭' })
      }
      if (!g.hohSleepApproved) {
        return res.status(403).json({ success: false, error: '需要 HOH 同意才能在 HOH 房睡觉' })
      }
    }
    if (room.bedLimit) {
      const sleepingCount = await BBHouseguest.countDocuments({ gameId, isSleeping: true, currentRoomId: room.id })
      if (sleepingCount >= room.bedLimit) {
        return res.status(400).json({ success: false, error: '床位已满' })
      }
    }

    g.isSleeping = true
    g.sleepStartedAt = now.toISOString()
    g.wakeAt = new Date(now.getTime() + sleepState.sleepDurationMinutes * 60 * 1000).toISOString()
    g.lastSleepDate = sleepState.cycleDate
    await g.save()
    await sleepHistory.startSleep(g.id, g.sleepStartedAt)
    res.json({ success: true, data: { wakeAt: g.wakeAt, sleepCycleDate: g.lastSleepDate, sleepDurationMinutes: sleepState.sleepDurationMinutes } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '睡觉失败' })
  }
})

// POST /sleep/wake - 醒来（必须满管理员设置的睡眠时长）
router.post('/sleep/wake', auth, async (req, res) => {
  try {
    const g = await BBHouseguest.findOne({ id: req.user.userId, gameId: 'bigbrother' })
    if (!g || !g.isSleeping) return res.status(400).json({ success: false, error: '你不在睡眠中' })
    if (g.wakeAt && Date.now() < new Date(g.wakeAt).getTime()) {
      return res.status(400).json({ success: false, error: '还没到可以醒来的时间' })
    }
    g.isSleeping = false
    await g.save()
    // 以手动点击醒来的实际时间为睡眠结束边界
    await sleepHistory.endSleep(g.id, new Date().toISOString(), g.sleepStartedAt)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '醒来失败' })
  }
})

// POST /sleep/approve - HOH 选择唯一获批在 HOH 房睡觉的玩家（playerId 为空表示不选择）
router.post('/sleep/approve', auth, async (req, res) => {
  try {
    const { playerId } = req.body || {}
    const hoh = await getCurrentHoh()
    const isHoh = !!(hoh && hoh.id === req.user.userId)
    if (!isHoh && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅 HOH 可同意' })
    }

    if (!playerId) {
      const approved = await BBHouseguest.find({ gameId: 'bigbrother', hohSleepApproved: true })
      for (const g of approved) {
        g.hohSleepApproved = false
        await g.save()
      }
      return res.json({ success: true, data: { playerId: null, playerName: '' } })
    }

    const target = await BBHouseguest.findOne({ id: playerId, gameId: 'bigbrother' })
    if (!target) return res.status(404).json({ success: false, error: '玩家不存在' })

    // 同一时间只允许 1 人获批
    const approved = await BBHouseguest.find({ gameId: 'bigbrother', hohSleepApproved: true })
    for (const g of approved) {
      if (g.id !== target.id) {
        g.hohSleepApproved = false
        await g.save()
      }
    }
    target.hohSleepApproved = true
    await target.save()
    res.json({ success: true, data: { playerId, playerName: target.name } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// POST /shower - 开始洗澡（仅浴室，不限次数，受冷却限制）
router.post('/shower', auth, async (req, res) => {
  try {
    const gameId = 'bigbrother'
    const g = await BBHouseguest.findOne({ id: req.user.userId, gameId })
    if (!g || g.status !== 'active') return res.status(403).json({ success: false, error: '非活跃玩家' })
    if (g.isSleeping) return res.status(400).json({ success: false, error: '睡眠中无法洗澡' })
    if (g.isShowering) return res.status(400).json({ success: false, error: '你已在洗澡' })
    const loc = await BBPlayerLocation.findOne({ playerId: g.id, gameId })
    if (!loc || loc.currentRoomId !== 'bathroom') {
      return res.status(400).json({ success: false, error: '只能在浴室洗澡' })
    }
    if (g.showerCooldownUntil) {
      const remainMs = new Date(g.showerCooldownUntil).getTime() - Date.now()
      if (remainMs > 0) {
        return res.status(400).json({ success: false, error: `洗澡冷却中，还需 ${Math.ceil(remainMs / 60000)} 分钟` })
      }
    }
    const now = new Date()
    g.isShowering = true
    g.showerStartedAt = now.toISOString()
    g.lastShowerDate = localDateStr(now)
    g.showerCooldownUntil = null
    await g.save()
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '操作失败' })
  }
})

// ===== 管理员：房间人数/床位、赛季时间 =====

// POST /admin/room - 调整房间人数上限 / 床位 / 是否可睡觉
router.post('/admin/room', auth, requireAdmin, async (req, res) => {
  try {
    const { roomId, capacity, bedLimit, canSleep, moveDuration } = req.body || {}
    const room = await BBHouseRoom.findOne({ id: roomId, gameId: 'bigbrother' })
    if (!room) return res.status(404).json({ success: false, error: '房间不存在' })
    if (capacity !== undefined) room.capacity = (capacity === '' || capacity === null) ? null : Number(capacity)
    if (bedLimit !== undefined) room.bedLimit = (bedLimit === '' || bedLimit === null) ? null : Number(bedLimit)
    if (canSleep !== undefined) room.canSleep = !!canSleep
    if (moveDuration !== undefined) {
      const n = Number(moveDuration)
      if (!Number.isFinite(n) || n < 0 || n > 3600) {
        return res.status(400).json({ success: false, error: '移动耗时应在 0-3600 秒之间' })
      }
      room.moveDuration = Math.round(n)
    }
    room.updatedAt = new Date().toISOString()
    await room.save()
    res.json({ success: true, data: room.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '调整失败' })
  }
})

// POST /admin/room-move-duration - 批量设置房间移动耗时（roomIds 为空则全部房间）
router.post('/admin/room-move-duration', auth, requireAdmin, async (req, res) => {
  try {
    const { moveDuration, roomIds } = req.body || {}
    const n = Number(moveDuration)
    if (!Number.isFinite(n) || n < 0 || n > 3600) {
      return res.status(400).json({ success: false, error: '移动耗时应在 0-3600 秒之间' })
    }
    const value = Math.round(n)
    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })
    const targetIds = Array.isArray(roomIds) && roomIds.length ? new Set(roomIds) : null
    let updated = 0
    for (const room of rooms) {
      if (targetIds && !targetIds.has(room.id)) continue
      room.moveDuration = value
      room.updatedAt = new Date().toISOString()
      await room.save()
      updated++
    }
    res.json({ success: true, data: { updated, moveDuration: value } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '批量调整失败' })
  }
})

// POST /admin/season - 调整睡眠规则 / 洗澡冷却 / HOH 房睡觉开关
router.post('/admin/season', auth, requireAdmin, async (req, res) => {
  try {
    const {
      autoSleepHour,
      sleepDurationMinutes,
      sleepWindowStart,
      sleepWindowEnd,
      showerCooldownMinutes,
      hohSleepAllowed
    } = req.body || {}
    const season = await getCurrentSeason()
    if (!season) return res.status(404).json({ success: false, error: '赛季不存在' })
    if (sleepWindowStart !== undefined && !isValidHHMM(sleepWindowStart)) {
      return res.status(400).json({ success: false, error: '睡觉开始时间格式应为 HH:mm' })
    }
    if (sleepWindowEnd !== undefined && !isValidHHMM(sleepWindowEnd)) {
      return res.status(400).json({ success: false, error: '睡觉结束时间格式应为 HH:mm' })
    }
    if (sleepDurationMinutes !== undefined) {
      const n = Number(sleepDurationMinutes)
      if (!Number.isFinite(n) || n <= 0 || n > 1440) {
        return res.status(400).json({ success: false, error: '单次睡觉时长应在 1-1440 分钟之间' })
      }
      season.sleepDurationMinutes = Math.round(n)
    }
    if (sleepWindowStart !== undefined) season.sleepWindowStart = sleepWindowStart
    if (sleepWindowEnd !== undefined) season.sleepWindowEnd = sleepWindowEnd
    if (showerCooldownMinutes !== undefined) {
      const n = Number(showerCooldownMinutes)
      if (!Number.isFinite(n) || n < 0 || n > 1440) {
        return res.status(400).json({ success: false, error: '洗澡冷却应在 0-1440 分钟之间' })
      }
      season.showerCooldownMinutes = Math.round(n)
    }
    // 兼容旧调用：autoSleepHour -> sleepWindowStart
    if (autoSleepHour !== undefined && sleepWindowStart === undefined) {
      const h = Number(autoSleepHour)
      if (Number.isFinite(h) && h >= 0 && h <= 23) {
        season.sleepWindowStart = `${String(Math.round(h)).padStart(2, '0')}:00`
      }
    }
    if (hohSleepAllowed !== undefined) season.hohSleepAllowed = !!hohSleepAllowed
    season.updatedAt = new Date().toISOString()
    await season.save()
    res.json({
      success: true,
      data: {
        sleepDurationMinutes: season.sleepDurationMinutes,
        sleepWindowStart: season.sleepWindowStart,
        sleepWindowEnd: season.sleepWindowEnd,
        showerCooldownMinutes: season.showerCooldownMinutes,
        hohSleepAllowed: season.hohSleepAllowed
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '调整失败' })
  }
})

// GET /photo-wall - 餐厅照片墙（所有房客，按管理员设定顺序）
router.get('/photo-wall', auth, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const guests = await BBHouseguest.find({ gameId: 'bigbrother', role: 'houseguest' })
    const byId = {}
    guests.forEach(g => { byId[g.id] = g })
    const ordered = []
    for (const id of (season?.photoWallOrder || [])) {
      if (byId[id]) { ordered.push(byId[id]); delete byId[id] }
    }
    const rest = guests.filter(g => byId[g.id]).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    const players = [...ordered, ...rest].map(g => ({ id: g.id, name: g.name, avatar: g.avatar || null, status: g.status }))
    res.json({ success: true, data: { players, order: players.map(p => p.id) } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取照片墙失败' })
  }
})

// POST /admin/photo-wall-order - 管理员调整照片墙展示顺序
router.post('/admin/photo-wall-order', auth, requireAdmin, async (req, res) => {
  try {
    const { order } = req.body
    if (!Array.isArray(order)) return res.status(400).json({ success: false, error: 'order 必须为数组' })
    const season = await getCurrentSeason()
    season.photoWallOrder = order
    season.updatedAt = new Date().toISOString()
    await season.save()
    res.json({ success: true, data: { order } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存照片墙顺序失败' })
  }
})

// POST /admin/send-message - 管理员（上帝视角）向指定房间发言
router.post('/admin/send-message', auth, requireAdmin, async (req, res) => {
  try {
    const { roomId, content } = req.body || {}
    if (!roomId) return res.status(400).json({ success: false, error: '缺少目标房间' })
    if (!content || !String(content).trim()) {
      return res.status(400).json({ success: false, error: '消息内容不能为空' })
    }
    const room = await BBHouseRoom.findOne({ id: roomId, gameId: 'bigbrother' })
    if (!room) return res.status(404).json({ success: false, error: '房间不存在' })

    const adminUser = await BBHouseguest.findOne({ id: req.user.userId, gameId: 'bigbrother' })
    const message = await postRoomMessage(roomId, {
      senderId: req.user.userId,
      senderName: adminUser?.name || req.user.name || '管理员',
      senderRole: 'admin',
      senderAvatar: adminUser?.avatar || null,
      content: String(content).trim()
    })
    if (!message) return res.status(500).json({ success: false, error: '发送失败' })
    res.json({ success: true, data: message })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '发送失败' })
  }
})

// 计算每条消息在发送时被哪些房客看到（优先使用 visibleTo 快照，旧消息按位置/睡眠历史兜底）
async function attachSeenBy(messages, guests) {
  const gameId = 'bigbrother'
  const guestById = {}
  guests.forEach(g => { guestById[g.id] = { playerId: g.id, name: g.name, avatar: g.avatar || null } })

  // 仅在存在旧消息（没有 visibleTo 快照）时才需要读取位置/睡眠记录兜底
  const hasLegacy = messages.some(m => !Array.isArray(m.visibleTo))
  const sleepByPlayer = {}
  const byRoom = {}
  if (hasLegacy) {
    // 睡眠时间段（以玩家实际点击醒来的时间为结束边界）
    const sleepRecords = await BBSleepRecord.find({ gameId })
    for (const rec of sleepRecords) {
      const from = new Date(rec.from).getTime()
      if (!Number.isFinite(from)) continue
      const to = rec.to ? new Date(rec.to).getTime() : Infinity
      if (!sleepByPlayer[rec.playerId]) sleepByPlayer[rec.playerId] = []
      sleepByPlayer[rec.playerId].push({ from, to })
    }
    // 兼容升级前已存在的睡眠记录（没有 BBSleepRecord）
    guests.forEach(g => {
      if (sleepByPlayer[g.id] || !g.sleepStartedAt) return
      const from = new Date(g.sleepStartedAt).getTime()
      if (!Number.isFinite(from)) return
      const to = g.isSleeping ? Infinity : (g.wakeAt ? new Date(g.wakeAt).getTime() : Infinity)
      sleepByPlayer[g.id] = [{ from, to }]
    })

    // 位置历史按房间分组
    const history = await BBLocationHistory.find({ gameId })
    history.forEach(h => {
      if (!byRoom[h.roomId]) byRoom[h.roomId] = []
      byRoom[h.roomId].push({ playerId: h.playerId, from: h.from, to: h.to })
    })
  }

  return messages.map(m => {
    let seenIds
    if (Array.isArray(m.visibleTo)) {
      // 新消息：使用发送时的可见者快照（已排除睡眠中的玩家）
      seenIds = m.visibleTo.filter(id => !!guestById[id])
    } else {
      // 旧消息：按位置历史 + 睡眠记录兜底
      const ivs = byRoom[m.roomId] || []
      const t = new Date(m.createdAt).getTime()
      const seen = new Set()
      for (const iv of ivs) {
        const from = new Date(iv.from).getTime()
        const to = iv.to ? new Date(iv.to).getTime() : Infinity
        // 仅统计仍存在的房客，过滤已删除/已不存在的历史记录
        if (t >= from && t <= to && guestById[iv.playerId]) {
          const intervals = sleepByPlayer[iv.playerId] || []
          const inSleep = intervals.some(s => t >= s.from && t <= s.to)
          if (!inSleep) seen.add(iv.playerId)
        }
      }
      seenIds = Array.from(seen)
    }
    const seenBy = seenIds.map(id => guestById[id])
    return { ...m.toObject(), seenIds, seenBy }
  })
}

// GET /admin/chat-logs - 管理员查看所有房间聊天记录，并计算每条消息被哪些房客看到
router.get('/admin/chat-logs', auth, requireAdmin, async (req, res) => {
  try {
    const gameId = 'bigbrother'
    const { roomId, before } = req.query
    const filter = { gameId, chatType: 'room' }
    if (roomId) filter.roomId = roomId
    if (before) filter.createdAt = { $lt: before }

    // 每次取 301 条判断是否还有更早的记录，返回其中最近的 300 条
    const page = await BBChatMessage.findPaginated(filter, {
      sort: { createdAt: -1 },
      limit: 301
    })
    const hasMore = page.data.length > 300
    const limited = page.data.slice(0, 300).reverse()

    const rooms = await BBHouseRoom.find({ gameId })
    const guests = await BBHouseguest.find({ gameId })

    // 当前每个房间的实际人数（实时轮询返回）
    const currentLocations = await BBPlayerLocation.find({ gameId })
    const occupancy = {}
    for (const loc of currentLocations) {
      if (!loc.currentRoomId) continue
      occupancy[loc.currentRoomId] = (occupancy[loc.currentRoomId] || 0) + 1
    }

    const result = await attachSeenBy(limited, guests)

    res.json({ success: true, data: { rooms: rooms.map(r => r.toObject()), messages: result, hasMore, occupancy } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取聊天记录失败' })
  }
})

// GET /admin/chat-logs/export - 导出聊天记录为 .txt（支持时间范围 / 发送者 / 接收者视角 / 房间 / 关键词筛选）
router.get('/admin/chat-logs/export', auth, requireAdmin, async (req, res) => {
  try {
    const gameId = 'bigbrother'
    const { roomId, senderId, receiverId, keyword } = req.query

    const filter = { gameId, chatType: 'room' }
    if (roomId) filter.roomId = roomId
    if (senderId) filter.senderId = senderId

    const createdAt = {}
    if (req.query.start) {
      const start = new Date(req.query.start)
      if (!Number.isNaN(start.getTime())) createdAt.$gte = start.toISOString()
    }
    if (req.query.end) {
      const end = new Date(req.query.end)
      if (!Number.isNaN(end.getTime())) createdAt.$lte = end.toISOString()
    }
    if (Object.keys(createdAt).length) filter.createdAt = createdAt

    if (keyword && String(keyword).trim()) {
      const escaped = String(keyword).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const re = new RegExp(escaped, 'i')
      filter.$or = [{ content: re }, { senderName: re }]
    }

    const MAX_EXPORT = 50000
    const page = await BBChatMessage.findPaginated(filter, {
      sort: { createdAt: 1 },
      limit: MAX_EXPORT + 1
    })
    if (page.data.length > MAX_EXPORT) {
      return res.status(400).json({ success: false, error: `符合条件的消息超过 ${MAX_EXPORT} 条，请缩小时间范围后重试` })
    }

    const rooms = await BBHouseRoom.find({ gameId })
    const roomNameById = {}
    rooms.forEach(r => { roomNameById[r.id] = r.name || r.id })
    const guests = await BBHouseguest.find({ gameId })
    const guestNameById = {}
    guests.forEach(g => { guestNameById[g.id] = g.name || g.id })

    let messages = await attachSeenBy(page.data, guests)

    // 接收者视角：仅保留该玩家当时能看到的消息（自己发送的消息始终可见）
    if (receiverId) {
      messages = messages.filter(m =>
        m.senderId === receiverId ||
        (Array.isArray(m.seenIds) ? m.seenIds.includes(receiverId) : (m.seenBy || []).some(v => v.playerId === receiverId))
      )
    }

    const pad = n => String(n).padStart(2, '0')
    const fmt = iso => {
      const d = new Date(iso)
      if (Number.isNaN(d.getTime())) return String(iso || '')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    }

    const lines = []
    lines.push('==============================================')
    lines.push('Big Brother 聊天记录导出')
    lines.push(`导出时间：${fmt(new Date().toISOString())}`)
    lines.push(`时间范围：${req.query.start ? fmt(req.query.start) : '不限'} 至 ${req.query.end ? fmt(req.query.end) : '不限'}`)
    lines.push(`发送者：${senderId ? (guestNameById[senderId] || senderId) : '全部'}`)
    lines.push(`接收者视角：${receiverId ? (guestNameById[receiverId] || receiverId) : '全部（管理员视角）'}`)
    lines.push(`房间：${roomId ? (roomNameById[roomId] || roomId) : '全部'}`)
    lines.push(`关键词：${keyword && String(keyword).trim() ? String(keyword).trim() : '无'}`)
    lines.push(`消息数量：${messages.length}`)
    lines.push('==============================================')
    lines.push('')

    if (!messages.length) {
      lines.push('（无符合条件的聊天记录）')
    } else {
      for (const m of messages) {
        const others = (m.seenBy || [])
          .filter(v => v.playerId !== m.senderId)
          .map(v => v.name || v.playerId)
        lines.push(`【${fmt(m.createdAt)}】`)
        lines.push(`发送者：${m.senderName || m.senderId || '未知'}`)
        lines.push(`发送房间：${roomNameById[m.roomId] || m.roomId || '未知'}`)
        lines.push(`其他可见玩家：${others.length ? others.join('、') : '无'}`)
        lines.push(`内容：${m.content || ''}`)
        lines.push('----------------------------------------------')
      }
    }

    const now = new Date()
    const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const filename = `BB聊天记录_${ts}.txt`
    res.setHeader('Content-Type', 'text/plain; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="chat-logs-${ts}.txt"; filename*=UTF-8''${encodeURIComponent(filename)}`)
    // 加 UTF-8 BOM，避免 Windows 记事本打开中文乱码
    res.send('\uFEFF' + lines.join('\r\n'))
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '导出聊天记录失败' })
  }
})

// ===== 管理员：房客睡眠/洗澡记录 =====

// GET /admin/guest-states - 所有房客的睡眠/洗澡状态
router.get('/admin/guest-states', auth, requireAdmin, async (req, res) => {
  try {
    const now = new Date()
    const season = await getCurrentSeason()
    const sleepSettings = getSleepSettings(season)
    const showerSettings = getShowerSettings(season)
    const guests = await BBHouseguest.find({ gameId: 'bigbrother' })
    res.json({
      success: true,
      data: {
        guests: guests.map(g => {
          const sleepState = getSleepState(season, now, g.lastSleepDate)
          return {
            id: g.id, name: g.name, avatar: g.avatar, role: g.role, status: g.status,
            currentRoomId: g.currentRoomId,
            isSleeping: g.isSleeping, sleepStartedAt: g.sleepStartedAt, wakeAt: g.wakeAt, lastSleepDate: g.lastSleepDate,
            sleepCycleDate: sleepState.cycleDate,
            sleepCompleted: sleepState.completed,
            canSleepNow: sleepState.inWindow,
            isShowering: g.isShowering, showerStartedAt: g.showerStartedAt,
            lastShowerDate: g.lastShowerDate, showerCooldownUntil: g.showerCooldownUntil,
            hohSleepApproved: g.hohSleepApproved
          }
        }),
        today: localDateStr(now),
        sleepDurationMinutes: sleepSettings.sleepDurationMinutes,
        sleepWindowStart: sleepSettings.sleepWindowStart,
        sleepWindowEnd: sleepSettings.sleepWindowEnd,
        showerCooldownMinutes: showerSettings.showerCooldownMinutes
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房客状态失败' })
  }
})

// POST /admin/set-sleep - 直接设置房客睡眠状态
router.post('/admin/set-sleep', auth, requireAdmin, async (req, res) => {
  try {
    const { playerId, sleeping } = req.body || {}
    const g = await BBHouseguest.findOne({ id: playerId, gameId: 'bigbrother' })
    if (!g) return res.status(404).json({ success: false, error: '房客不存在' })
    if (sleeping) {
      const now = new Date()
      const season = await getCurrentSeason()
      const sleepState = getSleepState(season, now, g.lastSleepDate)
      g.isSleeping = true
      g.sleepStartedAt = now.toISOString()
      g.wakeAt = new Date(now.getTime() + sleepState.sleepDurationMinutes * 60 * 1000).toISOString()
      g.lastSleepDate = sleepState.cycleDate
    } else {
      const prevSleepStartedAt = g.sleepStartedAt
      g.isSleeping = false
      g.sleepStartedAt = null
      g.wakeAt = null
      await g.save()
      await sleepHistory.endSleep(g.id, new Date().toISOString(), prevSleepStartedAt)
      return res.json({ success: true })
    }
    await g.save()
    await sleepHistory.startSleep(g.id, g.sleepStartedAt)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置失败' })
  }
})

// POST /admin/set-shower - 直接设置房客洗澡状态（已洗澡 = 进入冷却）
router.post('/admin/set-shower', auth, requireAdmin, async (req, res) => {
  try {
    const { playerId, showered } = req.body || {}
    const g = await BBHouseguest.findOne({ id: playerId, gameId: 'bigbrother' })
    if (!g) return res.status(404).json({ success: false, error: '房客不存在' })
    if (showered) {
      const season = await getCurrentSeason()
      await finishShower(g, season)
      g.isShowering = false
      g.showerStartedAt = null
      await g.save()
    } else {
      g.lastShowerDate = null
      g.showerCooldownUntil = null
      g.isShowering = false
      g.showerStartedAt = null
      await g.save()
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置失败' })
  }
})

// POST /admin/sleep-action - action: start(立即开始睡) | end(立即结束) | mark(标记本轮已睡) | clear(清除记录)
router.post('/admin/sleep-action', auth, requireAdmin, async (req, res) => {
  try {
    const { playerId, action } = req.body || {}
    const g = await BBHouseguest.findOne({ id: playerId, gameId: 'bigbrother' })
    if (!g) return res.status(404).json({ success: false, error: '房客不存在' })
    const now = new Date()
    const season = await getCurrentSeason()
    const sleepState = getSleepState(season, now, g.lastSleepDate)
    let sleepFallbackStart = null
    if (action === 'start') {
      g.isSleeping = true
      g.sleepStartedAt = now.toISOString()
      g.wakeAt = new Date(now.getTime() + sleepState.sleepDurationMinutes * 60 * 1000).toISOString()
      g.lastSleepDate = sleepState.cycleDate
    } else if (action === 'end') {
      sleepFallbackStart = g.sleepStartedAt
      g.isSleeping = false
      g.sleepStartedAt = null
      g.wakeAt = null
    } else if (action === 'mark') {
      g.lastSleepDate = sleepState.cycleDate
    } else if (action === 'clear') {
      g.lastSleepDate = null
    } else {
      return res.status(400).json({ success: false, error: '未知操作' })
    }
    await g.save()
    if (action === 'start') await sleepHistory.startSleep(g.id, g.sleepStartedAt)
    else if (action === 'end') await sleepHistory.endSleep(g.id, new Date().toISOString(), sleepFallbackStart)
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置失败' })
  }
})

// POST /admin/shower-action - action: start(立即开始洗) | end(立即结束) | mark(标记刚洗过) | clear(清除冷却)
router.post('/admin/shower-action', auth, requireAdmin, async (req, res) => {
  try {
    const { playerId, action } = req.body || {}
    const g = await BBHouseguest.findOne({ id: playerId, gameId: 'bigbrother' })
    if (!g) return res.status(404).json({ success: false, error: '房客不存在' })
    const now = new Date()
    const season = await getCurrentSeason()
    if (action === 'start') {
      g.isShowering = true
      g.showerStartedAt = now.toISOString()
      g.lastShowerDate = localDateStr(now)
      g.showerCooldownUntil = null
      await g.save()
    } else if (action === 'end') {
      await finishShower(g, season, now)
    } else if (action === 'mark') {
      g.isShowering = false
      g.showerStartedAt = null
      g.lastShowerDate = localDateStr(now)
      g.showerCooldownUntil = getShowerCooldownUntil(season, now)
      await g.save()
    } else if (action === 'clear') {
      g.showerCooldownUntil = null
      g.lastShowerDate = null
      await g.save()
    } else {
      return res.status(400).json({ success: false, error: '未知操作' })
    }
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置失败' })
  }
})

module.exports = router
