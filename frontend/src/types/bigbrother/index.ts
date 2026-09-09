// Big Brother 阶段定义
export type BBStageType =
  | 'hoh_competition'
  | 'nomination'
  | 'veto_competition'
  | 'veto_ceremony'
  | 'replacement_nom'
  | 'eviction_vote'
  | 'eviction'

// 终局特殊阶段（独立周状态，不占 7 阶段列）
export type BBEndgameStageType = 'final3' | 'champion_vote'
export type BBAllStageType = BBStageType | BBEndgameStageType

export const BB_STAGE_ORDER: BBStageType[] = [
  'hoh_competition',
  'nomination',
  'veto_competition',
  'veto_ceremony',
  'replacement_nom',
  'eviction_vote',
  'eviction'
]

export const BB_ENDGAME_STAGES: BBEndgameStageType[] = ['final3', 'champion_vote']

export const BB_STAGE_NAME: Record<BBStageType | BBEndgameStageType, string> = {
  hoh_competition: 'HOH竞争',
  nomination: '提名',
  veto_competition: '否决权竞争',
  veto_ceremony: '否决权会议',
  replacement_nom: '替换提名',
  eviction_vote: '淘汰投票',
  eviction: '淘汰结果',
  final3: 'F3终局',
  champion_vote: '冠军投票'
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
  currentStage: BBAllStageType
  totalRounds: number
  status: string
  houseguestsCount?: number
  twistConfigs?: BBTwistRoundConfig[]
  roundConfigs?: BBRoundConfig[]
  nextHohPlayerId?: string | null
  nextHohPlayerName?: string
  jurySize?: number
  finalSize?: number
  final3Round?: number | null
  championRound?: number | null
  fhohId?: string | null
  fhohName?: string
  finalTwo?: { playerId: string; playerName: string }[]
  lastJuryId?: string | null
  lastJuryName?: string
  final3Winners?: Record<string, { playerId: string; name: string }>
  championId?: string | null
  championName?: string
  runnerUpId?: string | null
  runnerUpName?: string
  createdAt: string
  updatedAt: string
}

// 季终结算汇总
export interface BBSettlementRound {
  round: number
  kind?: 'normal' | 'final3' | 'champion'
  f3RoundWinners?: { round: number; playerId: string | null; name: string }[]
  fhohId?: string | null
  fhohName?: string
  finalTwo?: { playerId: string; playerName: string; name?: string }[]
  eliminated?: { id: string; name: string } | null
  champion?: { playerId: string; name: string } | null
  runnerUp?: { playerId: string; name: string } | null
  juryVotes?: { juryId: string; juryName: string; voted: boolean; targetId: string | null; targetName: string }[]
  hohId: string | null
  hohName: string
  initialNomineeIds: string[]
  initialNomineeNames: string[]
  povId: string | null
  povName: string
  povUsed: boolean
  povUsedOnName: string
  povUsedOnId: string | null
  finalNomineeIds: string[]
  finalNomineeNames: string[]
  replacementName: string
  vetoUsed: boolean
  ticketText: string
  evicted: { id: string; name: string; votes: number }[]
  hohDecided: boolean
  hohVoteTargetId: string | null
  hohVoteTargetName: string
  votesDetail: { voterId: string; voterName: string; targetName: string; targetId: string }[]
}

export interface BBSettlementPlayer {
  playerId: string
  name: string
  avatar: string | null
  status: string
  rank: number
  evictedRound: number | null
}

export interface BBSettlement {
  currentRound: number
  totalRounds: number
  final3Round?: number | null
  championRound?: number | null
  seasonStatus: string
  totalPlayers: number
  endgame?: {
    final3Round?: number | null
    championRound?: number | null
    fhoh?: { playerId: string; name: string } | null
    finalTwo?: { playerId: string; playerName: string }[]
    lastJury?: { playerId: string; name: string } | null
    final3Winners?: Record<string, { playerId: string; name: string }>
    champion?: { playerId: string; name: string } | null
    runnerUp?: { playerId: string; name: string } | null
  }
  rounds: BBSettlementRound[]
  players: BBSettlementPlayer[]
}

// 终局进度（F3 / 冠军投票）
export interface BBEndgameStatus {
  currentRound: number
  currentStage: BBAllStageType
  status: string
  final3Round: number | null
  championRound: number | null
  totalRounds: number
  activePlayers: { playerId: string; name: string }[]
  juryPlayers: { playerId: string; name: string }[]
  evictedPlayers: { playerId: string; name: string }[]
  fhoh: { playerId: string; name: string } | null
  finalTwo: { playerId: string; playerName: string; name?: string }[]
  lastJury: { playerId: string; name: string } | null
  final3Winners: Record<string, { playerId: string; name: string }>
  champion: { playerId: string; name: string } | null
  runnerUp: { playerId: string; name: string } | null
  championVotes: Record<string, number>
  juryVotes: { juryId: string; juryName: string; voted: boolean; targetId: string | null; targetName: string }[]
  myChampionVote?: { targetId: string; targetName: string } | null
}

export interface BBMenuItem {
  round: number
  stage: BBStageType | BBEndgameStageType
  stageName: string
  status: BBStageStatus
  clickable: boolean
  editable: boolean
}


export interface BBMenuData {
  currentRound: number
  currentStage: BBAllStageType
  currentStageName: string
  currentStageIndex: number
  totalRounds: number
  final3Round?: number | null
  championRound?: number | null
  isAdmin: boolean
  menu: BBMenuItem[]
}

export interface BBMatrixCell {
  round: number
  stage: BBStageType | BBEndgameStageType
  stageName: string
  status: BBStageStatus
}

export interface BBSeasonProgress {
  currentRound: number
  currentStage: BBAllStageType
  currentStageName: string
  totalRounds: number
  final3Round?: number | null
  championRound?: number | null
  stageOrder: BBStageType[]
  stageNameMap: Record<string, string>
  matrix: BBMatrixCell[]
}

export interface BBHouseguest {
  id: string
  name: string
  loginCode: string
  role: 'admin' | 'houseguest'
  status: 'active' | 'evicted' | 'jury' | 'f2'
  hasLogin: boolean
  avatar: string | null
  isHaveNot?: boolean
  currentRoomId?: string
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
  avatar?: string | null
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

export function getBBStageName(stage: BBStageType | BBEndgameStageType | string): string {
  return BB_STAGE_NAME[stage as BBStageType] || stage
}

export function getNextBBStage(stage: BBStageType): BBStageType | null {
  const idx = BB_STAGE_ORDER.indexOf(stage)
  if (idx < 0 || idx >= BB_STAGE_ORDER.length - 1) return null
  return BB_STAGE_ORDER[idx + 1]
}

// 终局行状态：仅按轮次先后判断
export function getEndgameStatus(currentRound: number, currentStage: BBAllStageType, targetRound: number, targetStage: BBEndgameStageType): BBStageStatus {
  if (targetRound < currentRound) return 'completed'
  if (targetRound > currentRound) return 'future'
  if (currentStage === targetStage) return 'current'
  return 'completed'
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
  targetScore?: number | null
}

// 单个玩家的实时进度
export interface MinigamePlayerState {
  score: number
  progress?: number
  max?: number
  done?: boolean
  label?: string
}

// 房间实时进度（管理员观察）
export interface MinigameProgress {
  roomId: string
  gameType: 'hoh' | 'veto'
  minigameId: MinigameId
  status: MinigameRoomStatus
  targetScore: number | null
  winner: { playerId: string; playerName: string } | null
  participants: MinigameParticipant[]
  states: Record<string, MinigamePlayerState>
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

// ===== BB House 类型 =====

export type HouseRoomType = 'common' | 'lodging' | 'special' | 'outdoor' | 'hidden'
export type HouseAccessRule = 'public' | 'hoh_only' | 'hoh_or_invited' | 'have_not_only' | 'single'

export interface BBHouseRoomDef {
  id: string
  name: string
  nameEn: string
  icon: string
  type: HouseRoomType
  capacity: number | null
  accessRule: HouseAccessRule
  gameId: string
}

export interface BBHouseRoomWithCount extends BBHouseRoomDef {
  currentCount: number | null
}

export interface BBHousePassageDef {
  id: string
  from: string
  to: string
  type: 'normal' | 'door'
  doorId: string | null
  gameId: string
}

export interface BBHouseDoorDef {
  id: string
  name: string
  from: string
  to: string
  isOpen: boolean
  gameId: string
}

export interface BBHouseMap {
  rooms: BBHouseRoomDef[]
  passages: BBHousePassageDef[]
  doors: BBHouseDoorDef[]
  backyardDoorOpen: boolean
}

export interface BBPlayerLocationData {
  playerId: string
  playerName: string
  currentRoomId: string
  enteredAt: string
}

export interface BBHouseRoomDetail {
  room: BBHouseRoomDef
  count: number
  players: BBPlayerLocationData[] | null
}

export interface BBReachableRoom extends BBHouseRoomDef {
  canEnter: boolean
  denyReason: string
}

export interface BBHohMonitorRoom {
  roomId: string
  roomName: string
  icon: string
  count: number
}

// ===== 自定义游戏类型 =====

export type CustomGameType = 'quiz' | 'score'
export type CustomGameWinCondition = 'first_correct' | 'highest_score' | 'most_correct'
export type CustomGameScoringRule = 'correct_only' | 'timed_bonus'

export interface CustomGameQuestion {
  id: string
  text: string
  options: string[]
  correctAnswer: string
  points: number
}

export interface BBCustomGameDef {
  id: string
  name: string
  description: string
  icon: string
  type: CustomGameType
  questions: CustomGameQuestion[]
  cooldownSeconds: number
  maxAttempts: number
  timeLimit: number
  scoringRule: CustomGameScoringRule
  playerCount: { min: number; max: number }
  winCondition: CustomGameWinCondition
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface CustomGamePlayerState {
  gameType: CustomGameType
  currentQuestion: {
    id: string
    text: string
    options: string[]
    points: number
  } | null
  currentIndex: number
  totalQuestions: number
  score: number
  correctCount: number
  cooldownRemaining: number
  startTime: number | null
  finishTime: number | null
  lastResult: {
    questionId: string
    userAnswer: string
    correctAnswer: string
    correct: boolean
    points: number
    submitTime: number
  } | null
  timerEndTime: number | null
  timeLimit: number
  status: string
}
