// 类型定义
import type { User } from '../types/user'
import type { Season, StageType, StageStatus, MatrixCell, MenuItem, ResetSeasonResult, SeasonProgressResponse } from '../types/season'
import type { Team, TeamInvite, TeamApplication } from '../types/team'
import type { Song, SongStats, SongAssignment, RoundSong, AddRoundSongRequest, UpdateScoringMethodRequest } from '../types/song'
import type { TrainingCard, TrainingRecord, TrainingConfig, TrainingStats, TrainingDrawResult, AutoCompleteResult, TrainingRecordListResponse, TrainingRecordQuery, TrainingEffect } from '../types/training'
import type { RehearsalResult, SafeTeamMark, SafeTeamMarkRequest } from '../types/performance'
import type {
  TeamResult,
  PlayerResult,
  PerformanceConfig,
  PerformanceStats,
  PerformanceHistory,
  CalculatePerformanceResult,
  GenerateAudienceVoteRequest,
  GenerateAudienceVoteResponse,
  AudienceVoteRankingResponse,
  AudienceSeatsResponse,
  AudienceVoteDetailResponse
} from '../types/performance'

import type {
  RankingListResponse,
  EliminationStats,
  EliminationRecord,
  EliminationCandidate,
  ManualEliminateParams,
  ManualEliminateResult,
  RestoreResult,
  EliminationConfig
} from '../types/elimination'
import type { OperationLog } from '../types/log'
import type { Round, RoundTeam, RoundTeamMember, TeamSong, PlayerPerformance, TeamPerformance, Elimination as RoundElimination, EliminationCandidate as RoundEliminationCandidate, TrainingRecord as RoundTrainingRecord, RehearsalResult as RoundRehearsalResult } from '../types/round'

// mock 兼容层
import {
  initStorage,
  loginByCode,
  getCurrentUser as mockGetCurrentUser,
  logout as mockLogout,
  getSeason as mockGetSeason,
  updateCurrentStage,
  getUsers as mockGetUsers,
  updateUser as mockUpdateUser,
  getTeams as mockGetTeams,
  invitePlayer,
  acceptInvite,
  rejectInvite,
  lockTeam,
  getTeamApplications as mockGetTeamApplications,
  getTeamInvites as mockGetTeamInvites,
  getSongs as mockGetSongs,
  getTrainingCards as mockGetCards,
  drawTrainingCard as mockDrawTrainingCard,
  getTrainingRecords as mockGetTrainingRecords,
  startRehearsal as mockStartRehearsal,
  getRehearsalResults as mockGetRehearsal,
  getPerformanceResults as mockGetPerfResults,
  getPlayerScores as mockGetPlayerScores,
  getLogs as mockGetLogs,
  addLog as mockAddLog,
  clearUserTrainingRecords as mockClearUserTrainingRecords,
  autoCompleteAll as mockAutoCompleteAll,
  autoCompleteUser as mockAutoCompleteUser,
} from './mockApi'
import { getMockRoundTeams } from '../mock/mockRoundTeams'
import { getMockTeamSongs } from '../mock/mockTeamSongs'
import {
  getTeams as dsGetTeams,
  saveTeams as dsSaveTeams,
  updateTeam as dsUpdateTeam,
  addTeamMember as dsAddTeamMember,
  removeTeamMember as dsRemoveTeamMember,
  getTeamSongs as dsGetTeamSongs,
  saveTeamSongs as dsSaveTeamSongs,
  assignSongToTeam as dsAssignSongToTeam,
  getRoundSongs as dsGetRoundSongs,
  saveRoundSongs as dsSaveRoundSongs,
  batchAddRoundSongs as dsBatchAddRoundSongs,
  clearAllRoundData as dsClearAllRoundData,
  getUsers as dsGetUsers
} from './dataService'

initStorage()

const API_BASE: string = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3000/api'

interface ApiResponse<T> {
  code?: number
  data: T
  message?: string
  success?: boolean
}

function buildHeaders(token: string | null): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  return headers
}

export async function doRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('luck_sim_token') || sessionStorage.getItem('luck_sim_token')
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      ...buildHeaders(token),
      ...(options.headers || {})
    }
  })
  const json = await res.json()
  if (!res.ok || (json && json.success === false)) {
    const errMsg = json?.error || json?.message || `HTTP ${res.status}`
    const err = new Error(errMsg)
    ;(err as any).status = res.status
    ;(err as any).code = json?.code
    throw err
  }
  return json.data !== undefined ? json.data : json
}

async function safeCall<T>(apiCall: () => Promise<T>, mockFallback: () => Promise<T>, name: string): Promise<T> {
  try {
    return await apiCall()
  } catch (e: any) {
    // 静默降级到 mock，不打印警告（本地无后端时 fetch 报错是预期行为）
    try {
      return await mockFallback()
    } catch (mockErr: any) {
      console.warn(`[API] ${name} 真实请求和 Mock 都失败:`, mockErr.message || mockErr)
      throw e
    }
  }
}

// ================== 通用 ==================

export interface RestartResult {
  newState: {
    currentRound: number
    currentStage: StageType
  }
}

// ================== 认证 ==================

export async function login(loginCode: string): Promise<{ token: string; user: User }> {
  // 1. 尝试真实后端
  //    后端格式: { success: true, data: User, token: "jwt..." }
  //    不能走 doRequest（它只返回 json.data，会丢掉 token）
  try {
    const url = `${API_BASE}/auth/login`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: loginCode })
    })
    const json = await res.json()
    if (res.ok && json.success !== false) {
      return { token: json.token, user: json.data }
    }
  } catch { /* 无后端，降级到 mock */ }

  // 2. Mock 降级
  const user: any = await loginByCode(loginCode)
  if (!user) throw new Error('登录码无效')
  const token = 'mock-token-' + user.id
  return { token, user }
}

export async function getCurrentUser(): Promise<User> {
  return safeCall(
    () => doRequest<User>('/auth/me'),
    async () => (await mockGetCurrentUser()) as User,
    'getCurrentUser'
  )
}

export async function logout(): Promise<void> {
  return mockLogout()
}

// ================== 赛季 ==================

export async function getSeason(): Promise<Season> {
  return safeCall(
    () => doRequest<Season>('/season'),
    mockGetSeason,
    'getSeason'
  )
}

export async function getSeasonProgress(): Promise<SeasonProgressResponse> {
  return safeCall(
    () => doRequest<SeasonProgressResponse>('/season/progress'),
    async () => {
      const season = await mockGetSeason()
      return {
        currentRound: season.currentRound || 1,
        currentStage: season.currentStage || 'preparation',
        matrix: []
      }
    },
    'getSeasonProgress'
  )
}

export async function setStage(round: number, stage: StageType): Promise<{ currentRound: number; currentStage: string; matrix: any[] }> {
  return safeCall(
    () => doRequest('/season/set', {
      method: 'POST',
      body: JSON.stringify({ round, stage })
    }),
    async () => {
      const updated = await updateCurrentStage(stage)
      return {
        currentRound: updated.currentRound || round,
        currentStage: stage,
        matrix: []
      }
    },
    'setStage'
  )
}

export async function nextStage(): Promise<{ currentRound: number; currentStage: string; matrix: any[] }> {
  return safeCall(
    () => doRequest('/season/next', { method: 'POST' }),
    async () => {
      const data = await getSeason()
      return {
        currentRound: data.currentRound || 1,
        currentStage: data.currentStage || 'preparation',
        matrix: []
      }
    },
    'nextStage'
  )
}

export async function resetSeason(): Promise<ResetSeasonResult> {
  return safeCall(
    () => doRequest<ResetSeasonResult>('/season/reset', { method: 'POST' }),
    async () => {
      throw new Error('Mock not supported for resetSeason')
    },
    'resetSeason'
  )
}

export async function restartSeason(): Promise<RestartResult> {
  return safeCall(
    () => doRequest<RestartResult>('/season/restart', { method: 'POST' }),
    async () => {
      throw new Error('Mock not supported for restartSeason')
    },
    'restartSeason'
  )
}

export async function getSeasonMenu(): Promise<MenuItem[]> {
  return safeCall(
    () => doRequest<MenuItem[]>('/season/menu'),
    async () => [],
    'getSeasonMenu'
  )
}
export const getMenu = getSeasonMenu

export async function updateRound(params: { performanceRound?: number; eliminationRound?: number; trainingRound?: number; drawsPerPlayer?: number }): Promise<void> {
  return safeCall(
    () => doRequest<void>('/season/round', {
      method: 'PUT',
      body: JSON.stringify(params)
    }),
    async () => {},
    'updateRound'
  )
}

export async function getRounds(): Promise<Round[]> {
  return safeCall(
    () => doRequest<Round[]>('/rounds'),
    async () => [],
    'getRounds'
  )
}

export async function updateStage(stage: StageType): Promise<Season> {
  return safeCall(
    () => doRequest<Season>('/season/stage', {
      method: 'PUT',
      body: JSON.stringify({ stage })
    }),
    () => updateCurrentStage(stage),
    'updateStage'
  )
}

// ================== 用户 ==================

export interface UserQueryParams {
  keyword?: string
  role?: string
  status?: string
  teamId?: string
  page?: number
  pageSize?: number
}

export interface UserStats {
  total: number
  players: number
  captains: number
  admins: number
  active: number
  danger: number
  eliminated: number
  noTeam: number
}

export interface UserListResponse {
  list: User[]
  total: number
  page: number
  pageSize: number
}

export async function getUsers(params?: UserQueryParams): Promise<UserListResponse> {
  return safeCall(
    async () => {
      const query = new URLSearchParams()
      if (params?.keyword) query.append('keyword', params.keyword)
      if (params?.role) query.append('role', params.role)
      if (params?.status) query.append('status', params.status)
      if (params?.teamId) query.append('teamId', params.teamId)
      if (params?.page) query.append('page', String(params.page))
      if (params?.pageSize) query.append('pageSize', String(params.pageSize))
      const url = `/users${query.toString() ? '?' + query.toString() : ''}`
      return await doRequest<UserListResponse>(url)
    },
    async () => {
      const users = await mockGetUsers()
      const list = users.filter(u => {
        if (params?.keyword && !u.name.includes(params.keyword)) return false
        if (params?.role && u.role !== params.role) return false
        if (params?.status && u.status !== params.status) return false
        return true
      })
      return { list, total: list.length, page: 1, pageSize: list.length || 20 }
    },
    'getUsers'
  )
}

export async function getUserById(id: string): Promise<User> {
  return safeCall(
    () => doRequest<User>(`/users/${id}`),
    async () => {
      const users = dsGetUsers()
      const user = users.find(u => u.id === id)
      if (!user) throw new Error('用户不存在')
      return user
    },
    'getUserById'
  )
}

export async function createUser(userData: Partial<User>): Promise<User> {
  return safeCall(
    () => doRequest<User>('/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    }),
    async () => { throw new Error('Mock not supported for createUser') },
    'createUser'
  )
}

export async function updateUser(userData: Partial<User>): Promise<User> {
  const { id, ...data } = userData
  return safeCall(
    () => doRequest<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    async () => mockUpdateUser(userData as User),
    'updateUser'
  )
}

export async function deleteUser(id: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/users/${id}`, { method: 'DELETE' }),
    async () => { throw new Error('Mock not supported for deleteUser') },
    'deleteUser'
  )
}

export async function batchDeleteUsers(ids: string[]): Promise<void> {
  return safeCall(
    () => doRequest<void>('/users/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),
    async () => { throw new Error('Mock not supported for batchDeleteUsers') },
    'batchDeleteUsers'
  )
}

export async function batchCreateUsers(users: Partial<User>[]): Promise<User[]> {
  return safeCall(
    () => doRequest<User[]>('/users/batch', {
      method: 'POST',
      body: JSON.stringify({ users })
    }),
    async () => { throw new Error('Mock not supported for batchCreateUsers') },
    'batchCreateUsers'
  )
}

export async function updateUserStatus(id: string, status: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status })
    }),
    async () => { throw new Error('Mock not supported for updateUserStatus') },
    'updateUserStatus'
  )
}

export async function getUserStats(): Promise<UserStats> {
  return safeCall(
    () => doRequest<UserStats>('/users/stats'),
    async () => ({
      total: 0, players: 0, captains: 0, admins: 0,
      active: 0, danger: 0, eliminated: 0, noTeam: 0
    }),
    'getUserStats'
  )
}
export const getUserList = getUsers
export type BatchCreateResult = User[]

// ================== 头像 ==================

export async function uploadAvatar(userId: string, file: File): Promise<{ avatar: string; user: User }> {
  const token = localStorage.getItem('luck_sim_token')
  const formData = new FormData()
  formData.append('avatar', file)
  const res = await fetch(`${API_BASE}/users/${userId}/avatar`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`)
  return json.data || json
}

// 选手自己上传头像（专用接口 /api/player/avatar）
export async function uploadMyAvatar(file: File): Promise<{ avatar: string; userId: string }> {
  const token = localStorage.getItem('luck_sim_token')
  const formData = new FormData()
  formData.append('avatar', file)
  const res = await fetch(`${API_BASE}/player/avatar`, {
    method: 'POST',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
    body: formData
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json.error || json.message || `HTTP ${res.status}`)
  return json.data || json
}

export async function deleteAvatar(userId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/users/${userId}/avatar`, { method: 'DELETE' }),
    async () => { throw new Error('Mock not supported for deleteAvatar') },
    'deleteAvatar'
  )
}

// 选手自己删除头像（专用接口 /api/player/avatar）
export async function deleteMyAvatar(): Promise<void> {
  const token = localStorage.getItem('luck_sim_token')
  const res = await fetch(`${API_BASE}/player/avatar`, {
    method: 'DELETE',
    headers: token ? { 'Authorization': `Bearer ${token}` } : {},
  })
  if (!res.ok) {
    const json = await res.json().catch(() => ({}))
    throw new Error(json.error || json.message || `HTTP ${res.status}`)
  }
}

export function getAvatarUrl(avatar: string | null | undefined): string | undefined {
  if (!avatar) return undefined
  if (avatar.startsWith('http')) return avatar
  const base = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3000/api'
  const serverBase = base.replace(/\/api\/?$/, '')
  return `${serverBase}${avatar}`
}

// ================== 队伍 ==================

export async function getRoundTeams(roundId: string): Promise<RoundTeam[]> {
  return safeCall(
    () => doRequest<RoundTeam[]>(`/teams?roundId=${roundId}`),
    async () => dsGetTeams(roundId),
    'getRoundTeams'
  )
}

export async function setupRoundTeams(params: { roundId: string; teamCount: number; teamSizes: number[]; teamNames?: string[] }): Promise<RoundTeam[]> {
  return safeCall(
    () => doRequest<RoundTeam[]>('/teams/setup', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => {
      const teams: RoundTeam[] = []
      for (let i = 0; i < params.teamCount; i++) {
        teams.push({
          id: `${params.roundId}-team-${i + 1}`,
          roundId: params.roundId,
          name: params.teamNames?.[i] || `第${i + 1}队`,
          maxMembers: params.teamSizes[i] || 4,
          members: [],
          locked: false
        } as unknown as RoundTeam)
      }
      dsSaveTeams(params.roundId, teams)
      return teams
    },
    'setupRoundTeams'
  )
}

export async function updateTeamConfig(params: { roundId: string; teamCount: number; teamSizes: number[]; teamNames?: string[] }): Promise<RoundTeam[]> {
  return safeCall(
    () => doRequest<RoundTeam[]>('/teams/setup', {
      method: 'PUT',
      body: JSON.stringify(params)
    }),
    async () => {
      const teams = dsGetTeams(params.roundId)
      if (teams.length === 0) {
        const created: RoundTeam[] = []
        for (let i = 0; i < params.teamCount; i++) {
          created.push({
            id: `${params.roundId}-team-${i + 1}`,
            roundId: params.roundId,
            name: params.teamNames?.[i] || `第${i + 1}队`,
            maxMembers: params.teamSizes[i] || 4,
            members: [],
            locked: false
          } as unknown as RoundTeam)
        }
        dsSaveTeams(params.roundId, created)
        return created
      }
      return teams
    },
    'updateTeamConfig'
  )
}
export const updateTeamSetup = updateTeamConfig

export async function randomAssignTeams(roundId: string): Promise<RoundTeam[]> {
  return safeCall(
    () => doRequest<RoundTeam[]>('/teams/admin/random-assign', {
      method: 'POST',
      body: JSON.stringify({ roundId })
    }),
    async () => {
      // Mock: 从 dataService 读取 teams，分配未分配的玩家
      const teams = dsGetTeams(roundId)
      if (teams.length === 0) return []
      // 尝试从 localStorage 获取未分配的玩家
      const usersKey = 'luck_sim_users'
      const stored = localStorage.getItem(usersKey)
      if (!stored) return teams
      const users = JSON.parse(stored)
      // 找到已经在队伍中的 playerId
      const assignedIds = new Set<string>()
      for (const t of teams) {
        if (t.members) {
          for (const m of t.members) {
            if (m.playerId) assignedIds.add(m.playerId)
          }
        }
        if (t.captainId) assignedIds.add(t.captainId)
      }
      // 找出未分配的玩家
      const unassigned = users.filter((u: any) => u.role === 'player' && u.status === 'active' && !assignedIds.has(u.id))
      if (unassigned.length === 0) return teams
      // 随机分配到各队
      const shuffled = [...unassigned].sort(() => Math.random() - 0.5)
      let idx = 0
      for (const t of teams) {
        const slots = (t.maxMembers || 4) - (t.members?.length || 0)
        for (let i = 0; i < slots && idx < shuffled.length; i++) {
          const player = shuffled[idx++]
          if (!t.members) t.members = []
          t.members.push({
            id: `rtm-${t.id}-${player.id}`,
            roundId,
            teamId: t.id,
            playerId: player.id,
            player: { id: player.id, name: player.name, avatar: player.avatar, attributes: player.attributes || { vocal: 50, dance: 50, charm: 50 } }
          } as unknown as RoundTeamMember)
        }
      }
      dsSaveTeams(roundId, teams)
      return teams
    },
    'randomAssignTeams'
  )
}

export async function manualAssignTeams(roundId: string, assignments: { teamId: string; playerIds: string[] }[]): Promise<RoundTeam[]> {
  return safeCall(
    () => doRequest<RoundTeam[]>('/teams/admin/manual-assign', {
      method: 'POST',
      body: JSON.stringify({ roundId, assignments })
    }),
    async () => {
      // Mock: 处理手动分配
      const teams = dsGetTeams(roundId)
      // 读取所有用户用于获取名称
      let allUsers: any[] = []
      try {
        const stored = localStorage.getItem('luck_sim_users')
        if (stored) allUsers = JSON.parse(stored)
      } catch {}
      // 先清除所有队伍的成员
      for (const t of teams) {
        t.members = []
      }
      // 根据 assignments 重新分配
      for (const a of assignments) {
        const team = teams.find(t => t.id === a.teamId)
        if (!team) continue
        if (!team.members) team.members = []
        for (const pid of a.playerIds) {
          const user = allUsers.find((u: any) => u.id === pid)
          team.members.push({
            id: `rtm-${a.teamId}-${pid}`,
            roundId,
            teamId: a.teamId,
            playerId: pid,
            player: user ? { id: user.id, name: user.name, avatar: user.avatar, attributes: user.attributes || { vocal: 50, dance: 50, charm: 50 } } : { id: pid, name: pid }
          } as unknown as RoundTeamMember)
        }
      }
      dsSaveTeams(roundId, teams)
      return teams
    },
    'manualAssignTeams'
  )
}

export async function setTeamCaptain(teamId: string, playerId: string): Promise<RoundTeam> {
  return safeCall(
    () => doRequest<RoundTeam>(`/teams/${teamId}/captain`, {
      method: 'POST',
      body: JSON.stringify({ playerId })
    }),
    async () => {
      const roundIdMatch = teamId.match(/^(round-\d+)-/)
      if (!roundIdMatch) throw new Error(`Cannot parse roundId from teamId: ${teamId}`)
      const roundId = roundIdMatch[1]
      const updated = dsUpdateTeam(roundId, teamId, { captainId: playerId })
      if (!updated) throw new Error(`Team not found: ${teamId}`)
      return updated
    },
    'setTeamCaptain'
  )
}

export async function getUnassignedPlayers(roundId: string): Promise<User[]> {
  return safeCall(
    () => doRequest<User[]>(`/teams/unassigned/${roundId}`),
    async () => [],
    'getUnassignedPlayers'
  )
}

export async function getRoundTeamStats(roundId: string): Promise<{ totalTeams: number; totalMembers: number; unassignedCount: number; averageMembersPerTeam: number }> {
  return safeCall(
    () => doRequest(`/teams/stats/summary?roundId=${roundId}`),
    async () => ({ totalTeams: 0, totalMembers: 0, unassignedCount: 0, averageMembersPerTeam: 0 }),
    'getRoundTeamStats'
  )
}

export async function addMember(teamId: string, playerId: string, roundId: string): Promise<RoundTeam> {
  return safeCall(
    () => doRequest<RoundTeam>(`/teams/${teamId}/members/add`, {
      method: 'POST',
      body: JSON.stringify({ playerId, roundId })
    }),
    async () => {
      const updated = dsAddTeamMember(roundId, teamId, { id: `rtm-${teamId}-${playerId}`, roundId, teamId, playerId } as any)
      if (!updated) throw new Error(`Team not found: ${teamId}`)
      return dsGetTeams(roundId).find(t => t.id === teamId)!
    },
    'addMember'
  )
}

export async function removeMember(teamId: string, playerId: string, roundId: string): Promise<RoundTeam> {
  return safeCall(
    () => doRequest<RoundTeam>(`/teams/${teamId}/members/remove`, {
      method: 'POST',
      body: JSON.stringify({ playerId, roundId })
    }),
    async () => {
      dsRemoveTeamMember(roundId, teamId, playerId)
      return dsGetTeams(roundId).find(t => t.id === teamId)!
    },
    'removeMember'
  )
}

export async function lockTeamAPI(teamId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/${teamId}/lock`, { method: 'POST' }),
    async () => { throw new Error('Mock not supported for lockTeam') },
    'lockTeam'
  )
}

export async function unlockTeamAPI(teamId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/${teamId}/unlock`, { method: 'POST' }),
    async () => { throw new Error('Mock not supported for unlockTeam') },
    'unlockTeam'
  )
}

export async function updateTeam(teamId: string, data: Partial<RoundTeam>): Promise<RoundTeam> {
  return safeCall(
    () => doRequest<RoundTeam>(`/teams/${teamId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
    async () => { throw new Error('Mock not supported for updateTeam') },
    'updateTeam'
  )
}

export async function deleteTeamAPI(id: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/${id}`, { method: 'DELETE' }),
    async () => { throw new Error('Mock not supported for deleteTeam') },
    'deleteTeam'
  )
}
export const deleteTeam = deleteTeamAPI

// ================== 队伍邀请/申请 ==================

export async function invitePlayerToTeam(teamId: string, playerId: string, roundId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/${teamId}/invite`, {
      method: 'POST',
      body: JSON.stringify({ playerId, roundId })
    }),
    async () => {},
    'invitePlayerToTeam'
  )
}

export async function applyToTeam(teamId: string, playerId: string, roundId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/${teamId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ playerId, roundId })
    }),
    async () => {},
    'applyToTeam'
  )
}

export async function acceptTeamApplication(teamId: string, playerId: string, roundId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/${teamId}/applications/${playerId}/accept`, {
      method: 'POST',
      body: JSON.stringify({ roundId })
    }),
    async () => {},
    'acceptTeamApplication'
  )
}

export async function rejectTeamApplication(teamId: string, playerId: string, roundId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/${teamId}/applications/${playerId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ roundId })
    }),
    async () => {},
    'rejectTeamApplication'
  )
}

export async function acceptTeamInvite(inviteId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/invites/${inviteId}/accept`, { method: 'POST' }),
    async () => {},
    'acceptTeamInvite'
  )
}

export async function rejectTeamInvite(inviteId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/teams/invites/${inviteId}/reject`, { method: 'POST' }),
    async () => {},
    'rejectTeamInvite'
  )
}

export async function getTeamApplications(teamId: string, roundId: string): Promise<{ id: string; playerId: string; playerName: string }[]> {
  return safeCall(
    () => doRequest<{ id: string; playerId: string; playerName: string }[]>(`/teams/${teamId}/applications?roundId=${roundId}`),
    async () => [],
    'getTeamApplications'
  )
}

export async function getPlayerInvites(playerId: string, roundId: string): Promise<{ id: string; captainId: string; captainName: string; teamId: string; teamName: string }[]> {
  return safeCall(
    () => doRequest<{ id: string; captainId: string; captainName: string; teamId: string; teamName: string }[]>(`/teams/invites?playerId=${playerId}&roundId=${roundId}`),
    async () => [],
    'getPlayerInvites'
  )
}

// ================== 队长 ==================

export async function getCurrentCaptains(roundId: string): Promise<{ success: boolean; data: { id: string; playerId: string; playerName: string; playerAvatar: string | null; teamId: string; teamName: string | null }[]; total: number }> {
  return safeCall(
    () => doRequest<{ success: boolean; data: { id: string; playerId: string; playerName: string; playerAvatar: string | null; teamId: string; teamName: string | null }[]; total: number }>(`/captain/current?roundId=${roundId}`),
    async () => ({ success: true, data: [], total: 0 }),
    'getCurrentCaptains'
  )
}

export async function getAvailableCaptainPlayers(roundId: string): Promise<{ success: boolean; data: { id: string; name: string; avatar: string | null; attributes: { vocal: number; dance: number; charm: number }; inTeam: boolean; status: string }[] }> {
  return safeCall(
    () => doRequest<{ success: boolean; data: { id: string; name: string; avatar: string | null; attributes: { vocal: number; dance: number; charm: number }; inTeam: boolean; status: string }[] }>(`/captain/available-players?roundId=${roundId}`),
    async () => ({ success: true, data: [] }),
    'getAvailableCaptainPlayers'
  )
}

export async function assignCaptainAdmin(roundId: string, teamId: string, playerId: string): Promise<any> {
  return safeCall(
    () => doRequest('/captain/admin/assign', {
      method: 'POST',
      body: JSON.stringify({ roundId, teamId, playerId })
    }),
    async () => ({ success: true }),
    'assignCaptainAdmin'
  )
}

// 选手提交投票（支持投 2 票）
export async function submitCaptainVote(roundId: string, voteForPlayerIds: string[]): Promise<void> {
  return safeCall(
    () => doRequest<void>('/captain/vote', {
      method: 'POST',
      body: JSON.stringify({ roundId, voteForPlayerIds })
    }),
    async () => {},
    'submitCaptainVote'
  )
}

// 选手查看本轮是否已投票
export async function getMyVote(roundId: string): Promise<{ hasVoted: boolean; votedFor: string[] }> {
  return safeCall(
    () => doRequest<{ hasVoted: boolean; votedFor: string[] }>(`/captain/my-vote?roundId=${roundId}`),
    async () => ({ hasVoted: false, votedFor: [] }),
    'getMyVote'
  )
}

// 选手/管理员查看得票统计
export async function getCaptainResults(roundId: string): Promise<{ playerId: string; playerName: string; voteCount: number; rank: number }[]> {
  return safeCall(
    () => doRequest<{ playerId: string; playerName: string; voteCount: number; rank: number }[]>(`/captain/results?roundId=${roundId}`),
    async () => [],
    'getCaptainResults'
  )
}

// 管理员查看投票明细
export async function getCaptainVoteDetails(roundId: string): Promise<{ voterId: string; voterName: string; targetId: string; targetName: string; createdAt: string }[]> {
  return safeCall(
    () => doRequest<{ voterId: string; voterName: string; targetId: string; targetName: string; createdAt: string }[]>(`/captain/votes?roundId=${roundId}`),
    async () => [],
    'getCaptainVoteDetails'
  )
}

// ================== 歌曲 ==================

export async function getRoundSongs(roundId: string): Promise<RoundSong[]> {
  return safeCall(
    () => doRequest<RoundSong[]>(`/songs/round/${roundId}`),
    async () => dsGetRoundSongs(roundId) as any,
    'getRoundSongs'
  )
}

export async function addRoundSongs(params: { roundId: string; songs: Array<{ songId: string; songType: string }> }): Promise<RoundSong[]> {
  return safeCall(
    () => doRequest<RoundSong[]>('/songs/round/batch', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => {
      // Mock: 将歌曲添加到轮次并保存到 dataService
      const existing: any[] = dsGetRoundSongs(params.roundId) as any
      const allSongs = await mockGetSongs()
      for (const s of params.songs) {
        const found = allSongs.find((ms: any) => ms.id === s.songId)
        const rs: any = {
          id: `rs-${params.roundId}-${s.songId}`,
          roundId: params.roundId,
          songId: s.songId,
          songType: s.songType || 'team_show',
          released: false,
          song: found ? { id: found.id, name: found.name, style: found.style, difficulty: found.difficulty } : { id: s.songId, name: s.songId }
        }
        if (!existing.find((e: any) => e.songId === s.songId)) {
          existing.push(rs)
        }
      }
      dsSaveRoundSongs(params.roundId, existing)
      return existing as any
    },
    'addRoundSongs'
  )
}

export async function assignTeamSongs(params: { roundId: string; assignments: Array<{ teamId: string; songId: string }> }): Promise<TeamSong[]> {
  return safeCall(
    () => doRequest<TeamSong[]>('/songs/team-songs', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => {
      // Mock: 处理歌曲分配并保存到 dataService
      const existing = dsGetTeamSongs(params.roundId)
      for (const a of params.assignments) {
        const idx = existing.findIndex(ts => ts.teamId === a.teamId)
        const ts: TeamSong = {
          id: `ts-${params.roundId}-${a.teamId}`,
          roundId: params.roundId,
          teamId: a.teamId,
          songId: a.songId
        } as TeamSong
        if (idx >= 0) {
          existing[idx] = { ...existing[idx], songId: a.songId }
        } else {
          existing.push(ts)
        }
      }
      dsSaveTeamSongs(params.roundId, existing)
      return existing
    },
    'assignTeamSongs'
  )
}

export async function getTeamSongs(roundId: string): Promise<TeamSong[]> {
  return safeCall(
    () => doRequest<TeamSong[]>(`/songs/team-songs?roundId=${roundId}`),
    async () => dsGetTeamSongs(roundId),
    'getTeamSongs'
  )
}

export async function releaseSong(roundId: string, roundSongId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>('/songs/release', {
      method: 'POST',
      body: JSON.stringify({ roundId, roundSongId })
    }),
    async () => {
      // Mock: 标记歌曲为已释放并保存
      const songs: any[] = dsGetRoundSongs(roundId) as any
      const idx = songs.findIndex((s: any) => s.id === roundSongId || s.songId === roundSongId)
      if (idx >= 0) {
        songs[idx] = { ...songs[idx], released: true }
        dsSaveRoundSongs(roundId, songs)
      }
    },
    'releaseSong'
  )
}

export async function claimSong(roundId: string, roundSongId: string, teamId: string): Promise<TeamSong> {
  // 先尝试真实后端，业务错误（409 等）直接抛出，不降级到 mock
  try {
    return await doRequest<TeamSong>('/songs/claim', {
      method: 'POST',
      body: JSON.stringify({ roundId, roundSongId, teamId })
    })
  } catch (e: any) {
    // 网络错误（无后端）时才降级到 mock
    if (e.message?.includes('fetch') || e.name === 'TypeError' || e.message === 'Failed to fetch') {
      // Mock: 先检查是否已被其他队抢走
      const existing = dsGetTeamSongs(roundId)
      if (existing.some(ts => ts.songId === roundSongId)) {
        throw new Error('该歌曲已被其他队伍抢选')
      }
      const ts: TeamSong = {
        id: `ts-${roundId}-${teamId}`,
        roundId,
        teamId,
        songId: roundSongId
      } as TeamSong
      dsAssignSongToTeam(roundId, teamId, roundSongId)
      const songs: any[] = dsGetRoundSongs(roundId) as any
      const idx = songs.findIndex((s: any) => s.id === roundSongId || s.songId === roundSongId)
      if (idx >= 0) {
        songs[idx] = { ...songs[idx], assignedTeamId: teamId, released: false }
        dsSaveRoundSongs(roundId, songs)
      }
      return ts
    }
    // 业务错误（409 等）直接抛出
    throw e
  }
}

export async function getSongs(params?: { round?: number; type?: string; style?: string; keyword?: string }): Promise<Song[]> {
  return safeCall(
    async () => {
      const query = new URLSearchParams()
      if (params?.type) query.append('type', params.type)
      if (params?.style) query.append('style', params.style)
      if (params?.keyword) query.append('keyword', params.keyword)
      const qs = query.toString()
      return await doRequest<Song[]>(`/songs${qs ? '?' + qs : ''}`)
    },
    async () => mockGetSongs(),
    'getSongs'
  )
}

export async function getSongById(id: string): Promise<Song> {
  return safeCall(
    () => doRequest<Song>(`/songs/${id}`),
    async () => { throw new Error('Mock not supported') },
    'getSongById'
  )
}

export async function getSongStats(): Promise<SongStats> {
  return safeCall(
    () => doRequest<SongStats>('/songs/stats'),
    async () => { throw new Error('Mock not supported') },
    'getSongStats'
  )
}

export async function createSong(songData: { name: string; type?: string; style?: string; difficulty?: number; vocalWeight?: number; danceWeight?: number; charmWeight?: number; baseScore?: number; riskFactor?: number; description?: string }): Promise<Song> {
  return safeCall(
    () => doRequest<Song>('/songs', {
      method: 'POST',
      body: JSON.stringify(songData)
    }),
    async () => { throw new Error('Mock not supported') },
    'createSong'
  )
}

export async function batchCreateSongs(songs: { name: string; type?: string; style?: string; difficulty?: number }[]): Promise<Song[]> {
  return safeCall(
    () => doRequest<Song[]>('/songs/batch', {
      method: 'POST',
      body: JSON.stringify({ songs })
    }),
    async () => { throw new Error('Mock not supported') },
    'batchCreateSongs'
  )
}

export async function updateSong(id: string, songData: Partial<Song>): Promise<Song> {
  return safeCall(
    () => doRequest<Song>(`/songs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(songData)
    }),
    async () => { throw new Error('Mock not supported') },
    'updateSong'
  )
}

export async function deleteSong(id: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/songs/${id}`, { method: 'DELETE' }),
    async () => { throw new Error('Mock not supported') },
    'deleteSong'
  )
}

export async function getSongAssignments(round: number): Promise<SongAssignment[]> {
  return safeCall(
    () => doRequest<SongAssignment[]>(`/songs/assignments/list?round=${round}`),
    async () => [],
    'getSongAssignments'
  )
}

export async function assignSongToUsers(params: { round: number; songId: string; teamId?: string; playerIds: string[] }): Promise<void> {
  return safeCall(
    () => doRequest<void>('/songs/assignments', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => {},
    'assignSongToUsers'
  )
}

export async function batchAssignSongAssignments(params: { round: number; assignments: Array<{ songId: string; playerIds: string[] }> }): Promise<void> {
  return safeCall(
    () => doRequest<void>('/songs/assignments/batch', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => {},
    'batchAssignSongAssignments'
  )
}

// ================== 训练卡牌与训练操作 ==================

export async function getTrainingCards(): Promise<TrainingCard[]> {
  return safeCall(
    () => doRequest<TrainingCard[]>('/training/cards'),
    mockGetCards,
    'getTrainingCards'
  )
}

export async function createTrainingCard(cardData: { name: string; type?: string; description?: string; effect?: any; weight?: number; enabled?: boolean }): Promise<TrainingCard> {
  return safeCall(
    () => doRequest<TrainingCard>('/training/cards', {
      method: 'POST',
      body: JSON.stringify(cardData)
    }),
    async () => { throw new Error('Mock not supported') },
    'createTrainingCard'
  )
}

export async function updateTrainingCard(id: string, cardData: Partial<TrainingCard>): Promise<TrainingCard> {
  return safeCall(
    () => doRequest<TrainingCard>(`/training/cards/${id}`, {
      method: 'PUT',
      body: JSON.stringify(cardData)
    }),
    async () => { throw new Error('Mock not supported') },
    'updateTrainingCard'
  )
}

export async function deleteTrainingCard(id: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/training/cards/${id}`, { method: 'DELETE' }),
    async () => { throw new Error('Mock not supported') },
    'deleteTrainingCard'
  )
}
export const getTrainingCardById = getTrainingCards
export async function batchCreateTrainingCards(cards: any[]): Promise<TrainingCard[]> {
  return safeCall(
    () => doRequest<TrainingCard[]>('/training/cards/batch', {
      method: 'POST',
      body: JSON.stringify({ cards })
    }),
    async () => { throw new Error('Mock not supported') },
    'batchCreateTrainingCards'
  )
}
export async function resetPresets(): Promise<void> {
  return safeCall(
    () => doRequest<void>('/training/cards/reset', { method: 'POST' }),
    async () => {},
    'resetPresets'
  )
}
export async function resetTrainingCounts(): Promise<void> {
  return safeCall(
    () => doRequest<void>('/training/reset-counts', { method: 'POST' }),
    async () => {},
    'resetTrainingCounts'
  )
}
export async function getUserTrainingRecords(userId: string): Promise<TrainingRecord[]> {
  return safeCall(
    () => doRequest<TrainingRecord[]>(`/training/records/user/${userId}`),
    async () => [],
    'getUserTrainingRecords'
  )
}

export async function getTrainingConfig(): Promise<TrainingConfig> {
  return safeCall(
    () => doRequest<TrainingConfig>('/training/config'),
    async () => ({ drawsPerPlayer: 5, currentRound: 1, totalRounds: 1 }),
    'getTrainingConfig'
  )
}

export async function updateTrainingConfig(config: Partial<TrainingConfig>): Promise<void> {
  return safeCall(
    () => doRequest<void>('/training/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    }),
    async () => {},
    'updateTrainingConfig'
  )
}

export async function drawTrainingCard(userId: string, round?: number): Promise<TrainingDrawResult> {
  // 尝试真实后端
  try {
    const result = await doRequest<TrainingDrawResult>('/training/draw', {
      method: 'POST',
      body: JSON.stringify({ userId, roundId: round !== undefined ? `round-${round}` : undefined })
    })
    // 真实后端成功后，同步写入 mock 存储（兜底：后续 GET 记录失败时 mock 能有数据）
    if (result?.record) {
      try {
        const existing = JSON.parse(localStorage.getItem('luck_sim_training_records') || '[]')
        existing.push(result.record)
        localStorage.setItem('luck_sim_training_records', JSON.stringify(existing))
      } catch { /* 写入失败不影响主流程 */ }
    }
    return result
  } catch {
    // 降级到 mock
    const record = await mockDrawTrainingCard(userId)
    if (round !== undefined) record.round = round
    return { record, user: null } as any
  }
}
export const drawTraining = drawTrainingCard

export async function applySelfSelect(recordId: string, selectedAttr: string): Promise<{ selectedAttr: string; delta: number; attributes: { vocal: number; dance: number; charm: number } }> {
  return safeCall(
    () => doRequest('/training/apply-self-select', {
      method: 'POST',
      body: JSON.stringify({ recordId, selectedAttr })
    }),
    async () => {
      // Mock: 随机一项增加 5 点
      const attr = selectedAttr as 'vocal' | 'dance' | 'charm'
      const key = `luck_sim_training_attrs` as const
      const stored = JSON.parse(localStorage.getItem(key) || '{}')
      if (!stored[attr]) stored[attr] = 50
      stored[attr] += 5
      localStorage.setItem(key, JSON.stringify(stored))
      return { selectedAttr, delta: 5, attributes: stored }
    },
    'applySelfSelect'
  )
}

export async function getTrainingRecords(params?: TrainingRecordQuery): Promise<TrainingRecordListResponse> {
  // GET 请求用 query 参数
  const query = new URLSearchParams()
  if (params?.userId) query.append('userId', params.userId)
  if (params?.round !== undefined) query.append('roundId', `round-${params.round}`)
  // 传一个足够大的 pageSize 以获取全部记录（后端默认 limit=10）
  query.append('pageSize', '999')
  if (params?.page !== undefined) query.append('page', String(params.page))
  const qs = query.toString()

  return safeCall(
    () => doRequest<TrainingRecordListResponse>(`/training/records${qs ? '?' + qs : ''}`),
    async () => {
      const records = await mockGetTrainingRecords(params?.userId)
      const filtered = params?.round !== undefined
        ? records.filter(r => r.round === params.round)
        : records
      return { list: filtered, total: filtered.length, page: 1, pageSize: filtered.length, totalPages: 1 }
    },
    'getTrainingRecords'
  )
}

export async function getTrainingStats(): Promise<TrainingStats> {
  return safeCall(
    () => doRequest<TrainingStats>('/training/stats'),
    async () => ({ totalPlayers: 0, totalCards: 0, totalDraws: 0, avgDraws: 0 } as any),
    'getTrainingStats'
  )
}

export async function clearUserTrainingRecords(userId: string, round?: number): Promise<void> {
  return safeCall(
    () => doRequest<void>('/training/clear-user-records', {
      method: 'DELETE',
      body: JSON.stringify({ userId, round })
    }),
    async () => mockClearUserTrainingRecords(userId, round),
    'clearUserTrainingRecords'
  )
}

export async function autoCompleteAll(round?: number): Promise<{ results: TrainingRecord[] }> {
  return safeCall(
    () => doRequest<{ results: TrainingRecord[] }>('/training/auto-complete-all', {
      method: 'POST',
      body: JSON.stringify({ round })
    }),
    async () => mockAutoCompleteAll(round) as any,
    'autoCompleteAll'
  )
}

export async function autoCompleteUser(userId: string, round?: number): Promise<{ record: TrainingRecord }> {
  return safeCall(
    () => doRequest<{ record: TrainingRecord }>('/training/auto-complete', {
      method: 'POST',
      body: JSON.stringify({ userId, round })
    }),
    async () => mockAutoCompleteUser(userId, round) as any,
    'autoCompleteUser'
  )
}

// ================== 彩排 ==================

export async function startRehearsalAPI(teamId: string): Promise<RehearsalResult> {
  return safeCall(
    () => doRequest<RehearsalResult>(`/rehearsal/${teamId}`, { method: 'POST' }),
    () => mockStartRehearsal(teamId),
    'startRehearsal'
  )
}

// ================== 公演 ==================

// 查询本轮公演是否已开启（不走 doRequest 避免 data 剥离）
export async function getPerformanceStarted(round: number): Promise<boolean> {
  const base = (import.meta as any).env?.VITE_API_BASE || 'http://localhost:3000/api'
  const token = localStorage.getItem('luck_sim_token') || sessionStorage.getItem('luck_sim_token')
  try {
    const res = await fetch(`${base}/performance?round=${round}`, {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }
    })
    const json = await res.json()
    // 兼容两种响应格式：{ started } 或 { data: { started } }
    return !!(json?.started || json?.data?.started)
  } catch {
    // 无后端时，从 mock localStorage 读取
    const { loadPerformanceStarted } = await import('./performanceService')
    const roundId = `round-${round}`
    return loadPerformanceStarted(roundId)
  }
}

// 获取轮次公演状态（选手端用于判断显示哪个阶段）
export async function getPerformanceRoundStatus(roundId: string): Promise<{
  started: boolean
  settled: boolean
  released: boolean
  opened: boolean
  seasonStage: string | null
}> {
  return safeCall(
    () => doRequest<{
      started: boolean
      settled: boolean
      released: boolean
      opened: boolean
      seasonStage: string | null
    }>(`/performance/round-status?roundId=${roundId}`),
    async () => ({ started: false, settled: false, released: false, opened: false, seasonStage: null }),
    'getPerformanceRoundStatus'
  )
}

// 管理员打开公演管理页面
export async function openPerformance(roundId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>('/performance/open', { method: 'POST', body: { roundId } }),
    async () => {},
    'openPerformance'
  )
}

export async function getPerformanceResults(round?: number): Promise<TeamResult[]> {
  return safeCall(
    async () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return await doRequest<TeamResult[]>(`/performance${query}`)
    },
    mockGetPerfResults as any,
    'getPerformanceResults'
  )
}

export async function getPlayerScores(round?: number): Promise<PlayerResult[]> {
  return safeCall(
    async () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return await doRequest<PlayerResult[]>(`/performance/players${query}`)
    },
    mockGetPlayerScores as any,
    'getPlayerScores'
  )
}

export async function getPerformanceStats(): Promise<PerformanceStats> {
  return safeCall(
    () => doRequest<PerformanceStats>('/performance/stats'),
    async () => { throw new Error('Mock not supported') },
    'getPerformanceStats'
  )
}

export async function getPerformanceConfig(): Promise<PerformanceConfig> {
  return safeCall(
    () => doRequest<PerformanceConfig>('/performance/config'),
    async () => ({ baseScore: 100, scoreMultiplier: 2, teamRandomMin: -10, teamRandomMax: 20, playerRandomMin: -5, playerRandomMax: 15, teamRankBonusBase: 0, teamRankBonusMultiplier: 0 }),
    'getPerformanceConfig'
  )
}

export async function updatePerformanceConfig(config: PerformanceConfig): Promise<void> {
  return safeCall(
    () => doRequest<void>('/performance/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    }),
    async () => {},
    'updatePerformanceConfig'
  )
}

export async function calculatePerformance(params: { roundId: string; round: number }): Promise<CalculatePerformanceResult> {
  return safeCall(
    () => doRequest<CalculatePerformanceResult>('/performance/calculate', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => { throw new Error('Mock not supported') },
    'calculatePerformance'
  )
}

export async function getPerformanceHistory(round?: number): Promise<PerformanceHistory[]> {
  return safeCall(
    () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return doRequest<PerformanceHistory[]>(`/performance/history${query}`)
    },
    async () => [],
    'getPerformanceHistory'
  )
}

// ================== 发挥值管理 ==================

export async function playerGeneratePerformance(params: { roundId: string; playerId: string }): Promise<{ performanceValue: number }> {
  return safeCall(
    () => doRequest<{ performanceValue: number }>('/performance/player-generate', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => {
      // Mock: 随机 -10 ~ 20
      const value = Math.floor(Math.random() * 31) - 10
      return { performanceValue: value }
    },
    'playerGeneratePerformance'
  )
}

export async function startPerformance(roundId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>('/performance/start', {
      method: 'POST',
      body: JSON.stringify({ roundId })
    }),
    async () => {
      // Mock: 持久化 started 状态，刷新页面后能恢复
      const { savePerformanceStarted } = await import('./performanceService')
      savePerformanceStarted(roundId, true)
    },
    'startPerformance'
  )
}

export async function savePerformancePlayerStatus(roundId: string, players: { playerId: string; performanceValue: number | null }[]): Promise<void> {
  return safeCall(
    () => doRequest<void>('/performance/player-status/save', {
      method: 'POST',
      body: JSON.stringify({ roundId, players })
    }),
    async () => {
      const { savePlayerStatuses } = await import('./performanceService')
      savePlayerStatuses(roundId, players.map(p => ({
        playerId: p.playerId,
        playerName: '',
        teamId: '',
        teamName: '',
        generated: p.performanceValue !== null,
        performanceValue: p.performanceValue
      })))
    },
    'savePerformancePlayerStatus'
  )
}

export async function getPlayerPerformanceStatus(roundId: string): Promise<{ started: boolean; players: any[] }> {
  return safeCall(
    () => doRequest<{ started: boolean; players: any[] }>(`/performance/player-status?roundId=${roundId}`),
    async () => {
      const { loadPlayerStatuses, loadPerformanceStarted } = await import('./performanceService')
      return { started: loadPerformanceStarted(roundId), players: loadPlayerStatuses(roundId) }
    },
    'getPlayerPerformanceStatus'
  )
}

// ================== 彩排 ==================

export async function getRehearsalResultsAPI(roundId?: string): Promise<RehearsalResult[]> {
  return safeCall(
    () => {
      const query = roundId ? `?roundId=${roundId}` : ''
      return doRequest<RehearsalResult[]>(`/rehearsal/results${query}`)
    },
    mockGetRehearsal,
    'getRehearsalResults'
  )
}

export async function startRehearsal(teamId: string): Promise<RehearsalResult> {
  return safeCall(
    () => doRequest<RehearsalResult>(`/rehearsal/${teamId}`, { method: 'POST' }),
    () => mockStartRehearsal(teamId),
    'startRehearsal'
  )
}
export const getRehearsalResults = getRehearsalResultsAPI

export async function markSafeTeams(params: SafeTeamMarkRequest): Promise<void> {
  return safeCall(
    () => doRequest<void>('/performance/safe-teams', {
      method: 'POST',
      body: JSON.stringify(params)
    }),
    async () => {},
    'markSafeTeams'
  )
}

export async function getSafeTeams(round?: number): Promise<SafeTeamMark[]> {
  return safeCall(
    () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return doRequest<SafeTeamMark[]>(`/performance/safe-teams${query}`)
    },
    async () => [],
    'getSafeTeams'
  )
}

// ================== 大众评审投票 ==================

export async function generateAudienceVote(roundId: string, weights?: any[]): Promise<GenerateAudienceVoteResponse> {
  return safeCall(
    () => doRequest<GenerateAudienceVoteResponse>('/admin/audience-vote/generate', {
      method: 'POST',
      body: JSON.stringify({ roundId, weights })
    }),
    async () => {
      const sessionId = `session-${Date.now()}`
      const totalAudience = 30
      const totalVotes = 0
      const rankings: any[] = []
      const finalWeights: any[] = []
      const voteKey = `luck_sim_audience_vote_${roundId}`
      localStorage.setItem(voteKey, JSON.stringify({ sessionId, totalAudience, totalVotes, rankings, weights: finalWeights }))
      return { success: true, sessionId, totalAudience, totalVotes, rankings, weights: finalWeights }
    },
    'generateAudienceVote'
  )
}

export async function getAudienceVoteRanking(roundId: string): Promise<AudienceVoteRankingResponse> {
  return safeCall(
    () => doRequest<AudienceVoteRankingResponse>(`/audience-vote/ranking?roundId=${roundId}`),
    async () => {
      const voteKey = `luck_sim_audience_vote_${roundId}`
      const stored = localStorage.getItem(voteKey)
      if (stored) {
        const data = JSON.parse(stored)
        return { success: true, totalVotes: data.totalVotes, totalAudience: data.totalAudience, rankings: data.rankings, weights: data.weights }
      }
      return { success: false, totalVotes: 0, totalAudience: 0, rankings: [], weights: [] }
    },
    'getAudienceVoteRanking'
  )
}

export async function getAudienceSeats(roundId: string): Promise<AudienceSeatsResponse> {
  return safeCall(
    () => doRequest<AudienceSeatsResponse>(`/admin/audience-vote/seats?roundId=${roundId}`),
    async () => ({ success: true, seats: [], totalSeats: 0 }),
    'getAudienceSeats'
  )
}

// 选手端查看评审席（不需要 admin 权限）
export async function getPlayerAudienceSeats(roundId: string): Promise<AudienceSeatsResponse> {
  return safeCall(
    () => doRequest<AudienceSeatsResponse>(`/audience-vote/player-seats?roundId=${roundId}`),
    async () => ({ success: true, seats: [], totalSeats: 0 }),
    'getPlayerAudienceSeats'
  )
}

// 选手端查看单个评审投票详情
export async function getPlayerAudienceSeatDetail(roundId: string, seatNumber: number): Promise<AudienceVoteDetailResponse> {
  return safeCall(
    () => doRequest<AudienceVoteDetailResponse>(`/audience-vote/player-seat/${seatNumber}?roundId=${roundId}`),
    async () => ({ success: true } as any),
    'getPlayerAudienceSeatDetail'
  )
}

export async function getAudienceVoteDetail(roundId: string, seatNumber: number): Promise<AudienceVoteDetailResponse> {
  return safeCall(
    () => doRequest<AudienceVoteDetailResponse>(`/admin/audience-vote/seat/${seatNumber}?roundId=${roundId}`),
    async () => ({ success: true, seat: null!, detail: null! } as any),
    'getAudienceVoteDetail'
  )
}

export async function saveAudienceVoteDetail(roundId: string, seatNumber: number, playerIds: string[]): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/admin/audience-vote/seat/${seatNumber}`, {
      method: 'PUT',
      body: JSON.stringify({ roundId, playerIds })
    }),
    async () => {},
    'saveAudienceVoteDetail'
  )
}

export async function clearAudienceVote(roundId: string): Promise<void> {
  return safeCall(
    () => doRequest<void>('/admin/audience-vote/', {
      method: 'DELETE',
      body: JSON.stringify({ roundId })
    }),
    async () => {
      localStorage.removeItem(`luck_sim_audience_vote_${roundId}`)
    },
    'clearAudienceVote'
  )
}

export async function releaseAudienceVote(roundId: string, rankings?: any[]): Promise<any> {
  return safeCall(
    () => doRequest<any>('/admin/audience-vote/release', {
      method: 'POST',
      body: JSON.stringify({ roundId, rankings })
    }),
    async () => {
      const finalKey = `luck_sim_audience_final_${roundId}`
      localStorage.setItem(finalKey, JSON.stringify({ rankings, releasedAt: new Date().toISOString() }))
      return { success: true, released: true }
    },
    'releaseAudienceVote'
  )
}

export async function getAudienceFinalRanking(roundId: string): Promise<any> {
  return safeCall(
    () => doRequest<any>(`/audience-vote/final-ranking?roundId=${roundId}`),
    async () => {
      const finalKey = `luck_sim_audience_final_${roundId}`
      const stored = localStorage.getItem(finalKey)
      return stored ? JSON.parse(stored) : { rankings: [] }
    },
    'getAudienceFinalRanking'
  )
}

// ================== 淘汰 ==================

export async function getEliminationStats(round?: number): Promise<EliminationStats> {
  return safeCall(
    () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return doRequest<EliminationStats>(`/elimination/stats${query}`)
    },
    async () => ({ totalPlayers: 0, eliminatedCount: 0, activeCount: 0, eliminationRate: 0, currentRound: 1, eliminatedList: [] }),
    'getEliminationStats'
  )
}

export async function getEliminationRecords(round?: number): Promise<EliminationRecord[]> {
  return safeCall(
    () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return doRequest<EliminationRecord[]>(`/elimination/history${query}`)
    },
    async () => [],
    'getEliminationRecords'
  )
}

export async function getEliminationHistory(): Promise<EliminationRecord[]> {
  return safeCall(
    () => doRequest<EliminationRecord[]>('/elimination/history'),
    async () => [],
    'getEliminationHistory'
  )
}

export async function getRanking(round?: number): Promise<RankingListResponse> {
  return safeCall(
    () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return doRequest<RankingListResponse>(`/elimination/ranking${query}`)
    },
    async () => ({ rankings: [] }),
    'getRanking'
  )
}

export async function getEliminationCandidates(round?: number): Promise<EliminationCandidate[]> {
  return safeCall(
    () => {
      const query = round !== undefined ? `?round=${round}` : ''
      return doRequest<EliminationCandidate[]>(`/elimination/candidates${query}`)
    },
    async () => [],
    'getEliminationCandidates'
  )
}

export async function manualEliminate(params: ManualEliminateParams): Promise<ManualEliminateResult> {
  return safeCall(
    () => doRequest<ManualEliminateResult>('/elimination/manual', {
      method: 'POST',
      body: JSON.stringify({ playerIds: params.userIds, reason: params.reason, round: params.round })
    }),
    async () => ({ round: params.round || 1, eliminatedList: [], eliminatedCount: 0, failedList: [], failedCount: 0 }),
    'manualEliminate'
  )
}

export async function restorePlayer(userId: string): Promise<RestoreResult> {
  return safeCall(
    () => doRequest<RestoreResult>(`/elimination/restore/${userId}`, { method: 'POST' }),
    async () => ({ userId, name: '', status: 'active' }),
    'restorePlayer'
  )
}

// ================== 日志 ==================

export async function getLogs(): Promise<OperationLog[]> {
  return safeCall(
    () => doRequest<OperationLog[]>('/logs'),
    mockGetLogs,
    'getLogs'
  )
}

export async function addLogAPI(log: Omit<OperationLog, 'id' | 'createdAt'>): Promise<void> {
  return safeCall(
    async () => {
      await doRequest<void>('/logs', { method: 'POST', body: JSON.stringify(log) })
    },
    async () => { mockAddLog(log) },
    'addLog'
  )
}

// ================== 聊天 ==================

export async function getChatMessages(params?: { page?: number; pageSize?: number; keyword?: string }): Promise<{ messages: any[]; total: number }> {
  return safeCall(
    async () => {
      const query = new URLSearchParams()
      if (params?.page) query.append('page', String(params.page))
      if (params?.pageSize) query.append('pageSize', String(params.pageSize))
      if (params?.keyword) query.append('keyword', params.keyword)
      const qs = query.toString()
      return await doRequest(`/chat/messages${qs ? '?' + qs : ''}`)
    },
    async () => ({ messages: [], total: 0 }),
    'getChatMessages'
  )
}

export async function sendChatMessage(content: string): Promise<any> {
  return safeCall(
    () => doRequest('/chat/messages', { method: 'POST', body: JSON.stringify({ content }) }),
    async () => ({ id: 'mock-' + Date.now(), content, createdAt: new Date().toISOString() }),
    'sendChatMessage'
  )
}

export async function deleteChatMessage(id: string): Promise<void> {
  return safeCall(
    () => doRequest<void>(`/chat/messages/${id}`, { method: 'DELETE' }),
    async () => {},
    'deleteChatMessage'
  )
}

export async function clearChatMessages(): Promise<void> {
  return safeCall(
    () => doRequest<void>('/chat/messages', { method: 'DELETE' }),
    async () => {},
    'clearChatMessages'
  )
}

export async function getUnreadChatCount(): Promise<number> {
  return safeCall(
    () => doRequest<number>('/chat/messages/unread-count'),
    async () => 0,
    'getUnreadChatCount'
  )
}
