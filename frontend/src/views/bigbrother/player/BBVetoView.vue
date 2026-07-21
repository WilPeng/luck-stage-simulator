<template>
  <div class="bb-veto-player">
    <div class="page-header">
      <h1>否决权竞争</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <div v-if="veto" class="veto-card">
      <div class="veto-icon">🛡️</div>
      <div class="veto-info">
        <div class="veto-label">否决权</div>
        <div class="veto-winner">{{ veto.winnerName || '暂无获胜者' }}</div>
        <div class="veto-status">{{ veto.used ? '✅ 已使用' : '⏳ 未使用' }}</div>
        <div v-if="veto.used && veto.usedOnPlayerName" class="veto-saved">
          拯救: <strong class="highlight">{{ veto.usedOnPlayerName }}</strong>
          <span class="veto-removed">已安全，不再面临淘汰</span>
        </div>
      </div>
    </div>
    <div v-else class="veto-card empty">
      <p>本周暂无否决权竞争</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { bbGetVetoHistory } from '../../../services/bbApi'
import type { BBVetoRecord } from '../../../types/bigbrother'

const route = useRoute()
const seasonStore = useBbSeasonStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'veto_competition') || seasonStore.isStageCompleted(roundNum.value, 'veto_ceremony'))
const isFuture = computed(() => {
  const status = seasonStore.getStageStatus(roundNum.value, 'veto_competition')
  return status === 'future'
})

const veto = ref<BBVetoRecord | null>(null)

onMounted(async () => {
  try {
    const history = await bbGetVetoHistory()
    const roundKey = `round-${roundNum.value}`
    veto.value = history.find(h => h.roundId === roundKey) || null
  } catch {}
})
</script>

<style scoped>
.bb-veto-player { max-width: 500px; margin: 0 auto; padding: 16px; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.veto-card { background: linear-gradient(135deg, #0f0f2e, #1a1a3e); border: 1px solid #ffaa00; border-radius: 12px; padding: 24px; display: flex; align-items: center; gap: 20px; margin-top: 16px; }
.veto-card.empty { border-color: #444; }
.veto-card.empty p { text-align: center; color: #666; width: 100%; margin: 0; }
.veto-icon { font-size: 48px; }
.veto-label { font-size: 12px; color: #888; text-transform: uppercase; }
.veto-winner { font-size: 20px; font-weight: 700; color: #ffaa00; }
.veto-status { font-size: 13px; color: #aaa; margin-top: 4px; }
.veto-saved { margin-top: 8px; font-size: 14px; color: #aaa; }
.highlight { color: #00ff88; font-weight: 600; }
.veto-removed { display: block; font-size: 12px; color: #00ff88; margin-top: 4px; }
</style>
