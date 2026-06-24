import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  TeamResult,
  PlayerResult,
  PerformanceConfig,
  PerformanceStats,
  PerformanceHistory,
  CalculatePerformanceResult,
  RehearsalResult,
  SafeTeamMark,
  SafeTeamMarkRequest,
  TeamPerformanceResult,
  PlayerPerformanceResult,
  CalculatePerformanceResponse,
  AudienceVoteRankingItem,
  PlayerPopularityWeight,
  AudienceSeat,
  AudienceVoteDetail
} from '../types/performance'
import {
  getPerformanceResults,
  getPlayerScores,
  getPerformanceStats,
  getPerformanceConfig,
  updatePerformanceConfig,
  calculatePerformance,
  getPerformanceHistory,
  getRehearsalResults,
  startRehearsalAPI,
  markSafeTeams as apiMarkSafeTeams,
  getSafeTeams,
  generateAudienceVote,
  getAudienceVoteRanking,
  getAudienceSeats,
  getAudienceVoteDetail,
  saveAudienceVoteDetail,
  clearAudienceVote,
  releaseAudienceVote,
  getAudienceFinalRanking
} from '../services/api'
import { doRequest } from '../services/api'

export const usePerformanceStore = defineStore('performance', () => {
  // 状态
  const teamResults = ref<TeamResult[]>([])
  const playerResults = ref<PlayerResult[]>([])
  const stats = ref<PerformanceStats | null>(null)
  const config = ref<PerformanceConfig | null>(null)
  const history = ref<PerformanceHistory[]>([])
  const rehearsalResults = ref<RehearsalResult[]>([])
  const safeTeams = ref<SafeTeamMark[]>([])
  const loading = ref(false)
  const currentRound = ref<number>(1)

  // 新结构的状态
  const teamPerformanceResults = ref<TeamPerformanceResult[]>([])
  const playerPerformanceResults = ref<PlayerPerformanceResult[]>([])

  // 大众评审喜爱度投票状态
  const audienceVoteLoading = ref(false)
  const audienceVoteGenerated = ref(false)
  const audienceVoteReleased = ref(false)
  const audienceTotalVotes = ref(0)
  const audienceTotalAudience = ref(0)
  const audienceRankings = ref<AudienceVoteRankingItem[]>([])
  const audienceWeights = ref<PlayerPopularityWeight[]>([])
  const audienceSeats = ref<AudienceSeat[]>([])
  const selectedAudienceDetail = ref<AudienceVoteDetail | null>(null)

  // 计算属性
  const hasResults = computed(() => teamResults.value.length > 0 || teamPerformanceResults.value.length > 0)

  const sortedTeamResults = computed(() =>
    [...teamResults.value].sort((a, b) => a.rank - b.rank)
  )

  const sortedPlayerResults = computed(() =>
    [...playerResults.value].sort((a, b) => a.rank - b.rank)
  )

  const topPlayers = computed(() =>
    sortedPlayerResults.value.slice(0, 10)
  )

  const sortedTeamPerformanceResults = computed(() =>
    [...teamPerformanceResults.value].sort((a, b) => a.rank - b.rank)
  )

  const sortedPlayerPerformanceResults = computed(() =>
    [...playerPerformanceResults.value].sort((a, b) => a.rankInTeam - b.rankInTeam)
  )

  // 获取队伍结果
  async function fetchTeamResults(round?: number): Promise<void> {
    loading.value = true
    try {
      if (round !== undefined) currentRound.value = round
      teamResults.value = await getPerformanceResults(round)
    } catch (e) {
      teamResults.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchPlayerResults(round?: number): Promise<void> {
    loading.value = true
    try {
      if (round !== undefined) currentRound.value = round
      playerResults.value = await getPlayerScores(round)
    } catch (e) {
      playerResults.value = []
    } finally {
      loading.value = false
    }
  }

  async function fetchStats(): Promise<void> {
    try {
      stats.value = await getPerformanceStats()
    } catch (e) {
      stats.value = null
    }
  }

  async function fetchConfig(): Promise<void> {
    try {
      config.value = await getPerformanceConfig()
    } catch (e) {
      config.value = null
    }
  }

  async function saveConfig(newConfig: Partial<PerformanceConfig>): Promise<void> {
    try {
      config.value = await updatePerformanceConfig(newConfig)
    } catch (e) {
      throw e
    }
  }

  async function doCalculate(round: number): Promise<CalculatePerformanceResult> {
    loading.value = true
    try {
      const result = await calculatePerformance(round)
      currentRound.value = result.round
      teamResults.value = result.teamResults
      playerResults.value = result.playerResults
      await fetchStats()
      return result
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  // 新的公演结算方法
  async function doCalculateNew(roundId: string): Promise<CalculatePerformanceResponse> {
    loading.value = true
    try {
      const result = await doRequest<CalculatePerformanceResponse>('/performance/calculate', {
        method: 'POST',
        body: JSON.stringify({ roundId })
      })
      
      if (result.success) {
        teamPerformanceResults.value = result.teamResults
        playerPerformanceResults.value = result.playerResults
      }
      
      return result
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  // 获取管理员公演结果
  async function fetchAdminPerformanceResults(roundId: string): Promise<void> {
    loading.value = true
    try {
      const result = await doRequest<CalculatePerformanceResponse>(`/performance/result?roundId=${roundId}`, {
        method: 'GET'
      })
      
      if (result.success) {
        teamPerformanceResults.value = result.teamResults
        playerPerformanceResults.value = result.playerResults
      }
    } catch (e) {
      console.error('Failed to fetch admin performance results:', e)
      teamPerformanceResults.value = []
      playerPerformanceResults.value = []
    } finally {
      loading.value = false
    }
  }

  // 获取选手公演结果
  async function fetchPlayerPerformanceResults(roundId: string): Promise<void> {
    loading.value = true
    try {
      const result = await doRequest<CalculatePerformanceResponse>(`/player/performance/result?roundId=${roundId}`, {
        method: 'GET'
      })
      
      if (result.success) {
        teamPerformanceResults.value = result.teamResults
        playerPerformanceResults.value = result.playerResults
      }
    } catch (e) {
      console.error('Failed to fetch player performance results:', e)
      teamPerformanceResults.value = []
      playerPerformanceResults.value = []
    } finally {
      loading.value = false
    }
  }

  // ================== 大众评审喜爱度投票 ==================

  async function generateAudienceVotes(roundId: string, weights?: PlayerPopularityWeight[]): Promise<boolean> {
    audienceVoteLoading.value = true
    try {
      const result = await generateAudienceVote(roundId, weights)
      if (result.success) {
        audienceVoteGenerated.value = true
        audienceTotalAudience.value = result.totalAudience
        audienceTotalVotes.value = result.totalVotes
        audienceRankings.value = result.rankings
        audienceWeights.value = result.weights
      }
      return result.success
    } catch (e: any) {
      console.error('Failed to generate audience votes:', e)
      // 提取后端返回的业务错误信息
      const errorMsg = e.message || ''
      if (errorMsg.includes('NO_PERFORMANCE_RESULT') || errorMsg.includes('尚未生成选手公演结果')) {
        MessagePlugin.error('请先完成公演结算，生成选手公演结果后再生成大众评审投票')
      } else {
        MessagePlugin.error('生成大众评审投票失败: ' + errorMsg)
      }
      return false
    } finally {
      audienceVoteLoading.value = false
    }
  }

  async function fetchAudienceVoteRankings(roundId: string): Promise<void> {
    audienceVoteLoading.value = true
    try {
      const result = await getAudienceVoteRanking(roundId)
      
      // 兼容后端不同的响应格式
      // 后端可能直接返回数据，或者通过 doRequest 包装后返回
      const data = result.data || result
      
      if (data && (data.success === true || result.success === true)) {
        const rankings = data.rankings || result.rankings || []
        const weights = data.weights || result.weights || []
        
        audienceVoteGenerated.value = rankings.length > 0
        audienceTotalAudience.value = data.totalAudience || result.totalAudience || 0
        audienceTotalVotes.value = data.totalVotes || result.totalVotes || 0
        audienceRankings.value = rankings
        audienceWeights.value = weights
        
        console.log('[PerformanceStore] 获取喜爱度排名成功:', rankings.length, '条记录')
      } else {
        console.warn('[PerformanceStore] 获取喜爱度排名失败:', result)
        audienceRankings.value = []
        audienceWeights.value = []
      }
    } catch (e: any) {
      console.error('Failed to fetch audience vote rankings:', e)
      // 如果后端返回错误，但数据可能已经生成，尝试从 localStorage 读取
      if (e.message && e.message.includes('NO_PERFORMANCE_RESULT')) {
        MessagePlugin.warning('该轮尚未生成选手公演结果，无法获取大众评审投票')
      }
      audienceRankings.value = []
      audienceWeights.value = []
    } finally {
      audienceVoteLoading.value = false
    }
  }

  async function fetchAudienceSeats(roundId: string): Promise<void> {
    audienceVoteLoading.value = true
    try {
      const result = await getAudienceSeats(roundId)
      if (result.success) {
        audienceSeats.value = result.seats
      }
    } catch (e) {
      console.error('Failed to fetch audience seats:', e)
      audienceSeats.value = []
    } finally {
      audienceVoteLoading.value = false
    }
  }

  async function fetchAudienceVoteDetail(roundId: string, seatNumber: number): Promise<void> {
    try {
      const result = await getAudienceVoteDetail(roundId, seatNumber)
      if (result.success) {
        selectedAudienceDetail.value = result.detail
      }
    } catch (e) {
      console.error('Failed to fetch audience vote detail:', e)
      selectedAudienceDetail.value = null
    }
  }

  async function saveAudienceSeatVotes(roundId: string, seatNumber: number, playerIds: string[]): Promise<boolean> {
    try {
      const result = await saveAudienceVoteDetail(roundId, seatNumber, playerIds)
      return result.success
    } catch (e) {
      console.error('Failed to save audience seat votes:', e)
      return false
    }
  }

  async function clearAudienceVoteData(roundId: string): Promise<boolean> {
    try {
      const result = await clearAudienceVote(roundId)
      return result.success
    } catch (e) {
      console.error('Failed to clear audience vote:', e)
      return false
    }
  }

  async function releaseFinalRanking(roundId: string): Promise<boolean> {
    try {
      const result = await releaseAudienceVote(roundId, audienceRankings.value)
      // 后端返回的 data 可能包含 released: true，或者直接返回 { success: true }
      // 需要兼容两种格式
      if (result && (result.success === true || result.released === true)) {
        audienceVoteReleased.value = true
        return true
      }
      return false
    } catch (e: any) {
      console.error('Failed to release ranking:', e)
      // 检查是否是业务逻辑错误但实际操作成功的情况
      if (e.message && e.message.includes('已释放')) {
        audienceVoteReleased.value = true
        return true
      }
      return false
    }
  }

  async function fetchFinalRanking(roundId: string): Promise<boolean> {
    try {
      const result = await getAudienceFinalRanking(roundId)
      if (result.released) {
        audienceVoteGenerated.value = true
        audienceRankings.value = result.rankings
      }
      return result.released
    } catch (e) {
      console.error('Failed to fetch final ranking:', e)
      return false
    }
  }

  // 获取当前登录用户在喜爱度榜中的排名
  function getAudienceRankByPlayerId(playerId: string): AudienceVoteRankingItem | undefined {
    return audienceRankings.value.find(r => r.playerId === playerId)
  }

  async function fetchHistory(): Promise<void> {
    try {
      history.value = await getPerformanceHistory()
    } catch (e) {
      history.value = []
    }
  }

  async function fetchRehearsals(): Promise<void> {
    try {
      rehearsalResults.value = await getRehearsalResults()
    } catch (e) {
      rehearsalResults.value = []
    }
  }

  async function start(teamId: string): Promise<RehearsalResult> {
    const result = await startRehearsalAPI(teamId)
    const index = rehearsalResults.value.findIndex(item => item.teamId === teamId)
    if (index >= 0) {
      rehearsalResults.value[index] = result
    } else {
      rehearsalResults.value.push(result)
    }
    return result
  }

  function getTeamRehearsal(teamId: string): RehearsalResult | null {
    return rehearsalResults.value.find(item => item.teamId === teamId) || null
  }

  // 安全团相关方法
  async function fetchSafeTeams(round?: number): Promise<void> {
    if (round === undefined) round = currentRound.value
    try {
      safeTeams.value = await getSafeTeams(round)
    } catch (e) {
      safeTeams.value = []
    }
  }

  async function doMarkSafeTeams(params: SafeTeamMarkRequest): Promise<void> {
    await apiMarkSafeTeams(params)
    await fetchSafeTeams(params.round)
  }

  function isTeamSafe(teamId: string): boolean {
    return safeTeams.value.some(st => st.teamId === teamId)
  }

  // 获取队伍结果（通过teamId）
  function getTeamResult(teamId: string): TeamResult | undefined {
    return teamResults.value.find(r => r.teamId === teamId)
  }

  // 获取选手结果（通过userId）
  function getPlayerResult(userId: string): PlayerResult | undefined {
    return playerResults.value.find(r => r.userId === userId)
  }

  // 获取选手结果（通过teamId）
  function getPlayerResultsByTeam(teamId: string): PlayerResult[] {
    return playerResults.value.filter(r => r.teamId === teamId)
  }

  // 获取队伍公演结果（新结构）
  function getTeamPerformanceResult(teamId: string): TeamPerformanceResult | undefined {
    return teamPerformanceResults.value.find(r => r.teamId === teamId)
  }

  // 获取选手公演结果（新结构）
  function getPlayerPerformanceResult(playerId: string): PlayerPerformanceResult | undefined {
    return playerPerformanceResults.value.find(r => r.playerId === playerId)
  }

  // 获取队伍的所有选手公演结果
  function getPlayerPerformanceResultsByTeam(teamId: string): PlayerPerformanceResult[] {
    return playerPerformanceResults.value.filter(r => r.teamId === teamId)
  }

  // 初始化（获取所有数据）
  async function initialize(round?: number): Promise<void> {
    loading.value = true
    try {
      if (round !== undefined) currentRound.value = round
      await Promise.all([
        fetchTeamResults(round),
        fetchPlayerResults(round),
        fetchStats(),
        fetchConfig(),
        fetchSafeTeams(round)
      ])
    } catch (e) {
      // 子方法已处理各自的异常
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    teamResults,
    playerResults,
    stats,
    config,
    history,
    rehearsalResults,
    safeTeams,
    loading,
    currentRound,
    teamPerformanceResults,
    playerPerformanceResults,
    // 大众评审投票状态
    audienceVoteLoading,
    audienceVoteGenerated,
    audienceVoteReleased,
    audienceTotalVotes,
    audienceTotalAudience,
    audienceRankings,
    audienceWeights,
    audienceSeats,
    selectedAudienceDetail,
    // 计算属性
    hasResults,
    sortedTeamResults,
    sortedPlayerResults,
    topPlayers,
    sortedTeamPerformanceResults,
    sortedPlayerPerformanceResults,
    // 方法
    fetchTeamResults,
    fetchPlayerResults,
    fetchStats,
    fetchConfig,
    saveConfig,
    doCalculate,
    doCalculateNew,
    fetchAdminPerformanceResults,
    fetchPlayerPerformanceResults,
    generateAudienceVotes,
    fetchAudienceVoteRankings,
    fetchAudienceSeats,
    fetchAudienceVoteDetail,
    saveAudienceSeatVotes,
    clearAudienceVoteData,
    releaseFinalRanking,
    fetchFinalRanking,
    getAudienceRankByPlayerId,
    fetchHistory,
    fetchRehearsals,
    fetchSafeTeams,
    doMarkSafeTeams,
    isTeamSafe,
    start,
    getTeamRehearsal,
    getTeamResult,
    getPlayerResult,
    getPlayerResultsByTeam,
    getTeamPerformanceResult,
    getPlayerPerformanceResult,
    getPlayerPerformanceResultsByTeam,
    initialize
  }
})
