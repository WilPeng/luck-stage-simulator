<template>
  <div class="minigame quick-math">
    <div v-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🧮</div>
      <h2>快速算术</h2>
      <p>完成10道两位数加减法，用时最短者获胜！</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else-if="!finished" class="game-playing">
      <div class="game-header">
        <span>进度: {{ currentIndex }}/{{ totalQuestions }}</span>
      </div>
      <div v-if="currentIndex < totalQuestions" class="question-area">
        <div class="question">{{ currentQuestion }} = ?</div>
        <div class="answer-input">
          <input ref="inputRef" v-model="userAnswer" type="number"
            class="math-input" placeholder="输入答案"
            @keyup.enter="submitAnswer" />
          <button class="submit-btn" @click="submitAnswer">确认</button>
        </div>
        <div v-if="lastResult" class="result-feedback" :class="{ correct: lastResult.correct, wrong: !lastResult.correct }">
          {{ lastResult.correct ? '✅ 正确！' : `❌ 错误，正确答案是 ${lastResult.correctAnswer}` }}
        </div>
      </div>
      <div v-else class="completed">
        <span class="done-msg">✅ 全部完成！等待其他玩家...</span>
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
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction } = useMinigameSocket(roomIdRef)

const gameStarted = computed(() => gameState.value && (countdown.value === -1 || countdown.value === 0))
const currentQuestion = computed(() => gameState.value?.currentQuestion || '')
const currentIndex = computed(() => gameState.value?.currentIndex || 0)
const totalQuestions = computed(() => gameState.value?.totalQuestions || 10)
const lastResult = computed(() => gameState.value?.lastResult || gameState.value?.actionResult || null)

const userAnswer = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

function submitAnswer() {
  if (!userAnswer.value) return
  sendAction({ type: 'answer', answer: userAnswer.value })
  userAnswer.value = ''
  nextTick(() => inputRef.value?.focus())
}

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => connect())
</script>

<style scoped>
.quick-math { text-align: center; padding: 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
.game-waiting h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 8px; }
.game-waiting p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { margin-bottom: 24px; color: #888; font-size: 14px; }
.question { font-size: 36px; font-weight: 700; color: #e0e0e0; margin-bottom: 20px; }
.answer-input { display: flex; gap: 12px; justify-content: center; align-items: center; }
.math-input {
  background: #0f0f2e; border: 2px solid #00ff8844; color: #e0e0e0; padding: 10px 16px;
  border-radius: 8px; font-size: 24px; width: 140px; text-align: center; outline: none;
}
.math-input:focus { border-color: #00ff88; }
.submit-btn {
  background: #00ff8822; border: 1px solid #00ff88; color: #00ff88; padding: 10px 24px;
  border-radius: 8px; font-size: 16px; cursor: pointer; transition: all 0.2s;
}
.submit-btn:hover { background: #00ff8833; }
.result-feedback { margin-top: 12px; font-size: 16px; font-weight: 600; }
.result-feedback.correct { color: #00ff88; }
.result-feedback.wrong { color: #ff4444; }
.completed { margin-top: 40px; }
.done-msg { font-size: 18px; color: #00ff88; }
.game-finished h2 { font-size: 22px; color: #e0e0e0; margin-bottom: 16px; }
.winner-name { font-size: 28px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
