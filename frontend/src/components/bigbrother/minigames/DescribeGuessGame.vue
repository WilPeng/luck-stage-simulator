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
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
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
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 15px; font-weight: 600; margin-bottom: 14px; }
.my-score { color: #00ff88; }
.clues { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
.clue-line { display: flex; align-items: center; gap: 10px; background: #0f1b2e; border: 1px solid #00ff8833; border-radius: 8px; padding: 10px 14px; text-align: left; color: #d6e4ff; font-size: 15px; }
.clue-line.dim { color: #556; justify-content: center; }
.clue-badge { flex: 0 0 22px; height: 22px; border-radius: 50%; background: #00ff8822; color: #00ff88; font-size: 12px; display: flex; align-items: center; justify-content: center; }
.clue-text { flex: 1; }
.answer-area { display: flex; gap: 10px; justify-content: center; align-items: center; margin-bottom: 12px; }
.ans-input { width: 220px; padding: 12px 14px; font-size: 16px; background: #0a1a10; border: 1px solid #00ff8844; border-radius: 8px; color: #e0e0e0; outline: none; }
.ans-input:focus { border-color: #00ff88; }
.submit-btn { padding: 12px 24px; font-size: 15px; font-weight: 700; color: #00ff88; background: #00ff8822; border: 2px solid #00ff88; border-radius: 10px; cursor: pointer; }
.submit-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.submitted { color: #00ff88; font-size: 14px; }
.hint { color: #777; font-size: 13px; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
