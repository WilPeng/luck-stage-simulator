const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../../../middleware/auth')
const BBSeason = require('../models/BBSeason')
const BBRound = require('../models/BBRound')
const BBHohRecord = require('../models/BBHohRecord')
const BBNomination = require('../models/BBNomination')
const BBVetoRecord = require('../models/BBVetoRecord')
const BBEvictionVote = require('../models/BBEvictionVote')
const BBEviction = require('../models/BBEviction')
const BBHouseguest = require('../models/BBHouseguest')
const BBChatMessage = require('../models/BBChatMessage')
const BBOperationLog = require('../models/BBOperationLog')
const {
  generateId, logAction, getCurrentSeason,
  BB_STAGE_ORDER, BB_STAGE_NAME, getStageStatus, getStageName, getStageIndex, getNextStage,
  BB_ACTION_TYPES, randomInt
} = require('../helpers')

async function ensureSeason() {
  let season = await getCurrentSeason()
  if (!season) {
    season = new BBSeason({
      id: generateId(),
      name: 'Big Brother',
      currentRound: 1,
      currentStage: 'hoh_competition',
      totalRounds: 10,
      status: 'running',
      gameId: 'bigbrother'
    })
    await season.save()
  }
  return season
}

async function clearRoundData(roundIndex) {
  const roundDetail = await BBRound.findOne({ gameId: 'bigbrother', index: roundIndex })
  if (!roundDetail) return
  const dbRoundId = roundDetail.id
  const filter = { roundId: { $in: [dbRoundId, `round-${roundIndex}`] } }
  await Promise.all([
    BBHohRecord.deleteMany(filter),
    BBNomination.deleteMany(filter),
    BBVetoRecord.deleteMany(filter),
    BBEvictionVote.deleteMany(filter),
    BBEviction.deleteMany(filter)
  ])
}

// GET / - 获取赛季信息
router.get('/', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取赛季信息失败', code: 'SERVER_ERROR' })
  }
})

// GET /progress - 赛程进度/矩阵
router.get('/progress', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    const stageNameMap = {}
    for (const s of BB_STAGE_ORDER) stageNameMap[s] = BB_STAGE_NAME[s]
    const matrix = []
    for (let r = 1; r <= season.totalRounds; r++) {
      for (const st of BB_STAGE_ORDER) {
        matrix.push({
          round: r,
          stage: st,
          stageName: BB_STAGE_NAME[st],
          status: getStageStatus(r, st, season.currentRound, season.currentStage)
        })
      }
    }
    res.json({
      success: true,
      data: {
        currentRound: season.currentRound,
        currentStage: season.currentStage,
        currentStageName: getStageName(season.currentStage),
        totalRounds: season.totalRounds,
        stageOrder: BB_STAGE_ORDER,
        stageNameMap,
        matrix
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取赛程进度失败', code: 'SERVER_ERROR' })
  }
})

// GET /menu - 菜单权限
router.get('/menu', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    const menu = []
    for (let r = 1; r <= season.totalRounds; r++) {
      for (const st of BB_STAGE_ORDER) {
        const status = getStageStatus(r, st, season.currentRound, season.currentStage)
        menu.push({
          round: r,
          stage: st,
          stageName: BB_STAGE_NAME[st],
          status,
          clickable: status !== 'future',
          editable: status === 'current'
        })
      }
    }
    const currentStageIdx = BB_STAGE_ORDER.indexOf(season.currentStage)
    res.json({
      success: true,
      data: {
        currentRound: season.currentRound,
        currentStage: season.currentStage,
        currentStageName: getStageName(season.currentStage),
        currentStageIndex: currentStageIdx,
        totalRounds: season.totalRounds,
        isAdmin: req.user.role === 'admin',
        menu
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取菜单失败', code: 'SERVER_ERROR' })
  }
})

// POST /set - 设置进度
router.post('/set', auth, requireAdmin, async (req, res) => {
  try {
    const { round, stage } = req.body
    if (typeof round !== 'number' || round < 1) {
      return res.status(400).json({ success: false, error: 'round 必须为 >= 1 的整数', code: 'INVALID_ROUND' })
    }
    if (!BB_STAGE_ORDER.includes(stage)) {
      return res.status(400).json({ success: false, error: `无效的 stage`, code: 'INVALID_STAGE' })
    }
    const season = await ensureSeason()
    const prevRound = season.currentRound
    const prevStage = season.currentStage
    if (round !== prevRound) await clearRoundData(prevRound)
    season.currentRound = round
    season.currentStage = stage
    season.updatedAt = new Date().toISOString()
    await season.save()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.PROGRESS_SET, 'season', season.id,
      `进度设置: 第${prevRound}周 ${getStageName(prevStage)} → 第${round}周 ${getStageName(stage)}`)
    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置进度失败', code: 'SERVER_ERROR' })
  }
})

// POST /next - 推进到下一阶段
router.post('/next', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { getCollection } = require('../../../config/db')
    let targetStage = getNextStage(season.currentStage)

    // 从否决权会议推进时，检查否决权是否被使用
    if (season.currentStage === 'veto_ceremony') {
      const vetoCol = getCollection('BBVetoRecord')
      const vetoRecord = await vetoCol.findOne({ gameId: 'bigbrother', roundId: `round-${season.currentRound}` })
      const vetoUsed = vetoRecord?.used === true
      if (!vetoUsed) {
        // 否决权未被使用 → 跳过替换提名，直接进入淘汰投票
        targetStage = 'eviction_vote'
      }
    }

    const prevRound = season.currentRound
    const prevStage = season.currentStage
    if (targetStage === null) {
      const newRound = season.currentRound + 1
      if (newRound > season.totalRounds) {
        return res.status(400).json({ success: false, error: '已经是最后一轮', code: 'NO_MORE_ROUNDS' })
      }
      await clearRoundData(prevRound)
      season.currentRound = newRound
      season.currentStage = 'hoh_competition'
    } else {
      season.currentStage = targetStage
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.PROGRESS_NEXT, 'season', season.id,
      `自动推进: 第${prevRound}周 ${getStageName(prevStage)} → 第${season.currentRound}周 ${getStageName(season.currentStage)}`)
    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '推进失败', code: 'SERVER_ERROR' })
  }
})

// POST /reset - 完全重置
router.post('/reset', auth, requireAdmin, async (req, res) => {
  try {
    const modelsToClear = [
      BBHohRecord, BBNomination, BBVetoRecord, BBEvictionVote, BBEviction,
      BBChatMessage, BBRound, BBOperationLog
    ]
    for (const model of modelsToClear) {
      if (model.deleteMany) await model.deleteMany({ gameId: 'bigbrother' })
    }
    const houseguests = await BBHouseguest.find({ gameId: 'bigbrother' })
    for (const h of houseguests) {
      if (h.role !== 'admin') {
        h.status = 'active'
        h.hasLogin = false
        await h.save()
      }
    }
    const season = await ensureSeason()
    season.currentRound = 1
    season.currentStage = 'hoh_competition'
    season.updatedAt = new Date().toISOString()
    await season.save()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.SEASON_RESET, 'season', season.id, '完全重置')
    res.json({ success: true, data: { currentRound: 1, currentStage: 'hoh_competition' } })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '重置失败', code: 'SERVER_ERROR' })
  }
})

// PUT /round - 设置总轮次
router.put('/round', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { totalRounds } = req.body
    if (typeof totalRounds === 'number' && totalRounds >= 1) {
      season.totalRounds = totalRounds
      if (season.currentRound > totalRounds) season.currentRound = totalRounds
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新轮次配置失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
