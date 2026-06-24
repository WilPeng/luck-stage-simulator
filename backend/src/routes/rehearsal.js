const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction, getCurrentSeason, randomInt, ACTION_TYPES } = require('../utils/helpers')
const RehearsalResult = require('../models/RehearsalResult')
const RoundTeam = require('../models/RoundTeam')
const Round = require('../models/Round')
const User = require('../models/User')

const router = express.Router()

async function getRound(roundId) {
  if (roundId) return await Round.findOne({ id: roundId })
  const season = await getCurrentSeason()
  if (!season) return null
  return await Round.findOne({ seasonId: season.id, index: season.currentRound })
}

// 彩排事件池
const REHEARSAL_EVENTS = [
  { id: 'perfect', name: '完美彩排', description: '团队配合完美', bonus: { team: 5, each: 2 } },
  { id: 'good', name: '顺利完成', description: '团队正常表现', bonus: { team: 3, each: 1 } },
  { id: 'ok', name: '一般发挥', description: '中规中矩', bonus: { team: 1, each: 0 } },
  { id: 'mess', name: '小失误', description: '个别成员失误', bonus: { team: 0, each: -1 } },
  { id: 'chaos', name: '混乱', description: '整个团队节奏错乱', bonus: { team: -3, each: -2 } }
]

// ===== POST /api/rehearsal/roll - 为某队/全部队生成一次彩排结果 =====
router.post('/roll', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, teamId, all } = req.body
    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : null

    const teams = all
      ? await RoundTeam.find({ roundId: rId })
      : (teamId ? [await RoundTeam.findOne({ id: teamId })] : [])

    const results = []
    for (const t of teams) {
      if (!t) continue
      const event = REHEARSAL_EVENTS[Math.floor(Math.random() * REHEARSAL_EVENTS.length)]
      const r = new RehearsalResult({
        id: generateId(), roundId: rId, roundIndex: rIdx,
        teamId: t.id, teamName: t.name, eventName: event.name,
        description: event.description, bonus: event.bonus, createdAt: new Date().toISOString()
      })
      await r.save()
      results.push(r)
    }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.REHEARSAL_ROLL, 'round', rId, `为 ${results.length} 支队伍生成彩排结果`)
    res.json({ success: true, data: results, count: results.length })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '彩排失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/rehearsal/results - 彩排结果列表（roundId 必填）=====
router.get('/results', auth, async (req, res) => {
  try {
    const { roundId, teamId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    const filter = { roundId: rId }
    if (teamId) filter.teamId = teamId

    let results = await RehearsalResult.find(filter)
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    res.json({ success: true, data: results, total: results.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取彩排结果失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/rehearsal/results/:id =====
router.delete('/results/:id', auth, requireAdmin, async (req, res) => {
  try {
    await RehearsalResult.deleteOne({ id: req.params.id })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/rehearsal/history（roundId 必填）=====
router.get('/history', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id
    const results = await RehearsalResult.find({ roundId: rId })
    res.json({ success: true, data: results, total: results.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取历史失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
