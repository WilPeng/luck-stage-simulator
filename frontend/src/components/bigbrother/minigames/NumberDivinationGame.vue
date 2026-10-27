<template>
  <div class="minigame number-divination">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🔮</div>
      <h2>占卜结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || winnerNameFallback || '无胜者' }}</span>
        <span v-if="winner || winnerNameFallback" class="winner-label">获得 HOH！</span>
      </div>
      <div class="final-board">
        <div
          v-for="(row, i) in finalRanking"
          :key="row.playerId"
          class="final-row"
          :class="{ me: row.playerId === myId, top: i === 0 }"
        >
          <span class="rank-no">{{ i + 1 }}</span>
          <span class="rank-name">{{ row.playerName }}</span>
          <span class="rank-score">{{ row.score }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="!started" class="game-waiting">
      <div class="game-icon">🔮</div>
      <h2>数字占卜术</h2>
      <p>每位玩家持有数字 <strong>1–10</strong>，每轮同时打出 1 个数字，已打出的数字不可再次使用。</p>
      <p>未与其他玩家重复的数字获得对应分数；其中<strong>最大的数字获得双倍分数</strong>。</p>
      <p>重复数字中，<strong>重复次数最多</strong>的数字，对应玩家全部扣除该数字的分数。</p>
      <p>共 {{ totalRounds }} 轮，最终得分最高且不并列者获得 HOH；若并列则比较最后一轮得分，再比较提交时间。</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>第 {{ round }} / {{ totalRounds }} 轮</span>
        <span class="timer" :class="{ urgent: secondsLeft <= 5 }">⏱ {{ secondsLeft }}s</span>
        <span class="my-score" :class="{ neg: myScore < 0 }">我的得分：{{ myScore }}</span>
      </div>

      <div class="scoreboard">
        <span
          v-for="row in ranking"
          :key="row.playerId"
          class="score-chip"
          :class="{ me: row.playerId === myId, neg: row.score < 0 }"
        >
          {{ row.playerName }}<b>{{ row.score }}</b>
        </span>
      </div>

      <div v-if="phase === 'pick'" class="pick-area">
        <p class="hint">选择一个尚未使用的数字打出（{{ submittedCount }}/{{ playerCount }} 人已提交）</p>
        <div class="number-grid">
          <button
            v-for="n in numbers"
            :key="n"
            class="num-btn"
            :class="{ used: myUsed.includes(n), chosen: myChoice === n }"
            :disabled="myUsed.includes(n) || myChoice != null"
            @click="choose(n)"
          >
            {{ n }}
          </button>
        </div>
        <p v-if="myChoice != null" class="chosen">你已打出：{{ myChoice }}，等待其他玩家…</p>
        <p v-else-if="usedCount > 0" class="used-hint">已使用 {{ usedCount }} / 10 个数字</p>
      </div>

      <div v-else class="reveal-area">
        <div class="reveal-title">第 {{ lastResult?.round }} 轮结算</div>
        <div class="reveal-list">
          <div
            v-for="row in revealRows"
            :key="row.pid"
            class="reveal-row"
            :class="{
              me: row.pid === myId,
              doubled: row.doubled,
              penalized: row.penalized
            }"
          >
            <span class="rr-name">{{ nameOf(row.pid) }}</span>
            <span class="rr-num">{{ row.num }}</span>
            <span class="rr-delta" :class="{ plus: row.delta > 0, minus: row.delta < 0 }">
              {{ row.delta > 0 ? '+' : '' }}{{ row.delta }}
            </span>
            <span v-if="row.doubled" class="rr-tag double">双倍</span>
            <span v-if="row.penalized" class="rr-tag penalty">重复最多</span>
          </div>
        </div>
        <p v-if="lastResult?.auto?.length" class="auto-hint">
          超时自动出牌：{{ lastResult.auto.map(nameOf).join('、') }}
        </p>
        <div class="next-hint">
          {{ round >= totalRounds ? '正在结算最终成绩…' : `下一轮 ${secondsLeft} 秒后开始` }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[] }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, scores: finalScores, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')
const sentNumber = ref<number | null>(null)

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const phase = computed(() => state.value.phase || 'pick')
const round = computed(() => state.value.round || 0)
const totalRounds = computed(() => state.value.totalRounds || 10)
const myScore = computed(() => state.value.myScore || 0)
const myUsed = computed<number[]>(() => Array.isArray(state.value.myUsed) ? state.value.myUsed : [])
const myChoice = computed<number | null>(() => {
  if (sentNumber.value != null) return sentNumber.value
  return state.value.myChoice ?? null
})
const submittedCount = computed(() => state.value.submittedCount || 0)
const playerCount = computed(() => state.value.playerCount || props.participants.length)
const secondsLeft = computed(() => state.value.secondsLeft || 0)
const ranking = computed<any[]>(() => Array.isArray(state.value.ranking) ? state.value.ranking : [])
const lastResult = computed<any>(() => state.value.lastResult || null)
const numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const usedCount = computed(() => myUsed.value.length)

const finalRanking = computed<any[]>(() => {
  if (ranking.value.length) return ranking.value
  return props.participants
    .map(p => ({
      playerId: p.playerId,
      playerName: p.playerName,
      score: Number((finalScores.value || {})[p.playerId] || 0)
    }))
    .sort((a, b) => b.score - a.score)
})

const winnerNameFallback = computed(() => {
  const wid = state.value.winnerId
  if (!wid) return ''
  return nameOf(wid)
})

function nameOf(pid: string): string {
  const fromProps = props.participants.find(p => p.playerId === pid)?.playerName
  return fromProps || (state.value.names && state.value.names[pid]) || pid.slice(0, 4)
}

function isDoubled(num: number): boolean {
  const r = lastResult.value
  return !!r && r.maxUnique === num && Array.isArray(r.uniqueNumbers) && r.uniqueNumbers.includes(num)
}

function isPenalized(num: number): boolean {
  const r = lastResult.value
  return !!r && Array.isArray(r.penaltyNumbers) && r.penaltyNumbers.includes(num)
}

const revealRows = computed(() => {
  const r = lastResult.value
  if (!r || !r.choices) return []
  return Object.keys(r.choices)
    .map(pid => {
      const num = Number(r.choices[pid])
      return {
        pid,
        num,
        delta: Number(r.deltas?.[pid] || 0),
        doubled: isDoubled(num),
        penalized: isPenalized(num)
      }
    })
    .sort((a, b) => a.num - b.num)
})

function choose(n: number) {
  if (phase.value !== 'pick' || myChoice.value != null || myUsed.value.includes(n)) return
  sentNumber.value = n
  sendAction({ type: 'choose', number: n })
}

watch(phase, (val) => {
  if (val === 'pick') sentNumber.value = null
})

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => { connect() })
onUnmounted(() => { disconnect() })
</script>

<style scoped>
.number-divination { max-width: 640px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #ece7fb; margin: 0 0 8px; }
p { color: #8f83b8; font-size: 14px; line-height: 1.6; }
p strong { color: #b39bff; }
.countdown-big { font-size: 72px; font-weight: 700; color: #b39bff; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #6b5f92; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; align-items: center; color: #a99bd0; font-size: 14px; margin-bottom: 12px; }
.timer.urgent { color: #ff4444; font-weight: 700; }
.my-score { color: #b39bff; font-weight: 700; }
.my-score.neg { color: #ff6b6b; }
.scoreboard { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 18px; }
.score-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: #14213a; border: 1px solid #b39bff33; border-radius: 999px; color: #e0d7ff; font-size: 13px; }
.score-chip b { color: #b39bff; font-size: 14px; }
.score-chip.me { border-color: #b39bff; background: #b39bff1a; }
.score-chip.neg b { color: #ff6b6b; }
.pick-area { display: flex; flex-direction: column; gap: 14px; }
.hint { color: #8f83b8; font-size: 13px; margin: 0; }
.used-hint { color: #6b5f92; font-size: 12px; margin: 0; }
.number-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.num-btn { padding: 18px 0; font-size: 22px; font-weight: 700; color: #e2d9ff; background: linear-gradient(160deg, #2e1e52, #1a1233); border: 2px solid #ffffff1c; border-radius: 12px; cursor: pointer; transition: all 0.15s; }
.num-btn:hover:not(:disabled) { border-color: #b39bff; color: #b39bff; transform: translateY(-2px); }
.num-btn.chosen { border-color: #b39bff; background: #b39bff22; color: #b39bff; }
.num-btn.used { opacity: 0.28; cursor: not-allowed; text-decoration: line-through; }
.num-btn:disabled { cursor: not-allowed; }
.chosen { color: #b39bff; margin: 0; font-size: 14px; }
.reveal-area { display: flex; flex-direction: column; gap: 12px; }
.reveal-title { font-size: 18px; font-weight: 800; color: #e0d7ff; }
.reveal-list { display: flex; flex-direction: column; gap: 8px; }
.reveal-row { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-radius: 10px; background: #ffffff08; border: 1px solid #ffffff12; }
.reveal-row.me { border-color: #b39bff66; background: #b39bff12; }
.reveal-row.doubled { box-shadow: inset 0 0 0 1px #e6c98866; }
.reveal-row.penalized { box-shadow: inset 0 0 0 1px #ff6b6b66; }
.rr-name { flex: 1; text-align: left; color: #e0d7ff; font-size: 14px; }
.rr-num { width: 40px; font-size: 20px; font-weight: 800; color: #b39bff; }
.rr-delta { width: 52px; font-size: 16px; font-weight: 700; color: #8f83b8; }
.rr-delta.plus { color: #7ee0a0; }
.rr-delta.minus { color: #ff8f8f; }
.rr-tag { font-size: 10px; padding: 2px 6px; border-radius: 8px; }
.rr-tag.double { color: #e6c988; background: #e6c9881a; border: 1px solid #e6c98844; }
.rr-tag.penalty { color: #ff8f8f; background: #ff6b6b1a; border: 1px solid #ff6b6b44; }
.auto-hint { color: #c9a35b; font-size: 12px; margin: 0; }
.next-hint { color: #6b5f92; font-size: 12px; }
.winner-name { font-size: 26px; font-weight: 700; color: #e6c988; }
.winner-label { display: block; font-size: 14px; color: #e6c988; margin-top: 4px; }
.final-board { max-width: 380px; margin: 24px auto 0; display: flex; flex-direction: column; gap: 6px; }
.final-row { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-radius: 10px; background: #ffffff08; border: 1px solid #ffffff10; color: #cfc4ea; font-size: 14px; }
.final-row.me { border-color: #b39bff55; }
.final-row.top { border-color: #e6c98866; background: #e6c98810; color: #e6c988; }
.rank-no { width: 20px; color: #7d6fa6; }
.final-row.top .rank-no { color: #e6c988; }
.rank-name { flex: 1; text-align: left; }
.rank-score { font-weight: 700; }
@media (max-width: 480px) {
  .number-divination { padding: 12px; }
  .countdown-big { font-size: 52px; }
  .game-icon { font-size: 48px; }
  .number-grid { gap: 8px; }
  .num-btn { padding: 14px 0; font-size: 20px; }
}
</style>
