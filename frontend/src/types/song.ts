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

export interface SongStats {
  totalSongs: number
  totalTeams: number
  teamsWithSong: number
  teamsWithoutSong: number
  songUsage: SongUsageEntry[]
  unassignedTeams: { id: string; name: string }[]
}

export interface SongUsageEntry {
  songId: string
  songName: string
  teamCount: number
  teams: { id: string; name: string }[]
}

export interface SongAssignment {
  id: string
  round: number
  songId: string
  songType: string
  teamId: string | null
  userIds: string[]
  song: Song
  users: { userId: string; name: string }[]
}

// 轮次歌曲（本轮公演使用的歌曲）
export interface RoundSong {
  id: string
  round: number
  songId: string
  songType: 'team_show' | 'team_collab' | 'captain_show' | 'pk_show'
  scoringMethod?: 'actual' | 'fixed' | 'ranked' // 给分方式：actual=按实际得分, fixed=固定分数, ranked=按排名
  song: Song
  createdAt: string
}

// 添加轮次歌曲请求
export interface AddRoundSongRequest {
  round: number
  songId: string
  songType: 'team_show' | 'team_collab' | 'captain_show' | 'pk_show'
  scoringMethod?: 'actual' | 'fixed' | 'ranked'
}

// 更新给分方式请求
export interface UpdateScoringMethodRequest {
  scoringMethod: 'actual' | 'fixed' | 'ranked'
}
