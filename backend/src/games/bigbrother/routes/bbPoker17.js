/**
 * 17 Poker 休闲房 REST 路由
 *
 * 复用现有 /bigbrother-minigame Socket.IO 房间与鉴权体系：
 * HTTP 只负责创建/加入/开始房间，所有牌局状态与操作都通过 WebSocket。
 */
const express = require('express')
const router = express.Router()
const { auth } = require('../../../middleware/auth')
const BBHouseguest = require('../models/BBHouseguest')
const BBMinigameReplay = require('../models/BBMinigameReplay')

function getNamespace(req) {
  return req.app.get('io')?.of('/bigbrother-minigame') || null
}

async function resolvePlayer(req) {
  const userId = req.user?.userId || req.user?.id
  if (!userId) throw new Error('未登录')
  const user = await BBHouseguest.findOne({ id: userId, gameId: 'bigbrother' })
  if (!user) throw new Error('用户不存在')
  return {
    playerId: user.id,
    playerName: user.name || '',
    avatar: user.avatar || null
  }
}

function fail(res, status, error) {
  return res.status(status).json({ success: false, error })
}

// GET /rooms - 游戏大厅中的开放房间
router.get('/rooms', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.listPoker17Rooms) return fail(res, 500, '游戏服务未就绪')
    res.json({ success: true, data: ns.listPoker17Rooms() })
  } catch (e) {
    console.error('[Poker17] list rooms failed', e)
    res.status(500).json({ success: false, error: '获取房间列表失败' })
  }
})

// GET /my-room - 当前玩家所在房间（用于断线重连/刷新恢复）
router.get('/my-room', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.findPoker17RoomForPlayer) return fail(res, 500, '游戏服务未就绪')
    const me = await resolvePlayer(req)
    res.json({ success: true, data: ns.findPoker17RoomForPlayer(me.playerId) })
  } catch (e) {
    console.error('[Poker17] my room failed', e)
    res.status(500).json({ success: false, error: '获取当前房间失败' })
  }
})

// GET /rooms/:roomId - 房间公开信息（不含手牌）
router.get('/rooms/:roomId', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.getPoker17Room) return fail(res, 500, '游戏服务未就绪')
    const room = ns.getPoker17Room(req.params.roomId)
    if (!room) return fail(res, 404, '房间不存在或已结束')
    res.json({ success: true, data: room })
  } catch (e) {
    console.error('[Poker17] get room failed', e)
    res.status(500).json({ success: false, error: '获取房间失败' })
  }
})

// POST /rooms - 创建房间
router.post('/rooms', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.createPoker17Room) return fail(res, 500, '游戏服务未就绪')
    const me = await resolvePlayer(req)
    const existing = ns.findPoker17RoomForPlayer(me.playerId)
    if (existing) {
      return res.json({ success: true, data: existing, resumed: true })
    }
    const room = ns.createPoker17Room(me)
    res.json({ success: true, data: ns.getPoker17Room(room.roomId) })
  } catch (e) {
    console.error('[Poker17] create room failed', e)
    res.status(500).json({ success: false, error: '创建房间失败' })
  }
})

// POST /rooms/:roomId/join - 加入房间
router.post('/rooms/:roomId/join', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.joinPoker17Room) return fail(res, 500, '游戏服务未就绪')
    const me = await resolvePlayer(req)
    const result = ns.joinPoker17Room(req.params.roomId, me)
    if (!result.success) return fail(res, 400, result.error || '加入房间失败')
    res.json({ success: true, data: ns.getPoker17Room(req.params.roomId) })
  } catch (e) {
    console.error('[Poker17] join room failed', e)
    res.status(500).json({ success: false, error: '加入房间失败' })
  }
})

// POST /rooms/:roomId/leave - 离开等待中的房间
router.post('/rooms/:roomId/leave', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.leavePoker17Room) return fail(res, 500, '游戏服务未就绪')
    const me = await resolvePlayer(req)
    const result = ns.leavePoker17Room(req.params.roomId, me.playerId)
    if (!result.success) return fail(res, 400, result.error || '离开房间失败')
    res.json({ success: true })
  } catch (e) {
    console.error('[Poker17] leave room failed', e)
    res.status(500).json({ success: false, error: '离开房间失败' })
  }
})

// POST /rooms/:roomId/start - 房主开始比赛
router.post('/rooms/:roomId/start', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.startPoker17Room) return fail(res, 500, '游戏服务未就绪')
    const me = await resolvePlayer(req)
    const countdownSeconds = Number(req.body?.countdownSeconds ?? 3)
    ns.startPoker17Room(req.params.roomId, me.playerId, countdownSeconds, (result) => {
      if (!result || !result.success) {
        return fail(res, 400, (result && result.error) || '开始比赛失败')
      }
      res.json({ success: true, data: ns.getPoker17Room(req.params.roomId) })
    })
  } catch (e) {
    console.error('[Poker17] start room failed', e)
    res.status(500).json({ success: false, error: '开始比赛失败' })
  }
})

// POST /rooms/:roomId/rematch - 同房间玩家再来一局
router.post('/rooms/:roomId/rematch', auth, async (req, res) => {
  try {
    const ns = getNamespace(req)
    if (!ns || !ns.rematchPoker17Room) return fail(res, 500, '游戏服务未就绪')
    const me = await resolvePlayer(req)
    const result = ns.rematchPoker17Room(req.params.roomId, me.playerId)
    if (!result.success) return fail(res, 400, result.error || '再来一局失败')
    res.json({ success: true, data: result.data })
  } catch (e) {
    console.error('[Poker17] rematch failed', e)
    res.status(500).json({ success: false, error: '再来一局失败' })
  }
})

// GET /records - 最近比赛记录（复用现有 BBMinigameReplay 记录系统）
router.get('/records', auth, async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(30, Number(req.query.limit) || 10))
    const docs = await BBMinigameReplay.find({ gameId: 'bigbrother', minigameId: 'poker17' })
    const list = docs
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, limit)
      .map(d => {
        const o = d.toObject()
        return {
          id: o.id,
          roomId: o.roomId,
          status: o.status,
          participants: o.participants,
          winner: o.winner,
          winners: o.winners,
          scores: o.scores,
          startedAt: o.startedAt,
          endedAt: o.endedAt,
          finalResult: (o.meta && o.meta.finalResult) || null
        }
      })
    res.json({ success: true, data: list })
  } catch (e) {
    console.error('[Poker17] records failed', e)
    res.status(500).json({ success: false, error: '获取比赛记录失败' })
  }
})

module.exports = router
