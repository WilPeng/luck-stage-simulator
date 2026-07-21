// Big Brother 阶段定义
export type BBStageType =
  | 'hoh_competition'
  | 'nomination'
  | 'veto_competition'
  | 'veto_ceremony'
  | 'replacement_nom'
  | 'eviction_vote'
  | 'eviction'

export const BB_STAGE_ORDER: BBStageType[] = [
  'hoh_competition',
  'nomination',
  'veto_competition',
  'veto_ceremony',
  'replacement_nom',
  'eviction_vote',
  'eviction'
]

export const BB_STAGE_NAME: Record<BBStageType, string> = {
  hoh_competition: 'HOH竞争',
  nomination: '提名',
  veto_competition: '否决权竞争',
  veto_ceremony: '否决权会议',
  replacement_nom: '替换提名',
  eviction_vote: '淘汰投票',
  eviction: '淘汰结果'
}

export type BBStageStatus = 'completed' | 'current' | 'future'

export interface BBSeason {
  id: string
  name: string
  gameId: string
  currentRound: number
  currentStage: BBStageType
  totalRounds: number
  status: string
  houseguestsCount?: number
  createdAt: string
  updatedAt: string
}

export interface BBMenuItem {
  round: number
  stage: BBStageType
  stageName: string
  status: BBStageStatus
  clickable: boolean
  editable: boolean
}

export interface BBMenuData {
  currentRound: number
  currentStage: BBStageType
  currentStageName: string
  currentStageIndex: number
  totalRounds: number
  isAdmin: boolean
  menu: BBMenuItem[]
}

export interface BBMatrixCell {
  round: number
  stage: BBStageType
  stageName: string
  status: BBStageStatus
}

export interface BBSeasonProgress {
  currentRound: number
  currentStage: BBStageType
  currentStageName: string
  totalRounds: number
  stageOrder: BBStageType[]
  stageNameMap: Record<string, string>
  matrix: BBMatrixCell[]
}

export interface BBHouseguest {
  id: string
  name: string
  loginCode: string
  role: 'admin' | 'houseguest'
  status: 'active' | 'evicted' | 'jury'
  hasLogin: boolean
  avatar: string | null
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface BBHouseguestListResponse {
  list: BBHouseguest[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface BBHouseguestStats {
  total: number
  active: number
  evicted: number
  jury: number
}

export interface BBHohRecord {
  id: string
  roundId: string
  winnerId: string
  winnerName: string
  competitionType: string
  competitionName: string
  participants: { playerId: string; playerName: string; rank: number }[]
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface BBNomination {
  id: string
  roundId: string
  nomineeIds: string[]
  nomineeNames: string[]
  hohId: string | null
  hohName: string
  replacementNomineeId: string | null
  replacementNomineeName: string
  vetoUsed: boolean
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface BBVetoRecord {
  id: string
  roundId: string
  competitionName: string
  participants: { playerId: string; playerName: string; rank: number }[]
  winnerId: string | null
  winnerName: string
  used: boolean
  usedOnPlayerId: string | null
  usedOnPlayerName: string
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface BBEvictionVote {
  id: string
  roundId: string
  voterId: string
  voterName: string
  targetId: string
  targetName: string
  gameId: string
  createdAt: string
}

export interface BBEviction {
  id: string
  roundId: string
  evictedId: string
  evictedName: string
  voteCount: number
  totalVotes: number
  voteResults: { playerId: string; playerName: string; votes: number }[]
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface BBChatMessage {
  id: string
  senderId: string
  senderName: string
  senderRole: string
  senderAvatar: string | null
  content: string
  gameId: string
  createdAt: string
}

export interface BBVoteResult {
  votes: BBEvictionVote[]
  total: number
}

// 阶段状态计算工具
export function calculateBBStageStatus(
  currentRound: number,
  currentStage: BBStageType,
  targetRound: number,
  targetStage: BBStageType
): BBStageStatus {
  if (targetRound < currentRound) return 'completed'
  if (targetRound > currentRound) return 'future'
  const curIdx = BB_STAGE_ORDER.indexOf(currentStage)
  const tgtIdx = BB_STAGE_ORDER.indexOf(targetStage)
  if (tgtIdx < curIdx) return 'completed'
  if (tgtIdx === curIdx) return 'current'
  return 'future'
}

export function getBBStageName(stage: BBStageType): string {
  return BB_STAGE_NAME[stage] || stage
}

export function getNextBBStage(stage: BBStageType): BBStageType | null {
  const idx = BB_STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= BB_STAGE_ORDER.length - 1) return null
  return BB_STAGE_ORDER[idx + 1]
}
