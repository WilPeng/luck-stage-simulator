export interface OperationLog {
  id: string
  userId: string
  userName: string
  role: string
  actionType: string
  targetType?: string
  targetId?: string
  detail: string
  createdAt: string
}

export type ActionType = 
  | 'login'
  | 'logout'
  | 'initial_luck'
  | 'apply_team'
  | 'invite_player'
  | 'accept_invite'
  | 'reject_invite'
  | 'lock_team'
  | 'select_song'
  | 'training_draw'
  | 'rehearsal'
  | 'performance_calculate'
  | 'elimination_generate'
  | 'stage_change'