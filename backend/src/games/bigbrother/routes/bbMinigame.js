/**
 * Big Brother 小游戏 REST 路由
 * 管理员创建比赛房间、开始比赛、查看小游戏列表
 */
const express = require('express')
const router = express.Router()
const { getAllGames } = require('../minigames/loadAll')
const { getCurrentSeason } = require('../helpers')
const BBCustomGame = require('../models/BBCustomGame')

// GET /list - 获取所有可用小游戏（内置 + 自定义）
router.get('/list', async (req, res) => {
  try {
    const builtinGames = getAllGames()
    
    // 加载已启用的自定义游戏
    let customGames = []
    try {
      const docs = await BBCustomGame.find({ enabled: true })
      customGames = docs.map(doc => {
        const obj = doc.toObject()
        return {
          id: `custom-${obj.id}`,
          name: obj.name,
          description: obj.description,
          icon: obj.icon,
          category: 'custom',
          playerCount: obj.playerCount,
          duration: obj.type === 'score' ? obj.timeLimit : Math.max(60, obj.questions.length * 15),
          type: obj.type,
          isCustom: true
        }
      })
    } catch (e) {
      console.error('加载自定义游戏失败:', e)
    }

    res.json({ success: true, data: [...builtinGames, ...customGames] })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取小游戏列表失败' })
  }
})

// POST /create-room - 管理员创建比赛房间
router.post('/create-room', async (req, res) => {
  try {
    const { gameType, minigameId, participants, targetScore } = req.body

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

    // 校验目标值（可选）
    let target = null
    if (targetScore !== undefined && targetScore !== null && targetScore !== '') {
      target = parseInt(targetScore, 10)
      if (isNaN(target) || target <= 0) {
        return res.status(400).json({ success: false, error: '目标值必须为正整数' })
      }
    }

    const room = minigameNs.createRoom(gameType, minigameId, participants, target)

    res.json({
      success: true,
      data: {
        roomId: room.roomId,
        gameType: room.gameType,
        minigameId: room.minigameId,
        participants: room.participants,
        targetScore: room.targetScore,
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

// POST /set-winner - 管理员手动指定胜者并结束比赛
router.post('/set-winner', async (req, res) => {
  try {
    const { roomId, playerId } = req.body
    if (!roomId || !playerId) {
      return res.status(400).json({ success: false, error: '缺少 roomId 或 playerId' })
    }
    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs || !minigameNs.setWinner) {
      return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    }
    const result = minigameNs.setWinner(roomId, playerId)
    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error })
    }
    res.json({ success: true, data: { winner: result.winner } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置胜者失败' })
  }
})

// GET /room-progress/:roomId - 获取房间实时进度（管理员轮询兜底）
router.get('/room-progress/:roomId', async (req, res) => {
  try {
    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs || !minigameNs.getRoomProgress) {
      return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    }
    const progress = minigameNs.getRoomProgress(req.params.roomId)
    res.json({ success: true, data: progress })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取房间进度失败' })
  }
})

// POST /pause - 管理员暂停游戏
router.post('/pause', async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) return res.status(400).json({ success: false, error: '缺少房间ID' })
    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs) return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    const result = minigameNs.pauseGame(roomId)
    if (!result.success) return res.status(400).json(result)
    res.json({ success: true, message: '游戏已暂停' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '暂停游戏失败' })
  }
})

// POST /resume - 管理员恢复游戏
router.post('/resume', async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) return res.status(400).json({ success: false, error: '缺少房间ID' })
    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs) return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    const result = minigameNs.resumeGame(roomId)
    if (!result.success) return res.status(400).json(result)
    res.json({ success: true, message: '游戏已恢复' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '恢复游戏失败' })
  }
})

// POST /stop - 管理员停止游戏（无胜者）
router.post('/stop', async (req, res) => {
  try {
    const { roomId } = req.body
    if (!roomId) return res.status(400).json({ success: false, error: '缺少房间ID' })
    const minigameNs = req.app.get('io')?.of('/bigbrother-minigame')
    if (!minigameNs) return res.status(500).json({ success: false, error: '小游戏服务未就绪' })
    const result = minigameNs.stopGame(roomId)
    if (!result.success) return res.status(400).json(result)
    res.json({ success: true, message: '游戏已停止' })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '停止游戏失败' })
  }
})

module.exports = router
