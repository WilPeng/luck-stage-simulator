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
  colors?: Record<string, string>
  pendingPk?: EliminationPk | null
}

// PK 选手（含属性权重/票数/裁定）
export interface PkPlayer {
  playerId: string
  playerName: string
  teamId: string | null
  teamName: string | null
  weight?: number
  votes: number | null
  decision: 'safe' | 'pending' | 'eliminated' | null
}

// PK 评审投票明细
export interface PkVoteDetail {
  seatNumber: number
  audienceName: string
  gender?: string | null
  age?: number | null
  occupation?: string | null
  playerId: string
}

// PK 记录
export interface EliminationPk {
  id: string
  roundId: string
  roundIndex: number
  pkIndex: number
  attribute: 'vocal' | 'dance' | 'charm' | null
  challengerId: string
  proposerId?: string | null
  players: PkPlayer[]
  voteDetails?: PkVoteDetail[]
  queueBefore: DangerQueueEntry[]
  queueAfter: DangerQueueEntry[]
  status: 'proposed' | 'voting' | 'resolved'
  createdAt: string
  updatedAt: string
}

// 确认危险名单参数
export interface ConfirmDangerParams {
  round: number
  playerIds: string[]
}

// 选手提交 PK 申请参数（不选属性）
export interface ProposePkParams {
  round: number
  challengerId: string
  opponentIds: string[]
}

// PK 发起参数（管理员：从申请发起或直接发起，选属性）
export interface StartPkParams {
  round: number
  pkId?: string
  challengerId?: string
  opponentIds?: string[]
  attribute: 'vocal' | 'dance' | 'charm'
}

// PK 裁定结果
export interface ResolvePkResult {
  pk: EliminationPk
  queue: DangerQueueEntry[]
  eliminatedList: { userId: string; userName: string }[]
  eliminatedCount: number
}
