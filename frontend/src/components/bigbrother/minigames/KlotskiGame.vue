<template>
  <div class="minigame klotski">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🧩</div>
      <h2>华容道 4×4</h2>
      <p>将所有数字按 1~15 顺序复原，空格留在右下角，用时最短者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>步数: <strong>{{ moves }}</strong></span>
        <span>⏱ {{ formatTime(elapsed) }}</span>
      </div>

      <div v-if="solved" class="completed">
        <span class="done-msg">✅ 已完成！等待其他玩家...</span>
      </div>

      <div v-else class="board">
        <button
          v-for="(tile, idx) in board"
          :key="idx"
          class="cell"
          :class="{ blank: tile === 0, movable: isMovable(idx) }"
          :disabled="tile === 0 || !isMovable(idx)"
          @click="move(idx)"
        >
          {{ tile === 0 ? '' : tile }}
        </button>
      </div>
      <p class="hint">点击空格旁边的数字方块进行移动</p>
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

const board = ref<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0])
const moves = ref(0)
const solved = ref(false)
const size = ref(4)
const elapsed = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let startTime = 0

const gameStarted = computed(() => !!gameState.value && Array.isArray((gameState.value as any).board))

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function isMovable(idx: number) {
  const b = board.value.indexOf(0)
  const r1 = Math.floor(idx / size.value), c1 = idx % size.value
  const r2 = Math.floor(b / size.value), c2 = b % size.value
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1
}

function move(idx: number) {
  if (!isMovable(idx) || solved.value) return
  sendAction({ type: 'move', tileIndex: idx })
}

watch(gameState, (state: any) => {
  if (!state) return
  if (Array.isArray(state.board)) board.value = state.board
  if (state.size) size.value = state.size
  if (state.moves !== undefined) moves.value = state.moves
  if (state.solved !== undefined) solved.value = state.solved
})

watch(gameStarted, (val) => {
  if (val && !elapsedTimer) {
    startTime = Date.now()
    elapsedTimer = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startTime) / 1000)
    }, 1000)
  }
})

watch(finished, (val) => {
  if (val && elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
})

watch(winner, (val) => {
  if (val) emit('finished', val)
})

onMounted(() => connect())
onUnmounted(() => {
  if (elapsedTimer) clearInterval(elapsedTimer)
  disconnect()
})
</script>

<style scoped>
.klotski { max-width: 460px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 14px; margin-bottom: 16px; }
.game-header strong { color: #00ff88; }
.board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0 auto; max-width: 360px; }
.cell {
  aspect-ratio: 1 / 1; border-radius: 10px; font-size: 24px; font-weight: 700;
  background: linear-gradient(160deg, #1c1c46, #12122e); color: #e0e0ff;
  border: 1px solid #00ff8833; cursor: default; transition: all 0.15s;
}
.cell.movable { cursor: pointer; border-color: #00ff8866; }
.cell.movable:hover { background: #00ff8822; color: #00ff88; }
.cell.blank { background: transparent; border: 1px dashed #ffffff18; }
.hint { color: #666; font-size: 12px; margin-top: 14px; }
.completed { padding: 30px 0; }
.done-msg { font-size: 18px; color: #00ff88; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
