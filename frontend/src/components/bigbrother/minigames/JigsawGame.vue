<template>
  <div class="minigame jigsaw">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🧩</div>
      <h2>拼图结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🧩</div>
      <h2>拼图</h2>
      <p>把打乱的 5×5 拼图还原成完整图片，点击「提交」；提交错误将锁定 15 秒。第一个拼对者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>正确 {{ placedCount }} / {{ size * size }}</span>
        <span v-if="selected !== null" class="hint">已选 #{{ selected + 1 }}，点击另一块交换</span>
      </div>

      <div class="board-wrap">
        <div class="board" :style="boardStyle">
          <div
            v-for="(piece, pos) in order"
            :key="pos"
            class="cell"
            :class="{ selected: selected === pos, correct: piece === pos }"
            :style="cellStyle(piece)"
            @click="onCellClick(pos)"
          >
            <span v-if="!imageUrl" class="cell-num">{{ piece + 1 }}</span>
          </div>
        </div>

        <div v-if="cooling" class="cooldown-panel">
          <div class="cool-icon">❌</div>
          <p class="cool-title">提交错误，暂时锁定</p>
          <p class="cool-timer">{{ cooldownRemaining }}s 后可继续操作</p>
        </div>
      </div>

      <button class="submit-btn" :disabled="cooling || mine.done" @click="submit">提交</button>
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

const size = ref(5)
const imageUrl = ref('')
const order = ref<number[]>([])
const selected = ref<number | null>(null)
const cooling = ref(false)
const cooldownRemaining = ref(0)
let startSent = false
let coolTimer: ReturnType<typeof setInterval> | null = null

const gameStarted = computed(() => (gameState.value as any)?.started === true)
const mine = computed<any>(() => gameState.value || {})
const placedCount = computed(() => order.value.filter((v, i) => v === i).length)

const IMG = computed(() => (imageUrl.value ? `url(${toAbsolute(imageUrl.value)})` : 'none'))
const boardStyle = computed(() => ({ backgroundImage: IMG.value }))

function toAbsolute(u: string): string {
  if (/^https?:\/\//.test(u)) return u
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
  const root = base.replace(/\/api$/, '')
  return `${root}${u.startsWith('/') ? '' : '/'}${u}`
}

function cellStyle(piece: number) {
  if (!imageUrl.value) return { background: `hsl(${(piece * 37) % 360} 55% 45%)` }
  const n = size.value
  const col = piece % n
  const row = Math.floor(piece / n)
  const pct = 100 / (n - 1)
  return {
    backgroundImage: IMG.value,
    backgroundSize: `${n * 100}% ${n * 100}%`,
    backgroundPosition: `${col * pct}% ${row * pct}%`
  }
}

function onCellClick(pos: number) {
  if (cooling.value || mine.value.done) return
  if (selected.value === null) {
    selected.value = pos
    return
  }
  if (selected.value === pos) {
    selected.value = null
    return
  }
  const a = selected.value
  selected.value = null
  sendAction({ type: 'swap', a, b: pos })
}

function submit() {
  if (cooling.value || mine.value.done) return
  sendAction({ type: 'submit' })
}

watch(gameState, (state: any) => {
  if (!state) return
  if (state.size) size.value = state.size
  if (state.imageUrl !== undefined) imageUrl.value = state.imageUrl
  if (Array.isArray(state.order)) order.value = state.order
  cooling.value = !!state.wrong || (state.cooldownRemaining || 0) > 0
  cooldownRemaining.value = state.cooldownRemaining || 0
})

watch(() => (gameState.value as any)?.status, (val) => {
  if (val === 'playing' && !startSent) { startSent = true; sendAction({ type: 'start' }) }
})
watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => {
  connect()
  coolTimer = setInterval(() => {
    if (cooldownRemaining.value > 0) {
      cooldownRemaining.value--
      if (cooldownRemaining.value <= 0) cooling.value = false
    }
  }, 1000)
})
onUnmounted(() => {
  if (coolTimer) clearInterval(coolTimer)
  disconnect()
})
</script>

<style scoped>
.jigsaw { max-width: 560px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 14px; margin-bottom: 12px; }
.game-header .hint { color: #ffaa00; }
.board-wrap { position: relative; display: inline-block; }
.board { display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; width: min(420px, 82vw); aspect-ratio: 1/1; background: #000; border-radius: 8px; overflow: hidden; }
.cell { position: relative; aspect-ratio: 1/1; background-repeat: no-repeat; cursor: pointer; outline: 0 solid #00ff88; transition: outline-width 0.1s; display: flex; align-items: center; justify-content: center; }
.cell.selected { outline: 3px solid #ffaa00; outline-offset: -3px; z-index: 2; }
.cell.correct { box-shadow: inset 0 0 0 1px #00ff8855; }
.cell-num { color: #ffffffcc; font-weight: 700; font-size: 18px; }
.cooldown-panel { position: absolute; inset: 0; background: #000000cc; border-radius: 8px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.cool-icon { font-size: 52px; }
.cool-title { color: #ff6b6b; font-size: 18px; margin: 12px 0 6px; }
.cool-timer { color: #ffaa00; font-size: 20px; font-weight: 700; }
.submit-btn { margin-top: 18px; padding: 12px 40px; font-size: 16px; font-weight: 700; color: #00ff88; background: #00ff8822; border: 2px solid #00ff88; border-radius: 10px; cursor: pointer; }
.submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
