import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { LVSeason, LVSeasonProgress, LVMenuItem, LVMenuData, LVStageType, LVMatrixCell } from '../types/lovevariety'
import { calculateLVStageStatus, getLVStageName, getNextLVStage } from '../types/lovevariety'
import { lvGetSeasonProgress, lvGetMenu, lvGetSeason, lvSetStage, lvNextStage, lvResetSeason } from '../services/lovevarietyApi'

export const useLvSeasonStore = defineStore('lvSeason', () => {
  const season = ref<LVSeason | null>(null)
  const matrix = ref<LVMatrixCell[]>([])
  const menuItems = ref<LVMenuItem[]>([])

  const currentRoundNumber = computed(() => season.value?.currentRound || 1)
  const currentStage = computed<LVStageType>(() => season.value?.currentStage || 'love_vote')
  const stageName = computed(() => getLVStageName(currentStage.value))
  const totalRounds = computed(() => season.value?.totalRounds || 10)

  async function fetchProgress() {
    try {
      const data = await lvGetSeasonProgress()
      season.value = {
        id: '',
        name: '',
        gameId: 'lovevariety',
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
      const data = await lvGetMenu()
      menuItems.value = data.menu || []
      if (!season.value) {
        season.value = {
          id: '',
          name: '恋综',
          gameId: 'lovevariety',
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
      const data = await lvGetSeason()
      season.value = data
    } catch (e) {
      console.error('fetchSeason error:', e)
    }
  }

  function getStageStatus(round: number, stage: LVStageType) {
    return calculateLVStageStatus(currentRoundNumber.value, currentStage.value, round, stage)
  }

  function isStageAccessible(round: number, stage: LVStageType): boolean {
    return getStageStatus(round, stage) !== 'future'
  }

  function isStageCompleted(round: number, stage: LVStageType): boolean {
    return getStageStatus(round, stage) === 'completed'
  }

  function isStageActive(round: number, stage: LVStageType): boolean {
    return getStageStatus(round, stage) === 'current'
  }

  async function setStage(round: number, stage: LVStageType) {
    const result = await lvSetStage(round, stage)
    if (season.value) {
      season.value.currentRound = result.currentRound
      season.value.currentStage = result.currentStage as LVStageType
    }
    await fetchProgress()
    await fetchMenu()
  }

  async function nextStage() {
    const result = await lvNextStage()
    if (season.value) {
      season.value.currentRound = result.currentRound
      season.value.currentStage = result.currentStage as LVStageType
    }
    await fetchProgress()
    await fetchMenu()
  }

  async function resetSeason() {
    await lvResetSeason()
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
