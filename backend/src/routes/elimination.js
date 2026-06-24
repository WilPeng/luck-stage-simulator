const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../middleware/auth')
const { logAction, ACTION_TYPES } = require('../utils/helpers')
const eliminationService = require('../services/eliminationService')

// ====================== 接口 1: GET /api/elimination/stats - 获取淘汰统计 ======================

router.get('/stats', auth, async (req, res) => {
  try {
    const roundIndex = req.query.round !== undefined ? parseInt(req.query.round) : undefined
    const stats = await eliminationService.getEliminationStats(roundIndex)
    res.json(stats)
  } catch (e) {
    console.error('Get elimination stats error:', e)
    res.status(500).json({ success: false, error: '获取淘汰统计失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 接口 2: GET /api/elimination?round= - 获取当前淘汰名单 ======================

router.get('/', auth, async (req, res) => {
  try {
    const roundIndex = req.query.round !== undefined ? parseInt(req.query.round) : undefined
    const list = await eliminationService.getEliminationList(roundIndex)
    res.json({ success: true, data: list })
  } catch (e) {
    console.error('Get elimination list error:', e)
    res.status(500).json({ success: false, error: '获取淘汰名单失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 接口 3: GET /api/elimination/history - 获取完整淘汰历史 ======================

router.get('/history', auth, requireAdmin, async (req, res) => {
  try {
    const history = await eliminationService.getEliminationHistory()
    res.json({ success: true, data: history })
  } catch (e) {
    console.error('Get elimination history error:', e)
    res.status(500).json({ success: false, error: '获取淘汰历史失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 接口 4: GET /api/elimination/ranking - 获取排名列表 ======================

router.get('/ranking', auth, async (req, res) => {
  try {
    const roundIndex = req.query.round !== undefined ? parseInt(req.query.round) : undefined
    const result = await eliminationService.getRankingList(roundIndex)
    res.json(result)
  } catch (e) {
    console.error('Get ranking error:', e)
    res.status(500).json({ success: false, error: '获取排名列表失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 接口 5: GET /api/elimination/candidates - 获取淘汰候选选手 ======================

router.get('/candidates', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) {
      return res.status(400).json({ success: false, error: '缺少 roundId 参数', code: 'MISSING_PARAM' })
    }
    const candidates = await eliminationService.getEliminationCandidates(roundId)
    res.json({ success: true, data: candidates })
  } catch (e) {
    console.error('Get candidates error:', e)
    res.status(500).json({ success: false, error: e.message || '获取候选选手失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 接口 6: POST /api/elimination/manual - 手动批量淘汰 ======================

router.post('/manual', auth, requireAdmin, async (req, res) => {
  try {
    const { userIds, playerIds, reason, round } = req.body
    const ids = Array.isArray(userIds) && userIds.length > 0 ? userIds : (Array.isArray(playerIds) ? playerIds : [])
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要淘汰的选手', code: 'NO_IDS' })
    }

    const result = await eliminationService.manualEliminate({ userIds: ids, playerIds: ids, reason, round })

    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        ACTION_TYPES.ELIMINATION || 'ELIMINATION',
        'elimination', result.round ? `round-${result.round}` : '',
        `手动淘汰 ${result.eliminatedCount} 位选手（第 ${result.round} 轮）`)
    } catch (logErr) { console.warn(logErr) }

    res.json({
      success: true,
      data: {
        round: result.round,
        eliminatedList: result.eliminatedList,
        eliminatedCount: result.eliminatedCount,
        failedList: result.failedList,
        failedCount: result.failedCount
      }
    })
  } catch (e) {
    console.error('Manual elimination error:', e)
    res.status(500).json({ success: false, error: e.message || '手动淘汰失败', code: 'SERVER_ERROR' })
  }
})

// ====================== 接口 7: POST /api/elimination/restore/:userId - 恢复被淘汰选手 ======================

async function handleRestore(req, res) {
  try {
    const userId = req.params.userId
    const result = await eliminationService.restorePlayer(userId)

    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        'RESTORE', 'user', userId, `恢复选手 ${result.name}`)
    } catch (logErr) { console.warn(logErr) }

    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Restore player error:', e)
    if (e.message === '用户不存在') {
      return res.status(404).json({ success: false, error: '用户不存在', code: 'NOT_FOUND' })
    }
    res.status(500).json({ success: false, error: '恢复失败', code: 'SERVER_ERROR' })
  }
}

router.post('/restore/:userId', auth, requireAdmin, handleRestore)
router.patch('/restore/:userId', auth, requireAdmin, handleRestore)

// ====================== 保留兼容旧端点 ======================

// POST /api/elimination/batch - 批量淘汰（旧端点，保持兼容，内部复用 manualEliminate）
router.post('/batch', auth, requireAdmin, async (req, res) => {
  try {
    const { playerIds, userIds, reason, round } = req.body
    const ids = Array.isArray(playerIds) && playerIds.length > 0
      ? playerIds
      : (Array.isArray(userIds) ? userIds : [])
    if (ids.length === 0) {
      return res.status(400).json({ success: false, error: '请选择要淘汰的选手', code: 'NO_IDS' })
    }

    const result = await eliminationService.manualEliminate({ userIds: ids, reason, round })

    res.json({
      success: true,
      data: {
        eliminatedList: result.eliminatedList,
        failed: result.failedList,
        eliminatedCount: result.eliminatedCount,
        failedCount: result.failedCount
      }
    })
  } catch (e) {
    console.error('Batch elimination error:', e)
    res.status(500).json({ success: false, error: e.message || '批量淘汰失败', code: 'SERVER_ERROR' })
  }
})

// DELETE /api/elimination/:id - 删除淘汰记录
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    const Elimination = require('../models/Elimination')
    await Elimination.deleteOne({ id: req.params.id })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// GET /api/elimination/summary - 淘汰摘要
router.get('/summary', auth, async (req, res) => {
  try {
    const roundIndex = req.query.round !== undefined ? parseInt(req.query.round) : undefined
    const stats = await eliminationService.getEliminationStats(roundIndex)
    res.json({
      success: true,
      data: {
        totalPlayers: stats.totalPlayers,
        eliminatedCount: stats.eliminatedCount,
        activeCount: stats.activeCount,
        eliminationRate: stats.eliminationRate,
        currentRound: stats.currentRound
      }
    })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取总结失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
