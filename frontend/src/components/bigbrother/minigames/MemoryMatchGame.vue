<template>
  <div class="minigame memory-match">
    <div v-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🃏</div>
      <h2>记忆翻牌</h2>
      <p>翻牌配对，完成4x4所有配对用时最短者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else-if="!finished" class="game-playing">
      <div class="game-header">
        <span>翻牌次数: {{ moves }}</span>
        <span v-if="matchedCount < 16">{{ matchedCount }}/16 配对</span>
        <span v-else class="done">✅ 完成!</span>
      </div>
      <div class="board">
        <div v-for="(card, idx) in board" :key="idx" class="card"
          :class="{ flipped: isFlipped(idx), matched: isMatched(idx) }"
          @click="flipCard(idx)">
          <div class="card-inner">
            <div class="card-front">?</div>
            <div class="card-back">{{ card }}</div>
          </div>
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
const board = computed(() => gameState.value?.board || [])
const flipped = computed(() => gameState.value?.flipped || [])
const matched = computed(() => gameState.value?.matched || [])
const moves = computed(() => gameState.value?.moves || 0)
const matchedCount = computed(() => matched.value.length)

function isFlipped(idx: number) {
  return flipped.value.includes(idx) || matched.value.includes(idx)
}
function isMatched(idx: number) {
  return matched.value.includes(idx)
}

function flipCard(idx: number) {
  if (isFlipped(idx) || isMatched(idx)) return
  sendAction({ type: 'flip', index: idx })
}

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => connect())
</script>

<style scoped>
.memory-match { text-align: center; padding: 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
.game-waiting h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 8px; }
.game-waiting p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; margin-bottom: 16px; color: #e0e0e0; font-size: 14px; }
.done { color: #00ff88; font-weight: 600; }
.board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; max-width: 360px; margin: 0 auto; }
.card { aspect-ratio: 1; perspective: 600px; cursor: pointer; }
.card-inner { position: relative; width: 100%; height: 100%; transition: transform 0.3s; transform-style: preserve-3d; }
.card.flipped .card-inner, .card.matched .card-inner { transform: rotateY(180deg); }
.card-front, .card-back {
  position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;
  border-radius: 8px; font-size: 28px; backface-visibility: hidden;
}
.card-front { background: #1a1a3e; border: 2px solid #00ff8833; color: #00ff88; }
.card-back { background: #0f2e0f; border: 2px solid #00ff88; color: #e0e0e0; transform: rotateY(180deg); }
.card.matched .card-back { background: #0f2e0f; border-color: #00ff88; opacity: 0.7; }
.game-finished h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 16px; }
.winner-name { font-size: 28px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
