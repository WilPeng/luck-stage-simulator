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

// ====================== 危险名单与 PK 淘汰 ======================

// POST /api/elimination/danger/confirm - 确认危险名单（管理员）
router.post('/danger/confirm', auth, requireAdmin, async (req, res) => {
  try {
    const { round, playerIds } = req.body
    if (typeof round !== 'number' || round < 1) {
      return res.status(400).json({ success: false, error: 'round 必填', code: 'INVALID_ROUND' })
    }
    const result = await eliminationService.confirmDangerList(round, playerIds)
    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        ACTION_TYPES.ELIMINATION || 'ELIMINATION', 'elimination', `round-${round}`,
        `确认危险名单 ${result.confirmedPlayerIds.length} 人（第 ${round} 轮）`)
    } catch (logErr) { console.warn(logErr) }
    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Confirm danger list error:', e)
    res.status(400).json({ success: false, error: e.message || '确认危险名单失败', code: 'SERVER_ERROR' })
  }
})

// GET /api/elimination/danger?round= - 获取危险名单状态
router.get('/danger', auth, async (req, res) => {
  try {
    const roundIndex = req.query.round !== undefined ? parseInt(req.query.round) : undefined
    if (!roundIndex) return res.status(400).json({ success: false, error: '缺少 round 参数', code: 'MISSING_PARAM' })
    const result = await eliminationService.getDangerStatus(roundIndex)
    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Get danger status error:', e)
    res.status(500).json({ success: false, error: '获取危险名单失败', code: 'SERVER_ERROR' })
  }
})

// GET /api/elimination/pk/queue?round= - 获取 PK 队列
router.get('/pk/queue', auth, async (req, res) => {
  try {
    const roundIndex = req.query.round !== undefined ? parseInt(req.query.round) : undefined
    if (!roundIndex) return res.status(400).json({ success: false, error: '缺少 round 参数', code: 'MISSING_PARAM' })
    const queue = await eliminationService.getPkQueue(roundIndex)
    res.json({ success: true, data: queue })
  } catch (e) {
    console.error('Get PK queue error:', e)
    res.status(500).json({ success: false, error: '获取 PK 队列失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/elimination/pk/start - 发起一场 PK（队首挑战者 + 2 对手 + 属性）
router.post('/pk/start', auth, requireAdmin, async (req, res) => {
  try {
    const { round, challengerId, opponentIds, attribute } = req.body
    if (typeof round !== 'number' || round < 1) {
      return res.status(400).json({ success: false, error: 'round 必填', code: 'INVALID_ROUND' })
    }
    const pk = await eliminationService.startPk(round, { challengerId, opponentIds, attribute })
    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        ACTION_TYPES.ELIMINATION || 'ELIMINATION', 'elimination', `round-${round}`,
        `发起 PK（第${pk.pkIndex}场，属性${pk.attribute}）：${pk.players.map(p => p.playerName).join('、')}`)
    } catch (logErr) { console.warn(logErr) }
    res.json({ success: true, data: pk })
  } catch (e) {
    console.error('Start PK error:', e)
    res.status(400).json({ success: false, error: e.message || '发起 PK 失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/elimination/pk/:pkId/vote - 生成 PK 投票（1000 评审三选一）
router.post('/pk/:pkId/vote', auth, requireAdmin, async (req, res) => {
  try {
    const pk = await eliminationService.generatePkVotes(req.params.pkId)
    res.json({ success: true, data: pk })
  } catch (e) {
    console.error('Generate PK vote error:', e)
    res.status(400).json({ success: false, error: e.message || '生成 PK 投票失败', code: 'SERVER_ERROR' })
  }
})

// GET /api/elimination/pk/:pkId - 获取 PK 详情（含投票结果）
router.get('/pk/:pkId', auth, async (req, res) => {
  try {
    const pk = await eliminationService.getPkDetail(req.params.pkId)
    res.json({ success: true, data: pk })
  } catch (e) {
    console.error('Get PK detail error:', e)
    res.status(500).json({ success: false, error: '获取 PK 详情失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/elimination/pk/:pkId/resolve - 裁定 PK 结果（安全/待定/淘汰）
router.post('/pk/:pkId/resolve', auth, requireAdmin, async (req, res) => {
  try {
    const result = await eliminationService.resolvePk(req.params.pkId, req.body.decisions)
    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        ACTION_TYPES.ELIMINATION || 'ELIMINATION', 'elimination', req.params.pkId,
        `裁定 PK 结果：${JSON.stringify(req.body.decisions)}，本轮已淘汰 ${result.eliminatedCount} 人`)
    } catch (logErr) { console.warn(logErr) }
    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Resolve PK error:', e)
    res.status(400).json({ success: false, error: e.message || '裁定 PK 失败', code: 'SERVER_ERROR' })
  }
})

// POST /api/elimination/stop - 结束淘汰环节，进入下一轮
router.post('/stop', auth, requireAdmin, async (req, res) => {
  try {
    const { round } = req.body
    if (typeof round !== 'number' || round < 1) {
      return res.status(400).json({ success: false, error: 'round 必填', code: 'INVALID_ROUND' })
    }
    const result = await eliminationService.stopElimination(round)
    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        ACTION_TYPES.ELIMINATION || 'ELIMINATION', 'elimination', `round-${round}`,
        `结束第 ${round} 轮淘汰环节`)
    } catch (logErr) { console.warn(logErr) }
    res.json({ success: true, data: result })
  } catch (e) {
    console.error('Stop elimination error:', e)
    res.status(500).json({ success: false, error: '结束淘汰环节失败', code: 'SERVER_ERROR' })
  }
})

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
