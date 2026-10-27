<template>
  <div class="minigame german-heart">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!started" class="game-waiting">
      <div class="game-icon">🍓🔔</div>
      <h2>德国心脏病</h2>
      <p>观察桌面上的水果牌：当<strong>恰好出现 5 个相同水果</strong>时，最快抢铃者 +1 分。</p>
      <p>没有 5 个相同水果时抢铃视为错误，每次 -3 分（每人每轮仅可抢一次）。</p>
      <p>先得到 <strong>{{ targetPoints }}</strong> 分获胜；或只剩一人得分为正数时获胜。</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span class="round-info">第 {{ round }} 轮 · {{ phase === 'live' ? '抢铃中' : '结算中' }}</span>
        <span class="my-score" :class="{ neg: myScore < 0 }">我的得分：{{ myScore }}</span>
      </div>

      <div class="scoreboard">
        <span
          v-for="p in participants"
          :key="p.playerId"
          class="score-chip"
          :class="{ me: p.playerId === myId, neg: scoreOf(p.playerId) < 0 }"
        >
          {{ p.playerName }}<b>{{ scoreOf(p.playerId) }}</b>
        </span>
      </div>

      <div class="table-area">
        <div class="table-label">桌面水果牌</div>
        <div class="card-grid">
          <div
            v-for="(fruit, i) in cards"
            :key="`${round}-${i}`"
            class="fruit-card"
            :style="{ animationDelay: `${Math.min(i * 25, 400)}ms` }"
          >
            {{ fruit }}
          </div>
        </div>
      </div>

      <div v-if="phase === 'live'" class="action-area">
        <div class="timer-bar">
          <div class="timer-fill" :class="{ low: secondsLeft <= 2 }" :style="{ width: timeProgress + '%' }"></div>
        </div>
        <button class="bell-btn" :class="{ rung: !!myRing, wrong: myRing && !myRing.correct }" :disabled="!!myRing" @click="ring">
          <span class="bell-icon">🔔</span>
          <span class="bell-text">{{ myRing ? (myRing.correct ? '抢铃成功' : '抢铃错误') : '抢铃！' }}</span>
        </button>
        <p v-if="!myRing" class="hint">恰好 5 个相同水果出现时立刻抢铃；抢错扣 3 分。</p>
        <p v-else-if="!myRing.correct" class="hint bad">本轮没有 5 个相同水果，你被扣除 3 分。</p>
        <p v-else class="hint good">抢铃成功，+1 分！</p>
      </div>

      <div v-else class="reveal-area">
        <div class="reveal-title" :class="roundResult?.valid ? 'good' : 'bad'">
          {{ roundResult?.valid ? `✅ 出现了 5 个 ${roundResult?.fruit}！` : '❌ 本轮没有 5 个相同水果' }}
        </div>
        <div v-if="roundResult?.winnerId" class="reveal-line good">
          🏆 {{ nameOf(roundResult.winnerId) }} 抢铃成功 +1 分
        </div>
        <div v-else-if="wrongList.length" class="reveal-line bad">
          错误抢铃：{{ wrongList.map(nameOf).join('、') }}（各 -3 分）
        </div>
        <div v-else class="reveal-line">本轮无人抢铃</div>
        <div class="next-hint">下一轮 {{ secondsLeft }} 秒后开始…</div>
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
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')
const ringSent = ref(false)

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const phase = computed(() => state.value.phase || 'live')
const round = computed(() => state.value.round || 0)
const cards = computed<string[]>(() => Array.isArray(state.value.cards) ? state.value.cards : [])
const scores = computed<Record<string, number>>(() => state.value.scores || {})
const myScore = computed(() => state.value.myScore || 0)
const myRing = computed<any>(() => state.value.myRing || null)
const targetPoints = computed(() => state.value.targetPoints || 5)
const roundTime = computed(() => state.value.roundTime || 5)
const secondsLeft = computed(() => state.value.secondsLeft || 0)
const roundResult = computed<any>(() => state.value.roundResult || null)
const wrongList = computed<string[]>(() => Array.isArray(roundResult.value?.wrong) ? roundResult.value.wrong : [])
const timeProgress = computed(() => {
  if (phase.value !== 'live') return 0
  return Math.max(0, Math.min(100, (secondsLeft.value / roundTime.value) * 100))
})

function scoreOf(pid: string): number {
  return scores.value[pid] || 0
}
function nameOf(pid: string): string {
  return props.participants.find(p => p.playerId === pid)?.playerName || pid.slice(0, 4)
}

function ring() {
  if (ringSent.value || myRing.value) return
  ringSent.value = true
  sendAction({ type: 'ring' })
}

watch(round, () => { ringSent.value = false })
watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => { connect() })
onUnmounted(() => { disconnect() })
</script>

<style scoped>
.german-heart { max-width: 640px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #ece7fb; margin: 0 0 8px; }
p { color: #8f83b8; font-size: 14px; line-height: 1.6; }
p strong { color: #b39bff; }
.countdown-big { font-size: 72px; font-weight: 700; color: #b39bff; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #6b5f92; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; align-items: center; color: #a99bd0; font-size: 14px; margin-bottom: 12px; }
.my-score { color: #b39bff; font-weight: 700; }
.my-score.neg { color: #ff6b6b; }
.scoreboard { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-bottom: 16px; }
.score-chip { display: inline-flex; align-items: center; gap: 6px; padding: 4px 12px; background: #14213a; border: 1px solid #b39bff33; border-radius: 999px; color: #e0d7ff; font-size: 13px; }
.score-chip b { color: #b39bff; font-size: 14px; }
.score-chip.me { border-color: #b39bff; background: #b39bff1a; }
.score-chip.neg b { color: #ff6b6b; }
.table-area { background: radial-gradient(ellipse at 50% 0%, #2a1a4a 0%, #120a22 75%); border: 1px solid #b39bff33; border-radius: 16px; padding: 16px; margin-bottom: 16px; }
.table-label { font-size: 12px; color: #7d6fa6; letter-spacing: 1px; margin-bottom: 10px; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(44px, 1fr)); gap: 8px; justify-items: center; }
.fruit-card { width: 100%; max-width: 56px; aspect-ratio: 3 / 4; display: flex; align-items: center; justify-content: center; font-size: clamp(20px, 5vw, 30px); background: linear-gradient(160deg, #f8f4ff, #ded2ff); border-radius: 7px; border: 1px solid #ffffff88; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35); animation: cardIn 0.28s ease both; }
@keyframes cardIn { from { opacity: 0; transform: translateY(-12px) rotate(-6deg) scale(0.8); } to { opacity: 1; transform: translateY(0) rotate(0) scale(1); } }
.action-area { display: flex; flex-direction: column; align-items: center; gap: 12px; }
.timer-bar { width: 100%; height: 8px; background: #ffffff12; border-radius: 999px; overflow: hidden; }
.timer-fill { height: 100%; background: linear-gradient(90deg, #b39bff, #4488ff); border-radius: 999px; transition: width 0.2s linear; }
.timer-fill.low { background: linear-gradient(90deg, #ff6b6b, #ff4444); }
.bell-btn { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; width: 150px; height: 150px; border-radius: 50%; border: 3px solid #ffcf5a; background: radial-gradient(circle at 35% 30%, #ffe9a8, #ffb020 55%, #d97b00); color: #3a1d00; font-weight: 800; cursor: pointer; box-shadow: 0 0 0 8px #ffb02022, 0 14px 30px rgba(0, 0, 0, 0.45); transition: transform 0.08s ease, box-shadow 0.2s ease; user-select: none; -webkit-tap-highlight-color: transparent; }
.bell-btn:active:not(:disabled) { transform: scale(0.94); box-shadow: 0 0 0 4px #ffb02033, 0 6px 14px rgba(0, 0, 0, 0.5); }
.bell-btn:disabled { cursor: default; }
.bell-btn.rung { border-color: #b39bff; background: radial-gradient(circle at 35% 30%, #ded2ff, #8f74d8 55%, #5a3fa8); color: #fff; box-shadow: 0 0 0 8px #b39bff22, 0 14px 30px rgba(0, 0, 0, 0.45); }
.bell-btn.rung.wrong { border-color: #ff6b6b; background: radial-gradient(circle at 35% 30%, #ffc4c4, #ff6b6b 55%, #a11f1f); }
.bell-icon { font-size: 46px; line-height: 1; }
.bell-text { font-size: 16px; }
.hint { color: #8f83b8; font-size: 13px; margin: 0; }
.hint.good { color: #7ee0a0; }
.hint.bad { color: #ff8f8f; }
.reveal-area { display: flex; flex-direction: column; gap: 10px; padding: 8px 0; }
.reveal-title { font-size: 20px; font-weight: 800; }
.reveal-title.good, .reveal-line.good { color: #7ee0a0; }
.reveal-title.bad, .reveal-line.bad { color: #ff8f8f; }
.reveal-line { color: #e0d7ff; font-size: 15px; }
.next-hint { color: #6b5f92; font-size: 12px; }
.winner-name { font-size: 26px; font-weight: 700; color: #e6c988; }
.winner-label { display: block; font-size: 14px; color: #e6c988; margin-top: 4px; }
@media (max-width: 480px) {
  .german-heart { padding: 12px; }
  .countdown-big { font-size: 52px; }
  .game-icon { font-size: 48px; }
  .bell-btn { width: 124px; height: 124px; }
  .bell-icon { font-size: 38px; }
}
</style>
