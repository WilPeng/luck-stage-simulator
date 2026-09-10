<template>
  <div class="minigame sequence-memory">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winnerName || '无胜者' }}</span>
        <span v-if="winnerName" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🧠</div>
      <h2>顺序记忆</h2>
      <p>记住emoji闪动顺序，回答第N个是什么，答错或超时出局！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>第 {{ round }} 轮</span>
        <span v-if="phase === 'question'" class="timer" :class="{ urgent: timeLeft <= 5 }">⏱ {{ timeLeft }}s</span>
        <span>存活 {{ alivePlayerIds.length }} 人</span>
      </div>

      <div v-if="!alive" class="out-banner">你已出局，等待比赛结束…</div>

      <!-- 闪动阶段 -->
      <div v-else-if="phase === 'flash'" class="flash-area">
        <p class="flash-hint">记住顺序…（{{ Math.max(0, flashIndex + 1) }}/{{ sequence.length }}）</p>
        <div class="flash-single" :key="flashIndex">{{ flashIndex >= 0 ? sequence[flashIndex] : '' }}</div>
      </div>

      <!-- 答题阶段 -->
      <template v-else-if="phase === 'question'">
        <div class="question">第 {{ questionIndex }} 个 emoji 是什么？</div>
        <div class="options">
          <button
            v-for="(opt, i) in options"
            :key="i"
            class="opt-btn"
            :class="{ selected: myChoice === opt }"
            :disabled="myChoice != null"
            @click="answer(opt)"
          >{{ opt }}</button>
        </div>
        <p v-if="myChoice != null" class="chosen">已作答，等待其他玩家…</p>
      </template>

      <div v-else class="resolved-area">本轮结算中…</div>

      <div class="alive-list">
        <span v-for="p in aliveNames" :key="p.id" class="alive-chip" :class="{ me: p.id === myId }">{{ p.name }}</span>
      </div>
      <div v-if="lastEliminatedNames.length" class="eliminated">本轮出局：{{ lastEliminatedNames.join('、') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const bbAuth = useBbAuthStore()
const myId = computed(() => bbAuth.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const round = ref(1)
const sequence = ref<string[]>([])
const flashStart = ref(0)
const flashMs = ref(0)
const questionStart = ref(0)
const deadline = ref(0)
const questionIndex = ref(1)
const options = ref<string[]>([])
const myChoice = ref<string | null>(null)
const alive = ref(true)
const alivePlayerIds = ref<string[]>([])
const lastEliminated = ref<string[]>([])
const resolved = ref(false)
const now = ref(Date.now())
const timeLeft = ref(20)
let startSent = false
let tickTimer: ReturnType<typeof setInterval> | null = null

const gameStarted = computed(() => !!gameState.value && (gameState.value as any).started === true)
const roomPlaying = computed(() => (gameState.value as any)?.status === 'playing')
const winnerName = computed(() => props.participants.find(p => p.playerId === winner.value?.playerId)?.playerName || winner.value?.playerName || '')
const nameOf = (id: string) => props.participants.find(p => p.playerId === id)?.playerName || id
const aliveNames = computed(() => alivePlayerIds.value.map(id => ({ id, name: nameOf(id) })))
const lastEliminatedNames = computed(() => lastEliminated.value.map(nameOf))

const phase = computed(() => {
  if (resolved.value) return 'resolved'
  if (now.value < questionStart.value) return 'flash'
  return 'question'
})
const flashIndex = computed(() => {
  if (now.value < flashStart.value) return -1
  return Math.min(sequence.value.length - 1, Math.floor((now.value - flashStart.value) / 300))
})

function answer(choice: string) {
  if (myChoice.value != null) return
  myChoice.value = choice
  sendAction({ type: 'answer', choice })
}

function tick() {
  now.value = Date.now()
  if (deadline.value) timeLeft.value = Math.max(0, Math.ceil((deadline.value - Date.now()) / 1000))
  sendAction({ type: 'tick' })
}

watch(gameState, (state: any) => {
  if (!state) return
  if (state.round !== undefined) round.value = state.round
  if (state.sequence) sequence.value = state.sequence
  if (state.flashStart) flashStart.value = state.flashStart
  if (state.flashMs !== undefined) flashMs.value = state.flashMs
  if (state.questionStart) questionStart.value = state.questionStart
  if (state.deadline) deadline.value = state.deadline
  if (state.questionIndex !== undefined) questionIndex.value = state.questionIndex
  if (state.options) options.value = state.options
  if (state.myChoice !== undefined) myChoice.value = state.myChoice
  if (state.alive !== undefined) alive.value = state.alive
  if (state.alivePlayerIds) alivePlayerIds.value = state.alivePlayerIds
  if (state.lastEliminated) lastEliminated.value = state.lastEliminated
  if (state.resolved !== undefined) resolved.value = state.resolved
  if (state.timeLeft !== undefined) timeLeft.value = state.timeLeft
})

watch(roomPlaying, (val) => { if (val && !startSent) { startSent = true; sendAction({ type: 'start' }) } })
watch(finished, (val) => { if (val) emit('finished', winner.value || { playerId: '', playerName: '' }) })

onMounted(() => {
  connect()
  tickTimer = setInterval(tick, 200)
})
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  disconnect()
})
</script>

<style scoped>
.sequence-memory { max-width: 560px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 14px; margin-bottom: 18px; }
.timer.urgent { color: #ff4444; font-weight: 700; }
.out-banner { background: #ff444418; color: #ff6b6b; border-radius: 10px; padding: 16px; margin: 20px 0; }
.flash-area { padding: 20px 0; }
.flash-hint { color: #8a8aa5; margin-bottom: 14px; }
.flash-single { font-size: 96px; line-height: 1; height: 150px; display: flex; align-items: center; justify-content: center; animation: flashPop 0.3s ease-out; }
@keyframes flashPop { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }
.flash-seq { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.flash-item { font-size: 40px; opacity: 0.25; transition: transform 0.15s, opacity 0.15s; }
.flash-item.active { opacity: 1; transform: scale(1.4); }
.flash-item.passed { opacity: 0.5; }
.question { font-size: 20px; color: #e8e8ff; margin: 20px 0; font-weight: 600; }
.options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.opt-btn { padding: 20px; font-size: 36px; background: #1c1c46; border: 2px solid #ffffff1c; border-radius: 12px; cursor: pointer; transition: all 0.15s; }
.opt-btn:hover:not(:disabled) { border-color: #00ff88; }
.opt-btn.selected { border-color: #00ff88; background: #00ff8822; }
.opt-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.chosen { color: #00ff88; margin-top: 14px; }
.resolved-area { color: #8a8aa5; padding: 30px 0; }
.alive-list { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 24px; }
.alive-chip { background: #1c1c46; color: #cfcff0; border-radius: 20px; padding: 4px 12px; font-size: 13px; }
.alive-chip.me { background: #00ff8822; color: #00ff88; }
.eliminated { color: #ff6b6b; margin-top: 14px; font-size: 14px; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
