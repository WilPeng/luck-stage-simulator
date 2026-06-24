import type { User } from './user'

export interface Team {
  id: string
  name: string
  captainId?: string | null
  memberIds: string[]
  maxMembers: number
  locked: boolean
  index?: number
  round?: number
  members?: User[]
}

export interface TeamInvite {
  id: string
  teamId: string
  targetUserId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}

export interface TeamApplication {
  id: string
  teamId: string
  userId: string
  status: 'pending' | 'accepted' | 'rejected'
  createdAt: string
}