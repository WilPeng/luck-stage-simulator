import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TrainingCard, TrainingConfig, TrainingStats, TrainingRecord, TrainingDrawResult, AutoCompleteResult, TrainingEffect, TrainingRecordQuery } from '../types/training'
import {
  getTrainingCards,
  getTrainingCardById,
  createTrainingCard,
  batchCreateTrainingCards,
  updateTrainingCard,
  deleteTrainingCard,
  resetPresets,
  getTrainingConfig,
  updateTrainingConfig,
  resetTrainingCounts,
  getTrainingStats,
  drawTraining,
  autoCompleteAll,
  autoCompleteUser,
  getTrainingRecords,
  getUserTrainingRecords,
  clearUserTrainingRecords
} from '../services/api'

export const useTrainingCardStore = defineStore('training', () => {
  // 状态
  const cards = ref<TrainingCard[]>([])
  const config = ref<TrainingConfig>({
    drawsPerPlayer: 3,
    currentRound: 1,
    totalRounds: 3
  })
  const stats = ref<TrainingStats>({
    totalPlayers: 0,
    activePlayers: 0,
    playersInTeams: 0,
    playersNotInTeams: 0,
    totalTrainingCount: 0,
    averageTrainingCount: 0,
    completedTrainingPlayers: 0,
    completionRate: 0,
    trainingDistribution: {},
    topImprovers: []
  })
  const records = ref<TrainingRecord[]>([])
  const incompleteUsers = ref<{ userId: string; userName?: string }[]>([])

  // 加载状态
  const loading = ref(false)
  const saving = ref(false)

  // 计算属性
  const enabledCards = computed(() => cards.value.filter(c => c.enabled))
  const cardTypes = computed(() => {
    const types = new Set(cards.value.map(c => c.type))
    return Array.from(types)
  })

  // 获取所有卡牌
  async function fetchCards(): Promise<void> {
    loading.value = true
    try {
      cards.value = await getTrainingCards()
    } catch (e) {
      cards.value = []
    } finally {
      loading.value = false
    }
  }

  // 获取单个卡牌
  async function fetchCardById(id: string): Promise<TrainingCard> {
    return await getTrainingCardById(id)
  }

  // 创建卡牌
  async function addCard(data: {
    name: string
    type: TrainingCard['type']
    description: string
    effect: TrainingEffect
    weight: number
    enabled?: boolean
  }): Promise<TrainingCard> {
    saving.value = true
    try {
      const newCard = await createTrainingCard(data)
      cards.value.push(newCard)
      return newCard
    } finally {
      saving.value = false
    }
  }

  // 批量创建卡牌
  async function addCardsBatch(cardsData: {
    name: string
    type: TrainingCard['type']
    description: string
    effect: TrainingEffect
    weight: number
  }[]): Promise<{ created: TrainingCard[]; errors: any[]; successCount: number; errorCount: number }> {
    saving.value = true
    try {
      const result = await batchCreateTrainingCards(cardsData)
      cards.value.push(...result.created)
      return result
    } finally {
      saving.value = false
    }
  }

  // 更新卡牌
  async function editCard(id: string, data: Partial<TrainingCard>): Promise<TrainingCard> {
    saving.value = true
    try {
      const updated = await updateTrainingCard(id, data)
      const index = cards.value.findIndex(c => c.id === id)
      if (index !== -1) {
        cards.value[index] = updated
      }
      return updated
    } finally {
      saving.value = false
    }
  }

  // 删除卡牌
  async function removeCard(id: string): Promise<void> {
    saving.value = true
    try {
      await deleteTrainingCard(id)
      await fetchCards()
    } finally {
      saving.value = false
    }
  }

  // 重置为预设卡牌
  async function resetToPresets(): Promise<{ resetCount: number }> {
    saving.value = true
    try {
      const result = await resetPresets()
      await fetchCards()
      return result
    } finally {
      saving.value = false
    }
  }

  // 获取配置
  async function fetchConfig(): Promise<TrainingConfig> {
    try {
      config.value = await getTrainingConfig()
      return config.value
    } catch (e) {
      return { drawsPerPlayer: 5, currentRound: 1, totalRounds: 1 } as TrainingConfig
    }
  }

  // 更新配置
  async function saveConfig(newConfig: Partial<TrainingConfig>): Promise<TrainingConfig> {
    saving.value = true
    try {
      config.value = await updateTrainingConfig(newConfig)
      return config.value
    } finally {
      saving.value = false
    }
  }

  // 重置训练次数
  async function resetCounts(): Promise<void> {
    saving.value = true
    try {
      await resetTrainingCounts()
      await fetchStats()
    } finally {
      saving.value = false
    }
  }

  // 获取统计
  async function fetchStats(round?: number): Promise<TrainingStats> {
    try {
      stats.value = await getTrainingStats(round)
      return stats.value
    } catch (e) {
      stats.value = {
        totalPlayers: 0,
        activePlayers: 0,
        playersInTeams: 0,
        playersNotInTeams: 0,
        totalTrainingCount: 0,
        averageTrainingCount: 0,
        completedTrainingPlayers: 0,
        completionRate: 0,
        trainingDistribution: {},
        topImprovers: []
      }
      return stats.value
    }
  }

  // 抽卡
  async function doDraw(userId: string, round?: number): Promise<TrainingDrawResult> {
    return await drawTraining(userId, round)
  }

  // 一键完成所有训练
  async function doAutoCompleteAll(round?: number): Promise<AutoCompleteResult> {
    saving.value = true
    try {
      const result = await autoCompleteAll(round)
      await fetchStats(round)
      return result
    } finally {
      saving.value = false
    }
  }

  // 自动完成单个用户训练
  async function doAutoCompleteUser(userId: string, round?: number): Promise<TrainingDrawResult> {
    saving.value = true
    try {
      const result = await autoCompleteUser(userId, round)
      await fetchStats(round)
      return result
    } finally {
      saving.value = false
    }
  }

  // 获取训练记录
  async function fetchRecords(params?: TrainingRecordQuery | string): Promise<TrainingRecord[]> {
    loading.value = true
    try {
      const query = typeof params === 'string' ? { userId: params } : params
      const result = await getTrainingRecords(query)
      records.value = result.list || []
      return records.value
    } catch (e) {
      records.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  // 获取所有训练记录（用于需要遍历全部数据的场景）
  async function fetchAllRecords(): Promise<TrainingRecord[]> {
    loading.value = true
    try {
      const result = await getTrainingRecords({ pageSize: 1000 })
      records.value = result.list || []
      return records.value
    } catch (e) {
      records.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  // 获取用户训练记录
  async function fetchUserRecords(userId: string): Promise<TrainingRecord[]> {
    loading.value = true
    try {
      records.value = await getUserTrainingRecords(userId)
      return records.value
    } catch (e) {
      records.value = []
      return []
    } finally {
      loading.value = false
    }
  }

  // 清空用户本轮训练记录
  async function clearUserRoundRecords(userId: string, round?: number): Promise<void> {
    saving.value = true
    try {
      await clearUserTrainingRecords(userId, round)
      await fetchStats(round)
    } finally {
      saving.value = false
    }
  }

  // 根据ID获取卡牌
  function getCardById(id: string): TrainingCard | undefined {
    return cards.value.find(c => c.id === id)
  }

  // 初始化所有数据
  async function initialize(): Promise<void> {
    loading.value = true
    try {
      await Promise.all([
        fetchCards(),
        fetchConfig(),
        fetchStats(config.value.currentRound)
      ])
    } catch (e) {
      // 子方法已处理各自的异常
    } finally {
      loading.value = false
    }
  }

  return {
    // 状态
    cards,
    config,
    stats,
    records,
    incompleteUsers,
    loading,
    saving,

    // 计算属性
    enabledCards,
    cardTypes,

    // 方法
    fetchCards,
    fetchCardById,
    addCard,
    addCardsBatch,
    editCard,
    removeCard,
    resetToPresets,
    fetchConfig,
    saveConfig,
    resetCounts,
    fetchStats,
    doDraw,
    doAutoCompleteAll,
    doAutoCompleteUser,
    fetchRecords,
    fetchAllRecords,
    fetchUserRecords,
    clearUserRoundRecords,
    getCardById,
    initialize
  }
})
