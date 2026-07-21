import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { BBSeason, BBSeasonProgress, BBMenuItem, BBMenuData, BBStageType, BBMatrixCell } from '../types/bigbrother'
import { calculateBBStageStatus, getBBStageName, getNextBBStage } from '../types/bigbrother'
import { bbGetSeasonProgress, bbGetMenu, bbGetSeason, bbSetStage, bbNextStage, bbResetSeason } from '../services/bbApi'

export const useBbSeasonStore = defineStore('bbSeason', () => {
  const season = ref<BBSeason | null>(null)
  const matrix = ref<BBMatrixCell[]>([])
  const menuItems = ref<BBMenuItem[]>([])

  const currentRoundNumber = computed(() => season.value?.currentRound || 1)
  const currentStage = computed<BBStageType>(() => season.value?.currentStage || 'hoh_competition')
  const stageName = computed(() => getBBStageName(currentStage.value))
  const totalRounds = computed(() => season.value?.totalRounds || 10)

  async function fetchProgress() {
    try {
      const data = await bbGetSeasonProgress()
      season.value = {
        id: '',
        name: '',
        gameId: 'bigbrother',
        currentRound: data.currentRound,
        currentStage: data.currentStage,
        totalRounds: data.totalRounds,
        status: 'running',
        createdAt: '',
        updatedAt: ''
      }
      matrix.value = data.matrix || []
    } catch (e) {
      console.error('fetchProgress error:', e)
    }
  }

  async function fetchMenu() {
    try {
      const data = await bbGetMenu()
      menuItems.value = data.menu || []
      if (!season.value) {
        season.value = {
          id: '',
          name: 'Big Brother',
          gameId: 'bigbrother',
          currentRound: data.currentRound,
          currentStage: data.currentStage,
          totalRounds: data.totalRounds,
          status: 'running',
          createdAt: '',
          updatedAt: ''
        }
      } else {
        season.value.currentRound = data.currentRound
        season.value.currentStage = data.currentStage
        season.value.totalRounds = data.totalRounds
      }
    } catch (e) {
      console.error('fetchMenu error:', e)
    }
  }

  async function fetchSeason() {
    try {
      const data = await bbGetSeason()
      season.value = data
    } catch (e) {
      console.error('fetchSeason error:', e)
    }
  }

  function getStageStatus(round: number, stage: BBStageType) {
    return calculateBBStageStatus(currentRoundNumber.value, currentStage.value, round, stage)
  }

  function isStageAccessible(round: number, stage: BBStageType): boolean {
    return getStageStatus(round, stage) !== 'future'
  }

  function isStageCompleted(round: number, stage: BBStageType): boolean {
    return getStageStatus(round, stage) === 'completed'
  }

  function isStageActive(round: number, stage: BBStageType): boolean {
    return getStageStatus(round, stage) === 'current'
  }

  async function setStage(round: number, stage: BBStageType) {
    const result = await bbSetStage(round, stage)
    if (season.value) {
      season.value.currentRound = result.currentRound
      season.value.currentStage = result.currentStage as BBStageType
    }
    await fetchProgress()
    await fetchMenu()
  }

  async function nextStage() {
    const result = await bbNextStage()
    if (season.value) {
      season.value.currentRound = result.currentRound
      season.value.currentStage = result.currentStage as BBStageType
    }
    await fetchProgress()
    await fetchMenu()
  }

  async function resetSeason() {
    await bbResetSeason()
    await fetchProgress()
    await fetchMenu()
  }

  return {
    season, matrix, menuItems,
    currentRoundNumber, currentStage, stageName, totalRounds,
    fetchProgress, fetchMenu, fetchSeason,
    getStageStatus, isStageAccessible, isStageCompleted, isStageActive,
    setStage, nextStage, resetSeason
  }
})
