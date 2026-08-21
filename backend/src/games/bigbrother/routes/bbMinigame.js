/**
 * Big Brother 小游戏 REST 路由
 * 管理员创建比赛房间、开始比赛、查看小游戏列表
 */
const express = require('express')
const router = express.Router()
const { getAllGames } = require('../minigames/loadAll')
const { getCurrentSeason } = require('../helpers')

// GET /list - 获取所有可用小游戏
router.get('/list', (req, res) => {
  try {
    const games = getAllGames()
    res.json({ success: true, data: games })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取小游戏列表失败' })
  }
})

// POST /create-room - 管理员创建比赛房间
router.post('/create-room', async (req, res) => {
  try {
    const { gameType, minigameId, participants } = req.body

    if (!gameType || !['hoh', 'veto'].includes(gameType)) {
      return res.status(400).json({ success: false, error: '无效的比赛类型' })
    }
    if (!minigameId) {
      return res.status(400).json({ success: false, error: '请选择小游戏' })
    }
    if (!participants || !Array.isArray(participants) || participants.length < 2) {
      return res.status(400).json({ success: false, error: '参与者至少需要2人' })
    }

    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs) {
      return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    }

    // 检查是否有同类型的活跃房间
    const existing = minigameNs.getActiveRoomForType(gameType)
    if (existing) {
      return res.status(400).json({
        success: false,
        error: '当前已有进行中的比赛，请等待结束'
      })
    }

    const room = minigameNs.createRoom(gameType, minigameId, participants)

    res.json({
      success: true,
      data: {
        roomId: room.roomId,
        gameType: room.gameType,
        minigameId: room.minigameId,
        participants: room.participants,
        status: room.status
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '创建比赛房间失败' })
  }
})

// POST /start - 管理员开始比赛
router.post('/start', async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) {
      return res.status(400).json({ success: false, error: '缺少房间ID' })
    }

    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs) {
      return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    }

    minigameNs.startGame(roomId, (result) => {
      if (!result.success) {
        return res.status(400).json(result)
      }
      res.json({ success: true, message: '比赛已开始' })
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '开始比赛失败' })
  }
})

// GET /room/:roomId - 获取房间信息
router.get('/room/:roomId', (req, res) => {
  try {
    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs) {
      return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    }

    const room = minigameNs.getRoom(req.params.roomId)
    if (!room) {
      return res.status(404).json({ success: false, error: '房间不存在或已结束' })
    }

    res.json({
      success: true,
      data: {
        roomId: room.roomId,
        gameType: room.gameType,
        minigameId: room.minigameId,
        participants: room.participants,
        status: room.status,
        winner: room.winner
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房间信息失败' })
  }
})

// GET /active-room/:gameType - 获取指定类型的活跃房间
router.get('/active-room/:gameType', (req, res) => {
  try {
    const { gameType } = req.params
    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs) {
      return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    }

    const room = minigameNs.getActiveRoomForType(gameType)
    if (!room) {
      return res.json({ success: true, data: null })
    }

    res.json({
      success: true,
      data: {
        roomId: room.roomId,
        gameType: room.gameType,
        minigameId: room.minigameId,
        participants: room.participants,
        status: room.status,
        winner: room.winner
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取活跃房间失败' })
  }
})

module.exports = router
