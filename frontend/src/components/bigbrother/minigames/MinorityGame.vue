<template>
  <div class="minigame minority">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winnerName || '无胜者' }}</span>
        <span v-if="winnerName" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🎭</div>
      <h2>少数决</h2>
      <p>每轮15秒二选一，多数方与未作答者出局，存活到最后者胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>第 {{ round }} 轮</span>
        <span class="timer" :class="{ urgent: timeLeft <= 5 }">⏱ {{ timeLeft }}s</span>
        <span>存活 {{ alivePlayerIds.length }} 人</span>
      </div>

      <div v-if="!alive" class="out-banner">你已出局，等待比赛结束…</div>

      <template v-else>
        <div class="question">{{ question?.text }}</div>
        <div class="options">
          <button
            v-for="(opt, i) in question?.options || []"
            :key="i"
            class="opt-btn"
            :class="{ selected: myChoice === i }"
            :disabled="myChoice != null || resolved"
            @click="choose(i)"
          >{{ opt }}</button>
        </div>
        <p v-if="myChoice != null" class="chosen">你选择了：{{ question?.options[myChoice] }}</p>
        <p v-else class="hint">请选择一个答案</p>
      </template>

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

const question = ref<any>(null)
const round = ref(1)
const roundStartTime = ref(0)
const myChoice = ref<number | null>(null)
const alive = ref(true)
const alivePlayerIds = ref<string[]>([])
const lastEliminated = ref<string[]>([])
const resolved = ref(false)
const timeLeft = ref(15)
let startSent = false
let tickTimer: ReturnType<typeof setInterval> | null = null

const gameStarted = computed(() => !!gameState.value && (gameState.value as any).started === true)
const roomPlaying = computed(() => (gameState.value as any)?.status === 'playing')
const winnerName = computed(() => props.participants.find(p => p.playerId === winner.value?.playerId)?.playerName || winner.value?.playerName || '')
const nameOf = (id: string) => props.participants.find(p => p.playerId === id)?.playerName || id
const aliveNames = computed(() => alivePlayerIds.value.map(id => ({ id, name: nameOf(id) })))
const lastEliminatedNames = computed(() => lastEliminated.value.map(nameOf))

function choose(i: number) {
  if (myChoice.value != null || resolved.value) return
  myChoice.value = i
  sendAction({ type: 'choose', choice: i })
}

function updateTimer() {
  if (!roundStartTime.value) return
  timeLeft.value = Math.max(0, Math.ceil((roundStartTime.value + 15000 - Date.now()) / 1000))
  sendAction({ type: 'tick' })
}

watch(gameState, (state: any) => {
  if (!state) return
  if (state.question) question.value = state.question
  if (state.round !== undefined) round.value = state.round
  if (state.roundStartTime) roundStartTime.value = state.roundStartTime
  if (state.myChoice !== undefined) myChoice.value = state.myChoice
  if (state.alive !== undefined) alive.value = state.alive
  if (state.alivePlayerIds) alivePlayerIds.value = state.alivePlayerIds
  if (state.lastEliminated) lastEliminated.value = state.lastEliminated
  if (state.resolved !== undefined) resolved.value = state.resolved
  if (state.timeLeft !== undefined) timeLeft.value = state.timeLeft
})

watch(roomPlaying, (val) => {
  if (val && !startSent) { startSent = true; sendAction({ type: 'start' }) }
})

watch(finished, (val) => { if (val) emit('finished', winner.value || { playerId: '', playerName: '' }) })

onMounted(() => {
  connect()
  tickTimer = setInterval(updateTimer, 1000)
})
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  disconnect()
})
</script>

<style scoped>
.minority { max-width: 560px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 14px; margin-bottom: 20px; }
.timer.urgent { color: #ff4444; font-weight: 700; }
.out-banner { background: #ff444418; color: #ff6b6b; border-radius: 10px; padding: 16px; margin: 20px 0; }
.question { font-size: 22px; color: #e8e8ff; margin: 20px 0; font-weight: 600; }
.options { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.opt-btn { padding: 20px; font-size: 18px; color: #cfcff0; background: #1c1c46; border: 2px solid #ffffff1c; border-radius: 12px; cursor: pointer; transition: all 0.15s; }
.opt-btn:hover:not(:disabled) { border-color: #00ff88; color: #00ff88; }
.opt-btn.selected { border-color: #00ff88; background: #00ff8822; color: #00ff88; }
.opt-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.chosen { color: #00ff88; margin-top: 14px; }
.hint { color: #666; margin-top: 14px; }
.alive-list { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; margin-top: 24px; }
.alive-chip { background: #1c1c46; color: #cfcff0; border-radius: 20px; padding: 4px 12px; font-size: 13px; }
.alive-chip.me { background: #00ff8822; color: #00ff88; }
.eliminated { color: #ff6b6b; margin-top: 14px; font-size: 14px; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
