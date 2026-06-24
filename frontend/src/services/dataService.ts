/**
 * 数据管理服务
 * 负责按轮次隔离数据，确保每个轮次的数据独立存储和更新
 */

import type { RoundTeam, RoundTeamMember, RoundSong, TeamSong } from '../types/round'
import type { User } from '../types/user'

// 数据存储键前缀
const STORAGE_PREFIX = 'luck_sim_round_'

// 获取存储键
function getStorageKey(roundId: string, dataType: string): string {
  return `${STORAGE_PREFIX}${roundId}_${dataType}`
}

// 保存数据到 localStorage
function saveData<T>(roundId: string, dataType: string, data: T): void {
  const key = getStorageKey(roundId, dataType)
  localStorage.setItem(key, JSON.stringify(data))
}

// 从 localStorage 加载数据
function loadData<T>(roundId: string, dataType: string, defaultVal: T): T {
  const key = getStorageKey(roundId, dataType)
  const item = localStorage.getItem(key)
  if (item) {
    try {
      return JSON.parse(item)
    } catch {
      return defaultVal
    }
  }
  return defaultVal
}

// ==================== 队伍数据管理 ====================

// 获取指定轮次的队伍数据
export function getTeams(roundId: string): RoundTeam[] {
  return loadData<RoundTeam[]>(roundId, 'teams', [])
}

// 保存指定轮次的队伍数据
export function saveTeams(roundId: string, teams: RoundTeam[]): void {
  saveData(roundId, 'teams', teams)
}

// 更新指定轮次的单个队伍
export function updateTeam(roundId: string, teamId: string, updates: Partial<RoundTeam>): RoundTeam | null {
  const teams = getTeams(roundId)
  const index = teams.findIndex(t => t.id === teamId)
  if (index === -1) return null
  
  teams[index] = { ...teams[index], ...updates }
  saveTeams(roundId, teams)
  return teams[index]
}

// 添加成员到指定轮次的队伍
export function addTeamMember(roundId: string, teamId: string, member: RoundTeamMember): boolean {
  const teams = getTeams(roundId)
  const team = teams.find(t => t.id === teamId)
  if (!team) return false
  
  if (!team.members) team.members = []
  team.members.push(member)
  saveTeams(roundId, teams)
  return true
}

// 从指定轮次的队伍移除成员
export function removeTeamMember(roundId: string, teamId: string, playerId: string): boolean {
  const teams = getTeams(roundId)
  const team = teams.find(t => t.id === teamId)
  if (!team || !team.members) return false
  
  team.members = team.members.filter(m => m.playerId !== playerId)
  saveTeams(roundId, teams)
  return true
}

// ==================== 歌曲数据管理 ====================

// 获取指定轮次的队伍歌曲分配
export function getTeamSongs(roundId: string): TeamSong[] {
  return loadData<TeamSong[]>(roundId, 'teamSongs', [])
}

// 保存指定轮次的队伍歌曲分配
export function saveTeamSongs(roundId: string, teamSongs: TeamSong[]): void {
  saveData(roundId, 'teamSongs', teamSongs)
}

// 分配歌曲给指定轮次的队伍
export function assignSongToTeam(roundId: string, teamId: string, songId: string, song?: any): boolean {
  const teamSongs = getTeamSongs(roundId)
  const existing = teamSongs.findIndex(ts => ts.teamId === teamId)
  
  if (existing >= 0) {
    teamSongs[existing] = { ...teamSongs[existing], songId, song }
  } else {
    teamSongs.push({
      id: `ts-${roundId}-${teamId}`,
      roundId,
      teamId,
      songId,
      song
    })
  }
  
  saveTeamSongs(roundId, teamSongs)
  return true
}

// ==================== 选手数据管理 ====================

// 获取所有选手数据
export function getUsers(): User[] {
  const key = 'luck_sim_users'
  const item = localStorage.getItem(key)
  if (item) {
    try {
      return JSON.parse(item)
    } catch {
      return []
    }
  }
  return []
}

// 保存所有选手数据
export function saveUsers(users: User[]): void {
  localStorage.setItem('luck_sim_users', JSON.stringify(users))
}

// ==================== 初始化默认数据 ====================

// 为指定轮次初始化默认数据（如果还没有数据）
export function initRoundData(roundId: string, roundIndex: number): void {
  // 检查是否已有数据
  const existingTeams = getTeams(roundId)
  if (existingTeams.length > 0) {
    return // 已有数据，不需要初始化
  }
  
  // 初始化默认队伍数据
  const defaultTeams: RoundTeam[] = [
    {
      id: `${roundId}-team-1`,
      roundId,
      roundIndex,
      name: '星光队',
      captainId: undefined,
      maxMembers: 4,
      locked: false,
      members: []
    },
    {
      id: `${roundId}-team-2`,
      roundId,
      roundIndex,
      name: '梦想队',
      captainId: undefined,
      maxMembers: 4,
      locked: false,
      members: []
    },
    {
      id: `${roundId}-team-3`,
      roundId,
      roundIndex,
      name: '烈焰队',
      captainId: undefined,
      maxMembers: 4,
      locked: false,
      members: []
    }
  ]
  
  saveTeams(roundId, defaultTeams)
}

// 清除指定轮次的数据（用于重置）
export function clearRoundData(roundId: string): void {
  localStorage.removeItem(getStorageKey(roundId, 'teams'))
  localStorage.removeItem(getStorageKey(roundId, 'teamSongs'))
  localStorage.removeItem(getStorageKey(roundId, 'roundSongs'))
}

// 清除所有轮次的数据
export function clearAllRoundData(): void {
  const keys = []
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.startsWith(STORAGE_PREFIX) || key.startsWith('luck_sim_audience_vote_'))) {
      keys.push(key)
    }
  }
  keys.forEach(key => localStorage.removeItem(key))
}

// ==================== 轮次歌曲（RoundSong）数据管理 ====================

// 获取指定轮次的可选歌曲
export function getRoundSongs(roundId: string): RoundSong[] {
  return loadData<RoundSong[]>(roundId, 'roundSongs', [])
}

// 保存指定轮次的可选歌曲
export function saveRoundSongs(roundId: string, songs: RoundSong[]): void {
  saveData(roundId, 'roundSongs', songs)
}

// 为指定轮次添加一首可选歌曲
export function addRoundSong(roundId: string, song: RoundSong): void {
  const songs = getRoundSongs(roundId)
  songs.push(song)
  saveRoundSongs(roundId, songs)
}

// 批量添加可选歌曲
export function batchAddRoundSongs(roundId: string, songs: RoundSong[]): void {
  const existing = getRoundSongs(roundId)
  const merged = [...existing, ...songs]
  // 去重（按 id）
  const deduped = merged.filter((song, index, self) =>
    index === self.findIndex(s => s.id === song.id)
  )
  saveRoundSongs(roundId, deduped)
}
