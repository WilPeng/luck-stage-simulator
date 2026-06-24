import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { Season, StageType, StageStatus, MatrixCell, MenuItem, ResetSeasonResult, SeasonProgressResponse } from '../types/season'
import type { Round } from '../types/round'
import { STAGE_ORDER, STAGE_NAMES, calculateStageStatus, getNextStage as getNextStageUtil, getStageName } from '../types/season'
import type { RestartResult } from '../services/api'
import {
  getSeason as apiGetSeason,
  getSeasonProgress as apiGetSeasonProgress,
  setStage as apiSetStage,
  nextStage as apiNextStage,
  resetSeason as apiResetSeason,
  restartSeason as apiRestartSeason,
  getMenu as apiGetMenu,
  updateRound as apiUpdateRound,
  getRounds as apiGetRounds
} from '../services/api'

export const useSeasonStore = defineStore('season', () => {
  // ================== 核心状态 ==================
  const season = ref<Season | null>(null)
  const matrix = ref<MatrixCell[]>([])
  const menuItems = ref<MenuItem[]>([])
  const rounds = ref<Round[]>([])
  const loading = ref(false)
  const roundLoading = ref(false)

  // 全局当前轮次状态
  const currentRoundId = ref<string>('')
  const currentRoundIndex = ref<number>(1)

  // ================== 计算属性 ==================

  // 当前轮次
  const currentRoundNumber = computed(() => season.value?.currentRound ?? 1)

  // 当前阶段
  const currentStage = computed(() => season.value?.currentStage ?? 'preparation')

  // 当前阶段名称
  const stageName = computed(() => getStageName(currentStage.value))

  // 总轮次（默认10次公演）
  const totalRounds = computed(() => season.value?.totalRounds ?? 10)

  // 是否已开始公演
  const hasStartedPerformance = computed(() => currentRoundNumber.value > 0)

  // 当前轮次对象
  const currentRound = computed(() => {
    return rounds.value.find(r => r.id === currentRoundId.value) || null
  })

  // ================== 核心方法 ==================

  /**
   * 获取赛程进度（核心接口）
   * 返回当前状态和完整矩阵
   */
  async function fetchProgress(): Promise<void> {
    loading.value = true
    try {
      const data = await apiGetSeasonProgress()
      season.value = {
        id: 'season-1',
        name: '乘风2026',
        currentRound: data.currentRound,
        currentStage: data.currentStage,
        status: 'running',
        totalRounds: 10
      }
      matrix.value = data.matrix
    } catch (e) {
      console.error('[SeasonStore] fetchProgress error:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取用户菜单
   */
  async function fetchMenu(): Promise<void> {
    try {
      const data = await apiGetMenu()
      menuItems.value = data
    } catch (e) {
      console.error('[SeasonStore] fetchMenu error:', e)
      menuItems.value = []
    }
  }

  /**
   * 获取赛季信息（兼容旧代码）
   */
  async function fetchSeason(): Promise<void> {
    loading.value = true
    try {
      const data = await apiGetSeason()
      season.value = data
      
      // 强制使用短横线格式
      if (currentRoundId.value && currentRoundId.value.includes('_')) {
        currentRoundId.value = ''
      }
      
      if (!currentRoundId.value && data.currentRound) {
        currentRoundId.value = `round-${data.currentRound}`
        currentRoundIndex.value = data.currentRound
      }
    } catch (e) {
      console.error('[SeasonStore] fetchSeason error:', e)
    } finally {
      loading.value = false
    }
  }

  /**
   * 获取轮次列表
   */
  async function fetchRounds(): Promise<void> {
    roundLoading.value = true
    try {
      const data = await apiGetRounds()
      rounds.value = data
      if (season.value?.currentRound && rounds.value.length > 0) {
        const currentRoundObj = rounds.value.find(r => r.index === season.value!.currentRound)
        if (currentRoundObj && !currentRoundId.value) {
          currentRoundId.value = currentRoundObj.id
          currentRoundIndex.value = currentRoundObj.index
        }
      }
    } catch (e) {
      console.error('[SeasonStore] fetchRounds error:', e)
      if (!currentRoundId.value && season.value?.currentRound) {
        currentRoundId.value = `round-${season.value.currentRound}`
        currentRoundIndex.value = season.value.currentRound
      }
    } finally {
      roundLoading.value = false
    }
  }

  /**
   * 设置指定阶段（管理员操作）
   */
  async function setStage(round: number, stage: StageType): Promise<void> {
    loading.value = true
    try {
      const data = await apiSetStage(round, stage)
      season.value = {
        id: season.value?.id || 'season-1',
        name: season.value?.name || '乘风2026',
        currentRound: data.currentRound,
        currentStage: data.currentStage,
        status: 'running',
        totalRounds: season.value?.totalRounds ?? 10
      }
      matrix.value = data.matrix
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * 自动推进下一阶段（管理员操作）
   */
  async function nextStage(): Promise<void> {
    loading.value = true
    try {
      const data = await apiNextStage()
      season.value = {
        id: season.value?.id || 'season-1',
        name: season.value?.name || '乘风2026',
        currentRound: data.currentRound,
        currentStage: data.currentStage,
        status: 'running',
        totalRounds: season.value?.totalRounds ?? 10
      }
      matrix.value = data.matrix
    } catch (e) {
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * 更新阶段（兼容旧代码）
   */
  async function updateStage(stage: StageType): Promise<void> {
    await setStage(currentRoundNumber.value, stage)
  }

  /**
   * 更新轮次参数（兼容旧代码）
   */
  async function updateRound(params: {
    performanceRound?: number
    eliminationRound?: number
    trainingRound?: number
    drawsPerPlayer?: number
  }): Promise<void> {
    try {
      await apiUpdateRound(params)
      await fetchSeason()
    } catch (e) {
      throw e
    }
  }

  /**
   * 重置赛季
   */
  async function resetSeason(): Promise<ResetSeasonResult> {
    const data = await apiResetSeason()
    season.value = null
    matrix.value = []
    menuItems.value = []
    rounds.value = []
    currentRoundId.value = ''
    currentRoundIndex.value = 1
    return data
  }

  /**
   * 重新开始赛季
   */
  async function restartSeason(): Promise<RestartResult> {
    try {
      const data = await apiRestartSeason()
      season.value = {
        id: season.value?.id || 'season-1',
        name: season.value?.name || '乘风2026',
        currentRound: data.newState.currentRound,
        currentStage: data.newState.currentStage,
        status: 'running',
        totalRounds: season.value?.totalRounds ?? 10
      }
      return data
    } catch (e) {
      throw e
    }
  }

  // ================== 状态计算方法 ==================

  /**
   * 获取指定阶段的状态（核心方法）
   * 所有页面统一使用此方法判断显示内容
   */
  function getStageStatus(round: number, stage: StageType): StageStatus {
    if (!season.value) return 'future'
    return calculateStageStatus(
      season.value.currentRound,
      season.value.currentStage,
      round,
      stage
    )
  }

  /**
   * 检查指定阶段是否可访问
   */
  function isStageAccessible(round: number, stage: StageType): boolean {
    const status = getStageStatus(round, stage)
    return status !== 'future'
  }

  /**
   * 检查指定阶段是否已完成
   */
  function isStageCompleted(round: number, stage: StageType): boolean {
    return getStageStatus(round, stage) === 'completed'
  }

  /**
   * 检查指定阶段是否当前激活
   */
  function isStageActive(round: number, stage: StageType): boolean {
    return getStageStatus(round, stage) === 'current'
  }

  /**
   * 获取下一个阶段
   */
  function getNextStage(): StageType | null {
    if (!season.value) return null
    return getNextStageUtil(season.value.currentStage)
  }

  /**
   * 获取指定轮次的阶段列表
   */
  function getRoundStageList(round: number): { type: StageType; name: string; status: StageStatus }[] {
    return STAGE_ORDER.map(stage => ({
      type: stage,
      name: STAGE_NAMES[stage],
      status: getStageStatus(round, stage)
    }))
  }

  /**
   * 获取当前轮次的阶段列表
   */
  function getStageList(): { type: StageType; name: string; status: StageStatus }[] {
    return getRoundStageList(currentRoundNumber.value)
  }

  // ================== 辅助方法 ==================

  /**
   * 设置当前轮次ID
   */
  function setCurrentRoundId(roundId: string) {
    currentRoundId.value = roundId
    const round = rounds.value.find(r => r.id === roundId)
    if (round) {
      currentRoundIndex.value = round.index
    }
  }

  /**
   * 设置当前轮次序号
   */
  function setCurrentRoundIndex(roundIndex: number) {
    currentRoundIndex.value = roundIndex
    const round = rounds.value.find(r => r.index === roundIndex)
    if (round) {
      currentRoundId.value = round.id
    }
  }

  /**
   * 设置当前轮次（按序号，淘汰页面等组件使用）
   */
  function setCurrentRound(round: number) {
    currentRoundIndex.value = round
    currentRoundId.value = `round-${round}`
  }

  /**
   * 获取阶段名称
   */
  function getStageNameByType(stage: StageType): string {
    return getStageName(stage)
  }

  /**
   * 获取赛程矩阵（管理员用）
   */
  function getMatrix(): MatrixCell[] {
    return matrix.value
  }

  /**
   * 获取用户菜单列表
   */
  function getMenu(): MenuItem[] {
    return menuItems.value
  }

  /**
   * 清空数据
   */
  function clearData() {
    season.value = null
    matrix.value = []
    menuItems.value = []
    rounds.value = []
    currentRoundId.value = ''
    currentRoundIndex.value = 1
  }

  // ================== 兼容旧代码的方法 ==================

  async function fetchSeasonProgress(): Promise<void> {
    await fetchProgress()
  }

  async function fetchPerformanceRound(): Promise<void> {
    await fetchSeason()
  }

  async function getStages(): Promise<{ key: StageType; name: string; description?: string }[]> {
    return STAGE_ORDER.map(stage => ({
      key: stage,
      name: STAGE_NAMES[stage]
    }))
  }

  return {
    // 核心状态
    season,
    matrix,
    menuItems,
    rounds,
    loading,
    roundLoading,
    currentRoundId,
    currentRoundIndex,

    // 计算属性
    currentRoundNumber,
    currentStage,
    stageName,
    totalRounds,
    hasStartedPerformance,
    currentRound,

    // 核心方法
    fetchProgress,
    fetchMenu,
    fetchSeason,
    fetchRounds,
    setStage,
    nextStage,
    updateStage,
    updateRound,
    resetSeason,
    restartSeason,

    // 状态计算方法
    getStageStatus,
    isStageAccessible,
    isStageCompleted,
    isStageActive,
    getNextStage,
    getRoundStageList,
    getStageList,

    // 辅助方法
    setCurrentRoundId,
    setCurrentRoundIndex,
    setCurrentRound,
    getStageNameByType,
    getMatrix,
    getMenu,
    clearData,

    // 兼容旧代码
    fetchSeasonProgress,
    fetchPerformanceRound,
    getStages
  }
})
