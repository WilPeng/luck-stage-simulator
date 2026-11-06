<template>
  <div class="minigame poison-drink">
    <div v-if="finished" class="game-finished">
      <div class="game-icon">🍷</div>
      <h2>毒酒游戏结束！</h2>
      <div class="winner-info">
        <span class="winner-name">{{ winner?.playerName || winnerNameFallback || '无胜者' }}</span>
        <span v-if="winner || winnerNameFallback" class="winner-label">获得本轮胜利！</span>
      </div>
      <div class="final-board">
        <div
          v-for="(p, i) in finalRanking"
          :key="p.playerId"
          class="final-row"
          :class="{ me: p.playerId === myId, top: i === 0 && p.alive }"
        >
          <span class="rank-no">{{ i + 1 }}</span>
          <span class="rank-name">{{ p.playerName }}</span>
          <span class="rank-hp">{{ '❤️'.repeat(Math.max(0, p.hp)) || '💀' }}</span>
          <span class="rank-status">{{ p.alive ? '存活' : '淘汰' }}</span>
        </div>
      </div>
    </div>

    <div v-else-if="!started" class="game-waiting">
      <div class="game-icon">🍷</div>
      <h2>毒酒</h2>
      <p>每位玩家初始 <strong>3 点生命</strong>。比赛开始前先按<strong>随机顺序自由选座</strong>，选定后座位固定；随后随机产生庄家。</p>
      <p>每轮根据存活人数生成同样数量的酒杯，其中随机 <strong>1 ~ N-1 杯有毒</strong>，只有庄家知道毒酒位置。</p>
      <p>庄家把酒杯分配给所有存活玩家；非庄家玩家从庄家下一位开始，按顺时针依次选择「不动 / 顺时针 1 格 / 顺时针 2 格」，选择结果即时公开并转动转盘。</p>
      <p>喝到毒酒生命 -1，生命归零淘汰；最后存活者获胜。</p>
      <div v-if="countdown > 0" class="countdown-big"><CountdownDisplay :value="countdown" /></div>
      <p v-else class="waiting-text">等待管理员开始比赛...</p>
    </div>

    <div v-else class="game-playing">
      <div class="game-header">
        <span v-if="phase !== 'seat'">第 {{ state.round }} 轮</span>
        <span v-else>比赛准备</span>
        <span v-if="phase !== 'seat'" class="dealer-tag">庄家：{{ dealerName }}</span>
        <span class="phase-tag" :class="phase">{{ phaseLabel }}</span>
        <span class="timer" :class="{ urgent: secondsLeft <= 5 }">⏱ {{ secondsLeft }}s</span>
      </div>

      <!-- 转盘 -->
      <div v-if="phase !== 'seat'" class="turntable-wrap">
        <div class="turntable">
          <div class="wheel-disc" :style="{ transform: `rotate(${wheelRotationDeg}deg)` }">
            <div
              v-for="(cup, i) in wheelCups"
              :key="i"
              class="wheel-arm"
              :style="{ transform: `rotate(${i * wheelStepDeg}deg)` }"
            >
              <div class="wheel-cup" :class="{ poison: poisonVisible && cup && cup.poison, empty: !cup }">
                <span v-if="cup">{{ cup.emoji }}</span>
                <span v-else>·</span>
              </div>
            </div>
          </div>
          <div class="wheel-hub">
            <div class="hub-label">转盘</div>
            <div class="hub-value">{{ state.currentRotation || 0 }} 格</div>
          </div>
          <div
            v-for="(p, i) in wheelSeats"
            :key="p.playerId"
            class="seat-marker"
            :class="{
              me: p.playerId === myId,
              dead: !p.alive,
              dealer: p.isDealer,
              turn: p.playerId === state.currentActorId
            }"
            :style="seatMarkerStyle(i)"
          >
            <div class="seat-name">{{ p.playerName }}<span v-if="p.isDealer" class="seat-crown">👑</span></div>
            <div class="seat-hp">{{ '❤️'.repeat(Math.max(0, p.hp)) || '💀' }}</div>
            <div v-if="cupAtSeat(i)" class="seat-cup" :class="{ poison: poisonVisible && cupAtSeat(i)?.poison }">
              <span>{{ cupAtSeat(i)?.emoji }}</span>
              <span class="seat-cup-name">{{ cupAtSeat(i)?.name }}</span>
              <span v-if="poisonVisible && cupAtSeat(i)?.poison" class="seat-poison">☠️</span>
            </div>
          </div>
        </div>
        <div v-if="state.phase === 'rotate'" class="turn-banner" :class="{ mine: state.my?.isMyTurn }">
          <template v-if="state.my?.isMyTurn">🎯 轮到你选择转盘操作</template>
          <template v-else-if="state.currentActorId">等待 {{ nameOf(state.currentActorId) }} 选择…</template>
          <template v-else>正在结算…</template>
        </div>
      </div>

      <div v-if="phase !== 'seat'" class="players-section">
        <button class="players-toggle" @click="showPlayers = !showPlayers">
          <span>玩家状态 · {{ alivePlayers.length }}/{{ (state.players || []).length }} 存活</span>
          <span class="toggle-arrow" :class="{ open: showPlayers }">▾</span>
        </button>
        <div v-show="showPlayers" class="players-board">
          <div
            v-for="p in state.players || []"
            :key="p.playerId"
            class="p-card"
            :class="{ me: p.playerId === myId, dead: !p.alive, dealer: p.isDealer, acting: p.playerId === state.currentActorId }"
          >
            <div class="p-top">
              <span class="p-name">{{ p.playerName }}</span>
              <span v-if="p.isDealer" class="crown" title="庄家">👑</span>
            </div>
            <div class="p-hp">{{ '❤️'.repeat(Math.max(0, p.hp)) || '💀' }}</div>
            <div v-if="p.cup" class="p-cup">
              <span class="cup-emoji">{{ p.cup.emoji }}</span>
              <span class="cup-name">{{ p.cup.name }}</span>
            </div>
            <div v-if="state.phase === 'rotate' && p.alive && !p.isDealer" class="p-rot" :class="{ acting: p.playerId === state.currentActorId }">
              {{ p.rotation != null ? `旋转 ${p.rotation} 格` : (p.playerId === state.currentActorId ? '轮到选择…' : '等待中') }}
            </div>
            <div v-if="!p.alive" class="p-dead">已淘汰</div>
          </div>
        </div>
      </div>

      <!-- 自由选座阶段 -->
      <div v-if="state.phase === 'seat'" class="phase-area seat-phase">
        <div class="section-title">自由选座 · 按随机顺序依次选择</div>
        <div class="seat-status" :class="{ mine: state.my?.canPickSeat }">
          <template v-if="state.my?.canPickSeat">🎯 轮到你选座，请点击一个空座位</template>
          <template v-else-if="state.currentSeatChooserId">等待 {{ nameOf(state.currentSeatChooserId) }} 选座…</template>
          <template v-else>选座结束，正在随机庄家…</template>
          <span class="seat-timer">⏱ {{ secondsLeft }}s</span>
        </div>
        <div class="seat-grid">
          <button
            v-for="s in state.seats || []"
            :key="s.seat"
            class="seat-slot"
            :class="{ taken: !!s.playerId, mine: s.isMe, selectable: state.my?.canPickSeat && !s.playerId }"
            :disabled="!state.my?.canPickSeat || !!s.playerId"
            @click="pickSeat(s.seat)"
          >
            <span class="seat-no">座位 {{ s.seat + 1 }}</span>
            <span v-if="s.playerName" class="seat-occupant">{{ s.playerName }}</span>
            <span v-else class="seat-empty">空位</span>
          </button>
        </div>
        <div class="seat-order">
          <span class="seat-order-label">选座顺序：</span>
          <span
            v-for="(n, i) in state.seatPickOrderNames || []"
            :key="i"
            class="seat-order-item"
            :class="{ current: i === state.seatPickIndex, done: i < state.seatPickIndex }"
          >{{ n }}</span>
        </div>
        <div class="turn-rule">超时未选择将自动随机安排一个空座位，然后轮到下一位</div>
      </div>

      <!-- 分配阶段 -->
      <div v-if="state.phase === 'assign'" class="phase-area">
        <template v-if="state.my?.canAssign">
          <div class="section-title">你是庄家：分配酒杯（☠️ 为毒酒，仅你可见）</div>
          <div class="cup-pool">
            <div v-for="c in state.dealerCups || []" :key="c.id" class="cup-chip" :class="{ poison: c.poison }">
              <span class="cup-emoji">{{ c.emoji }}</span>
              <span class="cup-name">{{ c.name }}</span>
              <span v-if="c.poison" class="poison-mark">☠️</span>
            </div>
          </div>
          <div class="assign-list">
            <div v-for="p in alivePlayers" :key="p.playerId" class="assign-row">
              <span class="assign-name">{{ p.playerName }}</span>
              <select v-model="assignDraft[p.playerId]" class="bb-select">
                <option value="">选择酒杯</option>
                <option
                  v-for="c in state.dealerCups || []"
                  :key="c.id"
                  :value="c.id"
                  :disabled="cupUsedByOther(p.playerId, c.id)"
                >{{ c.emoji }} {{ c.name }}{{ c.poison ? ' ☠️' : '' }}</option>
              </select>
            </div>
          </div>
          <div class="assign-actions">
            <button class="bb-btn" @click="randomAssign">随机分配</button>
            <button class="bb-btn bb-btn-primary" :disabled="!allAssigned" @click="confirmAssign">确认分配</button>
          </div>
          <div class="turn-rule">超时未确认将由系统随机分配酒杯</div>
        </template>
        <template v-else>
          <div class="waiting-msg">庄家正在分配酒杯，请稍候…（庄家超时将随机分配）</div>
          <div class="cup-pool">
            <div v-for="c in state.cups || []" :key="c.id" class="cup-chip">
              <span class="cup-emoji">{{ c.emoji }}</span>
              <span class="cup-name">{{ c.name }}</span>
            </div>
          </div>
        </template>
      </div>

      <!-- 转盘阶段：按顺时针依次选择，结果即时公开 -->
      <div v-else-if="state.phase === 'rotate'" class="phase-area">
        <template v-if="state.my?.canRotate">
          <div class="section-title">轮到你选择（选择后立即公开并转动转盘）</div>
          <div v-if="state.my.myCup" class="my-cup">
            你的酒杯：<span class="cup-emoji">{{ state.my.myCup.emoji }}</span>
            <strong>{{ state.my.myCup.name }}</strong>
          </div>
          <div class="rotate-buttons">
            <button class="rotate-btn" @click="chooseRotation(0)">不动<small>0 格</small></button>
            <button class="rotate-btn" @click="chooseRotation(1)">顺时针<small>1 格</small></button>
            <button class="rotate-btn" @click="chooseRotation(2)">顺时针<small>2 格</small></button>
          </div>
        </template>
        <template v-else-if="state.my?.isDealer">
          <div class="waiting-msg">你是庄家，本轮不参与转盘操作；当前轮到 {{ nameOf(state.currentActorId) }} 选择…</div>
        </template>
        <template v-else-if="state.my && !state.my.alive">
          <div class="waiting-msg">你已被淘汰，观战中…</div>
        </template>
        <template v-else-if="state.my?.rotationChosen">
          <div class="waiting-msg">你已选择旋转 {{ state.my.myRotation }} 格，等待下一位…</div>
        </template>
        <template v-else>
          <div class="waiting-msg">当前轮到 {{ nameOf(state.currentActorId) }} 选择…</div>
        </template>
        <div class="submit-count">{{ chosenCount }} / {{ rotatorCount }} 人已选择</div>
        <div class="turn-rule">超时未选择将自动「不动」，并把选择权交给下一位</div>
        <div v-if="rotationHistory.length" class="rotation-history">
          <div class="history-title">已公开的选择</div>
          <div class="history-list">
            <span v-for="(h, i) in rotationHistory" :key="i" class="history-item" :class="{ auto: h.auto }">
              <b>{{ i + 1 }}. {{ h.playerName }}</b> +{{ h.rotation }} 格 → 转盘 {{ h.cumulativeRotation }} 格
              <em v-if="h.auto">（超时自动不动）</em>
            </span>
          </div>
        </div>
      </div>

      <!-- 结算阶段 -->
      <div v-else-if="state.phase === 'reveal' && state.lastResult" class="phase-area">
        <div class="section-title">第 {{ state.lastResult.round }} 轮结算 · 转盘累计 {{ state.lastResult.totalRotation }} 格</div>
        <div class="reveal-list">
          <div
            v-for="r in state.lastResult.rows"
            :key="r.playerId"
            class="reveal-row"
            :class="{ me: r.playerId === myId, poison: r.poison, out: r.eliminated }"
          >
            <span class="rr-name">{{ r.playerName }}</span>
            <span class="rr-cup">{{ r.emoji }} {{ r.drinkName }}</span>
            <span class="rr-tag" :class="r.poison ? 'bad' : 'good'">{{ r.poison ? '☠️ 毒酒' : '✅ 安全' }}</span>
            <span class="rr-hp">{{ r.hpBefore }} → {{ r.hpAfter }}</span>
            <span v-if="r.rotation != null" class="rr-rot">旋转 {{ r.rotation }} 格</span>
            <span v-if="r.eliminated" class="rr-out">出局</span>
          </div>
        </div>
        <div class="next-hint">下一轮 {{ secondsLeft }} 秒后开始…</div>
      </div>

      <div v-if="errorMsg" class="error-msg">{{ errorMsg }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMinigameSocket } from '../../../composables/useMinigameSocket'
import { useBbAuthStore } from '../../../stores/bbAuthStore'

const props = defineProps<{ roomId: string; participants: { playerId: string; playerName: string }[]; gameTitle?: string }>()
const emit = defineEmits<{ (e: 'finished', winner: { playerId: string; playerName: string }): void }>()

const authStore = useBbAuthStore()
const myId = computed(() => authStore.currentUser?.id || '')

const roomIdRef = ref(props.roomId)
const { gameState, countdown, winner, finished, connect, sendAction, disconnect } = useMinigameSocket(roomIdRef)

const state = computed<any>(() => gameState.value || {})
const started = computed(() => !!state.value.started)
const showPlayers = ref(false)
const phase = computed(() => state.value.phase || 'assign')
const secondsLeft = computed(() => state.value.secondsLeft || 0)
const dealerName = computed(() => state.value.dealerName || '—')

const phaseLabel = computed(() => ({
  seat: '自由选座',
  assign: '庄家分配酒杯',
  rotate: '转盘操作',
  reveal: '结算中',
  finished: '已结束'
} as Record<string, string>)[phase.value] || phase.value)

const alivePlayers = computed<any[]>(() => (state.value.players || []).filter((p: any) => p.alive))
const chosenCount = computed(() => {
  const list = (state.value.players || []).filter((p: any) => p.alive && !p.isDealer && p.rotation != null)
  return list.length
})
const rotatorCount = computed(() => (state.value.players || []).filter((p: any) => p.alive && !p.isDealer).length)

const winnerNameFallback = computed(() => {
  const wid = state.value.winnerId
  if (!wid) return ''
  const p = (state.value.players || []).find((x: any) => x.playerId === wid)
  return p ? p.playerName : ''
})

const finalRanking = computed(() => {
  return [...(state.value.players || [])]
    .sort((a: any, b: any) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1
      return (b.hp || 0) - (a.hp || 0)
    })
})

// ===== 分配草稿 =====
const assignDraft = reactive<Record<string, string>>({})
const errorMsg = ref('')
let errorTimer: ReturnType<typeof setTimeout> | null = null

function showError(text: string) {
  errorMsg.value = text
  if (errorTimer) clearTimeout(errorTimer)
  errorTimer = setTimeout(() => { errorMsg.value = '' }, 3000)
}

watch(() => state.value.round, () => {
  for (const k of Object.keys(assignDraft)) delete assignDraft[k]
}, { immediate: true })

watch(alivePlayers, (list) => {
  if (!state.value.my?.canAssign) return
  for (const p of list) {
    if (!(p.playerId in assignDraft)) assignDraft[p.playerId] = ''
  }
  for (const k of Object.keys(assignDraft)) {
    if (!list.some((p: any) => p.playerId === k)) delete assignDraft[k]
  }
}, { immediate: true })

function cupUsedByOther(playerId: string, cupId: string): boolean {
  return Object.entries(assignDraft).some(([pid, cid]) => pid !== playerId && cid === cupId)
}

const allAssigned = computed(() => {
  const cups = state.value.dealerCups || []
  const ids = alivePlayers.value.map((p: any) => assignDraft[p.playerId]).filter(Boolean)
  if (alivePlayers.value.length !== cups.length) return false
  return ids.length === cups.length && new Set(ids).size === cups.length
})

// ===== 转盘展示 =====
const revealActive = computed(() => phase.value === 'reveal' || !!state.value.finished)
const poisonVisible = computed(() => !!state.value.my?.isDealer || revealActive.value)
const wheelSeats = computed<any[]>(() => alivePlayers.value)
const wheelStepDeg = computed(() => wheelSeats.value.length ? 360 / wheelSeats.value.length : 0)
// 视觉旋转使用未取模的累计格数，避免转满一圈时 CSS 反向回转
const wheelRotationDeg = computed(() => {
  if (phase.value === 'assign') return 0
  const raw = (state.value.rotationHistory || []).reduce((sum: number, h: any) => sum + (Number(h.rotation) || 0), 0)
  return raw * wheelStepDeg.value
})
const cupMap = computed(() => new Map((state.value.cups || []).map((c: any) => [c.id, c])))

const wheelCups = computed(() => {
  const seats = wheelSeats.value
  if (phase.value === 'assign') {
    const hasDraft = seats.some((p: any) => !!assignDraft[p.playerId])
    if (hasDraft) {
      return seats.map((p: any) => {
        const draft = assignDraft[p.playerId]
        return draft ? (cupMap.value.get(draft) || null) : null
      })
    }
    return seats.map((_: any, i: number) => (state.value.cups || [])[i] || null)
  }
  return seats.map((p: any) => {
    const cid = state.value.assignments?.[p.playerId]
    return cid ? (cupMap.value.get(cid) || null) : null
  })
})

// 当前累计旋转后，第 i 个座位上的酒杯
function cupAtSeat(i: number) {
  const seats = wheelSeats.value
  const n = seats.length
  if (!n) return null
  const rotation = phase.value === 'assign' ? 0 : (state.value.currentRotation || 0)
  const sourceIndex = ((i - rotation) % n + n) % n
  const pid = seats[sourceIndex]?.playerId
  const cid = pid ? state.value.assignments?.[pid] : null
  return cid ? (cupMap.value.get(cid) || null) : null
}

function seatMarkerStyle(i: number) {
  const n = wheelSeats.value.length
  const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2
  const radius = 41
  return {
    left: `${50 + radius * Math.cos(angle)}%`,
    top: `${50 + radius * Math.sin(angle)}%`
  }
}

const rotationHistory = computed<any[]>(() => state.value.rotationHistory || [])

function nameOf(pid: string | null | undefined) {
  if (!pid) return '—'
  const p = (state.value.players || []).find((x: any) => x.playerId === pid)
  return p ? p.playerName : pid
}

function randomAssign() {
  const cups = [...(state.value.dealerCups || [])]
  for (let i = cups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cups[i], cups[j]] = [cups[j], cups[i]]
  }
  alivePlayers.value.forEach((p: any, i: number) => {
    assignDraft[p.playerId] = cups[i] ? cups[i].id : ''
  })
}

function confirmAssign() {
  if (!allAssigned.value) return
  const assignments: Record<string, string> = {}
  for (const p of alivePlayers.value) assignments[p.playerId] = assignDraft[p.playerId]
  sendAction({ type: 'assign', assignments })
}

function chooseRotation(rotation: number) {
  sendAction({ type: 'rotate', rotation })
}

function pickSeat(seat: number) {
  if (!state.value.my?.canPickSeat) return
  sendAction({ type: 'pick_seat', seat })
}

watch(() => state.value.actionResult, (r: any) => {
  if (!r) return
  if (r.error) showError(r.error)
})

watch(finished, (val) => {
  if (val && winner.value) emit('finished', winner.value)
})

onMounted(() => { connect() })
onUnmounted(() => {
  if (errorTimer) clearTimeout(errorTimer)
  disconnect()
})
</script>

<style scoped>
.poison-drink { max-width: 760px; margin: 0 auto; padding: 20px; }
.game-waiting, .game-finished { text-align: center; padding: 40px 20px; }
.game-icon { font-size: 64px; margin-bottom: 16px; }
h2 { color: #ece7fb; margin: 0 0 8px; }
p { color: #8f83b8; font-size: 14px; line-height: 1.7; margin: 4px 0; }
p strong { color: #b39bff; }
.countdown-big { font-size: 72px; font-weight: 700; color: #b39bff; margin: 20px 0; animation: pulse 0.5s infinite; }
@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }
.waiting-text { color: #6b5f92; margin-top: 12px; }
.game-header { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; color: #a99bd0; font-size: 14px; margin-bottom: 14px; }
.dealer-tag { color: #e6c988; }
.phase-tag { padding: 2px 10px; border-radius: 999px; font-size: 12px; background: #b39bff1a; color: #b39bff; }
.phase-tag.seat { background: #e6c9881a; color: #e6c988; }
.phase-tag.rotate { background: #00c8ff1a; color: #7fd8ff; }
.phase-tag.reveal { background: #e6c9881a; color: #e6c988; }
.timer { margin-left: auto; font-weight: 700; }
.timer.urgent { color: #ff4444; }
.turntable-wrap { margin: 0 auto 18px; max-width: 560px; }
.turntable { position: relative; width: 100%; max-width: 520px; aspect-ratio: 1; margin: 0 auto; }
.wheel-disc {
  position: absolute; inset: 16%; border-radius: 50%;
  border: 3px solid #b39bff55;
  background:
    repeating-conic-gradient(from 0deg, #241640 0deg 12deg, #1a1030 12deg 24deg),
    radial-gradient(circle at 50% 45%, #2b1b50, #10081f);
  box-shadow: inset 0 0 46px #00000099, 0 0 32px #b39bff22;
  transition: transform 0.65s cubic-bezier(0.22, 0.85, 0.25, 1);
  z-index: 1;
}
.wheel-arm { position: absolute; inset: 0; }
.wheel-cup {
  position: absolute; left: 50%; top: 3%; transform: translateX(-50%);
  width: 42px; height: 42px; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 22px; background: #24163f; border: 1px solid #b39bff66;
  box-shadow: 0 2px 10px #00000088;
}
.wheel-cup.poison { border-color: #ff4444; background: #3a1620; box-shadow: 0 0 16px #ff444488; }
.wheel-cup.empty { opacity: 0.22; }
.wheel-hub {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: 26%; aspect-ratio: 1; border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #3a2568, #140b26);
  border: 2px solid #b39bff66;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  z-index: 2; box-shadow: 0 0 26px #b39bff33;
}
.hub-label { font-size: 11px; color: #a99bd0; }
.hub-value { font-size: 18px; font-weight: 800; color: #e6c988; }
.seat-marker {
  position: absolute; transform: translate(-50%, -50%);
  width: 92px; padding: 4px 6px; border-radius: 9px;
  background: #1b1130ee; border: 1px solid #ffffff18;
  text-align: center; z-index: 3;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.seat-marker.me { border-color: #b39bff88; }
.seat-marker.dealer { border-color: #e6c98877; }
.seat-marker.turn { border-color: #00c8ff; box-shadow: 0 0 0 2px #00c8ff44, 0 0 18px #00c8ff55; }
.seat-marker.dead { opacity: 0.4; }
.seat-name { font-size: 11px; color: #ece7fb; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.seat-crown { margin-left: 2px; }
.seat-hp { font-size: 10px; letter-spacing: -1px; }
.seat-cup { display: flex; align-items: center; justify-content: center; gap: 3px; margin-top: 2px; font-size: 11px; color: #e0d7ff; background: #ffffff08; border-radius: 5px; padding: 1px 3px; }
.seat-cup-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 58px; }
.seat-cup.poison { color: #ff8f8f; background: #ff44441a; }
.seat-poison { font-size: 10px; }
.turn-banner { margin: 10px auto 0; text-align: center; font-size: 13px; color: #b3a6d6; background: #ffffff08; border: 1px solid #ffffff12; border-radius: 8px; padding: 7px 10px; }
.turn-banner.mine { color: #00c8ff; border-color: #00c8ff55; background: #00c8ff14; font-weight: 700; }
.players-section { margin-bottom: 14px; }
.players-toggle {
  width: 100%; display: flex; align-items: center; justify-content: space-between;
  padding: 9px 14px; border-radius: 9px; cursor: pointer;
  background: #1b1130; border: 1px solid #ffffff14; color: #b3a6d6; font-size: 13px;
}
.players-toggle:hover { border-color: #b39bff44; color: #e0d7ff; }
.toggle-arrow { transition: transform 0.2s; color: #8f83b8; }
.toggle-arrow.open { transform: rotate(180deg); }
.players-board { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; margin-top: 10px; margin-bottom: 4px; }
.p-card { position: relative; background: #1b1130; border: 1px solid #ffffff14; border-radius: 10px; padding: 10px 12px; color: #ddd; }
.p-card.me { border-color: #b39bff88; box-shadow: 0 0 0 1px #b39bff33; }
.p-card.dead { opacity: 0.45; }
.p-card.dealer { border-color: #e6c98866; }
.p-card.acting { border-color: #00c8ff; box-shadow: 0 0 0 1px #00c8ff55, 0 0 16px #00c8ff33; }
.p-top { display: flex; align-items: center; gap: 6px; }
.p-name { flex: 1; font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.crown { font-size: 14px; }
.p-hp { margin: 6px 0; font-size: 13px; letter-spacing: 1px; }
.p-cup { display: flex; align-items: center; gap: 6px; background: #ffffff08; border-radius: 6px; padding: 4px 8px; }
.cup-emoji { font-size: 18px; }
.cup-name { font-size: 12px; color: #e0d7ff; }
.p-rot { margin-top: 6px; font-size: 12px; color: #7fd8ff; }
.p-rot.acting { color: #00c8ff; font-weight: 700; }
.p-dead { margin-top: 6px; font-size: 12px; color: #ff6b6b; }
.rotation-history { margin-top: 12px; border-top: 1px dashed #ffffff14; padding-top: 10px; }
.history-title { font-size: 12px; color: #8f83b8; margin-bottom: 6px; }
.history-list { display: flex; flex-wrap: wrap; gap: 6px; }
.history-item { font-size: 12px; color: #cfc4ea; background: #ffffff08; border: 1px solid #ffffff12; border-radius: 999px; padding: 3px 9px; }
.history-item b { color: #e6c988; font-weight: 600; }
.history-item.auto { border-color: #e6c98844; color: #e6c988; }
.history-item em { font-style: normal; font-size: 11px; opacity: 0.8; margin-left: 4px; }
.turn-rule { text-align: center; font-size: 11px; color: #8f83b8; margin: -2px 0 8px; }
.phase-area { background: #17112a; border: 1px solid #b39bff22; border-radius: 12px; padding: 16px; }
.section-title { font-size: 14px; font-weight: 600; color: #e6c988; margin-bottom: 12px; }
.seat-status {
  display: flex; align-items: center; justify-content: space-between; gap: 10px;
  padding: 9px 12px; margin-bottom: 12px; border-radius: 8px;
  background: #ffffff08; border: 1px solid #ffffff14; color: #b3a6d6; font-size: 13px;
}
.seat-status.mine { color: #00c8ff; border-color: #00c8ff55; background: #00c8ff14; font-weight: 700; }
.seat-timer { color: #e6c988; font-weight: 700; font-size: 12px; }
.seat-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 10px; margin-bottom: 14px; }
.seat-slot {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  min-height: 72px; padding: 10px 8px; border-radius: 10px; cursor: not-allowed;
  background: #0f0a1c; border: 1px solid #ffffff14; color: #8f83b8;
}
.seat-slot.selectable { cursor: pointer; border-color: #b39bff66; background: #b39bff10; color: #e0d7ff; }
.seat-slot.selectable:hover { border-color: #b39bff; background: #b39bff22; }
.seat-slot.taken { background: #ffffff06; color: #cfc4ea; }
.seat-slot.mine { border-color: #00c8ff77; box-shadow: 0 0 0 1px #00c8ff33; }
.seat-no { font-size: 11px; color: #8f83b8; }
.seat-occupant { font-size: 14px; font-weight: 700; color: #e0d7ff; }
.seat-slot.mine .seat-occupant { color: #7fd8ff; }
.seat-empty { font-size: 12px; color: #6b5f92; }
.seat-order { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 8px; }
.seat-order-label { font-size: 12px; color: #8f83b8; }
.seat-order-item { font-size: 12px; color: #cfc4ea; background: #ffffff08; border: 1px solid #ffffff12; border-radius: 999px; padding: 2px 9px; }
.seat-order-item.done { opacity: 0.5; text-decoration: line-through; }
.seat-order-item.current { color: #00c8ff; border-color: #00c8ff66; background: #00c8ff14; font-weight: 700; }
.cup-pool { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.cup-chip { display: inline-flex; align-items: center; gap: 6px; padding: 6px 10px; background: #ffffff08; border: 1px solid #ffffff14; border-radius: 8px; font-size: 12px; color: #e0d7ff; }
.cup-chip.poison { border-color: #ff444466; background: #ff444414; }
.poison-mark { color: #ff6b6b; }
.assign-list { display: flex; flex-direction: column; gap: 8px; }
.assign-row { display: flex; align-items: center; gap: 10px; }
.assign-name { width: 120px; font-size: 14px; color: #e0d7ff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bb-select { flex: 1; padding: 8px 12px; background: #0f0a1c; border: 1px solid #b39bff44; border-radius: 6px; color: #ece7fb; font-size: 13px; outline: none; }
.assign-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 14px; }
.bb-btn { background: transparent; border: 1px solid #b39bff44; color: #b39bff; padding: 8px 18px; border-radius: 6px; cursor: pointer; font-size: 14px; }
.bb-btn:hover { background: #b39bff22; }
.bb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bb-btn-primary { background: #b39bff22; border-color: #b39bff; }
.my-cup { font-size: 15px; color: #e0d7ff; margin-bottom: 14px; }
.rotate-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.rotate-btn { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 18px 10px; border: 2px solid #ffffff1c; border-radius: 12px; background: linear-gradient(160deg, #2e1e52, #1a1233); color: #e2d9ff; font-size: 16px; font-weight: 700; cursor: pointer; }
.rotate-btn:hover { border-color: #b39bff; color: #b39bff; }
.rotate-btn small { font-size: 12px; font-weight: 400; color: #a99bd0; }
.submit-count, .waiting-msg { text-align: center; color: #b3a6d6; font-size: 14px; padding: 10px 0; }
.reveal-list { display: flex; flex-direction: column; gap: 8px; }
.reveal-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 10px 12px; background: #ffffff06; border: 1px solid #ffffff12; border-radius: 8px; font-size: 13px; color: #ddd; }
.reveal-row.me { border-color: #b39bff66; }
.reveal-row.poison { border-color: #ff444466; background: #ff444410; }
.reveal-row.out { opacity: 0.65; }
.rr-name { font-weight: 600; min-width: 70px; }
.rr-cup { color: #e0d7ff; }
.rr-tag { padding: 1px 8px; border-radius: 999px; font-size: 12px; }
.rr-tag.bad { color: #ff6b6b; background: #ff44441a; }
.rr-tag.good { color: #7ee0a0; background: #7ee0a01a; }
.rr-hp { color: #e6c988; }
.rr-rot { color: #7fd8ff; font-size: 12px; }
.rr-out { color: #ff6b6b; margin-left: auto; }
.next-hint { text-align: center; color: #6b5f92; font-size: 12px; margin-top: 12px; }
.error-msg { margin-top: 12px; text-align: center; color: #ff6b6b; background: #ff444414; border: 1px solid #ff444433; border-radius: 8px; padding: 8px; font-size: 13px; }
.winner-name { font-size: 26px; font-weight: 700; color: #e6c988; }
.winner-label { display: block; font-size: 14px; color: #e6c988; margin-top: 4px; }
.final-board { max-width: 420px; margin: 24px auto 0; display: flex; flex-direction: column; gap: 6px; }
.final-row { display: flex; align-items: center; gap: 12px; padding: 8px 14px; border-radius: 10px; background: #ffffff08; border: 1px solid #ffffff10; color: #cfc4ea; font-size: 14px; }
.final-row.me { border-color: #b39bff55; }
.final-row.top { border-color: #e6c98866; background: #e6c98810; color: #e6c988; }
.rank-no { width: 20px; color: #7d6fa6; }
.final-row.top .rank-no { color: #e6c988; }
.rank-name { flex: 1; text-align: left; }
.rank-hp { font-size: 12px; letter-spacing: 1px; }
.rank-status { font-size: 12px; color: #8f83b8; width: 36px; text-align: right; }
@media (max-width: 560px) {
  .seat-marker { width: 74px; padding: 3px 4px; }
  .seat-name { font-size: 10px; }
  .seat-cup-name { max-width: 42px; }
  .wheel-cup { width: 34px; height: 34px; font-size: 18px; }
  .hub-value { font-size: 14px; }
  .hub-label { font-size: 9px; }
}
@media (max-width: 480px) {
  .poison-drink { padding: 12px; }
  .rotate-buttons { grid-template-columns: 1fr; }
  .assign-row { flex-direction: column; align-items: stretch; }
  .assign-name { width: auto; }
}
</style>
