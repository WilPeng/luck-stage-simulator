<template>
  <div class="minigame dice-duel">
    <div v-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🎲</div>
      <h2>骰子对决</h2>
      <p>3轮策略性投骰子，每轮选择1-3个骰子，总分最高者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else-if="!finished" class="game-playing">
      <div class="game-header">
        <span>第 {{ currentRound }}/{{ totalRounds }} 轮</span>
        <span>总分: {{ totalScore }}</span>
      </div>

      <div v-if="currentRound < totalRounds" class="roll-area">
        <div class="dice-select">
          <button v-for="n in 3" :key="n" class="dice-count-btn"
            :class="{ selected: selectedCount === n }"
            @click="selectedCount = n">
            {{ n }}个骰子
          </button>
        </div>
        <button class="roll-btn" @click="rollDice">🎲 投骰子！</button>
      </div>

      <div v-if="lastRoll && lastRoll.length > 0" class="last-roll">
        <span class="roll-label">上一轮结果:</span>
        <span v-for="(v, i) in lastRoll" :key="i" class="dice-face">{{ diceEmoji(v) }}</span>
        <span class="roll-total">= {{ lastTotal }}</span>
      </div>

      <div v-if="currentRound >= totalRounds" class="completed">
        <span class="done-msg">✅ 全部完成！等待其他玩家...</span>
      </div>

      <div class="round-history">
        <div v-for="(r, i) in roundHistory" :key="i" class="history-row">
          <span>第{{ i + 1 }}轮:</span>
          <span v-for="(v, j) in r.results" :key="j" class="dice-face small">{{ diceEmoji(v) }}</span>
          <span class="history-total">= {{ r.total }}</span>
        </div>
      </div>
    </div>

    <div v-else class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '未知' }}</span>
        <span class="winner-label">获胜！</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction } = useMinigameSocket(roomIdRef)

const gameStarted = computed(() => gameState.value && (countdown.value === -1 || countdown.value === 0))
const currentRound = computed(() => (gameState.value?.currentRound || 0) + 1)
const totalRounds = computed(() => gameState.value?.totalRounds || 3)
const totalScore = computed(() => gameState.value?.totalScore || 0)
const roundHistory = computed(() => gameState.value?.rounds || [])

const selectedCount = ref(1)
const lastRoll = ref<number[]>([])
const lastTotal = ref(0)

function diceEmoji(v: number) {
  return ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'][v] || '?'
}

function rollDice() {
  sendAction({ type: 'roll', count: selectedCount.value })
  selectedCount.value = 1
}

watch(gameState, (val) => {
  if (val?.actionResult) {
    lastRoll.value = val.actionResult.results || []
    lastTotal.value = val.actionResult.total || 0
  }
})

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => connect())
</script>

<style scoped>
.dice-duel { text-align: center; padding: 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
.game-waiting h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 8px; }
.game-waiting p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; margin-bottom: 20px; font-size: 18px; color: #e0e0e0; }
.dice-select { display: flex; gap: 10px; justify-content: center; margin-bottom: 20px; }
.dice-count-btn {
  padding: 10px 20px; background: #ffffff08; border: 2px solid #00ff8833; color: #aaa;
  border-radius: 8px; font-size: 16px; cursor: pointer; transition: all 0.2s;
}
.dice-count-btn.selected { border-color: #00ff88; color: #00ff88; background: #00ff8810; }
.roll-btn {
  background: linear-gradient(135deg, #00ff8833, #00ff8811); border: 2px solid #00ff88;
  color: #00ff88; padding: 14px 40px; border-radius: 12px; font-size: 20px;
  cursor: pointer; transition: all 0.2s; margin-bottom: 20px;
}
.roll-btn:hover { background: #00ff8844; transform: scale(1.05); }
.last-roll { margin-bottom: 16px; font-size: 18px; color: #e0e0e0; }
.roll-label { color: #888; margin-right: 8px; }
.dice-face { font-size: 32px; margin: 0 4px; }
.dice-face.small { font-size: 20px; }
.roll-total { font-weight: 700; color: #ffaa00; margin-left: 8px; }
.round-history { margin-top: 20px; text-align: left; max-width: 300px; margin-left: auto; margin-right: auto; }
.history-row { padding: 6px 0; color: #aaa; font-size: 14px; display: flex; align-items: center; gap: 4px; }
.history-total { color: #ffaa00; font-weight: 600; margin-left: 4px; }
.completed { margin-top: 24px; }
.done-msg { font-size: 18px; color: #00ff88; }
.game-finished h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 16px; }
.winner-name { font-size: 28px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
