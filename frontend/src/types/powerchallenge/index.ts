export type PCPlayerRole = 'player' | 'admin'
export type PCPlayerStatus = 'active' | 'inactive'

export interface PCPlayer {
  id: string
  name: string
  loginCode: string
  role: PCPlayerRole
  status: PCPlayerStatus
  hasLogin: boolean
  avatar: string | null
  gameId: string
  createdAt: string
  updatedAt: string
}

export interface PCQuestion {
  id: string
  text: string
  options: string[]
  correctAnswer?: string
}

export interface PCPowerChallengeQuestion {
  id: string
  text: string
  options: string[]
  correctAnswer: string
}

export interface PCPowerChallenge {
  id: string
  gameId: string
  name: string
  theme: string
  questions: PCPowerChallengeQuestion[]
  enabled: boolean
  createdAt: string
  updatedAt: string
}

export interface PCSeason {
  id: string
  gameId: string
  name: string
  totalRounds: number
  answerCooldown: number
  status: 'idle' | 'running' | 'finished'
  roundPhase: 'waiting' | 'countdown' | 'answering' | 'ended'
  currentRound: number
  theme: string
  started: boolean
  alivePlayers: { playerId: string; playerName: string }[]
  eliminated: { round: number; playerId: string; playerName: string }[]
  points: Record<string, number>
  champion: { playerId: string; playerName: string } | null
  ranking: PCSeasonRankEntry[]
  releasedQuestions: { id: string; text: string; options: string[] }[]
  participants: { playerId: string; playerName: string }[]
  claims: { questionId: string; playerId: string; playerName: string }[]
  winners: string[]
  eliminatedThisRound: string[]
}

export interface PCSeasonRankEntry {
  rank: number
  playerId: string
  playerName: string
  points: number
  alive: boolean
  eliminatedRound: number | null
}

export interface PCSeasonAdmin extends PCSeason {
  questions: PCQuestion[]
  players: PCPlayer[]
  online: { playerId: string; playerName: string }[]
  createdAt: string
  updatedAt: string
}

export function getPCStageName(phase: string): string {
  const map: Record<string, string> = {
    waiting: '等待开始',
    countdown: '即将开始',
    answering: '答题中',
    ended: '本轮结束'
  }
  return map[phase] || phase
}
