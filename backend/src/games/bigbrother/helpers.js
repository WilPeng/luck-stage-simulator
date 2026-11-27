const { v4: uuidv4 } = require('uuid')

const generateId = () => uuidv4()

// ===== Big Brother 阶段定义 =====
const BB_STAGE_ORDER = [
  'hoh_competition',    // 0  HOH 竞争
  'nomination',         // 1  提名
  'veto_competition',   // 2  否决权竞争
  'veto_ceremony',      // 3  否决权会议
  'replacement_nom',    // 4  替换提名（可选）
  'bbbb',               // 5  BBBB（仅启用该 twist 的轮次；3名提名者比赛，胜者安全）
  'eviction_vote',      // 6  淘汰投票
  'eviction'            // 7  淘汰结果
]

const BB_STAGE_NAME = {
  hoh_competition: 'HOH竞争',
  nomination: '提名',
  veto_competition: '否决权竞争',
  veto_ceremony: '否决权会议',
  replacement_nom: '替换提名',
  bbbb: 'BBBB',
  eviction_vote: '淘汰投票',
  eviction: '淘汰结果',
  final3: 'F3终局',
  champion_vote: '冠军投票'
}

// 普通轮阶段（逐轮淘汰）
const BB_NORMAL_STAGES = [...BB_STAGE_ORDER]

// 终局特殊"轮状态"（不作为普通阶段推进；由 /season 终局接口驱动）
const BB_ENDGAME_STAGES = ['final3', 'champion_vote']

// ===== Twist（反转/变数）定义 =====
const TWIST_DEFINITIONS = {
  battle_of_block: {"id": "battle_of_block", "name": "双房主对抗", "icon": "🏟️", "description": "两名临时 HOH 各提名两人。胜出的提名组安全，提名他们的房主失去权力。另一组进入常规 POV。", "affectsStages": ["hoh_competition", "replacement_nom"], "group": 2},
  split_house: {"id": "split_house", "name": "分屋并行", "icon": "🏘️", "description": "分成两个独立小组，各自进行 HOH、提名、POV 和淘汰投票。两组结算后合屋。", "affectsStages": ["hoh_competition", "eviction"], "group": 2},

  voluntary_nominee: {"id": "voluntary_nominee", "name": "提前挂牌", "icon": "🏷️", "description": "房客可在提名前公开自荐。HOH 选择一名报名者占提名席，并给其一次快速算术 POV 免冷却重试机会。", "affectsStages": ["nomination", "veto_competition"], "group": 2},
  nomination_appeal: {"id": "nomination_appeal", "name": "提名申诉", "icon": "⚖️", "description": "首位申诉的被提名者与 HOH 短赛。申诉者获胜时，快速算术 POV 首次答错可立即重试。", "affectsStages": ["nomination", "veto_competition"], "group": 2},

  round_rewind: {"id": "round_rewind", "name": "整轮回卷", "icon": "⏮️", "description": "投票开启前执行一次回卷。第一轮 HOH、提名和 POV 结果归档，重新争夺房主。", "affectsStages": ["eviction_vote", "hoh_competition"], "group": 2},
  battle_back: {"id": "battle_back", "name": "复活赛", "icon": "🎟️", "description": "本轮 HOH 竞争前确认复活赛结果。一名已淘汰房客回归并恢复参赛资格。", "affectsStages": ["hoh_competition"], "group": 2},
  costly_return: {"id": "costly_return", "name": "代价复活", "icon": "🔓", "description": "陪审团开始前，一名淘汰者回归。回归当轮不可担任 HOH，保留提名和 POV 资格。", "affectsStages": ["hoh_competition"], "group": 2},

  coup_detat: {"id": "coup_detat", "name": "政变权", "icon": "⚡", "description": "管理员公布权力归属后，持有者可在投票开始前撤换一至两名最终提名者。", "affectsStages": ["nomination", "eviction_vote"], "group": 2},
  tie_recall: {"id": "tie_recall", "name": "并列召回", "icon": "🔁", "description": "三名最终提名者投淘汰票。最高票平票时，HOH 保下一名并列者，其余两人重投一次。", "affectsStages": ["nomination", "eviction_vote", "eviction"], "group": 2},

  safety_suite: {"id": "safety_suite", "name": "安全挑战", "icon": "🛡️", "description": "HOH 产生后、正式提名前举行安全挑战。经确认的胜者本轮不能被提名。", "affectsStages": ["nomination", "replacement_nom"], "group": 2},
  sealed_replacement: {"id": "sealed_replacement", "name": "预埋补位", "icon": "🔐", "description": "HOH 在提名前秘密锁定两位有顺序的候补。POV 救人后按顺序采用首位合资格者。", "affectsStages": ["nomination", "replacement_nom"], "group": 2},
  veto_trustee: {"id": "veto_trustee", "name": "护符托管", "icon": "🤝", "description": "POV 胜者可在决定前，把使用或放弃的决定权公开交给一位未被提名的选手。", "affectsStages": ["veto_ceremony"], "group": 2},
  rescue_contract: {"id": "rescue_contract", "name": "救援合约", "icon": "📜", "description": "提名前两人互相确认合约。若一人赢得 POV 并救下搭档，持有者获下轮 POV 参赛席位。", "affectsStages": ["nomination", "veto_competition", "veto_ceremony"], "group": 2},
  save_vote: {"id": "save_vote", "name": "三人保留票", "icon": "🗳️", "description": "三名最终提名者参加投票。房客投票保留一人，其余两人淘汰。", "affectsStages": ["nomination", "eviction_vote", "eviction"], "group": 2},

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
  },
  bbbb: {
    id: 'bbbb',
    name: 'BBBB',
    icon: '🎯',
    description: '本轮 HOH 提名 3 人；淘汰投票前 3 名提名者进行 BBBB 比赛，胜者安全，其余 2 人进入淘汰投票',
    affectsStages: ['nomination', 'bbbb', 'eviction_vote'],
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
  if (['triple_offering', 'save_vote', 'split_house'].some(id => hasTwist(round, id, twistConfigs, roundConfigs))) return 2
  if (['battle_back', 'costly_return'].some(id => hasTwist(round, id, twistConfigs, roundConfigs))) return 0
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
  WALK: 'WALK',
  WALK_UNDO: 'WALK_UNDO',
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

// 终局两轮（F3 / 冠军投票）的状态：只与轮次先后有关，无 7 阶段细分
const getEndgameStatus = (round, stage, currentRound, currentStage) => {
  if (currentRound == null) return 'future'
  if (round < currentRound) return 'completed'
  if (round > currentRound) return 'future'
  if (currentStage === stage) return 'current'
  // 同轮但阶段不同：例如已在冠军轮，F3 行 → 已完成
  return 'completed'
}

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

// ===== 总管理员（唯一）=====
// 保证始终存在且仅存在一位总管理员：优先保留已标记者或内置 admin 账号。
const ensureSuperAdmin = async () => {
  const BBHouseguest = require('./models/BBHouseguest')
  const admins = await BBHouseguest.find({ gameId: 'bigbrother', role: 'admin' })
  if (!admins.length) return null

  const marked = admins.filter(a => a.isSuperAdmin)
  let superAdmin = marked.find(a => a.username === 'admin') || marked[0]
  if (!superAdmin) {
    superAdmin = admins.find(a => a.username === 'admin') || admins[0]
  }

  // 总管理员始终为管理员且拥有全部权限（空权限 = 全部）
  let changed = false
  if (!superAdmin.isSuperAdmin) { superAdmin.isSuperAdmin = true; changed = true }
  if (superAdmin.role !== 'admin') { superAdmin.role = 'admin'; changed = true }
  if (!Array.isArray(superAdmin.permissions) || superAdmin.permissions.length > 0) {
    superAdmin.permissions = []
    changed = true
  }
  if (changed) await superAdmin.save()

  // 清除其他管理员的总管理员标记，保证唯一
  for (const admin of admins) {
    if (admin.id !== superAdmin.id && admin.isSuperAdmin) {
      admin.isSuperAdmin = false
      await admin.save()
    }
  }
  return superAdmin
}

// ===== 随机工具 =====
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min

module.exports = {
  generateId,
  logAction,
  randomInt,
  getCurrentSeason,
  ensureSuperAdmin,
  getStageStatus,
  getEndgameStatus,
  getStageName,
  getStageIndex,
  getNextStage,
  BB_STAGE_ORDER,
  BB_STAGE_NAME,
  BB_NORMAL_STAGES,
  BB_ENDGAME_STAGES,
  BB_ACTION_TYPES,
  TWIST_DEFINITIONS,
  getTwistDef,
  getAllTwistDefs,
  getTwistsForRound,
  hasTwist,
  getTwistDefsForRound,
  getEvictCountForRound
}
