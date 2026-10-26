<template>
  <div class="power-challenge-game">
    <div class="pc-header">
      <div class="pc-theme">{{ theme }}</div>
      <div class="pc-status" v-if="status === 'playing'">比赛中</div>
      <div class="pc-status" v-else-if="status === 'countdown'">倒计时 {{ countdown }}</div>
      <div class="pc-status finished" v-else-if="status === 'finished'">已结束</div>
    </div>

    <div v-if="questions.length === 0 && !gameStarted" class="empty-state">等待题目加载中...</div>

    <div class="questions-list">
      <div v-for="q in questions" :key="q.id" class="question-card" :class="{ answered: q.answered, won: q.winner }">
        <div class="q-text">{{ q.text }}</div>
        <div class="q-options">
          <button
            v-for="opt in q.options"
            :key="opt"
            class="q-option"
            :class="{
              'correct': q.winner && q.winner.playerId === myId,
              'disabled': q.answered,
              'mine': !q.answered && connected
            }"
            :disabled="q.answered || !canAnswer"
            @click="answerQuestion(q.id, opt)"
          >
            {{ opt }}
          </button>
        </div>
        <div v-if="q.answered && q.winner" class="q-winner">
          🏆 {{ q.winner.playerName }} 占领
        </div>
      </div>
    </div>

    <div v-if="winners.length > 0 && (status === 'finished')" class="winners-summary">
      <div class="winners-title">🏆 晋级名额占领结果</div>
      <div v-for="w in winners" :key="w.playerId" class="winner-item">
        {{ w.playerName }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{
  roomId: string
  participants: { playerId: string; playerName: string; avatar: string | null; connected: boolean }[]
}>()

const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { connected, gameState, status, countdown, finished, connect, sendAction } = useMinigameSocket(roomIdRef)

const theme = ref('')
const questions = ref<any[]>([])
const winners = ref<any[]>([])

const gameStarted = computed(() => gameState.value && (countdown.value === -1 || countdown.value === 0 || status.value === 'playing'))
const canAnswer = computed(() => gameState.value?.status === 'playing' && connected.value)

function hasAnswered(questionId: string): boolean {
  return questions.value.some(q => q.id === questionId && q.answered)
}

function answerQuestion(questionId: string, option: string) {
  if (!canAnswer.value) return
  sendAction({ type: 'answer', questionId, selectedOption: option })
}

watch(gameState, (gs) => {
  if (!gs) return
  theme.value = gs.theme || ''
  questions.value = gs.questions || []
  winners.value = gs.winners || []
}, { deep: true })

watch(finished, (val) => {
  if (val) {
    theme.value = gameState.value?.theme || ''
    questions.value = gameState.value?.questions || []
    winners.value = gameState.value?.winners || []
  }
})

onMounted(() => connect())
</script>

<style scoped>
.power-challenge-game { max-width: 700px; margin: 0 auto; padding: 16px; }
.pc-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding: 12px 16px; background: #b39bff12; border: 1px solid #b39bff33; border-radius: 10px; }
.pc-theme { font-size: 20px; font-weight: 700; color: #b39bff; }
.pc-status { padding: 4px 12px; border-radius: 8px; font-size: 13px; font-weight: 600; }
.pc-status.finished { background: #88888822; color: #a99bd0; }
.questions-list { display: flex; flex-direction: column; gap: 14px; }
.question-card { background: #1e1436; border: 1px solid #ffffff12; border-radius: 12px; padding: 18px; }
.question-card.answered { border-color: #b39bff33; }
.question-card.won { border-color: #e6c98855; background: #1a1500; }
.q-text { font-size: 15px; font-weight: 600; color: #e8e0e0; margin-bottom: 12px; }
.q-options { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.q-option { padding: 10px 14px; border-radius: 8px; border: 1px solid #ffffff15; background: #1b1130; color: #cfc4ea; font-size: 13px; cursor: pointer; transition: all 0.2s; }
.q-option:hover:not(:disabled) { border-color: #b39bff55; color: #fff; }
.q-option.mine:not(:disabled) { border-color: #b39bff; color: #b39bff; background: #b39bff10; }
.q-option.correct { border-color: #e6c988; color: #e6c988; background: #e6c98815; }
.q-option.disabled { opacity: 0.5; cursor: default; }
.q-winner { margin-top: 10px; font-size: 13px; color: #e6c988; font-weight: 600; }
.winners-summary { margin-top: 24px; padding: 20px; background: #1b1130; border: 1px solid #e6c98833; border-radius: 12px; }
.winners-title { font-size: 18px; font-weight: 700; color: #e6c988; margin-bottom: 12px; }
.winner-item { padding: 8px 16px; color: #ece7fb; font-size: 15px; }
.empty-state { text-align: center; color: #6b5f92; padding: 40px; font-size: 14px; }
@media (max-width: 480px) {
  .power-challenge-game { padding: 10px; }
  .pc-header { flex-wrap: wrap; gap: 8px; padding: 10px 12px; }
  .pc-theme { font-size: 17px; }
  .question-card { padding: 14px; }
  .q-options { grid-template-columns: 1fr; }
}
</style>
