<template>
  <div class="minigame missing-number">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🔢</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🔢</div>
      <h2>找出遗失的数字</h2>
      <p>7×7 矩阵里有 1-50 中的 49 个数字，只缺少 1 个。在下方填写缺少的数字，只能提交一次。最先答对者获胜；无人答对时最接近者获胜。</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span v-if="timeLimit">限时 {{ remaining }}s</span>
        <span v-else>找出缺少的数字</span>
      </div>

      <div class="matrix">
        <div v-for="(n, i) in cells" :key="i" class="mcell">{{ n }}</div>
      </div>

      <div class="answer-area">
        <template v-if="!mine.submitted">
          <input v-model.number="inputValue" type="number" class="ans-input" placeholder="缺少的数字" min="1" max="50"
            :disabled="cooling" @keyup.enter="submit" />
          <button class="submit-btn" :disabled="inputValue === null || inputValue === '' || submitting || cooling" @click="submit">
            {{ cooling ? `冷却 ${coolRemain}s` : '提交' }}
          </button>
        </template>
        <div v-else class="submitted">
          <p class="submitted-title">已答对：<strong>{{ mine.myValue }}</strong> ✅</p>
          <p class="submitted-hint">等待其他选手或时间结束…</p>
        </div>
      </div>
      <p v-if="!mine.submitted && cooling" class="cool-hint">答错啦，{{ coolRemain }} 秒后可再次作答</p>
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

const cells = ref<number[]>([])
const inputValue = ref<number | null>(null)
const submitting = ref(false)
const timeLimit = ref(0)
const remaining = ref(0)
let startSent = false
let tickTimer: ReturnType<typeof setInterval> | null = null

const gameStarted = computed(() => (gameState.value as any)?.started === true)
const mine = computed<any>(() => gameState.value || {})
const now = ref(Date.now())
const cooling = computed(() => ((mine.value.cooldownUntil || 0) > now.value))
const coolRemain = computed(() => Math.max(0, Math.ceil(((mine.value.cooldownUntil || 0) - now.value) / 1000)))

function submit() {
  if (submitting.value || mine.value.submitted || cooling.value) return
  if (inputValue.value === null || inputValue.value === '') return
  submitting.value = true
  sendAction({ type: 'submit', value: Number(inputValue.value) })
  setTimeout(() => { submitting.value = false }, 500)
}

watch(gameState, (state: any) => {
  if (!state) return
  if (Array.isArray(state.cells)) cells.value = state.cells
  if (state.timeLimit) timeLimit.value = state.timeLimit
})

watch(() => (gameState.value as any)?.status, (val) => {
  if (val === 'playing' && !startSent) {
    startSent = true
    sendAction({ type: 'start' })
    if (timeLimit.value > 0) {
      remaining.value = timeLimit.value
      tickTimer = setInterval(() => { if (remaining.value > 0) remaining.value--; now.value = Date.now() }, 1000)
    }
  }
})
watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => { connect() })
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  disconnect()
})
</script>

<style scoped>
.missing-number { max-width: 620px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { color: #aaa; font-size: 15px; margin-bottom: 14px; font-weight: 600; }
.matrix { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; width: min(420px, 86vw); margin: 0 auto 20px; }
.mcell { aspect-ratio: 1/1; display: flex; align-items: center; justify-content: center; background: #14213a; border: 1px solid #00ff8822; border-radius: 6px; color: #cfe3ff; font-size: clamp(12px, 3vw, 18px); font-weight: 600; }
.answer-area { display: flex; gap: 10px; justify-content: center; align-items: center; }
.ans-input { width: 150px; padding: 12px 14px; font-size: 18px; text-align: center; background: #0a1a10; border: 1px solid #00ff8844; border-radius: 8px; color: #e0e0e0; outline: none; }
.ans-input:focus { border-color: #00ff88; }
.submit-btn { padding: 12px 28px; font-size: 16px; font-weight: 700; color: #00ff88; background: #00ff8822; border: 2px solid #00ff88; border-radius: 10px; cursor: pointer; }
.submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.submitted { color: #00ff88; }
.submitted-title { margin: 0 0 6px; }
.submitted-hint { color: #888; margin: 0; }
.cool-hint { color: #ff6b6b; margin-top: 10px; font-size: 14px; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
