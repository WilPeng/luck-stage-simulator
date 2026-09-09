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
const { getCurrentSeason, logAction, BB_ACTION_TYPES } = require('../helpers')
const { getReachableRooms, getCurrentHoh } = require('../houseMap')
const { getCollection } = require('../../../config/db')
const { broadcastDoorUpdate, movePlayerSockets, takePendingInvite } = require('../../../socket/bbHouse')

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
    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })
    const isAdmin = req.user.role === 'admin'
    const hoh = await getCurrentHoh()
    const showCounts = isAdmin || (hoh && hoh.id === req.user.userId)

    const result = []
    for (const room of rooms) {
      const count = showCounts
        ? await BBPlayerLocation.countDocuments({ currentRoomId: room.id, gameId: 'bigbrother' })
        : null
      result.push({ ...room.toObject(), currentCount: count })
    }
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
      // 可以看到具体玩家
      players = locations.map(l => ({ playerId: l.playerId, playerName: l.playerName, enteredAt: l.enteredAt }))
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
        players
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

// GET /reachable - 获取从当前位置可达的房间
router.get('/reachable', auth, async (req, res) => {
  try {
    const loc = await BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' })
    const currentRoomId = loc?.currentRoomId || 'living_room'
    const reachableIds = await getReachableRooms(currentRoomId, { BBHousePassage, BBHouseDoor })

    // 获取可达房间的详细信息（含权限检查）
    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })
    const roomMap = {}
    rooms.forEach(r => { roomMap[r.id] = r })

    const player = await BBHouseguest.findOne({ id: req.user.userId, gameId: 'bigbrother' })
    const hoh = await getCurrentHoh()
    const hohId = hoh ? hoh.id : null

    const reachable = await Promise.all(
      reachableIds
        .filter(id => roomMap[id])
        .map(async id => {
          const room = roomMap[id]
          let canEnter = true
          let denyReason = ''

          if (room.accessRule === 'hoh_only') {
            if (hohId !== req.user.userId) {
              canEnter = false
              denyReason = '仅 HOH 可进入'
            }
          } else if (room.accessRule === 'hoh_or_invited') {
            if (hohId !== req.user.userId) {
              canEnter = false
              denyReason = '需要 HOH 邀请'
            }
          } else if (room.accessRule === 'have_not_only') {
            if (!player?.isHaveNot) {
              canEnter = false
              denyReason = '仅 Have-Not 可进入'
            }
          } else if (room.accessRule === 'single') {
            const count = await BBPlayerLocation.countDocuments({ currentRoomId: id, gameId: 'bigbrother' })
            if (count >= 1) {
              canEnter = false
              denyReason = '已有人在内'
            }
          }

          return { ...room.toObject(), canEnter, denyReason }
        })
    )

    // 附带后院门状态，方便前端初始渲染
    const door = await BBHouseDoor.findOne({ id: 'backyard_door', gameId: 'bigbrother' })

    res.json({ success: true, data: { currentRoomId, rooms: reachable, backyardDoorOpen: door ? door.isOpen : true } })
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

    const gameId = 'bigbrother'

    // 1. 玩家状态
    const player = await BBHouseguest.findOne({ id: req.user.userId, gameId })
    if (!player || player.status !== 'active') {
      return res.status(403).json({ success: false, error: '非活跃玩家' })
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
      if (!player.isHaveNot) {
        return res.status(403).json({ success: false, error: '仅 Have-Not 可进入' })
      }
    } else if (targetRoom.accessRule === 'single') {
      const count = await BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId, gameId })
      if (count >= 1) {
        return res.status(403).json({ success: false, error: 'Diary Room 已有人在内' })
      }
    }

    // 7. 容量检查
    if (targetRoom.capacity) {
      const count = await BBPlayerLocation.countDocuments({ currentRoomId: targetRoomId, gameId })
      if (count >= targetRoom.capacity) {
        return res.status(403).json({ success: false, error: '房间已满' })
      }
    }

    // 执行移动
    const oldRoomId = loc.currentRoomId
    loc.currentRoomId = targetRoomId
    loc.enteredAt = new Date().toISOString()
    await loc.save()

    // 同步 BBHouseguest.currentRoomId
    player.currentRoomId = targetRoomId
    await player.save()

    res.json({
      success: true,
      data: { oldRoomId, newRoomId: targetRoomId, playerName: player.name }
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

    let loc = await BBPlayerLocation.findOne({ playerId: req.user.userId, gameId: 'bigbrother' })
    if (!loc) {
      loc = new BBPlayerLocation({
        id: req.user.userId, playerId: req.user.userId, playerName: player.name,
        currentRoomId: 'living_room', enteredAt: new Date().toISOString(), gameId: 'bigbrother'
      })
    }

    const oldRoomId = loc.currentRoomId
    loc.currentRoomId = 'hoh_room'
    loc.enteredAt = new Date().toISOString()
    await loc.save()

    player.currentRoomId = 'hoh_room'
    await player.save()

    // 同步 socket 房间与实时广播
    await movePlayerSockets(req.user.userId, oldRoomId, 'hoh_room', '你接受了 HOH 邀请')

    res.json({ success: true, data: { oldRoomId, newRoomId: 'hoh_room', playerName: player.name } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '接受邀请失败' })
  }
})

// ===== HOH API =====

// GET /hoh-monitor - HOH 监控（仅人数）
router.get('/hoh-monitor', auth, async (req, res) => {
  try {
    const hoh = await getCurrentHoh()
    if ((!hoh || hoh.id !== req.user.userId) && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: '仅 HOH 或管理员可使用监控' })
    }

    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })
    const result = []
    for (const room of rooms) {
      if (room.type === 'hidden') continue // 不显示 Diary Room
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

// GET /admin/locations - 管理员查看所有玩家位置
router.get('/admin/locations', auth, requireAdmin, async (req, res) => {
  try {
    const locations = await BBPlayerLocation.find({ gameId: 'bigbrother' })
    const rooms = await BBHouseRoom.find({ gameId: 'bigbrother' })

    // 按房间分组
    const grouped = {}
    for (const room of rooms) {
      grouped[room.id] = { room: room.toObject(), players: [] }
    }
    for (const loc of locations) {
      if (grouped[loc.currentRoomId]) {
        grouped[loc.currentRoomId].players.push({
          playerId: loc.playerId,
          playerName: loc.playerName,
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
    const activePlayers = await BBHouseguest.find({ gameId, status: 'active' })
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

module.exports = router
