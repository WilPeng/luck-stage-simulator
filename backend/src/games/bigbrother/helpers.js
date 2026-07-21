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
  EVICTED_RESTORE: 'EVICTED_RESTORE'
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
  BB_ACTION_TYPES
}
