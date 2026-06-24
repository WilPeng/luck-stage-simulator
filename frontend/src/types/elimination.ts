/**
 * 淘汰管理模块类型定义（根据完整后端接口文档）
 */

// 淘汰配置
export interface EliminationConfig {
  note?: string
}

// 淘汰统计
export interface EliminationStats {
  totalPlayers: number
  eliminatedCount: number
  activeCount: number
  eliminationRate: number
  currentRound: number
  eliminatedList: EliminationRecord[]
}

// 淘汰记录
export interface EliminationRecord {
  id: string
  userId: string
  userName: string
  teamName?: string
  round: number
  rank: number | null
  finalScore: number | null
  reason: string
  eliminated: boolean
  eliminatedAt: string
}

// 排名条目
export interface RankingEntry {
  rank: number
  userId: string
  name: string
  teamId: string | null
  teamName: string | null
  finalScore: number | null
  status: 'safe' | 'danger' | 'eliminated'
  isDanger: boolean
}

// 排名列表响应
export interface RankingListResponse {
  rankings: RankingEntry[]
}

// 可淘汰候选选手
export interface EliminationCandidate {
  userId: string
  userName: string
  teamName: string | null
  teamId: string | null
  teamShowScore: number | null
  personalScore: number | null
  rank: number | null
}

export interface ManualEliminateParams {
  userIds: string[]
  reason?: string
  round: number
}

// 手动批量淘汰结果
export interface ManualEliminateResult {
  round: number
  eliminatedList: {
    userId: string
    userName: string
    rank: number | null
    finalScore: number | null
  }[]
  eliminatedCount: number
  failedList: {
    userId: string
    userName: string
    reason: string
  }[]
  failedCount: number
}

// 恢复选手结果
export interface RestoreResult {
  userId: string
  name: string
  status: 'active'
}
