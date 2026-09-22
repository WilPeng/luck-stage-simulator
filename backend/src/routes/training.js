const express = require('express')
const { auth, requireAdmin } = require('../middleware/auth')
const { generateId, logAction, getCurrentSeason, randomInt, ACTION_TYPES } = require('../utils/helpers')
const { getCollection } = require('../config/db')
const TrainingCard = require('../models/TrainingCard')
const TrainingRecord = require('../models/TrainingRecord')
const TrainingCardPool = require('../models/TrainingCardPool')
const TrainingStatus = require('../models/TrainingStatus')
const Round = require('../models/Round')
const RoundTeamMember = require('../models/RoundTeamMember')
const User = require('../models/User')

// 确保自主特训卡存在（首次抽卡时创建）
async function ensureSelfSelectCard() {
  try {
    const existing = await TrainingCard.findOne({ type: 'self_select' })
    if (!existing) {
      const card = new TrainingCard({
        id: generateId(),
        name: '自主特训',
        type: 'self_select',
        description: '自由选择一项属性增加',
        effect: { selfSelect: 5 },
        weight: 8,
        enabled: true
      })
      await card.save()
      console.log('[Training] 已创建自主特训卡')
    }
  } catch (e) {
    console.warn('[Training] 初始化自主特训卡失败:', e.message)
  }
}

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

  // 倍数效果：根据当前属性值将倍数转换为加减值
  // delta = Math.round(current_value × (multiply - 1))
  if (typeof eff.multiply === 'number' && eff.multiply > 0) {
    const factor = eff.multiply - 1
    const keys = ['vocal', 'dance', 'charm']
    const k = keys[Math.floor(Math.random() * 3)]
    attrDelta[k] += Math.round(cur[k] * factor)
  }

  if (typeof eff.multiplyAll === 'number' && eff.multiplyAll > 0) {
    const factor = eff.multiplyAll - 1
    for (const k of ['vocal', 'dance', 'charm']) {
      attrDelta[k] += Math.round(cur[k] * factor)
    }
  }

  // 取整效果：随机一项属性向上/向下取整至指定倍数的整数，结算时转化为加减数量
  // 例：属性97，roundDown=30 → 向下取整至30的倍数=90，delta=90-97=-7
  //     roundUp=30 → 向上取整至30的倍数=120，delta=120-97=+23
  if (typeof eff.roundDown === 'number' && eff.roundDown > 0) {
    const keys = ['vocal', 'dance', 'charm']
    const k = keys[Math.floor(Math.random() * 3)]
    const m = Math.max(1, Math.floor(eff.roundDown))
    const newVal = Math.floor(cur[k] / m) * m
    attrDelta[k] += newVal - cur[k]
  }

  if (typeof eff.roundUp === 'number' && eff.roundUp > 0) {
    const keys = ['vocal', 'dance', 'charm']
    const k = keys[Math.floor(Math.random() * 3)]
    const m = Math.max(1, Math.floor(eff.roundUp))
    const newVal = Math.ceil(cur[k] / m) * m
    attrDelta[k] += newVal - cur[k]
  }

  // 均衡化：向三者均值靠拢，缩小属性差距
  // balance>0 时提高最低项、降低最高项各 balance 点；balance<0 时反向拉大差距
  if (typeof eff.balance === 'number' && eff.balance !== 0) {
    const keys = ['vocal', 'dance', 'charm']
    const sorted = keys.slice().sort((a, b) => cur[a] - cur[b])
    const minK = sorted[0]
    const maxK = sorted[2]
    const b = Math.max(-10, Math.min(10, eff.balance))
    attrDelta[minK] += b
    attrDelta[maxK] -= b
  }

  // 幸运加成：随机一项大幅提升
  if (typeof eff.lucky === 'number' && eff.lucky !== 0) {
    const keys = ['vocal', 'dance', 'charm']
    const k = keys[Math.floor(Math.random() * 3)]
    attrDelta[k] += eff.lucky
  }

  // 团队共振：三项等额提升（适合综合/队伍增益卡）
  if (typeof eff.teamAll === 'number' && eff.teamAll !== 0) {
    for (const k of ['vocal', 'dance', 'charm']) {
      attrDelta[k] += eff.teamAll
    }
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
    if (typeof eff.selfSelect === 'number') result.selfSelect = eff.selfSelect
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

    if (drawsPerPlayer !== undefined && (typeof drawsPerPlayer !== 'number' || drawsPerPlayer < 1)) {
      return res.status(400).json({ success: false, error: 'drawsPerPlayer 必须 >= 1', code: 'INVALID_DRAWS' })
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

// ===== GET /api/training/finish-status-all - 管理员查看所有选手训练结束状态 =====
router.get('/finish-status-all', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId } = req.query
    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const list = await TrainingStatus.find({ roundId: rId })
    res.json({ success: true, data: { roundId: rId, list: list.map((s) => ({ playerId: s.playerId, finished: !!s.finished, finishedAt: s.finishedAt || null })) } })
  } catch (e) {
    res.status(500).json({ success: false, error: '查询失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/training/finish - 选手确认训练结束 =====
router.post('/finish', auth, async (req, res) => {
  try {
    const { roundId, finished } = req.body || {}
    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : null
    const pid = req.user.userId
    const user = await User.findOne({ id: pid })
    if (!user || user.status === 'eliminated') {
      return res.status(403).json({ success: false, error: '该选手已被淘汰', code: 'ELIMINATED' })
    }
    const wantFinish = finished !== false
    let st = await TrainingStatus.findOne({ roundId: rId, playerId: pid })
    if (!st) {
      st = new TrainingStatus({
        id: generateId(), roundId: rId, roundIndex: rIdx, playerId: pid,
        finished: wantFinish, finishedAt: wantFinish ? new Date().toISOString() : null,
        createdAt: new Date().toISOString()
      })
    } else {
      st.finished = wantFinish
      st.finishedAt = wantFinish ? (st.finishedAt || new Date().toISOString()) : null
      st.updatedAt = new Date().toISOString()
    }
    await st.save()
    // 仅当本轮没有任何 TrainingStatus 时才允许取消（简化：允许本人切换）
    res.json({ success: true, data: { roundId: rId, finished: st.finished, finishedAt: st.finishedAt } })
  } catch (e) {
    console.error('Training finish error:', e)
    res.status(500).json({ success: false, error: '确认训练结束失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/training/finish-status - 查询本人本轮训练结束状态 =====
router.get('/finish-status', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const pid = req.user.userId
    const st = await TrainingStatus.findOne({ roundId: rId, playerId: pid })
    res.json({ success: true, data: { roundId: rId, finished: !!(st && st.finished), finishedAt: st ? st.finishedAt : null } })
  } catch (e) {
    res.status(500).json({ success: false, error: '查询训练状态失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/training/finish-status/set - 管理员修改选手训练结束状态 =====
router.post('/finish-status/set', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, playerId, finished } = req.body || {}
    if (!playerId) return res.status(400).json({ success: false, error: 'playerId 必填', code: 'MISSING_PARAM' })
    const round = await getRound(roundId)
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : null
    const wantFinish = finished !== false
    let st = await TrainingStatus.findOne({ roundId: rId, playerId })
    if (!st) {
      st = new TrainingStatus({
        id: generateId(), roundId: rId, roundIndex: rIdx, playerId,
        finished: wantFinish, finishedAt: wantFinish ? new Date().toISOString() : null,
        createdAt: new Date().toISOString()
      })
    } else {
      st.finished = wantFinish
      st.finishedAt = wantFinish ? (st.finishedAt || new Date().toISOString()) : null
      st.updatedAt = new Date().toISOString()
    }
    await st.save()
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'training', rId,
      `${wantFinish ? '标记' : '取消'}选手 ${playerId} 训练结束`)
    res.json({ success: true, data: { roundId: rId, playerId, finished: st.finished, finishedAt: st.finishedAt } })
  } catch (e) {
    console.error('Set finish status error:', e)
    res.status(500).json({ success: false, error: '修改训练结束状态失败', code: 'SERVER_ERROR' })
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

// ===== GET /api/training/cards/:id - 获取单张训练卡 =====
router.get('/cards/:id', auth, async (req, res) => {
  try {
    const card = await TrainingCard.findOne({ id: req.params.id })
    if (!card) return res.status(404).json({ success: false, error: '训练卡不存在', code: 'NOT_FOUND' })
    res.json({ success: true, data: card })
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
    const collection = getCollection('TrainingCard')
    const result = await collection.deleteOne({ id: req.params.id })
    // 直接使用原生 MongoDB deleteOne，绕开 normalizeQuery，确保删除生效
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, error: '训练卡不存在', code: 'NOT_FOUND' })
    }
    res.json({ success: true })
  } catch (e) {
    res.status(500).json({ success: false, error: '删除失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/training/draw - 抽一张训练卡 =====
// ===== 每轮有限卡池（管理员在每轮抽卡前设置；带序号，每张仅可被一人抽中） =====

// 生成/重建卡池
router.post('/pool/setup', auth, requireAdmin, async (req, res) => {
  try {
    const { roundId, roundIndex, perPersonDrawCount, totalCards, counts } = req.body || {}
    const per = parseInt(perPersonDrawCount)
    if (!(per >= 1)) return res.status(400).json({ success: false, error: '每人抽取数量必须 ≥ 1', code: 'INVALID_PER' })

    const alive = await User.find({ role: { $ne: 'admin' }, status: 'active' })

    const cards = (await TrainingCard.find({})).filter(c => c.enabled !== false)
    if (!cards.length) return res.status(400).json({ success: false, error: '没有可用训练卡', code: 'NO_CARDS' })

    // 分布：优先使用管理员手动配置的每种卡牌数量（counts），否则按权重随机生成总数
    let distribution = []
    if (Array.isArray(counts) && counts.length) {
      const cardMap = {}
      for (const c of cards) cardMap[c.id] = c
      for (const item of counts) {
        const cnt = parseInt(item && item.count)
        if (!(cnt > 0)) continue
        const card = cardMap[item.cardId]
        if (!card) continue
        distribution.push({ card, count: cnt })
      }
      if (!distribution.length) {
        return res.status(400).json({ success: false, error: '请至少为一种卡牌设置数量', code: 'NO_COUNTS' })
      }
    } else {
      const total = parseInt(totalCards)
      if (!(total >= 1)) return res.status(400).json({ success: false, error: '卡牌总数必须 ≥ 1', code: 'INVALID_TOTAL' })
      distribution = [{ card: null, count: total }]
    }

    const total = distribution.reduce((s, d) => s + d.count, 0)
    if (per * alive.length > total) {
      return res.status(400).json({
        success: false,
        error: `每人抽取数量 × 存活总人数 = ${per} × ${alive.length} = ${per * alive.length}，不能超过卡牌总数 ${total}`,
        code: 'POOL_TOO_SMALL'
      })
    }

    let round = await getRound(roundId)
    let rIdx = roundIndex !== undefined ? parseInt(roundIndex) : null
    if (!round && rIdx !== null) {
      const season = await getCurrentSeason()
      if (season) round = await Round.findOne({ seasonId: season.id, index: rIdx })
    }
    const rId = round ? round.id : (roundId || 'default-round')
    if (round && round.index !== undefined) rIdx = round.index

    // 展开为逐张卡牌后打乱
    const flat = []
    for (const d of distribution) {
      for (let i = 0; i < d.count; i++) flat.push(d.card || weightedRandomCard(cards))
    }
    for (let i = flat.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[flat[i], flat[j]] = [flat[j], flat[i]]
    }

    await TrainingCardPool.deleteMany({ roundId: rId })
    const pool = flat.map((c, idx) => ({
      id: generateId(), roundId: rId, roundIndex: rIdx, index: idx + 1,
      perPersonDrawCount: per, totalCards: total,
      cardId: c.id, cardName: c.name, cardType: c.type, effect: c.effect || {},
      drawnBy: null, gameId: req.gameId, createdAt: new Date().toISOString()
    }))
    await TrainingCardPool.insertMany(pool)
    try {
      await logAction(req.user.userId, req.user.name, req.user.role,
        ACTION_TYPES.TRAINING_CARD_DRAW || 'TRAINING_POOL_SETUP', 'round', rId,
        `生成卡池：共 ${total} 张，每人可抽 ${per} 张`)
    } catch (le) { /* ignore */ }
    res.json({ success: true, data: { roundId: rId, roundIndex: rIdx, totalCards: total, perPersonDrawCount: per } })
  } catch (e) {
    console.error('Pool setup error:', e)
    res.status(500).json({ success: false, error: '生成卡池失败', code: 'SERVER_ERROR' })
  }
})

// 获取卡池（选手端：自己的展示详情，别人的只显示已抽走）
router.get('/pool', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const pageSize = parseInt(req.query.pageSize) || 0
    const filter = req.query.filter === 'unopened' ? 'unopened' : 'all'
    let rId = roundId
    const round = await getRound(roundId)
    if (round) rId = round.id
    const scope = [rId, roundId].filter(Boolean)
    const cards = await TrainingCardPool.find({ roundId: { $in: scope } })
    cards.sort((a, b) => (a.index || 0) - (b.index || 0))
    const isAdmin = req.user?.role === 'admin'
    const myId = req.user?.userId
    const recByIndex = {}
    if (myId) {
      const myRecords = await TrainingRecord.find({ playerId: myId, roundId: { $in: scope } })
      for (const r of myRecords) {
        if (r.cardIndex !== undefined && r.cardIndex !== null) recByIndex[r.cardIndex] = r
      }
    }
    const myDrawnCount = cards.filter(c => c.drawnBy && c.drawnBy === myId).length
    const filtered = filter === 'unopened' ? cards.filter(c => !c.drawnBy) : cards
    const totalFiltered = filtered.length
    const slice = pageSize > 0 ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered
    const list = slice.map(c => {
      const mine = !!(c.drawnBy && c.drawnBy === myId)
      const rec = mine ? recByIndex[c.index] : null
      return {
        index: c.index,
        drawn: !!c.drawnBy,
        mine,
        drawnByName: c.drawnBy ? c.drawnByName : '',
        delta: rec ? (rec.attrDelta || null) : null,
        card: (mine || isAdmin) ? { id: c.cardId, name: c.cardName, type: c.cardType, effect: c.effect } : null
      }
    })
    res.json({
      success: true,
      data: {
        roundId: rId,
        totalCards: cards.length,
        perPersonDrawCount: cards[0]?.perPersonDrawCount || 0,
        myDrawnCount,
        totalFiltered,
        page,
        pageSize,
        cards: list
      }
    })
  } catch (e) {
    console.error('Pool get error:', e)
    res.status(500).json({ success: false, error: '获取卡池失败', code: 'SERVER_ERROR' })
  }
})

// 从卡池抽取一张（按序号）
router.post('/pool/draw', auth, async (req, res) => {
  try {
    const { roundId, slotIndex, playerId, userId } = req.body || {}
    const pid = playerId || userId || req.user.userId
    const actor = await User.findOne({ id: pid })
    if (!actor || actor.status === 'eliminated') {
      return res.status(403).json({ success: false, error: '该选手已被淘汰，无法参与排练抽卡', code: 'ELIMINATED' })
    }
    const idx = parseInt(slotIndex)
    if (!(idx >= 1)) return res.status(400).json({ success: false, error: '缺少卡牌序号', code: 'INVALID_SLOT' })

    let rId = roundId
    const round = await getRound(roundId)
    if (round) rId = round.id
    const scope = [rId, roundId].filter(Boolean)

    const season = await getCurrentSeason()
    const collection = getCollection('TrainingCardPool')
    const now = new Date().toISOString()

    // 原子占用卡牌：仅当 drawnBy 为空时才能占用，杜绝并发/连点重复抽同一张
    const claimRaw = await collection.findOneAndUpdate(
      { roundId: { $in: scope }, index: idx, drawnBy: null },
      { $set: { drawnBy: pid, drawnByName: actor.name, drawnAt: now } },
      { returnDocument: 'after' }
    )
    const claimed = claimRaw && claimRaw.value !== undefined ? claimRaw.value : claimRaw
    if (!claimed) {
      const existing = await TrainingCardPool.findOne({ roundId: { $in: scope }, index: idx })
      if (!existing) return res.status(404).json({ success: false, error: '卡牌不存在', code: 'CARD_NOT_FOUND' })
      return res.status(409).json({ success: false, error: `该卡牌已被 ${existing.drawnByName || '其他选手'} 抽走`, code: 'CARD_TAKEN' })
    }
    const card = claimed

    const per = card.perPersonDrawCount || (season && season.trainingDrawsPerPlayer) || 3
    // 占用后统计（已含本次），超过上限则回滚占用
    const myDrawn = await TrainingCardPool.countDocuments({ roundId: { $in: scope }, drawnBy: pid })
    if (myDrawn > per) {
      await collection.updateOne({ _id: card._id }, { $set: { drawnBy: null, drawnByName: null, drawnAt: null } })
      return res.status(409).json({ success: false, error: `已达本轮抽取上限（${per} 张）`, code: 'DRAW_LIMIT_REACHED' })
    }

    const effect = card.effect || {}
    const isSelfSelect = !!(effect.selfSelect)
    let attrDelta = { vocal: 0, dance: 0, charm: 0 }
    if (!isSelfSelect) {
      attrDelta = computeAttrDelta({ effect }, actor)
      actor.attributes = actor.attributes || { vocal: 30, dance: 30, charm: 30 }
      for (const k of Object.keys(attrDelta)) actor.attributes[k] = (actor.attributes[k] || 0) + attrDelta[k]
      await actor.save()
    }

    const rec = new TrainingRecord({
      id: generateId(), roundId: rId, roundIndex: card.roundIndex,
      userId: pid, userName: actor.name, playerId: pid,
      cardId: card.cardId, cardName: card.cardName, cardType: card.cardType,
      effect, attrDelta, attributesAfter: { ...(actor.attributes || {}) },
      cardIndex: card.index, createdAt: new Date().toISOString()
    })
    await rec.save()

    res.json({
      success: true,
      data: {
        recordId: rec.id,
        cardIndex: card.index,
        card: { id: card.cardId, name: card.cardName, type: card.cardType, effect },
        isSelfSelect,
        attrDelta,
        attributesAfter: actor.attributes,
        remainingDraws: Math.max(0, per - myDrawn - 1),
        drawsTotal: per
      }
    })
  } catch (e) {
    console.error('Pool draw error:', e)
    res.status(500).json({ success: false, error: '抽卡失败', code: 'SERVER_ERROR' })
  }
})

router.post('/draw', auth, async (req, res) => {
  try {
    // 确保自主特训卡存在
    await ensureSelfSelectCard()

    const { roundId, roundIndex, round: roundQuery, playerId, userId } = req.body
    const pid = playerId || userId || req.user.userId
    // 已淘汰选手不得参与排练抽卡
    const actor = await User.findOne({ id: pid })
    if (!actor || actor.status === 'eliminated') {
      return res.status(403).json({ success: false, error: '该选手已被淘汰，无法参与排练抽卡', code: 'ELIMINATED' })
    }
    const rIdxInput = roundIndex !== undefined ? parseInt(roundIndex) : (roundQuery !== undefined ? parseInt(roundQuery) : null)
    let round = await getRound(roundId)
    if (!round && rIdxInput !== null) {
      const season = await getCurrentSeason()
      if (season) round = await Round.findOne({ seasonId: season.id, index: rIdxInput })
    }
    if (round && !round.trainingReleased) {
      return res.status(403).json({ success: false, error: '训练尚未开放', code: 'TRAINING_NOT_RELEASED' })
    }
    const rId = round ? round.id : (roundId || 'default-round')
    const rIdx = round ? round.index : rIdxInput

    const season = await getCurrentSeason()
    let drawsPerPlayer = (season && season.trainingDrawsPerPlayer) || 3
    // 若本轮已配置卡池，以卡池的每人抽取数量为准
    const poolMeta = await TrainingCardPool.findOne({ roundId: { $in: [rId, roundId].filter(Boolean) } })
    if (poolMeta && poolMeta.perPersonDrawCount) drawsPerPlayer = poolMeta.perPersonDrawCount

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

    // 优先从卡池最后一张开始消耗（未被抽走的），无卡池时才按权重随机
    const poolScope = [rId, roundId, round ? `round-${round.index}` : null].filter(Boolean)
    const poolCards = await TrainingCardPool.find({ roundId: { $in: poolScope } })
    const poolPick = poolCards.filter(c => !c.drawnBy).sort((a, b) => (b.index || 0) - (a.index || 0))[0] || null
    if (poolPick) {
      poolPick.drawnBy = pid
      poolPick.drawnByName = actor.name
      poolPick.drawnAt = new Date().toISOString()
      await poolPick.save()
    }

    // 按权重抽卡（无卡池时）
    const cards = (await TrainingCard.find({})).filter(c => c.enabled !== false)
    if (!poolPick && cards.length === 0) return res.status(400).json({ success: false, error: '没有可用训练卡', code: 'NO_CARDS' })

    const drawn = poolPick
      ? { id: poolPick.cardId, name: poolPick.cardName, type: poolPick.cardType, effect: poolPick.effect || {} }
      : weightedRandomCard(cards)

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
      cardIndex: poolPick ? poolPick.index : null,
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
      cardIndex: record.cardIndex ?? null,
      effect: record.cardType === 'self_select' ? normalizeEffect(record.effect) : normalizeEffect(record.attrDelta),
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

// ===== POST /api/training/apply-self-select - 自主特训卡选择属性 =====
router.post('/apply-self-select', auth, async (req, res) => {
  try {
    const { recordId, selectedAttr } = req.body
    if (!recordId || !selectedAttr) {
      return res.status(400).json({ success: false, error: 'recordId 和 selectedAttr 必填', code: 'MISSING_PARAM' })
    }
    if (!['vocal', 'dance', 'charm'].includes(selectedAttr)) {
      return res.status(400).json({ success: false, error: 'selectedAttr 必须是 vocal/dance/charm', code: 'INVALID_PARAM' })
    }

    const actor = await User.findOne({ id: req.user.userId })
    if (actor && actor.status === 'eliminated') {
      return res.status(403).json({ success: false, error: '你已被淘汰，无法进行该操作', code: 'ELIMINATED' })
    }

    const record = await TrainingRecord.findOne({ id: recordId })
    if (!record) {
      return res.status(404).json({ success: false, error: '训练记录不存在', code: 'RECORD_NOT_FOUND' })
    }

    const eff = record.effect || {}
    const selfSelectVal = eff.selfSelect
    if (typeof selfSelectVal !== 'number') {
      return res.status(400).json({ success: false, error: '该记录不是自主特训卡', code: 'NOT_SELF_SELECT' })
    }

    // 更新记录中的 attrDelta
    record.attrDelta = { vocal: 0, dance: 0, charm: 0, [selectedAttr]: selfSelectVal }
    await record.save()

    // 更新用户属性
    const user = await User.findOne({ id: record.playerId })
    if (user) {
      user.attributes = user.attributes || { vocal: 30, dance: 30, charm: 30 }
      user.attributes[selectedAttr] = (user.attributes[selectedAttr] || 0) + selfSelectVal
      await user.save()

      return res.json({
        success: true,
        data: {
          selectedAttr,
          delta: selfSelectVal,
          attrDelta: record.attrDelta,
          attributes: user.attributes
        }
      })
    }

    res.json({ success: true, data: { selectedAttr, delta: selfSelectVal, attrDelta: record.attrDelta } })
  } catch (e) {
    console.error('Apply self select error:', e)
    res.status(500).json({ success: false, error: '应用自主特训失败', code: 'SERVER_ERROR' })
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

    // 解析真实 Round 拿 DB UUID，用于兼容选手端抽卡创建的记录（其 roundId 是 UUID）
    let roundDb = null
    if (rIdx !== null) {
      const season = await getCurrentSeason()
      if (season) roundDb = await Round.findOne({ seasonId: season.id, index: rIdx })
    }
    if (!roundDb && rId) roundDb = await Round.findOne({ id: rId })

    const season = await getCurrentSeason()
    const drawsPerPlayer = (season && season.trainingDrawsPerPlayer) || 3

    const cards = (await TrainingCard.find({})).filter(c => c.enabled !== false)
    if (cards.length === 0) return res.status(400).json({ success: false, message: '没有可用训练卡' })

    const players = await User.find({ role: { $ne: 'admin' }, status: 'active' })

    // 若已配置卡池：从卡池【最后一张】开始消耗（未抽走的），并采用卡池设定的人数上限
    const poolScope = [rId, `round-${rIdx}`, roundDb ? roundDb.id : null].filter(Boolean)
    const poolAll = await TrainingCardPool.find({ roundId: { $in: poolScope } })
    const poolQueue = poolAll.filter(c => !c.drawnBy).sort((a, b) => (b.index || 0) - (a.index || 0))
    let poolPtr = 0
    const effectiveDraws = poolQueue.length > 0 ? (poolQueue[0].perPersonDrawCount || drawsPerPlayer) : drawsPerPlayer

    const results = []
    let totalDraws = 0
    let processedCount = 0
    let skippedCount = 0

    for (const user of players) {
      // 兼容三种 roundId 格式：UUID、round-1、roundIndex
      // 只要本轮已有任何训练记录（选手端自行抽卡或管理员代理排练都计数），即跳过
      const roundConds = [{ roundId: rId }]
      if (rIdx !== null) roundConds.push({ roundId: `round-${rIdx}` }, { roundIndex: rIdx })
      if (roundDb && roundDb.id !== rId) roundConds.push({ roundId: roundDb.id })
      const existingRecords = await TrainingRecord.find({
        playerId: user.id,
        $or: roundConds
      })

      // 只处理本轮训练次数为 0 的选手
      if (existingRecords.length > 0) {
        skippedCount++
        continue
      }

      // 随机生成 1~N 次排练
      const drawTimes = Math.floor(Math.random() * effectiveDraws) + 1

      const drawsForPlayer = []
      for (let i = 0; i < drawTimes; i++) {
        // 优先从卡池取（从最后一张开始），否则退回按权重随机
        let effectObj, cardMeta
        const poolCard = poolPtr < poolQueue.length ? poolQueue[poolPtr++] : null
        if (poolCard) {
          effectObj = poolCard.effect || {}
          cardMeta = { id: poolCard.cardId, name: poolCard.cardName, type: poolCard.cardType }
          poolCard.drawnBy = user.id
          poolCard.drawnByName = user.name
          poolCard.drawnAt = new Date().toISOString()
          await poolCard.save()
        } else {
          const drawn = weightedRandomCard(cards)
          effectObj = drawn.effect || {}
          cardMeta = { id: drawn.id, name: drawn.name, type: drawn.type }
        }
        const attrDelta = computeAttrDelta({ effect: effectObj }, user)

        user.attributes = user.attributes || { vocal: 30, dance: 30, charm: 30 }
        user.attributes.vocal = (user.attributes.vocal || 0) + attrDelta.vocal
        user.attributes.dance = (user.attributes.dance || 0) + attrDelta.dance
        user.attributes.charm = (user.attributes.charm || 0) + attrDelta.charm

        const attributesAfter = { ...user.attributes }
        const record = new TrainingRecord({
          id: generateId(), roundId: rId, roundIndex: rIdx,
          userId: user.id, userName: user.name, playerId: user.id,
          cardId: cardMeta.id, cardName: cardMeta.name, cardType: cardMeta.type,
          effect: effectObj, attrDelta, attributesAfter,
          createdAt: new Date().toISOString()
        })
        await record.save()

        totalDraws++
        drawsForPlayer.push({
          cardName: cardMeta.name,
          effect: normalizeEffect(effectObj)
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

// 撤销训练记录时，释放在卡池中占用的卡牌（返还已用抽取次数）
async function releasePoolCardsForRecords(records) {
  if (!records || records.length === 0) return 0
  const collection = getCollection('TrainingCardPool')
  let released = 0
  for (const r of records) {
    const pid = r.playerId || r.userId
    if (!pid) continue
    const roundIds = [r.roundId, r.roundIndex != null ? `round-${r.roundIndex}` : null].filter(Boolean)
    const q = { roundId: { $in: roundIds }, drawnBy: pid }
    if (r.cardIndex != null && Number.isFinite(Number(r.cardIndex))) q.index = Number(r.cardIndex)
    const result = await collection.updateMany(q, { $set: { drawnBy: null, drawnByName: '', drawnAt: null } })
    released += (result.modifiedCount || 0)
  }
  return released
}

// ===== DELETE /api/training/clear-user-records - 取消某选手/本轮训练成果（回滚属性） =====
router.delete('/clear-user-records', auth, requireAdmin, async (req, res) => {
  try {
    // 兼容：支持 query（roundId/roundIndex/userId）与 body（userId/round）两种传参
    const { roundId, roundIndex, userId: qUserId } = req.query
    const body = req.body || {}
    const userId = qUserId || body.userId || null
    const roundParam = body.round ?? (roundId ? roundId : null)

    // 解析轮次：round 支持数字、round-1、round_1 或 roundId(UUID)
    let rId = null
    let roundIdx = null
    if (roundParam !== null && roundParam !== undefined && roundParam !== '') {
      const round = await getRound(String(roundParam))
      if (round) {
        rId = round.id
        roundIdx = round.index
      } else if (String(roundParam).match(/^round[_-](\d+)$/)) {
        roundIdx = parseInt(String(roundParam).match(/^round[_-](\d+)$/)[1])
      }
    } else if (roundIndex) {
      roundIdx = parseInt(roundIndex)
    }

    // 构造过滤条件
    const roundClause = rId
      ? { $or: [{ roundId: rId }, { roundId: `round-${roundIdx || ''}` }] }
      : (roundIdx ? { roundId: `round-${roundIdx}` } : {})

    let filter = {}
    if (userId) {
      // 记录可能存 playerId 或 userId，用 $or 匹配两者任一
      filter.$or = [
        { playerId: userId },
        { userId: userId }
      ]
      if (roundClause.$or || roundClause.roundId) {
        filter.$and = [roundClause]
      }
    } else {
      filter = roundClause
    }
    const recordsToDelete = await TrainingRecord.find(filter)

    // 累加每位选手的属性增量（回滚用）
    const rollbackMap = {}
    for (const r of recordsToDelete) {
      const delta = r.attrDelta || r.effect || {}
      const pid = r.userId || r.playerId
      if (!pid) continue
      if (!rollbackMap[pid]) rollbackMap[pid] = { vocal: 0, dance: 0, charm: 0, count: 0 }
      rollbackMap[pid].vocal += delta.vocal || 0
      rollbackMap[pid].dance += delta.dance || 0
      rollbackMap[pid].charm += delta.charm || 0
      rollbackMap[pid].count += 1
    }

    // 回滚用户属性
    for (const [pid, delta] of Object.entries(rollbackMap)) {
      const user = await User.findOne({ id: pid })
      if (user && user.attributes) {
        user.attributes.vocal = (user.attributes.vocal || 0) - delta.vocal
        user.attributes.dance = (user.attributes.dance || 0) - delta.dance
        user.attributes.charm = (user.attributes.charm || 0) - delta.charm
        user.trainingCount = Math.max(0, (user.trainingCount || 0) - delta.count)
        await user.save()
      }
    }

    await TrainingRecord.deleteMany(filter)

    // 释放在卡池中占用的卡牌，返还抽取次数
    const releasedCards = await releasePoolCardsForRecords(recordsToDelete)

    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'training', rId || roundIdx || '',
      `取消训练成果：删除 ${recordsToDelete.length} 条记录，回滚 ${Object.keys(rollbackMap).length} 位选手属性`)

    res.json({ success: true, data: { deletedCount: recordsToDelete.length, affectedUsers: Object.keys(rollbackMap).length, releasedCards } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '取消训练成果失败: ' + (e.message || ''), code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/training/records - 训练记录列表（分页，支持时间筛选） =====
router.get('/records', auth, async (req, res) => {
  try {
    const { roundId, playerId, userId, cardId, cardType, page = 1, pageSize = 10, startTime, endTime } = req.query
    const pid = playerId || userId

    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })
    const round = await getRound(roundId)
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })
    const rId = round.id

    // 兼容 roundId 查询：使用 DB UUID 和前端 roundId 两种格式
    const orConditions = [{ roundId: rId }]
    if (rId !== roundId) {
      orConditions.push({ roundId: roundId })
    }
    const roundFilter = orConditions.length > 1 ? { $or: orConditions } : { roundId: rId }
    const filter = { $and: [roundFilter] }
    if (pid) filter.$and.push({ playerId: pid })
    if (cardId) filter.$and.push({ cardId })
    if (cardType) filter.$and.push({ cardType })
    if (startTime || endTime) {
      const timeFilter = {}
      if (startTime) timeFilter.$gte = startTime
      if (endTime) timeFilter.$lte = endTime
      filter.$and.push({ createdAt: timeFilter })
    }

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

    const records = await TrainingRecord.find(filter)
    if (records.length === 0) {
      return res.json({ success: true, data: { deletedCount: 0 } })
    }

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
    const releasedCards = await releasePoolCardsForRecords(records)
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'trainingRecord', userId, `清空用户训练记录 ${records.length} 条`)
    res.json({ success: true, data: { deletedCount: records.length, releasedCards } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '清空训练记录失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/training/records/batch - 批量撤销训练记录（注意：必须定义在 /records/:id 之前，避免被 :id 捕获） =====
router.delete('/records/batch', auth, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: '请提供要撤销的记录 ID 列表', code: 'INVALID_PARAMS' })
    }

    const records = await TrainingRecord.find({ id: { $in: ids } })
    if (records.length === 0) {
      return res.json({ success: true, data: { deletedCount: 0 } })
    }

    // 按用户分组计算总属性变化
    const userDeltas = {}
    for (const r of records) {
      const pid = r.playerId
      if (!userDeltas[pid]) userDeltas[pid] = { vocal: 0, dance: 0, charm: 0 }
      const delta = r.attrDelta || r.effect || {}
      userDeltas[pid].vocal += delta.vocal || 0
      userDeltas[pid].dance += delta.dance || 0
      userDeltas[pid].charm += delta.charm || 0
    }

    // 回滚用户属性
    for (const [userId, delta] of Object.entries(userDeltas)) {
      const user = await User.findOne({ id: userId })
      if (user && user.attributes) {
        user.attributes.vocal = (user.attributes.vocal || 0) - delta.vocal
        user.attributes.dance = (user.attributes.dance || 0) - delta.dance
        user.attributes.charm = (user.attributes.charm || 0) - delta.charm
        await user.save()
      }
    }

    const result = await TrainingRecord.deleteMany({ id: { $in: ids } })
    const releasedCards = await releasePoolCardsForRecords(records)
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'trainingRecord', 'batch', `批量撤销训练记录 ${records.length} 条`)
    res.json({ success: true, data: { deletedCount: result.deletedCount || records.length, releasedCards } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '批量撤销失败', code: 'SERVER_ERROR' })
  }
})

// ===== DELETE /api/training/records/:id - 单条记录撤销（回滚属性） =====
router.delete('/records/:id', auth, requireAdmin, async (req, res) => {
  try {
    const record = await TrainingRecord.findOne({ id: req.params.id })
    if (!record) {
      return res.status(404).json({ success: false, error: '记录不存在', code: 'NOT_FOUND' })
    }

    const user = await User.findOne({ id: record.playerId })
    if (user && user.attributes) {
      const delta = record.attrDelta || record.effect || {}
      user.attributes.vocal = (user.attributes.vocal || 0) - (delta.vocal || 0)
      user.attributes.dance = (user.attributes.dance || 0) - (delta.dance || 0)
      user.attributes.charm = (user.attributes.charm || 0) - (delta.charm || 0)
      await user.save()
    }

    await TrainingRecord.deleteOne({ id: req.params.id })
    const releasedCards = await releasePoolCardsForRecords([record])
    logAction(req.user.userId, req.user.name || 'admin', 'admin', ACTION_TYPES.TRAINING_CONFIG, 'trainingRecord', record.playerId, `撤销训练记录 ${record.cardName}`)
    res.json({ success: true, data: { releasedCards } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '撤销失败', code: 'SERVER_ERROR' })
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
