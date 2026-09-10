<template>
  <div class="minigame spot-difference">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🔍</div>
      <h2>找不同</h2>
      <p>两个10×10颜色矩阵中有若干处不同，在右图中点击不同处并提交，第一个找齐者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div v-if="hidden" class="cooldown-panel">
        <div class="cool-icon">❌</div>
        <p class="cool-title">答案不对，请稍后再试</p>
        <p class="cool-timer">{{ cooldownRemaining }}s 后重新显示矩阵</p>
      </div>

      <template v-else>
        <div class="game-header">
          <span>已标记：{{ marks.length }} 处</span>
        </div>
        <div class="boards">
          <div class="board">
            <div class="board-title">原图</div>
            <div class="grid">
              <div v-for="(c, i) in gridA" :key="'a'+i" class="cell" :style="{ background: colorHex(c) }"></div>
            </div>
          </div>
          <div class="board">
            <div class="board-title">找不同</div>
            <div class="grid">
              <div
                v-for="(c, i) in gridB"
                :key="'b'+i"
                class="cell clickable"
                :class="{ marked: marks.includes(i) }"
                :style="{ background: colorHex(c) }"
                @click="toggle(i)"
              ></div>
            </div>
          </div>
        </div>
        <button class="submit-btn" @click="submit">提交</button>
      </template>
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

const gridA = ref<string[]>([])
const gridB = ref<string[]>([])
const marks = ref<number[]>([])
const hidden = ref(false)
const cooldownRemaining = ref(0)
const size = ref(10)
let startSent = false
let coolTimer: ReturnType<typeof setInterval> | null = null

const roomPlaying = computed(() => (gameState.value as any)?.status === 'playing')
const gameStarted = computed(() => (gameState.value as any)?.started === true)

const COLOR_HEX: Record<string, string> = {
  red: '#e74c3c', orange: '#e67e22', yellow: '#f1c40f', green: '#2ecc71',
  blue: '#3498db', purple: '#9b59b6', black: '#1a1a1a', white: '#f5f5f5',
  gray: '#95a5a6', pink: '#ff7eb3'
}
function colorHex(c: string) { return COLOR_HEX[c] || c }

function toggle(i: number) {
  const pos = marks.value.indexOf(i)
  if (pos >= 0) marks.value.splice(pos, 1)
  else marks.value.push(i)
  sendAction({ type: 'mark', index: i })
}

function submit() {
  sendAction({ type: 'submit' })
}

watch(gameState, (state: any) => {
  if (!state) return
  if (state.hidden) {
    hidden.value = true
    cooldownRemaining.value = state.cooldownRemaining || 0
    return
  }
  hidden.value = false
  if (state.gridA) gridA.value = state.gridA
  if (state.gridB) gridB.value = state.gridB
  if (state.size) size.value = state.size
  if (state.marks) marks.value = state.marks
})

watch(roomPlaying, (val) => { if (val && !startSent) { startSent = true; sendAction({ type: 'start' }) } })
watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => {
  connect()
  coolTimer = setInterval(() => {
    if (hidden.value && cooldownRemaining.value > 0) cooldownRemaining.value--
  }, 1000)
})
onUnmounted(() => {
  if (coolTimer) clearInterval(coolTimer)
  disconnect()
})
</script>

<style scoped>
.spot-difference { max-width: 720px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { color: #aaa; font-size: 14px; margin-bottom: 12px; }
.boards { display: flex; gap: 16px; justify-content: center; flex-wrap: wrap; }
.board-title { color: #8a8aa5; font-size: 13px; margin-bottom: 6px; }
.grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; width: 320px; max-width: 44vw; }
.cell { aspect-ratio: 1/1; border-radius: 3px; border: 1px solid #00000033; }
.cell.clickable { cursor: pointer; }
.cell.marked { outline: 3px solid #00ff88; outline-offset: -2px; box-shadow: 0 0 8px #00ff88; }
.submit-btn { margin-top: 18px; padding: 12px 40px; font-size: 16px; font-weight: 700; color: #00ff88; background: #00ff8822; border: 2px solid #00ff88; border-radius: 10px; cursor: pointer; }
.submit-btn:hover { background: #00ff8833; }
.cooldown-panel { padding: 60px 20px; }
.cool-icon { font-size: 56px; }
.cool-title { color: #ff6b6b; font-size: 18px; margin: 12px 0 6px; }
.cool-timer { color: #ffaa00; font-size: 20px; font-weight: 700; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
