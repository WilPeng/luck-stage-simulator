const express = require('express')
const router = express.Router()
const { auth, requireAdmin } = require('../middleware/auth')
const {
  generateId, logAction, getCurrentSeason,
  STAGE_ORDER, STAGE_NAME, getStageStatus, getStageName, getStageIndex, getNextStage,
  ACTION_TYPES
} = require('../utils/helpers')
const Season = require('../models/Season')
const Round = require('../models/Round')
const RoundTeam = require('../models/RoundTeam')
const RoundTeamMember = require('../models/RoundTeamMember')
const RoundSong = require('../models/RoundSong')
const TeamSong = require('../models/TeamSong')
const TrainingRecord = require('../models/TrainingRecord')
const RehearsalResult = require('../models/RehearsalResult')
const CaptainVote = require('../models/CaptainVote')
const RoundCaptain = require('../models/RoundCaptain')
const PerformanceValue = require('../models/PerformanceValue')
const AudienceVoteFinalRanking = require('../models/AudienceVoteFinalRanking')
const PerformanceRoundState = require('../models/PerformanceRoundState')
const Team = require('../models/Team')
const User = require('../models/User')

// ===== 辅助函数 =====

async function ensureSeason() {
  let season = await getCurrentSeason()
  if (!season) {
    season = new Season({
      id: generateId(),
      name: '乘风2026',
      currentRound: 1,
      currentStage: 'preparation',
      totalRounds: 3,
      status: 'running'
    })
    await season.save()
  }
  return season
}

function serializeSeason(s) {
  const obj = s.toObject ? s.toObject() : { ...s }
  delete obj._id
  delete obj.collectionName
  return obj
}

/**
 * 清除指定轮次的业务数据（进入新轮次时调用）
 * @param {number} roundIndex - 要清除的轮次索引（1-based）
 */
async function clearRoundData(roundIndex) {
  const roundDetail = await Round.findOne({ seasonId: (await getCurrentSeason())?.id, index: roundIndex })
  if (!roundDetail) return

  const dbRoundId = roundDetail.id
  const frontRoundId = `round-${roundIndex}`
  const filter = { roundId: { $in: [dbRoundId, frontRoundId] } }

  await Promise.all([
    RoundTeam.deleteMany(filter),
    RoundTeamMember.deleteMany(filter),
    RoundCaptain.deleteMany(filter),
    CaptainVote.deleteMany(filter),
    TeamSong.deleteMany(filter),
    RoundSong.deleteMany(filter),
  ])
}

// ===== GET /api/season =====
router.get('/', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    res.json({ success: true, data: serializeSeason(season) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取赛季信息失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/season/rounds =====
router.get('/rounds', auth, async (req, res) => {
  try {
    const season = await ensureSeason()
    const rounds = []
    for (let i = 1; i <= season.totalRounds; i++) {
      rounds.push({
        id: `round-${i}`,
        index: i,
        name: `第${i}轮`,
        status: i < season.currentRound ? 'completed'
          : i === season.currentRound ? 'active'
          : 'pending'
      })
    }
    res.json({ success: true, data: rounds })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取轮次列表失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/season/stages =====
router.get('/stages', auth, (req, res) => {
  const stages = STAGE_ORDER.map((key, index) => ({
    key,
    index,
    name: STAGE_NAME[key]
  }))
  res.json({ success: true, data: stages })
})

// ===== PUT /api/season/set =====
/**
 * 管理员设置进度（POST /api/season/set）
 * 请求体: { round: 2, stage: 'TRAINING' }
 * 直接设置 currentRound 和 currentStage
 */
router.post('/set', auth, requireAdmin, async (req, res) => {
  try {
    const { round, stage } = req.body

    // 校验 round
    if (typeof round !== 'number' || round < 1) {
      return res.status(400).json({ success: false, error: 'round 必须为 >= 1 的整数', code: 'INVALID_ROUND' })
    }

    // 校验 stage
    if (!STAGE_ORDER.includes(stage)) {
      return res.status(400).json({
        success: false,
        error: `无效的 stage，可选值: ${STAGE_ORDER.join(', ')}`,
        code: 'INVALID_STAGE'
      })
    }

    const season = await ensureSeason()

    const prevRound = season.currentRound
    const prevStage = season.currentStage

    // 如果轮次变化了，清除上一轮的业务数据
    if (round !== prevRound) {
      await clearRoundData(prevRound)
    }

    season.currentRound = round
    season.currentStage = stage
    season.updatedAt = new Date().toISOString()
    await season.save()

    // 日志
    const roundName = `${round}公`
    const stageName = getStageName(stage)
    await logAction(
      req.user.userId, req.user.name || 'admin', 'admin',
      ACTION_TYPES.PROGRESS_SET,
      'season', season.id,
      `进度设置: ${prevRound}公 ${getStageName(prevStage)} → ${roundName} ${stageName}`
    )

    res.json({ success: true, data: serializeSeason(season) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '设置进度失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/season/next =====
/**
 * 自动推进到下一阶段（POST /api/season/next）
 * 如果当前是 ELIMINATION → 自动进入下一轮 PREPARATION
 */
router.post('/next', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()

    const nextStage = getNextStage(season.currentStage)
    const prevRound = season.currentRound
    const prevStage = season.currentStage

    if (nextStage === null) {
      // 当前是最后一个阶段（ELIMINATION），自动进入下一轮
      const newRound = season.currentRound + 1
      if (newRound > season.totalRounds) {
        return res.status(400).json({
          success: false,
          error: '已经是最后一轮，无法继续推进',
          code: 'NO_MORE_ROUNDS'
        })
      }
      // 清除上一轮的业务数据（队伍、队长、选歌等）
      await clearRoundData(prevRound)
      season.currentRound = newRound
      season.currentStage = 'preparation'
    } else {
      season.currentStage = nextStage
    }
    season.updatedAt = new Date().toISOString()
    await season.save()

    const desc = nextStage === null
      ? `淘汰 → 进入第${season.currentRound}公 预先准备`
      : `${getStageName(prevStage)} → ${getStageName(nextStage)}`

    await logAction(
      req.user.userId, req.user.name || 'admin', 'admin',
      ACTION_TYPES.PROGRESS_NEXT,
      'season', season.id,
      `自动推进: ${desc}`
    )

    res.json({ success: true, data: serializeSeason(season) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '推进失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/season/progress/matrix =====
/**
 * 赛程矩阵（前端期望的路径）
 * 与 02 文档 §2.2 一致
 */
router.get('/progress/matrix', auth, async (req, res) => {
  try {
    const season = await ensureSeason()

    // 构建矩阵：每轮 × 每阶段
    const matrix = []
    for (let r = 1; r <= season.totalRounds; r++) {
      for (const st of STAGE_ORDER) {
        matrix.push({
          round: r,
          stage: st,
          stageName: STAGE_NAME[st],
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
        matrix
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取赛程进度失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/season/progress =====
/**
 * 赛程矩阵（GET /api/season/progress）
 * 返回每一轮每一阶段的状态，全部动态计算，不存储完成标记
 *
 * 返回格式:
 * {
 *   currentRound: 2,
 *   currentStage: 'TRAINING',
 *   totalRounds: 3,
 *   stageOrder: ['PREPARATION', ...],
 *   stageNameMap: { PREPARATION: '预先准备', ... },
 *   matrix: [
 *     { round: 1, stage: 'PREPARATION', status: 'completed' },
 *     { round: 1, stage: 'CAPTAIN_VOTE', status: 'completed' },
 *     ...
 *     { round: 2, stage: 'TRAINING', status: 'current' },
 *     { round: 2, stage: 'REHEARSAL', status: 'future' },
 *     ...
 *   ]
 * }
 */
router.get('/progress', auth, async (req, res) => {
  try {
    const season = await ensureSeason()

    // 构建 stageNameMap 供前端使用
    const stageNameMap = {}
    for (const s of STAGE_ORDER) stageNameMap[s] = STAGE_NAME[s]

    // 构建矩阵：每轮 × 每阶段
    const matrix = []
    for (let r = 1; r <= season.totalRounds; r++) {
      for (const st of STAGE_ORDER) {
        matrix.push({
          round: r,
          stage: st,
          stageName: STAGE_NAME[st],
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
        stageOrder: STAGE_ORDER,
        stageNameMap,
        matrix
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取赛程进度失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/season/menu =====
/**
 * 菜单权限列表（GET /api/season/menu）
 * 返回当前可访问的菜单项，供前端渲染侧边栏/顶部导航
 *
 * 规则：
 *   completed → 可点击，只读
 *   current  → 可点击，可操作
 *   future   → 不可点击，disabled
 */
router.get('/menu', auth, async (req, res) => {
  try {
    const season = await ensureSeason()

    const menu = []
    for (let r = 1; r <= season.totalRounds; r++) {
      for (const st of STAGE_ORDER) {
        const status = getStageStatus(r, st, season.currentRound, season.currentStage)
        menu.push({
          round: r,
          stage: st,
          stageName: STAGE_NAME[st],
          status,
          clickable: status !== 'future',
          editable: status === 'current'
        })
      }
    }

    // 附加当前状态
    const currentStageIdx = STAGE_ORDER.indexOf(season.currentStage)

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

// ===== PUT /api/season/round =====
/**
 * 设置总轮次和每轮训练次数（PUT /api/season/round）
 * { totalRounds, trainingDrawsPerPlayer }
 */
router.put('/round', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const { totalRounds, trainingDrawsPerPlayer } = req.body

    if (typeof totalRounds === 'number' && totalRounds >= 1) {
      season.totalRounds = totalRounds
      // 如果当前轮超过了新的总轮次，自动回退
      if (season.currentRound > totalRounds) {
        season.currentRound = totalRounds
      }
    }
    if (typeof trainingDrawsPerPlayer === 'number' && trainingDrawsPerPlayer >= 0) {
      season.trainingDrawsPerPlayer = trainingDrawsPerPlayer
    }
    season.updatedAt = new Date().toISOString()
    await season.save()

    res.json({ success: true, data: serializeSeason(season) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新轮次配置失败', code: 'SERVER_ERROR' })
  }
})

// ===== PUT /api/season/config =====
router.put('/config', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()
    const allowFields = [
      'name', 'totalRounds', 'trainingDrawsPerPlayer',
      'baseScore', 'scoreMultiplier', 'randomMin', 'randomMax',
      'teamRankBonusBase', 'teamRankBonusMultiplier',
      'teamRandomMin', 'teamRandomMax', 'chatEnabled'
    ]
    for (const f of allowFields) {
      if (req.body[f] !== undefined) season[f] = req.body[f]
    }
    season.updatedAt = new Date().toISOString()
    await season.save()
    res.json({ success: true, data: serializeSeason(season) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '更新配置失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/season/restart =====
/**
 * 一键重新开始（POST /api/season/restart）
 * - 清空所有轮的队伍/训练/彩排/投票数据
 * - 所有选手状态重置为 active（队长角色变回 player）
 * - 保留历史公演结果和淘汰记录
 * - currentRound → 1, currentStage → PREPARATION
 */
router.post('/restart', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()

    // 查找所有轮次的 Round 记录（清空所有轮的分组数据）
    const allRounds = await Round.find({ seasonId: season.id })
    const allRoundIds = allRounds.map(r => r.id)

    // 清空所有轮的队伍/训练/彩排/投票数据
    if (allRoundIds.length > 0) {
      const roundFilter = { roundId: { $in: allRoundIds } }
      await RoundTeam.deleteMany(roundFilter)
      await Team.deleteMany(roundFilter)
      await RoundTeamMember.deleteMany(roundFilter)
      await RoundSong.deleteMany(roundFilter)
      await TeamSong.deleteMany(roundFilter)
      await TrainingRecord.deleteMany(roundFilter)
      await RehearsalResult.deleteMany(roundFilter)
      await CaptainVote.deleteMany(roundFilter)
      await RoundCaptain.deleteMany(roundFilter)
      await PerformanceValue.deleteMany(roundFilter)
      await AudienceVoteFinalRanking.deleteMany(roundFilter)
      await PerformanceRoundState.deleteMany(roundFilter)
    }

    // 清空所有轮次记录
    await Round.deleteMany({ seasonId: season.id })

    // 清空邀请和申请
    const TeamInvite = require('../models/TeamInvite')
    const TeamApplication = require('../models/TeamApplication')
    await TeamInvite.deleteMany({})
    await TeamApplication.deleteMany({})

    // 清空轮次准备配置
    const RoundPreparation = require('../models/RoundPreparation')
    await RoundPreparation.deleteMany({})

    // 清空安全团标记
    const SafeTeam = require('../models/SafeTeam')
    await SafeTeam.deleteMany({})

    // 所有选手状态重置
    const users = await User.find({})
    for (const u of users) {
      if (u.role !== 'admin') {
        u.status = 'active'
        u.role = 'player'
        u.teamId = null
        u.trainingCount = 0
        u.attributes = { vocal: 30, dance: 30, charm: 30 }
        await u.save()
      }
    }

    // 重置赛季状态
    season.currentRound = 1
    season.currentStage = 'preparation'
    season.updatedAt = new Date().toISOString()
    await season.save()

    await logAction(
      req.user.userId, req.user.name || 'admin', 'admin',
      ACTION_TYPES.SEASON_RESTART,
      'season', season.id,
      '一键重新开始（保留历史公演和淘汰记录）'
    )

    res.json({ success: true, data: serializeSeason(season) })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '重置失败', code: 'SERVER_ERROR' })
  }
})

// ===== POST /api/season/reset =====
/**
 * 完全重置（POST /api/season/reset）
 * - 清空所有业务数据（队伍/训练/彩排/公演/淘汰/聊天）
 * - 所有选手属性和状态还原
 * - 赛季从头开始
 */
router.post('/reset', auth, requireAdmin, async (req, res) => {
  try {
    const season = await ensureSeason()

    const stats = {}

    // ===== 1. 清空所有轮次业务数据 =====
    const modelsToClear = [
      // 队伍相关 (1-3)
      { name: 'RoundTeam', model: require('../models/RoundTeam') },
      { name: 'Team', model: require('../models/Team') },
      { name: 'RoundTeamMember', model: require('../models/RoundTeamMember') },
      { name: 'RoundSong', model: require('../models/RoundSong') },
      { name: 'TeamSong', model: require('../models/TeamSong') },
      // 训练/彩排 (4-5)
      { name: 'TrainingRecord', model: require('../models/TrainingRecord') },
      { name: 'RehearsalResult', model: require('../models/RehearsalResult') },
      // 公演结果 (6)
      { name: 'TeamPerformance', model: require('../models/TeamPerformance') },
      { name: 'PlayerPerformance', model: require('../models/PlayerPerformance') },
      // 大众评审投票 (7)
      { name: 'AudienceVoteSession', model: require('../models/AudienceVoteSession') },
      { name: 'AudienceMember', model: require('../models/AudienceMember') },
      { name: 'AudienceVote', model: require('../models/AudienceVote') },
      { name: 'AudienceVoteFinalRanking', model: require('../models/AudienceVoteFinalRanking') },
      // 发挥值 (PerformanceValue 模型，用于公演结算前选手生成)
      { name: 'PerformanceValue', model: require('../models/PerformanceValue') },
      // 公演轮次状态（公演是否开启、已揭晓队伍等）
      { name: 'PerformanceRoundState', model: require('../models/PerformanceRoundState') },
      // 淘汰记录 (8)
      { name: 'Elimination', model: require('../models/Elimination') },
      { name: 'SafeTeam', model: require('../models/SafeTeam') },
      // 邀请/申请 (14)
      { name: 'TeamInvite', model: require('../models/TeamInvite') },
      { name: 'TeamApplication', model: require('../models/TeamApplication') },
      // 其他
      { name: 'CaptainVote', model: require('../models/CaptainVote') },
      { name: 'RoundCaptain', model: require('../models/RoundCaptain') },
      { name: 'RoundPreparation', model: require('../models/RoundPreparation') },
      { name: 'ChatMessage', model: require('../models/ChatMessage') },
      { name: 'Round', model: require('../models/Round') }
    ]

    for (const { name, model } of modelsToClear) {
      if (model.deleteMany) {
        const before = await model.countDocuments ? await model.countDocuments({}) : 0
        await model.deleteMany({})
        const after = await model.countDocuments ? await model.countDocuments({}) : 0
        const deleted = typeof before === 'number' ? before - after : 0
        if (name === 'RoundTeam') stats.teamsDeleted = before
        if (name === 'TrainingRecord') stats.trainingRecordsDeleted = before
        if (name === 'RehearsalResult') stats.rehearsalResultsDeleted = before
        if (name === 'TeamPerformance') stats.performanceResultsDeleted = before
        if (name === 'PlayerPerformance') stats.playerScoresDeleted = before
        if (name === 'Elimination') stats.eliminationRecordsDeleted = before
        if (name === 'TeamInvite') stats.invitesDeleted = before
        if (name === 'TeamApplication') stats.applicationsDeleted = before
        if (name === 'AudienceVoteSession') stats.audienceVoteDataDeleted = true
      }
    }

    // ===== 2. 清空操作日志 (15) =====
    const OperationLog = require('../models/OperationLog')
    const logsBefore = await OperationLog.countDocuments({})
    await OperationLog.deleteMany({})
    stats.logsDeleted = logsBefore

    // ===== 3. 重置所有非管理员选手 (9-12) =====
    const users = await User.find({})
    let usersReset = 0
    for (const u of users) {
      if (u.role !== 'admin') {
        u.status = 'active'       // 10
        u.role = 'player'         // 9
        u.teamId = null           // 11
        u.trainingCount = 0       // 12
        u.attributes = { vocal: 30, dance: 30, charm: 30 }
        await u.save()
        usersReset++
      }
    }
    stats.usersReset = usersReset

    // ===== 4. 重置赛季状态 (13) =====
    season.currentRound = 1
    season.currentStage = 'preparation'
    season.updatedAt = new Date().toISOString()
    await season.save()

    stats.seasonReset = true

    // 记录操作日志
    await logAction(
      req.user.userId, req.user.name || 'admin', 'admin',
      ACTION_TYPES.SEASON_RESET,
      'season', season.id,
      '完全重置'
    )

    res.json({
      success: true,
      data: {
        resetStats: stats,
        message: '赛季已重置',
        newState: {
          currentRound: season.currentRound,
          currentStage: season.currentStage
        }
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '完全重置失败', code: 'SERVER_ERROR' })
  }
})

// ===== GET /api/season/history（roundId 必填）=====
router.get('/history', auth, async (req, res) => {
  try {
    const { roundId } = req.query
    if (!roundId) return res.status(400).json({ success: false, error: 'roundId 必填', code: 'MISSING_ROUND_ID' })

    const Round = require('../models/Round')
    const round = await Round.findOne({ id: roundId })
    if (!round) return res.status(400).json({ success: false, error: '轮次不存在', code: 'ROUND_NOT_FOUND' })

    const season = await ensureSeason()
    const rId = round.id

    const TeamPerformance = require('../models/TeamPerformance')
    const PlayerPerformance = require('../models/PlayerPerformance')
    const Elimination = require('../models/Elimination')

    const [teamPerf, playerPerf, eliminations, teams, members] = await Promise.all([
      TeamPerformance.find({ roundId: rId }),
      PlayerPerformance.find({ roundId: rId }),
      Elimination.find({ roundId: rId }),
      RoundTeam.find({ roundId: rId }),
      RoundTeamMember.find({ roundId: rId })
    ])

    res.json({
      success: true,
      data: {
        roundId: rId,
        roundIndex: round.index,
        totalRounds: season.totalRounds,
        currentRound: season.currentRound,
        teams,
        members,
        teamPerformances: teamPerf,
        playerPerformances: playerPerf,
        eliminations
      }
    })
  } catch (e) {
    console.error(e)
    res.status(500).json({ success: false, error: '获取历史失败', code: 'SERVER_ERROR' })
  }
})

module.exports = router
