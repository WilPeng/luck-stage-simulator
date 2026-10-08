<template>
  <div class="minigame stay-or-fold">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🎯</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">获胜！</span>
      </div>
    </div>

    <div v-else-if="!started" class="game-waiting">
      <div class="game-icon">🎯</div>
      <h2>Stay or Fold</h2>
      <p>观察 emoji 散点图，估算目标 emoji 的数量；Stay 继续争取分数，Fold 本轮退出。每轮 Stay 中最接近者 +1 分，最远者淘汰。先到 {{ targetPoints }} 分者胜。</p>
      <div v-if="countdown > 0" class="countdown-big">{{ countdown }}</div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span>第 {{ round }} 轮 · 存活 {{ aliveCount }} 人</span>
        <span class="my-score">我的得分：{{ myScore }}</span>
      </div>

      <!-- 展示散点图 -->
      <div v-if="phase === 'show'" class="phase-block">
        <div class="phase-tip">👀 记住图中各 emoji 的数量（{{ secondsLeft }}s）</div>
        <div class="emoji-grid">
          <span v-for="(e, i) in grid" :key="i" class="emoji-cell">{{ e }}</span>
        </div>
      </div>

      <!-- 估算 -->
      <div v-else-if="phase === 'estimate'" class="phase-block">
        <div class="phase-tip">请估算目标 emoji <span class="target-emoji">{{ target }}</span> 出现了多少次（{{ secondsLeft }}s）</div>
        <div v-if="myEstimate == null" class="answer-area">
          <input v-model.number="inputValue" type="number" min="0" class="ans-input" placeholder="你的估算" @keyup.enter="submitEstimate" />
          <button class="op-btn stay" :disabled="inputValue === null || inputValue === '' || submitting" @click="submitEstimate">提交估算（仅 1 次）</button>
        </div>
        <div v-else class="submitted">已提交估算：<strong>{{ myEstimate }}</strong>，等待其他选手…</div>
      </div>

      <!-- 公布各选手答案（不公布真实数量/差值） -->
      <div v-else-if="phase === 'reveal'" class="phase-block">
        <div class="phase-tip">各选手提交的估算如下（{{ secondsLeft }}s）</div>
        <div class="estimates-list">
          <div v-for="(v, pid) in estimates" :key="pid" class="est-row">
            <span class="est-name">{{ nameOf(pid) }}</span>
            <span class="est-val">{{ v }}</span>
          </div>
          <div v-if="estimateCount === 0" class="est-empty">本轮暂无提交</div>
        </div>
      </div>

      <!-- 决定 Stay / Fold -->
      <div v-else-if="phase === 'decide'" class="phase-block">
        <div class="phase-tip">目标 <span class="target-emoji">{{ target }}</span> · 决定是否继续（{{ secondsLeft }}s）</div>
        <div v-if="!myDecision" class="answer-area">
          <button class="op-btn stay" :disabled="submitting" @click="decide('stay')">🙌 Stay 继续</button>
          <button class="op-btn fold" :disabled="submitting" @click="decide('fold')">🏳️ Fold 退出本轮</button>
        </div>
        <div v-else class="submitted">你的选择：<strong>{{ myDecision === 'stay' ? 'Stay' : 'Fold' }}</strong></div>
      </div>

      <!-- 结算：公布真实数量与差值 -->
      <div v-else class="phase-block">
        <div class="reveal-line">目标 <span class="target-emoji">{{ target }}</span> 的真实数量：<strong>{{ trueCount }}</strong></div>
        <div v-if="lastResult" class="estimates-list">
          <div v-for="(v, pid) in lastResult.estimates" :key="pid" class="est-row" :class="{ stay: lastResult.decisions[pid] === 'stay' }">
            <span class="est-name">{{ nameOf(pid) }}</span>
            <span class="est-val">{{ v }}</span>
            <span v-if="lastResult.diffs && lastResult.diffs[pid] != null" class="est-diff">差值 {{ lastResult.diffs[pid] }}</span>
            <span class="tag" :class="lastResult.decisions[pid] === 'stay' ? 'tag-stay' : 'tag-fold'">{{ lastResult.decisions[pid] === 'stay' ? 'Stay' : 'Fold' }}</span>
            <span v-if="lastResult.closest && lastResult.closest.includes(pid)" class="tag tag-plus">+1</span>
            <span v-if="lastResult.eliminated && lastResult.eliminated.includes(pid)" class="tag tag-out">淘汰</span>
          </div>
          <div v-if="!lastResult.estimates || !Object.keys(lastResult.estimates).length" class="est-empty">本轮无人提交</div>
        </div>
        <div class="phase-tip">结算中… {{ secondsLeft }}s</div>
      </div>

      <div class="scoreboard">
        <span v-for="(s, pid) in scores" :key="pid" class="score-chip" :class="{ out: eliminated.includes(pid) }">
          {{ nameOf(pid) }} {{ s }}
        </span>
      </div>
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

const inputValue = ref<number | null>(null)
const submitting = ref(false)

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const phase = computed(() => state.value.phase || 'show')
const round = computed(() => state.value.round || 0)
const grid = computed<string[]>(() => Array.isArray(state.value.grid) ? state.value.grid : [])
const target = computed(() => state.value.target || '')
const trueCount = computed(() => state.value.trueCount ?? state.value.lastResult?.trueCount ?? '?')
const estimates = computed<Record<string, any>>(() => state.value.estimates || {})
const estimateCount = computed(() => Object.keys(estimates.value).length)
const scores = computed<Record<string, number>>(() => state.value.scores || {})
const eliminated = computed<string[]>(() => state.value.eliminated || [])
const aliveCount = computed(() => state.value.aliveCount ?? 0)
const myEstimate = computed(() => state.value.myEstimate ?? null)
const myDecision = computed(() => state.value.myDecision || null)
const myScore = computed(() => state.value.myScore || 0)
const targetPoints = computed(() => state.value.targetPoints || 3)
const secondsLeft = computed(() => state.value.secondsLeft || 0)
const lastResult = computed(() => state.value.lastResult || null)

function nameOf(pid: string): string {
  return props.participants.find(p => p.playerId === pid)?.playerName || pid.slice(0, 4)
}

function submitEstimate() {
  if (submitting.value || myEstimate.value != null) return
  if (inputValue.value === null || inputValue.value === '') return
  submitting.value = true
  sendAction({ type: 'estimate', value: Number(inputValue.value) })
  setTimeout(() => { submitting.value = false }, 600)
}

function decide(v: 'stay' | 'fold') {
  if (submitting.value || myDecision.value) return
  submitting.value = true
  sendAction({ type: 'decide', value: v })
  setTimeout(() => { submitting.value = false }, 600)
}

watch(phase, (p) => { if (p !== 'estimate') inputValue.value = null })
watch(finished, (val) => { if (val && winner.value) emit('finished', winner.value) })

onMounted(() => { connect() })
onUnmounted(() => { disconnect() })
</script>

<style scoped>
.stay-or-fold { max-width: 720px; margin: 0 auto; text-align: center; padding: 20px; }
.game-waiting, .game-finished { padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #e0e0e0; margin: 0 0 8px; }
p { color: #888; font-size: 14px; }
.countdown-big { font-size: 72px; font-weight: 700; color: #00ff88; margin: 20px 0; }
.waiting-text { color: #666; margin-top: 12px; }
.game-header { display: flex; justify-content: space-between; color: #aaa; font-size: 15px; font-weight: 600; margin-bottom: 12px; }
.my-score { color: #00ff88; }
.phase-block { margin-bottom: 14px; }
.phase-tip { color: #d6e4ff; font-size: 15px; margin-bottom: 12px; }
.target-emoji { font-size: 26px; }
.emoji-grid { display: grid; grid-template-columns: repeat(auto-fill, 22px); gap: 2px; justify-content: center; background: #0b0b1c; border: 1px solid #00ff8822; border-radius: 8px; padding: 8px; max-height: 340px; overflow: auto; }
.emoji-cell { font-size: 16px; line-height: 22px; text-align: center; }
.answer-area { display: flex; gap: 12px; justify-content: center; align-items: center; flex-wrap: wrap; }
.ans-input { width: 180px; padding: 12px 14px; font-size: 16px; text-align: center; background: #0a1a10; border: 1px solid #00ff8844; border-radius: 8px; color: #e0e0e0; outline: none; }
.ans-input:focus { border-color: #00ff88; }
.op-btn { padding: 12px 24px; font-size: 15px; font-weight: 700; border-radius: 10px; cursor: pointer; border: 2px solid; background: transparent; }
.op-btn.stay { color: #00ff88; border-color: #00ff88; background: #00ff8822; }
.op-btn.fold { color: #ff6b6b; border-color: #ff6b6b; background: #ff6b6b22; }
.op-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.submitted { color: #00ff88; font-size: 14px; }
.estimates-list { display: flex; flex-direction: column; gap: 8px; max-width: 520px; margin: 0 auto 12px; }
.est-row { display: flex; align-items: center; gap: 10px; background: #16163a; border-radius: 8px; padding: 8px 14px; font-size: 14px; color: #ddd; border-left: 3px solid #00ff8855; }
.est-row.stay { border-left-color: #00ff88; }
.est-name { min-width: 72px; text-align: left; color: #9fb3d1; }
.est-val { font-weight: 700; color: #fff; min-width: 40px; }
.est-diff { color: #ffaa00; font-size: 13px; }
.tag { margin-left: auto; font-size: 11px; padding: 1px 8px; border-radius: 999px; }
.tag-stay { background: #00ff8822; color: #00ff88; }
.tag-fold { background: #ff6b6b22; color: #ff6b6b; }
.tag-plus { background: #ffaa0022; color: #ffaa00; margin-left: 6px; }
.tag-out { background: #ff444422; color: #ff4444; margin-left: 6px; }
.est-empty { color: #666; font-size: 13px; }
.reveal-line { color: #d6e4ff; font-size: 16px; margin-bottom: 12px; }
.scoreboard { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 12px; }
.score-chip { padding: 4px 12px; background: #14213a; border: 1px solid #00ff8833; border-radius: 999px; color: #cfe3ff; font-size: 13px; }
.score-chip.out { opacity: 0.45; text-decoration: line-through; }
.winner-name { font-size: 26px; font-weight: 700; color: #ffaa00; }
.winner-label { display: block; font-size: 14px; color: #ffaa00; margin-top: 4px; }
</style>
