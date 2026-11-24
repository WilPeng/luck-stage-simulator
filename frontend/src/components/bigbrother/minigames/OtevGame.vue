<template>
  <div class="otev-game" :class="`theme-${theme}`">
    <audio ref="audioEl" :src="audioSrc || undefined" preload="auto" loop style="display: none"></audio>

    <div v-if="finished" class="game-finished">
      <div class="finish-glow"></div>
      <div class="finish-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || '无胜者' }}</span>
        <span v-if="winner" class="winner-label">赢得 OTEV 抢座赛</span>
      </div>
    </div>

    <div v-else-if="!started" class="game-waiting">
      <div class="wait-idol">{{ state.otveAvatar || '🐐' }}</div>
      <h2>{{ gameTitle || 'OTEV 抢座问答赛' }}</h2>
      <div class="wait-rules">
        <p>所有玩家共享同一个泥浆牌池；牌池中会为每位存活选手准备一张正确牌。</p>
        <p>查看是私有的、非独占的；拿走是独占的，先到先得。</p>
        <p>答案可能是 1 人或 2 人：单人答案要拿只有这个名字的牌；双人答案要拿同时写着这两个名字的牌。</p>
        <p>提交后统一揭晓：第一个答错的人淘汰；如果前 N−1 人都正确，最后提交者淘汰。</p>
        <p>时间到仍未提交时，会自动携带你最近查看过的牌；从未查看则随机带走一张。</p>
      </div>
      <div v-if="countdown > 0" class="countdown-big"><CountdownDisplay :value="countdown" /></div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <header class="otev-header">
        <div class="idol-wrap" :class="phase">
          <span class="idol">{{ state.otveAvatar || '🐐' }}</span>
          <span class="note n1">♪</span><span class="note n2">♫</span><span class="note n3">♩</span>
        </div>
        <div class="head-main">
          <div class="head-title">OTEV 抢座问答赛</div>
          <div class="head-sub">
            第 {{ state.round || 1 }} / {{ state.totalRounds || 1 }} 轮
            <span class="dot">·</span>
            {{ phaseLabel }}
            <span class="dot">·</span>
            存活 {{ state.aliveCount || 0 }} 人
          </div>
        </div>
        <div class="head-right">
          <div class="timer" :class="{ low: secondsLeft <= 5 }">{{ secondsLeft }}<small>s</small></div>
          <button v-if="audioSrc" class="icon-btn" :title="muted ? '开启声音' : '静音'" @click="toggleMute">
            {{ muted ? '🔇' : '🔊' }}
          </button>
        </div>
      </header>

      <div class="riddle-bar" v-if="clues.length">
        <div class="riddle-top">
          <span class="riddle-label">🎵 OTEV 的谜语</span>
          <span class="answer-badge">答案：{{ answerCount || 1 }} 人</span>
        </div>
        <div class="riddle-lines">
          <span v-for="(c, i) in clues" :key="i" class="riddle-line" :style="{ animationDelay: `${i * 120}ms` }">{{ c }}</span>
        </div>
      </div>

      <div v-if="phase === 'riddle'" class="riddle-stage">
        <div class="sing-idol">{{ state.otveAvatar || '🐐' }}</div>
        <div class="sing-bubble">
          <div class="sing-title">OTEV 正在唱歌……</div>
          <div class="sing-lines">
            <span v-for="(c, i) in clues" :key="i">{{ c }}</span>
          </div>
        </div>
        <div class="riddle-tip">听清谜语，准备冲进泥浆池抢牌！</div>
      </div>

      <div v-else-if="phase === 'search'" class="search-layout">
        <section class="pool-wrap">
          <div class="pool-head">
            <span>公共泥浆池</span>
            <span class="pool-count">剩余可翻 {{ availableCount }} / {{ pool.length }}</span>
          </div>
          <div class="pool-grid">
            <button
              v-for="card in pool"
              :key="card.id"
              class="pool-card"
              :class="cardClass(card)"
              :aria-disabled="!canClickCard(card)"
              :title="cardTitle(card)"
              @click="onCardClick(card)"
            >
              <template v-if="card.state === 'hidden'">
                <span class="card-back-icon">{{ cardBackIcon }}</span>
                <span v-if="card.seen" class="seen-mark">👁</span>
              </template>
              <template v-else-if="card.state === 'claimed'">
                <BBAvatar :name="card.claimedByName" size="sm" />
                <span class="card-owner">{{ card.claimedByName }}</span>
                <span class="card-tag">已拿走</span>
              </template>
              <template v-else>
                <BBAvatar :name="card.submittedByName" size="sm" />
                <span class="card-owner">{{ card.submittedByName }}</span>
                <span class="card-tag submitted">已提交</span>
              </template>
              <span v-if="phase === 'result' && card.correct" class="correct-star">★</span>
              <span v-else-if="phase === 'result' && card.state === 'submitted' && card.correct === false" class="wrong-star">✕</span>
            </button>
          </div>
        </section>

        <aside class="side-wrap">
          <div class="side-block">
            <div class="side-title">我的操作</div>
            <div v-if="my?.heldCard" class="hand-card">
              <div class="hand-label">手中卡片</div>
              <div class="hand-names">{{ my.heldCard.names.join(' + ') }}</div>
              <div class="hand-actions">
                <button class="otev-btn primary" :class="{ armed: submitArmed }" :disabled="!my.canSubmit" @click="onSubmitClick">
                  {{ submitArmed ? '确定提交？' : '提交答案' }}
                </button>
                <button class="otev-btn ghost danger" :disabled="!my.canDiscard" @click="discardHeld">丢回泥里</button>
              </div>
              <p class="hand-hint">提交后不可更改；觉得不对可以先丢回再找。</p>
            </div>
            <div v-else-if="my?.submittedCard" class="hand-card submitted">
              <div class="hand-label">已提交</div>
              <div class="hand-names">{{ my.submittedCard.names.join(' + ') }}</div>
              <p class="hand-hint">等待其他选手提交或时间截止，随后按顺序揭晓。</p>
            </div>
            <div v-else class="hand-empty">
              <span class="empty-icon">🕳️</span>
              <span>还没有拿牌</span>
              <small>点击公共池中的牌查看，再决定是否拿走。</small>
            </div>
            <div class="swap-row">
              <button class="otev-btn ghost" :class="{ active: swapMode }" :disabled="!my?.canSwap" @click="toggleSwapMode">
                {{ swapMode ? '取消交换' : '交换两张牌' }}
              </button>
              <span v-if="swapMode" class="swap-hint">依次点击两张盖着的牌</span>
              <span v-else-if="my && my.swapCooldownSeconds > 0" class="swap-hint">冷却 {{ my.swapCooldownSeconds }}s</span>
            </div>
          </div>

          <div class="side-block">
            <div class="side-title">提交队列 <span>{{ submissions.length }} / {{ state.aliveCount || 0 }}</span></div>
            <div class="queue">
              <div v-for="s in submissions" :key="s.playerId" class="queue-item">
                <span class="queue-pos">{{ s.position }}</span>
                <BBAvatar :name="s.playerName" size="sm" />
                <span class="queue-name">{{ s.playerName }}</span>
                <span v-if="s.auto" class="auto-tag">自动</span>
              </div>
              <div v-if="!submissions.length" class="queue-empty">还没有人提交</div>
            </div>
          </div>

          <div class="side-block players-block">
            <div class="side-title">场上状态</div>
            <div class="player-chips">
              <span v-for="p in publicPlayers" :key="p.playerId" class="player-chip" :class="{ dead: !p.alive, me: p.playerId === myId, has: p.held || p.submitted }">
                <BBAvatar :name="p.playerName" size="sm" />
                <span class="pc-name">{{ p.playerName }}</span>
                <span class="pc-tag">{{ playerTag(p) }}</span>
              </span>
            </div>
          </div>
        </aside>
      </div>

      <div v-else-if="phase === 'reveal' || phase === 'result'" class="reveal-layout">
        <section class="reveal-main">
          <div class="reveal-banner">
            <span class="reveal-icon">🎤</span>
            <div>
              <div class="reveal-title">{{ phase === 'result' ? '本轮结算' : 'OTEV 逐个揭晓中……' }}</div>
              <div class="reveal-sub">按提交顺序判定，第一个错误者淘汰；全对时最后提交者淘汰。</div>
            </div>
          </div>

          <div class="verdict-list">
            <div v-for="(v, i) in verdicts" :key="`${v.playerId}-${i}`" class="verdict" :class="{ wrong: !v.correct }">
              <span class="v-pos">{{ v.position || i + 1 }}</span>
              <BBAvatar :name="v.playerName" size="sm" />
              <span class="v-name">{{ v.playerName }}</span>
              <span class="v-card">{{ (v.names || []).join(' + ') }}</span>
              <span class="v-result">{{ v.correct ? '✓ 正确' : '✗ 错误' }}</span>
              <span v-if="v.auto" class="v-auto">自动携带</span>
            </div>
            <div v-if="phase === 'reveal' && currentRevealName" class="verdict pending">
              <span class="v-pos">{{ (state.reveal?.index || 0) + 1 }}</span>
              <span class="v-name">{{ currentRevealName }}</span>
              <span class="v-card">？？？</span>
              <span class="v-result">揭晓中…</span>
            </div>
          </div>

          <div v-if="phase === 'result'" class="result-box" :class="resultClass">
            <div class="result-answer">
              正确答案：<strong>{{ answerText }}</strong>
            </div>
            <div class="result-line">{{ resultText }}</div>
            <div v-if="my?.heldCard" class="result-held">
              你手中未提交的牌：{{ my.heldCard.names.join(' + ') }}
            </div>
            <div class="result-board">
              <div
                v-for="card in pool"
                :key="`res-${card.id}`"
                class="result-card"
                :class="{ correct: card.correct, wrong: card.correct === false && card.state === 'submitted', mine: card.isMine }"
              >
                <span v-if="card.names">{{ card.names.join(' + ') }}</span>
                <span v-else class="result-hidden">•</span>
              </div>
            </div>
          </div>
        </section>

        <aside class="reveal-side">
          <div class="side-block">
            <div class="side-title">提交顺序</div>
            <div class="queue">
              <div v-for="s in submissions" :key="`r-${s.playerId}`" class="queue-item">
                <span class="queue-pos">{{ s.position }}</span>
                <BBAvatar :name="s.playerName" size="sm" />
                <span class="queue-name">{{ s.playerName }}</span>
                <span v-if="s.auto" class="auto-tag">自动</span>
              </div>
            </div>
          </div>
          <div v-if="my && !my.alive" class="side-block spectator-block">
            <div class="side-title">观战</div>
            <p>你已被淘汰，正在观战。</p>
          </div>
        </aside>
      </div>

      <div v-if="my && !my.alive && phase !== 'result'" class="spectator-badge">你已被淘汰，正在观战</div>
      <div class="toast" v-if="toast">{{ toast }}</div>
    </div>

    <Teleport to="body">
      <div v-if="peekOpen && peekCard" class="peek-overlay" @click.self="closePeek">
        <div class="peek-modal">
          <div class="peek-head">
            <span>你在泥浆里翻到了……</span>
            <span class="peek-time">{{ my?.peekSecondsLeft || 0 }}s</span>
          </div>
          <div class="peek-names">
            <span v-for="n in peekCard.names" :key="n" class="peek-name">{{ n }}</span>
          </div>
          <div class="peek-hint">查看不锁定：别人也可能同时看到这张牌。拿走才是你的。</div>
          <div class="peek-actions">
            <button class="otev-btn primary" :disabled="claiming" @click="claimPeeked">
              {{ claiming ? '拿取中…' : '拿走这张牌' }}
            </button>
            <button class="otev-btn ghost" @click="closePeek">放回</button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import BBAvatar from '../BBAvatar.vue'

const props = defineProps<{
  roomId: string
  participants: { playerId: string; playerName: string }[]
  gameTitle?: string
}>()

const emit = defineEmits<{
  (e: 'finished', winner: { playerId: string; playerName: string }): void
}>()

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)
const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started || (!!state.value.phase && state.value.phase !== 'idle'))
const phase = computed(() => state.value.phase || 'idle')
const my = computed<any>(() => state.value.my || null)
const theme = computed(() => state.value.theme || 'mud')
const clues = computed<string[]>(() => (Array.isArray(state.value.clues) ? state.value.clues : []))
const answerCount = computed(() => Number(state.value.answerCount) || 1)
const pool = computed<any[]>(() => (Array.isArray(state.value.pool) ? state.value.pool : []))
const availableCount = computed(() => pool.value.filter(c => c.state === 'hidden').length)
const submissions = computed<any[]>(() => (Array.isArray(state.value.submissions) ? state.value.submissions : []))
const publicPlayers = computed<any[]>(() => (Array.isArray(state.value.players) ? state.value.players : []))
const secondsLeft = computed(() => Number(state.value.secondsLeft) || 0)
const verdicts = computed<any[]>(() => {
  const list = state.value.reveal?.verdicts || state.value.roundResult?.verdicts || []
  return Array.isArray(list) ? list : []
})
const currentRevealName = computed(() => {
  if (phase.value !== 'reveal') return ''
  const idx = Number(state.value.reveal?.index || 0)
  const s = submissions.value[idx]
  return s ? s.playerName : ''
})
const answerText = computed(() => {
  const names = state.value.roundResult?.answerNames || state.value.answerNames || []
  return Array.isArray(names) && names.length ? names.join(' + ') : '—'
})
const resultText = computed(() => {
  const r = state.value.roundResult
  if (!r) return ''
  const name = r.eliminated?.playerName || ''
  if (r.reason === 'wrong') return `${name} 提交了错误答案，被淘汰；其余选手安全。`
  if (r.reason === 'last') return `所有提交都正确，最后提交的 ${name} 被淘汰。`
  return `${name} 被淘汰（${r.reason === 'timeout' ? '超时自动携带' : '本轮结束'}）。`
})
const resultClass = computed(() => {
  const r = state.value.roundResult
  return { wrong: r?.reason === 'wrong', last: r?.reason === 'last' }
})
const phaseLabel = computed(() => ({
  riddle: 'OTEV 唱歌中',
  search: '公共翻找中',
  reveal: '逐个揭晓',
  result: '本轮结算',
  finished: '已结束'
} as Record<string, string>)[phase.value] || '准备中')
const cardBackIcon = computed(() => ({
  mud: '🟤',
  foam: '🫧',
  ruins: '🧱'
} as Record<string, string>)[theme.value] || '🟤')

// ===== 音效 / OTEV 之歌 =====
const audioEl = ref<HTMLAudioElement | null>(null)
const muted = ref(false)
const audioSrc = computed(() => {
  const raw = String(state.value.audioUrl || '')
  if (!raw) return ''
  if (/^https?:\/\//.test(raw)) return raw
  const base = ((import.meta as any).env?.VITE_API_BASE || '').replace(/\/$/, '') || '/api'
  const root = base.replace(/\/api$/, '')
  return `${root}${raw.startsWith('/') ? '' : '/'}${raw}`
})

watch(muted, (v) => {
  if (audioEl.value) audioEl.value.muted = v
})

watch([() => phase.value, () => audioSrc.value], async () => {
  await nextTick()
  const el = audioEl.value
  if (!el) return
  if (phase.value === 'riddle' && audioSrc.value && !muted.value) {
    try {
      el.currentTime = 0
      await el.play()
    } catch { /* 浏览器可能拦截自动播放 */ }
  } else {
    el.pause()
  }
})

function toggleMute() {
  muted.value = !muted.value
  if (!muted.value && phase.value === 'riddle' && audioEl.value && audioSrc.value) {
    audioEl.value.play().catch(() => {})
  }
}

// ===== 查看弹窗 =====
const peekCard = computed<any>(() => my.value?.peekCard || null)
const peekOpen = ref(false)
const claiming = ref(false)

watch(() => peekCard.value?.id, (id) => {
  if (id) {
    peekOpen.value = true
    claiming.value = false
  } else {
    peekOpen.value = false
    claiming.value = false
  }
})

function closePeek() {
  peekOpen.value = false
  if (peekCard.value) sendAction({ type: 'unpeek' })
}

function claimPeeked() {
  if (!peekCard.value || claiming.value) return
  claiming.value = true
  sendAction({ type: 'claim', cardId: peekCard.value.id })
  setTimeout(() => { claiming.value = false }, 1500)
}

// ===== 交换 =====
const swapMode = ref(false)
const swapSel = ref<string[]>([])

watch(phase, (p) => {
  if (p !== 'search') {
    swapMode.value = false
    swapSel.value = []
  }
})

function toggleSwapMode() {
  if (!my.value?.canSwap) {
    showToast(my.value?.swapCooldownSeconds > 0 ? `交换冷却 ${my.value.swapCooldownSeconds}s` : '现在不能交换')
    return
  }
  swapMode.value = !swapMode.value
  swapSel.value = []
  if (swapMode.value) closePeek()
}

function onCardClick(card: any) {
  if (phase.value !== 'search' || !my.value?.alive || my.value?.submitted) return

  if (swapMode.value) {
    if (card.state !== 'hidden') return
    if (!my.value?.canSwap) {
      showToast('交换冷却中')
      return
    }
    const idx = swapSel.value.indexOf(card.id)
    if (idx >= 0) {
      swapSel.value.splice(idx, 1)
      return
    }
    swapSel.value.push(card.id)
    if (swapSel.value.length === 2) {
      sendAction({ type: 'swap', cardA: swapSel.value[0], cardB: swapSel.value[1] })
      swapSel.value = []
      swapMode.value = false
      showToast('已交换两张牌的位置')
    }
    return
  }

  if (my.value?.heldCard) {
    showToast('先提交或丢回手中牌')
    return
  }
  if (card.state !== 'hidden') return
  if (!my.value?.canPeek) {
    showToast('刚翻过牌，稍等一下')
    return
  }
  sendAction({ type: 'peek', cardId: card.id })
  // 同一张牌再次查看时，服务端返回的 peekCard.id 不变，手动打开弹窗
  if (peekCard.value?.id === card.id) peekOpen.value = true
}

function canClickCard(card: any) {
  if (phase.value !== 'search' || !my.value?.alive || my.value?.submitted) return false
  if (swapMode.value) return card.state === 'hidden'
  return card.state === 'hidden' && !my.value?.heldCard
}

function cardClass(card: any) {
  return {
    'swap-selected': swapMode.value && swapSel.value.includes(card.id),
    'swap-mode': swapMode.value,
    'is-claimed': card.state === 'claimed',
    'is-submitted': card.state === 'submitted',
    'is-seen': !!card.seen,
    'is-mine': !!card.isMine,
    'is-correct': phase.value === 'result' && !!card.correct,
    'is-wrong': phase.value === 'result' && card.state === 'submitted' && card.correct === false
  }
}

function cardTitle(card: any) {
  if (card.state === 'claimed') return `已被 ${card.claimedByName || '某位选手'} 拿走`
  if (card.state === 'submitted') return `${card.submittedByName || '某位选手'} 已提交`
  if (phase.value === 'result' && card.correct) return '正确答案牌'
  if (card.seen) return '你之前看过这张牌'
  return '点击查看'
}

// ===== 提交 / 丢回 =====
const submitArmed = ref(false)
let submitTimer: ReturnType<typeof setTimeout> | null = null

function onSubmitClick() {
  if (!my.value?.canSubmit) return
  if (!submitArmed.value) {
    submitArmed.value = true
    if (submitTimer) clearTimeout(submitTimer)
    submitTimer = setTimeout(() => { submitArmed.value = false }, 2500)
    return
  }
  if (submitTimer) clearTimeout(submitTimer)
  submitArmed.value = false
  sendAction({ type: 'submit' })
}

function discardHeld() {
  if (!my.value?.canDiscard) return
  if (!window.confirm('把这张牌丢回泥里？其他玩家可以再次拿走。')) return
  sendAction({ type: 'discard' })
}

watch(() => my.value?.heldCard?.id, () => {
  submitArmed.value = false
})

// ===== 提示 =====
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | null = null

function showToast(msg: string) {
  toast.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toast.value = '' }, 1800)
}

function playerTag(p: any) {
  if (!p.alive) return '淘汰'
  if (p.submitted) return p.autoSubmitted ? '自动提交' : '已提交'
  if (p.held) return '持有牌'
  return '搜索中'
}

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => {
  connect()
  if (audioEl.value) audioEl.value.muted = muted.value
})

onUnmounted(() => {
  if (audioEl.value) audioEl.value.pause()
  if (submitTimer) clearTimeout(submitTimer)
  if (toastTimer) clearTimeout(toastTimer)
  disconnect()
})
</script>

<style scoped>
.otev-game {
  max-width: 1120px;
  margin: 0 auto;
  padding: 18px;
  color: #ece7fb;
  position: relative;
}

/* ===== 等待 / 结束 ===== */
.game-waiting,
.game-finished {
  padding: 46px 22px;
  text-align: center;
  position: relative;
  overflow: hidden;
}
.game-waiting h2,
.game-finished h2 {
  margin: 0 0 10px;
  color: #ece7fb;
  font-size: 24px;
}
.wait-idol,
.finish-icon {
  font-size: 66px;
  line-height: 1;
  margin-bottom: 14px;
  filter: drop-shadow(0 0 20px #b39bff88);
}
.finish-glow {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 28%, #e6c98822, transparent 55%);
  pointer-events: none;
}
.wait-rules {
  max-width: 620px;
  margin: 18px auto 10px;
  padding: 14px 18px;
  background: #120a22;
  border: 1px solid #b39bff33;
  border-radius: 12px;
  text-align: left;
}
.wait-rules p {
  margin: 7px 0;
  color: #b9a9df;
  font-size: 13.5px;
  line-height: 1.7;
}
.countdown-big {
  font-size: 68px;
  font-weight: 800;
  color: #b39bff;
  margin: 18px 0;
  animation: pulse 0.5s infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.08); }
}
.waiting-text {
  color: #6b5f92;
  margin-top: 12px;
  font-size: 14px;
}
.winner-info { margin-top: 8px; }
.winner-name {
  font-size: 30px;
  font-weight: 800;
  color: #e6c988;
  text-shadow: 0 0 18px #e6c98844;
}
.winner-label {
  display: block;
  margin-top: 6px;
  color: #e6c988;
  font-size: 14px;
}

/* ===== 顶栏 ===== */
.otev-header {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 16px;
  background: linear-gradient(135deg, #1b1130, #241641);
  border: 1px solid #b39bff33;
  border-radius: 16px;
  margin-bottom: 12px;
}
.idol-wrap {
  position: relative;
  width: 58px;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18px;
  background: radial-gradient(circle at 50% 35%, #b39bff33, #120a22 70%);
  border: 1px solid #b39bff55;
  flex-shrink: 0;
}
.idol-wrap .idol {
  font-size: 34px;
  animation: idolFloat 2.6s ease-in-out infinite;
}
@keyframes idolFloat {
  0%, 100% { transform: translateY(0) rotate(-2deg); }
  50% { transform: translateY(-5px) rotate(2deg); }
}
.note {
  position: absolute;
  color: #b39bff;
  font-size: 13px;
  opacity: 0;
  animation: noteFloat 2.4s ease-in-out infinite;
}
.note.n1 { top: 2px; right: 5px; animation-delay: 0s; }
.note.n2 { top: 12px; left: 2px; animation-delay: 0.7s; }
.note.n3 { bottom: 4px; right: 0; animation-delay: 1.3s; }
@keyframes noteFloat {
  0% { opacity: 0; transform: translateY(5px) scale(0.8); }
  35% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-16px) scale(1.1); }
}
.head-main { flex: 1; min-width: 0; }
.head-title {
  font-size: 17px;
  font-weight: 800;
  color: #ece7fb;
  letter-spacing: 0.4px;
}
.head-sub {
  margin-top: 4px;
  font-size: 12.5px;
  color: #a99bd0;
}
.head-sub .dot { margin: 0 6px; color: #5e4f86; }
.head-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.timer {
  min-width: 74px;
  text-align: center;
  font-size: 26px;
  font-weight: 800;
  color: #b39bff;
  font-variant-numeric: tabular-nums;
}
.timer small { font-size: 12px; margin-left: 2px; color: #8f83b8; }
.timer.low { color: #ff6b6b; animation: pulse 0.7s infinite; }
.icon-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid #b39bff33;
  background: #ffffff08;
  color: #e0d7ff;
  cursor: pointer;
  font-size: 16px;
}
.icon-btn:hover { background: #b39bff22; }

/* ===== 谜语 ===== */
.riddle-bar {
  background: linear-gradient(135deg, #221540, #17112a);
  border: 1px solid #e6c98844;
  border-radius: 14px;
  padding: 12px 16px;
  margin-bottom: 12px;
}
.riddle-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 6px;
}
.riddle-label { font-size: 13px; font-weight: 700; color: #e6c988; }
.answer-badge {
  font-size: 12px;
  color: #120a22;
  background: #e6c988;
  border-radius: 999px;
  padding: 2px 10px;
  font-weight: 800;
  white-space: nowrap;
}
.riddle-lines { display: flex; flex-direction: column; gap: 3px; }
.riddle-line {
  color: #e0d7ff;
  font-size: 14px;
  line-height: 1.6;
  animation: clueIn 0.45s ease both;
}
@keyframes clueIn {
  from { opacity: 0; transform: translateY(5px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ===== 唱歌阶段 ===== */
.riddle-stage {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 28px 18px;
  background: radial-gradient(ellipse at 50% 0%, #2a1a4a 0%, #120a22 72%);
  border: 1px solid #b39bff33;
  border-radius: 18px;
}
.sing-idol {
  font-size: 82px;
  filter: drop-shadow(0 0 26px #b39bff88);
  animation: idolFloat 2.2s ease-in-out infinite;
}
.sing-bubble {
  max-width: 620px;
  text-align: center;
  background: #1b1130;
  border: 1px solid #e6c98844;
  border-radius: 18px;
  padding: 16px 20px;
}
.sing-title { font-size: 13px; color: #e6c988; font-weight: 700; margin-bottom: 8px; }
.sing-lines { display: flex; flex-direction: column; gap: 6px; }
.sing-lines span { color: #e0d7ff; font-size: 16px; line-height: 1.6; }
.riddle-tip { color: #8f83b8; font-size: 13px; }

/* ===== 翻找布局 ===== */
.search-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 14px;
  align-items: start;
}
.pool-wrap {
  background: #17112a;
  border: 1px solid #b39bff33;
  border-radius: 16px;
  padding: 12px;
  min-width: 0;
}
.pool-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #b3a6d6;
  font-size: 12.5px;
  margin-bottom: 8px;
}
.pool-count { color: #b39bff; font-variant-numeric: tabular-nums; }
.pool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: 8px;
  max-height: 64vh;
  overflow-y: auto;
  padding-right: 3px;
}
.pool-card {
  position: relative;
  aspect-ratio: 3 / 4;
  min-height: 76px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border-radius: 10px;
  border: 1px solid #ffffff18;
  background: linear-gradient(160deg, #35224f, #1c1233);
  color: #e6e0ff;
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.12s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}
.theme-foam .pool-card { background: linear-gradient(160deg, #25415a, #102332); }
.theme-ruins .pool-card { background: linear-gradient(160deg, #41403a, #1d1d1a); }
.pool-card:hover:not([aria-disabled="true"]) { transform: translateY(-3px); border-color: #b39bff; box-shadow: 0 8px 20px #00000044; }
.pool-card[aria-disabled="true"] { cursor: default; }
.pool-card.swap-mode { border-style: dashed; }
.pool-card.swap-selected {
  border-color: #e6c988;
  box-shadow: 0 0 0 2px #e6c98866, 0 0 18px #e6c98833;
  transform: translateY(-2px);
}
.pool-card.is-claimed,
.pool-card.is-submitted {
  background: #0d0818;
  border-color: #ffffff0d;
  cursor: default;
}
.pool-card.is-mine { border-color: #b39bff88; }
.pool-card.is-seen::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 18% 82%, #b39bff22, transparent 34%);
  pointer-events: none;
}
.pool-card.is-correct {
  border-color: #e6c988;
  box-shadow: 0 0 0 2px #e6c98855, 0 0 18px #e6c98833;
}
.pool-card.is-wrong { border-color: #ff6b6b66; }
.card-back-icon { font-size: 26px; opacity: 0.85; }
.seen-mark {
  position: absolute;
  left: 4px;
  bottom: 3px;
  font-size: 11px;
  opacity: 0.7;
}
.card-owner {
  max-width: 100%;
  padding: 0 3px;
  font-size: 10px;
  color: #cfc4ea;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.card-tag {
  font-size: 9px;
  color: #b3a6d6;
  background: #ffffff0d;
  border-radius: 999px;
  padding: 1px 6px;
}
.card-tag.submitted { color: #7ee0a0; background: #7ee0a015; }
.correct-star {
  position: absolute;
  top: 3px;
  right: 4px;
  color: #e6c988;
  font-size: 13px;
  text-shadow: 0 0 8px #e6c98888;
}
.wrong-star {
  position: absolute;
  top: 3px;
  right: 4px;
  color: #ff6b6b;
  font-size: 13px;
}

/* ===== 侧栏 ===== */
.side-wrap { display: flex; flex-direction: column; gap: 10px; }
.side-block {
  background: #1b1130;
  border: 1px solid #b39bff22;
  border-radius: 14px;
  padding: 12px;
}
.side-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  font-weight: 700;
  color: #b39bff;
  margin-bottom: 9px;
}
.side-title span { color: #8f83b8; font-weight: 500; }
.hand-card {
  background: linear-gradient(150deg, #2a1a4a, #17112a);
  border: 1px solid #e6c98855;
  border-radius: 12px;
  padding: 12px;
}
.hand-card.submitted { border-color: #7ee0a055; }
.hand-label { font-size: 11px; color: #8f83b8; margin-bottom: 5px; }
.hand-names {
  font-size: 19px;
  font-weight: 800;
  color: #e6c988;
  line-height: 1.35;
  word-break: break-word;
}
.hand-actions { display: flex; flex-direction: column; gap: 7px; margin-top: 10px; }
.hand-hint { margin: 8px 0 0; font-size: 11.5px; color: #8f83b8; line-height: 1.5; }
.hand-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 16px 8px;
  border: 1px dashed #b39bff33;
  border-radius: 12px;
  color: #b3a6d6;
  font-size: 13px;
  text-align: center;
}
.hand-empty small { color: #6b5f92; font-size: 11.5px; }
.empty-icon { font-size: 28px; }
.otev-btn {
  border-radius: 9px;
  border: 1px solid #b39bff44;
  background: transparent;
  color: #b39bff;
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.otev-btn:hover:not(:disabled) { background: #b39bff18; }
.otev-btn:disabled { opacity: 0.42; cursor: not-allowed; }
.otev-btn.primary {
  border-color: #e6c98866;
  color: #e6c988;
  background: #e6c98812;
}
.otev-btn.primary:hover:not(:disabled) { background: #e6c98822; }
.otev-btn.primary.armed {
  background: #ff6b6b22;
  border-color: #ff6b6b88;
  color: #ff8f8f;
}
.otev-btn.ghost { border-color: #ffffff1f; color: #cfc4ea; }
.otev-btn.ghost:hover:not(:disabled) { background: #ffffff0d; }
.otev-btn.ghost.active { border-color: #e6c988; color: #e6c988; background: #e6c98812; }
.otev-btn.danger { color: #ff8f8f; border-color: #ff6b6b33; }
.otev-btn.danger:hover:not(:disabled) { background: #ff6b6b12; }
.swap-row { margin-top: 9px; display: flex; flex-direction: column; gap: 5px; }
.swap-row .otev-btn { width: 100%; }
.swap-hint { font-size: 11px; color: #8f83b8; text-align: center; }
.queue { display: flex; flex-direction: column; gap: 5px; max-height: 220px; overflow-y: auto; }
.queue-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 5px 7px;
  background: #ffffff06;
  border-radius: 8px;
  font-size: 12.5px;
  color: #e0d7ff;
}
.queue-pos {
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #b39bff22;
  color: #b39bff;
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}
.queue-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.auto-tag {
  font-size: 9px;
  color: #e6c988;
  background: #e6c98815;
  border-radius: 999px;
  padding: 1px 6px;
}
.queue-empty { color: #6b5f92; font-size: 12px; text-align: center; padding: 10px 0; }
.player-chips { display: flex; flex-direction: column; gap: 4px; max-height: 190px; overflow-y: auto; }
.player-chip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 7px;
  background: #ffffff05;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 12px;
  color: #cfc4ea;
}
.player-chip.has { border-color: #b39bff33; }
.player-chip.me { border-color: #b39bff88; background: #b39bff0f; }
.player-chip.dead { opacity: 0.45; text-decoration: line-through; }
.pc-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pc-tag { font-size: 9.5px; color: #8f83b8; white-space: nowrap; }

/* ===== 揭晓 ===== */
.reveal-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 14px;
  align-items: start;
}
.reveal-main {
  background: radial-gradient(ellipse at 50% 0%, #2a1a4a 0%, #120a22 70%);
  border: 1px solid #b39bff33;
  border-radius: 18px;
  padding: 16px;
}
.reveal-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.reveal-icon { font-size: 34px; }
.reveal-title { font-size: 17px; font-weight: 800; color: #ece7fb; }
.reveal-sub { margin-top: 4px; font-size: 12px; color: #8f83b8; line-height: 1.5; }
.verdict-list { display: flex; flex-direction: column; gap: 7px; max-height: 38vh; overflow-y: auto; }
.verdict {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: #ffffff06;
  border: 1px solid #7ee0a033;
  border-radius: 10px;
  font-size: 13px;
  color: #e0d7ff;
  animation: clueIn 0.3s ease both;
}
.verdict.wrong { border-color: #ff6b6b88; background: #ff6b6b12; }
.verdict.pending { border-style: dashed; border-color: #b39bff55; color: #b3a6d6; }
.v-pos {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #b39bff22;
  color: #b39bff;
  font-size: 10px;
  font-weight: 800;
  flex-shrink: 0;
}
.v-name { min-width: 66px; font-weight: 700; color: #ece7fb; }
.v-card {
  flex: 1;
  font-weight: 800;
  color: #e6c988;
  word-break: break-word;
}
.v-result { font-size: 12px; font-weight: 700; color: #7ee0a0; white-space: nowrap; }
.verdict.wrong .v-result { color: #ff6b6b; }
.v-auto { font-size: 9px; color: #e6c988; background: #e6c98815; border-radius: 999px; padding: 1px 6px; white-space: nowrap; }
.result-box {
  margin-top: 14px;
  padding: 14px;
  border-radius: 14px;
  background: #ffffff06;
  border: 1px solid #b39bff33;
}
.result-box.wrong { border-color: #ff6b6b55; }
.result-box.last { border-color: #e6c98866; }
.result-answer { font-size: 14px; color: #b3a6d6; }
.result-answer strong { color: #e6c988; font-size: 20px; }
.result-line { margin-top: 6px; font-size: 14px; color: #ffb3b3; line-height: 1.6; }
.result-box.last .result-line { color: #e6c988; }
.result-held { margin-top: 6px; font-size: 12px; color: #b3a6d6; }
.result-board {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(56px, 1fr));
  gap: 5px;
  margin-top: 12px;
  max-height: 160px;
  overflow-y: auto;
}
.result-card {
  min-height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  border-radius: 7px;
  background: #0d0818;
  border: 1px solid #ffffff0d;
  font-size: 10px;
  color: #8f83b8;
  text-align: center;
  word-break: break-word;
}
.result-card.correct { border-color: #e6c988; color: #e6c988; background: #e6c98810; }
.result-card.wrong { border-color: #ff6b6b66; color: #ff8f8f; background: #ff6b6b0d; }
.result-card.mine { box-shadow: inset 0 0 0 1px #b39bff55; }
.result-hidden { color: #3f3658; }
.reveal-side { display: flex; flex-direction: column; gap: 10px; }
.spectator-block p { margin: 0; font-size: 12.5px; color: #8f83b8; line-height: 1.6; }

/* ===== 查看弹窗 ===== */
.peek-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(4, 6, 20, 0.78);
  backdrop-filter: blur(5px);
}
.peek-modal {
  width: min(420px, 92vw);
  background: linear-gradient(165deg, #241641 0%, #120a22 100%);
  border: 1px solid #e6c98866;
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.7), 0 0 40px rgba(230, 201, 136, 0.08);
  animation: peekPop 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
}
@keyframes peekPop {
  from { opacity: 0; transform: translateY(12px) scale(0.96); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.peek-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: #b3a6d6;
}
.peek-time {
  color: #e6c988;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.peek-names {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 22px 0;
  min-height: 86px;
}
.peek-name {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 100px;
  min-height: 80px;
  padding: 12px 16px;
  background: linear-gradient(150deg, #f4ecff, #d8c8ff);
  border: 2px solid #ffffffaa;
  border-radius: 12px;
  color: #241641;
  font-size: 22px;
  font-weight: 900;
  box-shadow: 0 8px 24px #00000055;
  animation: cardFlip 0.35s ease both;
}
@keyframes cardFlip {
  from { opacity: 0; transform: rotateY(70deg) scale(0.9); }
  to { opacity: 1; transform: rotateY(0) scale(1); }
}
.peek-hint {
  font-size: 12px;
  color: #8f83b8;
  line-height: 1.6;
  text-align: center;
  margin-bottom: 14px;
}
.peek-actions { display: flex; gap: 9px; }
.peek-actions .otev-btn { flex: 1; }

/* ===== 其他 ===== */
.spectator-badge {
  margin-top: 12px;
  text-align: center;
  padding: 8px 12px;
  border-radius: 10px;
  background: #ff6b6b12;
  border: 1px solid #ff6b6b33;
  color: #ff8f8f;
  font-size: 13px;
}
.toast {
  position: fixed;
  left: 50%;
  bottom: 34px;
  z-index: 2100;
  transform: translateX(-50%);
  background: #241641ee;
  border: 1px solid #b39bff55;
  color: #e0d7ff;
  border-radius: 999px;
  padding: 8px 18px;
  font-size: 13px;
  box-shadow: 0 10px 30px #00000066;
  animation: toastIn 0.2s ease both;
}
@keyframes toastIn {
  from { opacity: 0; transform: translate(-50%, 8px); }
  to { opacity: 1; transform: translate(-50%, 0); }
}

@media (max-width: 820px) {
  .otev-game { padding: 10px; }
  .search-layout,
  .reveal-layout { grid-template-columns: 1fr; }
  .pool-grid {
    grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
    max-height: none;
  }
  .side-wrap { order: 2; }
  .reveal-side { order: 2; }
  .head-title { font-size: 15px; }
  .head-sub { font-size: 11.5px; }
  .timer { font-size: 22px; min-width: 60px; }
  .otev-header { padding: 10px 12px; gap: 10px; }
  .idol-wrap { width: 48px; height: 48px; }
  .idol-wrap .idol { font-size: 28px; }
}
@media (max-width: 480px) {
  .pool-grid { grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .pool-card { min-height: 66px; }
  .card-back-icon { font-size: 22px; }
  .riddle-line { font-size: 13px; }
  .sing-lines span { font-size: 14.5px; }
  .v-name { min-width: 48px; }
  .v-card { font-size: 12px; }
  .verdict { flex-wrap: wrap; }
}
</style>
