<template>
  <div class="minigame marble-score">
    <!-- 结束 -->
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🏆</div>
      <h2>比赛结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winnerNames || '无胜者' }}</span>
        <span v-if="winnerNames" class="winner-label">获胜！</span>
        <div v-if="tieBreakNote" class="winner-note">{{ tieBreakNote }}</div>
      </div>
      <div class="final-board">
        <div v-for="p in finalPlayers" :key="p.playerId" class="final-row" :class="{ win: winnerIds.includes(p.playerId) }">
          <span class="fr-name">{{ p.playerName }}</span>
          <span class="fr-score">{{ p.score }} 分</span>
          <span class="fr-tag">{{ winnerIds.includes(p.playerId) ? '🏆' : (p.alive ? '完成' : '淘汰') }}</span>
        </div>
      </div>
    </div>

    <!-- 等待开始 -->
    <div v-else-if="!gameStarted" class="game-waiting">
      <div class="game-icon">🎱</div>
      <h2>{{ gameTitle || '弹珠得分' }}</h2>
      <p class="waiting-desc">{{ rulesText }}</p>
      <p class="waiting-sub">地图每局随机生成，本局内固定不变。方向箭头与蓄力条会以不同节奏持续摆动，看准时机发射！</p>
      <p class="waiting-sub waiting-modes">淘汰模式：每轮所有存活选手同时发射，最低分淘汰 1 人，直到最后一人。<br />单轮模式：随机顺序轮流发射，每人 1 次机会，最高分获胜。</p>
      <div v-if="countdown > 0" class="countdown-big"><CountdownDisplay :value="countdown" /></div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <!-- 游戏中 -->
    <div v-else class="game-playing">
      <div class="ms-header">
        <div class="ms-title">
          <span class="ms-icon">🎱</span>
          <span>弹珠得分</span>
          <span class="mode-badge" :class="mode">{{ modeLabel }}</span>
        </div>
        <div class="ms-round">
          <template v-if="mode === 'elimination'">第 {{ roundNum }} 轮 · 存活 {{ aliveCount }} 人</template>
          <template v-else>第 {{ roundNum }} / {{ totalPlayers }} 位</template>
        </div>
        <div class="ms-timer" :class="{ warn: clockLeft <= 3 }">
          {{ phase === 'aim' ? `⏱ ${Math.ceil(clockLeft)}s` : `结算 ${Math.max(0, Math.ceil(clockLeft))}s` }}
        </div>
      </div>

      <div class="ms-main">
        <div class="ms-map-wrap">
          <MarbleMap
            :map="map"
            :throws="mapThrows"
            :aim-angle="showAim ? liveAngle : null"
            :preview-point="showAim ? previewPoint : null"
            :active-color="me?.color || '#ffd166'"
          />

          <!-- 地图上层提示 -->
          <div v-if="phase === 'result'" class="map-overlay result-overlay">
            <div v-if="eliminatedNames" class="overlay-big out">
              ⚠️ {{ eliminatedNames }} 被淘汰
            </div>
            <div v-if="mode === 'elimination' && eliminatedNames" class="overlay-small">
              本轮最低分 {{ lastRoundLow }} 分
            </div>
            <div v-else-if="lastThrow" class="overlay-big">
              {{ lastThrow.playerName }} 得到 {{ lastThrow.score }} 分
            </div>
            <div class="overlay-small">{{ nextPhaseHint }}</div>
          </div>
          <div v-else-if="!myAlive" class="map-overlay">
            <div class="overlay-big">👀 你已被淘汰</div>
            <div class="overlay-small">观战中，为剩下的选手加油</div>
          </div>
          <div v-else-if="mode === 'single' && !myTurn" class="map-overlay soft">
            <div class="overlay-big">等待 {{ currentTurnName }} 发射</div>
            <div class="overlay-small">每位选手 1 次机会，随机顺序进行</div>
          </div>
          <div v-else-if="myThrownThisRound && phase === 'aim'" class="map-overlay soft">
            <div class="overlay-big">已发射，等待本轮结算</div>
            <div class="overlay-small">已发射 {{ roundThrows.length }} / {{ aliveCount }} 人</div>
          </div>
        </div>

        <div class="ms-side">
          <div class="turn-banner" :class="{ active: canLaunch, waiting: !canLaunch }">
            <template v-if="!myAlive">你已被淘汰，观战中</template>
            <template v-else-if="mode === 'elimination'">
              <template v-if="canLaunch">🎯 选择你的发射时机</template>
              <template v-else-if="myThrownThisRound">✅ 你已发射，等待其他选手</template>
              <template v-else>等待本轮发射</template>
            </template>
            <template v-else>
              <template v-if="myTurn">🎯 轮到你了</template>
              <template v-else>等待 {{ currentTurnName }} 发射…</template>
            </template>
          </div>

          <div class="specs" :class="{ dim: !showAim }">
            <div class="spec-head">
              <span>方向</span>
              <span class="spec-value">{{ showAim ? liveAngle.toFixed(1) + '°' : '—' }}</span>
            </div>
            <div class="dir-track">
              <div class="dir-center"></div>
              <div class="dir-needle" :style="{ transform: `translateX(-50%) rotate(${showAim ? liveAngle : 0}deg)` }"></div>
            </div>

            <div class="spec-head power-head">
              <span>力度</span>
              <span class="spec-value">{{ showAim ? Math.round(livePower * 100) + '%' : '—' }}</span>
            </div>
            <div class="power-track">
              <div class="power-fill" :style="{ width: (showAim ? livePower * 100 : 0) + '%' }"></div>
              <div class="power-ticks">
                <span v-for="n in 9" :key="n" class="power-tick"></span>
              </div>
            </div>
            <div class="power-hint">力度决定弹珠飞出的距离</div>
          </div>

          <button class="launch-btn" :class="{ ready: canLaunch }" :disabled="!canLaunch" @click="launch">
            <template v-if="canLaunch">🚀 发射弹珠</template>
            <template v-else-if="!myAlive">观战中</template>
            <template v-else-if="myThrownThisRound">已发射</template>
            <template v-else>等待轮次</template>
          </button>
          <p class="launch-hint">点击按钮或按空格发射；方向与力度会在你点击的瞬间被锁定。</p>

          <div class="players-box">
            <div class="players-title">
              <span>选手</span>
              <span class="players-sub">{{ mode === 'elimination' ? '本轮得分 / 累计' : '得分' }}</span>
            </div>
            <div class="players-list">
              <div
                v-for="p in sortedPlayers"
                :key="p.playerId"
                class="p-row"
                :class="{
                  me: p.playerId === myId,
                  turn: mode === 'single' && p.playerId === turnId,
                  out: !p.alive,
                  thrown: p.roundScore !== null && p.roundScore !== undefined
                }"
              >
                <span class="p-seat">{{ p.seat }}</span>
                <span class="p-dot" :style="{ background: p.color }"></span>
                <span class="p-name">{{ p.playerName }}<i v-if="p.playerId === myId">（我）</i></span>
                <span v-if="!p.alive" class="p-out">淘汰</span>
                <span v-else-if="mode === 'elimination'" class="p-score">
                  <b>{{ p.roundScore !== null && p.roundScore !== undefined ? p.roundScore : '—' }}</b>
                  <em>/ {{ p.score }}</em>
                </span>
                <span v-else class="p-score"><b>{{ p.score }}</b></span>
                <span v-if="mode === 'single' && p.playerId === turnId" class="p-turn-dot">●</span>
                <span v-else-if="mode === 'elimination' && p.roundScore !== null && p.roundScore !== undefined" class="p-check">✓</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="roundLogs.length" class="round-log">
        <div class="round-log-title">回合记录</div>
        <div class="round-log-scroll">
          <div v-for="log in roundLogs" :key="log.key" class="log-card">
            <div class="log-head">
              <span>{{ log.title }}</span>
              <span v-if="log.eliminatedName" class="log-out">淘汰：{{ log.eliminatedName }}</span>
            </div>
            <div class="log-rows">
              <div v-for="row in log.rows" :key="row.playerId" class="log-row" :class="{ out: row.eliminated }">
                <span class="lr-dot" :style="{ background: row.color }"></span>
                <span class="lr-name">{{ row.playerName }}</span>
                <span class="lr-score">{{ row.score }} 分</span>
                <span v-if="row.eliminated" class="lr-out">淘汰</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'
import MarbleMap from './MarbleMap.vue'
import CountdownDisplay from './CountdownDisplay.vue'

const props = defineProps<{
  roomId: string
  participants: { playerId: string; playerName: string }[]
  gameTitle?: string
}>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const state = computed<any>(() => gameState.value || null)
const map = computed<any>(() => state.value?.map || null)
const players = computed<any[]>(() => state.value?.players || [])
const mode = computed(() => state.value?.mode || 'elimination')
const modeLabel = computed(() => mode.value === 'elimination' ? '淘汰模式' : '单轮模式')
const phase = computed(() => state.value?.phase || '')
const roundNum = computed(() => state.value?.round || 0)
const turnId = computed(() => state.value?.turnId || '')
const myTurn = computed(() => !!state.value?.myTurn)
const myAlive = computed(() => state.value?.myAlive !== false)
const myThrownThisRound = computed(() => !!state.value?.myThrownThisRound)
const roundThrows = computed<any[]>(() => state.value?.roundThrows || [])
const lastThrow = computed<any>(() => state.value?.lastThrow || null)
const lastEliminated = computed<string[]>(() => state.value?.lastEliminated || [])
const history = computed<any[]>(() => state.value?.history || [])
const scores = computed<Record<string, number>>(() => state.value?.scores || {})

const me = computed(() => players.value.find(p => p.playerId === myId.value) || null)
const aliveCount = computed(() => players.value.filter(p => p.alive).length)
const totalPlayers = computed(() => players.value.length)
const sortedPlayers = computed(() => {
  const list = [...players.value]
  return list.sort((a, b) => {
    if (a.alive !== b.alive) return a.alive ? -1 : 1
    if (mode.value === 'single') return b.score - a.score
    return (a.seat || 0) - (b.seat || 0)
  })
})
const currentTurnName = computed(() => players.value.find(p => p.playerId === turnId.value)?.playerName || '其他选手')
const eliminatedNames = computed(() => lastEliminated.value
  .map(id => players.value.find(p => p.playerId === id)?.playerName)
  .filter(Boolean)
  .join('、'))
const lastRoundLow = computed(() => {
  const rows = history.value[history.value.length - 1]
  return rows?.lowestScore ?? 0
})
const nextPhaseHint = computed(() => {
  if (mode.value === 'single') {
    return (state.value?.turnIndex ?? 0) + 1 >= totalPlayers.value
      ? '即将公布最终结果…'
      : '下一位即将开始…'
  }
  return aliveCount.value <= 1 ? '即将决出胜者…' : '下一轮即将开始…'
})

const rulesText = computed(() => {
  if (!state.value) {
    return '方向箭头左右摆动决定方向，蓄力条起伏决定距离；两者周期与幅度都随机且不同，点击发射后按落点所在区域计分。'
  }
  return mode.value === 'elimination'
    ? '每轮所有存活选手同时发射 1 次弹珠，本轮得分最低者淘汰 1 人；若最低分并列，随机淘汰其中 1 人，直到剩下最后一人。'
    : '随机顺序轮流发射，每人仅 1 次机会，得分最高者获胜；若最高分并列，落点更接近区域中心者胜。'
})

const gameStarted = computed(() => {
  const s = state.value
  return !!(s && s.started && (s.status === 'playing' || s.status === 'paused' || s.phase === 'aim' || s.phase === 'result' || s.phase === 'finished'))
})

const canLaunch = computed(() => phase.value === 'aim' && myTurn.value)

// ===== 与服务器时钟对齐 =====
const clockOffset = ref(0)
const clockLeft = ref(0)
const osc = ref<any>(null)
const liveAngle = ref(0)
const livePower = ref(0)
const previewPoint = ref<{ x: number; y: number } | null>(null)
const showAim = computed(() => phase.value === 'aim' && canLaunch.value && !!osc.value)

let rafTimer: ReturnType<typeof setInterval> | null = null

function landingPoint(angle: number, power: number) {
  const m = map.value
  if (!m) return null
  const rad = angle * Math.PI / 180
  const dist = m.minDistance + power * (m.maxDistance - m.minDistance)
  return {
    x: m.origin.x + Math.sin(rad) * dist,
    y: m.origin.y - Math.cos(rad) * dist
  }
}

function tickClock() {
  const s = state.value
  if (!s) return
  const serverNow = Date.now() + clockOffset.value
  clockLeft.value = Math.max(0, ((s.phaseEndsAt || 0) - serverNow) / 1000)

  if (s.phase !== 'aim' || !osc.value || !canLaunch.value) {
    previewPoint.value = null
    return
  }
  const t = Math.max(0, serverNow - (s.phaseStartAt || 0))
  const angle = osc.value.dirAmp * Math.sin((2 * Math.PI * t) / osc.value.dirPeriod + osc.value.dirPhase)
  const powerRaw = 0.5 + 0.5 * osc.value.powAmp * Math.sin((2 * Math.PI * t) / osc.value.powPeriod + osc.value.powPhase)
  const power = Math.max(0, Math.min(1, powerRaw))
  liveAngle.value = angle
  livePower.value = power
  previewPoint.value = landingPoint(angle, power)
}

function syncClock(s: any) {
  if (!s) return
  if (typeof s.now === 'number') {
    const offset = s.now - Date.now()
    // 轻微平滑，避免每次状态推送导致箭头位置跳动
    clockOffset.value = clockOffset.value
      ? clockOffset.value * 0.55 + offset * 0.45
      : offset
  }
  clockLeft.value = Math.max(0, ((s.phaseEndsAt || 0) - (Date.now() + clockOffset.value)) / 1000)
  osc.value = s.osc || null
  if (s.phase !== 'aim' || !s.osc) {
    previewPoint.value = null
  }
}

watch(gameState, (s) => {
  syncClock(s)
}, { immediate: true })

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

watch(() => props.roomId, (v) => {
  roomIdRef.value = v
})

function launch() {
  if (!canLaunch.value || clockLeft.value <= 0) return
  sendAction({ type: 'launch' })
}

function onKey(e: KeyboardEvent) {
  if (e.code === 'Space' && canLaunch.value) {
    e.preventDefault()
    launch()
  }
}

// 地图上展示所有已发射的落点（历史 + 本轮）
const mapThrows = computed(() => {
  const out: any[] = []
  for (const h of history.value) {
    for (const t of (h.throws || [])) out.push(t)
  }
  for (const t of roundThrows.value) {
    const dup = out.some(x => x.playerId === t.playerId && x.round === t.round)
    if (!dup) out.push(t)
  }
  return out.slice(-40)
})

const winnerIds = computed<string[]>(() => {
  const w = state.value?.winners
  if (Array.isArray(w) && w.length) return w
  if (winner.value?.playerId) return [winner.value.playerId]
  return []
})
const winnerNames = computed(() => winnerIds.value
  .map(id => players.value.find(p => p.playerId === id)?.playerName || (winner.value?.playerId === id ? winner.value.playerName : ''))
  .filter(Boolean)
  .join('、'))
const tieBreakNote = computed(() => {
  const tb = state.value?.tieBreak
  if (!tb || tb.type !== 'distance') return ''
  const tied = (tb.tied || [])
    .map((id: string) => players.value.find(p => p.playerId === id)?.playerName)
    .filter(Boolean)
    .join('、')
  return `最高分并列（${tied}），按落点与区域中心的距离判定胜负`
})

const finalPlayers = computed(() => [...players.value].sort((a, b) => {
  const wa = winnerIds.value.includes(a.playerId)
  const wb = winnerIds.value.includes(b.playerId)
  if (wa !== wb) return wa ? -1 : 1
  if (a.alive !== b.alive) return a.alive ? -1 : 1
  const sa = scores.value[a.playerId] ?? a.score ?? 0
  const sb = scores.value[b.playerId] ?? b.score ?? 0
  if (sb !== sa) return sb - sa
  return (a.seat || 0) - (b.seat || 0)
}))

const roundLogs = computed(() => {
  return history.value.slice(-10).map((h: any) => {
    const throws = h.throws || []
    const isSingle = h.mode === 'single' || mode.value === 'single'
    const first = throws[0]
    const title = isSingle
      ? `第 ${h.round} 位 · ${first?.playerName || '—'}`
      : `第 ${h.round} 轮`
    return {
      key: `${h.mode || mode.value}-${h.round}-${first?.playerId || ''}`,
      title,
      rows: throws.map((t: any) => ({
        ...t,
        eliminated: (h.eliminated || []).includes(t.playerId)
      })),
      eliminatedName: (h.eliminated || [])
        .map((id: string) => players.value.find(p => p.playerId === id)?.playerName)
        .filter(Boolean)
        .join('、')
    }
  })
})

onMounted(() => {
  connect()
  rafTimer = setInterval(tickClock, 40)
  window.addEventListener('keydown', onKey)
})

onUnmounted(() => {
  if (rafTimer) clearInterval(rafTimer)
  window.removeEventListener('keydown', onKey)
  disconnect()
})
</script>

<style scoped>
.marble-score { max-width: 1060px; margin: 0 auto; padding: 4px 0 16px; }

.game-waiting, .game-finished { text-align: center; padding: 44px 20px; }
.game-icon { font-size: 68px; margin-bottom: 14px; }
h2 { color: #ece7fb; margin: 0 0 10px; font-size: 24px; }
.waiting-desc { color: #b9c6e6; font-size: 15px; line-height: 1.7; max-width: 620px; margin: 10px auto; }
.waiting-sub { color: #8f83b8; font-size: 13px; line-height: 1.6; max-width: 620px; margin: 0 auto; }
.waiting-modes { margin-top: 12px; color: #7d6fa6; font-size: 12px; }
.countdown-big { font-size: 76px; font-weight: 800; color: #b39bff; margin: 22px 0; animation: ms-pulse 0.6s infinite; }
@keyframes ms-pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #6b5f92; margin-top: 14px; }
.winner-name { font-size: 30px; font-weight: 800; color: #e6c988; }
.winner-label { display: block; font-size: 14px; color: #e6c988; margin-top: 4px; }
.winner-note { font-size: 12px; color: #b3a6d6; margin-top: 8px; }
.final-board { max-width: 420px; margin: 26px auto 0; display: flex; flex-direction: column; gap: 6px; }
.final-row { display: flex; align-items: center; gap: 10px; background: #ffffff06; border: 1px solid #ffffff10; border-radius: 8px; padding: 8px 12px; }
.final-row.win { border-color: #e6c98866; background: #e6c98812; }
.fr-name { flex: 1; text-align: left; color: #e0d7ff; font-size: 14px; }
.fr-score { color: #e6c988; font-weight: 700; font-size: 14px; }
.fr-tag { font-size: 12px; color: #8f83b8; width: 42px; text-align: right; }

.ms-header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ms-title { display: flex; align-items: center; gap: 8px; font-size: 18px; font-weight: 800; color: #ece7fb; }
.ms-icon { font-size: 22px; }
.mode-badge { font-size: 11px; font-weight: 600; padding: 2px 9px; border-radius: 20px; border: 1px solid #b39bff55; color: #c9a6ff; background: #b39bff14; }
.mode-badge.single { border-color: #e6c98866; color: #e6c988; background: #e6c98814; }
.ms-round { font-size: 13px; color: #b3a6d6; }
.ms-timer { margin-left: auto; font-size: 14px; font-weight: 700; color: #b39bff; font-variant-numeric: tabular-nums; }
.ms-timer.warn { color: #ff6b6b; animation: ms-pulse 0.5s infinite; }

.ms-main { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(270px, 0.85fr); gap: 16px; align-items: start; }
.ms-map-wrap { position: relative; min-width: 0; }
.map-overlay {
  position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; padding: 20px; text-align: center; border-radius: 14px;
  background: rgba(10, 7, 22, 0.55); backdrop-filter: blur(2px); pointer-events: none;
}
.map-overlay.soft { background: rgba(10, 7, 22, 0.42); }
.map-overlay.result-overlay { background: rgba(10, 7, 22, 0.62); }
.overlay-big { font-size: 19px; font-weight: 800; color: #ece7fb; text-shadow: 0 2px 12px #000; }
.overlay-big.out { color: #ff8a8a; }
.overlay-small { font-size: 13px; color: #c9c0e6; text-shadow: 0 1px 8px #000; }

.ms-side { display: flex; flex-direction: column; gap: 10px; }
.turn-banner {
  padding: 10px 12px; border-radius: 10px; font-size: 14px; font-weight: 600;
  border: 1px solid #ffffff12; background: #ffffff06; color: #b9c6e6; text-align: center;
}
.turn-banner.active { border-color: #ffd16688; background: #ffd16610; color: #ffd166; box-shadow: 0 0 22px #ffd16612; }
.turn-banner.waiting { color: #a99bd0; }

.specs { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 11px 12px; transition: opacity 0.2s; }
.specs.dim { opacity: 0.55; }
.spec-head { display: flex; align-items: center; justify-content: space-between; font-size: 12px; color: #b3a6d6; }
.spec-value { color: #ece7fb; font-weight: 700; font-variant-numeric: tabular-nums; }
.dir-track { position: relative; height: 30px; margin: 4px 0 10px; border-radius: 8px; background: linear-gradient(180deg, #ffffff06, #ffffff02); border: 1px solid #ffffff0c; overflow: hidden; }
.dir-center { position: absolute; left: 50%; top: 4px; bottom: 4px; width: 1px; background: #ffffff18; }
.dir-needle {
  position: absolute; left: 50%; bottom: 4px; width: 3px; height: 22px; border-radius: 2px;
  background: linear-gradient(180deg, #ffd166, #ff8a5b); transform-origin: bottom center;
  transition: transform 0.05s linear; box-shadow: 0 0 8px #ffd16666;
}
.power-head { margin-top: 2px; }
.power-track { position: relative; height: 16px; background: #1a1130; border: 1px solid #ffffff12; border-radius: 8px; overflow: hidden; margin-top: 5px; }
.power-fill { height: 100%; background: linear-gradient(90deg, #4ecdc4, #b39bff 55%, #ffd166); transition: width 0.05s linear; }
.power-ticks { position: absolute; inset: 0; display: flex; justify-content: space-evenly; pointer-events: none; }
.power-tick { width: 1px; height: 100%; background: #0b0718aa; }
.power-hint { font-size: 11px; color: #7d6fa6; margin-top: 5px; }

.launch-btn {
  width: 100%; padding: 13px 18px; font-size: 17px; font-weight: 800; border-radius: 11px;
  border: 1px solid #b39bff44; background: #b39bff0e; color: #b39bff; cursor: not-allowed;
  transition: all 0.18s ease;
}
.launch-btn.ready { border-color: #ffd166; background: linear-gradient(180deg, #ffd16622, #ffd16610); color: #ffe2a0; cursor: pointer; box-shadow: 0 0 26px #ffd16622; }
.launch-btn.ready:hover { transform: translateY(-1px); box-shadow: 0 0 34px #ffd16633; }
.launch-btn.ready:active { transform: translateY(0) scale(0.99); }
.launch-hint { font-size: 11px; color: #7d6fa6; text-align: center; margin: -2px 0 0; }

.players-box { background: #ffffff05; border: 1px solid #ffffff10; border-radius: 10px; padding: 10px 11px; }
.players-title { display: flex; justify-content: space-between; font-size: 12px; color: #b3a6d6; margin-bottom: 7px; }
.players-sub { color: #7d6fa6; }
.players-list { display: flex; flex-direction: column; gap: 3px; max-height: 260px; overflow-y: auto; }
.p-row { display: flex; align-items: center; gap: 7px; padding: 5px 7px; border-radius: 7px; font-size: 12.5px; color: #ddd; background: #ffffff04; border: 1px solid transparent; }
.p-row.me { background: #b39bff10; }
.p-row.turn { border-color: #ffd16666; background: #ffd1660d; }
.p-row.out { opacity: 0.45; }
.p-row.thrown { border-color: #4ecdc444; }
.p-seat { width: 15px; font-size: 10px; color: #7d6fa6; text-align: right; }
.p-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.p-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.p-name i { font-style: normal; color: #b39bff; font-size: 11px; }
.p-score { font-size: 12px; color: #b9c6e6; font-variant-numeric: tabular-nums; }
.p-score b { color: #e6c988; font-size: 13px; }
.p-score em { font-style: normal; color: #7d6fa6; font-size: 11px; }
.p-out { font-size: 10px; color: #ff6b6b; border: 1px solid #ff6b6b55; border-radius: 4px; padding: 0 4px; }
.p-check { color: #4ecdc4; font-size: 11px; }
.p-turn-dot { color: #ffd166; font-size: 10px; animation: ms-blink 1s infinite; }
@keyframes ms-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }

.round-log { margin-top: 16px; }
.round-log-title { font-size: 13px; color: #b39bff; font-weight: 700; margin-bottom: 8px; }
.round-log-scroll { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; }
.log-card { min-width: 200px; flex: 0 0 auto; background: #ffffff05; border: 1px solid #ffffff10; border-radius: 9px; padding: 9px 10px; }
.log-head { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: #ece7fb; font-weight: 700; margin-bottom: 6px; }
.log-out { color: #ff8a8a; font-weight: 500; }
.log-rows { display: flex; flex-direction: column; gap: 3px; }
.log-row { display: flex; align-items: center; gap: 6px; font-size: 11.5px; color: #c9c0e6; }
.log-row.out { color: #ff8a8a; opacity: 0.75; }
.lr-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.lr-name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lr-score { color: #e6c988; font-variant-numeric: tabular-nums; }
.lr-out { font-size: 10px; }

@media (max-width: 760px) {
  .marble-score { padding-bottom: 84px; }
  .ms-main { grid-template-columns: 1fr; }
  .ms-side { flex-direction: column; }
  .players-list { max-height: 200px; }
  .ms-header { gap: 8px; }
  .ms-timer { margin-left: 0; }
  .overlay-big { font-size: 16px; }
  .launch-btn {
    position: fixed;
    left: 12px;
    right: 12px;
    bottom: 12px;
    width: auto;
    z-index: 90;
    box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
  }
  .launch-btn:not(.ready) { background: #1b1130ee; backdrop-filter: blur(6px); }
  .launch-btn.ready { background: linear-gradient(180deg, #ffd16633, #ffd16618); backdrop-filter: blur(6px); }
  .launch-hint { display: none; }
}
</style>
