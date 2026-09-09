<template>
  <div class="minigame custom-game">
    <div v-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🎮</div>
      <h2>自定义游戏</h2>
      <p>等待管理员开始比赛...</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
    </div>

    <div v-else-if="!finished" class="game-playing">
      <!-- 顶部信息栏 -->
      <div class="game-header">
        <div class="header-left">
          <span v-if="gameType === 'score' && timerEndTime" class="timer" :class="{ urgent: timeRemaining <= 10 }">
            ⏱ {{ formatTime(timeRemaining) }}
          </span>
          <span v-else class="timer">⏱ {{ formatTime(elapsed) }}</span>
        </div>
        <div class="header-center">
          得分: <strong>{{ score }}</strong> ({{ correctCount }}/{{ currentIndex }}/{{ totalQuestions }})
        </div>
        <div class="header-right">
          <span v-if="cooldownRemaining > 0" class="cooldown">⏳ {{ cooldownRemaining }}s</span>
          题目 {{ currentIndex + 1 }}/{{ totalQuestions }}
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <!-- 答题区域 -->
      <div v-if="currentQuestion" class="question-area">
        <div class="question-text">{{ currentQuestion.text }}</div>
        <div v-if="currentQuestion.points > 1" class="points-hint">本题 {{ currentQuestion.points }} 分</div>

        <!-- 选择题 -->
        <div v-if="currentQuestion.options.length > 0" class="options-grid">
          <button
            v-for="opt in currentQuestion.options"
            :key="opt"
            class="option-btn"
            :class="{ selected: userAnswer === opt }"
            @click="selectOption(opt)"
            :disabled="cooldownRemaining > 0"
          >
            {{ opt }}
          </button>
        </div>

        <!-- 开放回答 -->
        <div v-else class="answer-input">
          <input ref="inputRef" v-model="userAnswer" class="bb-input" placeholder="输入答案"
            :disabled="cooldownRemaining > 0"
            @keyup.enter="submitAnswer" />
        </div>

        <button class="submit-btn" :disabled="!userAnswer || cooldownRemaining > 0" @click="submitAnswer">
          {{ cooldownRemaining > 0 ? `冷却中 ${cooldownRemaining}s` : '提交' }}
        </button>

        <!-- 答题反馈 -->
        <div v-if="lastResult" class="result-feedback" :class="{ correct: lastResult.correct, wrong: !lastResult.correct }">
          <template v-if="lastResult.correct">
            ✅ 正确！+{{ lastResult.points }}分
          </template>
          <template v-else>
            ❌ 错误，正确答案是 {{ lastResult.correctAnswer }}
          </template>
        </div>
      </div>

      <!-- 已完成等待其他人 -->
      <div v-else class="completed">
        <span class="done-msg">✅ 已完成全部题目！等待其他玩家...</span>
        <div class="final-score">最终得分: {{ score }}</div>
      </div>
    </div>

    <div v-else class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div v-if="winner" class="winner-info">
        <span class="winner-name">{{ winner.playerName }}</span>
        <span class="winner-label">获胜！</span>
      </div>
      <div v-else class="winner-info">
        <span class="winner-label">无胜者</span>
      </div>
      <div class="final-stats">
        <div>最终得分: {{ score }}</div>
        <div>答对: {{ correctCount }}/{{ totalQuestions }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import type { CustomGamePlayerState } from '../../../types/bigbrother'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const bbAuth = useBbAuthStore()
const myId = computed(() => bbAuth.user?.id || bbAuth.user?.userId || '')

const roomIdRef = computed(() => props.roomId)
const { connected, gameState, countdown, winner, finished, connect, joinRoom, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const gameStarted = ref(false)
const userAnswer = ref('')
const inputRef = ref<HTMLInputElement>()
const startTime = ref(0)
const elapsed = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

// 解析后的游戏状态
const gameType = ref<'quiz' | 'score'>('quiz')
const currentQuestion = ref<CustomGamePlayerState['currentQuestion']>(null)
const currentIndex = ref(0)
const totalQuestions = ref(0)
const score = ref(0)
const correctCount = ref(0)
const cooldownRemaining = ref(0)
const timerEndTime = ref(0)
const lastResult = ref<CustomGamePlayerState['lastResult']>(null)

let cooldownTimer: ReturnType<typeof setInterval> | null = null

const progressPercent = computed(() => {
  if (totalQuestions.value === 0) return 0
  return (currentIndex.value / totalQuestions.value) * 100
})

const timeRemaining = computed(() => {
  if (!timerEndTime.value) return 0
  return Math.max(0, Math.ceil((timerEndTime.value - Date.now()) / 1000))
})

function formatTime(sec: number) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function selectOption(opt: string) {
  userAnswer.value = opt
  submitAnswer()
}

function submitAnswer() {
  if (!userAnswer.value || cooldownRemaining.value > 0) return
  sendAction({ type: 'submit_answer', answer: userAnswer.value })
  userAnswer.value = ''
  nextTick(() => inputRef.value?.focus())
}

function startCooldownTimer() {
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    if (cooldownRemaining.value > 0) {
      cooldownRemaining.value--
    } else {
      clearInterval(cooldownTimer!)
      cooldownTimer = null
    }
  }, 1000)
}

// 监听 gameState 更新
watch(gameState, (state: any) => {
  if (!state) return

  if (state.gameType) gameType.value = state.gameType
  if (state.currentQuestion !== undefined) currentQuestion.value = state.currentQuestion
  if (state.currentIndex !== undefined) currentIndex.value = state.currentIndex
  if (state.totalQuestions !== undefined) totalQuestions.value = state.totalQuestions
  if (state.score !== undefined) score.value = state.score
  if (state.correctCount !== undefined) correctCount.value = state.correctCount
  if (state.timerEndTime) timerEndTime.value = state.timerEndTime
  if (state.cooldownRemaining !== undefined) {
    cooldownRemaining.value = state.cooldownRemaining
    if (state.cooldownRemaining > 0) startCooldownTimer()
  }

  // 处理操作结果
  const actionResult = state.actionResult
  if (actionResult) {
    lastResult.value = {
      questionId: '',
      userAnswer: '',
      correctAnswer: actionResult.correctAnswer || '',
      correct: actionResult.correct,
      points: actionResult.points || 0,
      submitTime: Date.now()
    }
    // 2秒后清除反馈
    setTimeout(() => { lastResult.value = null }, 2000)
  }
})

// 监听 countdown
watch(countdown, (val) => {
  if (val > 0) gameStarted.value = false
})

// 监听 finished
watch(finished, (val) => {
  if (val) {
    gameStarted.value = false
    if (elapsedTimer) clearInterval(elapsedTimer)
  }
})

// 监听 winner
watch(winner, (val) => {
  if (val) emit('finished', val)
})

onMounted(() => {
  connect()
  joinRoom(props.roomId)

  // 发送 start action 触发开始
  setTimeout(() => {
    sendAction({ type: 'start' })
    gameStarted.value = true
    startTime.value = Date.now()
    elapsedTimer = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startTime.value) / 1000)
    }, 1000)
  }, 500)
})

onUnmounted(() => {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
  if (cooldownTimer) { clearInterval(cooldownTimer); cooldownTimer = null }
})
</script>

<style scoped>
.minigame { max-width: 600px; margin: 0 auto; padding: 20px; }
.game-waiting, .game-finished { text-align: center; padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px 0; }
p { color: #888; margin: 0; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s ease-in-out; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.2); } }

.game-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; font-size: 14px; color: #aaa; }
.header-center strong { color: #00ff88; }
.timer { font-variant-numeric: tabular-nums; }
.timer.urgent { color: #ff4444; font-weight: 700; }
.cooldown { color: #ffaa00; margin-right: 8px; }

.progress-bar { height: 4px; background: #1a2a1e; border-radius: 2px; margin-bottom: 20px; }
.progress-fill { height: 100%; background: #00ff88; border-radius: 2px; transition: width 0.3s; }

.question-text { font-size: 20px; color: #e0e0e0; margin-bottom: 8px; line-height: 1.5; }
.points-hint { font-size: 12px; color: #ffaa00; margin-bottom: 12px; }

.options-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
.option-btn { padding: 14px 16px; border: 2px solid #00ff8833; border-radius: 8px; background: #0a1a1044; color: #e0e0e0; font-size: 15px; cursor: pointer; transition: all 0.15s; text-align: left; }
.option-btn:hover:not(:disabled) { border-color: #00ff8866; background: #0a1a1088; }
.option-btn.selected { border-color: #00ff88; background: #00ff8822; }
.option-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.answer-input { margin-bottom: 12px; }
.bb-input { width: 100%; padding: 12px 16px; background: #0a1a10; border: 1px solid #00ff8833; border-radius: 8px; color: #e0e0e0; font-size: 16px; outline: none; box-sizing: border-box; }
.bb-input:focus { border-color: #00ff88; }
.bb-input:disabled { opacity: 0.4; }

.submit-btn { width: 100%; padding: 12px; border: 1px solid #00ff8866; border-radius: 8px; background: #00ff8822; color: #00ff88; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.submit-btn:hover:not(:disabled) { background: #00ff8833; }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.result-feedback { margin-top: 12px; padding: 10px; border-radius: 6px; font-size: 14px; text-align: center; }
.result-feedback.correct { background: #00ff8815; color: #00ff88; border: 1px solid #00ff8833; }
.result-feedback.wrong { background: #ff444415; color: #ff4444; border: 1px solid #ff444433; }

.completed { text-align: center; padding: 40px 0; }
.done-msg { font-size: 18px; color: #00ff88; }
.final-score { margin-top: 12px; font-size: 24px; font-weight: 700; color: #00ff88; }

.winner-info { margin: 16px 0; }
.winner-name { font-size: 24px; font-weight: 700; color: #00ff88; }
.winner-label { font-size: 18px; color: #aaa; margin-left: 8px; }
.final-stats { margin-top: 16px; color: #888; font-size: 14px; }
</style>
