import type { OperationLog } from '../types/log'

export const mockLogs: OperationLog[] = [
  {
    id: 'log001',
    userId: 'admin-001',
    userName: '赛事管理员',
    role: 'admin',
    actionType: 'update_stage',
    targetType: 'stage',
    targetId: 'training',
    detail: '将阶段切换为训练阶段',
    createdAt: '2026-06-09 10:00:00'
  },
  {
    id: 'log002',
    userId: 'u001',
    userName: '选手A',
    role: 'captain',
    actionType: 'login',
    detail: '选手A登录系统',
    createdAt: '2026-06-09 10:05:00'
  },
  {
    id: 'log003',
    userId: 'u002',
    userName: '选手B',
    role: 'player',
    actionType: 'login',
    detail: '选手B登录系统',
    createdAt: '2026-06-09 10:08:00'
  }
]