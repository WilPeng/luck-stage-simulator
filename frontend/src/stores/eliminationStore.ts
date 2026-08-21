import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  EliminationStats,
  EliminationRecord,
  RankingListResponse,
  EliminationCandidate,
  ManualEliminateParams,
  DangerStatus,
  DangerQueueEntry,
  EliminationPk,
  ConfirmDangerParams,
  StartPkParams,
  ResolvePkResult
} from '../types/elimination'
import {
  getEliminationStats as apiGetStats,
  getEliminationRecords as apiGetRecords,
  getEliminationHistory as apiGetHistory,
  getRanking as apiGetRanking,
  getEliminationCandidates as apiGetCandidates,
  manualEliminate as apiManualEliminate,
  restorePlayer as apiRestore,
  confirmDangerList as apiConfirmDanger,
  getDangerStatus as apiGetDangerStatus,
  getPkQueue as apiGetPkQueue,
  startPk as apiStartPk,
  generatePkVotes as apiGeneratePkVotes,
  resolvePk as apiResolvePk,
  stopElimination as apiStopElimination
} from '../services/api'

export const useEliminationStore = defineStore('elimination', () => {
  const stats = ref<EliminationStats | null>(null)
  const records = ref<EliminationRecord[]>([])
  const rankingData = ref<RankingListResponse | null>(null)
  const candidates = ref<EliminationCandidate[]>([])
  const history = ref<EliminationRecord[]>([])
  const loading = ref(false)

  // 危险名单与 PK 状态
  const dangerStatus = ref<DangerStatus | null>(null)
  const pkQueue = ref<DangerQueueEntry[]>([])
  const currentPk = ref<EliminationPk | null>(null)
  const pkHistory = ref<EliminationPk[]>([])

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

  // ================== 危险名单与 PK ==================

  async function fetchDangerStatus(round?: number): Promise<void> {
    loading.value = true
    try {
      dangerStatus.value = await apiGetDangerStatus(round)
    } catch (e) {
      dangerStatus.value = null
    } finally {
      loading.value = false
    }
  }

  async function fetchPkQueue(round?: number): Promise<void> {
    try {
      pkQueue.value = await apiGetPkQueue(round)
    } catch (e) {
      pkQueue.value = []
    }
  }

  async function doConfirmDanger(params: ConfirmDangerParams): Promise<void> {
    loading.value = true
    try {
      await apiConfirmDanger(params)
      await Promise.all([fetchDangerStatus(params.round), fetchPkQueue(params.round)])
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  async function doStartPk(params: StartPkParams): Promise<void> {
    loading.value = true
    try {
      currentPk.value = await apiStartPk(params)
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  async function doGeneratePkVotes(pkId: string): Promise<void> {
    loading.value = true
    try {
      currentPk.value = await apiGeneratePkVotes(pkId)
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  async function doResolvePk(pkId: string, decisions: Record<string, 'safe' | 'pending' | 'eliminated'>): Promise<void> {
    loading.value = true
    try {
      const result: ResolvePkResult = await apiResolvePk(pkId, decisions)
      currentPk.value = null
      await Promise.all([fetchDangerStatus(result.pk.roundIndex), fetchPkQueue(result.pk.roundIndex), fetchRecords(result.pk.roundIndex)])
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  async function doStopElimination(round: number): Promise<void> {
    loading.value = true
    try {
      await apiStopElimination(round)
      await Promise.all([fetchDangerStatus(round), fetchPkQueue(round)])
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  async function loadPkHistory(round: number): Promise<void> {
    try {
      // 从后端获取该轮全部 PK 记录（通过 danger status 的 queue 与 resolved 推导，
      // 简化处理：此处调用 getDangerStatus 后由前端推导，或后续扩展专用接口）
      const status = await apiGetDangerStatus(round)
      pkHistory.value = []
      if (status?.pendingPk) {
        currentPk.value = status.pendingPk
      }
    } catch (e) {
      pkHistory.value = []
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
    // 危险名单与 PK
    dangerStatus,
    pkQueue,
    currentPk,
    pkHistory,
    fetchStats,
    fetchRecords,
    fetchHistory,
    fetchRanking,
    fetchCandidates,
    manualEliminate,
    restore,
    fetchAll,
    fetchDangerStatus,
    fetchPkQueue,
    doConfirmDanger,
    doStartPk,
    doGeneratePkVotes,
    doResolvePk,
    doStopElimination,
    loadPkHistory
  }
})
