<template>
  <div class="minigame describe-guess">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">💡</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!started" class="game-waiting">
      <div class="game-icon">💡</div>
      <h2>描述猜谜</h2>
      <p>根据逐条放出的描述猜出答案。每题共 {{ clueTotal }} 条描述，每条间隔放出。任意时刻可作答，每题仅 1 次。越早答对得分越高，答错或超时 0 分。</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown.toFixed(1) }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>第 {{ currentIndex + 1 }} / {{ totalQuestions }} 题</span>
        <span class="my-score">我的得分：{{ myScore }}</span>
      </div>

      <div class="clues">
        <div v-for="(c, i) in clues" :key="i" class="clue-line">
          <span class="clue-badge">{{ i + 1 }}</span>
          <span class="clue-text">{{ c }}</span>
        </div>
        <div v-if="clues.length === 0" class="clue-line dim">描述即将放出…</div>
      </div>

      <div v-if="isReveal" class="reveal-panel">
        <div class="reveal-title">第 {{ currentIndex + 1 }} 题结束 · 得分公示</div>
        <div class="reveal-sub">仅公示得分分布，不公布具体选手</div>

        <div class="dist-section">
          <div class="dist-heading">本题得分分布</div>
          <div v-if="questionDist.length === 0" class="dist-empty">暂无数据</div>
          <div v-for="item in questionDist" :key="'q-' + item.score" class="dist-row">
            <span class="dist-label">{{ item.score }} 分</span>
            <div class="dist-bar"><div class="dist-fill" :style="{ width: barWidth(item.count, maxQuestionCount) }"></div></div>
            <span class="dist-count">{{ item.count }} 人</span>
          </div>
        </div>

        <div class="dist-section">
          <div class="dist-heading">累计总分分布</div>
          <div v-if="totalDist.length === 0" class="dist-empty">暂无数据</div>
          <div v-for="item in totalDist" :key="'t-' + item.score" class="dist-row">
            <span class="dist-label">{{ item.score }} 分</span>
            <div class="dist-bar"><div class="dist-fill total" :style="{ width: barWidth(item.count, maxTotalCount) }"></div></div>
            <span class="dist-count">{{ item.count }} 人</span>
          </div>
        </div>

        <div class="hint">下一题 {{ revealRemaining }}s 后开始</div>
      </div>

      <template v-else>
        <div class="answer-area">
          <template v-if="!answeredThisQuestion">
            <input v-model="inputValue" class="ans-input" placeholder="输入你的答案" @keyup.enter="submit" />
            <button class="submit-btn" :disabled="!inputValue.trim() || submitting" @click="submit">提交（仅 1 次）</button>
          </template>
          <div v-else class="submitted">
            <p class="submitted-title">本题已作答，等待下一题…</p>
          </div>
        </div>

        <div class="hint">已放出 {{ revealedClues }} / {{ clueTotal }} 条描述<span v-if="secondsToNext > 0"> · {{ secondsToNext }}s 后下一条</span></div>
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

const inputValue = ref('')
const submitting = ref(false)
const nowTs = ref(Date.now())
let tickTimer: ReturnType<typeof setInterval> | null = null

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const clues = computed<string[]>(() => Array.isArray(state.value.clues) ? state.value.clues : [])
const currentIndex = computed(() => state.value.currentIndex || 0)
const totalQuestions = computed(() => state.value.totalQuestions || 0)
const clueTotal = computed(() => state.value.clueTotal || 0)
const revealedClues = computed(() => state.value.revealedClues || 0)
const myScore = computed(() => state.value.myScore || 0)
const answeredThisQuestion = computed(() => !!state.value.answeredThisQuestion)
const secondsToNext = computed(() => {
  const t = state.value.nextAt
  if (!t) return 0
  return Math.max(0, Math.ceil((t - nowTs.value) / 1000))
})

const isReveal = computed(() => state.value.phase === 'reveal' && !!state.value.distribution)
const questionDist = computed<{ score: number; count: number }[]>(() =>
  Array.isArray(state.value.distribution?.question) ? state.value.distribution.question : []
)
const totalDist = computed<{ score: number; count: number }[]>(() =>
  Array.isArray(state.value.distribution?.total) ? state.value.distribution.total : []
)
const maxQuestionCount = computed(() => questionDist.value.reduce((m, i) => Math.max(m, i.count), 1))
const maxTotalCount = computed(() => totalDist.value.reduce((m, i) => Math.max(m, i.count), 1))
const revealRemaining = computed(() => {
  const t = state.value.revealEndsAt
  if (!t) return 0
  return Math.max(0, Math.ceil((t - nowTs.value) / 1000))
})

function barWidth(count: number, max: number) {
  return `${Math.round((count / (max || 1)) * 100)}%`
}

function submit() {
  if (submitting.value || answeredThisQuestion.value) return
  const v = inputValue.value.trim()
  if (!v) return
  submitting.value = true
  sendAction({ type: 'answer', value: v })
  inputValue.value = ''
  setTimeout(() => { submitting.value = false }, 600)
}

watch(() => currentIndex.value, () => { inputValue.value = '' })
watch(() => state.value.answeredThisQuestion, (v) => { if (v) inputValue.value = '' })
watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => {
  connect()
  tickTimer = setInterval(() => { nowTs.value = Date.now() }, 500)
})
onUnmounted(() => {
  if (tickTimer) clearInterval(tickTimer)
  disconnect()
})
</script>

<style scoped>
.describe-guess { max-width: 640px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #ece7fb; margin: 0 0 8px; }
p { color: #8f83b8; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #b39bff; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #6b5f92; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #a99bd0; font-size: 15px; font-weight: 600; margin-bottom: 14px; }
.my-score { color: #b39bff; }
.clues { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.clue-line { display: flex; align-items: center; gap: 10px; background: #0f1b2e; border: 1px solid #b39bff33; border-radius: 8px; padding: 10px 14px; text-align: left; color: #d6e4ff; font-size: 15px; }
.clue-line.dim { color: #556; justify-content: center; }
.clue-badge { flex: 0 0 22px; height: 22px; border-radius: 50%; background: #b39bff22; color: #b39bff; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.clue-text { flex: 1; }
.answer-area { display: flex; gap: 10px; justify-content: center; align-items: center; margin-bottom: 12px; }
.ans-input { width: 220px; padding: 12px 14px; font-size: 16px; background: #17112a; border: 1px solid #b39bff44; border-radius: 8px; color: #ece7fb; outline: none; }
.ans-input:focus { border-color: #b39bff; }
.submit-btn { padding: 12px 24px; font-size: 15px; font-weight: 700; color: #b39bff; background: #b39bff22; border: 2px solid #b39bff; border-radius: 10px; cursor: pointer; }
.submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.submitted { color: #b39bff; font-size: 14px; }
.hint { color: #7d6fa6; font-size: 13px; }
.reveal-panel { background: #0f1b2e; border: 1px solid #b39bff44; border-radius: 12px; padding: 18px; text-align: left; }
.reveal-title { color: #d6e4ff; font-size: 17px; font-weight: 700; text-align: center; }
.reveal-sub { color: #7d6fa6; font-size: 12px; text-align: center; margin: 4px 0 16px; }
.dist-section { margin-bottom: 16px; }
.dist-heading { color: #b39bff; font-size: 14px; font-weight: 600; margin-bottom: 8px; }
.dist-empty { color: #556; font-size: 13px; }
.dist-row { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.dist-label { flex: 0 0 48px; color: #a99bd0; font-size: 13px; }
.dist-bar { flex: 1; height: 12px; background: #17112a; border-radius: 6px; overflow: hidden; }
.dist-fill { height: 100%; min-width: 2px; background: linear-gradient(90deg, #7b5cff, #b39bff); border-radius: 6px; transition: width 0.3s ease; }
.dist-fill.total { background: linear-gradient(90deg, #c9973f, #e6c988); }
.dist-count { flex: 0 0 40px; text-align: right; color: #d6e4ff; font-size: 13px; }
.reveal-panel .hint { text-align: center; margin-top: 10px; }
.winner-name { font-size: 26px; font-weight: 700; color: #e6c988; }
.winner-label { display: block; font-size: 14px; color: #e6c988; margin-top: 4px; }
@media (max-width: 480px) {
  .describe-guess { padding: 12px; }
  .countdown-big { font-size: 52px; }
  .game-icon { font-size: 48px; }
  .ans-input { width: min(220px, 62vw); }
  .answer-area { flex-wrap: wrap; }
}
</style>
