<template>
  <div class="minigame custom-game">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div v-if="winner" class="winner-info">
        <span class="winner-name">{{ winner.playerName }}</span>
        <span class="winner-label">获胜！</span>
      </div>
      <div v-else class="winner-info"><span class="winner-label">无胜者</span></div>
      <div class="final-stats">
        <div>最终得分: {{ score }}</div>
        <div>答对: {{ correctCount }}/{{ totalQuestions }}</div>
      </div>
    </div>

    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🎮</div>
      <h2>{{ gameTitle }}</h2>
      <p>等待管理员开始比赛...</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
    </div>

    <div v-else class="game-playing">
      <!-- 顶部信息栏 -->
      <div class="game-header">
        <div class="header-left">
          <span v-if="gameType === 'score' && timerEndTime" class="timer" :class="{ urgent: timeRemaining <= 10 }">
            ⏱ {{ formatTime(timeRemaining) }}
          </span>
          <span v-else class="timer">⏱ {{ formatTime(elapsed) }}</span>
        </div>
        <div class="header-center">
          得分: <strong>{{ score }}</strong> · 答对 {{ correctCount }}/{{ totalQuestions }}
        </div>
        <div class="header-right">
          <span v-if="cooldownRemaining > 0" class="cooldown">⏳ {{ cooldownRemaining }}s</span>
          <span v-if="maxAttempts > 0" class="attempts">提交 {{ attemptsUsed }}/{{ maxAttempts }}</span>
        </div>
      </div>

      <!-- 进度条 -->
      <div class="progress-bar">
        <div class="progress-fill" :style="{ width: progressPercent + '%' }"></div>
      </div>

      <!-- 管理员评判模式提示 -->
      <div v-if="isAdminJudge" class="judge-banner">📝 本题由管理员评判，提交后请等待结果</div>

      <!-- 全部一起提交模式 -->
      <template v-if="isBatch">
        <div v-if="done" class="completed">
          <span class="done-msg">✅ 已完成，等待其他玩家...</span>
        </div>
        <template v-else>
          <div class="batch-list">
            <div v-for="(q, qi) in batchQuestions" :key="q.id" class="batch-q" :class="{ locked: q.locked }">
              <div class="batch-q-head">
                <span class="q-index">Q{{ qi + 1 }}</span>
                <span v-if="q.locked" class="q-locked">🔒 已锁定</span>
                <span v-if="showReveal && q.locked" class="q-reveal">正确答案：{{ q.correctAnswer }}</span>
              </div>
              <div class="batch-q-text">{{ q.text }}</div>
              <div v-if="q.options && q.options.length" class="options-grid">
                <button
                  v-for="opt in q.options"
                  :key="opt"
                  class="option-btn"
                  :class="{ selected: batchAnswers[q.id] === opt }"
                  :disabled="q.locked || cooldownRemaining > 0"
                  @click="batchAnswers[q.id] = opt"
                >{{ opt }}</button>
              </div>
              <input
                v-else
                v-model="batchAnswers[q.id]"
                class="bb-input"
                placeholder="输入答案"
                :disabled="q.locked || cooldownRemaining > 0"
              />
            </div>
          </div>
          <button class="submit-btn" :disabled="!hasBatchAnswer || cooldownRemaining > 0" @click="submitBatch">
            {{ cooldownRemaining > 0 ? `冷却中 ${cooldownRemaining}s` : (isAdminJudge ? '提交给管理员' : '提交全部答案') }}
          </button>
        </template>
      </template>

      <!-- 单题提交模式 -->
      <template v-else>
        <div v-if="done" class="completed">
          <span class="done-msg">✅ 已完成，等待其他玩家...</span>
        </div>
        <div v-else-if="currentQuestion" class="question-area">
          <div class="question-text">{{ currentQuestion.text }}</div>
          <div v-if="currentQuestion.points > 1" class="points-hint">本题 {{ currentQuestion.points }} 分</div>

          <div v-if="currentQuestion.options && currentQuestion.options.length" class="options-grid">
            <button
              v-for="opt in currentQuestion.options"
              :key="opt"
              class="option-btn"
              :class="{ selected: userAnswer === opt }"
              :disabled="cooldownRemaining > 0"
              @click="selectOption(opt)"
            >{{ opt }}</button>
          </div>
          <div v-else class="answer-input">
            <input ref="inputRef" v-model="userAnswer" class="bb-input" placeholder="输入答案"
              :disabled="cooldownRemaining > 0" @keyup.enter="submitAnswer" />
            <button class="submit-btn" :disabled="!userAnswer || cooldownRemaining > 0" @click="submitAnswer">
              {{ cooldownRemaining > 0 ? `冷却中 ${cooldownRemaining}s` : '提交' }}
            </button>
          </div>
        </div>
      </template>

      <!-- 反馈 -->
      <div v-if="feedback" class="result-feedback" :class="feedback.type">
        <div>{{ feedback.text }}</div>
        <div v-if="feedback.detail" class="fb-detail">{{ feedback.detail }}</div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const bbAuth = useBbAuthStore()
const myId = computed(() => bbAuth.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const userAnswer = ref('')
const inputRef = ref<HTMLInputElement>()
const batchAnswers = ref<Record<string, string>>({})
const startTime = ref(0)
const elapsed = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

const gameTitle = ref('自定义游戏')
const gameType = ref<'quiz' | 'score'>('quiz')
const winCondition = ref('')
const submitMode = ref<'single' | 'batch'>('single')
const wrongFeedback = ref('none')
const currentQuestion = ref<any>(null)
const batchQuestions = ref<any[]>([])
const currentIndex = ref(0)
const totalQuestions = ref(0)
const score = ref(0)
const correctCount = ref(0)
const attemptsUsed = ref(0)
const maxAttempts = ref(0)
const cooldownRemaining = ref(0)
const timerEndTime = ref(0)
const done = ref(false)
const feedback = ref<{ type: string; text: string; detail?: string } | null>(null)

let cooldownTimer: ReturnType<typeof setInterval> | null = null
let startSent = false

const isAdminJudge = computed(() => winCondition.value === 'admin_judge')
const isBatch = computed(() => submitMode.value === 'batch' || isAdminJudge.value)
const showReveal = computed(() => wrongFeedback.value === 'reveal')

const gameStarted = computed(() => {
  const gs: any = gameState.value
  if (!gs) return false
  return gs.totalQuestions !== undefined || gs.currentQuestion !== undefined
})

const progressPercent = computed(() => {
  if (totalQuestions.value === 0) return 0
  return (correctCount.value / totalQuestions.value) * 100
})

const timeRemaining = computed(() => {
  if (!timerEndTime.value) return 0
  return Math.max(0, Math.ceil((timerEndTime.value - Date.now()) / 1000))
})

const hasBatchAnswer = computed(() => Object.values(batchAnswers.value).some(v => v && String(v).trim()))

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
  sendAction({ type: 'answer', answer: userAnswer.value })
  userAnswer.value = ''
  nextTick(() => inputRef.value?.focus())
}

function submitBatch() {
  if (!hasBatchAnswer.value || cooldownRemaining.value > 0) return
  const payload: Record<string, string> = {}
  for (const q of batchQuestions.value) {
    if (q.locked) continue
    const v = batchAnswers.value[q.id]
    if (v != null && String(v).trim()) payload[q.id] = String(v).trim()
  }
  sendAction({ type: 'submit_all', answers: payload })
}

function startCooldownTimer() {
  if (cooldownTimer) clearInterval(cooldownTimer)
  cooldownTimer = setInterval(() => {
    if (cooldownRemaining.value > 0) cooldownRemaining.value--
    else { clearInterval(cooldownTimer!); cooldownTimer = null }
  }, 1000)
}

function buildFeedback(result: any) {
  if (!result) return
  if (result.error) {
    feedback.value = { type: 'wrong', text: result.error }
    return
  }
  if (result.submitted) {
    feedback.value = { type: 'info', text: '已提交，等待管理员评判' }
    return
  }
  if (result.correct) {
    feedback.value = { type: 'correct', text: '✅ 正确' }
    return
  }
  // 错误
  const parts: string[] = ['❌ 错误']
  let detail = ''
  if (result.gradedCount !== undefined) {
    detail = `本次答对 ${result.gradedCorrect}/${result.gradedCount} 题`
  }
  if (result.correctAnswer) {
    detail = `正确答案：${result.correctAnswer}`
  }
  if (result.correctAnswers && Object.keys(result.correctAnswers).length) {
    detail = '正确答案：' + Object.values(result.correctAnswers).join('、')
  }
  feedback.value = { type: 'wrong', text: parts.join('，'), detail }
}

watch(gameState, (state: any) => {
  if (!state) return
  if (state.gameType) gameType.value = state.gameType
  if (state.winCondition) winCondition.value = state.winCondition
  if (state.submitMode) submitMode.value = state.submitMode
  if (state.wrongFeedback) wrongFeedback.value = state.wrongFeedback
  if (state.currentQuestion !== undefined) currentQuestion.value = state.currentQuestion
  if (state.questions !== undefined) {
    batchQuestions.value = state.questions
    // 用服务端已保存答案初始化本地输入
    for (const q of state.questions) {
      if (q.userAnswer && batchAnswers.value[q.id] == null) batchAnswers.value[q.id] = q.userAnswer
    }
  }
  if (state.currentIndex !== undefined) currentIndex.value = state.currentIndex
  if (state.totalQuestions !== undefined) totalQuestions.value = state.totalQuestions
  if (state.score !== undefined) score.value = state.score
  if (state.correctCount !== undefined) correctCount.value = state.correctCount
  if (state.attemptsUsed !== undefined) attemptsUsed.value = state.attemptsUsed
  if (state.maxAttempts !== undefined) maxAttempts.value = state.maxAttempts
  if (state.timerEndTime) timerEndTime.value = state.timerEndTime
  if (state.done !== undefined) done.value = state.done
  if (state.cooldownRemaining !== undefined) {
    cooldownRemaining.value = state.cooldownRemaining
    if (state.cooldownRemaining > 0) startCooldownTimer()
  }
  if (state.actionResult) {
    buildFeedback(state.actionResult)
    setTimeout(() => { feedback.value = null }, 3500)
  }
})

watch(gameStarted, (val) => {
  if (!val) return
  if (!startSent) { startSent = true; sendAction({ type: 'start' }) }
  if (!elapsedTimer) {
    startTime.value = Date.now()
    elapsedTimer = setInterval(() => {
      elapsed.value = Math.floor((Date.now() - startTime.value) / 1000)
    }, 1000)
  }
})

watch(finished, (val) => {
  if (val && elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
})

watch(winner, (val) => { if (val) emit('finished', val) })

onMounted(() => connect())
onUnmounted(() => {
  if (elapsedTimer) clearInterval(elapsedTimer)
  if (cooldownTimer) clearInterval(cooldownTimer)
  disconnect()
})
</script>

<style scoped>
.minigame { max-width: 640px; margin: 0 auto; padding: 20px; }
.game-waiting, .game-finished { text-align: center; padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px 0; }
p { color: #888; margin: 0; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s ease-in-out; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.2); } }
.game-header { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; font-size: 14px; color: #aaa; gap: 8px; flex-wrap: wrap; }
.header-center strong { color: #00ff88; }
.timer.urgent { color: #ff4444; font-weight: 700; }
.cooldown { color: #ffaa00; }
.attempts { color: #8a8aa5; }
.progress-bar { height: 4px; background: #1a2a1e; border-radius: 2px; margin-bottom: 18px; }
.progress-fill { height: 100%; background: #00ff88; border-radius: 2px; transition: width 0.3s; }
.judge-banner { background: #00c8ff14; border: 1px solid #00c8ff44; color: #7fd8ff; border-radius: 8px; padding: 10px 14px; font-size: 13px; margin-bottom: 14px; }
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
.submit-btn { width: 100%; padding: 12px; border: 1px solid #00ff8866; border-radius: 8px; background: #00ff8822; color: #00ff88; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; margin-top: 8px; }
.submit-btn:hover:not(:disabled) { background: #00ff8833; }
.submit-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.result-feedback { margin-top: 14px; padding: 12px; border-radius: 8px; font-size: 14px; text-align: center; }
.result-feedback.correct { background: #00ff8815; color: #00ff88; border: 1px solid #00ff8833; }
.result-feedback.wrong { background: #ff444415; color: #ff4444; border: 1px solid #ff444433; }
.result-feedback.info { background: #00c8ff14; color: #7fd8ff; border: 1px solid #00c8ff33; }
.fb-detail { margin-top: 4px; font-size: 13px; opacity: 0.9; }
.batch-list { display: flex; flex-direction: column; gap: 14px; }
.batch-q { background: #0f0f2c; border: 1px solid #ffffff12; border-radius: 10px; padding: 14px; }
.batch-q.locked { opacity: 0.6; }
.batch-q-head { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; font-size: 12px; }
.q-index { background: #3a3a7a; color: #ddd; border-radius: 6px; padding: 1px 8px; }
.q-locked { color: #ffaa00; }
.q-reveal { color: #00ff88; margin-left: auto; }
.batch-q-text { color: #e6e6ff; font-size: 16px; margin-bottom: 10px; }
.batch-q .options-grid { margin-bottom: 0; }
.completed { text-align: center; padding: 40px 0; }
.done-msg { font-size: 18px; color: #00ff88; }
.winner-info { margin: 16px 0; }
.winner-name { font-size: 24px; font-weight: 700; color: #00ff88; }
.winner-label { font-size: 18px; color: #aaa; margin-left: 8px; }
.final-stats { margin-top: 16px; color: #888; font-size: 14px; }
</style>
