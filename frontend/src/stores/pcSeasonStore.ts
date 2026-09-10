import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { PCSeason } from '../types/powerchallenge'
import { pcGetSeason } from '../services/pcApi'

export const usePcSeasonStore = defineStore('pcSeason', () => {
  const season = ref<PCSeason | null>(null)

  const currentRound = computed(() => season.value?.currentRound || 1)
  const totalRounds = computed(() => season.value?.totalRounds || 5)
  const roundPhase = computed(() => season.value?.roundPhase || 'waiting')
  const status = computed(() => season.value?.status || 'idle')
  const started = computed(() => season.value?.started || false)
  const theme = computed(() => season.value?.theme || '')

  async function fetchSeason() {
    try { season.value = await pcGetSeason() } catch {}
  }

  function setSeason(data: PCSeason) {
    season.value = data
  }

  return { season, currentRound, totalRounds, roundPhase, status, started, theme, fetchSeason, setSeason }
})
