const express = require('express')
const router = express.Router()
const BBJuryQA = require('../models/BBJuryQA')
const BBSeason = require('../models/BBSeason')
const BBHouseguest = require('../models/BBHouseguest')
const { generateId } = require('../helpers')
const { auth, requireAdmin } = require('../../../middleware/auth')
const { broadcastBBGame } = require('../../../socket/bbGame')
const { getCollection } = require('../../../config/db')

const GAME_ID = 'bigbrother'
const PHASES = ['opening', 'qa', 'closing']
const PHASE_NAME = { opening: '决赛开场发言', qa: '陪审团轮流提问', closing: '决赛总结发言' }

// 问答归属轮次：终局固定使用 F3 轮，避免 F3 → 冠军投票切换后问答列表被清空
function juryQaRoundId(season) {
  if (season?.final3Round) return `round-${season.final3Round}`
  return `round-${season?.currentRound || 1}`
}

function normalizePhase(phase) {
  return PHASES.includes(phase) ? phase : 'opening'
}

async function getJuryGuests() {
  return BBHouseguest.find({ gameId: GAME_ID, role: 'houseguest', status: 'jury' })
}

/**
 * 陪审团提问顺序：
 *  1) 管理员保存的顺序（过滤已不在陪审团的 ID）
 *  2) 进入陪审团的顺序（按淘汰记录时间）
 *  3) 最后一位陪审（F3 淘汰）
 *  4) 其余陪审团成员
 */
async function getJuryOrderIds(season) {
  const jurors = await getJuryGuests()
  const byId = new Map(jurors.map(j => [j.id, j]))
  const order = []
  const push = (id) => {
    if (id && byId.has(id) && !order.includes(id)) order.push(id)
  }

  for (const id of (season?.juryQAJuryOrder || [])) push(id)

  const evictions = await getCollection('BBEviction')
    .find({ gameId: GAME_ID })
    .sort({ createdAt: 1 })
    .toArray()
  for (const e of evictions) push(e.evictedId)

  if (season?.lastJuryId) push(season.lastJuryId)
  for (const j of jurors) push(j.id)

  return { order, byId }
}

async function getQaState(season) {
  const { order, byId } = await getJuryOrderIds(season)
  const juryOrder = order.map(id => ({ playerId: id, name: byId.get(id)?.name || '' }))
  let turnIndex = Number(season?.juryQATurnIndex) || 0
  if (juryOrder.length) {
    turnIndex = ((turnIndex % juryOrder.length) + juryOrder.length) % juryOrder.length
  } else {
    turnIndex = 0
  }
  const phase = normalizePhase(season?.juryQAPhase)
  return {
    phase,
    phaseName: PHASE_NAME[phase],
    juryOrder,
    turnIndex,
    currentTurn: juryOrder[turnIndex] || null,
    orderIds: order
  }
}

function legacyToMessages(docs) {
  const out = []
  for (const d of docs) {
    if (d.type) {
      out.push(d.toObject())
      continue
    }
    // 兼容旧版「问题 + 回答」数据
    if (d.question) {
      out.push({
        id: d.id,
        roundId: d.roundId,
        type: 'question',
        phase: 'qa',
        senderId: d.juryId,
        senderName: d.juryName,
        senderRole: 'jury',
        content: d.question,
        replyToId: null,
        replyToName: '',
        replyToContent: '',
        createdAt: d.createdAt
      })
      if (d.answer) {
        out.push({
          id: `${d.id}-answer`,
          roundId: d.roundId,
          type: 'answer',
          phase: 'qa',
          senderId: d.answerBy,
          senderName: d.answerByName || '决赛选手',
          senderRole: 'finalist',
          content: d.answer,
          replyToId: d.id,
          replyToName: d.juryName || '',
          replyToContent: d.question,
          createdAt: d.answeredAt || d.updatedAt || d.createdAt
        })
      }
    }
  }
  out.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')))
  return out
}

// GET / - 陪审团问答室状态 + 消息
router.get('/', auth, async (req, res) => {
  try {
    const season = await BBSeason.findOne({ gameId: GAME_ID })
    const roundId = juryQaRoundId(season)
    const docs = await BBJuryQA.find({ gameId: GAME_ID, roundId })
    const state = await getQaState(season)
    res.json({
      success: true,
      data: {
        roundId,
        phase: state.phase,
        phaseName: state.phaseName,
        juryOrder: state.juryOrder,
        turnIndex: state.turnIndex,
        currentTurn: state.currentTurn,
        messages: legacyToMessages(docs)
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取陪审团问答失败' })
  }
})

// POST /message - 发送问答室消息
// - 第一阶段/第三阶段：仅决赛选手可发言
// - 第二阶段：jury 按顺序轮流提问；决赛选手可主动发言
router.post('/message', auth, async (req, res) => {
  try {
    const raw = req.body?.content
    const content = typeof raw === 'string' ? raw.trim() : ''
    if (!content) {
      return res.status(400).json({ success: false, error: '内容不能为空' })
    }
    const season = await BBSeason.findOne({ gameId: GAME_ID })
    if (!season) return res.status(404).json({ success: false, error: '赛季不存在' })
    const phase = normalizePhase(season.juryQAPhase)
    const roundId = juryQaRoundId(season)

    const sender = await BBHouseguest.findOne({ id: req.user?.userId, gameId: GAME_ID })
    const isAdmin = req.user?.role === 'admin' || sender?.role === 'admin'
    let senderRole = 'admin'
    if (!isAdmin) {
      if (sender?.status === 'f2') senderRole = 'finalist'
      else if (sender?.status === 'jury') senderRole = 'jury'
      else return res.status(403).json({ success: false, error: '只有决赛二人和陪审团可以发言', code: 'NOT_SPEAKER' })
    }

    let type = 'message'
    let orderIds = []
    let turnIndex = 0

    if (senderRole === 'jury') {
      if (phase !== 'qa') {
        return res.status(403).json({ success: false, error: '当前环节陪审团不能发言', code: 'JURY_CANNOT_SPEAK' })
      }
      type = 'question'
      const orderInfo = await getJuryOrderIds(season)
      orderIds = orderInfo.order
      if (orderIds.length) {
        turnIndex = Number(season.juryQATurnIndex) || 0
        turnIndex = ((turnIndex % orderIds.length) + orderIds.length) % orderIds.length
        const currentId = orderIds[turnIndex]
        if (currentId !== sender.id) {
          const current = await BBHouseguest.findOne({ id: currentId, gameId: GAME_ID })
          return res.status(403).json({
            success: false,
            error: `当前轮到 ${current?.name || '其他陪审'} 提问`,
            code: 'NOT_YOUR_TURN'
          })
        }
      }
    }

    const doc = new BBJuryQA({
      id: generateId(),
      roundId,
      type,
      phase,
      senderId: sender?.id || req.user?.userId || null,
      senderName: sender?.name || req.user?.name || '管理员',
      senderRole,
      content,
      // 兼容旧字段（jury 提问）
      juryId: senderRole === 'jury' ? (sender?.id || null) : null,
      juryName: senderRole === 'jury' ? (sender?.name || '') : '',
      question: senderRole === 'jury' ? content : '',
      gameId: GAME_ID,
      createdAt: new Date().toISOString()
    })
    await doc.save()

    // 同一位陪审在轮到自己时可以连续提多个问题，由管理员或该陪审点击「下一位」再轮转
    broadcastBBGame('bb:jury-qa', { roundId })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '发送失败' })
  }
})

// POST /answer - 决赛选手引用某条提问进行回答
router.post('/answer', auth, async (req, res) => {
  try {
    const { questionId, answer } = req.body || {}
    const content = typeof answer === 'string' ? answer.trim() : ''
    if (!questionId || !content) {
      return res.status(400).json({ success: false, error: '缺少参数' })
    }
    const season = await BBSeason.findOne({ gameId: GAME_ID })
    if (!season) return res.status(404).json({ success: false, error: '赛季不存在' })
    const phase = normalizePhase(season.juryQAPhase)
    if (phase !== 'qa') {
      return res.status(403).json({ success: false, error: '当前环节不能回答问题', code: 'WRONG_PHASE' })
    }

    const answerer = await BBHouseguest.findOne({ id: req.user?.userId, gameId: GAME_ID })
    if (!answerer || answerer.status !== 'f2') {
      return res.status(403).json({ success: false, error: '只有决赛二人可以回答问题', code: 'NOT_FINALIST' })
    }

    const question = await BBJuryQA.findOne({ id: questionId, gameId: GAME_ID })
    if (!question) return res.status(404).json({ success: false, error: '问题不存在' })
    const qContent = question.content || question.question || ''
    if (!qContent) return res.status(400).json({ success: false, error: '该消息不是提问' })

    const doc = new BBJuryQA({
      id: generateId(),
      roundId: question.roundId || juryQaRoundId(season),
      type: 'answer',
      phase: 'qa',
      senderId: answerer.id,
      senderName: answerer.name,
      senderRole: 'finalist',
      content,
      replyToId: question.id,
      replyToName: question.senderName || question.juryName || '',
      replyToContent: qContent,
      gameId: GAME_ID,
      createdAt: new Date().toISOString()
    })
    await doc.save()
    broadcastBBGame('bb:jury-qa', { roundId: doc.roundId })
    res.json({ success: true, data: doc.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '回答失败' })
  }
})

// POST /phase - 管理员切换问答室环节
router.post('/phase', auth, requireAdmin, async (req, res) => {
  try {
    const phase = req.body?.phase
    if (!PHASES.includes(phase)) {
      return res.status(400).json({ success: false, error: '无效的环节', code: 'INVALID_PHASE' })
    }
    const season = await BBSeason.findOne({ gameId: GAME_ID })
    if (!season) return res.status(404).json({ success: false, error: '赛季不存在' })
    season.juryQAPhase = phase
    if (phase === 'qa') {
      // 进入第二环节：初始化提问顺序与轮次
      const { order } = await getJuryOrderIds(season)
      if (!Array.isArray(season.juryQAJuryOrder) || !season.juryQAJuryOrder.length) {
        season.juryQAJuryOrder = order
      }
      season.juryQATurnIndex = 0
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:jury-qa', { roundId: juryQaRoundId(season) })
    res.json({ success: true, data: { phase } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '切换环节失败' })
  }
})

// POST /order - 管理员调整陪审团提问顺序
router.post('/order', auth, requireAdmin, async (req, res) => {
  try {
    const list = req.body?.order
    if (!Array.isArray(list)) {
      return res.status(400).json({ success: false, error: 'order 必须为数组' })
    }
    const season = await BBSeason.findOne({ gameId: GAME_ID })
    if (!season) return res.status(404).json({ success: false, error: '赛季不存在' })
    const jurors = await getJuryGuests()
    const valid = new Set(jurors.map(j => j.id))
    const order = []
    for (const id of list) {
      if (valid.has(id) && !order.includes(id)) order.push(id)
    }
    for (const j of jurors) {
      if (!order.includes(j.id)) order.push(j.id)
    }
    season.juryQAJuryOrder = order
    season.juryQATurnIndex = 0
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:jury-qa', { roundId: juryQaRoundId(season) })
    res.json({ success: true, data: { order } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存顺序失败' })
  }
})

// POST /next-turn - 轮转到下一位陪审（管理员，或当前轮到的陪审自己结束本轮提问）
router.post('/next-turn', auth, async (req, res) => {
  try {
    const season = await BBSeason.findOne({ gameId: GAME_ID })
    if (!season) return res.status(404).json({ success: false, error: '赛季不存在' })
    const { order } = await getJuryOrderIds(season)
    if (!order.length) {
      return res.json({ success: true, data: { turnIndex: 0 } })
    }
    const cur = ((Number(season.juryQATurnIndex) || 0) % order.length + order.length) % order.length
    const isAdmin = req.user?.role === 'admin'
    if (!isAdmin && order[cur] !== req.user?.userId) {
      return res.status(403).json({ success: false, error: '只有管理员或当前提问的陪审可以切换到下一位', code: 'NOT_YOUR_TURN' })
    }
    season.juryQATurnIndex = (cur + 1) % order.length
    season.updatedAt = new Date().toISOString()
    await season.save()
    broadcastBBGame('bb:jury-qa', { roundId: juryQaRoundId(season) })
    res.json({ success: true, data: { turnIndex: season.juryQATurnIndex } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '轮转失败' })
  }
})

// DELETE /:id - 管理员删除消息
router.delete('/:id', auth, requireAdmin, async (req, res) => {
  try {
    await BBJuryQA.deleteOne({ id: req.params.id, gameId: GAME_ID })
    broadcastBBGame('bb:jury-qa', {})
    res.json({ success: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '删除失败' })
  }
})

module.exports = router
