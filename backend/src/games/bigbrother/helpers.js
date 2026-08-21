const { v4: uuidv4 } = require('uuid')

const generateId = () => uuidv4()

// ===== Big Brother 阶段定义 =====
const BB_STAGE_ORDER = [
  'hoh_competition',    // 0  HOH 竞争
  'nomination',         // 1  提名
  'veto_competition',   // 2  否决权竞争
  'veto_ceremony',      // 3  否决权会议
  'replacement_nom',    // 4  替换提名（可选）
  'eviction_vote',      // 5  淘汰投票
  'eviction'            // 6  淘汰结果
]

const BB_STAGE_NAME = {
  hoh_competition: 'HOH竞争',
  nomination: '提名',
  veto_competition: '否决权竞争',
  veto_ceremony: '否决权会议',
  replacement_nom: '替换提名',
  eviction_vote: '淘汰投票',
  eviction: '淘汰结果'
}

// ===== Twist（反转/变数）定义 =====
const TWIST_DEFINITIONS = {
  no_pendant_challenge: {
    id: 'no_pendant_challenge',
    name: '无护符挑战',
    icon: '🚫',
    description: '本轮跳过否决权竞争阶段，无人持有否决权',
    affectsStages: ['veto_competition'],
    group: 1
  },
  triple_offering: {
    id: 'triple_offering',
    name: '三重献祭',
    icon: '🔱',
    description: '提名允许3人，淘汰投票淘汰得票最高的2人',
    affectsStages: ['nomination', 'eviction'],
    group: 1
  },
  direct_democracy: {
    id: 'direct_democracy',
    name: '直接民主',
    icon: '🗳️',
    description: '提名改为全员投票决定（HOH票数双倍），HOH不能直接提名',
    affectsStages: ['nomination'],
    group: 1
  },
  karmic_pawnship: {
    id: 'karmic_pawnship',
    name: '因果报应',
    icon: '⚖️',
    description: '淘汰投票中幸存的被提名者自动成为下轮HOH',
    affectsStages: ['eviction', 'hoh_competition'],
    group: 1
  },
  condemned: {
    id: 'condemned',
    name: '受罚者',
    icon: '⛓️',
    description: 'HOH竞争后4人成为受罚者，否决权挑战受削弱',
    affectsStages: ['hoh_competition', 'veto_competition'],
    group: 1
  },
  serpent_mark: {
    id: 'serpent_mark',
    name: '毒蛇标记',
    icon: '🐍',
    description: '每位玩家被秘密分配一个目标，目标被淘汰则自己成下轮HOH',
    affectsStages: ['hoh_competition'],
    group: 1
  },
  secret_keeper: {
    id: 'secret_keeper',
    name: '匿名房主',
    icon: '🎭',
    description: 'HOH身份对玩家保密，提名不显示HOH姓名',
    affectsStages: ['nomination'],
    group: 1
  },
  boomerang_pendant: {
    id: 'boomerang_pendant',
    name: '回旋镖护符',
    icon: '🪃',
    description: '否决权使用时所有被提名者全救，HOH必须重新提名全部人',
    affectsStages: ['veto_ceremony', 'replacement_nom'],
    group: 1
  }
}

// 按 twist ID 获取 twist 定义
const getTwistDef = (twistId) => TWIST_DEFINITIONS[twistId] || null

// 获取所有 twist 定义列表
const getAllTwistDefs = () => Object.values(TWIST_DEFINITIONS)

// 获取指定轮次启用的 twist ID 列表
// 优先从 roundConfigs 读取，回退到 twistConfigs
const getTwistsForRound = (round, twistConfigs, roundConfigs) => {
  // 先尝试 roundConfigs
  if (roundConfigs && Array.isArray(roundConfigs)) {
    const cfg = roundConfigs.find(rc => rc.round === round)
    if (cfg && Array.isArray(cfg.twists)) return cfg.twists
  }
  // 回退到 twistConfigs
  if (twistConfigs && Array.isArray(twistConfigs)) {
    const cfg = twistConfigs.find(tc => tc.round === round)
    if (cfg) return cfg.twists || []
  }
  return []
}

// 检查指定轮次是否启用了某个 twist
const hasTwist = (round, twistId, twistConfigs, roundConfigs) => {
  return getTwistsForRound(round, twistConfigs, roundConfigs).includes(twistId)
}

// 获取指定轮次启用的 twist 的完整定义列表
const getTwistDefsForRound = (round, twistConfigs, roundConfigs) => {
  return getTwistsForRound(round, twistConfigs, roundConfigs)
    .map(id => TWIST_DEFINITIONS[id])
    .filter(Boolean)
}

// 获取指定轮次的淘汰人数（考虑 twist 影响）
// 三重献祭：淘汰 2 人
// 未来复活 twist：淘汰 0 人（预留扩展点）
// 默认：淘汰 1 人
const getEvictCountForRound = (round, twistConfigs, roundConfigs) => {
  if (hasTwist(round, 'triple_offering', twistConfigs, roundConfigs)) return 2
  // 未来复活 twist 预留
  // if (hasTwist(round, 'resurrection', twistConfigs, roundConfigs)) return 0
  return 1
}

// ===== 操作日志类型 =====
const BB_ACTION_TYPES = {
  LOGIN: 'LOGIN',
  HOH_SET: 'HOH_SET',
  NOMINATION_SET: 'NOMINATION_SET',
  VETO_WIN: 'VETO_WIN',
  VETO_USE: 'VETO_USE',
  EVICTION_VOTE: 'EVICTION_VOTE',
  EVICTION_RESULT: 'EVICTION_RESULT',
  STAGE_CHANGE: 'STAGE_CHANGE',
  PROGRESS_SET: 'PROGRESS_SET',
  PROGRESS_NEXT: 'PROGRESS_NEXT',
  SEASON_RESET: 'SEASON_RESET',
  SEASON_RESTART: 'SEASON_RESTART',
  HOUSEGUEST_CREATE: 'HOUSEGUEST_CREATE',
  HOUSEGUEST_EDIT: 'HOUSEGUEST_EDIT',
  HOUSEGUEST_DELETE: 'HOUSEGUEST_DELETE',
  CHAT_CLEAR: 'CHAT_CLEAR',
  EVICTED_RESTORE: 'EVICTED_RESTORE',
  TWIST_APPLIED: 'TWIST_APPLIED',
  TWIST_CONFIG_SAVED: 'TWIST_CONFIG_SAVED'
}

// ===== 状态计算 =====
const getStageStatus = (round, stage, currentRound, currentStage) => {
  if (!currentStage || currentRound == null) return 'future'
  const idx = BB_STAGE_ORDER.indexOf(stage)
  const curIdx = BB_STAGE_ORDER.indexOf(currentStage)
  if (idx < 0 || curIdx < 0) return 'future'
  if (round < currentRound) return 'completed'
  if (round > currentRound) return 'future'
  if (idx < curIdx) return 'completed'
  if (idx === curIdx) return 'current'
  return 'future'
}

const getStageName = (stage) => BB_STAGE_NAME[stage] || stage || ''

const getStageIndex = (stage) => BB_STAGE_ORDER.indexOf(stage)

const getNextStage = (stage) => {
  const idx = BB_STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= BB_STAGE_ORDER.length - 1) return null
  return BB_STAGE_ORDER[idx + 1]
}

// ===== 操作日志 =====
const logAction = async (userId, userName, role, actionType, targetType, targetId, detail) => {
  try {
    const BBOperationLog = require('./models/BBOperationLog')
    const log = new BBOperationLog({
      id: generateId(),
      userId,
      userName,
      role,
      actionType,
      targetType,
      targetId,
      detail,
      gameId: 'bigbrother',
      createdAt: new Date().toISOString()
    })
    await log.save()
  } catch (error) {
    console.error('Failed to create Big Brother operation log:', error)
  }
}

// ===== 获取当前赛季 =====
const getCurrentSeason = async () => {
  const BBSeason = require('./models/BBSeason')
  return await BBSeason.findOne({ gameId: 'bigbrother' })
}

// ===== 随机工具 =====
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

module.exports = {
  generateId,
  logAction,
  randomInt,
  getCurrentSeason,
  getStageStatus,
  getStageName,
  getStageIndex,
  getNextStage,
  BB_STAGE_ORDER,
  BB_STAGE_NAME,
  BB_ACTION_TYPES,
  TWIST_DEFINITIONS,
  getTwistDef,
  getAllTwistDefs,
  getTwistsForRound,
  hasTwist,
  getTwistDefsForRound,
  getEvictCountForRound
}
