<template>
  <div class="pc-admin-live">
    <div class="page-header">
      <h1>💪 比赛控制台</h1>
      <div class="header-actions">
        <button class="bb-btn" @click="refreshAll" :disabled="busy">刷新</button>
        <button class="bb-btn bb-btn-danger" @click="doReset">重置赛季</button>
      </div>
    </div>

    <!-- 赛季摘要卡片 -->
    <div class="stat-cards" v-if="live">
      <div class="stat-card"><div class="stat-label">赛季状态</div><div class="stat-value" :class="statusClass">{{ seasonStatusText }}</div></div>
      <div class="stat-card"><div class="stat-label">轮次</div><div class="stat-value">{{ live.currentRound }} / {{ live.totalRounds }}</div></div>
      <div class="stat-card"><div class="stat-label">在线玩家</div><div class="stat-value pc-ok">{{ online.length }}</div></div>
      <div class="stat-card"><div class="stat-label">晋级玩家</div><div class="stat-value">{{ (live.winners || []).length }}</div></div>
    </div>

    <div class="phase-banner" v-if="live" :class="live.roundPhase">
      <template v-if="live.roundPhase === 'answering' || live.roundPhase === 'countdown'">
        🎮 第 {{ live.currentRound }} 轮比赛中：{{ (live.claims || []).length }} / {{ (live.releasedQuestions || []).length }} 名额已占
      </template>
      <template v-else-if="live.roundPhase === 'ended'">
        ⏹ 第 {{ live.currentRound }} 轮已结算 · 等待开始下一轮
      </template>
      <template v-else-if="live.status === 'finished'">🏆 赛季结束 — 冠军：{{ live.champion?.playerName }}</template>
      <template v-else>⏳ 第 {{ live.currentRound }} 轮准备中（编辑下方主题/题目后开始）</template>
    </div>

    <div class="live-actions" v-if="live">
      <template v-if="live.roundPhase === 'waiting' && live.status !== 'finished'">
        <button class="bb-btn bb-btn-primary big" @click="doStart" :disabled="busy">▶ 开始第 {{ live.currentRound }} 轮</button>
      </template>
      <template v-else-if="live.roundPhase === 'answering' || live.roundPhase === 'countdown'">
        <button class="bb-btn bb-btn-warn big" @click="doEnd" :disabled="busy">⏹ 立即结算本轮</button>
      </template>
      <template v-else-if="live.roundPhase === 'ended' && live.status !== 'finished'">
        <button class="bb-btn bb-btn-primary big" @click="doNext" :disabled="busy">进入下一轮（第 {{ live.currentRound + 1 }} 轮）</button>
      </template>
      <template v-if="live.status === 'finished'">
        <button class="bb-btn bb-btn-primary big" @click="doReset" :disabled="busy">重开新赛季</button>
      </template>
    </div>

    <!-- 现场实时看板 -->
    <div class="two-col">
      <div class="card live-board">
        <div class="card-title">现场看板</div>
        <div class="board-claims" v-if="(live?.claims || []).length">
          <div v-for="c in live.claims" :key="c.questionId" class="claim-row">
            <span class="q-tag">题</span>
            <span class="cl-nm">{{ c.playerName }}</span>
          </div>
        </div>
        <div v-else class="muted">尚无晋级者</div>

        <div class="card-subtitle">本轮题目（{{ (live?.releasedQuestions || []).length }} 题）</div>
        <div v-for="(q, i) in live?.releasedQuestions || []" :key="q.id" class="released-q">
          <span class="q-index">{{ i + 1 }}</span>
          <span class="q-content">{{ q.text }}</span>
          <span class="q-winner" v-if="claimOf(q.id)">{{ claimOf(q.id)?.playerName }}</span>
        </div>
      </div>

      <div class="card roster">
        <div class="card-title">选手 / 存活 / 淘汰</div>
        <div class="player-row" v-for="pl in rosterList" :key="pl.id">
          <span class="dot" :class="pl.status"></span>
          <span class="pl-name">{{ pl.name }}</span>
          <span class="pl-pts">{{ live?.points?.[pl.id] || 0 }} 分</span>
        </div>
      </div>
    </div>

    <!-- 配置区 -->
    <div class="card config" v-if="admin">
      <div class="card-title">本轮配置（主题 / 题目）</div>
      <div class="form-grid">
        <div class="form-group">
          <label>总轮数（固定）</label>
          <input type="number" min="1" v-model.number="form.totalRounds" class="form-input" />
        </div>
        <div class="form-group">
          <label>提交答案间隔（秒）</label>
          <input type="number" min="0" step="1" v-model.number="form.answerCooldown" class="form-input" />
        </div>
      </div>
      <div class="form-group">
        <label>本轮主题</label>
        <input v-model="form.theme" class="form-input" placeholder="例如：常识大作战" />
      </div>
      <div class="pool-row">
        <select v-model="selectedPoolId" class="form-select">
          <option value="">— 从题目池导入 —</option>
          <option v-for="p in pools" :key="p.id" :value="p.id">{{ p.name }}（{{ p.questions.length }}题）</option>
        </select>
        <button class="bb-btn" @click="importPool" :disabled="!selectedPoolId">导入题目池</button>
      </div>
      <div class="questions-header">
        <span>题目列表（答案不会下发给选手）</span>
        <button class="bb-btn-xs bb-btn-primary" @click="addQuestion">+ 添加题目</button>
      </div>
      <div v-for="(q, qi) in form.questions" :key="qi" class="q-edit">
        <div class="q-edit-row">
          <input v-model="q.text" class="form-input" placeholder="题目内容" />
          <button class="bb-btn-xs btn-danger" @click="removeQuestion(qi)">删除</button>
        </div>
        <div class="opt-edit">
          <div v-for="(opt, oi) in q.options" :key="oi" class="opt-row">
            <input v-model="q.options[oi]" class="form-input" placeholder="选项" />
            <button v-if="q.options.length > 2" class="bb-btn-xs btn-danger" @click="removeOption(qi, oi)">×</button>
          </div>
          <button class="bb-btn-xs" @click="addOption(qi)">+ 选项</button>
          <span class="ans-label">正确答案：</span>
          <select v-model="q.correctAnswer" class="form-select">
            <option v-for="opt in q.options" :key="opt" :value="opt">{{ opt }}</option>
          </select>
        </div>
      </div>
      <div class="save-row">
        <button class="bb-btn bb-btn-primary" @click="saveConfig" :disabled="busy || !canSave">保存配置</button>
      </div>
    </div>

    <!-- 最终排名 -->
    <div class="card" v-if="live?.ranking?.length">
      <div class="card-title">最终排名</div>
      <table class="mini-table">
        <thead><tr><th>#</th><th>玩家</th><th>积分</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="r in live.ranking" :key="r.playerId">
            <td>{{ r.rank }}</td>
            <td>{{ r.playerName }}</td>
            <td>{{ r.points }}</td>
            <td>{{ r.alive ? '存活' : '第'+r.eliminatedRound+'轮淘汰' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { usePcGameSocket } from '../../../composables/usePcGameSocket'
import { pcGetSeasonAdmin, pcGetPools, pcSaveSeasonConfig } from '../../../services/pcApi'
import type { PCSeasonAdmin, PCPowerChallenge, PCPowerChallengeQuestion } from '../../../types/powerchallenge'

const { state, online, connected, error, connect, disconnect, adminStart, adminEnd, adminNext, adminReset } = usePcGameSocket()

const admin = ref<PCSeasonAdmin | null>(null)
const pools = ref<PCPowerChallenge[]>([])
const selectedPoolId = ref('')
const busy = ref(false)
const live = computed(() => state.value)

const rosterList = computed(() => {
  const s = state.value
  if (!s) return []
  const alive = s.alivePlayers || []
  const elim = s.eliminated || []
  const outMap = new Map(elim.map(e => [e.playerId, e]))
  const allIds = new Set([...alive.map(a => a.playerId), ...elim.map(e => e.playerId)])
  const adminPlayers = admin.value?.players || []
  return adminPlayers.filter(p => p.role === 'player' && allIds.has(p.id)).map(p => {
    const status = outMap.has(p.id) ? 'out' : 'alive'
    return { id: p.id, name: p.name, status }
  })
})

const form = ref<{ totalRounds: number; answerCooldown: number; theme: string; questions: PCPowerChallengeQuestion[] }>({
  totalRounds: 5, answerCooldown: 3, theme: '', questions: []
})

const seasonStatusText = computed(() => {
  const s = state.value
  if (!s) return '未知'
  if (s.status === 'finished') return '已结束'
  if (s.roundPhase === 'answering' || s.roundPhase === 'countdown') return '比赛中'
  return '进行中'
})
const statusClass = computed(() => state.value?.status || '')

const canSave = computed(() => form.value.theme.trim() && form.value.questions.length > 0 && form.value.questions.every(q => q.text.trim() && q.options.length >= 2 && q.correctAnswer))

function claimOf(qid: string) {
  return state.value?.claims?.find(c => c.questionId === qid)
}

async function refreshAdmin() {
  try {
    admin.value = await pcGetSeasonAdmin()
    if (admin.value) {
      form.value.totalRounds = admin.value.totalRounds
      form.value.answerCooldown = admin.value.answerCooldown
      form.value.theme = admin.value.theme
      form.value.questions = (admin.value.questions || []).map(q => ({ ...q }))
    }
  } catch (e: any) { alert(e.message || '加载失败') }
}

async function refreshPools() {
  try { pools.value = await pcGetPools() } catch {}
}

async function refreshAll() { await Promise.all([refreshAdmin(), refreshPools()]) }

async function importPool() {
  if (!selectedPoolId.value) return
  const pool = pools.value.find(p => p.id === selectedPoolId.value)
  if (!pool) return
  form.value.theme = pool.theme
  form.value.questions = pool.questions.map(q => ({ ...q }))
  selectedPoolId.value = ''
}

function addQuestion() {
  form.value.questions.push({ id: crypto.randomUUID(), text: '', options: ['A', 'B'], correctAnswer: '' })
}
function removeQuestion(i: number) { form.value.questions.splice(i, 1) }
function addOption(qi: number) {
  const letters = 'ABCDEFGHIJKLMNOP'
  const next = letters[form.value.questions[qi].options.length]
  if (next) form.value.questions[qi].options.push(next)
}
function removeOption(qi: number, oi: number) {
  form.value.questions[qi].options.splice(oi, 1)
  if (!form.value.questions[qi].options.includes(form.value.questions[qi].correctAnswer)) {
    form.value.questions[qi].correctAnswer = form.value.questions[qi].options[0] || ''
  }
}

async function saveConfig() {
  busy.value = true
  try {
    await pcSaveSeasonConfig({
      totalRounds: form.value.totalRounds,
      answerCooldown: form.value.answerCooldown,
      theme: form.value.theme,
      questions: form.value.questions
    })
    await refreshAll()
  } catch (e: any) { alert(e.message || '保存失败') } finally { busy.value = false }
}

async function run(fn: () => Promise<any>, okMsg: string) {
  busy.value = true
  try {
    await fn()
  } catch (e: any) {
    alert(e.message || '操作失败')
  } finally { busy.value = false }
}
function doStart() { run(() => adminStart(), '本轮已开始') }
function doEnd() { run(() => adminEnd(), '本轮已结算') }
function doNext() { run(async () => { await adminNext(); await refreshAll() }, '已进入下一轮') }
function doReset() {
  if (!confirm('确认重置整个赛季？所有积分/淘汰将被清空。')) return
  run(() => adminReset(), '赛季已重置')
}

onMounted(() => {
  connect()
  refreshAll()
})
onUnmounted(() => disconnect())
</script>

<style scoped>
.pc-admin-live { max-width: 1100px; margin: 0 auto; }
.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 10px; }
.page-header h1 { font-size: 24px; color: #eee; margin: 0; }
.header-actions { display: flex; gap: 8px; }
.stat-cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 16px; }
.stat-card { background: #151533; border: 1px solid #ffffff12; border-radius: 14px; padding: 16px; text-align: center; }
.stat-label { color: #8a8aa5; font-size: 12px; }
.stat-value { color: #ffc94d; font-size: 26px; font-weight: 800; margin-top: 4px; }
.stat-value.finished { color: #ff6b6b; }
.stat-value.pc-ok { color: #00ff88; }
.phase-banner { background: #1c1c44; border: 1px solid #ffffff14; border-radius: 12px; padding: 12px 18px; margin-bottom: 14px; font-weight: 600; color: #e2e2ff; }
.phase-banner.answering { border-color: #00ff8855; }
.live-actions { margin-bottom: 20px; display: flex; gap: 10px; flex-wrap: wrap; }
.big { font-size: 16px; padding: 10px 22px; }
.two-col { display: grid; grid-template-columns: 1.4fr 1fr; gap: 14px; margin-bottom: 16px; }
.card { background: #141432; border: 1px solid #ffffff12; border-radius: 14px; padding: 18px; margin-bottom: 16px; }
.card-title { color: #c9c9ee; font-weight: 700; margin-bottom: 12px; }
.card-subtitle { color: #8a8aa5; font-size: 13px; margin: 14px 0 8px; }
.claim-row, .released-q, .player-row { display: flex; align-items: center; gap: 8px; padding: 6px 2px; border-bottom: 1px solid #ffffff0d; font-size: 14px; }
.q-tag, .q-index { background: #00ff8822; color: #00ff88; font-size: 11px; border-radius: 6px; padding: 1px 6px; }
.q-index { background: #3a3a7a; color: #ddd; }
.q-content { flex: 1; color: #e6e6ff; }
.cl-nm, .q-winner { color: #ffc94d; font-weight: 700; }
.q-winner { margin-left: auto; }
.muted { color: #666; font-size: 13px; }
.player-row .dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.alive { background: #00ff88; }
.dot.out { background: #ff6b6b; }
.pl-name { flex: 1; color: #e6e6ff; }
.pl-pts { color: #8a8aa5; }
.config { }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; color: #8a8aa5; font-size: 12px; margin-bottom: 4px; }
.form-input, .form-select { width: 100%; box-sizing: border-box; background: #0e0e28; border: 1px solid #ffffff18; color: #e0e0ff; border-radius: 8px; padding: 8px 10px; }
.form-select { width: auto; }
.pool-row { display: flex; gap: 8px; margin-bottom: 14px; }
.questions-header { display: flex; justify-content: space-between; color: #8a8aa5; font-size: 13px; margin-bottom: 10px; }
.q-edit { background: #0f0f2c; border-radius: 10px; padding: 12px; margin-bottom: 10px; }
.q-edit-row { display: flex; gap: 8px; margin-bottom: 8px; }
.opt-edit { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.opt-row { display: flex; gap: 6px; }
.opt-edit .form-input { width: 140px; }
.ans-label { color: #8a8aa5; font-size: 12px; margin-left: 8px; }
.save-row { text-align: right; }
.mini-table { width: 100%; border-collapse: collapse; }
.mini-table th, .mini-table td { text-align: left; padding: 7px 8px; border-bottom: 1px solid #ffffff0f; color: #ddd; font-size: 13px; }
.mini-table th { color: #8a8aa5; }
.bb-btn-danger { background: #ff44442a; color: #ff6b6b; border: 1px solid #ff6b6b44; }
.bb-btn-warn { background: #ffaa0030; color: #ffaa00; border: 1px solid #ffaa0050; }
</style>
