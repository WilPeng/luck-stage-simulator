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
const BBChampionVote = require('../models/BBChampionVote')
const BBHouseguest = require('../models/BBHouseguest')
const BBChatMessage = require('../models/BBChatMessage')
const BBOperationLog = require('../models/BBOperationLog')
const {
  generateId, logAction, getCurrentSeason,
  BB_STAGE_ORDER, BB_STAGE_NAME, getStageStatus, getEndgameStatus, getStageName, getStageIndex, getNextStage,
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
  // 结构自愈：若赛季尚无终局轮结构（旧库/旧配置），按当前房客数自动推算普通轮 + 终局两轮
  if (!season.final3Round && season.status !== 'finished') {
    try {
      const { getCollection } = require('../../../config/db')
      const hgTotal = await getCollection('BBHouseguest').countDocuments({ gameId: 'bigbrother', role: 'houseguest' })
      if (hgTotal > 3) {
        const normal = hgTotal - 3 // 每轮淘汰 1 人直至存活 3
        season.final3Round = normal + 1
        season.championRound = normal + 2
        season.totalRounds = normal + 2
        season.updatedAt = new Date().toISOString()
        await season.save()
      }
    } catch (e) {
      console.error('自动推算终局轮失败:', e)
    }
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
    const stageNameMapFull = { ...stageNameMap, final3: 'F3终局', champion_vote: '冠军投票' }
    const matrix = []
    // 普通轮列到最后一普通轮；终局两轮单独折叠列
    const lastNormalRound = season.final3Round ? (season.final3Round - 1) : season.totalRounds
    for (let r = 1; r <= lastNormalRound; r++) {
      for (const st of BB_STAGE_ORDER) {
        matrix.push({
          round: r,
          stage: st,
          stageName: BB_STAGE_NAME[st],
          status: getStageStatus(r, st, season.currentRound, season.currentStage)
        })
      }
    }
    // 终局两轮折叠（round = final3Round / championRound）
    const lastForMatrix = season.final3Round ? (season.final3Round + 1) : season.totalRounds
    for (let r = season.final3Round || 0; r <= lastForMatrix; r++) {
      const st = r === season.final3Round ? 'final3' : 'champion_vote'
      matrix.push({
        round: r,
        stage: st,
        stageName: BB_STAGE_NAME[st] || (st === 'final3' ? 'F3终局' : '冠军投票'),
        status: getEndgameStatus(r, st, season.currentRound, season.currentStage)
      })
    }
    res.json({
      success: true,
      data: {
        currentRound: season.currentRound,
        currentStage: season.currentStage,
        currentStageName: getStageName(season.currentStage),
        totalRounds: season.totalRounds,
        final3Round: season.final3Round || null,
        championRound: season.championRound || null,
        stageOrder: BB_STAGE_ORDER,
        stageNameMap: stageNameMapFull,
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
    const lastNormalRound = season.final3Round ? (season.final3Round - 1) : season.totalRounds
    for (let r = 1; r <= lastNormalRound; r++) {
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
    // 终局两轮
    const endgameRounds = season.final3Round
      ? [{ round: season.final3Round, stage: 'final3', label: 'F3终局' }, { round: season.championRound || (season.final3Round + 1), stage: 'champion_vote', label: '冠军投票' }]
      : []
    for (const eg of endgameRounds) {
      const status = getEndgameStatus(eg.round, eg.stage, season.currentRound, season.currentStage)
      menu.push({
        round: eg.round,
        stage: eg.stage,
        stageName: eg.label,
        status,
        clickable: status !== 'future',
        editable: status === 'current'
      })
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
        final3Round: season.final3Round || null,
        championRound: season.championRound || null,
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
    const isEndgameStage = stage === 'final3' || stage === 'champion_vote'
    if (!BB_STAGE_ORDER.includes(stage) && !isEndgameStage) {
      return res.status(400).json({ success: false, error: '无效的 stage', code: 'INVALID_STAGE' })
    }
    const season = await ensureSeason()
    // 终局阶段只能设置到对应终局轮
    if (isEndgameStage) {
      if (season.final3Round == null) {
        return res.status(400).json({ success: false, error: '尚未配置终局轮（请先在赛季设置保存配置）', code: 'NO_FINAL3_CONFIG' })
      }
      if (stage === 'final3' && round !== season.final3Round) {
        return res.status(400).json({ success: false, error: `final3 阶段只能设置在第 ${season.final3Round} 轮`, code: 'WRONG_ROUND' })
      }
      if (stage === 'champion_vote' && round !== (season.championRound || season.final3Round + 1)) {
        return res.status(400).json({ success: false, error: `champion_vote 阶段只能设置在第 ${season.championRound} 轮`, code: 'WRONG_ROUND' })
      }
    }
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

    // ===== 终局轮推进（F3 / 冠军投票） =====
    if (season.currentStage === 'final3') {
      // F3 尚未完成（未选出 FHOH 与 FTC 二人）
      if (!season.fhohId || season.finalTwo.length < 2) {
        return res.status(400).json({ success: false, error: '请先在 F3 终局完成三轮挑战并让 FHOH 选择 FTC 人选', code: 'FINAL3_INCOMPLETE' })
      }
      await clearRoundData(prevRound)
      season.currentRound = season.championRound || (season.currentRound + 1)
      season.currentStage = 'champion_vote'
      season.updatedAt = new Date().toISOString()
      await season.save()
      await logAction(req.user.userId, req.user.name || 'admin', 'admin',
        BB_ACTION_TYPES.PROGRESS_NEXT, 'season', season.id,
        `进入冠军投票周（第${season.currentRound}周）`)
      return res.json({ success: true, data: season.toObject() })
    }

    if (season.currentStage === 'champion_vote') {
      if (!season.championId) {
        return res.status(400).json({ success: false, error: '请先完成陪审团冠军投票，产生冠军', code: 'NO_CHAMPION' })
      }
      season.status = 'finished'
      season.updatedAt = new Date().toISOString()
      await season.save()
      await logAction(req.user.userId, req.user.name || 'admin', 'admin',
        BB_ACTION_TYPES.PROGRESS_NEXT, 'season', season.id,
        `赛季结束，冠军：${season.championName}`)
      return res.json({ success: true, data: season.toObject() })
    }

    if (targetStage === null) {
      // 结束当前普通轮
      const newRound = season.currentRound + 1
      if (newRound > season.totalRounds) {
        return res.status(400).json({ success: false, error: '已经是最后一轮', code: 'NO_MORE_ROUNDS' })
      }
      await clearRoundData(prevRound)
      season.currentRound = newRound
      // 若进入 F3 终局周（存活将至 3 后的特殊轮），当前阶段直接设为 final3
      if (season.final3Round && newRound === season.final3Round) {
        season.currentStage = 'final3'
      } else {
        season.currentStage = 'hoh_competition'
        // 进入新轮次时，检查因果报应(#18)：是否有上轮幸存者自动成为 HOH
        if (season.nextHohPlayerId) {
          await logAction(req.user.userId, req.user.name || 'admin', 'admin',
            BB_ACTION_TYPES.TWIST_APPLIED, 'season', season.id,
            `因果报应生效: ${season.nextHohPlayerName} 自动成为第${newRound}周 HOH`)
        }
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
      BBChatMessage, BBRound, BBOperationLog, BBChampionVote
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
    // 清除终局数据
    season.final3Round = null
    season.championRound = null
    season.totalRounds = 0
    season.status = 'running'
    season.final3Winners = {}
    season.fhohId = null
    season.fhohName = ''
    season.finalTwo = []
    season.lastJuryId = null
    season.lastJuryName = ''
    season.championId = null
    season.championName = ''
    season.runnerUpId = null
    season.runnerUpName = ''
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

// PUT /round - 设置总轮数 / 插入轮次 / 删除轮次
router.put('/round', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { totalRounds, insertAfter, deleteRound } = req.body

    // 删除轮次操作
    if (typeof deleteRound === 'number' && deleteRound >= 1 && deleteRound <= season.totalRounds) {
      // 重新编号：删除目标轮次后，所有大于该轮次的编号-1
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
      // 重新编号：所有大于 insertAfter 的轮次编号+1
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

    // 设置总轮数
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

    if (typeof jurySize === 'number' && jurySize >= 0) {
      season.jurySize = jurySize
    }
    if (typeof finalSize === 'number' && finalSize >= 0) {
      season.finalSize = finalSize
    }

    // ===== 自动计算赛季总周数（普通淘汰轮 + F3 终局轮 + 冠军投票轮） =====
    // 普通轮 = 使存活人数降到 3 所需的淘汰轮；之后固定追加 F3(1周) 与冠军投票(1周)
    try {
      const { getCollection } = require('../../../config/db')
      const hgTotal = await getCollection('BBHouseguest').countDocuments({ gameId: 'bigbrother', role: 'houseguest' })
      const totalPlayers = Math.max(hgTotal, season.currentRound >= 1 ? hgTotal : 0) || 13
      let alive = totalPlayers
      let lastNormalRound = 0
      const sortedRounds = [...roundConfigs].sort((a, b) => a.round - b.round)
      for (const cfg of sortedRounds) {
        const ec = getEvictCountForRound(cfg.round, season.twistConfigs, season.roundConfigs)
        alive -= ec
        lastNormalRound = cfg.round
        if (alive <= 3) break
      }
      // 若存活还>3（配置轮数不够），补足普通轮
      while (alive > 3) {
        lastNormalRound++
        alive -= 1
      }
      const final3Round = lastNormalRound + 1
      const championRound = lastNormalRound + 2
      season.final3Round = final3Round
      season.championRound = championRound
      season.totalRounds = championRound // N + 2
      if (season.currentRound > season.totalRounds) season.currentRound = season.totalRounds
    } catch (e) {
      console.error('自动计算终局轮失败:', e)
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

// ================================================================
// 季终结算汇总：逐轮 HOH/初始提名/POV/最终提名/票型/淘汰者 + 每人投票
// 供「冠军结算」页渲染与导出
// ================================================================
router.get('/settlement', auth, requireAdmin, async (req, res) => {
  try {
    const season = await getCurrentSeason()
    const curRound = season.currentRound
    const totalRounds = season.totalRounds || curRound
    const { getCollection } = require('../../../config/db')

    // 一次性读全部轮次所需数据
    const [hohs, noms, vetos, evictions, evictionVotes, houseguests, championVoteDocs] = await Promise.all([
      getCollection('BBHohRecord').find({ gameId: 'bigbrother' }).toArray(),
      getCollection('BBNomination').find({ gameId: 'bigbrother' }).toArray(),
      getCollection('BBVetoRecord').find({ gameId: 'bigbrother' }).toArray(),
      getCollection('BBEviction').find({ gameId: 'bigbrother' }).toArray(),
      getCollection('BBEvictionVote').find({ gameId: 'bigbrother' }).toArray(),
      getCollection('BBHouseguest').find({ gameId: 'bigbrother', role: 'houseguest' }).toArray(),
      getCollection('BBChampionVote').find({ gameId: 'bigbrother' }).toArray()
    ])

    // 终局数据（F3 / 冠军）
    const f3Round = season.final3Round || null
    const champRound = season.championRound || null
    const finalTwo = (season.finalTwo || []).map(f => ({ playerId: f.playerId, playerName: f.playerName || f.name || '', name: f.name || f.playerName || '' }))
    const final3Winners = season.final3Winners || {}
    const juryVoteMap = new Map() // voterId -> { targetId, targetName }
    championVoteDocs.forEach(v => juryVoteMap.set(v.voterId, { targetId: v.targetId, targetName: v.targetName || '' }))

    const byRound = (arr, key = 'roundId') => {
      const m = new Map()
      for (const it of arr) {
        const rid = it[key]
        if (!rid) continue
        const n = Number(String(rid).replace('round-', '')) || 0
        if (!m.has(n)) m.set(n, [])
        m.get(n).push(it)
      }
      return m
    }

    const hohByRound = byRound(hohs)
    const nomByRound = byRound(noms)
    const vetoByRound = byRound(vetos)
    const evictByRound = byRound(evictions)
    const voteByRound = byRound(evictionVotes)

    // 玩家总信息与名次
    const playerMap = new Map()
    houseguests.forEach(h => playerMap.set(h.id, { id: h.id, name: h.name, avatar: h.avatar || null, status: h.status || 'active', evictedRound: null }))

    // 先按淘汰顺序记录每个玩家被淘汰的轮次，推断名次（越晚淘汰名次越小；0 = 冠军待定）
    // 冠军/仍在场者名次暂按活动次序，最终以冠军流程为准
    const evictionOrder = [] // { playerId, round }
    for (let r = 1; r <= totalRounds; r++) {
      const evs = (evictByRound.get(r) || []).sort((a, b) => (a.createdAt || '') < (b.createdAt || '') ? -1 : 1)
      for (const e of evs) {
        const p = playerMap.get(e.evictedId)
        if (p) { p.evictedRound = r; p.status = e._id ? (e.isJury ? 'jury' : 'evicted') : p.status }
        evictionOrder.push({ playerId: e.evictedId, round: r })
      }
    }
    // F3 轮被淘汰的最后一位陪审：视为在 final3Round 被淘汰（计入淘汰顺序与顺序号）
    if (f3Round && season.lastJuryId) {
      const lp = playerMap.get(season.lastJuryId)
      if (lp) {
        lp.evictedRound = f3Round
        lp.status = 'jury'
        if (!evictionOrder.some(x => x.playerId === season.lastJuryId)) {
          evictionOrder.push({ playerId: season.lastJuryId, round: f3Round })
        }
      }
    }

    const activeCount = houseguests.length
    const totalEliminated = evictionOrder.length
    // 名次：留在场上 = 0（未淘汰，最后决出冠军）；已淘汰者越晚名次越小
    const rankMap = new Map() // playerId -> rank
    // 已淘汰者名次从 (N) 递增到 (N-totalEliminated+1)，按淘汰先后
    let rankAcc = activeCount
    for (const { playerId } of evictionOrder) {
      rankMap.set(playerId, rankAcc)
      rankAcc--
    }
    for (const p of houseguests) {
      if (!rankMap.has(p.id)) rankMap.set(p.id, 0) // 0 = 存活/冠军待定
    }

    // 赛季结束后，终局三人名次：冠军 1、亚军 2、F3 淘汰(最后一位陪审) 3
    if (season.status === 'finished' && season.championId) {
      rankMap.set(season.championId, 1)
      if (season.runnerUpId) rankMap.set(season.runnerUpId, 2)
      if (season.lastJuryId) rankMap.set(season.lastJuryId, 3)
    }

    const roundsData = []
    for (let r = 1; r <= totalRounds; r++) {
      // 终局两轮：F3 / 冠军投票 → 作为特殊列（kind 标记），普通轮字段留空
      if (f3Round && r === f3Round) {
        const f3Elim = season.lastJuryId ? { id: season.lastJuryId, name: season.lastJuryName || '' } : null
        roundsData.push({
          round: r,
          kind: 'final3',
          f3RoundWinners: [
            { round: 1, playerId: final3Winners['1']?.playerId || null, name: final3Winners['1']?.name || '' },
            { round: 2, playerId: final3Winners['2']?.playerId || null, name: final3Winners['2']?.name || '' },
            { round: 3, playerId: final3Winners['3']?.playerId || null, name: final3Winners['3']?.name || '' }
          ],
          fhohId: season.fhohId || null,
          fhohName: season.fhohName || '',
          finalTwo,
          eliminated: f3Elim,
          hohId: season.fhohId || null,
          hohName: season.fhohName || '',
          initialNomineeIds: [],
          initialNomineeNames: [],
          povId: null,
          povName: '',
          povUsed: false,
          povUsedOnName: '',
          povUsedOnId: null,
          finalNomineeIds: [],
          finalNomineeNames: [],
          replacementName: '',
          vetoUsed: false,
          ticketText: '',
          evicted: f3Elim ? [{ id: f3Elim.id, name: f3Elim.name, votes: 0 }] : [],
          hohDecided: false,
          hohVoteTargetId: null,
          hohVoteTargetName: '',
          votesDetail: []
        })
        continue
      }
      if (champRound && r === champRound) {
        roundsData.push({
          round: r,
          kind: 'champion',
          f3RoundWinners: [],
          fhohId: season.fhohId || null,
          fhohName: season.fhohName || '',
          finalTwo,
          eliminated: null,
          champion: season.championId ? { playerId: season.championId, name: season.championName || '' } : null,
          runnerUp: season.runnerUpId ? { playerId: season.runnerUpId, name: season.runnerUpName || '' } : null,
          juryVotes: houseguests
            .filter(h => h.status === 'jury')
            .map(h => ({ juryId: h.id, juryName: h.name, ...(juryVoteMap.get(h.id) || { targetId: null, targetName: '' }), voted: juryVoteMap.has(h.id) })),
          hohId: null,
          hohName: '',
          initialNomineeIds: [],
          initialNomineeNames: [],
          povId: null,
          povName: '',
          povUsed: false,
          povUsedOnName: '',
          povUsedOnId: null,
          finalNomineeIds: [],
          finalNomineeNames: [],
          replacementName: '',
          vetoUsed: false,
          ticketText: '',
          evicted: [],
          hohDecided: false,
          hohVoteTargetId: null,
          hohVoteTargetName: '',
          votesDetail: []
        })
        continue
      }
      const hohDoc = (hohByRound.get(r) || [])[0]
      const nomDoc = (nomByRound.get(r) || [])[0]
      const vetoDoc = (vetoByRound.get(r) || [])[0]
      const evicts = evictByRound.get(r) || []
      const votes = voteByRound.get(r) || []
      // HOH 的票不计入总票型/复盘（仅用于平票时的裁决票）
      const hohId = hohDoc?.winnerId || null
      const castVotes = hohId ? votes.filter(v => v.voterId !== hohId) : votes

      // 初始提名还原：若否决权已使用救走 usedOnPlayerId，最终提名少了该人并可能加了替补
      let initialIds = [...(nomDoc?.nomineeIds || [])]
      let finalIds = [...(nomDoc?.nomineeIds || [])]
      if (vetoDoc && vetoDoc.used && vetoDoc.usedOnPlayerId) {
        // 最终名单 = doc.nomineeIds（救走后剩下的 + 可能替补）；初始 = 还原
        const savedId = vetoDoc.usedOnPlayerId
        if (nomDoc?.replacementNomineeId) {
          // 最终含替补 replacementNomineeId；把替补去掉、加回被救者即初始
          initialIds = finalIds.filter(id => id !== nomDoc.replacementNomineeId)
          if (!initialIds.includes(savedId)) initialIds.push(savedId)
        } else if (finalIds.length >= 2) {
          // 没有替补，但 nomineeIds 已经删掉被救者（取决于 /veto/use 是否修改）
          initialIds = finalIds
        } else {
          // 只剩 1 人（被救走 1 人未补）→ 初始 = final + 被救者
          if (!initialIds.includes(savedId)) initialIds.push(savedId)
        }
      }
      const nameById = {}
      houseguests.forEach(h => { nameById[h.id] = h.name })
      const nameList = (ids) => ids.map(id => nameById[id] || id)

      // HOH 裁决票：仅当该轮存在 HOH 投票（平票破平）时才有值；该票不计入票型
      const hohVote = hohId ? (votes.find(v => v.voterId === hohId) || null) : null

      // 票型：按「最终提名人」逐一统计票数（0 票也显示），大数字在前；不含 HOH 票
      // 数字个数 = 该轮最终提名人数（1-2 个：如 5-0、6-3；三重献祭为 3 个如 4-3-2）
      const idCount = new Map()
      for (const v of castVotes) {
        const tid = v.targetId
        idCount.set(tid, (idCount.get(tid) || 0) + 1)
      }
      const nomineeTargets = (finalIds.length ? finalIds : Array.from(new Set(castVotes.map(v => v.targetId))))
      const ticketCounts = nomineeTargets.map(id => idCount.get(id) || 0).sort((a, b) => b - a)
      const ticketText = ticketCounts.length ? ticketCounts.join('-') : (castVotes.length ? `${castVotes.length}` : '')

      roundsData.push({
        round: r,
        kind: 'normal',
        hohId: hohDoc?.winnerId || null,
        hohName: hohDoc?.winnerName || '',
        initialNomineeIds: initialIds,
        initialNomineeNames: nameList(initialIds),
        povId: vetoDoc?.winnerId || null,
        povName: vetoDoc?.winnerName || '',
        povUsed: vetoDoc?.used || false,
        povUsedOnName: vetoDoc?.usedOnPlayerName || '',
        povUsedOnId: vetoDoc?.usedOnPlayerId || null,
        finalNomineeIds: finalIds,
        finalNomineeNames: nameList(finalIds),
        replacementName: nomDoc?.replacementNomineeName || '',
        vetoUsed: nomDoc?.vetoUsed || false,
        ticketText,
        evicted: evicts.map(e => ({ id: e.evictedId, name: e.evictedName, votes: e.voteCount })),
        hohDecided: !!hohVote,
        hohVoteTargetId: hohVote?.targetId || null,
        hohVoteTargetName: hohVote?.targetName || '',
        votesDetail: castVotes.map(v => ({ voterId: v.voterId, voterName: v.voterName, targetName: v.targetName, targetId: v.targetId }))
      })
    }

    // 玩家排名：0=存活(冠军待定)，其余按名次（大=早淘汰）
    const playersData = houseguests.map(h => {
      const rid = rankMap.get(h.id) || 0
      return {
        playerId: h.id,
        name: h.name,
        avatar: h.avatar || null,
        status: h.status || 'active',
        rank: rid,
        evictedRound: (playerMap.get(h.id) || {}).evictedRound || null
      }
    }).sort((a, b) => {
      // 0 排在最后（冠军/存活），其余按名次升序（冠军名次最小应最上；0 特殊置顶由冠军流程定）
      if (a.rank === 0 && b.rank !== 0) return 1
      if (b.rank === 0 && a.rank !== 0) return -1
      return a.rank - b.rank
    })

    res.json({
      success: true,
      data: {
        currentRound: curRound,
        totalRounds,
        final3Round: season.final3Round || null,
        championRound: season.championRound || null,
        seasonStatus: season.status,
        totalPlayers: houseguests.length,
        endgame: {
          final3Round: season.final3Round || null,
          championRound: season.championRound || null,
          fhoh: season.fhohId ? { playerId: season.fhohId, name: season.fhohName } : null,
          finalTwo: season.finalTwo || [],
          lastJury: season.lastJuryId ? { playerId: season.lastJuryId, name: season.lastJuryName } : null,
          final3Winners: season.final3Winners || {},
          champion: season.championId ? { playerId: season.championId, name: season.championName } : null,
          runnerUp: season.runnerUpId ? { playerId: season.runnerUpId, name: season.runnerUpName } : null
        },
        rounds: roundsData,
        players: playersData
      }
    })
  } catch (e) {
    console.error('Get settlement error:', e)
    res.status(500).json({ success: false, error: '获取季终结算失败', code: 'SERVER_ERROR' })
  }
})

// ================================================================
// 终局（F3 / 冠军投票）路由
// ================================================================

// GET /endgame/status - 获取终局状态（存活3/FTC/jury/冠军进度）
router.get('/endgame/status', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { getCollection } = require('../../../config/db')
    const hg = await getCollection('BBHouseguest')
    const actives = await hg.find({ gameId: 'bigbrother', role: 'houseguest', status: 'active' }).toArray()
    const jurys = await hg.find({ gameId: 'bigbrother', role: 'houseguest', status: 'jury' }).toArray()
    const evicted = await hg.find({ gameId: 'bigbrother', role: 'houseguest', status: 'evicted' }).toArray()
    const champVotes = await BBChampionVote.find({})
    const votesByTarget = {}
    const votesByVoter = new Map()
    let myChampionVote = null
    for (const v of champVotes) {
      votesByTarget[v.targetId] = (votesByTarget[v.targetId] || 0) + 1
      votesByVoter.set(v.voterId, v)
      if (v.voterId === req.user.userId) myChampionVote = { targetId: v.targetId, targetName: v.targetName }
    }
    // jury 每人投票情况（管理员逐人代投用）
    const juryVotes = jurys.map(j => {
      const v = votesByVoter.get(j.id)
      return {
        juryId: j.id,
        juryName: j.name,
        voted: !!v,
        targetId: v?.targetId || null,
        targetName: v?.targetName || ''
      }
    })
    // finalTwo 兼容：可能是 { playerId, name } 旧结构 → 统一出 playerName
    const finalTwoNorm = (season.finalTwo || []).map(f => ({
      playerId: f.playerId,
      playerName: f.playerName || f.name || '',
      name: f.name || f.playerName || ''
    }))
    res.json({
      success: true,
      data: {
        currentRound: season.currentRound,
        currentStage: season.currentStage,
        status: season.status,
        final3Round: season.final3Round,
        championRound: season.championRound,
        totalRounds: season.totalRounds,
        activePlayers: actives.map(a => ({ playerId: a.id, name: a.name })),
        juryPlayers: jurys.map(j => ({ playerId: j.id, name: j.name })),
        evictedPlayers: evicted.map(e => ({ playerId: e.id, name: e.name })),
        fhoh: season.fhohId ? { playerId: season.fhohId, name: season.fhohName } : null,
        finalTwo: finalTwoNorm,
        lastJury: season.lastJuryId ? { playerId: season.lastJuryId, name: season.lastJuryName } : null,
        final3Winners: season.final3Winners || {},
        champion: season.championId ? { playerId: season.championId, name: season.championName } : null,
        runnerUp: season.runnerUpId ? { playerId: season.runnerUpId, name: season.runnerUpName } : null,
        championVotes: votesByTarget,
        juryVotes,
        myChampionVote
      }
    })
  } catch (e) {
    console.error('Endgame status error:', e)
    res.status(500).json({ success: false, error: '获取终局状态失败', code: 'SERVER_ERROR' })
  }
})

// POST /endgame/reset - 重新开始终局（F3 / 冠军投票整段重跑）
// 把 F3 三位存活者恢复为 active，清空 F3/FTC/冠军字段与冠军投票
router.post('/endgame/reset', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    if (!season.final3Round) {
      return res.status(400).json({ success: false, error: '尚未进入终局结构，无需重置', code: 'NO_FINAL3' })
    }
    const { getCollection } = require('../../../config/db')
    const hg = getCollection('BBHouseguest')

    // 1) 恢复 F3 三位玩家状态为 active（FHOH + 被带者 + 留下者）
    const ids = new Set()
    if (season.fhohId) ids.add(season.fhohId)
    if (season.lastJuryId) ids.add(season.lastJuryId)
    ;(season.finalTwo || []).forEach(f => ids.add(f.playerId))
    // 若冠军已结算（进入 finished），冠军/亚军也在此列且需恢复为普通赛程继续
    if (season.championId) ids.add(season.championId)
    if (season.runnerUpId) ids.add(season.runnerUpId)
    for (const id of ids) {
      await hg.updateOne({ gameId: 'bigbrother', id }, { $set: { status: 'active', updatedAt: new Date().toISOString() } })
    }

    // 2) 清空终局字段
    season.final3Winners = {}
    season.fhohId = null
    season.fhohName = ''
    season.finalTwo = []
    season.lastJuryId = null
    season.lastJuryName = ''
    season.championId = null
    season.championName = ''
    season.runnerUpId = null
    season.runnerUpName = ''
    season.status = 'running'

    // 3) 回退进度到 F3 轮（若已是冠军轮/已结束）
    season.currentRound = season.final3Round
    season.currentStage = 'final3'
    season.updatedAt = new Date().toISOString()
    await season.save()

    // 4) 清空冠军投票
    await BBChampionVote.deleteMany({ gameId: 'bigbrother' })

    await logAction(req.user.userId, req.user.name || 'admin', 'admin',
      BB_ACTION_TYPES.PROGRESS_SET, 'season', season.id,
      `重新开始终局：回到第${season.final3Round}周 F3`)

    res.json({ success: true, data: season.toObject() })
  } catch (e) {
    console.error('Endgame reset error:', e)
    res.status(500).json({ success: false, error: '重置终局失败', code: 'SERVER_ERROR' })
  }
})

// POST /endgame/final3 - 登记 F3 三轮挑战结果并推进
// body: { roundIndex: 1|2|3, winnerId, winnerName }
// 规则：R1 三人 → 胜者进 R3；R2 剩余两人 → 胜者进 R3；R3 胜者 = FHOH
router.post('/endgame/final3', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    if (season.currentStage !== 'final3') {
      return res.status(400).json({ success: false, error: '当前不是 F3 终局阶段', code: 'NOT_FINAL3' })
    }
    const { roundIndex, winnerId, winnerName } = req.body
    const r = parseInt(roundIndex)
    if (!winnerId || ![1, 2, 3].includes(r)) {
      return res.status(400).json({ success: false, error: '参数错误：需 roundIndex(1|2|3) 与 winnerId', code: 'BAD_PARAM' })
    }
    const { getCollection } = require('../../../config/db')
    const actives = await getCollection('BBHouseguest').find({ gameId: 'bigbrother', role: 'houseguest', status: 'active' }).toArray()
    if (actives.length !== 3) {
      return res.status(400).json({ success: false, error: `F3 需要恰好 3 名活跃房客（当前 ${actives.length}）`, code: 'NOT_THREE' })
    }
    const nameMap = {}
    actives.forEach(a => { nameMap[a.id] = a.name })
    if (!nameMap[winnerId]) {
      return res.status(400).json({ success: false, error: '获胜者不在活跃房客中', code: 'BAD_WINNER' })
    }
    const roundWinners = season.final3Winners || {}
    roundWinners[r] = { playerId: winnerId, name: winnerName || nameMap[winnerId] }
    season.final3Winners = roundWinners

    if (r === 1) {
      season.updatedAt = new Date().toISOString()
      await season.save()
      return res.json({ success: true, data: { stage: 'round2', round1Winner: roundWinners[1] } })
    }
    if (r === 2) {
      season.updatedAt = new Date().toISOString()
      await season.save()
      return res.json({ success: true, data: { stage: 'round3', round2Winner: roundWinners[2] } })
    }
    // r===3 → FHOH
    season.fhohId = winnerId
    season.fhohName = winnerName || nameMap[winnerId]
    season.updatedAt = new Date().toISOString()
    await season.save()
    const candidates = actives.filter(a => a.id !== winnerId).map(a => ({ playerId: a.id, name: a.name }))
    return res.json({ success: true, data: { stage: 'fhoh', fhoh: { playerId: winnerId, name: season.fhohName }, candidates } })
  } catch (e) {
    console.error('Final3 error:', e)
    res.status(500).json({ success: false, error: 'F3 处理失败', code: 'SERVER_ERROR' })
  }
})

// POST /endgame/fhoh-pick - FHOH 选择带谁进 FTC（另 1 人成为最后一位 jury）
router.post('/endgame/fhoh-pick', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    if (!season.fhohId) {
      return res.status(400).json({ success: false, error: '尚无 FHOH', code: 'NO_FHOH' })
    }
    const { pickedId } = req.body
    const { getCollection } = require('../../../config/db')
    const actives = await getCollection('BBHouseguest').find({ gameId: 'bigbrother', role: 'houseguest', status: 'active' }).toArray()
    const candidates = actives.filter(a => a.id !== season.fhohId)
    const picked = candidates.find(a => a.id === pickedId)
    if (!picked) {
      return res.status(400).json({ success: false, error: '所选不在 FTC 候选中', code: 'BAD_PICK' })
    }
    const leftOut = candidates.find(a => a.id !== pickedId)
    season.finalTwo = [
      { playerId: season.fhohId, playerName: season.fhohName, name: season.fhohName },
      { playerId: picked.id, playerName: picked.name, name: picked.name }
    ]
    if (leftOut) {
      season.lastJuryId = leftOut.id
      season.lastJuryName = leftOut.name
      await getCollection('BBHouseguest').updateOne({ id: leftOut.id }, { $set: { status: 'jury', updatedAt: new Date().toISOString() } })
    }
    // 决赛二人进入 F2（Final 2）状态
    await getCollection('BBHouseguest').updateOne({ id: season.fhohId }, { $set: { status: 'f2', updatedAt: new Date().toISOString() } })
    await getCollection('BBHouseguest').updateOne({ id: picked.id }, { $set: { status: 'f2', updatedAt: new Date().toISOString() } })
    season.updatedAt = new Date().toISOString()
    await season.save()
    res.json({
      success: true,
      data: {
        fhoh: { playerId: season.fhohId, name: season.fhohName },
        finalTwo: season.finalTwo,
        lastJury: season.lastJuryId ? { playerId: season.lastJuryId, name: season.lastJuryName } : null
      }
    })
  } catch (e) {
    console.error('Fhoh pick error:', e)
    res.status(500).json({ success: false, error: '选择 FTC 失败', code: 'SERVER_ERROR' })
  }
})

// POST /endgame/champion-vote - 陪审团成员投冠军票（每位 jury 一票）
router.post('/endgame/champion-vote', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    if (season.currentStage !== 'champion_vote') {
      return res.status(400).json({ success: false, error: '当前不是冠军投票阶段', code: 'NOT_CHAMPION_VOTE' })
    }
    if (season.finalTwo.length !== 2) {
      return res.status(400).json({ success: false, error: '尚未确定 FTC 决赛二人', code: 'NO_FTC' })
    }
    const { targetId, targetName, voterId: specVoterId, voterName: specVoterName } = req.body
    const uid = req.user.userId
    const { getCollection } = require('../../../config/db')

    // 管理员可为指定陪审代投（管理员也可能本身是 admin 角色账号，不走房客投票）
    let actualVoterId = uid
    let actualVoterName = req.user.name || ''
    let voter = await getCollection('BBHouseguest').findOne({ id: uid })
    if (specVoterId && specVoterId !== uid) {
      if (req.user.role !== 'admin') {
        return res.status(400).json({ success: false, error: '只有管理员可以代投冠军票', code: 'ADMIN_ONLY' })
      }
      const targetVoter = await getCollection('BBHouseguest').findOne({ id: specVoterId })
      if (!targetVoter || targetVoter.status !== 'jury') {
        return res.status(400).json({ success: false, error: '代投对象必须是陪审团成员', code: 'NOT_JURY' })
      }
      actualVoterId = specVoterId
      actualVoterName = specVoterName || targetVoter.name || ''
      voter = targetVoter
    } else {
      if (!voter || (voter.role === 'houseguest' && voter.status !== 'jury')) {
        return res.status(400).json({ success: false, error: '只有陪审团成员可以投冠军票', code: 'NOT_JURY' })
      }
    }
    const isFinalTwo = season.finalTwo.some(f => f.playerId === actualVoterId)
    if (isFinalTwo) {
      return res.status(400).json({ success: false, error: '决赛选手不能投票', code: 'NO_VOTE_FINALIST' })
    }
    const inFinalTwoTarget = season.finalTwo.some(f => f.playerId === targetId)
    if (!inFinalTwoTarget) {
      return res.status(400).json({ success: false, error: '投票对象必须是 FTC 决赛选手', code: 'BAD_TARGET' })
    }
    await BBChampionVote.deleteMany({ gameId: 'bigbrother', voterId: actualVoterId })
    const vote = new BBChampionVote({
      id: generateId(), gameId: 'bigbrother',
      voterId: actualVoterId, voterName: actualVoterName,
      targetId, targetName: targetName || ''
    })
    await vote.save()
    res.json({ success: true, data: { voted: true, voterId: actualVoterId, targetId } })
  } catch (e) {
    console.error('Champion vote error:', e)
    res.status(500).json({ success: false, error: '冠军投票失败', code: 'SERVER_ERROR' })
  }
})

// POST /endgame/champion-result - 结算冠军（按票数；平票随机决定）
router.post('/endgame/champion-result', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    if (season.finalTwo.length !== 2) {
      return res.status(400).json({ success: false, error: '尚未确定 FTC 决赛二人', code: 'NO_FTC' })
    }
    const allVotes = await BBChampionVote.find({})
    const tally = {}
    for (const v of allVotes) {
      tally[v.targetId] = (tally[v.targetId] || 0) + 1
    }
    const a = season.finalTwo[0]
    const b = season.finalTwo[1]
    const aCount = tally[a.playerId] || 0
    const bCount = tally[b.playerId] || 0
    let champion, runnerUp
    if (aCount === bCount) {
      const winner = Math.random() < 0.5 ? a : b
      champion = winner
      runnerUp = winner.playerId === a.playerId ? b : a
    } else {
      champion = aCount > bCount ? a : b
      runnerUp = aCount > bCount ? b : a
    }
    season.championId = champion.playerId
    season.championName = champion.name
    season.runnerUpId = runnerUp.playerId
    season.runnerUpName = runnerUp.name
    season.status = 'finished'
    season.updatedAt = new Date().toISOString()
    await season.save()
    // 决赛二人保持 F2 状态（冠军/亚军在 season 字段区分，不由 status 表达）
    const { getCollection } = require('../../../config/db')
    await getCollection('BBHouseguest').updateOne({ id: runnerUp.playerId }, { $set: { status: 'f2', updatedAt: new Date().toISOString() } })
    await getCollection('BBHouseguest').updateOne({ id: champion.playerId }, { $set: { status: 'f2', updatedAt: new Date().toISOString() } })
    res.json({
      success: true,
      data: {
        champion: { playerId: champion.playerId, name: champion.name, votes: champion.playerId === a.playerId ? aCount : bCount },
        runnerUp: { playerId: runnerUp.playerId, name: runnerUp.name, votes: champion.playerId === a.playerId ? bCount : aCount },
        tally: { [a.playerId]: aCount, [b.playerId]: bCount }
      }
    })
  } catch (e) {
    console.error('Champion result error:', e)
    res.status(500).json({ success: false, error: '结算冠军失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router




