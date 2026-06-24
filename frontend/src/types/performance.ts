// 舞台事件
export interface StageEvent {
  id: string
  name: string
  voteEffect: number
  description: string
}

// 队伍公演结果（新结构）
export interface TeamPerformanceResult {
  roundId: string
  teamId: string
  teamName: string
  songId: string
  songName: string
  memberCount: number
  baseVotes: number
  attributeVotes: number
  performanceVotes: number
  compatibilityVotes: number
  eventVotes: number
  finalVotes: number
  rank: number
  status: 'pending' | 'calculated' | 'confirmed'
  teamScore: number              // 团队综合得分
  teamRating: string             // S/A/B/C/D
  teamRatingText: string         // 评级描述
  // 详细信息
  songWeights?: {
    vocal: number
    dance: number
    charm: number
  }
  teamAttributes?: {
    vocal: number
    dance: number
    charm: number
  }
  compatibilityScore?: number
  stageEvent?: StageEvent
  playerPerformances?: PlayerPerformanceResult[]
}

// 选手公演结果（新结构）
export interface PlayerPerformanceResult {
  roundId: string
  playerId: string
  playerName: string
  teamId: string
  teamName: string
  performanceValue: number       // 随机发挥值 (-5~15)
  contribution: number           // 贡献票数
  rankInTeam: number             // 队内排名
  playerScore: number            // 选手个人最终得分 (0~120)
  stageRating: string            // S/A/B/C/D
  stageRatingText: string        // 评级描述文字
  performanceText?: string
}

// 公演结算请求
export interface CalculatePerformanceRequest {
  roundId: string
}

// 公演结算响应
export interface CalculatePerformanceResponse {
  success: boolean
  teamResults: TeamPerformanceResult[]
  playerResults: PlayerPerformanceResult[]
  rankings: {
    teamRankings: TeamPerformanceResult[]
    playerRankings: PlayerPerformanceResult[]
  }
}

// 队伍结算结果（旧结构，保留兼容）
export interface TeamResult {
  id: string
  teamId: string
  teamName: string
  songId: string
  songName: string
  teamVocal: number
  teamDance: number
  teamCharm: number
  memberCount?: number
  avgVocal?: number
  avgDance?: number
  avgCharm?: number
  attrScore: number
  randomScore: number
  rehearsalBonus?: number
  teamRankBonus?: number
  finalScore: number
  rank: number
  round?: number
  dangerTeam?: boolean
}

export interface CalculatePerformanceResult {
  round: number
  teamResults: TeamResult[]
  playerResults: PlayerResult[]
  teamCount: number
  playerCount: number
  dangerTeams: { teamId: string; teamName: string; rank: number }[]
}

// 选手结算结果（旧结构，保留兼容）
export interface PlayerResult {
  id: string
  userId: string
  userName: string
  teamId: string
  teamName: string
  vocalScore: number
  danceScore: number
  charmScore: number
  randomScore: number
  teamBonus: number
  finalScore: number
  rank: number
  round?: number
}

// 公演配置
export interface PerformanceConfig {
  baseScore: number
  scoreMultiplier: number
  teamRandomMin: number
  teamRandomMax: number
  playerRandomMin: number
  playerRandomMax: number
  teamRankBonusBase: number
  teamRankBonusMultiplier: number
}

// 公演统计
export interface PerformanceStats {
  totalTeams: number
  totalPlayers: number
  avgTeamScore: number
  avgPlayerScore: number
  highestTeam: {
    teamId: string
    teamName: string
    finalScore: number
    rank: number
  }
  lowestTeam: {
    teamId: string
    teamName: string
    finalScore: number
    rank: number
  }
  highestPlayer: {
    userId: string
    userName: string
    finalScore: number
    rank: number
  }
  lowestPlayer: {
    userId: string
    userName: string
    finalScore: number
    rank: number
  }
}

// 历史公演记录
export interface PerformanceHistory {
  round: number
  teams: {
    teamId: string
    teamName: string
    finalScore: number
    rank: number
  }[]
  totalTeams: number
}

// 预览结果
export interface PreviewResult {
  teamResults: TeamResult[]
  playerResults: PlayerResult[]
  summary: {
    totalTeams: number
    totalPlayers: number
    avgTeamScore: number
  }
}

// 公演结算结果（兼容旧接口）
export interface PerformanceResult {
  id: string
  teamId: string
  songId: string
  teamVocal: number
  teamDance: number
  teamCharm: number
  attrScore: number
  randomScore: number
  rehearsalBonus?: number
  finalScore: number
  rank: number
}

// 选手得分（兼容旧接口）
export interface PlayerScore {
  id: string
  userId: string
  teamId: string
  vocalScore: number
  danceScore: number
  charmScore: number
  randomScore: number
  teamBonus: number
  finalScore: number
  rank: number
}

// 彩排结果
export interface RehearsalResult {
  id: string
  teamId: string
  eventName: string
  description: string
  bonus: {
    vocal?: number
    dance?: number
    charm?: number
  }
  createdAt: string
}

// 安全团标记
export interface SafeTeamMark {
  id: string
  round: number
  teamId: string
  teamName: string
  markedAt: string
}

export interface SafeTeamMarkRequest {
  round: number
  teamIds: string[]
}

// ================== 大众评审喜爱度投票 ==================

// 评审投票会话
export interface AudienceVoteSession {
  id: string
  roundId: string
  createdAt: string
}

// 大众评审成员
export interface AudienceMember {
  id: string
  roundId: string
  seatNumber: number
}

// 评审投票记录
export interface AudienceVote {
  id: string
  roundId: string
  audienceId: string
  seatNumber: number
  voteOrder: number // 1, 2, 3
  playerId: string
  playerName?: string
}

// 选手喜爱度权重
export interface PlayerPopularityWeight {
  playerId: string
  playerName: string
  teamId: string
  teamName: string
  baseContribution: number
  performanceContribution: number
  teamRankBonus: number
  mvpBonus: number
  audienceLuck: number
  totalWeight: number
}

// 喜爱度排行榜条目
export interface AudienceVoteRankingItem {
  playerId: string
  playerName: string
  teamId: string
  teamName: string
  votes: number
  rank: number
  totalWeight?: number
}

// 评审座位信息（带投票状态）
export interface AudienceSeat {
  id: string
  seatNumber: number
  voted: boolean
  votes?: string[] // 投票的选手名称列表
}

// 某评审的投票详情
export interface AudienceVoteDetail {
  seatNumber: number
  votes: {
    voteOrder: number
    playerId: string
    playerName: string
  }[]
}

// 生成喜爱度投票请求
export interface GenerateAudienceVoteRequest {
  roundId: string
}

// 生成喜爱度投票响应
export interface GenerateAudienceVoteResponse {
  success: boolean
  sessionId: string
  totalAudience: number
  totalVotes: number
  rankings: AudienceVoteRankingItem[]
  weights: PlayerPopularityWeight[]
}

// 喜爱度排行榜响应
export interface AudienceVoteRankingResponse {
  success: boolean
  totalVotes: number
  totalAudience: number
  rankings: AudienceVoteRankingItem[]
  weights: PlayerPopularityWeight[]
}

// 评审席响应
export interface AudienceSeatsResponse {
  success: boolean
  totalSeats: number
  seats: AudienceSeat[]
}

// 评审投票详情响应
export interface AudienceVoteDetailResponse {
  success: boolean
  detail: AudienceVoteDetail
}
