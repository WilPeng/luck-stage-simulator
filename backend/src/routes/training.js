const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction, getCurrentSeason, randomInt, ACTION_TYPES } = require('../utils/helpers')
const TrainingCard = require('../models/TrainingCard')
const TrainingRecord = require('../models/TrainingRecord')
const Round = require('../models/Round')
const RoundTeamMember = require('../models/RoundTeamMember')
const User = require('../models/User')

const router = express.Router()

function computeAttrDelta(drawn, user) {
  const attrDelta = { vocal: 0, dance: 0, charm: 0 }
  const eff = drawn.effect || {}
  const cur = user && user.attributes ? user.attributes : { vocal: 30, dance: 30, charm: 30 }

  if (typeof eff.vocal === 'number') attrDelta.vocal = eff.vocal
  if (typeof eff.dance === 'number') attrDelta.dance = eff.dance
  if (typeof eff.charm === 'number') attrDelta.charm = eff.charm

  if (typeof eff.randomOne === 'number') {
    const keys = ['vocal', 'dance', 'charm']
    const k = keys[Math.floor(Math.random() * 3)]
    attrDelta[k] += eff.randomOne
  }

  if (typeof eff.randomTwo === 'number') {
    const keys = ['vocal', 'dance', 'charm']
    const shuffled = keys.slice().sort(() => Math.random() - 0.5)
    for (const k of shuffled.slice(0, 2)) attrDelta[k] += eff.randomTwo
  }

  if (typeof eff.lowest === 'number') {
    const k = Object.keys(cur).reduce((m, x) => cur[x] < cur[m] ? x : m, 'vocal')
    attrDelta[k] += eff.lowest
  }

  if (typeof eff.highest === 'number') {
    const k = Object.keys(cur).reduce((m, x) => cur[x] > cur[m] ? x : m, 'vocal')
    attrDelta[k] += eff.highest
  }

  return attrDelta
}

function weightedRandomCard(cards) {
  const totalWeight = cards.reduce((s, c) => s + (c.weight || 0), 0)
  let rand = Math.random() * totalWeight
  let drawn = cards[0]
  for (const c of cards) {
    if (rand < (c.weight || 0)) { drawn = c; break }
    rand -= (c.weight || 0)
  }
  return drawn
}

async function getRound(roundId) {
  if (roundId) {
    const r = await Round.findOne({ id: roundId })
    if (r) return r
    // 兼容 round-1 / round_1 格式
    const match = roundId.match(/^round[_-](\d+)$/)
    if (match) {
      const idx = parseInt(match[1])
      const season = await getCurrentSeason()
      if (season) {
        const r2 = await Round.findOne({ seasonId: season.id, index: idx })
        if (r2) return r2
        return { id: `round-${idx}`, index: idx }
      }
    }
    return null
  }
  const season = await getCurrentSeason()
  if (!season) return null
  return await Round.findOne({ seasonId: season.id, index: season.currentRound })
}

// 规范化effect，确保始终包含 vocal/dance/charm 三个字段
function normalizeEffect(eff) {
  const result = { vocal: 0, dance: 0, charm: 0 }
  if (eff) {
    if (typeof eff.vocal === 'number') result.vocal = eff.vocal
    if (typeof eff.dance === 'number') result.dance = eff.dance
    if (typeof eff.charm === 'number') result.charm = eff.charm
  }
  return result
}

// 规范化attributesAfter，确保始终包含 vocal/dance/charm 三个字段
function normalizeAttributesAfter(attrs) {
  return {
    vocal: (attrs && typeof attrs.vocal === 'number') ? attrs.vocal : 0,
    dance: (attrs && typeof attrs.dance === 'number') ? attrs.dance : 0,
    charm: (attrs && typeof attrs.charm === 'number') ? attrs.charm : 0
  }
}

// ===== GET /api/training/config - 获取训练配置 =====
router.get('/config', auth, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    if (!season) {
      return res.json({ drawsPerPlayer: 3, currentRound: 1, totalRounds: 3 })
    }
    res.json({
      drawsPerPlayer: season.trainingDrawsPerPlayer || 3,
      currentRound: season.currentRound || 1,
      totalRounds: season.totalRounds || 3
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取训练配置失败', code: 'SERVER_ERROR' })
  }
})

// ===== PUT /api/training/config - 更新训练配置 =====
router.put('/config', auth, requireAdmin, async (req, res) => {
  try {
    const { drawsPerPlayer, currentRound, totalRounds } = req.body

    if (drawsPerPlayer !== undefined && (typeof drawsPerPlayer !== 'number' || drawsPerPlayer < 1 || drawsPerPlayer > 10)) {
      return res.status(400).json({ success: false, error: 'drawsPerPlayer 必须在 1-10 之间', code: 'INVALID_DRAWS' })
    }
    if (currentRound !== undefined && (typeof currentRound !== 'number' || currentRound < 1)) {
      return res.status(400).json({ success: false, error: 'currentRound 必须 >= 1', code: 'INVALID_ROUND' })
    }
    if (totalRounds !== undefined && (typeof totalRounds !== 'number' || totalRounds < 1 || totalRounds > 10)) {
      return res.status(400).json({ success: false, error: 'totalRounds 必须在 1-10 之间', code: 'INVALID_TOTAL_ROUNDS' })
    }

    const season = await getCurrentSeason()
    if (!season) {
      return res.status(500).json({ success: false, error: '赛季不存在', code: 'NO_SEASON' })
    }

    if (currentRound !== undefined && totalRounds !== undefined && currentRound > totalRounds) {
      return res.status(400).json({ success: false, error: 'currentRound 不能大于 totalRounds', code: 'ROUND_EXCEEDS_TOTAL' })
    }

    if (drawsPerPlayer !== undefined) season.trainingDrawsPerPlayer = drawsPerPlayer
    if (currentRound !== undefined) season.currentRound = currentRound
    if (totalRounds !== undefined) season.totalRounds = totalRounds
    season.updatedAt = new Date().toISOString()
    await season.save()

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'season', season.id,
      `更新训练配置: drawsPerPlayer=${season.trainingDrawsPerPlayer}, currentRound=${season.currentRound}, totalRounds=${season.totalRounds}`)

    res.json({
      drawsPerPlayer: season.trainingDrawsPerPlayer,
      currentRound: season.currentRound,
      totalRounds: season.totalRounds
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新训练配置失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/training/cards - 训练卡列表 =====
router.get('/cards', auth, async (req, res) => {
  try {
    let cards = await TrainingCard.find({})
    if (req.user.role !== 'admin') cards = cards.filter(c => c.enabled !== false)
    cards.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    res.json({ success: true, data: cards, total: cards.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取训练卡失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/training/cards - 新增训练卡 =====
router.post('/cards', auth, requireAdmin, async (req, res) => {
  try {
    const { name, type, description, effect, weight, enabled } = req.body
    if (!name) return res.status(400).json({ success: false, error: 'name 必填', code: 'INVALID_PARAMS' })
    const card = new TrainingCard({
      id: generateId(), name, type: type || 'mixed', description: description || '',
      effect: effect || { vocal: 1 }, weight: typeof weight === 'number' ? weight : 10,
      enabled: enabled !== false, createdAt: new Date().toISOString()
    })
    await card.save()
    res.json({ success: true, data: card })
  } catch (e) {
    res.status(500).json({ success: false, error: '新增失败', code: 'SERVER_ERROR' })
  }
})

// ===== PUT /api/training/cards/:id =====
router.put('/cards/:id', auth, requireAdmin, async (req, res) => {
  try {
    const card = await TrainingCard.findOne({ id: req.params.id })
    if (!card) return res.status(404).json({ success: false, error: '训练卡不存在', code: 'NOT_FOUND' })
    const fields = ['name', 'type', 'description', 'effect', 'weight', 'enabled']
    for (const f of fields) if (req.body[f] !== undefined) card[f] = req.body[f]
    card.updatedAt = new Date().toISOString()
    await card.save()
    res.json({ success: true, data: card })
  } catch (e) {
    res.status(500).json({ success: false, error: '更新失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/training/cards/:id =====
router.delete('/cards/:id', auth, requireAdmin, async (req, res) => {
  try {
    await TrainingCard.deleteOne({ id: req.params.id })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/training/draw - 抽一张训练卡 =====
router.post('/draw', auth, async (req, res) => {
  try {
    const { roundId, roundIndex, round: roundQuery, playerId, userId } = req.body
    const pid = playerId || userId || req.user.userId
    const rIdxInput = roundIndex !== undefined ? parseInt(roundIndex) : (roundQuery !== undefined ? parseInt(roundQuery) : null)
    let round = await getRound(roundId)
    if (!round && rIdxInput !== null) {
      const season = await getCurrentSeason()
      if (season) round = await Round.findOne({ seasonId: season.id, index: rIdxInput })
    }
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : rIdxInput

    const season = await getCurrentSeason()
    const drawsPerPlayer = (season && season.trainingDrawsPerPlayer) || 3

    // 检查本轮抽卡次数（兼容 roundId UUID 和 round-1 两种格式）
    const countFilter = { playerId: pid }
    if (rId !== roundId) {
      countFilter.$or = [{ roundId: rId }, { roundId: roundId }]
    } else {
      countFilter.roundId = rId
    }
    const existingRecords = await TrainingRecord.find(countFilter)
    if (existingRecords.length >= drawsPerPlayer) {
      return res.status(409).json({ success: false, error: `已达训练上限`, code: 'DRAW_LIMIT_REACHED' })
    }

    // 按权重抽卡
    const cards = (await TrainingCard.find({})).filter(c => c.enabled !== false)
    if (cards.length === 0) return res.status(400).json({ success: false, error: '没有可用训练卡', code: 'NO_CARDS' })

    const drawn = weightedRandomCard(cards)

    // 更新用户属性
    const user = await User.findOne({ id: pid })
    const attrDelta = computeAttrDelta(drawn, user)
    if (user) {
      user.attributes = user.attributes || { vocal: 30, dance: 30, charm: 30 }
      user.attributes.vocal = (user.attributes.vocal || 0) + attrDelta.vocal
      user.attributes.dance = (user.attributes.dance || 0) + attrDelta.dance
      user.attributes.charm = (user.attributes.charm || 0) + attrDelta.charm
      user.trainingCount = (user.trainingCount || 0) + 1
      await user.save()
    }

    // 记录
    const attributesAfter = user ? { ...user.attributes } : { vocal: 30, dance: 30, charm: 30 }
    const record = new TrainingRecord({
      id: generateId(), roundId: rId, roundIndex: rIdx,
      userId: pid, userName: user ? user.name : pid, playerId: pid,
      cardId: drawn.id, cardName: drawn.name, cardType: drawn.type,
      effect: drawn.effect || {}, attrDelta, attributesAfter,
      createdAt: new Date().toISOString()
    })
    await record.save()

    logAction(pid, user ? user.name : pid, req.user.role, ACTION_TYPES.TRAINING_DRAW, 'card', drawn.id, `抽到 ${drawn.name}`)

    const remainingDraws = Math.max(0, drawsPerPlayer - existingRecords.length - 1)
    const recordForResponse = {
      id: record.id,
      userId: record.userId,
      userName: record.userName,
      cardId: record.cardId,
      cardName: record.cardName,
      cardType: record.cardType,
      effect: normalizeEffect(record.attrDelta || record.effect),
      attributesAfter: normalizeAttributesAfter(record.attributesAfter),
      round: record.roundIndex,
      createdAt: record.createdAt
    }
    const userForResponse = user ? {
      id: user.id,
      name: user.name,
      attributes: normalizeAttributesAfter(user.attributes),
      trainingCount: (existingRecords.length + 1),
      remainingDraws
    } : null

    res.json({
      success: true,
      data: {
        record: recordForResponse,
        user: userForResponse,
        remainingDraws,
        drawsUsed: existingRecords.length + 1,
        drawsTotal: drawsPerPlayer
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '抽卡失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/training/auto-complete - 一键完成所有选手训练 =====
router.post('/auto-complete', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, roundIndex } = req.body
    let round = await getRound(roundId)
    if (!round && roundIndex) {
      const season = await getCurrentSeason()
      if (season) round = await Round.findOne({ seasonId: season.id, index: parseInt(roundIndex) })
    }
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : (roundIndex ? parseInt(roundIndex) : null)

    const season = await getCurrentSeason()
    const drawsPerPlayer = (season && season.trainingDrawsPerPlayer) || 3

    const cards = (await TrainingCard.find({})).filter(c => c.enabled !== false)
    if (cards.length === 0) return res.status(400).json({ success: false, error: '没有可用训练卡', code: 'NO_CARDS' })

    const players = await User.find({ role: { $ne: 'admin' }, status: 'active' })
    const details = []
    let generatedCount = 0

    for (const user of players) {
      const countFilter = { playerId: user.id }
      if (rId !== roundId) {
        countFilter.$or = [{ roundId: rId }, { roundId: roundId }]
      } else {
        countFilter.roundId = rId
      }
      const existingRecords = await TrainingRecord.find(countFilter)
      const remaining = drawsPerPlayer - existingRecords.length
      if (remaining <= 0) continue

      let drawsForPlayer = 0
      for (let i = 0; i < remaining; i++) {
        const drawn = weightedRandomCard(cards)
        const attrDelta = computeAttrDelta(drawn, user)

        user.attributes = user.attributes || { vocal: 30, dance: 30, charm: 30 }
        user.attributes.vocal = (user.attributes.vocal || 0) + attrDelta.vocal
        user.attributes.dance = (user.attributes.dance || 0) + attrDelta.dance
        user.attributes.charm = (user.attributes.charm || 0) + attrDelta.charm

        const attributesAfter = { ...user.attributes }
        const record = new TrainingRecord({
          id: generateId(), roundId: rId, roundIndex: rIdx,
          userId: user.id, userName: user.name, playerId: user.id,
          cardId: drawn.id, cardName: drawn.name, cardType: drawn.type,
          effect: drawn.effect || {}, attrDelta, attributesAfter,
          createdAt: new Date().toISOString()
        })
        await record.save()

        generatedCount++
        drawsForPlayer++
      }

      await user.save()
      details.push({ playerId: user.id, playerName: user.name, drawsGenerated: drawsForPlayer })
    }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'training', rId,
      `一键完成训练：${generatedCount} 条记录，涉及 ${details.length} 位选手`)

    res.json({ success: true, data: { generatedCount, drawsPerPlayer, details } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '一键完成训练失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/training/auto-complete-all - 一键随机补全未排练选手 =====
router.post('/auto-complete-all', auth, requireAdmin, async (req, res) => {
  try {
    const { round, roundId } = req.body
    const roundInput = round !== undefined ? parseInt(round) : null

    if (roundInput === null && !roundId) {
      // 如果没传 round，从训练配置中读取 currentRound
      const season = await getCurrentSeason()
      const fallbackRound = (season && season.currentRound) || 1
      return res.status(400).json({
        success: false,
        message: `缺少 round 参数，当前训练配置中 currentRound = ${fallbackRound}`
      })
    }

    // 直接用 round 序号构造 roundId，不再依赖 Round 表
    const rIdx = roundInput
    const rId = roundId || `round-${rIdx}`

    const season = await getCurrentSeason()
    const drawsPerPlayer = (season && season.trainingDrawsPerPlayer) || 3

    const cards = (await TrainingCard.find({})).filter(c => c.enabled !== false)
    if (cards.length === 0) return res.status(400).json({ success: false, message: '没有可用训练卡' })

    const players = await User.find({ role: { $ne: 'admin' }, status: 'active' })

    const results = []
    let totalDraws = 0
    let processedCount = 0
    let skippedCount = 0

    for (const user of players) {
      const existingRecords = await TrainingRecord.find({ roundId: rId, playerId: user.id })

      // 只处理本轮训练次数为 0 的选手
      if (existingRecords.length > 0) {
        skippedCount++
        continue
      }

      // 随机生成 1~N 次排练
      const drawTimes = Math.floor(Math.random() * drawsPerPlayer) + 1

      const drawsForPlayer = []
      for (let i = 0; i < drawTimes; i++) {
        const drawn = weightedRandomCard(cards)
        const attrDelta = computeAttrDelta(drawn, user)

        user.attributes = user.attributes || { vocal: 30, dance: 30, charm: 30 }
        user.attributes.vocal = (user.attributes.vocal || 0) + attrDelta.vocal
        user.attributes.dance = (user.attributes.dance || 0) + attrDelta.dance
        user.attributes.charm = (user.attributes.charm || 0) + attrDelta.charm

        const attributesAfter = { ...user.attributes }
        const record = new TrainingRecord({
          id: generateId(), roundId: rId, roundIndex: rIdx,
          userId: user.id, userName: user.name, playerId: user.id,
          cardId: drawn.id, cardName: drawn.name, cardType: drawn.type,
          effect: drawn.effect || {}, attrDelta, attributesAfter,
          createdAt: new Date().toISOString()
        })
        await record.save()

        totalDraws++
        drawsForPlayer.push({
          cardName: drawn.name,
          effect: normalizeEffect(drawn.effect)
        })
      }

      await user.save()

      results.push({
        playerId: user.id,
        playerName: user.name,
        drawsCount: drawTimes,
        draws: drawsForPlayer,
        finalAttributes: normalizeAttributesAfter(user.attributes)
      })
      processedCount++
    }

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'training', rId,
      `一键随机补全：处理 ${processedCount} 位选手，跳过 ${skippedCount} 位，共 ${totalDraws} 次抽卡`)

    res.json({
      data: {
        processedCount,
        totalDraws,
        skippedCount,
        results
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, message: '一键随机补全失败' })
  }
})

// ===== DELETE /api/training/clear-user-records - 取消本轮所有选手训练成果 =====
router.delete('/clear-user-records', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, roundIndex } = req.query
    const round = await getRound(roundId)
    const rId = round ? round.id : roundId

    const filter = {}
    if (rId) {
      if (rId !== roundId) {
        filter.$or = [{ roundId: rId }, { roundId: roundId }]
      } else {
        filter.roundId = rId
      }
    }
    if (roundIndex) filter.roundIndex = parseInt(roundIndex)
    const rollbackMap = {}
    for (const r of records) {
      const delta = r.attrDelta || r.effect || {}
      const pid = r.playerId
      if (!rollbackMap[pid]) rollbackMap[pid] = { vocal: 0, dance: 0, charm: 0 }
      rollbackMap[pid].vocal += delta.vocal || 0
      rollbackMap[pid].dance += delta.dance || 0
      rollbackMap[pid].charm += delta.charm || 0
    }

    // 回滚用户属性
    for (const [pid, delta] of Object.entries(rollbackMap)) {
      const user = await User.findOne({ id: pid })
      if (user && user.attributes) {
        user.attributes.vocal = (user.attributes.vocal || 0) - delta.vocal
        user.attributes.dance = (user.attributes.dance || 0) - delta.dance
        user.attributes.charm = (user.attributes.charm || 0) - delta.charm
        await user.save()
      }
    }

    await TrainingRecord.deleteMany(filter)

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'training', rId,
      `取消本轮训练成果：删除 ${records.length} 条记录，回滚 ${Object.keys(rollbackMap).length} 位选手属性`)

    res.json({ success: true, data: { deletedCount: records.length, affectedUsers: Object.keys(rollbackMap).length } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '取消训练成果失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/training/records - 训练记录列表（分页） =====
router.get('/records', auth, async (req, res) => {
  try {
    const { roundId, playerId, userId, cardId, page = 1, pageSize = 10 } = req.query
    const pid = playerId || userId

    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    // 兼容 roundId 查询：使用 DB UUID 和前端 roundId 两种格式
    // 训练记录可能以 "round-1" 或 DB UUID 两种格式保存
    const orConditions = [{ roundId: rId }]
    if (rId !== roundId) {
      orConditions.push({ roundId: roundId })
    }
    const filter = orConditions.length > 1 ? { $or: orConditions } : { roundId: rId }
    if (pid) filter.playerId = pid
    if (cardId) filter.cardId = cardId

    const allRecords = await TrainingRecord.find(filter)
    allRecords.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

    const currentPage = Math.max(1, parseInt(page) || 1)
    const currentPageSize = Math.max(1, parseInt(pageSize) || 10)
    const skip = (currentPage - 1) * currentPageSize
    const total = allRecords.length
    const totalPages = Math.ceil(total / currentPageSize) || 1
    const list = allRecords.slice(skip, skip + currentPageSize)

    // 补充用户信息
    const userIds = [...new Set(list.map(r => r.playerId).filter(Boolean))]
    const users = await User.find({ id: { $in: userIds } })
    const userMap = {}
    for (const u of users) userMap[u.id] = u

    const enriched = list.map(r => ({
      id: r.id,
      userId: r.userId || r.playerId,
      userName: r.userName || (userMap[r.playerId] ? userMap[r.playerId].name : r.playerId),
      cardId: r.cardId,
      cardName: r.cardName,
      cardType: r.cardType,
      effect: normalizeEffect(r.attrDelta || r.effect),
      attributesAfter: normalizeAttributesAfter(r.attributesAfter),
      round: r.roundIndex,
      roundId: r.roundId,
      createdAt: r.createdAt
    }))

    console.log(`[GET /api/training/records] query:`, JSON.stringify(req.query), `filter:`, JSON.stringify(filter), `total:`, total, `returned:`, enriched.length)

    res.json({
      success: true,
      data: { list: enriched, total, page: currentPage, pageSize: currentPageSize, totalPages }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取训练记录失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/training/stats - 训练统计（roundId 必填）=====
router.get('/stats', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    // 兼容 roundId 查询：使用 DB UUID 和前端 roundId 两种格式
    const orConditions = [{ roundId: rId }]
    if (rId !== roundId) {
      orConditions.push({ roundId: roundId })
    }
    const filter = orConditions.length > 1 ? { $or: orConditions } : { roundId: rId }

    const [records, allUsers, teamMembers] = await Promise.all([
      TrainingRecord.find(filter),
      User.find({ role: { $ne: 'admin' } }),
      rId ? RoundTeamMember.find({ roundId: rId }) : Promise.resolve([])
    ])

    const season = await getCurrentSeason()
    const drawsPerPlayer = (season && season.trainingDrawsPerPlayer) || 3

    const players = allUsers.filter(u => u.role !== 'admin')
    const userMap = {}
    for (const u of players) userMap[u.id] = u
    const activePlayers = players.filter(u => u.status === 'active').length
    const playersInTeamSet = new Set((teamMembers || []).map(m => m.playerId))
    const playersInTeams = playersInTeamSet.size
    const playersNotInTeams = players.length - playersInTeams

    const totalTrainingCount = records.length
    const averageTrainingCount = players.length ? +(totalTrainingCount / players.length).toFixed(1) : 0

    // 每个选手的训练次数
    const playerDrawCount = {}
    for (const r of records) {
      playerDrawCount[r.playerId] = (playerDrawCount[r.playerId] || 0) + 1
    }
    const completedTrainingPlayers = Object.values(playerDrawCount).filter(c => c >= drawsPerPlayer).length
    const completionRate = players.length ? +((completedTrainingPlayers / players.length) * 100).toFixed(1) : 0

    // 训练类型分布
    const trainingDistribution = {}
    for (const r of records) {
      const type = r.cardType || 'mixed'
      trainingDistribution[type] = (trainingDistribution[type] || 0) + 1
    }

    // 进步最多的选手：按 attrDelta 总和计算
    const playerImprovement = {}
    for (const r of records) {
      const delta = r.attrDelta || r.effect || {}
      const sum = (delta.vocal || 0) + (delta.dance || 0) + (delta.charm || 0)
      playerImprovement[r.playerId] = (playerImprovement[r.playerId] || 0) + sum
    }
    const topImprovers = Object.entries(playerImprovement)
      .map(([userId, improvement]) => ({ userId, name: userMap[userId] ? userMap[userId].name : userId, improvement }))
      .sort((a, b) => b.improvement - a.improvement)
      .slice(0, 10)

    res.json({
      success: true,
      data: {
        totalPlayers: players.length,
        activePlayers,
        playersInTeams,
        playersNotInTeams,
        totalTrainingCount,
        averageTrainingCount,
        completedTrainingPlayers,
        completionRate,
        trainingDistribution,
        topImprovers
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取训练统计失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/training/records/user/:userId - 清空用户本轮训练记录 =====
router.delete('/records/user/:userId', auth, requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params
    const { roundId, roundIndex } = req.query
    const round = roundId ? await getRound(roundId) : await getRound()
    const rId = round ? round.id : roundId

    const filter = { playerId: userId }
    if (rId) {
      if (rId !== roundId) {
        filter.$or = [{ roundId: rId }, { roundId: roundId }]
      } else {
        filter.roundId = rId
      }
    }
    if (roundIndex) filter.roundIndex = parseInt(roundIndex)
    const user = await User.findOne({ id: userId })
    if (user && user.attributes) {
      for (const r of records) {
        const delta = r.attrDelta || r.effect || {}
        user.attributes.vocal = (user.attributes.vocal || 0) - (delta.vocal || 0)
        user.attributes.dance = (user.attributes.dance || 0) - (delta.dance || 0)
        user.attributes.charm = (user.attributes.charm || 0) - (delta.charm || 0)
      }
      await user.save()
    }

    const result = await TrainingRecord.deleteMany(filter)
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'trainingRecord', userId, `清空用户训练记录 ${records.length} 条`)
    res.json({ success: true, data: { deletedCount: records.length } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清空训练记录失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/training/records/:id =====
router.delete('/records/:id', auth, requireAdmin, async (req, res) => {
  try {
    await TrainingRecord.deleteOne({ id: req.params.id })
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/training/history（roundId 必填）=====
router.get('/history', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    // 兼容 roundId 查询：使用 DB UUID 和前端 roundId 两种格式
    const orConditions = [{ roundId: rId }]
    if (rId !== roundId) {
      orConditions.push({ roundId: roundId })
    }
    const query = orConditions.length > 1 ? { $or: orConditions } : { roundId: rId }

    const records = await TrainingRecord.find(query)
    records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    res.json({ success: true, data: records, total: records.length })
  } catch (e) {
    res.status(500).json({ success: false, error: '获取历史失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
