<template>
  <div class="minigame reaction">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">⚡</div>
      <h2>反应力</h2>
      <p>9个板块随机变绿，变绿后尽快点击，总反应时间最短者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>总反应：<strong>{{ total }}</strong> ms</span>
        <span>剩余：{{ remaining }} 块</span>
      </div>
      <div class="grid">
        <button
          v-for="i in 9"
          :key="i"
          class="panel"
          :class="panelClass(i - 1)"
          @click="clickPanel(i - 1)"
        >
          <span v-if="results[i - 1] != null">{{ results[i - 1] }}ms</span>
        </button>
      </div>
      <p class="hint">绿色出现时点击；提前点击记 {{ earlyPenalty }}ms</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const startTime = ref(0)
const greenTimes = ref<number[]>([])
const results = ref<(number | null)[]>(new Array(9).fill(null))
const earlyPenalty = ref(5000)
const now = ref(Date.now())
let startSent = false
let tickTimer: ReturnType<typeof setInterval> | null = null

const gameStarted = computed(() => !!gameState.value && (gameState.value as any).greenTimes !== undefined)
const total = computed(() => results.value.reduce((a, r) => a + (r == null ? 0 : r), 0))
const remaining = computed(() => results.value.filter(r => r == null).length)

function panelClass(i: number) {
  if (results.value[i] != null) return results.value[i]! >= earlyPenalty.value ? 'early' : 'done'
  if (!startTime.value) return ''
  const elapsed = now.value - startTime.value
  return elapsed >= greenTimes.value[i] ? 'green' : 'waiting'
}

function clickPanel(i: number) {
  if (results.value[i] != null) return
  sendAction({ type: 'click', index: i })
}

watch(gameState, (state: any) => {
  if (!state) return
  if (state.startTime) startTime.value = state.startTime
  if (state.greenTimes) greenTimes.value = state.greenTimes
  if (state.results) results.value = state.results
  if (state.earlyPenalty) earlyPenalty.value = state.earlyPenalty
})

watch(gameStarted, (val) => { if (val && !startSent) { startSent = true; sendAction({ type: 'start' }) } })
watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => {
  connect()
  tickTimer = setInterval(() => { now.value = Date.now() }, 50)
})
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  disconnect()
})
</script>

<style scoped>
.reaction { max-width: 520px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 14px; margin-bottom: 16px; }
.game-header strong { color: #00ff88; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.panel { aspect-ratio: 1/1; border-radius: 12px; border: 2px solid #ffffff14; background: #1a1a3e; color: #e0e0ff; font-size: 16px; font-weight: 700; cursor: pointer; transition: background 0.08s, border-color 0.08s; }
.panel.waiting { background: #23234d; }
.panel.green { background: #00ff88; border-color: #00ff88; color: #003018; box-shadow: 0 0 18px #00ff8866; }
.panel.early { background: #ff444433; border-color: #ff4444; color: #ff8888; cursor: default; }
.panel.done { background: #1c1c46; border-color: #00ff8844; color: #00ff88; cursor: default; }
.hint { color: #666; font-size: 12px; margin-top: 14px; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
