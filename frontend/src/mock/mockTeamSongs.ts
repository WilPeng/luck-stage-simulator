import type { TeamSong } from '../types/song'
import { mockSongs } from './mockSongs'

// 模拟队伍歌曲分配数据（第一公演）
export const mockTeamSongs: TeamSong[] = [
  {
    id: 'ts-1-1',
    roundId: 'round-1',
    teamId: 'round-1-team-1',
    songId: 'song-1',
    song: mockSongs[0]
  },
  {
    id: 'ts-1-2',
    roundId: 'round-1',
    teamId: 'round-1-team-2',
    songId: 'song-2',
    song: mockSongs[1]
  },
  {
    id: 'ts-1-3',
    roundId: 'round-1',
    teamId: 'round-1-team-3',
    songId: 'song-3',
    song: mockSongs[2]
  }
]

// 根据 roundId 获取队伍歌曲分配
export function getMockTeamSongs(roundId: string): TeamSong[] {
  return mockTeamSongs.filter(ts => ts.roundId === roundId)
}
