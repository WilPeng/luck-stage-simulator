<template>
  <div class="minigame swing-pointer">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🎯</div>
      <h2>指针摆动</h2>
      <p>30秒内点击 5 次，指针到最中心得 100 分、两侧为 0 分，累计最高者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>⏱ {{ timeLeft }}s</span>
        <span>剩余次数: <strong>{{ checksLeft }}</strong></span>
      </div>

      <div class="gauge">
        <div class="gauge-arc"></div>
        <div class="needle" :style="{ transform: `rotate(${angle}deg)` }"></div>
        <div class="gauge-hub"></div>
      </div>
      <div class="gauge-value">{{ liveScore }}</div>

      <button class="check-btn" :disabled="checksLeft <= 0" @click="check">
        {{ checksLeft > 0 ? '📍 Check!' : '已完成' }}
      </button>

      <div class="checks">
        <span v-for="(v, i) in checks" :key="i" class="check-chip">{{ v }}</span>
      </div>
      <div class="total">总分：<strong>{{ score }}</strong></div>
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

const checks = ref<number[]>([])
const score = ref(0)
const checksLeft = ref(5)
const timeLeft = ref(30)
const livePos = ref(0.5)
const liveScore = ref(0)
const period = ref(800)

let startTime = 0
let animTimer: ReturnType<typeof setInterval> | null = null

const gameStarted = computed(() => !!gameState.value && (gameState.value as any).startTime)
const angle = computed(() => -90 + livePos.value * 180)

function tick() {
  if (!startTime) return
  const t = ((Date.now() - startTime) % period.value) / period.value
  const pos = t < 0.5 ? t * 2 : (1 - t) * 2
  livePos.value = pos
  liveScore.value = Math.round(100 * (1 - Math.abs(pos * 2 - 1)))
  if (gameState.value && (gameState.value as any).totalTime) {
    timeLeft.value = Math.max(0, Math.ceil((((gameState.value as any).startTime + (gameState.value as any).totalTime) - Date.now()) / 1000))
  }
}

function check() {
  if (checksLeft.value <= 0) return
  sendAction({ type: 'check' })
}

watch(gameState, (state: any) => {
  if (!state) return
  if (state.startTime) startTime = state.startTime
  if (state.period) period.value = state.period
  if (state.checks) checks.value = state.checks
  if (state.score !== undefined) score.value = state.score
  if (state.checksLeft !== undefined) checksLeft.value = state.checksLeft
  if (state.timeLeft !== undefined) timeLeft.value = state.timeLeft
})

watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => {
  connect()
  animTimer = setInterval(tick, 40)
})
onUnmounted(() => {
  if (animTimer) clearInterval(animTimer)
  disconnect()
})
</script>

<style scoped>
.swing-pointer { max-width: 460px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 14px; margin-bottom: 14px; }
.game-header strong { color: #00ff88; }
.gauge { position: relative; width: 280px; height: 150px; margin: 0 auto; overflow: hidden; }
.gauge-arc { position: absolute; inset: 0 0 -140px 0; border-radius: 50%; border: 6px solid #00ff8844; border-bottom-color: transparent; }
.needle { position: absolute; left: 50%; bottom: 0; width: 4px; height: 130px; background: linear-gradient(#ff6b6b, #ffaa00); transform-origin: bottom center; border-radius: 2px; transition: transform 0.04s linear; }
.gauge-hub { position: absolute; left: 50%; bottom: -10px; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; background: #ffaa00; }
.gauge-value { font-size: 34px; font-weight: 800; color: #00ff88; margin: 6px 0 14px; }
.check-btn { padding: 14px 44px; font-size: 20px; font-weight: 700; color: #00ff88; background: #00ff8822; border: 2px solid #00ff88; border-radius: 12px; cursor: pointer; }
.check-btn:hover:not(:disabled) { background: #00ff8833; }
.check-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.checks { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap; margin-top: 16px; }
.check-chip { background: #1c1c46; color: #cfcff0; border-radius: 8px; padding: 4px 12px; font-size: 14px; }
.total { margin-top: 14px; color: #aaa; font-size: 15px; }
.total strong { color: #ffaa00; font-size: 20px; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
