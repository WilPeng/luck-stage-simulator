const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../../../middleware/auth')
const LVSeason = require('../models/LVSeason')
const LVPlayer = require('../models/LVPlayer')
const LVLoveVote = require('../models/LVLoveVote')
const LVPairingResult = require('../models/LVPairingResult')
const LVElimination = require('../models/LVElimination')
const LVOperationLog = require('../models/LVOperationLog')
const {
  generateId, logAction, getCurrentSeason,
  LV_STAGE_ORDER, LV_STAGE_NAME, getStageStatus, getStageName, getStageIndex, getNextStage,
  LV_ACTION_TYPES, randomVoteBudget
} = require('../helpers')

async function ensureSeason() {
  let season = await getCurrentSeason()
  if (!season) {
    season = new LVSeason({
      id: generateId(),
      name: '恋综',
      currentRound: 1,
      currentStage: 'love_vote',
      totalRounds: 10,
      status: 'running',
      gameId: 'lovevariety'
    })
    await season.save()
  }
  return season
}

async function clearRoundData(roundIndex) {
  const filter = { roundId: `round-${roundIndex}` }
  await LVLoveVote.deleteMany(filter)
}

// 为所有活跃选手生成本轮喜爱值预算
async function generateVoteBudgets() {
  const players = await LVPlayer.find({ gameId: 'lovevariety', status: 'active', role: 'player' })
  for (const p of players) {
    p.voteBudget = randomVoteBudget()
    await p.save()
  }
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
    for (const s of LV_STAGE_ORDER) stageNameMap[s] = LV_STAGE_NAME[s]
    const matrix = []
    for (let r = 1; r <= season.totalRounds; r++) {
      for (const st of LV_STAGE_ORDER) {
        matrix.push({
          round: r,
          stage: st,
          stageName: LV_STAGE_NAME[st],
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
        stageOrder: LV_STAGE_ORDER,
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
      for (const st of LV_STAGE_ORDER) {
        const status = getStageStatus(r, st, season.currentRound, season.currentStage)
        menu.push({
          round: r,
          stage: st,
          stageName: LV_STAGE_NAME[st],
          status,
          clickable: status !== 'future',
          editable: status === 'current'
        })
      }
    }
    const currentStageIdx = LV_STAGE_ORDER.indexOf(season.currentStage)
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
    if (!LV_STAGE_ORDER.includes(stage)) {
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
    // 进入 love_vote 阶段时生成预算
    if (stage === 'love_vote') await generateVoteBudgets()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      LV_ACTION_TYPES.PROGRESS_SET, 'season', season.id,
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
    let targetStage = getNextStage(season.currentStage)
    const prevRound = season.currentRound
    const prevStage = season.currentStage
    let isNewVoteStage = false
    if (targetStage === null) {
      const newRound = season.currentRound + 1
      if (newRound > season.totalRounds) {
        return res.status(400).json({ success: false, error: '已经是最后一轮', code: 'NO_MORE_ROUNDS' })
      }
      await clearRoundData(prevRound)
      season.currentRound = newRound
      season.currentStage = 'love_vote'
      isNewVoteStage = true
    } else {
      season.currentStage = targetStage
      if (targetStage === 'love_vote') isNewVoteStage = true
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    if (isNewVoteStage) await generateVoteBudgets()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      LV_ACTION_TYPES.PROGRESS_NEXT, 'season', season.id,
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
      LVLoveVote, LVPairingResult, LVElimination, LVOperationLog
    ]
    for (const model of modelsToClear) {
      if (model.deleteMany) await model.deleteMany({ gameId: 'lovevariety' })
    }
    const players = await LVPlayer.find({ gameId: 'lovevariety' })
    for (const p of players) {
      if (p.role !== 'admin') {
        p.status = 'active'
        p.hasLogin = false
        await p.save()
      }
    }
    const season = await ensureSeason()
    season.currentRound = 1
    season.currentStage = 'waiting'
    season.updatedAt = new Date().toISOString()
    await season.save()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      LV_ACTION_TYPES.SEASON_RESET, 'season', season.id, '完全重置（等待开始）')
    res.json({ success: true, data: { currentRound: 1, currentStage: 'waiting' } })
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
