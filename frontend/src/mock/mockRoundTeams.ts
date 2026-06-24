import type { RoundTeam } from '../types/round'
import { mockUsers } from './mockUsers'

// 模拟轮次队伍数据（第一公演）
export const mockRoundTeams: RoundTeam[] = [
  {
    id: 'round-1-team-1',
    roundId: 'round-1',
    roundIndex: 1,
    name: '星光队',
    captainId: 'u001',
    maxMembers: 4,
    locked: false,
    members: [
      {
        id: 'rtm-1-1',
        roundId: 'round-1',
        teamId: 'round-1-team-1',
        playerId: 'u001',
        player: {
          id: 'u001',
          name: '张三',
          avatar: mockUsers[0]?.avatar,
          attributes: { vocal: 85, dance: 72, charm: 90 }
        }
      },
      {
        id: 'rtm-1-2',
        roundId: 'round-1',
        teamId: 'round-1-team-1',
        playerId: 'u002',
        player: {
          id: 'u002',
          name: '李四',
          avatar: mockUsers[1]?.avatar,
          attributes: { vocal: 78, dance: 88, charm: 75 }
        }
      },
      {
        id: 'rtm-1-3',
        roundId: 'round-1',
        teamId: 'round-1-team-1',
        playerId: 'u003',
        player: {
          id: 'u003',
          name: '王五',
          avatar: mockUsers[2]?.avatar,
          attributes: { vocal: 82, dance: 76, charm: 80 }
        }
      }
    ]
  },
  {
    id: 'round-1-team-2',
    roundId: 'round-1',
    roundIndex: 1,
    name: '梦想队',
    captainId: 'u004',
    maxMembers: 4,
    locked: false,
    members: [
      {
        id: 'rtm-2-1',
        roundId: 'round-1',
        teamId: 'round-1-team-2',
        playerId: 'u004',
        player: {
          id: 'u004',
          name: '赵六',
          avatar: mockUsers[3]?.avatar,
          attributes: { vocal: 90, dance: 85, charm: 88 }
        }
      },
      {
        id: 'rtm-2-2',
        roundId: 'round-1',
        teamId: 'round-1-team-2',
        playerId: 'u005',
        player: {
          id: 'u005',
          name: '钱七',
          avatar: mockUsers[4]?.avatar,
          attributes: { vocal: 75, dance: 90, charm: 82 }
        }
      },
      {
        id: 'rtm-2-3',
        roundId: 'round-1',
        teamId: 'round-1-team-2',
        playerId: 'u006',
        player: {
          id: 'u006',
          name: '孙八',
          avatar: mockUsers[5]?.avatar,
          attributes: { vocal: 88, dance: 78, charm: 85 }
        }
      }
    ]
  },
  {
    id: 'round-1-team-3',
    roundId: 'round-1',
    roundIndex: 1,
    name: '烈焰队',
    captainId: 'u007',
    maxMembers: 4,
    locked: false,
    members: [
      {
        id: 'rtm-3-1',
        roundId: 'round-1',
        teamId: 'round-1-team-3',
        playerId: 'u007',
        player: {
          id: 'u007',
          name: '周九',
          avatar: mockUsers[6]?.avatar,
          attributes: { vocal: 80, dance: 92, charm: 78 }
        }
      },
      {
        id: 'rtm-3-2',
        roundId: 'round-1',
        teamId: 'round-1-team-3',
        playerId: 'u008',
        player: {
          id: 'u008',
          name: '吴十',
          avatar: mockUsers[7]?.avatar,
          attributes: { vocal: 85, dance: 80, charm: 90 }
        }
      },
      {
        id: 'rtm-3-3',
        roundId: 'round-1',
        teamId: 'round-1-team-3',
        playerId: 'u009',
        player: {
          id: 'u009',
          name: '郑十一',
          avatar: mockUsers[8]?.avatar,
          attributes: { vocal: 78, dance: 85, charm: 88 }
        }
      }
    ]
  }
]

// 根据 roundId 获取轮次队伍
export function getMockRoundTeams(roundId: string): RoundTeam[] {
  return mockRoundTeams.filter(team => team.roundId === roundId)
}
