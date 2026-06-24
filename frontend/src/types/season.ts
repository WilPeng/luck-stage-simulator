// ================== 赛程状态机类型定义 ==================

// 阶段类型（前后端统一）
export type StageType =
  | 'preparation'     // 预先准备
  | 'captain_vote'    // 队长选举
  | 'teaming'         // 组队
  | 'song_select'     // 选歌
  | 'training'        // 训练
  | 'rehearsal'       // 彩排
  | 'performance'     // 公演
  | 'elimination'     // 淘汰

// 阶段顺序（固定，用于状态计算）
export const STAGE_ORDER: StageType[] = [
  'preparation',
  'captain_vote',
  'teaming',
  'song_select',
  'training',
  'rehearsal',
  'performance',
  'elimination'
]

// 阶段名称映射（用于显示）
export const STAGE_NAMES: Record<StageType, string> = {
  preparation: '预先准备',
  captain_vote: '队长选举',
  teaming: '组队',
  song_select: '选歌',
  training: '训练',
  rehearsal: '彩排',
  performance: '公演',
  elimination: '淘汰'
}

// 阶段状态（动态计算）
export type StageStatus = 'completed' | 'current' | 'future'

// ================== 赛季相关类型 ==================

export interface Season {
  id: string
  name: string
  currentRound: number          // 当前第几公演（1, 2, 3...）
  currentStage: StageType       // 当前阶段
  status: 'pending' | 'running' | 'finished'
  totalRounds?: number          // 总公演次数
  activePlayerCount?: number
  eliminatedPlayerCount?: number
}

// 轮次配置
export interface RoundConfig {
  round: number
  teamCount?: number
  teamSizes?: number[]
  teamNames?: string[]
  songPoolIds?: string[]
  status?: 'pending' | 'active' | 'completed'
}

// ================== 赛程矩阵相关类型 ==================

// 矩阵单元格
export interface MatrixCell {
  round: number
  stage: StageType
  status: StageStatus
}

// 赛程进度响应
export interface SeasonProgressResponse {
  currentRound: number
  currentStage: StageType
  matrix: MatrixCell[]
}

// ================== 用户菜单相关类型 ==================

// 菜单项
export interface MenuItem {
  round: number
  stage: StageType
  status: StageStatus
  path: string
  name: string
}

// ================== 管理员操作相关类型 ==================

// 设置阶段请求
export interface SetStageRequest {
  round: number
  stage: StageType
}

// 推进下一阶段响应
export interface NextStageResponse {
  previousRound: number
  previousStage: StageType
  currentRound: number
  currentStage: StageType
  matrix: MatrixCell[]
}

// ================== 兼容旧代码的映射 ==================

// 旧阶段名称映射（用于兼容旧代码）
export const STAGE_MAP: Record<StageType, string> = STAGE_NAMES

// 旧阶段列表（用于兼容旧代码）
export const STAGE_LIST: StageType[] = STAGE_ORDER

// ================== 重置赛季相关类型 ==================

export interface RoundUpdateParams {
  performanceRound?: number
  eliminationRound?: number
  trainingRound?: number
  drawsPerPlayer?: number
}

export interface RoundUpdateResult {
  success: boolean
  data: {
    performanceRound: number
    eliminationRound: number
    trainingConfig: {
      drawsPerPlayer: number
      currentRound: number
      totalRounds: number
    }
  }
}

export interface ResetSeasonResult {
  resetStats: {
    usersReset: number
    teamsDeleted: number
    invitesDeleted: number
    applicationsDeleted: number
    rehearsalResultsDeleted: number
    performanceResultsDeleted: number
    playerScoresDeleted: number
    logsDeleted: number
    trainingRecordsDeleted: number
    seasonReset: boolean
  }
  message?: string
}

// 公演轮次配置（兼容旧代码）
export interface PerformanceRoundConfig {
  id?: string
  name?: string
  status?: string
  config?: {
    teamCount: number
    maxMembersPerTeam: number
    songPoolIds: string[]
    trainingTimesAllowed: number
    eliminationCount: number
    dangerLineRatio?: number
  }
  createdAt?: string
  startedAt?: string | null
  finishedAt?: string | null
}

// ================== 工具函数 ==================

/**
 * 计算指定阶段的状态
 */
export function calculateStageStatus(
  currentRound: number,
  currentStage: StageType,
  targetRound: number,
  targetStage: StageType
): StageStatus {
  const currentStageIndex = STAGE_ORDER.indexOf(currentStage)
  const targetStageIndex = STAGE_ORDER.indexOf(targetStage)

  if (targetRound < currentRound) {
    return 'completed'
  }

  if (targetRound > currentRound) {
    return 'future'
  }

  if (targetStageIndex < currentStageIndex) {
    return 'completed'
  }

  if (targetStageIndex === currentStageIndex) {
    return 'current'
  }

  return 'future'
}

/**
 * 获取下一个阶段
 */
export function getNextStage(currentStage: StageType): StageType | null {
  const currentIndex = STAGE_ORDER.indexOf(currentStage)
  if (currentIndex < STAGE_ORDER.length - 1) {
    return STAGE_ORDER[currentIndex + 1]
  }
  return null // 淘汰之后进入下一轮预先准备
}

/**
 * 获取阶段名称
 */
export function getStageName(stage: StageType): string {
  return STAGE_NAMES[stage] || stage
}