import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { RoundTeam, RoundTeamMember } from '../types/round'
import type { User } from '../types/user'
import {
  getRoundTeams as apiGetRoundTeams,
  setupRoundTeams as apiSetupRoundTeams,
  randomAssignTeams as apiRandomAssignTeams,
  manualAssignTeams as apiManualAssignTeams,
  setTeamCaptain as apiSetTeamCaptain,
  getUnassignedPlayers as apiGetUnassignedPlayers,
  getRoundTeamStats as apiGetRoundTeamStats,
  addMember as apiAddMember,
  removeMember as apiRemoveMember,
  lockTeamAPI as apiLockTeam,
  unlockTeamAPI as apiUnlockTeam,
  deleteTeam as apiDeleteTeam,
  updateTeam as apiUpdateTeam
} from '../services/api'
import { getTeams as dsGetTeams, saveTeams as dsSaveTeams, updateTeam as dsUpdateTeam, addTeamMember as dsAddTeamMember, removeTeamMember as dsRemoveTeamMember } from '../services/dataService'
import { useSeasonStore } from './seasonStore'

export const useTeamStore = defineStore('team', () => {
  const teams = ref<RoundTeam[]>([])
  const unassignedPlayers = ref<User[]>([])
  const teamStats = ref<{
    totalTeams: number
    totalMembers: number
    unassignedCount: number
    averageMembersPerTeam: number
  } | null>(null)
  const loading = ref(false)
  // 记录当前已加载的 roundId，避免重复拉取覆盖已有数据
  const loadedRoundId = ref<string>('')

  const seasonStore = useSeasonStore()

  // 获取当前轮次的 roundId
  const currentRoundId = computed(() => seasonStore.currentRoundId)

  // 获取指定轮次的所有队伍
  async function fetchTeams(roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      console.warn('[TeamStore] No roundId provided')
      return
    }

    loading.value = true
    try {
      const data = await apiGetRoundTeams(rid)
      // 始终信任 API 返回的当前轮次数据
      teams.value = data
      // 同时备份到 dataService 作为离线回退（不同轮次 key 不同，天然隔离）
      if (data.length > 0) {
        dsSaveTeams(rid, data)
      }
    } catch (e) {
      console.error('[TeamStore] fetchTeams error:', e)
      // API 失败时用 dataService 作为离线回退
      const backup = dsGetTeams(rid)
      teams.value = backup
    } finally {
      loading.value = false
    }
  }

  // 获取未入队的选手
  async function fetchUnassignedPlayers(roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      console.warn('[TeamStore] No roundId provided')
      return
    }

    try {
      const data = await apiGetUnassignedPlayers(rid)
      unassignedPlayers.value = data
    } catch (e) {
      console.error('[TeamStore] fetchUnassignedPlayers error:', e)
      unassignedPlayers.value = []
    }
  }

  // 获取队伍统计
  async function fetchTeamStats(roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      console.warn('[TeamStore] No roundId provided')
      return
    }

    try {
      const data = await apiGetRoundTeamStats(rid)
      teamStats.value = data
    } catch (e) {
      console.error('[TeamStore] fetchTeamStats error:', e)
      teamStats.value = null
    }
  }

  // 配置本轮分组
  async function setupTeamConfig(params: {
    teamCount: number
    teamSizes: number[]
    teamNames?: string[]
  }, roundId?: string): Promise<RoundTeam[]> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiSetupRoundTeams({
        roundId: rid,
        ...params
      })
      // 强制清除新创建队伍的 captainId 和 members，确保从干净状态开始
      const cleanTeams = result.map(t => ({
        ...t,
        captainId: undefined as string | undefined | null,
        members: []
      }))
      dsSaveTeams(rid, cleanTeams)
      teams.value = cleanTeams
      loadedRoundId.value = rid
      return result
    } catch (e) {
      console.error('[TeamStore] setupTeamConfig error:', e)
      throw e
    }
  }

  // 随机分配未入队的选手
  async function randomAssign(roundId?: string): Promise<RoundTeam[]> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiRandomAssignTeams(rid)
      await fetchTeams(rid)
      await fetchUnassignedPlayers(rid)
      return result
    } catch (e) {
      console.error('[TeamStore] randomAssign error:', e)
      throw e
    }
  }

  // 手动设置整轮分组
  async function manualAssign(assignments: Array<{ teamId: string; playerIds: string[] }>, roundId?: string): Promise<RoundTeam[]> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiManualAssignTeams({
        roundId: rid,
        assignments
      })
      await fetchTeams(rid)
      await fetchUnassignedPlayers(rid)
      return result
    } catch (e) {
      console.error('[TeamStore] manualAssign error:', e)
      throw e
    }
  }

  // 设置队长
  async function assignCaptain(teamId: string, playerId: string, roundId?: string): Promise<RoundTeam> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiSetTeamCaptain(teamId, playerId)
      // 保存队长设置到 dataService
      dsUpdateTeam(rid, teamId, { captainId: playerId })
      await fetchTeams(rid)
      return result
    } catch (e) {
      console.error('[TeamStore] assignCaptain error:', e)
      throw e
    }
  }

  // 根据 ID 获取队伍
  function getTeamById(id: string): RoundTeam | undefined {
    return teams.value.find(t => t.id === id)
  }

  // 获取用户所在的队伍
  function getUserTeams(userId: string): RoundTeam[] {
    return teams.value.filter(t => 
      t.members?.some(m => m.playerId === userId) || false
    )
  }

  // 获取队长信息
  function getTeamCaptain(team: RoundTeam): RoundTeamMember | undefined {
    if (!team.captainId) return undefined
    return team.members?.find(m => m.playerId === team.captainId)
  }

  // 获取队伍属性平均值
  function getTeamAttrAverage(team: RoundTeam, attr: 'vocal' | 'dance' | 'charm'): number {
    if (!team.members || team.members.length === 0) return 0
    const total = team.members.reduce((sum, member) => {
      return sum + (member.player?.attributes?.[attr] || 0)
    }, 0)
    return Math.round(total / team.members.length)
  }

  // 添加成员到队伍
  async function addMember(teamId: string, userId: string, roundId?: string): Promise<RoundTeam> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiAddMember(teamId, userId)
      // 同步到 dataService
      dsAddTeamMember(rid, teamId, { id: `rtm-${teamId}-${userId}`, roundId: rid, teamId, playerId: userId } as any)
      await fetchTeams(rid)
      await fetchUnassignedPlayers(rid)
      return result
    } catch (e) {
      console.error('[TeamStore] addMember error:', e)
      throw e
    }
  }

  // 从队伍移除成员
  async function removeMember(teamId: string, userId: string, roundId?: string): Promise<RoundTeam> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiRemoveMember(teamId, userId)
      // 同步到 dataService
      dsRemoveTeamMember(rid, teamId, userId)
      await fetchTeams(rid)
      await fetchUnassignedPlayers(rid)
      return result
    } catch (e) {
      console.error('[TeamStore] removeMember error:', e)
      throw e
    }
  }

  // 锁定队伍
  async function lockTeam(teamId: string, roundId?: string): Promise<RoundTeam> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiLockTeam(teamId)
      dsUpdateTeam(rid, teamId, { locked: true })
      await fetchTeams(rid)
      return result
    } catch (e) {
      console.error('[TeamStore] lockTeam error:', e)
      throw e
    }
  }

  // 解锁队伍
  async function unlockTeam(teamId: string, roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      await apiUnlockTeam(teamId)
      dsUpdateTeam(rid, teamId, { locked: false })
      await fetchTeams(rid)
    } catch (e) {
      console.error('[TeamStore] unlockTeam error:', e)
      throw e
    }
  }

  // 删除队伍
  async function deleteTeam(teamId: string, roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      await apiDeleteTeam(teamId)
      // 从 dataService 中移除该队伍
      const current = dsGetTeams(rid).filter(t => t.id !== teamId)
      dsSaveTeams(rid, current)
      await fetchTeams(rid)
    } catch (e) {
      console.error('[TeamStore] deleteTeam error:', e)
      throw e
    }
  }

  // 更新队伍名称
  async function updateTeamName(teamId: string, name: string, roundId?: string): Promise<RoundTeam> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    try {
      const result = await apiUpdateTeam(teamId, { name })
      await fetchTeams(rid)
      return result
    } catch (e) {
      console.error('[TeamStore] updateTeamName error:', e)
      throw e
    }
  }

  // 清空当前数据
  function clearData() {
    teams.value = []
    unassignedPlayers.value = []
    teamStats.value = null
    loadedRoundId.value = ''
  }

  return {
    teams,
    unassignedPlayers,
    teamStats,
    loading,
    currentRoundId,
    fetchTeams,
    fetchUnassignedPlayers,
    fetchTeamStats,
    setupTeamConfig,
    randomAssign,
    manualAssign,
    assignCaptain,
    addMember,
    removeMember,
    lockTeam,
    unlockTeam,
    deleteTeam,
    updateTeamName,
    getTeamById,
    getUserTeams,
    getTeamCaptain,
    getTeamAttrAverage,
    clearData
  }
})
