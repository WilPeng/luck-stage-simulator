const { v4: uuidv4 } = require('uuid')

const generateId = () => uuidv4()

// ===== 操作日志类型常量 =====
const ACTION_TYPES = {
  LOGIN: 'LOGIN',
  TEAM_EDIT: 'TEAM_EDIT',
  TRAINING_DRAW: 'TRAINING_DRAW',
  TRAINING_CONFIG: 'TRAINING_CONFIG',
  TEAM_CHANGE: 'TEAM_CHANGE',
  CAPTAIN_VOTE: 'CAPTAIN_VOTE',
  CAPTAIN_ASSIGN: 'CAPTAIN_ASSIGN',
  TEAM_RANDOM_ASSIGN: 'TEAM_RANDOM_ASSIGN',
  TEAM_MANUAL_ASSIGN: 'TEAM_MANUAL_ASSIGN',
  SONG_LIBRARY_ADD: 'SONG_LIBRARY_ADD',
  SONG_LIBRARY_EDIT: 'SONG_LIBRARY_EDIT',
  SONG_LIBRARY_DELETE: 'SONG_LIBRARY_DELETE',
  ROUND_SONG_ADD: 'ROUND_SONG_ADD',
  ROUND_SONG_REMOVE: 'ROUND_SONG_REMOVE',
  TEAM_SONG_ASSIGN: 'TEAM_SONG_ASSIGN',
  REHEARSAL_ROLL: 'REHEARSAL_ROLL',
  PERFORMANCE_CALC: 'PERFORMANCE_CALC',
  ELIMINATION: 'ELIMINATION',
  SEASON_RESET: 'SEASON_RESET',
  SEASON_RESTART: 'SEASON_RESTART',
  STAGE_CHANGE: 'STAGE_CHANGE',
  ROUND_CHANGE: 'ROUND_CHANGE',
  CHAT_CLEAR: 'CHAT_CLEAR',
  CHAT_CONFIG: 'CHAT_CONFIG',
  PROGRESS_SET: 'PROGRESS_SET',
  PROGRESS_NEXT: 'PROGRESS_NEXT'
}

// ===== 阶段定义（顺序固定，不可更改）=====
// 枚举值：01 文档定义为小写下划线（与前端保持一致）

const STAGE_ORDER = [
  'preparation',     // 0  预先准备
  'captain_vote',    // 1  队长选举
  'teaming',         // 2  组队
  'song_select',     // 3  选歌
  'training',        // 4  训练
  'rehearsal',       // 5  彩排
  'performance',     // 6  公演
  'elimination'      // 7  淘汰
]

const STAGE_NAME = {
  preparation: '预先准备',
  captain_vote: '队长选举',
  teaming: '组队',
  song_select: '选歌',
  training: '训练',
  rehearsal: '彩排',
  performance: '公演',
  elimination: '淘汰'
}

// ===== 状态计算 =====
/**
 * 计算某一轮某一阶段的状态
 * @param {number} round - 该条目所属轮次（1=一公）
 * @param {string} stage - 该条目阶段
 * @param {number} currentRound - 当前轮次
 * @param {string} currentStage - 当前阶段
 * @returns {'completed' | 'current' | 'future'}
 */
const getStageStatus = (round, stage, currentRound, currentStage) => {
  if (!currentStage || currentRound == null) return 'future'

  const idx = STAGE_ORDER.indexOf(stage)
  const curIdx = STAGE_ORDER.indexOf(currentStage)

  if (idx < 0 || curIdx < 0) return 'future'

  if (round < currentRound) {
    // 过去的轮：全部为已完成
    return 'completed'
  } else if (round > currentRound) {
    // 未来的轮：全部为未开始
    return 'future'
  } else {
    // 同一轮：比较阶段索引
    if (idx < curIdx) return 'completed'
    if (idx === curIdx) return 'current'
    return 'future'
  }
}

/**
 * 获取阶段中文名
 */
const getStageName = (stage) => STAGE_NAME[stage] || stage || ''

/**
 * 获取阶段在顺序中的索引（-1 表示无效）
 */
const getStageIndex = (stage) => STAGE_ORDER.indexOf(stage)

/**
 * 获取下一阶段（返回 stage 字符串，如果已经是最后一个阶段则返回 null）
 */
const getNextStage = (stage) => {
  const idx = STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= STAGE_ORDER.length - 1) return null
  return STAGE_ORDER[idx + 1]
}

// ===== 操作日志（惰性加载 OperationLog 避免循环依赖）=====
const logAction = async (userId, userName, role, actionType, targetType, targetId, detail) => {
  try {
    const OperationLog = require('../models/OperationLog')
    const log = new OperationLog({
      id: generateId(),
      userId,
      userName,
      role,
      actionType,
      targetType,
      targetId,
      detail,
      createdAt: new Date().toISOString()
    })
    await log.save()
  } catch (error) {
    console.error('Failed to create operation log:', error)
  }
}

// ===== 工具函数 =====

const randomInt = (min, max) => {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

const getCurrentSeason = async (gameId) => {
  const Season = require('../models/Season')
  const query = {}
  if (gameId) query.gameId = gameId
  return await Season.findOne(query)
}

// 用户信息脱敏（组队/选手列表返回用）
const maskPlayer = (player) => {
  if (!player) return null
  return {
    id: player.id,
    name: player.name,
    avatar: player.avatar || null,
    role: player.role || 'player',
    status: player.status || 'active',
    attributes: player.attributes || { vocal: 0, dance: 0, charm: 0 },
    trainingCount: typeof player.trainingCount === 'number' ? player.trainingCount : 0
  }
}

// 旧别名兼容
const maskUser = maskPlayer

module.exports = {
  generateId,
  logAction,
  randomInt,
  getCurrentSeason,
  getStageStatus,
  getStageName,
  getStageIndex,
  getNextStage,
  STAGE_ORDER,
  STAGE_NAME,
  STAGE_LIST: STAGE_ORDER, // 兼容旧代码
  ACTION_TYPES,
  maskPlayer,
  maskUser
}
