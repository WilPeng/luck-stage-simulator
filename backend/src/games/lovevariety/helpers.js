const { v4: uuidv4 } = require('uuid')

const generateId = () => uuidv4()

// ===== 恋综阶段定义 =====
const LV_STAGE_ORDER = [
  'love_vote',       // 0  喜爱值投送
  'pairing',         // 1  配对结算
  'elimination'      // 2  淘汰
]

const LV_STAGE_NAME = {
  love_vote: '喜爱值投送',
  pairing: '配对结算',
  elimination: '淘汰'
}

// waiting 是重置后的特殊阶段，不在 LV_STAGE_ORDER 中
const LV_WAITING = 'waiting'

// ===== 操作日志类型 =====
const LV_ACTION_TYPES = {
  LOGIN: 'LOGIN',
  VOTE_SUBMIT: 'VOTE_SUBMIT',
  PAIRING_CALCULATE: 'PAIRING_CALCULATE',
  ELIMINATION_SET: 'ELIMINATION_SET',
  STAGE_CHANGE: 'STAGE_CHANGE',
  PROGRESS_SET: 'PROGRESS_SET',
  PROGRESS_NEXT: 'PROGRESS_NEXT',
  SEASON_RESET: 'SEASON_RESET',
  PLAYER_CREATE: 'PLAYER_CREATE',
  PLAYER_EDIT: 'PLAYER_EDIT',
  PLAYER_DELETE: 'PLAYER_DELETE',
  PLAYER_STATUS_CHANGE: 'PLAYER_STATUS_CHANGE',
  LETTER_SEND: 'LETTER_SEND',
  LETTER_ADD_COUNT: 'LETTER_ADD_COUNT',
  LETTER_DELETE: 'LETTER_DELETE',
  VOTE_ADMIN_SUBMIT: 'VOTE_ADMIN_SUBMIT'
}

// ===== 状态计算 =====
const getStageStatus = (round, stage, currentRound, currentStage) => {
  if (!currentStage || currentRound == null) return 'future'
  // waiting 阶段所有格子都是 future
  if (currentStage === 'waiting') return 'future'
  const idx = LV_STAGE_ORDER.indexOf(stage)
  const curIdx = LV_STAGE_ORDER.indexOf(currentStage)
  if (idx < 0 || curIdx < 0) return 'future'
  if (round < currentRound) return 'completed'
  if (round > currentRound) return 'future'
  if (idx < curIdx) return 'completed'
  if (idx === curIdx) return 'current'
  return 'future'
}

const getStageName = (stage) => {
  if (stage === 'waiting') return '等待开始'
  return LV_STAGE_NAME[stage] || stage || ''
}

const getStageIndex = (stage) => LV_STAGE_ORDER.indexOf(stage)

const getNextStage = (stage) => {
  // waiting 阶段的下一个就是 love_vote
  if (stage === 'waiting') return 'love_vote'
  const idx = LV_STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= LV_STAGE_ORDER.length - 1) return null
  return LV_STAGE_ORDER[idx + 1]
}

// ===== 操作日志 =====
const logAction = async (userId, userName, role, actionType, targetType, targetId, detail) => {
  try {
    const LVOperationLog = require('./models/LVOperationLog')
    const log = new LVOperationLog({
      id: generateId(),
      userId,
      userName,
      role,
      actionType,
      targetType,
      targetId,
      detail,
      gameId: 'lovevariety',
      createdAt: new Date().toISOString()
    })
    await log.save()
  } catch (error) {
    console.error('Failed to create lovevariety operation log:', error)
  }
}

// ===== 获取当前赛季 =====
const getCurrentSeason = async () => {
  const LVSeason = require('./models/LVSeason')
  return await LVSeason.findOne({ gameId: 'lovevariety' })
}

// ===== 喜爱值预算范围 =====
const VOTE_BUDGET_MIN = 100
const VOTE_BUDGET_MAX = 160

// ===== 随机工具 =====
const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min
const randomVoteBudget = () => randomInt(VOTE_BUDGET_MIN, VOTE_BUDGET_MAX)

module.exports = {
  generateId,
  logAction,
  randomInt,
  randomVoteBudget,
  VOTE_BUDGET_MIN,
  VOTE_BUDGET_MAX,
  getCurrentSeason,
  getStageStatus,
  getStageName,
  getStageIndex,
  getNextStage,
  LV_STAGE_ORDER,
  LV_STAGE_NAME,
  LV_WAITING,
  LV_ACTION_TYPES
}
