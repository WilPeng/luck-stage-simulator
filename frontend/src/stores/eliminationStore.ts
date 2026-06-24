import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  EliminationStats,
  EliminationRecord,
  RankingListResponse,
  EliminationCandidate,
  ManualEliminateParams
} from '../types/elimination'
import {
  getEliminationStats as apiGetStats,
  getEliminationRecords as apiGetRecords,
  getEliminationHistory as apiGetHistory,
  getRanking as apiGetRanking,
  getEliminationCandidates as apiGetCandidates,
  manualEliminate as apiManualEliminate,
  restorePlayer as apiRestore
} from '../services/api'

export const useEliminationStore = defineStore('elimination', () => {
  const stats = ref<EliminationStats | null>(null)
  const records = ref<EliminationRecord[]>([])
  const rankingData = ref<RankingListResponse | null>(null)
  const candidates = ref<EliminationCandidate[]>([])
  const history = ref<EliminationRecord[]>([])
  const loading = ref(false)

  const ranking = computed(() => rankingData.value?.rankings || [])
  const activeRanking = computed(() => ranking.value.filter(e => e.status !== 'eliminated'))
  const eliminatedRanking = computed(() => ranking.value.filter(e => e.status === 'eliminated'))
  const dangerRanking = computed(() => ranking.value.filter(e => e.status === 'danger'))

  async function fetchStats(round?: number): Promise<void> {
    loading.value = true
    try {
      stats.value = await apiGetStats(round)
    } catch (e) {
      stats.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchRecords(round?: number): Promise<void> {
    loading.value = true
    try {
      records.value = await apiGetRecords(round)
    } catch (e) {
      records.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchHistory(): Promise<void> {
    loading.value = true
    try {
      history.value = await apiGetHistory()
    } catch (e) {
      history.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchRanking(round?: number): Promise<void> {
    loading.value = true
    try {
      rankingData.value = await apiGetRanking(round)
    } catch (e) {
      rankingData.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchCandidates(round?: number): Promise<void> {
    loading.value = true
    try {
      candidates.value = await apiGetCandidates(round)
    } catch (e) {
      candidates.value = []
    } finally {
      loading.value = false
    }
  }

  async function manualEliminate(round: number, userIds: string[], reason?: string): Promise<void> {
    loading.value = true
    try {
      const params: ManualEliminateParams = { userIds, reason, round }
      await apiManualEliminate(params)
      await Promise.all([fetchStats(round), fetchRecords(round), fetchHistory(), fetchRanking(round), fetchCandidates(round)])
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  async function restore(userId: string): Promise<void> {
    loading.value = true
    try {
      await apiRestore(userId)
      await Promise.all([fetchStats(), fetchRecords(), fetchHistory(), fetchRanking(), fetchCandidates()])
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchAll(round?: number): Promise<void> {
    loading.value = true
    try {
      await Promise.all([
        fetchStats(round),
        fetchRecords(round),
        fetchHistory(),
        fetchRanking(round),
        fetchCandidates(round)
      ])
    } catch (e) {
      // 子方法已处理各自的异常
    } finally {
      loading.value = false
    }
  }

  return {
    stats,
    records,
    rankingData,
    candidates,
    history,
    loading,
    ranking,
    activeRanking,
    eliminatedRanking,
    dangerRanking,
    fetchStats,
    fetchRecords,
    fetchHistory,
    fetchRanking,
    fetchCandidates,
    manualEliminate,
    restore,
    fetchAll
  }
})
