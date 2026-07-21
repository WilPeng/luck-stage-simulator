// 恋综阶段定义
export type LVStageType =
  | 'love_vote'
  | 'pairing'
  | 'elimination'

export const LV_STAGE_ORDER: LVStageType[] = [
  'love_vote',
  'pairing',
  'elimination'
]

export const LV_STAGE_NAME: Record<LVStageType, string> = {
  love_vote: '喜爱值投送',
  pairing: '配对结算',
  elimination: '淘汰'
}

export type LVStageStatus = 'completed' | 'current' | 'future'

export interface LVSeason {
  id: string
  name: string
  gameId: string
  currentRound: number
  currentStage: LVStageType
  totalRounds: number
  status: string
  playerCount?: number
  createdAt: string
  updatedAt: string
}

export interface LVMenuItem {
  round: number
  stage: LVStageType
  stageName: string
  status: LVStageStatus
  clickable: boolean
  editable: boolean
}

export interface LVMenuData {
  currentRound: number
  currentStage: LVStageType
  currentStageName: string
  currentStageIndex: number
  totalRounds: number
  isAdmin: boolean
  menu: LVMenuItem[]
}

export interface LVMatrixCell {
  round: number
  stage: LVStageType
  stageName: string
  status: LVStageStatus
}

export interface LVSeasonProgress {
  currentRound: number
  currentStage: LVStageType
  currentStageName: string
  totalRounds: number
  stageOrder: LVStageType[]
  stageNameMap: Record<string, string>
  matrix: LVMatrixCell[]
}

export interface LVPlayer {
  id: string
  name: string
  loginCode: string
  role: 'admin' | 'player'
  status: 'active' | 'eliminated'
  hasLogin: boolean
  avatar: string | null
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface LVPlayerListResponse {
  list: LVPlayer[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface LVPlayerStats {
  total: number
  active: number
  eliminated: number
}

export interface LVLoveVote {
  id: string
  roundId: string
  voterId: string
  voterName: string
  targetId: string
  targetName: string
  value: number
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface LVPairItem {
  player1Id: string
  player1Name: string
  player2Id: string
  player2Name: string
  mutualValue: number
  p1toP2: number
  p2toP1: number
}

export interface LVPairingResult {
  id: string
  roundId: string
  pairs: LVPairItem[]
  singlePlayerId: string | null
  singlePlayerName: string
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface LVElimination {
  id: string
  roundId: string
  eliminatedId: string
  eliminatedName: string
  gameId: string
  createdAt: string
  updatedAt: string
}

// 阶段状态计算工具
export function calculateLVStageStatus(
  currentRound: number,
  currentStage: LVStageType,
  targetRound: number,
  targetStage: LVStageType
): LVStageStatus {
  if (targetRound < currentRound) return 'completed'
  if (targetRound > currentRound) return 'future'
  const curIdx = LV_STAGE_ORDER.indexOf(currentStage)
  const tgtIdx = LV_STAGE_ORDER.indexOf(targetStage)
  if (tgtIdx < curIdx) return 'completed'
  if (tgtIdx === curIdx) return 'current'
  return 'future'
}

export function getLVStageName(stage: LVStageType): string {
  return LV_STAGE_NAME[stage] || stage
}

export function getNextLVStage(stage: LVStageType): LVStageType | null {
  const idx = LV_STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= LV_STAGE_ORDER.length - 1) return null
  return LV_STAGE_ORDER[idx + 1]
}
