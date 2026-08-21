<template>
  <div class="minigame click-speed">
    <!-- 等待中 -->
    <div v-if="!gameStarted" class="game-waiting">
      <div class="game-icon">👆</div>
      <h2>快速点击</h2>
      <p>10秒内尽可能多地点击下方按钮，点击次数最多者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <!-- 游戏中 -->
    <div v-else-if="!finished" class="game-playing">
      <div class="game-header">
        <span class="timer">⏱️ {{ timeLeft }}s</span>
        <span class="score">点击: {{ currentScore }}</span>
      </div>
      <button class="click-btn" @mousedown.prevent="handleClick" @touchstart.prevent="handleClick">
        点击我！
      </button>
      <p class="hint">疯狂点击上方按钮！</p>
    </div>

    <!-- 结束 -->
    <div v-else class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '未知' }}</span>
        <span class="winner-label">获胜！</span>
      </div>
      <div class="scoreboard">
        <div v-for="(score, pid) in sortedScores" :key="pid" class="score-row" :class="{ me: pid === myId }">
          <span class="rank">{{ getRank(pid) }}</span>
          <span class="name">{{ getPlayerName(pid) }}</span>
          <span class="pts">{{ score }} 次点击</span>
        </div>
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
const { connected, gameState, countdown, winner, scores, finished, connect, sendAction } = useMinigameSocket(roomIdRef)

const gameStarted = computed(() => gameState.value && (countdown.value === -1 || countdown.value === 0))
const currentScore = computed(() => gameState.value?.scores?.[myId.value] || 0)
const timeLeft = computed(() => {
  if (!gameState.value?.startTime) return 10
  const elapsed = (Date.now() - gameState.value.startTime) / 1000
  return Math.max(0, Math.ceil(10 - elapsed))
})

const sortedScores = computed(() => {
  if (!scores.value) return []
  return Object.entries(scores.value).sort((a, b) => (b[1] as number) - (a[1] as number))
})

function getRank(pid: string) {
  const idx = sortedScores.value.findIndex(s => s[0] === pid)
  return idx >= 0 ? `#${idx + 1}` : ''
}

function getPlayerName(pid: string) {
  return props.participants.find(p => p.playerId === pid)?.playerName || pid
}

function handleClick() {
  sendAction({ type: 'click' })
}

watch(finished, (val) => {
  if (val && winner.value) {
    emit('finished', winner.value)
  }
})

onMounted(() => connect())
</script>

<style scoped>
.click-speed { text-align: center; padding: 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
.game-waiting h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 8px; }
.game-waiting p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; font-size: 18px; color: #e0e0e0; }
.score { color: #00ff88; font-weight: 600; }
.click-btn {
  width: 200px; height: 200px; border-radius: 50%; border: 3px solid #00ff88;
  background: linear-gradient(135deg, #00ff8833, #00ff8811); color: #00ff88;
  font-size: 24px; font-weight: 700; cursor: pointer; user-select: none;
  transition: all 0.1s; margin: 20px auto; display: flex; align-items: center; justify-content: center;
}
.click-btn:active { transform: scale(0.9); background: #00ff8855; }
.hint { color: #666; font-size: 13px; }
.game-finished h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 16px; }
.winner-info { margin-bottom: 24px; }
.winner-name { font-size: 28px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
.scoreboard { max-width: 400px; margin: 0 auto; }
.score-row { display: flex; align-items: center; gap: 12px; padding: 10px 16px; background: #ffffff05; border-radius: 8px; margin-bottom: 6px; }
.score-row.me { background: #00ff8810; border: 1px solid #00ff8833; }
.rank { font-weight: 700; color: #ffaa00; width: 40px; }
.name { flex: 1; text-align: left; color: #e0e0e0; }
.pts { color: #00ff88; font-weight: 500; }
</style>
