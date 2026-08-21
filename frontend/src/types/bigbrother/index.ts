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

// ===== Twist 相关类型 =====
export type BBTwistId =
  | 'no_pendant_challenge'
  | 'triple_offering'
  | 'direct_democracy'
  | 'karmic_pawnship'
  | 'condemned'
  | 'serpent_mark'
  | 'secret_keeper'
  | 'boomerang_pendant'

export interface BBTwistDef {
  id: BBTwistId
  name: string
  icon: string
  description: string
  affectsStages: BBStageType[]
  group: number
}

export interface BBTwistRoundConfig {
  round: number
  twists: BBTwistId[]
}

// 完整轮次配置（用于赛季设置页面）
export interface BBRoundConfig {
  round: number
  twists: BBTwistId[]
  eliminationRank: number | null
  isJury: boolean
}

export const BB_TWIST_DEFINITIONS: Record<BBTwistId, BBTwistDef> = {
  no_pendant_challenge: {
    id: 'no_pendant_challenge', name: '无护符挑战', icon: '🚫',
    description: '本轮跳过否决权竞争阶段，无人持有否决权',
    affectsStages: ['veto_competition'], group: 1
  },
  triple_offering: {
    id: 'triple_offering', name: '三重献祭', icon: '🔱',
    description: '提名允许3人，淘汰投票淘汰得票最高的2人',
    affectsStages: ['nomination', 'eviction'], group: 1
  },
  direct_democracy: {
    id: 'direct_democracy', name: '直接民主', icon: '🗳️',
    description: '提名改为全员投票决定（HOH票数双倍）',
    affectsStages: ['nomination'], group: 1
  },
  karmic_pawnship: {
    id: 'karmic_pawnship', name: '因果报应', icon: '⚖️',
    description: '淘汰幸存者自动成为下轮HOH',
    affectsStages: ['eviction', 'hoh_competition'], group: 1
  },
  condemned: {
    id: 'condemned', name: '受罚者', icon: '⛓️',
    description: 'HOH竞争后4人成为受罚者',
    affectsStages: ['hoh_competition', 'veto_competition'], group: 1
  },
  serpent_mark: {
    id: 'serpent_mark', name: '毒蛇标记', icon: '🐍',
    description: '每位玩家被秘密分配目标，目标淘汰则成下轮HOH',
    affectsStages: ['hoh_competition'], group: 1
  },
  secret_keeper: {
    id: 'secret_keeper', name: '匿名房主', icon: '🎭',
    description: 'HOH身份保密，提名不显示HOH姓名',
    affectsStages: ['nomination'], group: 1
  },
  boomerang_pendant: {
    id: 'boomerang_pendant', name: '回旋镖护符', icon: '🪃',
    description: '否决权使用时所有被提名者全救',
    affectsStages: ['veto_ceremony', 'replacement_nom'], group: 1
  }
}

// 获取所有 twist 定义列表
export function getAllTwistDefs(): BBTwistDef[] {
  return Object.values(BB_TWIST_DEFINITIONS)
}

// 获取指定轮次的 twist 列表
export function getTwistsForRound(round: number, configs: BBTwistRoundConfig[]): BBTwistId[] {
  const cfg = configs.find(c => c.round === round)
  return cfg?.twists || []
}

// 检查轮次是否有指定 twist
export function hasTwist(round: number, twistId: BBTwistId, configs: BBTwistRoundConfig[]): boolean {
  return getTwistsForRound(round, configs).includes(twistId)
}

export interface BBSeason {
  id: string
  name: string
  gameId: string
  currentRound: number
  currentStage: BBStageType
  totalRounds: number
  status: string
  houseguestsCount?: number
  twistConfigs?: BBTwistRoundConfig[]
  roundConfigs?: BBRoundConfig[]
  nextHohPlayerId?: string | null
  nextHohPlayerName?: string
  jurySize?: number
  finalSize?: number
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

export interface BBVetoParticipant {
  playerId: string
  playerName: string
  source?: 'drawn' | 'picked'  // drawn=被抽中, picked=被自选
  pickedBy?: string             // 由谁自选（仅 source='picked' 时）
}

export interface BBVetoDrawResult {
  participants: BBVetoParticipant[]
  totalPlayers: number
  drawCount: number
  drawMode: string
  canPick: { playerId: string; playerName: string; role: 'hoh' | 'nominee' }[]
  pickablePlayers: { playerId: string; playerName: string }[]
  hohId: string | null
  nomineeIds: string[]
}

export type BBVetoStatus = 'pending' | 'used' | 'skipped'

export interface BBVetoRecord {
  id: string
  roundId: string
  competitionName: string
  participants: BBVetoParticipant[]
  winnerId: string | null
  winnerName: string
  status: BBVetoStatus
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
  chatType?: 'public' | 'private'
  targetId?: string | null
  targetName?: string | null
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

// ===== 小游戏相关类型 =====

export type MinigameId = 'click-speed' | 'memory-match' | 'quick-math' | 'balance-bar' | 'dice-duel'
export type MinigameCategory = 'reaction' | 'memory' | 'intellect' | 'skill' | 'strategy'

export interface MinigameDef {
  id: MinigameId
  name: string
  icon: string
  description: string
  category: MinigameCategory
  playerCount: { min: number; max: number }
  duration: number
}

export interface MinigameParticipant {
  playerId: string
  playerName: string
  avatar: string | null
  connected: boolean
  score: number
  finished: boolean
}

export type MinigameRoomStatus = 'waiting' | 'countdown' | 'playing' | 'finished'

export interface MinigameRoom {
  roomId: string
  gameType: 'hoh' | 'veto'
  minigameId: MinigameId
  participants: MinigameParticipant[]
  status: MinigameRoomStatus
  startTime: number | null
  winner: { playerId: string; playerName: string } | null
}

export interface MinigameSocketEvents {
  // 服务端 → 客户端
  room_created: (data: { roomId: string; minigameId: MinigameId; participants: MinigameParticipant[] }) => void
  game_countdown: (data: { seconds: number }) => void
  game_started: (data: { startTime: number }) => void
  game_state: (data: any) => void
  game_finished: (data: { winner: { playerId: string; playerName: string }; scores: Record<string, number> }) => void
  game_error: (data: { message: string }) => void

  // 客户端 → 服务端
  join_room: (data: { roomId: string }) => void
  leave_room: (data: { roomId: string }) => void
  game_action: (data: { roomId: string; action: any }) => void
}
