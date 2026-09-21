<template>
  <div class="bb-eviction-player">
    <div class="page-header">
      <h1>淘汰结果</h1>
      <span class="round-tag">第{{ roundNum }}周</span>
      <span v-if="isHistory" class="history-tag">历史记录</span>
      <span v-else-if="isFuture" class="future-tag">未开始</span>
    </div>

    <!-- 淘汰夜宣布（管理员逐句手动揭晓） -->
    <div v-if="night" class="announce-stage">
      <template v-if="night.phase === 'announce'">
        <div class="announce-title">📢 淘汰结果宣布</div>
        <template v-for="(s, i) in (night.segments || [])" :key="i">
          <div v-if="i < (night.released || 0)" class="ann-line shown">
            {{ s.text }}
          </div>
        </template>
      </template>
      <template v-else>
        <div class="door-stage">
          <div class="door-icon">🚪</div>
          <div v-for="e in night.evicted" :key="e.id" class="door-name">{{ e.name }}</div>
          <div class="door-votes">{{ night.big }}-{{ night.small }}</div>
        </div>
      </template>
    </div>

    <div v-else-if="isHistory && evictionResult" class="result-section">
      <div class="result-card">
        <div class="result-icon">🚪</div>
        <div class="result-info">
          <div class="result-name">{{ evictionResult.evictedName }}</div>
          <div class="result-votes">{{ evictionResult.voteCount }}{{ evictionResult.otherVotes != null ? '-' + evictionResult.otherVotes : '' }}</div>
          <div v-if="isMe(evictionResult.evictedName)" class="me-evicted">你被淘汰了！</div>
        </div>
      </div>
    </div>
    <div v-else class="empty-card">
      <p>管理员未开始淘汰结果环节</p>
    </div>

    <div v-if="nomination && isHistory" class="nomination-summary">
      <h3>被提名人</h3>
      <div class="nominees-list">
        <div v-for="(name, i) in (nomination.nomineeNames || [])" :key="i" class="nominee-chip">{{ name }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import { useBbSeasonStore } from '../../../stores/bbSeasonStore'
import { useBbRealtimeStore } from '../../../stores/bbRealtimeStore'
import { bbGetEvictionHistory, bbGetNominationHistory, bbGetEvictionNight } from '../../../services/bbApi'
import type { BBEviction } from '../../../types/bigbrother'

const route = useRoute()
const authStore = useBbAuthStore()
const seasonStore = useBbSeasonStore()
const realtime = useBbRealtimeStore()

const roundNum = computed(() => Number(route.params.round) || 1)
const isHistory = computed(() => seasonStore.isStageCompleted(roundNum.value, 'eviction'))
const isFuture = computed(() => seasonStore.getStageStatus(roundNum.value, 'eviction') === 'future')

const evictionResult = ref<BBEviction | null>(null)
const nomination = ref<any>(null)
const night = ref<any>(null)

function isMe(name: string): boolean { return name === authStore.currentUser?.name }

async function loadNight() {
  try {
    const r = await bbGetEvictionNight()
    night.value = (r.night && r.night.round === roundNum.value) ? r.night : null
  } catch {}
}

async function loadData() {
  try {
    const history = await bbGetEvictionHistory()
    const roundKey = `round-${roundNum.value}`
    evictionResult.value = history.find(h => h.roundId === roundKey) || null
  } catch {}
  try {
    const nHistory = await bbGetNominationHistory()
    const roundKey = `round-${roundNum.value}`
    nomination.value = nHistory.find(h => h.roundId === roundKey) || null
  } catch {}
  await loadNight()
}

watch(() => realtime.lastEvictionNight, (v) => {
  night.value = (v && v.round === roundNum.value) ? v : null
})

onMounted(() => {
  loadData()
})
</script>

<style scoped>
.bb-eviction-player { max-width: 600px; margin: 0 auto; }
.page-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
.page-header h1 { font-size: 24px; font-weight: 600; color: #e0e0e0; margin: 0; }
.round-tag { background: #00ff8822; color: #00ff88; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #00ff8844; }
.history-tag { background: #88888822; color: #aaa; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #88888844; }
.future-tag { background: #44444422; color: #666; padding: 2px 12px; border-radius: 10px; font-size: 12px; border: 1px solid #44444444; }
.result-section { margin-top: 16px; }
.result-card { display: flex; align-items: center; gap: 16px; padding: 24px; background: #2e0f0f; border: 1px solid #ff4444; border-radius: 12px; }
.result-icon { font-size: 48px; }
.result-name { font-size: 22px; font-weight: 600; color: #ff4444; }
.result-votes { font-size: 14px; color: #aaa; margin-top: 4px; }
.me-evicted { margin-top: 8px; font-size: 14px; color: #ff4444; font-weight: 600; }
.empty-card { background: #0f0f2e; border: 1px solid #444; border-radius: 12px; padding: 40px; text-align: center; margin-top: 20px; }
.empty-card p { color: #666; }
.nomination-summary { background: #0f0f2e; border: 1px solid #00ff8822; border-radius: 10px; padding: 20px; margin-top: 20px; }
.nomination-summary h3 { margin: 0 0 12px; font-size: 16px; color: #e0e0e0; }
.nominees-list { display: flex; gap: 12px; flex-wrap: wrap; }
.nominee-chip { background: #ffaa0015; border: 1px solid #ffaa0033; border-radius: 6px; padding: 8px 16px; font-size: 14px; color: #ffaa00; }
.announce-stage { margin-top: 16px; background: #0f0f2e; border: 1px solid #ffaa0044; border-radius: 12px; padding: 28px 24px; text-align: center; }
.announce-title { color: #ffaa00; font-size: 14px; margin-bottom: 18px; }
.ann-line { min-height: 44px; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #e0e0e0; opacity: 0; transition: opacity 0.3s; }
.ann-line.shown { opacity: 1; animation: fadeIn 0.6s ease both; }
.door-stage { text-align: center; }
.door-icon { font-size: 64px; margin-bottom: 12px; }
.door-name { font-size: 30px; font-weight: 700; color: #ff4444; }
.door-votes { margin-top: 8px; font-size: 18px; color: #aaa; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
</style>
