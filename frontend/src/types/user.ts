export interface User {
 id: string
 name: string
 loginCode: string
 role: 'player' | 'captain' | 'admin'
 status: 'active' | 'danger' | 'eliminated'
 // @deprecated 使用 team.memberIds 按轮次查找队伍，此字段已废弃
 teamId?: string
 hasLogin: boolean
 avatar?: string | null
 attributes: {
   vocal: number
   dance: number
   charm: number
 }
 trainingCount?: number
}

export type UserRole = User['role']
export type UserStatus = User['status']