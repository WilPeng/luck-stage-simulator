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
  | 'bbbb'
  | 'safety_suite'
  | 'sealed_replacement'
  | 'veto_trustee'
  | 'rescue_contract'
  | 'save_vote'
  | 'coup_detat'
  | 'tie_recall'
  | 'battle_back'
  | 'costly_return'
  | 'round_rewind'
  | 'voluntary_nominee'
  | 'nomination_appeal'
  | 'battle_of_block'
  | 'split_house'

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
  battle_of_block: {"id": "battle_of_block", "name": "双房主对抗", "icon": "🏟️", "description": "两名临时 HOH 各提名两人。胜出的提名组安全，提名他们的房主失去权力。另一组进入常规 POV。", "affectsStages": ["hoh_competition", "replacement_nom"], "group": 2},
  split_house: {"id": "split_house", "name": "分屋并行", "icon": "🏘️", "description": "分成两个独立小组，各自进行 HOH、提名、POV 和淘汰投票。两组结算后合屋。", "affectsStages": ["hoh_competition", "eviction"], "group": 2},

  voluntary_nominee: {"id": "voluntary_nominee", "name": "提前挂牌", "icon": "🏷️", "description": "房客可在提名前公开自荐。HOH 选择一名报名者占提名席，并给其一次快速算术 POV 免冷却重试机会。", "affectsStages": ["nomination", "veto_competition"], "group": 2},
  nomination_appeal: {"id": "nomination_appeal", "name": "提名申诉", "icon": "⚖️", "description": "首位申诉的被提名者与 HOH 短赛。申诉者获胜时，快速算术 POV 首次答错可立即重试。", "affectsStages": ["nomination", "veto_competition"], "group": 2},

  round_rewind: {"id": "round_rewind", "name": "整轮回卷", "icon": "⏮️", "description": "投票开启前执行一次回卷。第一轮 HOH、提名和 POV 结果归档，重新争夺房主。", "affectsStages": ["eviction_vote", "hoh_competition"], "group": 2},
  battle_back: {"id": "battle_back", "name": "复活赛", "icon": "🎟️", "description": "本轮 HOH 竞争前确认复活赛结果。一名已淘汰房客回归并恢复参赛资格。", "affectsStages": ["hoh_competition"], "group": 2},
  costly_return: {"id": "costly_return", "name": "代价复活", "icon": "🔓", "description": "陪审团开始前，一名淘汰者回归。回归当轮不可担任 HOH，保留提名和 POV 资格。", "affectsStages": ["hoh_competition"], "group": 2},

  coup_detat: {"id": "coup_detat", "name": "政变权", "icon": "⚡", "description": "管理员公布权力归属后，持有者可在投票开始前撤换一至两名最终提名者。", "affectsStages": ["nomination", "eviction_vote"], "group": 2},
  tie_recall: {"id": "tie_recall", "name": "并列召回", "icon": "🔁", "description": "三名最终提名者投淘汰票。最高票平票时，HOH 保下一名并列者，其余两人重投一次。", "affectsStages": ["nomination", "eviction_vote", "eviction"], "group": 2},

  safety_suite: {"id": "safety_suite", "name": "安全挑战", "icon": "🛡️", "description": "HOH 产生后、正式提名前举行安全挑战。经确认的胜者本轮不能被提名。", "affectsStages": ["nomination", "replacement_nom"], "group": 2},
  sealed_replacement: {"id": "sealed_replacement", "name": "预埋补位", "icon": "🔐", "description": "HOH 在提名前秘密锁定两位有顺序的候补。POV 救人后按顺序采用首位合资格者。", "affectsStages": ["nomination", "replacement_nom"], "group": 2},
  veto_trustee: {"id": "veto_trustee", "name": "护符托管", "icon": "🤝", "description": "POV 胜者可在决定前，把使用或放弃的决定权公开交给一位未被提名的选手。", "affectsStages": ["veto_ceremony"], "group": 2},
  rescue_contract: {"id": "rescue_contract", "name": "救援合约", "icon": "📜", "description": "提名前两人互相确认合约。若一人赢得 POV 并救下搭档，持有者获下轮 POV 参赛席位。", "affectsStages": ["nomination", "veto_competition", "veto_ceremony"], "group": 2},
  save_vote: {"id": "save_vote", "name": "三人保留票", "icon": "🗳️", "description": "三名最终提名者参加投票。房客投票保留一人，其余两人淘汰。", "affectsStages": ["nomination", "eviction_vote", "eviction"], "group": 2},
  bbbb: {
    id: 'bbbb', name: 'BBBB', icon: '🎯', description: '三名提名者比赛，一人安全。', affectsStages: ['nomination', 'bbbb', 'eviction_vote'], group: 1
  },

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
  championVotingOpen?: boolean
  allChatsRevealed?: boolean
  createdAt: string
  updatedAt: string
}

// 季终结算汇总
export interface BBSettlementRound {
  round: number
  kind?: 'normal' | 'final3' | 'champion'
  tied?: boolean
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
  bbbbWinnerId?: string | null
  bbbbWinnerName?: string
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
  walkedRound?: number | null
}

export interface BBSettlement {
  currentRound: number
  totalRounds: number
  final3Round?: number | null
  championRound?: number | null
  seasonStatus: string
  totalPlayers: number
  allChatsRevealed?: boolean
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
  walkedPlayers?: { playerId: string; name: string; walkedRound: number | null }[]
  fhoh: { playerId: string; name: string } | null
  finalTwo: { playerId: string; playerName: string; name?: string }[]
  lastJury: { playerId: string; name: string } | null
  final3Winners: Record<string, { playerId: string; name: string }>
  champion: { playerId: string; name: string } | null
  runnerUp: { playerId: string; name: string } | null
  championVotes: Record<string, number>
  championVotingOpen: boolean
  allChatsRevealed?: boolean
  juryVotes: { juryId: string; juryName: string; voted: boolean; targetId: string | null; targetName: string }[]
  myChampionVote?: { targetId: string; targetName: string } | null
  championReveal?: BBChampionReveal | null
}

export interface BBChampionRevealSegment {
  kind: 'vote' | 'champion'
  juryId?: string
  juryName?: string
  targetId?: string | null
  targetName?: string
  text: string
}

export interface BBChampionReveal {
  championId: string | null
  championName: string
  runnerUpId: string | null
  runnerUpName: string
  juryTotal: number
  half: number
  segments: BBChampionRevealSegment[]
  released: number
}

export interface BBMenuItem {
  twistId?: BBTwistId
  icon?: string
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
  allChatsRevealed?: boolean
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
  allChatsRevealed?: boolean
  stageOrder: BBStageType[]
  stageNameMap: Record<string, string>
  matrix: BBMatrixCell[]
}

export interface BBHouseguest {
  id: string
  name: string
  username: string
  password?: string
  loginCode?: string
  role: 'admin' | 'houseguest'
  isSuperAdmin?: boolean
  status: 'active' | 'evicted' | 'jury' | 'f2' | 'walked'
  walkedAt?: string | null
  walkedRound?: number | null
  walkNote?: string
  permissions?: string[]
  hasLogin: boolean
  isOnline?: boolean
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
  walked: number
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

export interface BBElectionCampaign {
  playerId: string
  playerName: string
  content: string
  submittedAt: string
}

export interface BBNomination {
  ballotMode?: 'save' | 'evict'
  isSecretKeeper?: boolean
  isDirectDemocracy?: boolean
  isTripleOffering?: boolean
  isBbbb?: boolean
  vetoWinnerId?: string
  vetoWinnerName?: string
  id: string
  roundId: string
  nomineeIds: string[]
  nomineeNames: string[]
  hohId: string | null
  hohName: string
  replacementNomineeId: string | null
  replacementNomineeName: string
  vetoUsed: boolean
  campaigns?: BBElectionCampaign[]
  voteStarted?: boolean
  voteStartedAt?: string | null
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
  ceremony?: {
    started: boolean
    openingSpoken: boolean
    closingSpoken: boolean
    messages: { playerId: string; playerName: string; text: string; type?: string; at: string }[]
  } | null
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
  otherVotes?: number | null
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

export type MinigameId = 'click-speed' | 'memory-match' | 'quick-math' | 'balance-bar' | 'dice-duel' | 'power-challenge' | 'klotski' | 'swing-pointer' | 'minority' | 'spot-difference' | 'reaction' | 'sequence-memory' | 'jigsaw' | 'missing-number' | 'abraca' | 'describe-guess' | 'stay-or-fold' | 'catch-mistress' | 'german-heart' | 'number-divination' | 'poison-drink' | 'marble-score' | 'otev' | 'hide-and-go-veto'
export type MinigameCategory = 'reaction' | 'memory' | 'intellect' | 'skill' | 'strategy'

export interface MinigameDef {
  id: MinigameId
  name: string
  icon: string
  description: string
  rules?: string
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

export type MinigameRoomStatus = 'waiting' | 'countdown' | 'playing' | 'paused' | 'finished'

export interface MinigameSpectatorPlayer {
  playerId: string
  playerName: string
  avatar: string | null
  connected: boolean
  score: number | null
  progress: number | null
  max: number | null
  done: boolean
  eliminated: boolean
}

export interface MinigameRoom {
  roomId: string
  gameType: 'hoh' | 'veto' | 'bbbb' | 'finale'
  minigameId: MinigameId
  minigameName?: string
  roundIndex?: number | null
  participants: MinigameParticipant[]
  spectatorState?: MinigameSpectatorPlayer[]
  status: MinigameRoomStatus
  startTime: number | null
  winner: { playerId: string; playerName: string } | null
  targetScore?: number | null
  options?: Record<string, any>
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
  moveDuration?: number
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
  isFull?: boolean
}

export interface BBHohMonitorRoom {
  roomId: string
  roomName: string
  icon: string
  count: number
}

// ===== 自定义游戏类型 =====

export type CustomGameType = 'quiz' | 'score' | 'elim-last' | 'first-pick' | 'duel' | 'survive-tb' | 'score-tb' | 'lives-build' | 'race-score'
export type CustomGameWinCondition = 'first_correct' | 'highest_score' | 'most_correct' | 'all_correct' | 'target_correct' | 'admin_judge'
export type CustomGameQType = 'text' | 'choice' | 'number' | 'judge' | 'match'
export type CustomGameScoringRule = 'correct_only' | 'timed_bonus'
export type CustomGameSubmitMode = 'single' | 'batch'
export type CustomGameWrongFeedback = 'none' | 'count' | 'reveal' | 'all_correct_only'

export interface CustomGameQuestion {
  id: string
  text: string
  qtype?: CustomGameQType
  options: string[]
  correctAnswer: string | number
  points: number
  tb?: boolean
  pairs?: { left: string; right: string }[]
  media?: { url: string; kind: 'audio' | 'video'; name?: string } | null
}

export interface BBCustomGameDef {
  id: string
  name: string
  description: string
  rules?: string
  icon: string
  type: CustomGameType
  questions: CustomGameQuestion[]
  submitMode: CustomGameSubmitMode
  wrongFeedback: CustomGameWrongFeedback
  wrongHint?: 'wrong_only' | 'wrong_count' | 'wrong_detail' | 'wrong_count_detail'
  lockOnWrong: boolean
  advanceOnWrong?: boolean
  targetCorrect: number
  cooldownSeconds: number
  maxAttempts: number
  timeLimit: number
  scoringRule: CustomGameScoringRule
  playerCount: { min: number; max: number }
  winCondition: CustomGameWinCondition
  eliminateRule?: 'last' | 'first_wrong'
  showSubmissions?: boolean
  basicTimeLimit?: number
  tiebreakTimeLimit?: number
  lives?: number
  raceTarget?: number
  racePoints?: number[]
  revealTime?: number
  media?: { url: string; kind: 'audio' | 'video'; name?: string; playMode?: 'once' | 'free' } | null
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface BBGameFolder {
  id: string
  name: string
  games: string[]
  createdAt?: string
}

export interface BBGameLibrary {
  id: string
  gameId?: string
  order: string[]
  folders: BBGameFolder[]
  createdAt?: string
  updatedAt?: string
}

export interface CustomGameBatchQuestion {
  id: string
  text: string
  qtype?: CustomGameQType
  options: string[]
  points: number
  userAnswer: string
  correct: boolean
  locked: boolean
  leftItems?: string[]
  rightItems?: string[]
  media?: { url: string; kind: 'audio' | 'video'; name?: string } | null
}

export interface CustomGamePlayerState {
  gameType: CustomGameType
  winCondition: CustomGameWinCondition
  submitMode: CustomGameSubmitMode
  wrongFeedback: CustomGameWrongFeedback
  currentQuestion: {
    id: string
    text: string
    qtype?: CustomGameQType
    options: string[]
    points: number
    leftItems?: string[]
    rightItems?: string[]
    media?: { url: string; kind: 'audio' | 'video'; name?: string } | null
  } | null
  questions?: CustomGameBatchQuestion[]
  currentIndex: number
  totalQuestions: number
  score: number
  correctCount: number
  attemptsUsed: number
  maxAttempts: number
  cooldownRemaining: number
  startTime: number | null
  finishTime: number | null
  done: boolean
  lastResult: {
    questionId?: string
    userAnswer?: string
    correctAnswer?: string
    correct: boolean
    points?: number
    submitTime?: number
  } | null
  timerEndTime: number | null
  timeLimit: number
  status: string
}

// ===== 实力大挑战题目池类型 =====

export interface PowerChallengeQuestion {
  id: string
  text: string
  options: string[]
  correctAnswer: string
}

export interface PowerChallengePool {
  id: string
  gameId: string
  name: string
  theme: string
  questions: PowerChallengeQuestion[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}
