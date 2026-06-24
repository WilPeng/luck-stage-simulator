import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Song } from '../types/round'
import type { RoundSong, TeamSong } from '../types/round'
import {
  getSongs as apiGetSongs,
  getRoundSongs as apiGetRoundSongs,
  addRoundSongs as apiAddRoundSongs,
  assignTeamSongs as apiAssignTeamSongs,
  getTeamSongs as apiGetTeamSongs,
  releaseSong as apiReleaseSong,
  claimSong as apiClaimSong
} from '../services/api'
import { getTeamSongs as dsGetTeamSongs, saveTeamSongs as dsSaveTeamSongs, assignSongToTeam as dsAssignSongToTeam, getRoundSongs as dsGetRoundSongs, saveRoundSongs as dsSaveRoundSongs } from '../services/dataService'
import { useSeasonStore } from './seasonStore'

export const useSongStore = defineStore('song', () => {
  const songs = ref<Song[]>([])
  const roundSongs = ref<RoundSong[]>([])
  const teamSongs = ref<TeamSong[]>([])
  const loading = ref(false)
  // 记录已加载轮次，避免重复拉取覆盖
  const loadedTeamSongsRoundId = ref<string>('')

  const seasonStore = useSeasonStore()

  // 获取当前轮次的 roundId
  const currentRoundId = computed(() => seasonStore.currentRoundId)

  // 获取歌曲库（所有轮次共享）
  async function fetchSongs(): Promise<void> {
    if (songs.value.length > 0) return
    loading.value = true
    try {
      songs.value = await apiGetSongs()
    } catch (e) {
      console.error('[SongStore] fetchSongs error:', e)
      songs.value = []
    } finally {
      loading.value = false
    }
  }

  // 获取本轮可选歌曲清单
  async function fetchRoundSongs(roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      console.warn('[SongStore] No roundId provided')
      return
    }

    loading.value = true
    try {
      roundSongs.value = await apiGetRoundSongs(rid)
    } catch (e) {
      console.error('[SongStore] fetchRoundSongs error:', e)
      roundSongs.value = []
    } finally {
      loading.value = false
    }
  }

  // 获取本轮队伍歌曲分配结果
  async function fetchTeamSongs(roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      console.warn('[SongStore] No roundId provided')
      return
    }

    loading.value = true
    try {
      const data = await apiGetTeamSongs(rid)
      // 始终信任 API 返回的当前轮次数据
      teamSongs.value = data
      if (data.length > 0) {
        dsSaveTeamSongs(rid, data)
      }
    } catch (e) {
      console.error('[SongStore] fetchTeamSongs error:', e)
      const backup = dsGetTeamSongs(rid)
      teamSongs.value = backup
    } finally {
      loading.value = false
    }
  }

  // 把歌曲加入本轮可选清单
  async function addRoundSongs(songIds: string[], roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    loading.value = true
    try {
      const songsToAdd = songIds.map(songId => {
        const song = songs.value.find(s => s.id === songId)
        return {
          songId,
          songType: song?.type || 'team_show'
        }
      })
      await apiAddRoundSongs({ roundId: rid, songs: songsToAdd })
      await fetchRoundSongs(rid)
    } catch (e) {
      console.error('[SongStore] addRoundSongs error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // 正式分配「某队唱某首歌」
  async function assignTeamSongs(assignments: Array<{ teamId: string; songId: string }>, roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    loading.value = true
    try {
      await apiAssignTeamSongs({ roundId: rid, assignments })
      // 同步到 dataService
      for (const a of assignments) {
        dsAssignSongToTeam(rid, a.teamId, a.songId)
      }
      await fetchTeamSongs(rid)
      await fetchRoundSongs(rid) // 刷新以更新 assignedTeamId
    } catch (e) {
      console.error('[SongStore] assignTeamSongs error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // 根据 ID 获取歌曲
  function getSongById(id: string): Song | undefined {
    return songs.value.find(s => s.id === id)
  }

  // 获取某队的歌曲
  function getTeamSong(teamId: string): TeamSong | undefined {
    return teamSongs.value.find(ts => ts.teamId === teamId)
  }

  // 获取未被分配的轮次歌曲
  function getUnassignedRoundSongs(): RoundSong[] {
    return roundSongs.value.filter(rs => !rs.assignedTeamId)
  }

  // 管理员释放歌曲
  async function releaseSong(roundSongId: string, roundId?: string): Promise<void> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    loading.value = true
    try {
      await apiReleaseSong(rid, roundSongId)
      // 同步到 dataService：更新该轮次歌曲的 released 状态
      const currentRoundSongs = dsGetRoundSongs(rid)
      const idx = currentRoundSongs.findIndex((rs: any) => rs.id === roundSongId || rs.songId === roundSongId)
      if (idx >= 0) {
        currentRoundSongs[idx] = { ...currentRoundSongs[idx], released: true }
        dsSaveRoundSongs(rid, currentRoundSongs)
      }
      await fetchRoundSongs(rid)
    } catch (e) {
      console.error('[SongStore] releaseSong error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // 队长抢选歌曲
  async function claimSong(roundSongId: string, teamId: string, roundId?: string): Promise<TeamSong> {
    const rid = roundId || currentRoundId.value
    if (!rid) {
      throw new Error('No roundId provided')
    }

    loading.value = true
    try {
      const result = await apiClaimSong(rid, roundSongId, teamId)
      // 同步到 dataService
      dsAssignSongToTeam(rid, teamId, roundSongId)
      await fetchTeamSongs(rid)
      await fetchRoundSongs(rid)
      return result
    } catch (e) {
      console.error('[SongStore] claimSong error:', e)
      throw e
    } finally {
      loading.value = false
    }
  }

  // 清空当前数据
  function clearData() {
    roundSongs.value = []
    teamSongs.value = []
    loadedTeamSongsRoundId.value = ''
  }

  return {
    songs,
    roundSongs,
    teamSongs,
    loading,
    currentRoundId,
    fetchSongs,
    fetchRoundSongs,
    fetchTeamSongs,
    addRoundSongs,
    assignTeamSongs,
    releaseSong,
    claimSong,
    getSongById,
    getTeamSong,
    getUnassignedRoundSongs,
    clearData
  }
})