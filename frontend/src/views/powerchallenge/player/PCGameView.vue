<template>
  <div class="pc-arena">
    <div class="arena-top">
      <div>
        <h1 class="title">💪 实力大挑战</h1>
        <div class="round-line">第 {{ state?.currentRound || 1 }} / {{ state?.totalRounds || 5 }} 轮 · {{ themeName }}</div>
      </div>
      <div class="phase-tag" :class="phaseClass">{{ phaseText }}</div>
    </div>

    <div v-if="!connected && !error" class="center-box"><div class="spinner"></div><span>连接比赛中…</span></div>
    <div v-if="error" class="center-box warn">{{ error }}<button class="bb-btn" @click="reconnect">重连</button></div>

    <template v-else>
      <!-- 等待区 / 开局倒计时 -->
      <div v-if="phase === 'waiting'" class="waiting-panel">
        <div class="wait-icon">⏳</div>
        <p class="wait-text">等待管理员开始第 {{ state?.currentRound }} 轮</p>
        <p class="wait-sub">{{ state?.theme ? `主题：${state.theme}` : '' }}</p>
        <div class="online-row" v-if="online.length">
          <span class="online-chip" v-for="o in online" :key="o.playerId">{{ o.playerName }}</span>
        </div>
      </div>

      <div v-else-if="phase === 'countdown' || phase === 'starting'" class="countdown-panel">
        <div class="big-count">{{ countdown > 0 ? countdown : 'GO' }}</div>
        <p>本轮将放出 {{ state?.releasedQuestions?.length || roundStartData?.questionCount || 0 }} 道题目</p>
      </div>

      <!-- 答题区 -->
      <div v-else-if="phase === 'answering'" class="answering-panel">
        <div class="answer-info">
          <span class="info-pill">参与 {{ state?.participants?.length || 0 }} 人</span>
          <span class="info-pill">已占名额 {{ state?.claims?.length || 0 }} / {{ state?.releasedQuestions?.length || 0 }}</span>
          <span class="info-pill cooldown" v-if="myCooldownMs > 0">提交冷却 {{ (myCooldownMs / 1000).toFixed(0) }}s</span>
        </div>

        <div v-if="meClaimed" class="claimed-banner">✅ 你已答对并晋级本轮，等待其他玩家…</div>

        <div class="q-grid">
          <div v-for="(q, qi) in state?.releasedQuestions || []" :key="q.id" class="q-card" :class="{ claimed: isClaimed(q.id) }">
            <div class="q-head">
              <span class="q-no">题 {{ qi + 1 }}</span>
              <span v-if="isClaimed(q.id)" class="q-state taken">已被 {{ claimerName(q.id) }} 抢占</span>
              <span v-else class="q-state open">可抢答</span>
            </div>
            <div class="q-text">{{ q.text }}</div>
            <div class="q-options">
              <button
                v-for="opt in q.options"
                :key="opt"
                class="opt-btn"
                :disabled="isClaimed(q.id) || meClaimed || busy || myCooldownMs > 0"
                @click="pickOption(q, opt)"
              >{{ opt }}</button>
            </div>
            <div class="q-feedback" v-if="feedback[q.id]">{{ feedback[q.id] }}</div>
          </div>
        </div>
      </div>

      <!-- 本轮结束（等待进入下一轮） -->
      <div v-else-if="phase === 'ended' && state?.status !== 'finished'" class="ended-panel">
        <h3>第 {{ (state?.currentRound || 1) }} 轮已结束</h3>
        <p v-if="state?.winners?.length">晋级玩家：{{ winnerNames.join('、') }}</p>
        <p v-if="state?.eliminatedThisRound?.length" class="danger">淘汰玩家：{{ eliminatedNames.join('、') }}</p>
        <p class="wait-sub">等待管理员进入下一轮…</p>
      </div>

      <!-- 赛季结束 -->
      <div v-else-if="state?.status === 'finished'" class="finished-panel">
        <div class="trophy">🏆</div>
        <h3>冠军：{{ state?.champion?.playerName }}</h3>
        <table class="rank-table">
          <thead><tr><th>#</th><th>玩家</th><th>积分</th><th>状态</th></tr></thead>
          <tbody>
            <tr v-for="r in state?.ranking || []" :key="r.playerId">
              <td>{{ r.rank }}</td>
              <td>{{ r.playerName }}</td>
              <td>{{ r.points }}</td>
              <td>{{ r.alive ? '存活' : `第${r.eliminatedRound}轮淘汰` }}</td>
            </tr>
          </tbody>
        </table>
        <p class="wait-sub">等待管理员重置赛季</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { usePcGameSocket } from '../../../composables/usePcGameSocket'
import { usePcAuthStore } from '../../../stores/pcAuthStore'
import { getPCStageName } from '../../../types/powerchallenge'
import type { PCSeason } from '../../../types/powerchallenge'

const { connected, error, state, online, countdown, roundStartData, submitAnswer, connect, joinArena, disconnect } = usePcGameSocket()
const authStore = usePcAuthStore()

const feedback = ref<Record<string, string>>({})
const myCooldownMs = ref(0)
const busy = ref(false)

const meId = computed(() => authStore.currentUser?.id || '')
const meName = computed(() => authStore.currentUser?.name || '')

const phase = computed(() => state.value?.roundPhase || 'waiting')
const themeName = computed(() => {
  const s = state.value
  if (!s) return ''
  if (s.theme) return `主题：${s.theme}`
  return s.status === 'finished' ? '赛季已结束' : ''
})

const phaseText = computed(() => {
  const map: Record<string, string> = {
    waiting: '等待开始', countdown: '倒计时', answering: '答题中', ended: '本轮结束'
  }
  return map[phase.value] || getPCStageName(phase.value)
})
const phaseClass = computed(() => phase.value)

const meClaimed = computed(() => {
  const s = state.value
  if (!s) return false
  return (s.winners || []).includes(meId.value)
})

function isClaimed(qid: string) {
  return !!state.value?.claims?.find(c => c.questionId === qid)
}
function claimerName(qid: string) {
  return state.value?.claims?.find(c => c.questionId === qid)?.playerName || ''
}
const winnerNames = computed(() => {
  const s = state.value
  if (!s) return []
  return s.winners.map(pid => s.participants.find(p => p.playerId === pid)?.playerName || '玩家')
})
const eliminatedNames = computed(() => {
  const s = state.value
  if (!s) return []
  return s.eliminatedThisRound.map(pid => s.participants.find(p => p.playerId === pid)?.playerName || '玩家')
})

let cdTimer: any = null
function setCooldown() {
  const cd = (state.value?.answerCooldown || 3) * 1000
  myCooldownMs.value = cd
  clearInterval(cdTimer)
  cdTimer = setInterval(() => {
    myCooldownMs.value = Math.max(0, myCooldownMs.value - 100)
    if (myCooldownMs.value <= 0) clearInterval(cdTimer)
  }, 100)
}

async function pickOption(q: { id: string }, opt: string) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await submitAnswer(q.id, opt)
    if (res && res.correct) {
      feedback.value[q.id] = '✅ 回答正确，你已晋级'
      setCooldown()
    } else {
      feedback.value[q.id] = '❌ 回答错误，可尝试其他题目'
      setCooldown()
    }
  } catch (e: any) {
    feedback.value[q.id] = e.message || '作答失败'
    if ((e as any).cooldownMs) myCooldownMs.value = (e as any).cooldownMs
  } finally {
    busy.value = false
  }
}

// 结算/赛季结束提醒
const flash = ref('')
watch(() => state.value?.eliminatedThisRound, () => {
  if (state.value?.eliminatedThisRound?.length) flash.value = '有人被淘汰了'
})
watch(() => state.value?.status, (v) => {
  if (v === 'finished' && state.value?.champion) flash.value = `🏆 ${state.value.champion.playerName} 夺冠！`
})

function reconnect() { connect() }

onMounted(() => {
  connect()
  // 进入比赛房间后才算在线参赛（socket 连上后加入）
  const t = setInterval(() => {
    if (connected.value) { joinArena(); clearInterval(t) }
  }, 100)
})
onUnmounted(() => {
  disconnect()
  clearInterval(cdTimer)
})
</script>

<style scoped>
.pc-arena { max-width: 1000px; margin: 0 auto; padding: 8px; }
.arena-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
.title { font-size: 28px; color: #e8e8ff; margin: 0; }
.round-line { color: #9a9ab0; margin-top: 6px; font-size: 14px; }
.phase-tag { padding: 6px 16px; border-radius: 20px; font-weight: 700; font-size: 14px; }
.phase-tag.waiting { background: #ffaa0022; color: #ffaa00; }
.phase-tag.countdown { background: #00c8ff22; color: #00c8ff; }
.phase-tag.answering { background: #00ff8822; color: #00ff88; }
.phase-tag.ended { background: #ff444422; color: #ff6666; }
.center-box { text-align: center; padding: 80px 0; color: #888; display: flex; flex-direction: column; gap: 16px; align-items: center; }
.spinner { width: 34px; height: 34px; border: 3px solid #00ff8822; border-top-color: #00ff88; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.warn { color: #ff6666; }
.waiting-panel, .countdown-panel, .ended-panel, .finished-panel { background: #161638; border: 1px solid #ffffff14; border-radius: 16px; padding: 40px; text-align: center; }
.wait-icon { font-size: 52px; }
.wait-text { font-size: 20px; color: #ddd; margin: 16px 0 4px; }
.wait-sub { color: #8a8aa5; margin-top: 8px; }
.online-row { margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.online-chip { background: #00ff8822; color: #00ff88; padding: 4px 12px; border-radius: 20px; font-size: 13px; }
.big-count { font-size: 90px; font-weight: 900; color: #00ff88; }
.countdown-panel p { color: #9a9ab0; }
.answer-info { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; }
.info-pill { background: #1d1d44; padding: 4px 12px; border-radius: 20px; font-size: 13px; color: #bbb; }
.info-pill.cooldown { background: #ffaa0022; color: #ffaa00; }
.claimed-banner { background: #00ff8822; color: #00ff88; border-radius: 12px; padding: 14px; margin-bottom: 16px; text-align: center; font-weight: 700; }
.q-grid { display: grid; grid-template-columns: 1fr; gap: 14px; }
.q-card { background: #141432; border: 1px solid #ffffff12; border-radius: 14px; padding: 18px; transition: border .2s; }
.q-card.claimed { opacity: .55; }
.q-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.q-no { font-size: 12px; color: #6666aa; font-weight: 700; }
.q-state { font-size: 12px; padding: 2px 10px; border-radius: 12px; }
.q-state.taken { background: #ffaa0022; color: #ffaa00; }
.q-state.open { background: #00ff8822; color: #00ff88; }
.q-text { color: #eee; font-size: 17px; font-weight: 600; margin-bottom: 12px; }
.q-options { display: flex; flex-wrap: wrap; gap: 8px; }
.opt-btn { background: #1e1e46; color: #cfcff0; border: 1px solid #ffffff1c; padding: 8px 16px; border-radius: 10px; cursor: pointer; font-size: 14px; }
.opt-btn:hover:not(:disabled) { background: #00ff8830; border-color: #00ff88; color: #00ff88; }
.opt-btn:disabled { opacity: .5; cursor: not-allowed; }
.q-feedback { margin-top: 8px; color: #ff9f43; font-size: 13px; }
.ended-panel h3, .finished-panel h3 { color: #eee; }
.danger { color: #ff6b6b; font-weight: 700; margin: 8px 0; }
.trophy { font-size: 56px; }
.rank-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
.rank-table th, .rank-table td { padding: 8px; border-bottom: 1px solid #ffffff12; color: #ddd; font-size: 14px; }
.rank-table th { color: #8a8aa5; font-weight: 600; }
</style>
