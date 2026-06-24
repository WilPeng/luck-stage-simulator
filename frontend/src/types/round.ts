// 轮次类型
export interface Round {
  id: string
  index: number // 第几公（1 = 一公，2 = 二公）
  seasonId: string
  stage: string // 当前阶段
}

// 轮次队伍（RoundTeam）- 取代旧的 Team
export interface RoundTeam {
  id: string
  roundId: string
  roundIndex: number
  name: string
  captainId?: string | null
  maxMembers: number
  locked: boolean
  members?: RoundTeamMember[]
}

// 轮次队伍成员（RoundTeamMember）
export interface RoundTeamMember {
  id: string
  roundId: string
  teamId: string
  playerId: string
  player?: {
    id: string
    name: string
    avatar?: string | null
    attributes: {
      vocal: number
      dance: number
      charm: number
    }
  }
}

// 轮次歌曲（RoundSong）- 本轮可选的歌曲清单
export interface RoundSong {
  id: string
  roundId: string
  songId: string
  songType: 'team_show' | 'team_collab' | 'captain_show' | 'pk_show'
  scoringMethod?: 'actual' | 'fixed' | 'ranked'
  song?: Song
  assignedTeamId?: string | null // 已被哪队选走
}

// 队伍歌曲（TeamSong）- 某队正式选了哪首歌
export interface TeamSong {
  id: string
  roundId: string
  teamId: string
  songId: string
  assignedBy?: string
  song?: Song
  team?: RoundTeam
}

// 歌曲库中的歌曲（永久存在）
export interface Song {
  id: string
  name: string
  type: 'team_show' | 'team_collab' | 'captain_show' | 'pk_show'
  style: string
  difficulty: number
  vocalWeight: number
  danceWeight: number
  charmWeight: number
  baseScore: number
  riskFactor: number
  availableRounds?: number[]
  enabled?: boolean
  description?: string
}

// 选手公演得分（PlayerPerformance）
export interface PlayerPerformance {
  id: string
  roundId: string
  playerId: string
  teamId: string
  finalScore: number
  rank: number
  player?: {
    id: string
    name: string
    avatar?: string | null
  }
}

// 团队公演得分（TeamPerformance）
export interface TeamPerformance {
  id: string
  roundId: string
  teamId: string
  teamName: string
  finalScore: number
  rank: number
}

// 淘汰记录（Elimination）
export interface Elimination {
  id: string
  roundId: string
  playerId: string
  userName: string
  teamName: string
  finalScore: number
  rank: number
  reason: string
  eliminated: boolean
}

// 淘汰候选人
export interface EliminationCandidate {
  playerId: string
  name: string
  teamId: string
  teamName: string
  personalScore: number
  personalRank: number
  teamScore: number
  teamRank: number
}

// 训练记录
export interface TrainingRecord {
  id: string
  roundId: string
  playerId: string
  cardId: string
  cardName: string
  effect: {
    vocal?: number
    dance?: number
    charm?: number
  }
  createdAt: string
}

// 彩排结果
export interface RehearsalResult {
  id: string
  roundId: string
  teamId: string
  bonus: number
  createdAt: string
}

// 队伍邀请（按轮次）
export interface TeamInvite {
  id: string
  roundId: string
  teamId: string
  targetUserId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}

// 队伍申请（按轮次）
export interface TeamApplication {
  id: string
  roundId: string
  teamId: string
  userId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}
