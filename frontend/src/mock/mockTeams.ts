import type { Team, TeamInvite, TeamApplication } from '../types/team'

export const mockTeams: Team[] = [
  {
    id: 't001',
    name: '星光队',
    captainId: 'u001',
    memberIds: ['u001', 'u002', 'u003'],
    maxMembers: 4,
    locked: false
  },
  {
    id: 't002',
    name: '梦想队',
    captainId: 'u004',
    memberIds: ['u004', 'u005', 'u006'],
    maxMembers: 4,
    locked: false
  },
  {
    id: 't003',
    name: '烈焰队',
    captainId: 'u007',
    memberIds: ['u007', 'u008', 'u009'],
    maxMembers: 4,
    locked: false
  },
  {
    id: 't004',
    name: '彩虹队',
    captainId: 'u011',
    memberIds: ['u010', 'u011', 'u012'],
    maxMembers: 4,
    locked: false
  }
]

export const mockTeamInvites: TeamInvite[] = []

export const mockTeamApplications: TeamApplication[] = []