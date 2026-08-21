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

// ================== 危险名单与 PK 淘汰 ==================

// 危险队列条目
export interface DangerQueueEntry {
  playerId: string
  playerName: string
  teamId: string | null
  teamName: string | null
  popularityVotes: number
  popularityRank: number
}

// 危险名单状态
export interface DangerStatus {
  roundIndex: number
  confirmed: boolean
  playerIds: string[]
  queue: DangerQueueEntry[]
  pendingPk?: EliminationPk | null
}

// PK 选手（含属性权重/票数/裁定）
export interface PkPlayer {
  playerId: string
  playerName: string
  teamId: string | null
  teamName: string | null
  weight: number
  votes: number
  decision: 'safe' | 'pending' | 'eliminated' | null
}

// PK 记录
export interface EliminationPk {
  id: string
  roundId: string
  roundIndex: number
  pkIndex: number
  attribute: 'vocal' | 'dance' | 'charm'
  challengerId: string
  players: PkPlayer[]
  queueBefore: DangerQueueEntry[]
  queueAfter: DangerQueueEntry[]
  status: 'voting' | 'resolved'
  createdAt: string
  updatedAt: string
}

// 确认危险名单参数
export interface ConfirmDangerParams {
  round: number
  playerIds: string[]
}

// PK 发起参数
export interface StartPkParams {
  round: number
  challengerId: string
  opponentIds: string[]
  attribute: 'vocal' | 'dance' | 'charm'
}

// PK 裁定结果
export interface ResolvePkResult {
  pk: EliminationPk
  queue: DangerQueueEntry[]
  eliminatedList: { userId: string; userName: string }[]
  eliminatedCount: number
}
