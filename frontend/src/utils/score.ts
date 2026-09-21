import type { Team, User, Song } from '../types'

export function calculateTeamAverage(team: Team, users: User[]): { vocal: number; dance: number; charm: number } {
  const members = users.filter(u => team.memberIds.includes(u.id))
  if (members.length === 0) {
    return { vocal: 0, dance: 0, charm: 0 }
  }
  
  const sumVocal = members.reduce((sum, u) => sum + u.attributes.vocal, 0)
  const sumDance = members.reduce((sum, u) => sum + u.attributes.dance, 0)
  const sumCharm = members.reduce((sum, u) => sum + u.attributes.charm, 0)
  
  return {
    vocal: Math.round(sumVocal / members.length),
    dance: Math.round(sumDance / members.length),
    charm: Math.round(sumCharm / members.length)
  }
}

export function calculateSongAttrScore(teamAverage: { vocal: number; dance: number; charm: number }, song: Song): number {
  const s = song as any
  return teamAverage.vocal * (s.vocalWeight ?? 3) +
         teamAverage.dance * (s.danceWeight ?? 3) +
         teamAverage.charm * (s.charmWeight ?? 3)
}

export function calculateTeamFinalScore(
  songBaseScore: number,
  attrScore: number,
  randomScore: number
): number {
  return Math.round(songBaseScore + attrScore * 2 + randomScore)
}

export function calculatePlayerScore(
  user: User, 
  song: Song, 
  randomScore: number, 
  teamBonus: number
): number {
  const s = song as any
  const attrScore = user.attributes.vocal * (s.vocalWeight ?? 3) +
                    user.attributes.dance * (s.danceWeight ?? 3) +
                    user.attributes.charm * (s.charmWeight ?? 3)
  return Math.round(attrScore + randomScore + teamBonus)
}