import type { User } from '../types/user'

export const mockUsers: User[] = [
  {
    id: 'admin-001',
    name: '赛事管理员',
    loginCode: 'ADMIN2026',
    role: 'admin',
    status: 'active',
    hasLogin: false,
    attributes: { vocal: 0, dance: 0, charm: 0 }
  },
  {
    id: 'u001',
    name: '选手A',
    loginCode: 'CF2026-A001',
    role: 'captain',
    status: 'active',
    teamId: 't001',
    hasLogin: false,
    attributes: { vocal: 68, dance: 59, charm: 75 },
    trainingCount: 0
  },
  {
    id: 'u002',
    name: '选手B',
    loginCode: 'CF2026-A002',
    role: 'player',
    status: 'active',
    teamId: 't001',
    hasLogin: false,
    attributes: { vocal: 54, dance: 72, charm: 61 },
    trainingCount: 0
  },
  {
    id: 'u003',
    name: '选手C',
    loginCode: 'CF2026-A003',
    role: 'player',
    status: 'active',
    teamId: 't001',
    hasLogin: false,
    attributes: { vocal: 71, dance: 65, charm: 58 },
    trainingCount: 0
  },
  {
    id: 'u004',
    name: '选手D',
    loginCode: 'CF2026-A004',
    role: 'captain',
    status: 'active',
    teamId: 't002',
    hasLogin: false,
    attributes: { vocal: 56, dance: 78, charm: 63 },
    trainingCount: 0
  },
  {
    id: 'u005',
    name: '选手E',
    loginCode: 'CF2026-A005',
    role: 'player',
    status: 'active',
    teamId: 't002',
    hasLogin: false,
    attributes: { vocal: 62, dance: 55, charm: 74 },
    trainingCount: 0
  },
  {
    id: 'u006',
    name: '选手F',
    loginCode: 'CF2026-A006',
    role: 'player',
    status: 'active',
    teamId: 't002',
    hasLogin: false,
    attributes: { vocal: 59, dance: 68, charm: 66 },
    trainingCount: 0
  },
  {
    id: 'u007',
    name: '选手G',
    loginCode: 'CF2026-A007',
    role: 'captain',
    status: 'active',
    teamId: 't003',
    hasLogin: false,
    attributes: { vocal: 73, dance: 61, charm: 70 },
    trainingCount: 0
  },
  {
    id: 'u008',
    name: '选手H',
    loginCode: 'CF2026-A008',
    role: 'player',
    status: 'active',
    teamId: 't003',
    hasLogin: false,
    attributes: { vocal: 64, dance: 70, charm: 57 },
    trainingCount: 0
  },
  {
    id: 'u009',
    name: '选手I',
    loginCode: 'CF2026-A009',
    role: 'player',
    status: 'active',
    teamId: 't003',
    hasLogin: false,
    attributes: { vocal: 58, dance: 63, charm: 72 },
    trainingCount: 0
  },
  {
    id: 'u010',
    name: '选手J',
    loginCode: 'CF2026-A010',
    role: 'player',
    status: 'active',
    teamId: 't004',
    hasLogin: false,
    attributes: { vocal: 67, dance: 56, charm: 69 },
    trainingCount: 0
  },
  {
    id: 'u011',
    name: '选手K',
    loginCode: 'CF2026-A011',
    role: 'captain',
    status: 'active',
    teamId: 't004',
    hasLogin: false,
    attributes: { vocal: 60, dance: 75, charm: 64 },
    trainingCount: 0
  },
  {
    id: 'u012',
    name: '选手L',
    loginCode: 'CF2026-A012',
    role: 'player',
    status: 'active',
    teamId: 't004',
    hasLogin: false,
    attributes: { vocal: 72, dance: 58, charm: 67 },
    trainingCount: 0
  }
]