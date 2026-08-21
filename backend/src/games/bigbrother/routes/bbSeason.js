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
  BB_ACTION_TYPES, randomInt,
  getTwistsForRound, hasTwist, getAllTwistDefs, TWIST_DEFINITIONS,
  getEvictCountForRound
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

// POST /next - 推进到下一阶段（含 twist 跳过逻辑）
router.post('/next', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { getCollection } = require('../../../config/db')
    const twistConfigs = season.twistConfigs || []
    const roundConfigs = season.roundConfigs || []
    const curRound = season.currentRound
    let targetStage = getNextStage(season.currentStage)

    // Twist #22 无护符挑战：跳过 veto_competition
    if (season.currentStage === 'hoh_competition' && hasTwist(curRound, 'no_pendant_challenge', twistConfigs, roundConfigs)) {
      // 跳过 veto_competition → 直接进入 nomination
      // 但也可能跳过更多：直接跳过否决权竞争、否决权会议、替换提名三个阶段
      targetStage = 'nomination'
    }

    // Twist #22 无护符挑战：从提名推进时跳过否决权相关阶段
    if (season.currentStage === 'nomination' && hasTwist(curRound, 'no_pendant_challenge', twistConfigs, roundConfigs)) {
      targetStage = 'eviction_vote'
    }

    // 从否决权会议推进时，检查否决权是否被使用
    if (season.currentStage === 'veto_ceremony') {
      const vetoCol = getCollection('BBVetoRecord')
      const vetoRecord = await vetoCol.findOne({ gameId: 'bigbrother', roundId: `round-${curRound}` })
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

      // 进入新轮次时，检查因果报应(#18)：是否有上轮幸存者自动成为 HOH
      if (season.nextHohPlayerId) {
        await logAction(req.user.userId, req.user.name || 'admin', 'admin',
          BB_ACTION_TYPES.TWIST_APPLIED, 'season', season.id,
          `因果报应生效: ${season.nextHohPlayerName} 自动成为第${newRound}周 HOH`)
      }
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
    // 清除毒蛇标记集合
    const { getCollection } = require('../../../config/db')
    const serpentCol = getCollection('BBSerpentMark')
    await serpentCol.deleteMany({ gameId: 'bigbrother' })

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
    season.nextHohPlayerId = null
    season.nextHohPlayerName = ''
    season.roundConfigs = []
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

// PUT /round - 设置总轮次 / 插入轮次 / 删除轮次
router.put('/round', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { totalRounds, insertAfter, deleteRound } = req.body

    // 删除轮次操作
    if (typeof deleteRound === 'number' && deleteRound >= 1 && deleteRound <= season.totalRounds) {
      // 重新编号：删除目标轮次后，所有大于该轮次的编号 -1
      if (Array.isArray(season.roundConfigs)) {
        season.roundConfigs = season.roundConfigs
          .filter(rc => rc.round !== deleteRound)
          .map(rc => ({ ...rc, round: rc.round > deleteRound ? rc.round - 1 : rc.round }))
      }
      if (Array.isArray(season.twistConfigs)) {
        season.twistConfigs = season.twistConfigs
          .filter(tc => tc.round !== deleteRound)
          .map(tc => ({ ...tc, round: tc.round > deleteRound ? tc.round - 1 : tc.round }))
      }
      season.totalRounds = Math.max(1, season.totalRounds - 1)
      if (season.currentRound > season.totalRounds) season.currentRound = season.totalRounds
      season.updatedAt = new Date().toISOString()
      await season.save()
      await logAction(req.user.userId, req.user.name || 'admin', 'admin',
        BB_ACTION_TYPES.TWIST_CONFIG_SAVED, 'season', season.id,
        `删除第${deleteRound}轮，总轮次变为${season.totalRounds}`)
      return res.json({ success: true, data: season.toObject() })
    }

    // 插入轮次操作
    if (typeof insertAfter === 'number' && insertAfter >= 0 && insertAfter <= season.totalRounds) {
      // 重新编号：所有大于 insertAfter 的轮次编号 +1
      if (Array.isArray(season.roundConfigs)) {
        season.roundConfigs = season.roundConfigs
          .map(rc => ({ ...rc, round: rc.round > insertAfter ? rc.round + 1 : rc.round }))
        // 插入空配置
        season.roundConfigs.push({ round: insertAfter + 1, twists: [], eliminationRank: null, isJury: false })
      }
      if (Array.isArray(season.twistConfigs)) {
        season.twistConfigs = season.twistConfigs
          .map(tc => ({ ...tc, round: tc.round > insertAfter ? tc.round + 1 : tc.round }))
      }
      season.totalRounds = season.totalRounds + 1
      season.updatedAt = new Date().toISOString()
      await season.save()
      await logAction(req.user.userId, req.user.name || 'admin', 'admin',
        BB_ACTION_TYPES.TWIST_CONFIG_SAVED, 'season', season.id,
        `在第${insertAfter}轮后插入新轮次，总轮次变为${season.totalRounds}`)
      return res.json({ success: true, data: season.toObject() })
    }

    // 设置总轮次
    if (typeof totalRounds === 'number' && totalRounds >= 1) {
      season.totalRounds = totalRounds
      if (season.currentRound > totalRounds) season.currentRound = totalRounds
      // 清理超出总轮次的配置
      if (Array.isArray(season.twistConfigs)) {
        season.twistConfigs = season.twistConfigs.filter(tc => tc.round <= totalRounds)
      }
      if (Array.isArray(season.roundConfigs)) {
        season.roundConfigs = season.roundConfigs.filter(rc => rc.round <= totalRounds)
      }
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新轮次配置失败', code: 'SERVER_ERROR' })
  }
})

// GET /twists - 获取 twist 配置（从 roundConfigs 读取，回退到 twistConfigs）
router.get('/twists', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    res.json({
      success: true,
      data: {
        twistConfigs: season.roundConfigs?.length > 0
          ? season.roundConfigs.map(rc => ({ round: rc.round, twists: rc.twists || [] }))
          : (season.twistConfigs || []),
        allTwists: getAllTwistDefs()
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取 twist 配置失败', code: 'SERVER_ERROR' })
  }
})

// PUT /twists - 保存 twist 配置（赛季开始前设置，兼容旧接口）
router.put('/twists', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { twistConfigs } = req.body
    if (!Array.isArray(twistConfigs)) {
      return res.status(400).json({ success: false, error: 'twistConfigs 必须为数组', code: 'INVALID_TWIST_CONFIGS' })
    }
    for (const cfg of twistConfigs) {
      if (typeof cfg.round !== 'number' || cfg.round < 1) {
        return res.status(400).json({ success: false, error: `round 必须为 >= 1 的整数`, code: 'INVALID_ROUND' })
      }
      if (!Array.isArray(cfg.twists)) {
        return res.status(400).json({ success: false, error: `twists 必须为数组`, code: 'INVALID_TWISTS' })
      }
      for (const tid of cfg.twists) {
        if (!TWIST_DEFINITIONS[tid]) {
          return res.status(400).json({ success: false, error: `未知的 twist: ${tid}`, code: 'UNKNOWN_TWIST' })
        }
      }
    }
    // 同步到 roundConfigs
    if (Array.isArray(season.roundConfigs)) {
      for (const cfg of twistConfigs) {
        const existing = season.roundConfigs.find(rc => rc.round === cfg.round)
        if (existing) {
          existing.twists = cfg.twists
        } else {
          season.roundConfigs.push({ round: cfg.round, twists: cfg.twists, eliminationRank: null, isJury: false })
        }
      }
    }
    season.twistConfigs = twistConfigs
    season.updatedAt = new Date().toISOString()
    await season.save()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.TWIST_CONFIG_SAVED, 'season', season.id,
      `Twist 配置已更新: ${twistConfigs.filter(tc => tc.twists.length > 0).map(tc => `第${tc.round}轮[${tc.twists.join(',')}]`).join(', ') || '无'}`)
    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存 twist 配置失败', code: 'SERVER_ERROR' })
  }
})

// GET /config - 获取完整赛季配置（roundConfigs + twist 定义）
router.get('/config', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    const roundConfigs = season.roundConfigs || []
    // 确保 roundConfigs 包含所有轮次
    const fullConfigs = []
    for (let r = 1; r <= season.totalRounds; r++) {
      const existing = roundConfigs.find(rc => rc.round === r)
      const evictCount = getEvictCountForRound(r, season.twistConfigs || [], season.roundConfigs || [])
      if (existing) {
        fullConfigs.push({
          round: existing.round,
          twists: existing.twists || [],
          eliminationRank: existing.eliminationRank ?? null,
          isJury: existing.isJury ?? false,
          evictCount
        })
      } else {
        // 回退到 twistConfigs
        const tcfg = (season.twistConfigs || []).find(tc => tc.round === r)
        fullConfigs.push({
          round: r,
          twists: tcfg?.twists || [],
          eliminationRank: null,
          isJury: false,
          evictCount
        })
      }
    }
    // 判断赛季是否已开始
    const isSeasonStarted = season.currentRound > 1 || season.currentStage !== 'hoh_competition'
    res.json({
      success: true,
      data: {
        roundConfigs: fullConfigs,
        allTwists: getAllTwistDefs(),
        totalRounds: season.totalRounds,
        isSeasonStarted,
        currentRound: season.currentRound,
        jurySize: season.jurySize ?? 7,
        finalSize: season.finalSize ?? 2
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取赛季配置失败', code: 'SERVER_ERROR' })
  }
})

// PUT /config - 保存完整赛季配置
router.put('/config', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { roundConfigs, totalRounds, jurySize, finalSize } = req.body
    if (!Array.isArray(roundConfigs)) {
      return res.status(400).json({ success: false, error: 'roundConfigs 必须为数组', code: 'INVALID_CONFIG' })
    }
    // 验证
    for (const cfg of roundConfigs) {
      if (typeof cfg.round !== 'number' || cfg.round < 1) {
        return res.status(400).json({ success: false, error: `round 必须为 >= 1 的整数`, code: 'INVALID_ROUND' })
      }
      if (cfg.twists && Array.isArray(cfg.twists)) {
        for (const tid of cfg.twists) {
          if (!TWIST_DEFINITIONS[tid]) {
            return res.status(400).json({ success: false, error: `未知的 twist: ${tid}`, code: 'UNKNOWN_TWIST' })
          }
        }
      }
    }

    season.roundConfigs = roundConfigs.map(cfg => ({
      round: cfg.round,
      twists: cfg.twists || [],
      eliminationRank: cfg.eliminationRank ?? null,
      isJury: cfg.isJury ?? false
    }))
    // 同步到 twistConfigs（保持向后兼容）
    season.twistConfigs = roundConfigs.map(cfg => ({
      round: cfg.round,
      twists: cfg.twists || []
    }))

    if (typeof totalRounds === 'number' && totalRounds >= 1) {
      season.totalRounds = totalRounds
      if (season.currentRound > totalRounds) season.currentRound = totalRounds
    }
    if (typeof jurySize === 'number' && jurySize >= 0) {
      season.jurySize = jurySize
    }
    if (typeof finalSize === 'number' && finalSize >= 0) {
      season.finalSize = finalSize
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.TWIST_CONFIG_SAVED, 'season', season.id,
      `赛季配置已更新: ${season.totalRounds}轮, twist配置已保存`)
    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '保存赛季配置失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
